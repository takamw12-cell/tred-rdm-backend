import type { RouterClient } from "@orpc/server";
import { createAgentUIStreamResponse, generateText, generateObject } from "ai";
import { stream } from "hono/streaming";
import { gateway } from "./agent/gateway";
import { createApp } from "./__core/app";
import { ping } from "./routes/ping";
import { documents } from "./routes/documents";
import { savedExercises } from "./routes/saved-exercises";
import { semesters } from "./routes/semesters";
import { chats } from "./routes/chats";
import { langOf } from "./lib/languages";
import { memory } from "./routes/memory";
import { openGaps, noteGap, resolveGap } from "./lib/memory";
import { search } from "./routes/search";
import { subscriptions } from "./routes/subscriptions";
import { notifications } from "./routes/notifications";
import { credits } from "./routes/credits";
import { account } from "./routes/account";
import { auth } from "./auth";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import { db } from "./database";
import { document, savedExercise, semester, userAccess } from "./database/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { buildTutorAgent } from "./agent";
import {
  extractDocument,
  fileExtension,
  isSupported,
  storageMime,
  UnsupportedFormatError,
} from "./lib/extract";
import { renderTikz } from "./lib/tikz";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3, S3_BUCKET } from "./lib/s3";
import { selectRelevantContext } from "./lib/retrieval";
import { searchYoutube } from "./lib/youtube";
import {
  getAccess,
  setActive,
  listUsers,
  listCodes,
  createCode,
  setCodeDisabled,
  checkCode,
  consumeCode,
  tagInvite,
  publicSignupAllowed,
} from "./lib/access";
import {
  addOutputTokens,
  canAddDocument,
  consume,
  quotaError,
  tokenCapError,
  withinTokenCap,
} from "./lib/plan";
import { notifyExerciseReady } from "./lib/push";
import { applySubscription, endSubscription } from "./lib/billing";
import { grantCredits } from "./lib/credits";
import {
  getCachedTranslation,
  putCachedTranslation,
} from "./lib/translation-cache";
import { getStripe } from "./lib/stripe";
import type Stripe from "stripe";

// API features are oRPC procedures, one file per feature in ./routes/,
// composed into this router — typed end-to-end via the clients
// (web: src/web/lib/api.ts, mobile: lib/api.ts).
export const router = {
  ping,
  documents,
  savedExercises,
  semesters,
  chats,
  memory,
  search,
  subscriptions,
  notifications,
  credits,
  account,
};

export type AppRouter = typeof router;
/** Typed client for the router — used by the web and mobile api clients. */
export type AppRouterClient = RouterClient<AppRouter>;

const app = createApp(router);

// ── Limitation de débit ───────────────────────────────────────────────────
// Montée AVANT tout le reste : une requête refusée ne doit toucher ni la
// session, ni le quota, ni le modèle.
//
// Trois règles, parce que trois menaces différentes :
//
//   • /api/auth/*  — bourrage d'identifiants et création de comptes en masse.
//     Compté par IP : à ce stade il n'y a pas encore de cookie de session.
//
//   • /api/agent/* — TOUTES les routes du modèle, pas seulement /messages.
//     exercise, formulas, video et translate coûtent autant, parfois plus.
//     C'est ici que part l'argent.
//
//   • /api/documents/upload — l'extraction de texte d'un PDF de 200 pages
//     occupe le serveur bien plus longtemps qu'une requête ordinaire.
//     Fenêtre de cinq minutes : on téléverse par rafales, pas en continu.
//
// /api/health, le webhook Stripe et /api/rpc/* ne sont volontairement pas
// limités : le premier sert aux sondes Railway, le deuxième vient de Stripe
// et doit toujours passer, le troisième est déjà borné par les quotas.
app.use("/api/auth/*", rateLimitMiddleware({ limit: 10, scope: "auth" }));
app.use("/api/agent/*", rateLimitMiddleware({ limit: 5, scope: "agent" }));
app.use(
  "/api/documents/upload",
  rateLimitMiddleware({ limit: 10, scope: "upload", windowMs: 5 * 60_000 }),
);

// Better Auth handler (Hono v4 uses single `*` wildcard).
// ── Sperre: greift vor jeder API-Anfrage ──────────────────────────────────
// Absichtlich hier und nicht in jeder einzelnen Route: eine vergessene Route
// wäre ein offenes Tor. /api/auth/* bleibt frei, damit ein gesperrtes Konto
// sich noch abmelden kann; /api/health bleibt frei für Railway.
app.use("/api/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  // Der Stripe-Webhook ist bewusst frei: er kommt von Stripe, nicht von einem
  // angemeldeten Browser. Eine Sitzungsabfrage wäre hier sinnlos und würde bei
  // einer Störung der Auth-Datenbank Zahlungsereignisse verschlucken.
  if (
    path.startsWith("/api/auth/") ||
    path === "/api/health" ||
    path === "/api/subscriptions/webhook"
  )
    return next();

  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return next(); // Einzelne Routen entscheiden selbst über 401.

  const access = await getAccess(session.user.id, session.user.email);
  if (!access.isActive) {
    // Sitzungen sind beim Sperren bereits gelöscht worden; falls doch noch
    // eine lebt, hier nachziehen, damit das Frontend sofort abmeldet.
    return c.json({ error: "ACCOUNT_DISABLED" }, 403);
  }
  return next();
});

// ── Registrierung: nur mit gültigem Einladungscode ────────────────────────
// Der Code reist im Rumpf der Better-Auth-Anfrage mit. Geprüft wird davor,
// verbraucht erst danach — nur eine tatsächlich angelegte Anmeldung soll
// einen Code aufbrauchen.
app.use("/api/auth/sign-up/*", async (c, next) => {
  let body: { inviteCode?: string; email?: string } = {};
  try {
    body = (await c.req.raw.clone().json()) as typeof body;
  } catch {
    /* kein JSON-Rumpf: unten als fehlender Code behandelt */
  }

  const raw = String(body.inviteCode ?? "");

  if (!publicSignupAllowed()) {
    if (!raw) return c.json({ error: "INVITE_REQUIRED" }, 403);
    const check = await checkCode(raw);
    if (!check.ok) return c.json({ error: "INVITE_INVALID", reason: check.reason }, 403);
  }

  await next();

  // Nur bei erfolgreicher Registrierung verbrauchen.
  if (raw && c.res.status >= 200 && c.res.status < 300) {
    await consumeCode(raw);
    try {
      const s = await auth.api.getSession({ headers: c.req.raw.headers });
      if (s) await tagInvite(s.user.id, raw);
    } catch {
      /* Zuordnung ist nur Protokoll, kein Grund die Anmeldung scheitern zu lassen */
    }
  }
});

app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// ── Stripe-Webhook ────────────────────────────────────────────────────────
// Absichtlich eine schlichte Hono-Route und keine oRPC-Prozedur: die
// Signaturprüfung braucht den UNVERÄNDERTEN Rohkörper (c.req.text()). Sobald
// ein Handler den Körper als JSON parst, schlägt sie dauerhaft fehl.
//
// Antwortregel: kommt der Aufruf nachweislich von Stripe, antworten wir 200 —
// auch wenn unsere Verarbeitung scheitert. Ein 500 würde Stripe zu stunden-
// langen Wiederholungen desselben fehlerhaften Ereignisses veranlassen. Der
// Fehler steht im Log, das Ereignis lässt sich im Dashboard erneut senden.
app.post("/api/subscriptions/webhook", async (c) => {
  const signature = c.req.header("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !secret) {
    console.error("[stripe] webhook: missing signature or STRIPE_WEBHOOK_SECRET");
    return c.json({ received: false }, 400);
  }

  const rawBody = await c.req.text();

  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(rawBody, signature, secret);
  } catch (err) {
    console.error("[stripe] webhook: invalid signature", err);
    return c.json({ received: false }, 400);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // ── Einmalzahlung: Credit-Paket ─────────────────────────────────
        // Die Gutschrift ist idempotent über die Session-ID als Primär-
        // schlüssel des Journals: stellt Stripe denselben Webhook zweimal zu,
        // prallt der zweite Einfügeversuch ab und das Guthaben bleibt korrekt.
        if (session.mode === "payment") {
          const userId = session.metadata?.userId ?? session.client_reference_id ?? null;
          let amount = Number(session.metadata?.credits ?? 0);

          // Bei einem Payment Link steht die Anzahl NICHT an der Session — die
          // Metadaten hängen dann am Preis. Ohne diesen Rückfall bliebe eine
          // über einen Link bezahlte Aufladung ohne Gutschrift: Geld kassiert,
          // nichts geliefert.
          if (!Number.isFinite(amount) || amount <= 0) {
            try {
              const items = await getStripe().checkout.sessions.listLineItems(session.id, {
                expand: ["data.price"],
                limit: 10,
              });
              amount = items.data.reduce((sum, item) => {
                const perUnit = Number(item.price?.metadata?.credits ?? 0);
                return sum + (Number.isFinite(perUnit) ? perUnit * (item.quantity ?? 1) : 0);
              }, 0);
            } catch (err) {
              console.error("[credits] line items unreadable", session.id, err);
            }
          }

          if (!userId || !Number.isFinite(amount) || amount <= 0) {
            console.error(
              "[credits] payment without usable metadata",
              session.id,
              session.metadata,
            );
            break;
          }

          await grantCredits({
            userId,
            amount,
            transactionId: session.id,
            description: session.metadata?.packName ?? `${amount} Credits`,
            type: "purchase",
          });
          break;
        }

        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : (session.subscription?.id ?? null);

        if (!subscriptionId) break; // Weder Abo noch Credit-Kauf.

        // Die Checkout-Session trägt die Laufzeit nicht; dafür das Abo selbst.
        const subscription = await getStripe().subscriptions.retrieve(subscriptionId);

        const userId = session.metadata?.userId ?? session.client_reference_id ?? null;
        if (userId && !subscription.metadata?.userId) {
          subscription.metadata = { ...subscription.metadata, userId };
        }

        await applySubscription(subscription);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
        await applySubscription(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await endSubscription(event.data.object as Stripe.Subscription);
        break;

      default:
        break;
    }
  } catch (err) {
    console.error(`[stripe] webhook: handling ${event.type} failed`, err);
    return c.json({ received: true, handled: false }, 200);
  }

  return c.json({ received: true, handled: true }, 200);
});

// ── Öffentliche Konfiguration ─────────────────────────────────────────────
// Das Frontend fragt hier, ob es das Registrierungsformular überhaupt zeigt.
// ── Rapports d'erreur du navigateur ───────────────────────────────────────
// Volontairement PUBLIQUE et sans base de données : ce qui compte, c'est que
// l'erreur apparaisse dans les journaux Railway. Une table demanderait une
// migration, une purge et une page d'administration — pour une information
// que tu vas lire trois fois par semaine.
//
// Réponse 204 dans TOUS les cas : un rapport d'erreur qui échoue et déclenche
// un second rapport est une boucle qu'on ne veut pas découvrir en production.
app.post("/api/errors", async (c) => {
  try {
    const body = (await c.req.json()) as Record<string, unknown>;
    const ip = (c.req.header("x-forwarded-for") ?? "").split(",")[0]?.trim();
    console.error(
      "[client-error]",
      JSON.stringify({
        kind: body.kind,
        area: body.area,
        message: String(body.message ?? "").slice(0, 300),
        url: body.url,
        at: body.at,
        ip,
        stack: String(body.stack ?? "").slice(0, 800),
      }),
    );
  } catch {
    /* corps illisible : rien à journaliser, rien à signaler */
  }
  return c.body(null, 204);
});

app.get("/api/config", (c) =>
  c.json({ publicSignup: publicSignupAllowed(), inviteRequired: !publicSignupAllowed() }),
);

// ── Admin ─────────────────────────────────────────────────────────────────
// Rolle kommt aus user_access; erste Vergabe über ADMIN_EMAILS in der Umgebung.
async function requireAdmin(c: {
  req: { raw: Request };
}): Promise<{ ok: true; userId: string } | { ok: false; status: 401 | 403 }> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return { ok: false, status: 401 };
  const access = await getAccess(session.user.id, session.user.email);
  if (access.role !== "admin" || !access.isActive) return { ok: false, status: 403 };
  return { ok: true, userId: session.user.id };
}

app.get("/api/admin/users", async (c) => {
  const guard = await requireAdmin(c);
  if (!guard.ok) return c.json({ error: "FORBIDDEN" }, guard.status);
  return c.json({ users: await listUsers() });
});

app.post("/api/admin/users/access", async (c) => {
  const guard = await requireAdmin(c);
  if (!guard.ok) return c.json({ error: "FORBIDDEN" }, guard.status);

  const body = (await c.req.json().catch(() => ({}))) as {
    userId?: string;
    isActive?: boolean;
    note?: string;
  };
  if (!body.userId || typeof body.isActive !== "boolean") {
    return c.json({ error: "invalid body" }, 400);
  }
  // Der eigene Zugang lässt sich nicht sperren — sonst sperrt man sich aus.
  if (body.userId === guard.userId && body.isActive === false) {
    return c.json({ error: "CANNOT_BAN_SELF" }, 400);
  }
  await setActive(body.userId, body.isActive, body.note);
  return c.json({ ok: true });
});

app.get("/api/admin/invites", async (c) => {
  const guard = await requireAdmin(c);
  if (!guard.ok) return c.json({ error: "FORBIDDEN" }, guard.status);
  return c.json({ codes: await listCodes() });
});

app.post("/api/admin/invites", async (c) => {
  const guard = await requireAdmin(c);
  if (!guard.ok) return c.json({ error: "FORBIDDEN" }, guard.status);
  const body = (await c.req.json().catch(() => ({}))) as {
    label?: string;
    maxUses?: number;
    expiresInDays?: number | null;
  };
  const code = await createCode(body);
  return c.json({ code });
});

app.post("/api/admin/invites/disable", async (c) => {
  const guard = await requireAdmin(c);
  if (!guard.ok) return c.json({ error: "FORBIDDEN" }, guard.status);
  const body = (await c.req.json().catch(() => ({}))) as {
    code?: string;
    disabled?: boolean;
  };
  if (!body.code || typeof body.disabled !== "boolean") {
    return c.json({ error: "invalid body" }, 400);
  }
  await setCodeDisabled(body.code, body.disabled);
  return c.json({ ok: true });
});

// Streaming tutor chat — grounded in the user's documents.
// Scope resolution (in priority order):
//   documentId  -> a single document
//   semesterId  -> all documents in that semester
//   (neither)   -> all of the user's documents, or general-tutor mode if none.
// The chat never dead-ends: with no documents the agent answers from general
// engineering knowledge and invites an upload.
// Zeichenbudget für den Kurskontext, der pro Anfrage an das Modell geht.
// Statt "alles mitschicken" wählt ./lib/retrieval die relevanten Abschnitte aus:
// gleiche Antwortqualität, ein Bruchteil der Kosten und deutlich schneller.
const MAX_CONTEXT_CHARS = 24_000;

app.post("/api/agent/messages", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);

  // Monatskontingent prüfen und zählen. Bewusst VOR dem Modellaufruf: die
  // Kosten entstehen beim Aufruf, nicht erst bei der fertigen Antwort. Wer das
  // Limit erreicht hat, bekommt 402 — die Oberfläche zeigt daraufhin die
  // Tarifseite. Siehe LIMITS in lib/plan.ts.
  const quota = await consume(session.user.id, "chat");
  if (!quota.ok) return c.json(quotaError(quota), 402);

  // Zweite, unabhängige Schranke: der Euro-Deckel. Der Zähler oben begrenzt die
  // ANZAHL der Anfragen, dieser hier ihre GRÖSSE.
  const cap = await withinTokenCap(session.user.id);
  if (!cap.ok) return c.json(tokenCapError(cap.used, cap.cap), 402);

  const body = await c.req.json();
  const { messages, documentId, semesterId, locale, examMode, calcMode, codeLang } =
    body as {
      messages: unknown[];
      documentId?: string | null;
      semesterId?: string | null;
      locale?: string;
      examMode?: boolean;
      calcMode?: boolean;
      codeLang?: string;
    };

  let rows;
  let contextLabel = "Alle Kurse";

  if (documentId) {
    rows = await db
      .select()
      .from(document)
      .where(
        and(eq(document.id, documentId), eq(document.userId, session.user.id)),
      )
      .limit(1);
    if (!rows[0]) return c.json({ error: "document not found" }, 404);
    contextLabel = rows[0].title;
  } else if (semesterId) {
    rows = await db
      .select()
      .from(document)
      .where(
        and(
          eq(document.semesterId, semesterId),
          eq(document.userId, session.user.id),
        ),
      );
    const sem = await db
      .select()
      .from(semester)
      .where(and(eq(semester.id, semesterId), eq(semester.userId, session.user.id)))
      .limit(1);
    contextLabel = sem[0]?.name ?? "Semester";
  } else {
    rows = await db
      .select()
      .from(document)
      .where(eq(document.userId, session.user.id));
  }

  // Nur die für die aktuelle Frage relevanten Abschnitte mitschicken.
  const lastUserText = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i] as { role?: string; parts?: unknown[] };
      if (m?.role !== "user" || !Array.isArray(m.parts)) continue;
      return m.parts
        .map((p) => {
          const part = p as { type?: string; text?: string };
          return part?.type === "text" ? (part.text ?? "") : "";
        })
        .join(" ")
        .slice(0, 2000);
    }
    return "";
  })();

  const { sources } = selectRelevantContext(
    rows.map((d) => ({ title: d.title, kind: d.kind, content: d.textContent })),
    lastUserText,
    MAX_CONTEXT_CHARS,
  );

  // Sprache: was der Client mitschickt, sonst die im Konto gespeicherte.
  // Ohne den Rückfall antwortet der Tutor auf Deutsch, obwohl der Studierende
  // seine Oberfläche auf Französisch gestellt hat.
  const storedLocale = await db
    .select({ locale: userAccess.locale })
    .from(userAccess)
    .where(eq(userAccess.userId, session.user.id))
    .limit(1)
    .then((r) => r[0]?.locale ?? "de")
    .catch(() => "de");

  // Ce que le tuteur a retenu de cette personne. Une requête, plafonnée à
  // huit lignes : au-delà, le prompt s'allonge sans que la réponse gagne.
  const uid = session.user.id;
  const gaps = await openGaps(uid);

  const agent = buildTutorAgent({
    sources,
    contextLabel,
    locale: locale ?? storedLocale,
    studentName: session.user.name,
    examMode: examMode === true,
    calcMode: calcMode === true,
    codeLang: codeLang === "matlab" ? "matlab" : "python",
    memory: {
      open: gaps,
      note: (input) => noteGap(uid, { ...input, semesterId: semesterId ?? null }),
      resolve: (label) => resolveGap(uid, label),
    },
  });

  return createAgentUIStreamResponse({
    agent,
    uiMessages: pruneHistoryFiles(messages),
    // Echte Abrechnung: jeder Schritt des Werkzeug-Loops meldet seinen
    // Verbrauch. Feuern und vergessen — ein Schreibfehler darf den laufenden
    // Stream nicht abbrechen.
    onStepEnd: (step: { usage?: { outputTokens?: number } }) => {
      void addOutputTokens(session.user.id, step.usage?.outputTokens ?? 0);
    },
  });
});

// Bilder und PDFs werden als Data-URLs in den Nachrichten mitgeschickt. Da der
// Client bei jeder Frage den kompletten Verlauf erneut sendet, summieren sich
// alte Anhänge — die Anfrage wird immer größer, bis sie an der Größengrenze
// scheitert ("Verbindung unterbrochen"). Für die aktuelle Frage sind nur die
// Anhänge der letzten Nachricht relevant; ältere werden durch einen kurzen
// Hinweis ersetzt.
const MAX_FILES_PER_MESSAGE = 4;

function pruneHistoryFiles(msgs: unknown[]): unknown[] {
  if (!Array.isArray(msgs) || msgs.length === 0) return msgs;

  let lastUserIndex = -1;
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    const role = (msgs[i] as { role?: string })?.role;
    if (role === "user") {
      lastUserIndex = i;
      break;
    }
  }

  return msgs.map((msg, index) => {
    const m = msg as { role?: string; parts?: unknown[] };
    if (!Array.isArray(m.parts)) return msg;

    const isCurrent = index === lastUserIndex;
    let kept = 0;
    const parts: unknown[] = [];

    for (const part of m.parts) {
      const p = part as { type?: string; mediaType?: string };
      const isFile =
        p?.type === "file" &&
        (String(p.mediaType ?? "").startsWith("image/") ||
          p.mediaType === "application/pdf");

      if (!isFile) {
        parts.push(part);
        continue;
      }

      // Letzte Verteidigungslinie: ein Anhang ohne brauchbare Daten lässt sonst
      // die komplette Anfrage mit HTTP 400 scheitern ("Input should be a valid
      // string"). Lieber den Anhang weglassen als das Gespräch abbrechen.
      const url = (part as { url?: unknown }).url;
      const usable =
        typeof url === "string" &&
        ((url.startsWith("data:") && url.includes(";base64,") && url.length > 200) ||
          url.startsWith("http://") ||
          url.startsWith("https://"));
      if (!usable) {
        parts.push({
          type: "text",
          text: "[Anhang konnte nicht gelesen werden]",
        });
        continue;
      }
      if (isCurrent && kept < MAX_FILES_PER_MESSAGE) {
        parts.push(part);
        kept += 1;
        continue;
      }
      // Older (or excess) attachment: keep the trace, drop the payload.
      parts.push({ type: "text", text: "[Anhang aus einer früheren Nachricht]" });
    }

    return { ...m, parts };
  });
}

// Translate an existing conversation into the selected UI language, so a
// student can flip the language toggle and have the whole exchange follow —
// while preserving formulas, diagrams, source markers and German Fachbegriffe.
const TR_LANG: Record<string, string> = {
  de: "Deutsch",
  fr: "Französisch (français)",
  en: "Englisch (English)",
  es: "Spanisch (español)",
};

app.post("/api/agent/translate", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);

  const body = (await c.req.json()) as {
    texts?: { id: string; content: string }[];
    target?: string;
  };
  const target = TR_LANG[body.target ?? ""] ? (body.target as string) : "de";
  const targetLabel = TR_LANG[target];
  const texts = Array.isArray(body.texts) ? body.texts.slice(0, 80) : [];
  if (texts.length === 0) return c.json({ results: [] });

  const system = `
    Du bist ein Fachübersetzer für Ingenieurwissenschaften. Übersetze den
    gegebenen Text nach: ${targetLabel}.

    ABSOLUT UNVERÄNDERT ERHALTEN (niemals übersetzen, verschieben oder löschen):
    - Alle Marker in doppelten eckigen Klammern, exakt wie sie sind:
      [[OFFICIAL]] [[/OFFICIAL]] [[AEROSTUDY]] [[/AEROSTUDY]]
      [[REASONING]] [[/REASONING]]
    - Zeilen, die mit "@@STEP:" beginnen: das Präfix "@@STEP:" bleibt; NUR den
      Titel dahinter übersetzen.
    - Alle LaTeX-Formeln (Inhalt zwischen $...$ und $...$) unverändert.
    - Alle Code-Blöcke, insbesondere \`\`\`mermaid, \`\`\`chart und \`\`\`tikz,
      komplett unverändert (auch deren Inhalt/JSON/LaTeX-Code).
    - Markdown-Struktur, Seitenzitate (z. B. "Seite 12"), Zahlen und Einheiten.

    DEUTSCHE FACHBEGRIFFE (z. B. Flächenträgheitsmoment, Querkraft,
    Biegemoment, Spannung, Auftrieb, Wirkungsgrad) bleiben auf DEUTSCH stehen —
    übersetze nur den umgebenden Fließtext.

    Wenn der Text bereits in ${targetLabel} ist, gib ihn unverändert zurück.
    Gib AUSSCHLIESSLICH den übersetzten Text zurück — keine Einleitung, keine
    Anführungszeichen, keine Erklärung.
  `;

  const model = gateway("anthropic/claude-sonnet-4.6");

  let hits = 0;
  let misses = 0;

  const results = await Promise.all(
    texts.map(async (item) => {
      if (!item.content.trim()) return { id: item.id, content: item.content };

      // Cache zuerst. Derselbe Absatz eines Skripts wird von jedem Studierenden
      // derselben Vorlesung angefragt — ohne das hier bezahlt man dieselbe
      // Übersetzung hundertmal.
      const cached = await getCachedTranslation(item.content, target);
      if (cached) {
        hits += 1;
        return { id: item.id, content: cached };
      }
      misses += 1;

      try {
        const { text } = await generateText({
          model,
          system,
          prompt: item.content,
        });
        const out = text.trim() || item.content;
        // Feuern und vergessen: das Ergebnis liegt vor, der Cache darf es nicht
        // aufhalten.
        void putCachedTranslation(item.content, target, out);
        return { id: item.id, content: out };
      } catch {
        return { id: item.id, content: item.content };
      }
    }),
  );

  return c.json({ results });
});

// Generate a course-styled exercise (or a full practice Klausur) grounded in
// the student's documents. Returns structured JSON so the UI can show the
// statement, an answer space, points, and a hideable model solution.

app.post("/api/agent/exercise", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);

  const quota = await consume(session.user.id, "exercise");
  if (!quota.ok) return c.json(quotaError(quota), 402);

  const cap = await withinTokenCap(session.user.id);
  if (!cap.ok) return c.json(tokenCapError(cap.used, cap.cap), 402);

  const body = (await c.req.json()) as {
    mode?: "exercise" | "klausur";
    subject?: string;
    chapter?: string;
    difficulty?: "easy" | "medium" | "hard";
    type?: "application" | "proof" | "analysis";
    semesterId?: string | null;
    documentId?: string | null;
    basedOnId?: string | null;
    locale?: string;
  };
  const mode = body.mode === "klausur" ? "klausur" : "exercise";
  // Repli qui NOMME la langue au lieu de basculer en allemand sans le dire.
  const { code: locale, label: langLabel } = langOf(body.locale);

  // Resolve grounding documents. A specific document / basedOn Klausur wins;
  // otherwise scope by semester, else all of the user's documents.
  const targetId = body.basedOnId || body.documentId || null;
  let rows;
  if (targetId) {
    rows = await db
      .select()
      .from(document)
      .where(and(eq(document.id, targetId), eq(document.userId, session.user.id)))
      .limit(1);
  } else if (body.semesterId) {
    rows = await db
      .select()
      .from(document)
      .where(
        and(
          eq(document.semesterId, body.semesterId),
          eq(document.userId, session.user.id),
        ),
      );
  } else {
    rows = await db
      .select()
      .from(document)
      .where(eq(document.userId, session.user.id));
  }

  const { sources: exSources } = selectRelevantContext(
    rows.map((d) => ({ title: d.title, kind: d.kind, content: d.textContent })),
    [body.subject, body.chapter, body.type].filter(Boolean).join(" "),
    MAX_CONTEXT_CHARS,
  );
  const docBlock = exSources
    .map((d) => `-- ${d.title} (${d.kind}) --\n${d.content}`)
    .join("\n\n");

  const diffLabel =
    body.difficulty === "easy"
      ? "leicht (Grundlagen)"
      : body.difficulty === "hard"
        ? "schwer (klausurnah, mehrere Schritte)"
        : "mittel";
  const typeLabel =
    body.type === "proof"
      ? "Herleitung / Beweis"
      : body.type === "analysis"
        ? "Analyse / Diskussion"
        : "Anwendung / Rechenaufgabe";

  const klausurRule =
    mode === "klausur"
      ? "- Erzeuge 3-5 Aufgaben mit Punkten, die sich zu 100 summieren, plus ein kurzes Bewertungsschema."
      : "- Genau EINE zusammenhaengende Aufgabe (ggf. mit Teilaufgaben a, b, c).";
  const modeWord = mode === "klausur" ? "Übungsklausur" : "Übungsaufgabe";

  const system = `Du bist TRED, ein Professor für Ingenieurwissenschaften. Erstelle ${mode === "klausur" ? "eine vollständige Übungsklausur" : "eine Übungsaufgabe"} im STIL und auf Basis der bereitgestellten Kursunterlagen.

Sprache der Ausgabe: ${langLabel}. Deutsche Fachbegriffe (Flächenträgheitsmoment, Querkraft, Biegemoment, Spannung, Wirkungsgrad ...) bleiben immer auf Deutsch.

ANFORDERUNGEN:
- Fach: ${body.subject || "(aus den Unterlagen ableiten)"}
- Kapitel / Thema: ${body.chapter || "(passendes Kernthema wählen)"}
- Schwierigkeit: ${diffLabel}
- Aufgabentyp: ${typeLabel}
- Verwende NUR Methoden und Notation, die zum Kurs passen.
- Formeln als LaTeX zwischen $...$ bzw. $...$.
- RECHENPROBE: Bevor du eine Aussage der Form \"wenn X steigt, dann steigt/sinkt Y\" oder eine Schaltbedingung formulierst, setze zwei Zahlenwerte beiderseits des Umschaltpunkts ein und rechne beide Fälle aus. Beim Spannungsteiler U = U₀·R_unten/(R_oben+R_unten) gilt: steigt R_oben, so SINKT U. Angabe, Rechenweg und Ergebnis müssen dieselbe Richtung haben.
- Liegt in den Unterlagen eine Musterlösung vor, ist sie maßgeblich; weiche nur ab, wenn du den Widerspruch ausdrücklich benennst.
- Wo eine Skizze hilft (Balken, Querschnitt, Freikörperbild, Schaltung): füge einen \`\`\`svg-Codeblock mit reinem, nativem SVG ein — EXAKT im selben Klausur-Stil wie im Tutor-Chat. KEIN TikZ, KEIN mermaid. Regeln:
  • IMMER \`viewBox\` (z. B. "0 0 480 260"), NIE feste width/height.
  • Nur diese Elemente: svg, g, defs, marker, path, line, polyline, polygon, rect, circle, ellipse, text, tspan. Keine Skripte, keine externen Referenzen.
  • TM-Symbole als Geometrie: Festlager = Dreieck; Loslager = Dreieck + Bodenlinie; Einspannung = schraffierte Wand; Streckenlast = Pfeilreihe unter Decklinie; Einzelkraft = dicke Linie mit marker-end-Pfeilspitze; Moment = Bogen-path mit Pfeil.
  • Farb-Konvention: Kräfte/Lasten Blau #2563EB; Druck Rot #EF4444; Zug Grün #10B981; neutrale Achse/Bemaßung Grau #64748B (Achse gestrichelt \`stroke-dasharray="5 4"\`); Körper/Balken #1e293b.
  • Pfeilspitzen als <marker> in <defs> (\`<path d="M0,0 L10,5 L0,10 z"/>\`), Kraftpfeile stroke-width 3; Bemaßung mit marker-start UND marker-end.
  • Beschriftungen NIE überlappend, mit \`text-anchor\` und ≥16 px Abstand; sauber wie im Lehrbuch.
- Realistische Zahlenwerte mit Einheiten. Rechne die Musterlösung Schritt für Schritt und dimensionsrichtig durch.
${klausurRule}

Die Felder title/points/statement/solution/scale werden strukturiert zurückgegeben. In statement und solution nutzt du Markdown mit LaTeX ganz normal (Backslashes wie \\frac sind erlaubt) und \`\`\`svg-Codeblöcke für Skizzen — die JSON-Kodierung übernimmt das System.`;

  const prompt =
    rows.length > 0
      ? `KURSUNTERLAGEN:\n${docBlock}\n\nErstelle jetzt die ${modeWord}.`
      : `Es liegen keine Kursunterlagen vor. Erstelle eine sinnvolle ${modeWord} zum Thema "${body.chapter || body.subject || "Technische Mechanik"}".`;

  const exerciseSchema = z.object({
    title: z.string().describe("Kurzer Titel der Aufgabe/Klausur"),
    points: z.number().describe("Gesamtpunktzahl"),
    statement: z
      .string()
      .describe("Die Angabe ohne Lösung, Markdown mit LaTeX ($...$) und ggf. ```svg-Blöcken"),
    solution: z
      .string()
      .describe("Vollständige Musterlösung Schritt für Schritt, Markdown mit LaTeX"),
    scale: z.string().describe("Kurzes Punkte-/Bewertungsschema"),
  });

  // Generation runs the structured-output path (SDK guarantees valid JSON,
  // removing the class of parse failures caused by LaTeX backslashes) with a
  // free-text + defensive-parse fallback. A full Klausur can take 2-3 minutes,
  // which exceeds proxy idle timeouts on a single blocking request. So we
  // stream the response: emit a heartbeat every few seconds to keep the
  // connection warm, then a final `result` (or `error`) line as NDJSON.
  async function runExercise() {
    try {
      const { object } = await generateObject({
        model: gateway("anthropic/claude-sonnet-4.6"),
        schema: exerciseSchema,
        system,
        prompt,
      });
      return {
        title: String(object.title ?? ""),
        points: Number(object.points ?? 0),
        statement: String(object.statement ?? ""),
        solution: String(object.solution ?? ""),
        scale: String(object.scale ?? ""),
      };
    } catch (objErr) {
      // Fallback: some gateway models occasionally reject strict object mode.
      // Retry as free text and parse defensively (strip fences, slice braces,
      // repair common invalid LaTeX escapes) before giving up.
      console.warn("[exercise] generateObject failed, falling back to text", objErr);
      const { text } = await generateText({
        model: gateway("anthropic/claude-sonnet-4.6"),
        system: `${system}\n\nGib AUSSCHLIESSLICH gültiges JSON zurück (keine Code-Fences, keine Einleitung).`,
        prompt,
      });
      const cleaned = text
        .replace(/^```(?:json)?/gm, "")
        .replace(/```$/gm, "")
        .trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      const raw = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
      const parsed = parseLooseJson(raw) as {
        title?: string;
        points?: number;
        statement?: string;
        solution?: string;
        scale?: string;
      };
      return {
        title: String(parsed.title ?? ""),
        points: Number(parsed.points ?? 0),
        statement: String(parsed.statement ?? ""),
        solution: String(parsed.solution ?? ""),
        scale: String(parsed.scale ?? ""),
      };
    }
  }

  c.header("Content-Type", "application/x-ndjson; charset=utf-8");
  c.header("Cache-Control", "no-cache, no-transform");
  c.header("X-Accel-Buffering", "no");
  return stream(c, async (s) => {
    let done = false;
    const heartbeat = (async () => {
      while (!done) {
        await new Promise((r) => setTimeout(r, 3000));
        if (done) break;
        await s.write(`{"type":"ping"}\n`).catch(() => {});
      }
    })();
    try {
      const result = await runExercise();
      done = true;
      // Auto-save every successful generation so it shows up in the history and
      // can be reopened / exported later. The user can delete it afterwards.
      let savedId: string | null = null;
      try {
        savedId = crypto.randomUUID();
        await db.insert(savedExercise).values({
          id: savedId,
          userId: session.user.id,
          semesterId: body.semesterId ?? null,
          mode,
          subject: body.subject ?? "",
          chapter: body.chapter ?? "",
          difficulty: body.difficulty ?? "medium",
          type: body.type ?? "application",
          basedOnId: body.basedOnId ?? null,
          locale,
          title: result.title,
          points: result.points,
          statement: result.statement,
          solution: result.solution,
          scale: result.scale,
        });
      } catch (saveErr) {
        console.error("[exercise] auto-save failed", saveErr);
        savedId = null;
      }
      await s.write(JSON.stringify({ type: "result", savedId, ...result }) + "\n");

      // Push erst NACH dem Schreiben des Ergebnisses und ohne await: der
      // Student soll die Antwort sofort sehen. Tippt er auf die Meldung, ist
      // die Klausur über savedId schon gespeichert und direkt zu öffnen.
      // Eine Störung bei Expo darf eine gelungene Generierung nicht gefährden.
      notifyExerciseReady({
        userId: session.user.id,
        savedId,
        mode,
        subject: body.subject,
        locale,
      });
    } catch (err) {
      done = true;
      console.error("[exercise] generation failed", err);
      await s.write(`{"type":"error"}\n`);
    }
    await heartbeat;
  });
});


// Generate a compact, exam-oriented Formelsammlung grounded in the user's
// course documents. Same streaming NDJSON contract as /api/agent/exercise.
app.post("/api/agent/formulas", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);

  const quota = await consume(session.user.id, "formulas");
  if (!quota.ok) return c.json(quotaError(quota), 402);

  const cap = await withinTokenCap(session.user.id);
  if (!cap.ok) return c.json(tokenCapError(cap.used, cap.cap), 402);

  const body = (await c.req.json()) as {
    subject?: string;
    focus?: string;
    semesterId?: string | null;
    locale?: string;
  };
  // Repli qui NOMME la langue au lieu de basculer en allemand sans le dire.
  const { code: locale, label: langLabel } = langOf(body.locale);

  let rows;
  if (body.semesterId) {
    rows = await db
      .select()
      .from(document)
      .where(
        and(
          eq(document.semesterId, body.semesterId),
          eq(document.userId, session.user.id),
        ),
      );
  } else {
    rows = await db
      .select()
      .from(document)
      .where(eq(document.userId, session.user.id));
  }

  const { sources: fSources } = selectRelevantContext(
    rows.map((d) => ({ title: d.title, kind: d.kind, content: d.textContent })),
    [body.subject, body.focus].filter(Boolean).join(" "),
    MAX_CONTEXT_CHARS,
  );
  const docBlock = fSources
    .map((d) => `-- ${d.title} (${d.kind}) --\n${d.content}`)
    .join("\n\n");

  const system = `Du bist TRED, ein Professor für Ingenieurwissenschaften. Erstelle eine kompakte, klausurtaugliche FORMELSAMMLUNG auf Basis der bereitgestellten Kursunterlagen.

Sprache der Ausgabe: ${langLabel}. Deutsche Fachbegriffe bleiben immer auf Deutsch.

ANFORDERUNGEN:
- Fach: ${body.subject || "(aus den Unterlagen ableiten)"}
- Schwerpunkt: ${body.focus || "(alle Kernthemen der Unterlagen)"}
- Gliedere nach Kapiteln (## Überschriften) in der Reihenfolge des Kurses.
- Jede Formel als LaTeX-Display ($$...$$), darunter eine Zeile pro Symbol: Symbol – Bedeutung – Einheit.
- Nimm NUR Formeln auf, die im Kurs vorkommen bzw. klausurrelevant sind. Notation exakt wie im Kurs.
- Kurze Hinweise (Gültigkeitsbereich, Sonderfälle) nur wo nötig, maximal eine Zeile.
- KEINE Herleitungen, KEINE Beispiele — nur die Essenz zum Nachschlagen.`;

  const prompt =
    rows.length > 0
      ? `KURSUNTERLAGEN:\n${docBlock}\n\nErstelle jetzt die Formelsammlung.`
      : `Es liegen keine Kursunterlagen vor. Erstelle eine sinnvolle Formelsammlung zum Thema "${body.focus || body.subject || "Technische Mechanik"}".`;

  const formulasSchema = z.object({
    title: z.string().describe("Kurzer Titel, z. B. 'Formelsammlung Technische Mechanik'"),
    content: z
      .string()
      .describe("Die komplette Formelsammlung als Markdown mit LaTeX ($$...$$), gegliedert mit ##-Kapiteln"),
  });

  async function runFormulas() {
    try {
      const { object } = await generateObject({
        model: gateway("anthropic/claude-sonnet-4.6"),
        schema: formulasSchema,
        system,
        prompt,
      });
      return { title: String(object.title ?? ""), content: String(object.content ?? "") };
    } catch (objErr) {
      console.warn("[formulas] generateObject failed, falling back to text", objErr);
      const { text } = await generateText({
        model: gateway("anthropic/claude-sonnet-4.6"),
        system:
          system +
          `\n\nAntworte AUSSCHLIESSLICH mit einem JSON-Objekt {"title": string, "content": string} ohne Markdown-Zäune.`,
        prompt,
      });
      const parsed = parseLooseJson(text) as { title?: string; content?: string };
      return { title: String(parsed.title ?? ""), content: String(parsed.content ?? "") };
    }
  }

  return stream(c, async (s) => {
    let done = false;
    const heartbeat = (async () => {
      while (!done) {
        await new Promise((r) => setTimeout(r, 5000));
        if (!done) await s.write(`{"type":"heartbeat"}\n`);
      }
    })();
    try {
      const result = await runFormulas();
      done = true;
      await s.write(JSON.stringify({ type: "result", ...result }) + "\n");
    } catch (err) {
      done = true;
      console.error("[formulas] generation failed", err);
      await s.write(`{"type":"error"}\n`);
    }
    await heartbeat;
  });
});


// Generate a Studyflix-style animated explainer ("video") for a topic, grounded
// in the student's own course documents. We return a scene script; the client
// animates it and narrates via the device's speech synthesis — no video
// encoding, no per-second model cost, and formulas stay mathematically exact.
app.post("/api/agent/video", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);

  const quota = await consume(session.user.id, "video");
  if (!quota.ok) return c.json(quotaError(quota), 402);

  const cap = await withinTokenCap(session.user.id);
  if (!cap.ok) return c.json(tokenCapError(cap.used, cap.cap), 402);

  const body = (await c.req.json()) as {
    topic?: string;
    docId?: string | null;
    semesterId?: string | null;
    locale?: string;
  };
  // Repli qui NOMME la langue au lieu de basculer en allemand sans le dire.
  const { code: locale, label: langLabel } = langOf(body.locale);
  const topic = (body.topic ?? "").slice(0, 4000);

  let rows;
  if (body.docId) {
    rows = await db
      .select()
      .from(document)
      .where(
        and(eq(document.id, body.docId), eq(document.userId, session.user.id)),
      );
  } else if (body.semesterId) {
    rows = await db
      .select()
      .from(document)
      .where(
        and(
          eq(document.semesterId, body.semesterId),
          eq(document.userId, session.user.id),
        ),
      );
  } else {
    rows = await db
      .select()
      .from(document)
      .where(eq(document.userId, session.user.id));
  }

  const { sources: vSources } = selectRelevantContext(
    rows.map((d) => ({ title: d.title, kind: d.kind, content: d.textContent })),
    topic,
    MAX_CONTEXT_CHARS,
  );
  const docBlock = vSources
    .map((d) => `-- ${d.title} (${d.kind}) --\n${d.content}`)
    .join("\n\n");

  const system = `Du bist TRED, Professor für Ingenieurwissenschaften. Du schreibst das Drehbuch für ein kurzes Erklärvideo (Studyflix-Stil): 5 bis 7 Szenen, die ein Thema vom Alltagsbild bis zur Formel aufbauen.

Sprache der Ausgabe: ${langLabel}. Deutsche Fachbegriffe bleiben immer auf Deutsch.

REGELN JE SZENE:
- "heading": 2–5 Wörter, wie ein Foliertitel.
- "narration": 2–4 gesprochene Sätze, natürliche Sprechsprache OHNE Formelzeichen, OHNE LaTeX, OHNE Sonderzeichen (wird laut vorgelesen: schreibe "Sigma gleich M mal z durch I" statt Symbolen).
- "bullets": 0–3 sehr kurze Stichpunkte (max. 8 Wörter), das was auf der Folie steht.
- "formula": optional, EINE zentrale Formel in reinem LaTeX ohne Dollarzeichen (z. B. "\\sigma_{max} = \\frac{M_{max}}{I_y} \\cdot z_{max}").
- "svg": optional, eine Skizze als reines natives SVG im Klausur-Stil. IMMER viewBox (z. B. "0 0 480 240"), nie feste width/height. Nur svg, g, defs, marker, path, line, polyline, polygon, rect, circle, ellipse, text, tspan. Kräfte/Lasten Blau #2563EB, Druck Rot #EF4444, Zug Grün #10B981, Bemaßung Grau #64748B, Körper #1e293b. Pfeilspitzen als <marker> in <defs>. Beschriftungen nie überlappend.
- "seconds": geschätzte Dauer 8–20.

DIDAKTIK: Szene 1 = Alltagsbild/Motivation. Mitte = Aufbau Schritt für Schritt mit Skizze. Vorletzte Szene = die Formel und ihre Bedeutung. Letzte Szene = Merksatz für die Klausur.
Bleibe strikt bei der Notation der Kursunterlagen.`;

  const prompt =
    rows.length > 0
      ? `KURSUNTERLAGEN:\n${docBlock}\n\nTHEMA (aus dem Tutor-Chat):\n${topic}\n\nSchreibe jetzt das Drehbuch.`
      : `THEMA:\n${topic || "Technische Mechanik: Biegung"}\n\nSchreibe jetzt das Drehbuch.`;

  const videoSchema = z.object({
    title: z.string().describe("Kurzer Videotitel"),
    scenes: z
      .array(
        z.object({
          heading: z.string(),
          narration: z.string(),
          bullets: z.array(z.string()),
          formula: z.string(),
          svg: z.string(),
          seconds: z.number(),
        }),
      )
      .describe("5 bis 7 Szenen. formula und svg dürfen leere Strings sein."),
  });

  type Scene = {
    heading: string;
    narration: string;
    bullets: string[];
    formula: string;
    svg: string;
    seconds: number;
  };

  function normalize(raw: unknown): { title: string; scenes: Scene[] } {
    const obj = (raw ?? {}) as { title?: unknown; scenes?: unknown };
    const list = Array.isArray(obj.scenes) ? obj.scenes : [];
    const scenes: Scene[] = list.map((item) => {
      const sc = (item ?? {}) as Record<string, unknown>;
      const secs = Number(sc.seconds);
      return {
        heading: String(sc.heading ?? ""),
        narration: String(sc.narration ?? ""),
        bullets: Array.isArray(sc.bullets) ? sc.bullets.map((b) => String(b)) : [],
        formula: String(sc.formula ?? ""),
        svg: String(sc.svg ?? ""),
        seconds: Number.isFinite(secs) && secs > 0 ? Math.min(secs, 40) : 12,
      };
    });
    return { title: String(obj.title ?? ""), scenes };
  }

  async function runVideo() {
    try {
      const { object } = await generateObject({
        model: gateway("anthropic/claude-sonnet-4.6"),
        schema: videoSchema,
        system,
        prompt,
      });
      return normalize(object);
    } catch (objErr) {
      console.warn("[video] generateObject failed, falling back to text", objErr);
      const { text } = await generateText({
        model: gateway("anthropic/claude-sonnet-4.6"),
        system:
          system +
          `\n\nAntworte AUSSCHLIESSLICH mit einem JSON-Objekt {"title": string, "scenes": [{"heading": string, "narration": string, "bullets": string[], "formula": string, "svg": string, "seconds": number}]} ohne Markdown-Zäune.`,
        prompt,
      });
      return normalize(parseLooseJson(text));
    }
  }

  return stream(c, async (s) => {
    let done = false;
    const heartbeat = (async () => {
      while (!done) {
        await new Promise((r) => setTimeout(r, 5000));
        if (!done) await s.write(`{"type":"heartbeat"}\n`);
      }
    })();
    try {
      const result = await runVideo();
      if (result.scenes.length === 0) throw new Error("empty_script");
      done = true;
      await s.write(JSON.stringify({ type: "result", ...result }) + "\n");
    } catch (err) {
      done = true;
      console.error("[video] generation failed", err);
      await s.write(`{"type":"error"}\n`);
    }
    await heartbeat;
  });
});

// Parse model JSON that may contain invalid LaTeX escape sequences. First try
// strict JSON.parse; if that throws, escape any backslash that isn't part of a
// valid JSON escape (\" \\ \/ \b \f \n \r \t \uXXXX) so LaTeX like \frac
// survives, then parse again.
function parseLooseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const repaired = raw.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
    return JSON.parse(repaired);
  }
}

// Passende Erklärvideos auf YouTube suchen (Studyflix, simpleclub, Uni-Kanäle …).
// Ergänzung zum generierten Erklärvideo: manchmal will man einfach ein echtes
// Video zum Thema sehen. Der API-Key bleibt serverseitig, Ergebnisse werden
// zwischengespeichert (siehe ./lib/youtube).
app.post("/api/youtube/search", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);

  let body: { topic?: string; question?: string; locale?: string };
  try {
    body = (await c.req.json()) as {
      topic?: string;
      question?: string;
      locale?: string;
    };
  } catch {
    return c.json({ error: "invalid body" }, 400);
  }

  // Der Name des Studenten wird übergeben, damit die Anrede des Tutors
  // ("Perfekt Rached, …") nie in der Suchanfrage landet.
  const result = await searchYoutube(
    String(body.topic ?? "").slice(0, 4000),
    String(body.locale ?? "de"),
    String(body.question ?? "").slice(0, 1000),
    session.user.name ?? "",
  );

  if (!result.ok) {
    const status = result.code === "not_configured" ? 503 : result.code === "quota" ? 429 : 502;
    return c.json({ error: result.code }, status);
  }

  return c.json({ query: result.query, hits: result.hits, cached: result.cached });
});

// Compile a ```tikz block into an SVG. The tutor emits TikZ for exam-style
// statics schemas (beams, supports, distributed loads, dimensions) that
// mermaid/chart cannot draw. Result is cached by content hash server-side.
// Passende Erklärvideos (Studyflix, simpleclub, Uni-Kanäle …) zum aktuellen
// Chat-Thema. Ergänzt das generierte Erklärvideo: manchmal will man einfach
// sehen, wie es jemand anders erklärt. Der API-Key bleibt serverseitig, die
// Ergebnisse werden zwischengespeichert (siehe ./lib/youtube).
app.post("/api/youtube/search", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);

  let body: { topic?: string; locale?: string };
  try {
    body = (await c.req.json()) as { topic?: string; locale?: string };
  } catch {
    return c.json({ error: "invalid body" }, 400);
  }

  const result = await searchYoutube(
    String(body.topic ?? "").slice(0, 4000),
    String(body.locale ?? "de"),
  );

  if (!result.ok) {
    const status = result.code === "not_configured" ? 503 : result.code === "quota" ? 429 : 502;
    return c.json({ error: result.code }, status);
  }

  return c.json({ query: result.query, hits: result.hits, cached: result.cached });
});

app.post("/api/tikz/render", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);

  let body: { code?: string };
  try {
    body = (await c.req.json()) as { code?: string };
  } catch {
    return c.json({ error: "invalid body" }, 400);
  }
  const result = await renderTikz(String(body.code ?? ""));
  if ("error" in result) return c.json({ error: result.error }, 422);
  return c.json({ svg: result.svg });
});

// Server-side PDF upload + extraction. The client posts the raw PDF (multipart)
// and the server extracts text with unpdf — and vision-transcribes scanned
// PDFs — so uploads work on every device, including mobile Safari.
const MAX_CHARS = 400_000;
const KINDS = new Set(["vorlesung", "uebung", "klausur", "other"]);

app.post("/api/documents/upload", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);

  // Dokumente sind nach Gesamtzahl begrenzt, nicht pro Monat: jedes Dokument
  // wird bei jeder Frage als Kontext mitgeschickt und treibt so dauerhaft die
  // Kosten. Geprüft VOR dem Hochladen und der Textextraktion.
  const docQuota = await canAddDocument(session.user.id);
  if (!docQuota.ok) return c.json(quotaError(docQuota), 402);

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: "invalid form data" }, 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "file required" }, 400);

  // Endung prüfen, bevor irgendetwas gelesen wird — eine .exe soll gar nicht
  // erst im Speicher landen.
  if (!isSupported(file.name)) {
    return c.json({ error: "unsupported_format" }, 415);
  }
  const ext = fileExtension(file.name);

  const rawTitle = String(form.get("title") ?? file.name)
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .slice(0, 300)
    .trim();
  const title = rawTitle || "Dokument";
  const kindInput = String(form.get("kind") ?? "other");
  const kind = KINDS.has(kindInput) ? kindInput : "other";
  const semesterIdInput = form.get("semesterId");
  const semesterId =
    typeof semesterIdInput === "string" && semesterIdInput.trim()
      ? semesterIdInput.trim()
      : null;

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength === 0) return c.json({ error: "empty file" }, 400);

  let extracted;
  try {
    extracted = await extractDocument(bytes, file.name);
  } catch (err) {
    if (err instanceof UnsupportedFormatError) {
      return c.json({ error: "unsupported_format" }, 415);
    }
    console.error("[upload] extraction failed", err);
    const detail = err instanceof Error ? err.message : String(err);
    return c.json({ error: "extraction_failed", detail: detail.slice(0, 300) }, 422);
  }

  const text = extracted.text.slice(0, MAX_CHARS);
  if (text.replace(/\[\[SEITE \d+\]\]/g, "").trim().length < 40) {
    return c.json({ error: "no_text" }, 422);
  }

  const id = crypto.randomUUID();

  // Originaldatei im Objektspeicher behalten, damit der Student die exakte
  // Quelle nachlesen kann (nicht nur den extrahierten Text). Die Endung steht
  // im Schlüssel — der Viewer erkennt daran, ob er die Datei anzeigen kann.
  // Best effort: schlägt der Speicher fehl, wird das Dokument trotzdem
  // gesichert, dann fehlt nur die Originalansicht.
  let fileKey: string | null = null;
  try {
    const key = `documents/${session.user.id}/${id}.${ext}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: storageMime(ext),
      }),
    );
    fileKey = key;
  } catch (err) {
    console.error("[upload] file storage failed", err);
  }

  await db.insert(document).values({
    id,
    userId: session.user.id,
    semesterId,
    title,
    kind: kind as "vorlesung" | "uebung" | "klausur" | "other",
    textContent: text,
    fileKey,
    pageCount: extracted.pageCount,
    charCount: text.length,
  });

  return c.json({ id, pageCount: extracted.pageCount, ocr: extracted.ocr });
});

export default app;
