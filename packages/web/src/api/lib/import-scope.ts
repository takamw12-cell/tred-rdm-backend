import { and, eq } from "drizzle-orm";
import type { db as Database } from "../database";
import { subject } from "../database/schema";

/**
 * La portée d'un import (2026-11-15) : le semestre et le module (Fach) dans
 * lesquels le document est rangé.
 *
 * Le navigateur annonce le contexte choisi en haut du Hörsaal ; on le recoupe
 * avec ce que le compte possède :
 *
 *   - le module doit être à ce compte. Sinon le document est importé SANS
 *     module — pas refusé : un document non classé reste un document déposé ;
 *   - le semestre du MODULE fait foi. Un onglet resté sur un autre semestre ne
 *     range pas un document à cheval sur deux semestres, où ni la liste du
 *     semestre ni celle du module ne le montreraient.
 *
 * Sans module, rien ne change.
 */
export async function ownedImportScope(
  db: Pick<typeof Database, "select">,
  userId: string,
  scope: { semesterId: string | null; subjectId: string | null },
): Promise<{ semesterId: string | null; subjectId: string | null }> {
  if (!scope.subjectId) return { semesterId: scope.semesterId, subjectId: null };
  const [fach] = await db
    .select({ semesterId: subject.semesterId })
    .from(subject)
    .where(and(eq(subject.id, scope.subjectId), eq(subject.userId, userId)))
    .limit(1);
  if (!fach) return { semesterId: scope.semesterId, subjectId: null };
  return { semesterId: fach.semesterId, subjectId: scope.subjectId };
}
