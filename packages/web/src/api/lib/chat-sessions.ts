import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { db as Database } from "../database";
import { chatConversation, chatMessage, document, type ChatConversation, type ChatMessage } from "../database/schema";

/**
 * Sessions de chat isolées par portée (2026-11-15).
 *
 * Une PORTÉE est, du plus étroit au plus large :
 *
 *   un document      la session du document ;
 *   un Fach (module) la session du module, pour un semestre ;
 *   tout le reste    « Ganzes Semester » / « Alle Materialien », par semestre.
 *
 * Chaque portée a sa session : la dernière conversation qui y a été tenue.
 * Ouvrir une portée rouvre CETTE conversation — jamais celle d'une autre
 * portée, jamais celle d'un autre compte.
 *
 * Trois garanties vivent ici, côté serveur :
 *
 *   sessionForScope   lit la session d'une portée pour le compte de la session
 *                     HTTP. Le document doit être à ce compte ; sinon il ne
 *                     « revient pas avec un refus », il ne revient pas du tout
 *                     (même règle que lib/document-owner.ts).
 *   saveConversation  une conversation enregistrée garde SA portée : un envoi
 *                     qui en annonce une autre ne la déplace pas
 *                     (`scopeMismatch`). Un client en retard ne peut donc plus
 *                     ranger la suite d'une conversation du document A dans
 *                     l'historique du document B, ni d'un module dans l'autre.
 *   rien n'est créé à la lecture : une portée sans conversation rend
 *                     `conversation: null`, le navigateur ouvre un tableau
 *                     vide et n'enregistre qu'au premier échange.
 *
 * ── Le module d'une conversation : une colonne hors schéma ───────────────
 *
 * `chat_conversation.subject_id` est ajoutée par migre-documents-contexte.mjs
 * et n'est PAS déclarée dans database/schema.ts : Drizzle lirait cette colonne
 * à chaque requête, et tant que le script n'a pas tourné TOUTES les lectures
 * de conversations tomberaient (« no such column »). On la lit et l'écrit donc
 * en SQL direct, et chaque accès tolère son absence :
 *
 *   - un module demandé → pas de reprise, tableau vide (on ne sait pas sous
 *     quel module une conversation a été tenue) ;
 *   - « Ganzes Semester » → comme avant ;
 *   - l'enregistrement fonctionne, sans module.
 */

type Db = Pick<typeof Database, "select">;
/** Lecture / écriture en SQL direct — seulement pour la colonne hors schéma. */
interface RawDb {
  all: <T = unknown>(query: ReturnType<typeof sql>) => Promise<T[]>;
  run: (query: ReturnType<typeof sql>) => Promise<unknown>;
}
const raw = (db: unknown) => db as RawDb;

const missingColumn = (e: unknown) =>
  /no such column|has no column/i.test(String((e as Error)?.message ?? e) + String((e as { cause?: unknown })?.cause ?? ""));

let warned = false;
function warnOnce() {
  if (warned) return;
  warned = true;
  console.warn("[chats] colonne subject_id absente de chat_conversation — lancer migre-documents-contexte.mjs");
}

export interface ChatScope {
  /** Le document de la session ; `null` = pas de document. */
  documentId: string | null;
  /** Ne comptent que sans document : chaque semestre, et chaque module, a sa session. */
  semesterId?: string | null;
  subjectId?: string | null;
}

export interface ScopeSession {
  /** Le document, s'il est à ce compte. `null` : pas de document demandé — ou document inconnu. */
  document: { id: string; title: string; semesterId: string | null; subjectId: string | null } | null;
  conversation: ChatConversation | null;
  messages: ChatMessage[];
}

const NOTHING: ScopeSession = { document: null, conversation: null, messages: [] };

/**
 * Les messages d'une conversation, dans l'ordre où ils ont été écrits.
 *
 * `created_at` est en SECONDES : tous les messages d'un enregistrement tombent
 * dans la même seconde. Le numéro de ligne (ordre d'insertion) départage.
 */
export function conversationMessages(db: Db, conversationId: string): Promise<ChatMessage[]> {
  return db
    .select()
    .from(chatMessage)
    .where(eq(chatMessage.conversationId, conversationId))
    .orderBy(asc(chatMessage.createdAt), sql`rowid`);
}

/**
 * La dernière conversation SANS document d'un semestre, pour un module donné
 * (`null` = « Ganzes Semester » : celles qui n'ont pas de module).
 * Colonne absente : `undefined` — à l'appelant de se rabattre.
 */
async function latestWithoutDocument(db: Db, userId: string, semesterId: string | null, subjectId: string | null): Promise<string | null | undefined> {
  try {
    const rows = await raw(db).all<{ id: string }>(sql`
      SELECT id FROM chat_conversation
       WHERE user_id = ${userId} AND deleted_at IS NULL AND document_id IS NULL
         AND semester_id IS ${semesterId} AND subject_id IS ${subjectId}
       ORDER BY updated_at DESC LIMIT 1`);
    return rows[0]?.id ?? null;
  } catch (error) {
    if (!missingColumn(error)) throw error;
    warnOnce();
    return undefined;
  }
}

/** La session d'une portée : sa dernière conversation (hors corbeille) et ses messages. */
export async function sessionForScope(db: Db, userId: string, scope: ChatScope): Promise<ScopeSession> {
  const mine = and(eq(chatConversation.userId, userId), isNull(chatConversation.deletedAt));
  let doc: ScopeSession["document"] = null;
  let conversation: ChatConversation | undefined;

  if (scope.documentId) {
    const rows = await db
      .select({ id: document.id, title: document.title, semesterId: document.semesterId, subjectId: document.subjectId })
      .from(document)
      .where(and(eq(document.id, scope.documentId), eq(document.userId, userId)))
      .limit(1);
    // Pas à ce compte, supprimé ou inventé : même réponse, et aucune conversation.
    if (!rows[0]) return NOTHING;
    doc = rows[0];
    [conversation] = await db.select().from(chatConversation).where(and(mine, eq(chatConversation.documentId, doc.id))).orderBy(desc(chatConversation.updatedAt)).limit(1);
  } else {
    const semesterId = scope.semesterId ?? null;
    const subjectId = scope.subjectId ?? null;
    const id = await latestWithoutDocument(db, userId, semesterId, subjectId);
    if (id === undefined) {
      // Migration pas encore lancée. Un module : on ne reprend rien. Sinon, comme avant.
      if (subjectId) return NOTHING;
      [conversation] = await db
        .select()
        .from(chatConversation)
        .where(and(mine, isNull(chatConversation.documentId), semesterId ? eq(chatConversation.semesterId, semesterId) : isNull(chatConversation.semesterId)))
        .orderBy(desc(chatConversation.updatedAt))
        .limit(1);
    } else if (id) {
      [conversation] = await db.select().from(chatConversation).where(and(mine, eq(chatConversation.id, id))).limit(1);
    }
  }

  if (!conversation) return { document: doc, conversation: null, messages: [] };
  return { document: doc, conversation, messages: await conversationMessages(db, conversation.id) };
}

/**
 * Sous quel module chaque conversation de ce compte a été tenue (celles qui en
 * ont un). Colonne absente : carte vide.
 */
export async function conversationSubjects(db: Db, userId: string): Promise<Map<string, string>> {
  try {
    const rows = await raw(db).all<{ id: string; subject_id: string }>(sql`
      SELECT id, subject_id FROM chat_conversation WHERE user_id = ${userId} AND subject_id IS NOT NULL`);
    return new Map(rows.map((r) => [r.id, r.subject_id]));
  } catch (error) {
    if (!missingColumn(error)) throw error;
    warnOnce();
    return new Map();
  }
}

/**
 * Vrai si l'enregistrement déplacerait une conversation existante vers une
 * autre portée (autre document, ou document ↔ global). Première sauvegarde :
 * rien à comparer.
 */
export function scopeMismatch(existing: { documentId: string | null } | null | undefined, incoming: { documentId?: string | null }): boolean {
  if (!existing) return false;
  return (existing.documentId ?? null) !== (incoming.documentId ?? null);
}

export interface SaveConversationInput {
  id: string;
  title?: string;
  semesterId?: string | null;
  /** Le module sous lequel la conversation est tenue — ignoré quand un document fait la portée. */
  subjectId?: string | null;
  documentId?: string | null;
  documentTitle?: string | null;
  lang?: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

/**
 * Enregistre une conversation : la crée, ou remplace ses messages par
 * l'instantané reçu (le navigateur choisit l'identifiant, l'opération est
 * idempotente).
 *
 * Une conversation déjà enregistrée garde SA portée. Si l'envoi en annonce une
 * autre, le document, son titre et le semestre d'origine restent — on ne
 * refuse pas : l'app mobile rouvre une conversation depuis l'historique sans
 * son document, et un refus lui ferait perdre la suite de l'échange.
 * `scopeKept` le signale à la route, qui le note dans les journaux.
 * Le module, lui, n'est écrit qu'à la création : il ne change jamais ensuite.
 */
export async function saveConversation(
  db: Pick<typeof Database, "select" | "insert" | "update" | "delete">,
  userId: string,
  input: SaveConversationInput,
  now: Date = new Date(),
): Promise<{ id: string; scopeKept: boolean }> {
  const [existing] = await db
    .select({ userId: chatConversation.userId, documentId: chatConversation.documentId, documentTitle: chatConversation.documentTitle })
    .from(chatConversation)
    .where(eq(chatConversation.id, input.id))
    .limit(1);
  // L'identifiant d'une conversation d'un autre compte : on n'y écrit pas, et
  // on n'efface surtout pas ses messages.
  if (existing && existing.userId !== userId) throw new Error("NOT_OWNER");

  const title = (input.title?.trim() || "Neue Unterhaltung").slice(0, 200);
  const scopeKept = scopeMismatch(existing, input);

  if (existing) {
    await db
      .update(chatConversation)
      .set({
        title,
        lang: input.lang ?? "de",
        updatedAt: now,
        ...(scopeKept
          ? {}
          : {
              semesterId: input.semesterId ?? null,
              documentId: input.documentId ?? null,
              // Un envoi sans titre de document n'efface pas celui qu'on connaît.
              documentTitle: input.documentTitle ?? existing.documentTitle ?? null,
            }),
      })
      .where(and(eq(chatConversation.id, input.id), eq(chatConversation.userId, userId)));
  } else {
    await db.insert(chatConversation).values({
      id: input.id,
      userId,
      title,
      semesterId: input.semesterId ?? null,
      documentId: input.documentId ?? null,
      documentTitle: input.documentTitle ?? null,
      lang: input.lang ?? "de",
      createdAt: now,
      updatedAt: now,
    });
    // Le module : seulement à la création, et seulement sans document.
    if (input.subjectId && !input.documentId) {
      try {
        await raw(db).run(sql`UPDATE chat_conversation SET subject_id = ${input.subjectId} WHERE id = ${input.id} AND user_id = ${userId}`);
      } catch (error) {
        if (!missingColumn(error)) throw error;
        warnOnce();
      }
    }
  }

  // Replace messages wholesale — snapshot semantics keep it simple.
  await db.delete(chatMessage).where(eq(chatMessage.conversationId, input.id));
  if (input.messages.length > 0) {
    const base = now.getTime();
    await db.insert(chatMessage).values(
      input.messages.map((m, i) => ({
        id: crypto.randomUUID(),
        conversationId: input.id,
        role: m.role,
        content: m.content,
        // Preserve order via monotonically increasing timestamps.
        createdAt: new Date(base + i),
      })),
    );
  }
  return { id: input.id, scopeKept };
}
