import { eq } from "drizzle-orm";
import { db } from "../database";
import { userAccess } from "../database/schema";
import { isLearningStyle, type LearningStyle } from "./learning-style";

/**
 * Le style enregistré, ou `balanced`.
 *
 * Ne lève JAMAIS : si la colonne n'existe pas encore (code déployé avant
 * `migre-learning-style.mjs`), le tuteur répond comme avant au lieu de tomber.
 */
export async function readLearningStyle(userId: string): Promise<LearningStyle> {
  try {
    const rows = await db
      .select({ s: userAccess.learningStyle })
      .from(userAccess)
      .where(eq(userAccess.userId, userId))
      .limit(1);
    const s = rows[0]?.s;
    return isLearningStyle(s) ? s : "balanced";
  } catch {
    return "balanced";
  }
}
