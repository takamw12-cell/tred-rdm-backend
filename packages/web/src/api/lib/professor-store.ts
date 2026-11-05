import { eq } from "drizzle-orm";
import { db } from "../database";
import { userAccess } from "../database/schema";
import { DEFAULT_PROFESSOR, isProfessorId, type ProfessorId } from "./professors";

/**
 * Le professeur choisi, ou le professeur par défaut.
 *
 * Ne lève JAMAIS : si la colonne n'existe pas encore (code déployé avant
 * `migre-professeur.mjs`), le tuteur garde simplement le professeur par défaut.
 */
export async function readProfessor(userId: string): Promise<ProfessorId> {
  try {
    const rows = await db
      .select({ p: userAccess.professorId })
      .from(userAccess)
      .where(eq(userAccess.userId, userId))
      .limit(1);
    const p = rows[0]?.p;
    return isProfessorId(p) ? p : DEFAULT_PROFESSOR;
  } catch {
    return DEFAULT_PROFESSOR;
  }
}
