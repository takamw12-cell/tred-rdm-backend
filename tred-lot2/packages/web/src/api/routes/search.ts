import { z } from "zod";
import { and, desc, eq, isNull, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { authed } from "../middleware/auth";
import { db } from "../database";
import {
  chatConversation,
  chatMessage,
  document,
  savedExercise,
} from "../database/schema";
import { fold, matches, scoreHit, snippet } from "../lib/search-text";

/**
 * Recherche globale : documents, conversations, exercices enregistrés.
 *
 * ── Pourquoi ce n'est pas un simple `LIKE %mot%` ──────────────────────────
 *
 * Deux contraintes se contredisent.
 *
 * 1. La comparaison doit être juste en allemand. SQLite ne replie pas la casse
 *    Unicode : « Übung » et « übung » y sont deux chaînes sans rapport. Seul
 *    TypeScript peut trancher (voir lib/search-text.ts).
 *
 * 2. On ne peut pas rapatrier le texte pour autant. Un polycopié fait des
 *    centaines de milliers de caractères ; en charger vingt à chaque frappe
 *    saturerait la mémoire du serveur et la facture Turso.
 *
 * D'où le partage : SQL trouve la POSITION du mot avec `instr()` et ne renvoie
 * qu'une fenêtre de 320 caractères autour (`substr`). TypeScript reçoit donc
 * quelques kilo-octets, pas quelques méga-octets, et c'est lui qui confirme la
 * correspondance et découpe l'extrait affiché.
 *
 * `instr()` étant sensible à la casse, on lui donne les quatre orthographes
 * courantes du mot cherché et on garde la première position non nulle.
 */

/** Fenêtre de texte renvoyée autour de la correspondance, en caractères. */
const WINDOW = 320;
const BEFORE = 120;

/** Nombre de lignes que SQL a le droit de remonter, par famille. */
const SQL_CAP = 12;

/**
 * `COALESCE(NULLIF(instr(col, v1),0), NULLIF(instr(col, v2),0), …)`
 *
 * Renvoie la position de la première orthographe trouvée, ou NULL si aucune.
 */
function firstPosition(col: SQLWrapper, variants: string[]): SQL<number | null> {
  const parts = variants.map(
    (v) => sql`NULLIF(instr(${col}, ${v}), 0)`,
  );

  // SQLite refuse `COALESCE()` avec un seul argument — l'erreur est fatale, la
  // requête entière échoue. Le cas n'a rien d'exotique : dès que les quatre
  // orthographes se confondent (un mot déjà tout en minuscules et sans
  // majuscule possible, un chiffre, un caractère isolé), il n'en reste qu'une.
  if (parts.length === 0) return sql<number | null>`NULL`;
  if (parts.length === 1) return sql<number | null>`${parts[0]}`;
  return sql<number | null>`COALESCE(${sql.join(parts, sql`, `)})`;
}

/** Fenêtre de texte centrée sur la position trouvée. */
function windowAround(col: SQLWrapper, pos: SQL<number | null>): SQL<string> {
  return sql<string>`substr(${col}, max(1, ${pos} - ${BEFORE}), ${WINDOW})`;
}

/**
 * Orthographes données à `instr()`.
 *
 * Volontairement NON échappées : `instr()` cherche une sous-chaîne littérale,
 * il n'y a pas de joker à neutraliser — contrairement à `LIKE`.
 */
function instrVariants(q: string): string[] {
  const base = q.trim();
  return [
    ...new Set([
      base,
      base.toLowerCase(),
      base.toUpperCase(),
      base.charAt(0).toUpperCase() + base.slice(1).toLowerCase(),
    ]),
  ].filter(Boolean);
}

export interface SearchHit {
  id: string;
  kind: "document" | "conversation" | "exercise";
  title: string;
  /** Extrait avec la correspondance, ou null si seul le titre correspond. */
  excerpt: string | null;
  /** Bornes du mot dans `excerpt`, pour le surligner. */
  from: number;
  to: number;
  /** Sous-titre : type de document, matière, date… */
  meta: string;
  semesterId: string | null;
  documentTitle?: string | null;
  score: number;
}

const input = z.object({
  q: z.string().max(120),
  /** Restreindre à un semestre. Absent = tout le compte. */
  semesterId: z.string().nullish(),
  /** Nombre de résultats par famille. */
  limit: z.number().int().min(1).max(20).optional(),
});

export const search = {
  all: authed.input(input).handler(async ({ input: inp, context }) => {
    const q = inp.q.trim();
    const empty = { documents: [], conversations: [], exercises: [], truncated: false };

    // Deux caractères minimum : en dessous, tout correspond et le résultat n'a
    // aucune valeur — autant ne pas interroger la base à chaque frappe.
    if (fold(q).length < 2) return empty;

    const userId = context.user.id;
    const limit = inp.limit ?? 6;
    const scope = inp.semesterId ?? null;
    const variants = instrVariants(q);
    const now = Date.now();
    const needle = fold(q);

    const ageDays = (d: Date | null | undefined): number =>
      d instanceof Date ? Math.max(0, (now - d.getTime()) / 86_400_000) : 999;

    /* ── Documents ───────────────────────────────────────────────────────── */

    const docFilters = [eq(document.userId, userId)];
    if (scope) docFilters.push(eq(document.semesterId, scope));

    // (a) Les titres : légers, on les compare tous en TypeScript — c'est le seul
    //     endroit où « ubung » sans tréma trouve « Übung ».
    const docTitles = await db
      .select({
        id: document.id,
        title: document.title,
        kind: document.kind,
        semesterId: document.semesterId,
        createdAt: document.createdAt,
      })
      .from(document)
      .where(and(...docFilters))
      .orderBy(desc(document.createdAt))
      .limit(500);

    // (b) Le corps : SQL localise, SQL découpe, on ne reçoit que la fenêtre.
    const docPos = firstPosition(document.textContent, variants);
    const docBodies = await db
      .select({
        id: document.id,
        window: windowAround(document.textContent, docPos),
      })
      .from(document)
      .where(and(...docFilters, sql`${docPos} IS NOT NULL`))
      .limit(SQL_CAP);

    const bodyById = new Map(docBodies.map((r) => [r.id, r.window]));

    const documents: SearchHit[] = [];
    for (const d of docTitles) {
      const titleHit = matches(d.title, q);
      const win = bodyById.get(d.id);
      const snip = win ? snippet(win, q) : null;
      if (!titleHit && !snip) continue;

      documents.push({
        id: d.id,
        kind: "document",
        title: d.title,
        excerpt: snip?.text ?? null,
        from: snip?.start ?? 0,
        to: snip?.end ?? 0,
        meta: d.kind,
        semesterId: d.semesterId,
        score: scoreHit({
          title: titleHit,
          exactTitle: fold(d.title) === needle,
          body: !!snip,
          ageDays: ageDays(d.createdAt),
        }),
      });
    }

    /* ── Conversations ───────────────────────────────────────────────────── */

    const convFilters = [
      eq(chatConversation.userId, userId),
      isNull(chatConversation.deletedAt),
    ];
    if (scope) convFilters.push(eq(chatConversation.semesterId, scope));

    const convs = await db
      .select({
        id: chatConversation.id,
        title: chatConversation.title,
        documentTitle: chatConversation.documentTitle,
        semesterId: chatConversation.semesterId,
        updatedAt: chatConversation.updatedAt,
      })
      .from(chatConversation)
      .where(and(...convFilters))
      .orderBy(desc(chatConversation.updatedAt))
      .limit(300);

    // Les messages sont joints à leur conversation pour que la propriété soit
    // vérifiée en SQL : une jointure oubliée ici exposerait les conversations
    // des autres.
    const msgPos = firstPosition(chatMessage.content, variants);
    const msgHits = await db
      .select({
        conversationId: chatMessage.conversationId,
        role: chatMessage.role,
        window: windowAround(chatMessage.content, msgPos),
      })
      .from(chatMessage)
      .innerJoin(
        chatConversation,
        eq(chatMessage.conversationId, chatConversation.id),
      )
      .where(and(...convFilters, sql`${msgPos} IS NOT NULL`))
      .orderBy(desc(chatMessage.createdAt))
      .limit(SQL_CAP * 3);

    // Un seul extrait par conversation : le plus récent, déjà en tête grâce au
    // tri ci-dessus.
    const msgById = new Map<string, { window: string; role: string }>();
    for (const m of msgHits) {
      if (!msgById.has(m.conversationId)) {
        msgById.set(m.conversationId, { window: m.window, role: m.role });
      }
    }

    const conversations: SearchHit[] = [];
    for (const c of convs) {
      const titleHit = matches(c.title, q);
      const hit = msgById.get(c.id);
      const snip = hit ? snippet(hit.window, q) : null;
      if (!titleHit && !snip) continue;

      conversations.push({
        id: c.id,
        kind: "conversation",
        title: c.title,
        excerpt: snip?.text ?? null,
        from: snip?.start ?? 0,
        to: snip?.end ?? 0,
        meta: hit?.role === "user" ? "frage" : "antwort",
        semesterId: c.semesterId,
        documentTitle: c.documentTitle,
        score: scoreHit({
          title: titleHit,
          exactTitle: fold(c.title) === needle,
          body: !!snip,
          ageDays: ageDays(c.updatedAt),
        }),
      });
    }

    /* ── Exercices enregistrés ───────────────────────────────────────────── */

    const exFilters = [eq(savedExercise.userId, userId)];
    if (scope) exFilters.push(eq(savedExercise.semesterId, scope));

    const exList = await db
      .select({
        id: savedExercise.id,
        title: savedExercise.title,
        subject: savedExercise.subject,
        chapter: savedExercise.chapter,
        mode: savedExercise.mode,
        semesterId: savedExercise.semesterId,
        createdAt: savedExercise.createdAt,
      })
      .from(savedExercise)
      .where(and(...exFilters))
      .orderBy(desc(savedExercise.createdAt))
      .limit(300);

    const exPos = firstPosition(savedExercise.statement, variants);
    const exBodies = await db
      .select({
        id: savedExercise.id,
        window: windowAround(savedExercise.statement, exPos),
      })
      .from(savedExercise)
      .where(and(...exFilters, sql`${exPos} IS NOT NULL`))
      .limit(SQL_CAP);

    const exById = new Map(exBodies.map((r) => [r.id, r.window]));

    const exercises: SearchHit[] = [];
    for (const e of exList) {
      // Matière et chapitre comptent comme un titre : c'est ainsi que
      // l'exercice est nommé dans l'historique.
      const label = [e.title, e.subject, e.chapter].filter(Boolean).join(" · ");
      const titleHit = matches(label, q);
      const win = exById.get(e.id);
      const snip = win ? snippet(win, q) : null;
      if (!titleHit && !snip) continue;

      exercises.push({
        id: e.id,
        kind: "exercise",
        title: e.title || label || "Übung",
        excerpt: snip?.text ?? null,
        from: snip?.start ?? 0,
        to: snip?.end ?? 0,
        meta: [e.mode, e.subject, e.chapter].filter(Boolean).join(" · "),
        semesterId: e.semesterId,
        score: scoreHit({
          title: titleHit,
          exactTitle: fold(e.title) === needle,
          body: !!snip,
          ageDays: ageDays(e.createdAt),
        }),
      });
    }

    const byScore = (a: SearchHit, b: SearchHit) => b.score - a.score;

    return {
      documents: documents.sort(byScore).slice(0, limit),
      conversations: conversations.sort(byScore).slice(0, limit),
      exercises: exercises.sort(byScore).slice(0, limit),
      // Vrai quand une famille a été tronquée : l'interface le dit, plutôt que
      // de laisser croire qu'il n'y a rien de plus.
      truncated:
        documents.length > limit ||
        conversations.length > limit ||
        exercises.length > limit,
    };
  }),
};
