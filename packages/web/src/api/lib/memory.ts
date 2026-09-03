import { and, asc, desc, eq, isNull, lte, or } from "drizzle-orm";
import { db } from "../database";
import { misconception } from "../database/schema";
import { firstSchedule, nextSchedule } from "./memory-schedule";
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
 * ── La mémoire est un CONFORT, jamais une dépendance ──────────────────────
 *
 * Toutes les fonctions ci-dessous sont enveloppées. Si la table n'existe pas
 * — migration pas encore lancée, base restaurée, environnement de test — une
 * exception ferait tomber /api/agent/messages, c'est-à-dire le CHAT ENTIER.
 * Un étudiant perdrait la fonction principale du produit à cause d'un
 * supplément. Inacceptable.
 *
 * Donc : on avale l'erreur, on la journalise UNE fois, et le tuteur repart
 * sans mémoire — exactement comme avant cette livraison. Le message dans les
 * journaux Railway dit quoi faire.
 *
 * ── Ce qu'on enregistre, et ce qu'on n'enregistre pas ─────────────────────
 *
 * PAS les erreurs de calcul, les fautes de frappe, les étourderies. Une
 * **lacune conceptuelle** : une idée fausse qui reviendra tant qu'elle n'aura
 * pas été corrigée. La distinction est portée par la description de l'outil
 * dans l'agent — c'est le modèle qui tranche, et la consigne est stricte,
 * parce qu'un profil rempli de bruit ne sert à rien.
 */

export interface Gap {
  id: string;
  topic: string;
  label: string;
  detail: string;
  timesSeen: number;
  firstSeen: Date;
  lastSeen: Date;
  /** Quand la lacune redevient à réviser. `null` = avant la planification. */
  dueAt: Date | null;
  /** Jours jusqu'à la prochaine révision. Double à chaque réussite. */
  intervalDays: number;
  /** Réussites consécutives. */
  reviews: number;
}

/**
 * Passe à `true` à la première erreur, et le reste pour la durée de vie de
 * l'instance : inutile de retenter une requête sur une table absente à chaque
 * message, et inutile de remplir les journaux de la même ligne.
 */
let disabled = false;

function memoryFailed(where: string, error: unknown): void {
  if (disabled) return;
  disabled = true;
  console.error(`[memory] désactivée pour cette instance — ${where}`, error);
  console.error(
    "[memory] table absente ? lance :  bun --env-file=.env migration-memoire.mjs",
  );
}

/** Les lacunes ouvertes, les plus tenaces d'abord. */
export async function openGaps(userId: string, limit = 8): Promise<Gap[]> {
  if (disabled) return [];

  try {
    const rows = await db
      .select()
      .from(misconception)
      .where(
        and(eq(misconception.userId, userId), eq(misconception.status, "open")),
      )
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
      dueAt: r.dueAt,
      intervalDays: r.intervalDays,
      reviews: r.reviews,
    }));
  } catch (error) {
    memoryFailed("openGaps", error);
    return [];
  }
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
  input: {
    topic: string;
    label: string;
    detail?: string;
    semesterId?: string | null;
  },
): Promise<{ repeat: boolean; timesSeen: number }> {
  const label = input.label.trim().slice(0, 160);
  if (!label || disabled) return { repeat: false, timesSeen: 0 };

  try {
    const existing = await db
      .select()
      .from(misconception)
      .where(
        and(eq(misconception.userId, userId), eq(misconception.status, "open")),
      )
      .limit(50);

    const match = existing.find((row) => sameGap(row.label, label));
    const now = new Date();

    if (match) {
      const timesSeen = match.timesSeen + 1;
      // Retrébucher sur la même notion est un échec de révision, même si la
      // question n'était pas posée comme telle : on remet le compteur à zéro
      // et l'échéance à demain.
      await db
        .update(misconception)
        .set({ timesSeen, lastSeen: now, ...nextSchedule(match, false, now) })
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
      timesSeen: 1,
      firstSeen: now,
      lastSeen: now,
      // Le premier rendez-vous : demain, pas dans une heure — l'explication
      // est encore sous ses yeux. Fournit aussi `status: "open"`, d'où
      // l'absence de ligne séparée.
      ...firstSchedule(now),
    });

    return { repeat: false, timesSeen: 1 };
  } catch (error) {
    memoryFailed("noteGap", error);
    return { repeat: false, timesSeen: 0 };
  }
}

/** Marque une lacune comme comblée. La ligne est gardée : l'historique compte. */
export async function resolveGap(
  userId: string,
  label: string,
): Promise<boolean> {
  if (disabled) return false;

  try {
    const rows = await db
      .select()
      .from(misconception)
      .where(
        and(eq(misconception.userId, userId), eq(misconception.status, "open")),
      )
      .limit(50);

    const match = rows.find((row) => sameGap(row.label, label));
    if (!match) return false;

    await db
      .update(misconception)
      .set({ status: "resolved", lastSeen: new Date() })
      .where(eq(misconception.id, match.id));

    return true;
  } catch (error) {
    memoryFailed("resolveGap", error);
    return false;
  }
}

/* ── La file de révision ─────────────────────────────────────────────────── */

/**
 * Les lacunes qu'il est temps de revoir.
 *
 * `dueAt IS NULL` est inclus volontairement : ce sont les lacunes enregistrées
 * avant que la planification existe. Sans cette clause, elles resteraient
 * invisibles pour toujours — un silence pire qu'une erreur.
 *
 * Tri par échéance croissante : la plus en retard passe la première. C'est
 * aussi celle que l'étudiant a le plus de risques d'avoir oubliée.
 */
export async function dueGaps(userId: string, limit = 5): Promise<Gap[]> {
  if (disabled) return [];

  try {
    const now = new Date();
    const rows = await db
      .select()
      .from(misconception)
      .where(
        and(
          eq(misconception.userId, userId),
          eq(misconception.status, "open"),
          or(isNull(misconception.dueAt), lte(misconception.dueAt, now)),
        ),
      )
      .orderBy(asc(misconception.dueAt), desc(misconception.timesSeen))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      topic: r.topic,
      label: r.label,
      detail: r.detail,
      timesSeen: r.timesSeen,
      firstSeen: r.firstSeen,
      lastSeen: r.lastSeen,
      dueAt: r.dueAt,
      intervalDays: r.intervalDays,
      reviews: r.reviews,
    }));
  } catch (error) {
    memoryFailed("dueGaps", error);
    return [];
  }
}

/**
 * Enregistre une révision et fixe le rendez-vous suivant.
 *
 * Le calcul est dans `memory-schedule.ts`, qui ne touche pas la base : cette
 * fonction ne fait que lire, appeler, écrire. C'est ce qui rend la règle
 * vérifiable sans base de données.
 *
 * La vérification du propriétaire est dans le `where` de la mise à jour, pas
 * dans un `if` après lecture : entre les deux, rien ne peut s'intercaler.
 */
export async function reviewGap(
  userId: string,
  id: string,
  ok: boolean,
): Promise<{ ok: true; dueAt: Date; status: string } | { ok: false }> {
  if (disabled) return { ok: false };

  try {
    const [row] = await db
      .select()
      .from(misconception)
      .where(and(eq(misconception.id, id), eq(misconception.userId, userId)))
      .limit(1);

    if (!row) return { ok: false };

    const now = new Date();
    const next = nextSchedule(row, ok, now);

    await db
      .update(misconception)
      .set({
        dueAt: next.dueAt,
        intervalDays: next.intervalDays,
        reviews: next.reviews,
        status: next.status,
        lastSeen: now,
        // Une révision ratée compte comme une rencontre de plus avec la
        // difficulté : c'est ce compteur qui distingue « distraction » de
        // « blocage réel », et il doit continuer de monter.
        timesSeen: ok ? row.timesSeen : row.timesSeen + 1,
      })
      .where(and(eq(misconception.id, id), eq(misconception.userId, userId)));

    return { ok: true, dueAt: next.dueAt, status: next.status };
  } catch (error) {
    memoryFailed("reviewGap", error);
    return { ok: false };
  }
}
