import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { db as Database } from "../database";
import { chatConversation, chatMessage, document, type ChatConversation, type ChatMessage } from "../database/schema";

/**
 * Sessions de chat isolées par document (2026-11-15).
 *
 * Une PORTÉE est soit un document, soit tout le reste (« Alle Materialien »,
 * par semestre). Chaque portée a sa session : la dernière conversation qui y a
 * été tenue. Cliquer un document dans « Meine Kurse » rouvre CETTE
 * conversation — jamais celle d'un autre document, jamais celle d'un autre
 * compte.
 *
 * Deux garanties vivent ici, côté serveur :
 *
 *   sessionForScope   lit la session d'une portée pour le compte de la session
 *                     HTTP. Le document doit être à ce compte ; sinon il ne
 *                     « revient pas avec un refus », il ne revient pas du tout
 *                     (même règle que lib/document-owner.ts).
 *   saveConversation  une conversation enregistrée sous un document y reste :
 *                     un envoi qui annonce une autre portée ne la déplace pas
 *                     (`scopeMismatch`). Un client en retard ne peut donc plus
 *                     ranger la suite d'une conversation du document A dans
 *                     l'historique du document B, ni dans la session globale.
 *
 * Rien n'est créé à la lecture : une portée sans conversation rend
 * `conversation: null`, le navigateur ouvre un tableau vide et n'enregistre
 * qu'au premier échange. Créer une ligne vide à chaque clic remplirait le
 * tiroir d'historique de conversations sans un mot.
 */

type Db = Pick<typeof Database, "select">;

export interface ChatScope {
  /** Le document de la session ; `null` = portée globale. */
  documentId: string | null;
  /** Ne compte que pour la portée globale : chaque semestre a la sienne. */
  semesterId?: string | null;
}

export interface ScopeSession {
  /** Le document, s'il est à ce compte. `null` : portée globale — ou document inconnu. */
  document: { id: string; title: string; semesterId: string | null } | null;
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

/** La session d'une portée : sa dernière conversation (hors corbeille) et ses messages. */
export async function sessionForScope(db: Db, userId: string, scope: ChatScope): Promise<ScopeSession> {
  let doc: ScopeSession["document"] = null;
  if (scope.documentId) {
    const rows = await db
      .select({ id: document.id, title: document.title, semesterId: document.semesterId })
      .from(document)
      .where(and(eq(document.id, scope.documentId), eq(document.userId, userId)))
      .limit(1);
    // Pas à ce compte, supprimé ou inventé : même réponse, et aucune conversation.
    if (!rows[0]) return NOTHING;
    doc = rows[0];
  }

  const mine = and(eq(chatConversation.userId, userId), isNull(chatConversation.deletedAt));
  const inScope = doc
    ? eq(chatConversation.documentId, doc.id)
    : and(isNull(chatConversation.documentId), scope.semesterId ? eq(chatConversation.semesterId, scope.semesterId) : isNull(chatConversation.semesterId));

  const [conversation] = await db.select().from(chatConversation).where(and(mine, inScope)).orderBy(desc(chatConversation.updatedAt)).limit(1);
  if (!conversation) return { document: doc, conversation: null, messages: [] };
  return { document: doc, conversation, messages: await conversationMessages(db, conversation.id) };
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
