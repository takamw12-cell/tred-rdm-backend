import { and, desc, eq } from "drizzle-orm";
import { db } from "../database";
import { misconception } from "../database/schema";
import { sameGap } from "./memory-text";

/**
 * La mémoire du tuteur.
 *
 * ── Ce que ça change ──────────────────────────────────────────────────────
 *
 * Jusqu'ici chaque conversation repartait de zéro. Un étudiant pouvait
 * confondre contrainte et déformation trois semaines de suite : à chaque fois
 * TRED corrigeait poliment, et à chaque fois il oubliait. C'est la différence
 * entre un assistant qui répond et un professeur qui suit quelqu'un.
 *
 * ── Ce qu'on enregistre, et ce qu'on n'enregistre pas ─────────────────────
 *
 * On n'enregistre PAS les erreurs de calcul, les fautes de frappe, les
 * étourderies. On enregistre une **lacune conceptuelle** : une idée fausse qui
 * reviendra tant qu'elle n'aura pas été corrigée. La distinction est portée par
 * la description de l'outil dans l'agent — c'est le modèle qui tranche, et la
 * consigne est stricte, parce qu'un profil rempli de bruit ne sert à rien.
 *
 * ── Pourquoi le dédoublonnage compte ──────────────────────────────────────
 *
 * Le modèle ne réécrira jamais deux fois exactement la même phrase. Sans
 * regroupement, « Verwechselt Spannung und Dehnung » et « verwechselt Spannung
 * mit Dehnung » deviendraient deux lacunes distinctes, et le compteur de
 * répétitions — le seul signal qui dit « celle-là est tenace » — ne monterait
 * jamais.
 */

export interface Gap {
  id: string;
  topic: string;
  label: string;
  detail: string;
  timesSeen: number;
  firstSeen: Date;
  lastSeen: Date;
}

/** Les lacunes ouvertes, les plus tenaces d'abord. */
export async function openGaps(
  userId: string,
  limit = 8,
): Promise<Gap[]> {
  const rows = await db
    .select()
    .from(misconception)
    .where(and(eq(misconception.userId, userId), eq(misconception.status, "open")))
    .orderBy(desc(misconception.timesSeen), desc(misconception.lastSeen))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    topic: r.topic,
    label: r.label,
    detail: r.detail,
    timesSeen: r.timesSeen,
    firstSeen: r.firstSeen,
    lastSeen: r.lastSeen,
  }));
}

/**
 * Enregistre une lacune, ou incrémente celle qui existe déjà.
 *
 * Renvoie `repeat: true` quand c'est une répétition — l'agent s'en sert pour
 * le dire à l'étudiant, ce qui est précisément le moment où la mémoire devient
 * visible et utile.
 */
export async function noteGap(
  userId: string,
  input: { topic: string; label: string; detail?: string; semesterId?: string | null },
): Promise<{ repeat: boolean; timesSeen: number }> {
  const label = input.label.trim().slice(0, 160);
  if (!label) return { repeat: false, timesSeen: 0 };

  const existing = await db
    .select()
    .from(misconception)
    .where(and(eq(misconception.userId, userId), eq(misconception.status, "open")))
    .limit(50);

  const match = existing.find((row) => sameGap(row.label, label));
  const now = new Date();

  if (match) {
    const timesSeen = match.timesSeen + 1;
    await db
      .update(misconception)
      .set({ timesSeen, lastSeen: now })
      .where(eq(misconception.id, match.id));
    return { repeat: true, timesSeen };
  }

  await db.insert(misconception).values({
    id: crypto.randomUUID(),
    userId,
    semesterId: input.semesterId ?? null,
    topic: input.topic.trim().slice(0, 80) || "Allgemein",
    label,
    detail: (input.detail ?? "").trim().slice(0, 500),
    status: "open",
    timesSeen: 1,
    firstSeen: now,
    lastSeen: now,
  });

  return { repeat: false, timesSeen: 1 };
}

/** Marque une lacune comme comblée. La ligne est gardée : l'historique compte. */
export async function resolveGap(userId: string, label: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(misconception)
    .where(and(eq(misconception.userId, userId), eq(misconception.status, "open")))
    .limit(50);

  const match = rows.find((row) => sameGap(row.label, label));
  if (!match) return false;

  await db
    .update(misconception)
    .set({ status: "resolved", lastSeen: new Date() })
    .where(eq(misconception.id, match.id));

  return true;
}

