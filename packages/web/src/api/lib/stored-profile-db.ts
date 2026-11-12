/**
 * Lecture et écriture du profil d'études dans `user_access`.
 *
 * SQL DIRECT, et colonnes volontairement ABSENTES du schéma Drizzle
 * (database/schema.ts) : le code est déployé avant que le fondateur lance
 * migre-profil-complet.mjs. Déclarées dans le schéma, ces colonnes
 * entreraient dans chaque INSERT et chaque `select()` de `user_access` — une
 * table lue à CHAQUE requête — et plus rien ne passerait. Ici, une colonne
 * manquante donne simplement `migrated: false`.
 */
import { sql, type SQL } from "drizzle-orm";
import { DEFAULT_LEARNING_STYLE, isLearningStyle } from "./learning-style";
import { pickStudy, type ProfileUpdate, type StoredProfile } from "./stored-profile";

/** Ce dont on a besoin de la base : la vraie (libSQL) ou celle des tests, en mémoire. */
export interface ProfileDb {
  all: <T = unknown>(query: SQL) => Promise<T[]>;
  run: (query: SQL) => Promise<unknown>;
}

const NOT_MIGRATED: StoredProfile = {
  migrated: false,
  saved: false,
  profile: { degree: "", university: "", semester: "", studyLevel: "", learningStyle: DEFAULT_LEARNING_STYLE },
  updatedAt: null,
};

const missingColumn = (e: unknown) => /no such column|has no column/i.test(String((e as Error)?.message ?? e) + String((e as { cause?: unknown })?.cause ?? ""));

interface Row {
  studiengang: string | null;
  universitaet: string | null;
  semester: string | null;
  niveau: string | null;
  learning_style: string | null;
  profile_updated_at: number | null;
}

/** Le profil de CE compte. Ne lève jamais pour une migration manquante. */
export async function readStoredProfile(db: ProfileDb, userId: string): Promise<StoredProfile> {
  let rows: Row[];
  try {
    rows = await db.all<Row>(
      sql`SELECT studiengang, universitaet, semester, niveau, learning_style, profile_updated_at FROM user_access WHERE user_id = ${userId} LIMIT 1`,
    );
  } catch (e) {
    if (missingColumn(e)) return NOT_MIGRATED;
    throw e;
  }
  const r = rows[0];
  const updatedAt = r?.profile_updated_at == null ? null : Number(r.profile_updated_at);
  return {
    migrated: true,
    saved: updatedAt !== null,
    profile: {
      ...pickStudy({ degree: r?.studiengang, university: r?.universitaet, semester: r?.semester, studyLevel: r?.niveau }),
      learningStyle: isLearningStyle(r?.learning_style) ? r.learning_style : DEFAULT_LEARNING_STYLE,
    },
    updatedAt,
  };
}

/**
 * Enregistre le profil de CE compte (`WHERE user_id`), et de lui seul.
 * `input` a déjà été validé par `profileUpdateSchema`.
 */
export async function saveStoredProfile(db: ProfileDb, userId: string, input: ProfileUpdate, now = Date.now()): Promise<StoredProfile> {
  const seconds = Math.floor(now / 1000);
  try {
    // La ligne existe déjà presque toujours (créée par getAccess à la première requête).
    await db.run(sql`INSERT OR IGNORE INTO user_access (user_id, updated_at) VALUES (${userId}, ${seconds})`);
    await db.run(
      sql`UPDATE user_access SET studiengang = ${input.degree}, universitaet = ${input.university}, semester = ${input.semester},
            niveau = ${input.studyLevel}, profile_updated_at = ${now}, updated_at = ${seconds} WHERE user_id = ${userId}`,
    );
    if (input.learningStyle) {
      await db.run(sql`UPDATE user_access SET learning_style = ${input.learningStyle} WHERE user_id = ${userId}`);
    }
  } catch (e) {
    if (missingColumn(e)) return NOT_MIGRATED;
    throw e;
  }
  return readStoredProfile(db, userId);
}
