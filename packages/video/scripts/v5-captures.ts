// Prises de vue de la campagne V5 « la pépite » : la VRAIE app filmée image par image (screencast Chrome) au format
// téléphone, avec un curseur visible. Serveur LOCAL de test (:4586, cine.db) + faux stockage (:4599), compte de démonstration.
//   Copier v5-captures.ts et v5-pdf.ts dans tred-perf/v5 (playwright y est installé), puis :
//   set -a; . ./demo.env; set +a; WSLENV=CINE_PASSWORD bun.exe v5/v5-captures.ts [nom…]
// Les réponses du tuteur sont simulées (même format que le vrai, écrites au fil de l'eau) : aucune clé de modèle en local.
// Tout le reste est l'app : import, vérification des citations, lecteur PDF, Lernprofil, plan sur 7 jours.
import { chromium, type Locator, type Page } from "playwright";
import { Database } from "bun:sqlite";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { strToU8, zipSync } from "C:/dev/tred-rdm/aerostudy-ai/node_modules/fflate/esm/browser.js";
import { DE_QUOTE, EN_QUOTE, notes80En, skript80, thermoDe, thermoEn, uebungDe } from "./v5-pdf";

const B = "http://localhost:4586";
const PASSWORD = process.env.CINE_PASSWORD;
if (!PASSWORD) throw new Error("CINE_PASSWORD manquant");
const DBFILE = "C:/Users/HP/AppData/Local/Temp/tred-perf/cine.db";
const OUT = "C:/Users/HP/AppData/Local/Temp/tred-perf/v5/frames/";
const AUDIO = "C:/Users/HP/AppData/Local/Temp/tred-perf/prod-test/3-voix.mp3";
const wanted = process.argv.slice(2);
const FPS = 30;
const VIEW = { width: 500, height: 889 };

/* ── Base de TEST ─────────────────────────────────────────────────────── */
const key = (s: string) => s.normalize("NFKC").toLocaleLowerCase("de").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function demoId(db: Database): string {
  const u = db.query("select id from user where email='demo@tred.test'").get() as { id: string } | null;
  if (!u) throw new Error("compte de démonstration introuvable");
  return u.id;
}
function resetDemo(opts: { professor: string; locale: string; dropDocs?: boolean }) {
  const db = new Database(DBFILE);
  const id = demoId(db);
  for (const t of ["chat_message", "chat_conversation", "usage_counter", ...(opts.dropDocs ? ["document"] : [])]) {
    try {
      db.run(`delete from ${t} where user_id=?`, [id]);
    } catch {
      /* table sans user_id */
    }
  }
  try {
    db.run("delete from rate_limit");
  } catch {
    /* pas de table de limites */
  }
  db.run("update user_access set professor_id=?, locale=? where user_id=?", [opts.professor, opts.locale, id]);
  db.close();
}
const hasDoc = (title: string) => {
  const db = new Database(DBFILE, { readonly: true });
  const row = db.query("select 1 from document where user_id=? and title=?").get(demoId(db), title);
  db.close();
  return Boolean(row);
};
/** Le Lernstand de l'étudiante de démonstration pour le plan : cinq concepts fragiles, tous écrits dans le Skript de 80 pages. */
function seedMastery(lang: "de" | "en" = "de") {
  const db = new Database(DBFILE);
  const id = demoId(db);
  const now = Date.now();
  db.run("delete from concept_mastery where user_id = ?", [id]);
  const english: [string, string, number, number, number, string][] = [
    ["Heat capacity", "Thermodynamics", 0.24, 5, 1, '{"einheit":3,"formel":1}'],
    ["Entropy", "Thermodynamics", 0.3, 4, 1, '{"begriff":2}'],
    ["Enthalpy", "Thermodynamics", 0.4, 3, 1, '{"formel":2}'],
    ["Cyclic process", "Thermodynamics", 0.45, 3, 1, '{"ansatz":1}'],
    ["Efficiency", "Thermodynamics", 0.52, 4, 2, '{"rechenfehler":2}'],
    ["First law", "Thermodynamics", 0.78, 6, 5, "{}"],
    ["Ideal gas", "Thermodynamics", 0.86, 7, 6, "{}"],
    ["Support reactions", "Engineering Mechanics", 0.82, 7, 6, "{}"],
    ["Deflection curve", "Engineering Mechanics", 0.66, 5, 3, '{"ansatz":1}'],
    ["Kirchhoff's current law", "Electrical Engineering", 0.9, 8, 8, "{}"],
    ["Equivalent resistance", "Electrical Engineering", 0.74, 5, 4, '{"rechenfehler":1}'],
  ];
  const rows: [string, string, number, number, number, string][] = lang === "en" ? english : [
    ["Wärmekapazität", "Thermodynamik", 0.24, 5, 1, '{"einheit":3,"formel":1}'],
    ["Entropie", "Thermodynamik", 0.3, 4, 1, '{"begriff":2}'],
    ["Enthalpie", "Thermodynamik", 0.4, 3, 1, '{"formel":2}'],
    ["Kreisprozess", "Thermodynamik", 0.45, 3, 1, '{"ansatz":1}'],
    ["Wirkungsgrad", "Thermodynamik", 0.52, 4, 2, '{"rechenfehler":2}'],
    ["Erster Hauptsatz", "Thermodynamik", 0.78, 6, 5, "{}"],
    ["Ideales Gas", "Thermodynamik", 0.86, 7, 6, "{}"],
    ["Auflagerreaktionen", "Technische Mechanik", 0.82, 7, 6, "{}"],
    ["Biegelinie", "Technische Mechanik", 0.66, 5, 3, '{"ansatz":1}'],
    ["Knotenregel", "Elektrotechnik", 0.9, 8, 8, "{}"],
    ["Ersatzwiderstand", "Elektrotechnik", 0.74, 5, 4, '{"rechenfehler":1}'],
  ];
  for (const [concept, topic, score, attempts, correct, errors] of rows) {
    db.run("insert into concept_mastery (id, user_id, concept, concept_key, topic, score, attempts, correct, error_patterns, last_seen, created_at) values (?,?,?,?,?,?,?,?,?,?,?)", [crypto.randomUUID(), id, concept, key(concept), topic, score, attempts, correct, errors, now, now]);
  }
  db.close();
}

/* ── Fichiers de démonstration ────────────────────────────────────────── */
const slide = (...texts: string[]) => strToU8(`<p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree>${texts.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join("")}</p:spTree></p:cSld></p:sld>`);
const pptx = () =>
  Buffer.from(
    zipSync({
      "[Content_Types].xml": strToU8("<Types/>"),
      ...Object.fromEntries(
        ["Statics: equilibrium of forces", "Free-body diagrams", "Support reactions", "Moments about a point", "Beams with point loads", "Distributed loads", "Internal forces", "Bending moment diagrams", "Trusses", "Method of joints", "Friction", "Summary"].map((title, i) => [`ppt/slides/slide${i + 1}.xml`, slide(`Engineering Mechanics 1 – Lecture 4`, title, "Draw the free body first, then write the equilibrium conditions.")]),
      ),
    }),
  );
const FILES = {
  pdfEn: { name: "Thermodynamics_Chapter_3.pdf", mimeType: "application/pdf", buffer: thermoEn() },
  pptxEn: { name: "Mechanics_Lecture_04.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", buffer: pptx() },
  pdfDe: { name: "Thermo_Kapitel_3.pdf", mimeType: "application/pdf", buffer: thermoDe() },
  pdf80: { name: "Thermodynamik_Skript.pdf", mimeType: "application/pdf", buffer: skript80() },
  pdf80En: { name: "Thermodynamics_Lecture_Notes.pdf", mimeType: "application/pdf", buffer: notes80En() },
  uebungDe: { name: "TM1_Uebungsblatt_05.pdf", mimeType: "application/pdf", buffer: uebungDe() },
};
type FileKey = keyof typeof FILES;

/* ── Les réponses du tuteur (simulées, format exact de l'app) ─────────── */
const ANSWERS = {
  proofEn: ['[[TAFEL schritt="From your script"]]', "[[OFFICIAL]]", "The **heat capacity** $C$ tells you how much heat a body must absorb for its temperature to rise by one kelvin:", "", "$$Q = C \\cdot \\Delta T$$", "", `[[QUELLE doc="Thermodynamics_Chapter_3" seite=12]]${EN_QUOTE}[[/QUELLE]]`, "[[/OFFICIAL]]", "[[/TAFEL]]"].join("\n"),
  proofDe: ['[[TAFEL schritt="Aus deinem Skript"]]', "[[OFFICIAL]]", "Die **Wärmekapazität** $C$ sagt, wie viel Wärme ein Körper aufnehmen muss, damit seine Temperatur um ein Kelvin steigt:", "", "$$Q = C \\cdot \\Delta T$$", "", `[[QUELLE doc="Thermo_Kapitel_3" seite=12]]${DE_QUOTE}[[/QUELLE]]`, "[[/OFFICIAL]]", "[[/TAFEL]]"].join("\n"),
  beamDe: [
    '[[TAFEL schritt="1 · Freischneiden"]]',
    "Balken der Länge $l$ auf zwei Stützen, Einzellast $F$ in der Mitte. Unbekannt sind die Auflagerkräfte $A$ und $B$.",
    "[[/TAFEL]]",
    '[[TAFEL schritt="2 · Momente um A"]]',
    "$$\\sum M_A = 0:\\quad B \\cdot l - F \\cdot \\frac{l}{2} = 0$$",
    "",
    "$$\\Rightarrow\\; B = \\frac{F}{2}$$",
    "[[/TAFEL]]",
    '[[TAFEL schritt="3 · Kräfte in z"]]',
    "$$\\sum F_z = 0:\\quad A + B - F = 0$$",
    "",
    "$$\\Rightarrow\\; A = \\frac{F}{2}$$",
    "[[/TAFEL]]",
    '[[TAFEL schritt="Ergebnis"]]',
    "Beide Lager tragen je die halbe Last: $A = B = \\frac{F}{2}$. Das passt zur Symmetrie – die Last sitzt genau in der Mitte.",
    "[[/TAFEL]]",
  ].join("\n"),
  summaryDe: [
    '[[TAFEL schritt="1 · Wärme und Arbeit"]]',
    "Wärme $Q$ und Arbeit $W$ sind die zwei Wege, auf denen ein System Energie austauscht.",
    "[[/TAFEL]]",
    '[[TAFEL schritt="2 · Erster Hauptsatz"]]',
    "$$\\Delta U = Q + W$$",
    "",
    "Energie geht nie verloren – sie wechselt nur die Form.",
    "[[/TAFEL]]",
    '[[TAFEL schritt="3 · Wärmekapazität"]]',
    "$$Q = C \\cdot \\Delta T$$",
    "",
    "Große Wärmekapazität: viel Wärme für wenig Temperaturänderung.",
    "[[/TAFEL]]",
    '[[TAFEL schritt="Merke"]]',
    "Drei Formeln, ein Gedanke: Erst die Energiebilanz, dann die Zahlen.",
    "[[/TAFEL]]",
  ].join("\n"),
  ohmEn: [
    '[[TAFEL schritt="1 · Given"]]',
    "A resistor of $R = 4\\,\\Omega$ is connected to $U = 12\\,\\mathrm{V}$. We want the current $I$.",
    "[[/TAFEL]]",
    '[[TAFEL schritt="2 · Ohm\'s law"]]',
    "$$U = R \\cdot I \\quad\\Rightarrow\\quad I = \\frac{U}{R}$$",
    "[[/TAFEL]]",
    '[[TAFEL schritt="3 · Result"]]',
    "$$I = \\frac{12\\,\\mathrm{V}}{4\\,\\Omega} = 3\\,\\mathrm{A}$$",
    "",
    "Check the unit: volt divided by ohm gives ampere.",
    "[[/TAFEL]]",
  ].join("\n"),
};

/* ── La vidéo explicative simulée (forme exacte de GET /api/video/:id) ── */
const scene = (stage: string, visual: string, cue: string, heading: string, voiceover: string, extra: Record<string, unknown> = {}) => ({
  kind: "explanation", stage, visual_cues: [cue], visual, steps: [], keywords: [], chart: null, image: null, heading, bullets: [], formula: "", sourceIndex: 1, quote: "", voiceover, sourceTitle: "", sourceKind: "document", ...extra,
});
const LESSON = {
  title: "Heat capacity, explained",
  language: "en",
  sourceTitle: "Thermodynamics_Chapter_3",
  scenes: [
    scene("hook", "question", "ask_question", "Why does water heat up so slowly?", "Why does a pot of water take so long to get hot?", { sourceKind: "analogy" }),
    scene("step", "highlight", "highlight_text", "What your script says", "Your script defines the heat capacity as the heat a body absorbs per kelvin.", { quote: EN_QUOTE, keywords: ["heat capacity", "kelvin"] }),
    scene("step", "formula", "write_equation", "The formula", "So the heat is simply the heat capacity times the temperature change.", { formula: "Q = C \\cdot \\Delta T", bullets: ["C in joule per kelvin"] }),
    scene("recap", "recap", "check_recap", "Remember", "Remember these three points.", { bullets: ["Heat capacity: heat per kelvin", "Q = C · ΔT", "Water: about 4.18 kJ/(kg K)"] }),
  ],
};
const SCENE_MS = 3400;
function lessonPayload(id: string, professor: string) {
  const words: { text: string; startMs: number; endMs: number }[] = [];
  LESSON.scenes.forEach((sc, i) => {
    const list = sc.voiceover.split(/\s+/);
    const each = (SCENE_MS - 400) / list.length;
    list.forEach((text, k) => words.push({ text, startMs: Math.round(i * SCENE_MS + 150 + k * each), endMs: Math.round(i * SCENE_MS + 150 + (k + 0.85) * each) }));
  });
  return {
    id, status: "done", title: LESSON.title, language: LESSON.language, durationMs: LESSON.scenes.length * SCENE_MS + 600, saved: false, createdAt: new Date().toISOString(),
    audioUrl: `/api/video/${id}/audio`,
    scenes: LESSON.scenes.map((sc) => ({ ...sc, sourceTitle: sc.sourceKind === "analogy" ? "" : LESSON.sourceTitle })),
    words, sceneStartsMs: LESSON.scenes.map((_, i) => i * SCENE_MS), professor, beam: null, backdrop: null,
  };
}

/* ── Le navigateur ────────────────────────────────────────────────────── */
// --force-device-scale-factor=2 : le screencast rend alors de VRAIS pixels (1000 × 1778) — sans lui, il donne 500 × 889
// quelle que soit l'échelle émulée, et le texte agrandi après coup est mou.
const b = await chromium.launch({ channel: "msedge", args: ["--force-device-scale-factor=2"] });
const login = await b.newContext();
const signIn = await login.request.post(`${B}/api/auth/sign-in/email`, { headers: { Origin: B, "Content-Type": "application/json" }, data: { email: "demo@tred.test", password: PASSWORD } });
if (!signIn.ok()) throw new Error(`connexion refusée (${signIn.status()})`);
const storageState = await login.storageState();
await login.close();

/** Le curseur : là où est la souris ; il se resserre et vire au jaune quand on appuie. */
let cur = { x: 250, y: 640 };
async function glide(p: Page, x: number, y: number, ms = 620) {
  const steps = Math.max(8, Math.round(ms / 16));
  const from = { ...cur };
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const k = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    await p.mouse.move(from.x + (x - from.x) * k, from.y + (y - from.y) * k);
    await p.waitForTimeout(16);
  }
  cur = { x, y };
}
async function tap(p: Page, target: Locator, opts: { ms?: number; dx?: number; dy?: number; hold?: number } = {}) {
  const box = await target.first().boundingBox();
  if (!box) throw new Error("cible introuvable pour le curseur");
  await glide(p, box.x + box.width / 2 + (opts.dx ?? 0), box.y + box.height / 2 + (opts.dy ?? 0), opts.ms);
  await p.waitForTimeout(200);
  await p.mouse.down();
  await p.waitForTimeout(opts.hold ?? 120);
  await p.mouse.up();
}
/** Défilement doux à la molette. */
async function wheel(p: Page, dy: number, ms: number) {
  const steps = Math.max(1, Math.round(ms / 16));
  for (let i = 0; i < steps; i++) {
    await p.mouse.wheel(0, dy / steps);
    await p.waitForTimeout(16);
  }
}
const skip = async (p: Page) => {
  const s = p.getByText(/Überspringen|^Skip/).first();
  if (await s.isVisible().catch(() => false)) await s.click();
};
const composer = (p: Page) => p.locator('[data-slot="chat-composer"] textarea, textarea').first();
const newChat = async (p: Page) => {
  await p.getByRole("button", { name: /Neuer Chat|New chat/ }).first().click().catch(() => {});
  await p.waitForTimeout(700);
};

interface Take {
  lang: "en" | "de";
  professor: string;
  /** La réponse que le tuteur écrira (simulée). Un tableau : une réponse par question, dans l'ordre. */
  answer?: string | string[];
  /** Repartir sans document. */
  dropDocs?: boolean;
  /** Documents à importer AVANT la prise (hors champ), s'ils n'y sont pas déjà. */
  needs?: FileKey[];
  mastery?: boolean | "en";
  /** Taille de la fenêtre (points CSS). Par défaut le format téléphone. */
  view?: { width: number; height: number };
  prepare: (p: Page) => Promise<void>;
  act: (p: Page, ctl: { video: (step: "voice" | "done") => void }) => Promise<void>;
}

async function film(name: string, take: Take) {
  if (wanted.length && !wanted.includes(name)) return;
  resetDemo({ professor: take.professor, locale: take.lang, dropDocs: take.dropDocs });
  if (take.mastery) seedMastery(take.mastery === "en" ? "en" : "de");
  const view = take.view ?? VIEW;
  const dir = `${OUT}${name}/`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const ctx = await b.newContext({ viewport: view, deviceScaleFactor: 2, locale: take.lang === "de" ? "de-DE" : "en-GB", timezoneId: "Europe/Berlin", storageState });
  await ctx.addInitScript(
    ({ lang, answers }) => {
      localStorage.setItem("tred.guide.v1", new Date().toISOString());
      localStorage.setItem("tred-analytics-consent", "denied");
      localStorage.setItem("tred-professor-autospeak", "0");
      localStorage.setItem("aerostudy-theme", JSON.stringify({ state: { theme: "dark" }, version: 1 }));
      localStorage.setItem("aerostudy-locale", JSON.stringify({ state: { locale: lang }, version: 0 }));
      localStorage.setItem("tred.chatRail.v2", "closed");

      // Le curseur visible.
      const mount = () => {
        if (document.getElementById("__tap") || !document.documentElement) return;
        const c = document.createElement("div");
        c.id = "__tap";
        c.style.cssText =
          "position:fixed;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(255,255,255,.28);border:2.5px solid rgba(255,255,255,.95);box-shadow:0 4px 18px rgba(0,0,0,.5);pointer-events:none;z-index:2147483647;transform:translate(-200px,-200px);transition:background .12s, box-shadow .3s";
        document.documentElement.appendChild(c);
        let x = -200;
        let y = -200;
        let down = false;
        const apply = () => {
          c.style.transform = `translate(${x}px,${y}px) scale(${down ? 0.7 : 1})`;
        };
        addEventListener("mousemove", (e) => { x = e.clientX; y = e.clientY; apply(); }, true);
        addEventListener("mousedown", () => { down = true; c.style.background = "rgba(234,179,8,.8)"; c.style.boxShadow = "0 4px 18px rgba(0,0,0,.5),0 0 0 16px rgba(234,179,8,.3)"; apply(); }, true);
        addEventListener("mouseup", () => { down = false; c.style.background = "rgba(255,255,255,.28)"; c.style.boxShadow = "0 4px 18px rgba(0,0,0,.5)"; apply(); }, true);
      };
      mount();
      addEventListener("DOMContentLoaded", mount);

      // Le tuteur : la réponse s'écrit au fil de l'eau, comme la vraie.
      if (answers.length) {
        let asked = 0;
        const orig = window.fetch.bind(window);
        window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
          if (!url.includes("/api/agent/messages")) return orig(input, init);
          const answer = answers[Math.min(asked++, answers.length - 1)]!;
          const sse = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
          const parts = [sse({ type: "start" }), sse({ type: "start-step" }), sse({ type: "text-start", id: "t1" })];
          for (let i = 0; i < answer.length; i += 6) parts.push(sse({ type: "text-delta", id: "t1", delta: answer.slice(i, i + 6) }));
          parts.push(sse({ type: "text-end", id: "t1" }), sse({ type: "finish-step" }), sse({ type: "finish" }), "data: [DONE]\n\n");
          const enc = new TextEncoder();
          const stream = new ReadableStream<Uint8Array>({
            async start(c) {
              await new Promise((r) => setTimeout(r, 650));
              for (const part of parts) {
                c.enqueue(enc.encode(part));
                await new Promise((r) => setTimeout(r, 42));
              }
              c.close();
            },
          });
          return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" } });
        };
      }
    },
    { lang: take.lang, answers: take.answer === undefined ? [] : Array.isArray(take.answer) ? take.answer : [take.answer] },
  );
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
  // Sans clé de modèle, le serveur local masque « Explain as video » : on l'affiche comme en production.
  await p.route("**/api/config", async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({ response: res, json: { ...body, features: { ...body.features, explainerVideo: true, quiz: true, flashcards: true } } });
  });
  const vid = `gv_v5_${name}`;
  let videoStep: "script" | "voice" | "done" = "script";
  await p.route("**/api/video/generate", (route) => route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ id: vid, status: "pending" }) }));
  await p.route(`**/api/video/${vid}`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(videoStep === "done" ? lessonPayload(vid, take.professor) : { id: vid, status: videoStep }) }));
  await p.route(`**/api/video/${vid}/audio`, (route) => route.fulfill({ status: 200, contentType: "audio/mpeg", body: readFileSync(AUDIO) }));
  await p.route(`**/api/video/${vid}/save`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));

  // Les documents dont la prise a besoin, importés hors champ (vrai import : texte extrait, original gardé).
  const missing = (take.needs ?? []).filter((k) => !hasDoc(FILES[k].name.replace(/\.[a-z]+$/, "")));
  if (missing.length) {
    await p.setViewportSize({ width: 1440, height: 900 });
    await p.goto(`${B}/chat`, { waitUntil: "networkidle" });
    await skip(p);
    await p.locator('input[type="file"]').first().setInputFiles(missing.map((k) => FILES[k]));
    await p.getByTestId("import-wait").waitFor({ timeout: 10000 });
    await p.getByTestId("import-wait").waitFor({ state: "detached", timeout: 90000 });
    await p.waitForTimeout(600);
    await p.setViewportSize(view);
  }

  cur = { x: 250, y: 640 };
  await take.prepare(p);
  await p.mouse.move(cur.x, cur.y);
  const cdp = await ctx.newCDPSession(p);
  const frames: { t: number; data: string }[] = [];
  cdp.on("Page.screencastFrame", (f) => {
    frames.push({ t: f.metadata.timestamp ?? Date.now() / 1000, data: f.data });
    void cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });
  await take.act(p, { video: (step) => (videoStep = step) });
  // Un écran immobile n'envoie plus d'image : la prise dure jusqu'à MAINTENANT, la dernière image tenue.
  const endT = Date.now() / 1000;
  await cdp.send("Page.stopScreencast");
  // Image par image à 30/s : à chaque instant, la dernière image reçue.
  const t0 = frames[0]!.t;
  const last = Math.max(frames[frames.length - 1]!.t, Math.min(endT, frames[frames.length - 1]!.t + 30));
  const total = Math.floor((last - t0) * FPS);
  let k = 0;
  for (let i = 0; i <= total; i++) {
    while (k + 1 < frames.length && frames[k + 1]!.t - t0 <= i / FPS) k += 1;
    writeFileSync(`${dir}${String(i).padStart(4, "0")}.jpg`, Buffer.from(frames[k]!.data, "base64"));
  }
  console.log(`${name} : ${frames.length} images reçues en ${(last - t0).toFixed(1)} s → ${total + 1} images à ${FPS}/s${errors.length ? ` | erreurs de page : ${errors.slice(0, 2).join(" | ")}` : ""}`);
  await ctx.close();
}

const openChat = async (p: Page) => {
  await p.goto(`${B}/chat`, { waitUntil: "networkidle" });
  await skip(p);
  await newChat(p);
};
async function askTyped(p: Page, question: string) {
  await tap(p, composer(p), { ms: 520 });
  await p.waitForTimeout(250);
  await p.keyboard.type(question, { delay: 34 });
  await p.waitForTimeout(350);
  await tap(p, p.getByTestId("send-button"), { ms: 380 });
}
/** La citation : on attend que le serveur l'ait vérifiée, on l'amène à l'écran, on appuie, le PDF s'ouvre à la page. */
async function openCitation(p: Page, holdMs: number) {
  const badge = p.getByTestId("citation-badge").first();
  await badge.waitFor({ timeout: 25000 });
  await p.waitForFunction(() => document.querySelector('[data-testid="citation-badge"]')?.getAttribute("data-status") !== "pending", null, { timeout: 15000 });
  await badge.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  await p.waitForTimeout(1300);
  await tap(p, badge, { ms: 700 });
  await p.getByTestId("pdf-viewer").waitFor({ timeout: 20000 });
  await p.waitForFunction(() => document.querySelector('[data-testid="pdf-viewer"]')?.getAttribute("data-ready") === "true", null, { timeout: 30000 });
  await p.getByTestId("pdf-mark").first().waitFor({ timeout: 8000 }).catch(() => {});
  await glide(p, 400, 760, 500);
  await p.waitForTimeout(holdMs);
}
/** Le panneau des documents, puis « Upload » : le sélecteur de fichiers reçoit les fichiers de démonstration. */
async function importOnScreen(p: Page, files: FileKey[], holdMs: number) {
  await tap(p, p.getByRole("button", { name: /Select a course|Kurs wählen/ }), { ms: 600 });
  await p.waitForTimeout(900);
  const upload = p.getByRole("button", { name: /Upload documents|Dokumente hochladen/ }).first();
  const chooser = p.waitForEvent("filechooser");
  await tap(p, upload, { ms: 650 });
  await (await chooser).setFiles(files.map((f) => FILES[f]));
  await p.getByTestId("import-wait").waitFor({ timeout: 10000 }).catch(() => {});
  await p.getByTestId("import-wait").waitFor({ state: "detached", timeout: 90000 }).catch(() => {});
  await p.waitForTimeout(holdMs);
}

/* ── EN 1 · The Proof ─────────────────────────────────────────────────── */
await film("en-proof", {
  lang: "en", professor: "genius", needs: ["pdfEn"], answer: ANSWERS.proofEn,
  prepare: openChat,
  act: async (p) => {
    await p.waitForTimeout(700);
    await askTyped(p, "What is heat capacity?");
    await openCitation(p, 3600);
  },
});

/* ── EN 2 · The Magic Video ───────────────────────────────────────────── */
await film("en-video", {
  lang: "en", professor: "genius", needs: ["pdfEn"], answer: ANSWERS.proofEn,
  prepare: async (p) => {
    await openChat(p);
    await composer(p).fill("What is heat capacity?");
    await composer(p).press("Enter");
    await p.getByTestId("citation-badge").first().waitFor({ timeout: 25000 });
    await p.waitForTimeout(2500);
    const chip = p.getByRole("button", { name: /Explain as video/ }).first();
    await chip.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await p.waitForTimeout(800);
  },
  act: async (p, ctl) => {
    await p.waitForTimeout(900);
    await tap(p, p.getByRole("button", { name: /Explain as video/ }), { ms: 800 });
    await p.waitForTimeout(1700);
    ctl.video("voice");
    await p.waitForTimeout(1900);
    ctl.video("done");
    await p.waitForTimeout(2800);
    const play = p.getByRole("button", { name: /Wiedergabe|Abspielen|Play/ }).first();
    if (await play.isVisible().catch(() => false)) await tap(p, play, { ms: 600 });
    await glide(p, 430, 820, 500);
    await p.waitForTimeout(12500);
  },
});

/* ── EN 3 · The University in your Pocket ─────────────────────────────── */
await film("en-import", {
  lang: "en", professor: "genius", dropDocs: true,
  prepare: openChat,
  act: async (p) => {
    await p.waitForTimeout(700);
    await importOnScreen(p, ["pdfEn", "pptxEn"], 2600);
  },
});
await film("en-profs", {
  lang: "en", professor: "genius",
  prepare: async (p) => {
    await p.goto(`${B}/professors`, { waitUntil: "networkidle" });
    await skip(p);
    await p.waitForTimeout(1200);
  },
  act: async (p) => {
    await p.waitForTimeout(600);
    await glide(p, 250, 560, 400);
    await wheel(p, 2900, 4200);
    await p.waitForTimeout(500);
    // On choisit le professeur dont la carte est à l'écran.
    const choose = p.getByRole("button", { name: /Choose|Select|Wählen/ });
    const visible = await choose.evaluateAll((els) => els.map((e, i) => ({ i, y: e.getBoundingClientRect().top })).filter((o) => o.y > 180 && o.y < 760).map((o) => o.i));
    if (visible.length) await tap(p, choose.nth(visible[0]!), { ms: 700 });
    await p.waitForTimeout(2200);
  },
});
await film("en-steps", {
  lang: "en", professor: "examiner", answer: ANSWERS.ohmEn,
  prepare: openChat,
  act: async (p) => {
    await p.waitForTimeout(600);
    await askTyped(p, "12 V across 4 ohms: what current flows?");
    await p.waitForTimeout(7500);
  },
});

/* ── DE 1 · Die Klausur-Rettung ───────────────────────────────────────── */
await film("de-import80", {
  lang: "de", professor: "genius", dropDocs: true,
  prepare: openChat,
  act: async (p) => {
    await p.waitForTimeout(700);
    await importOnScreen(p, ["pdf80"], 1100);
    // Un seul fichier : l'app l'ouvre et referme le panneau. On le rouvre pour voir la ligne « 80 Seiten ».
    await tap(p, p.getByRole("button", { name: /Select a course|Kurs wählen/ }), { ms: 600 });
    await p.waitForTimeout(900);
    await glide(p, 300, 190, 500);
    await p.waitForTimeout(2600);
  },
});
await film("de-plan", {
  lang: "de", professor: "genius", needs: ["pdf80"], mastery: true,
  prepare: async (p) => {
    await p.goto(`${B}/dashboard`, { waitUntil: "networkidle" });
    await skip(p);
    await p.getByTestId("lernprofil-section").waitFor({ timeout: 20000 });
    await p.getByTestId("lernprofil-section").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await p.mouse.move(250, 500);
    await p.mouse.wheel(0, -110);
    await p.waitForTimeout(1200);
  },
  act: async (p) => {
    await p.waitForTimeout(1300);
    await glide(p, 250, 520, 300);
    // Le profil défile jusqu'au bouton du plan.
    const button = p.getByTestId("plan-generate");
    for (let i = 0; i < 40; i++) {
      const box = await button.boundingBox();
      if (box && box.y < 620) break;
      await wheel(p, 150, 260);
    }
    await p.waitForTimeout(500);
    await tap(p, button, { ms: 650 });
    await p.getByTestId("plan-day").nth(6).waitFor({ timeout: 20000 });
    await p.waitForTimeout(1500);
    await glide(p, 250, 560, 300);
    await wheel(p, 1500, 6500);
    await p.waitForTimeout(1200);
  },
});

/* ── DE 2 · Der Tafel-Erklärer ────────────────────────────────────────── */
await film("de-tafel", {
  lang: "de", professor: "genius", answer: ANSWERS.beamDe,
  prepare: openChat,
  act: async (p) => {
    await p.waitForTimeout(600);
    await askTyped(p, "Balken mit Einzellast F in der Mitte: Wie groß sind die Auflagerkräfte?");
    await p.waitForTimeout(4200);
    // Le tableau se remplit : on le suit vers le bas.
    await glide(p, 250, 520, 300);
    await wheel(p, 900, 5200);
    await p.waitForTimeout(1500);
  },
});

/* ── DE 3 · Die perfekte Antwort ──────────────────────────────────────── */
await film("de-answer", {
  lang: "de", professor: "examiner", dropDocs: true, needs: ["pdfDe"], answer: ANSWERS.proofDe,
  prepare: openChat,
  act: async (p) => {
    await p.waitForTimeout(700);
    await askTyped(p, "Was ist die Wärmekapazität?");
    await openCitation(p, 3600);
  },
});

/* ══ Campagne V8 « six styles » — pilotes (2026-11-16) ══════════════════ */

/* EN 2 · documentaire : une fenêtre de navigateur étroite (600 × 860), l'import puis le plan sur 7 jours, en anglais. */
const WINDOW = { width: 600, height: 860 };
await film("en-doc-import", {
  lang: "en", professor: "genius", dropDocs: true, view: WINDOW,
  prepare: openChat,
  act: async (p) => {
    await p.waitForTimeout(700);
    await importOnScreen(p, ["pdf80En"], 1100);
    await tap(p, p.getByRole("button", { name: /Select a course|Kurs wählen/ }), { ms: 600 });
    await p.waitForTimeout(900);
    await glide(p, 330, 190, 500);
    await p.waitForTimeout(2600);
  },
});
await film("en-doc-plan", {
  lang: "en", professor: "genius", needs: ["pdf80En"], mastery: "en", view: WINDOW,
  prepare: async (p) => {
    await p.goto(`${B}/dashboard`, { waitUntil: "networkidle" });
    await skip(p);
    await p.getByTestId("lernprofil-section").waitFor({ timeout: 20000 });
    await p.getByTestId("lernprofil-section").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await p.mouse.move(300, 500);
    await p.mouse.wheel(0, -110);
    await p.waitForTimeout(1200);
  },
  act: async (p) => {
    await p.waitForTimeout(1300);
    await glide(p, 300, 520, 300);
    const button = p.getByTestId("plan-generate");
    for (let i = 0; i < 40; i++) {
      const box = await button.boundingBox();
      if (box && box.y < 600) break;
      await wheel(p, 150, 260);
    }
    await p.waitForTimeout(500);
    await tap(p, button, { ms: 650 });
    await p.getByTestId("plan-day").nth(6).waitFor({ timeout: 20000 });
    await p.waitForTimeout(1500);
    await glide(p, 300, 560, 300);
    await wheel(p, 1300, 6500);
    await p.waitForTimeout(1200);
  },
});

/* ══ Campagne V6 « StudyTok » (2026-11-17) ═════════════════════════════ */

/* EN 3 · le dialogue : la dérivée de x², puis « explain that like I'm 12 » — deux questions, deux réponses à la Tafel. */
await film("n-en-voice", {
  lang: "en", professor: "genius", dropDocs: true,
  answer: [
    ['[[TAFEL schritt="Derivative"]]', "$$\\frac{d}{dx}\\,x^2 = 2x$$", "", "The power rule: bring the exponent down, lower it by one.", "[[/TAFEL]]"].join("\n"),
    [
      '[[TAFEL schritt="1 · Picture a square"]]',
      "A square with side $x$ has the area $x^2$.",
      "[[/TAFEL]]",
      '[[TAFEL schritt="2 · Let it grow"]]',
      "Make each side a tiny bit longer. **Two thin strips** appear, each as long as the side $x$.",
      "[[/TAFEL]]",
      '[[TAFEL schritt="3 · The rate"]]',
      "$$\\text{growth of the area} \\approx 2 \\cdot x$$",
      "",
      "That rate is the derivative: $2x$.",
      "[[/TAFEL]]",
    ].join("\n"),
  ],
  prepare: openChat,
  act: async (p) => {
    await p.waitForTimeout(600);
    await askTyped(p, "What is the derivative of x²?");
    await p.waitForTimeout(4200);
    await askTyped(p, "Wait, explain that like I'm 12.");
    await p.waitForTimeout(9000);
  },
});

/* DE 1 · comédie : trois Skripte jetés d'un coup dans TRED, puis « das Wichtigste » en trois étapes avec Prof. Kazu. */
await film("de-import3", {
  lang: "de", professor: "trickster", dropDocs: true,
  prepare: openChat,
  act: async (p) => {
    await p.waitForTimeout(700);
    await importOnScreen(p, ["pdfDe", "pdf80", "uebungDe"], 2800);
  },
});
await film("de-summary", {
  lang: "de", professor: "trickster", needs: ["pdfDe"], answer: ANSWERS.summaryDe,
  prepare: openChat,
  act: async (p) => {
    await p.waitForTimeout(600);
    await askTyped(p, "Was ist das Wichtigste aus Kapitel 3?");
    await p.waitForTimeout(4600);
    await glide(p, 250, 520, 300);
    await wheel(p, 700, 4200);
    await p.waitForTimeout(1500);
  },
});

await b.close();
