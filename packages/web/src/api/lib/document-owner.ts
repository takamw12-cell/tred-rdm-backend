import { and, eq } from "drizzle-orm";
import type { db as Database } from "../database";
import { document } from "../database/schema";
import type { OwnedFile } from "./document-stream";

/**
 * L'original d'un document, SI ce compte en est le propriétaire.
 *
 * La requête filtre sur l'identifiant ET sur le compte. Un document qui
 * appartient à quelqu'un d'autre ne « revient pas avec un refus » : il ne
 * revient pas du tout, exactement comme un identifiant inventé.
 */
export async function ownedDocumentFile(db: Pick<typeof Database, "select">, documentId: string, userId: string): Promise<OwnedFile | null> {
  const rows = await db
    .select({ fileKey: document.fileKey, title: document.title })
    .from(document)
    .where(and(eq(document.id, documentId), eq(document.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}
