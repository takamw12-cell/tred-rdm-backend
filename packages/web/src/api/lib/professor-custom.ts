import { eq } from "drizzle-orm";
import { db } from "../database";
import { professorCustom } from "../database/schema";
import { checkProfessorName } from "./professor-name";
import { isProfessorId, type ProfessorId } from "./professors";

/**
 * « Dein Professor » : le prénom et la voix que l'étudiant a choisis
 * (table `professor_custom`, migre-prof-perso.mjs). Rien de choisi = le nom et
 * la voix du professeur du vestiaire.
 *
 * À part de `user_access`, pour que tout ce qui lit cette table continue de
 * fonctionner avant la migration. Ne lève jamais en lecture : table absente =
 * pas de personnalisation.
 */
export interface ProfessorCustom {
  /** null = le nom du professeur choisi. */
  name: string | null;
  /** Une des 9 voix (identifiant du vestiaire) ; null = la voix du professeur choisi. */
  voice: ProfessorId | null;
}

export const NO_CUSTOM: ProfessorCustom = { name: null, voice: null };

export async function readProfessorCustom(userId: string): Promise<ProfessorCustom> {
  try {
    const [row] = await db.select({ name: professorCustom.name, voice: professorCustom.voice }).from(professorCustom).where(eq(professorCustom.userId, userId)).limit(1);
    if (!row) return NO_CUSTOM;
    // Relu à travers le filtre : un nom refusé depuis (liste allongée) n'est plus affiché.
    const name = row.name ? checkProfessorName(row.name) : null;
    return { name: name?.ok ? name.name : null, voice: isProfessorId(row.voice) ? row.voice : null };
  } catch {
    return NO_CUSTOM;
  }
}

export type SaveCustomResult = { ok: true; custom: ProfessorCustom } | { ok: false; reason: "too_short" | "too_long" | "characters" | "reserved" | "not_migrated" };

export async function saveProfessorCustom(userId: string, input: { name: string | null; voice: string | null }): Promise<SaveCustomResult> {
  let name: string | null = null;
  if (input.name !== null && input.name.trim() !== "") {
    const check = checkProfessorName(input.name);
    if (!check.ok) return { ok: false, reason: check.reason };
    name = check.name;
  }
  const voice = isProfessorId(input.voice) ? input.voice : null;
  try {
    await db
      .insert(professorCustom)
      .values({ userId, name, voice, updatedAt: new Date() })
      .onConflictDoUpdate({ target: professorCustom.userId, set: { name, voice, updatedAt: new Date() } });
  } catch (error) {
    if (/no such table/i.test(String((error as Error)?.message ?? error))) return { ok: false, reason: "not_migrated" };
    throw error;
  }
  return { ok: true, custom: { name, voice } };
}
