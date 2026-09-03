/**
 * La planification des révisions.
 *
 * ── Pourquoi ce fichier existe seul ───────────────────────────────────────
 *
 * Il ne touche ni la base ni la date du jour : on lui passe l'état d'une
 * lacune et un instant, il rend le prochain état. C'est ce qui le rend
 * testable sans base de données et sans attendre trois semaines.
 *
 * ── Ce qu'il répare ───────────────────────────────────────────────────────
 *
 * Jusqu'ici, « compris » clôturait une lacune pour toujours. Or comprendre une
 * fois n'est pas savoir dans trois semaines — c'est même le contraire du
 * problème que TRED prétend résoudre. L'app enregistrait ce que l'étudiant ne
 * savait pas, puis l'oubliait dès qu'il disait l'avoir compris.
 *
 * ── L'intervalle ──────────────────────────────────────────────────────────
 *
 * Il double à chaque réussite : 1, 2, 4, 8, 16, 32, 64 jours. C'est la forme
 * la plus simple de la répétition espacée, et la seule qu'on puisse expliquer
 * à un étudiant en une phrase. Les algorithmes à facteur de facilité (SM-2 et
 * ses descendants) gagnent quelques pour cent de rétention au prix d'un
 * comportement que personne ne peut prédire — mauvais échange pour une app où
 * la confiance compte plus que l'optimum.
 *
 * Un échec ramène à un jour. Pas à zéro : revoir la même notion dix minutes
 * après s'être trompé mesure la mémoire immédiate, pas l'apprentissage.
 *
 * ── Quand est-ce fini ─────────────────────────────────────────────────────
 *
 * Au-delà de soixante jours, la notion est acquise : l'étudiant l'a retrouvée
 * juste après deux mois sans la voir. La lacune passe alors en `resolved` et
 * cesse de revenir. Sans ce plafond, TRED harcèlerait indéfiniment quelqu'un
 * qui sait.
 */

/** Le premier intervalle, en jours. Aussi celui où l'on retombe après un échec. */
export const FIRST_INTERVAL_DAYS = 1;

/** Au-delà, la notion est considérée comme acquise. */
export const MASTERED_AFTER_DAYS = 60;

const DAY_MS = 86_400_000;

export interface Schedule {
  /** Jours jusqu'à la prochaine révision. */
  intervalDays: number;
  /** Quand la lacune redevient à réviser. */
  dueAt: Date;
  /** Combien de fois de suite l'étudiant a réussi. */
  reviews: number;
  /** `open` : à revoir. `resolved` : acquise, ne revient plus. */
  status: "open" | "resolved";
}

/**
 * Le premier rendez-vous, pris au moment où la lacune est détectée.
 *
 * Demain, pas dans une heure : l'étudiant vient d'avoir l'explication sous les
 * yeux. Le réinterroger tout de suite ne prouverait rien.
 */
export function firstSchedule(now: Date): Schedule {
  return {
    intervalDays: FIRST_INTERVAL_DAYS,
    dueAt: new Date(now.getTime() + FIRST_INTERVAL_DAYS * DAY_MS),
    reviews: 0,
    status: "open",
  };
}

/**
 * Le rendez-vous suivant, après une révision.
 *
 * @param current  l'état actuel — l'intervalle sert de base
 * @param ok       l'étudiant a-t-il retrouvé la notion ?
 * @param now      l'instant de la révision
 */
export function nextSchedule(
  current: Pick<Schedule, "intervalDays" | "reviews">,
  ok: boolean,
  now: Date,
): Schedule {
  if (!ok) {
    return {
      intervalDays: FIRST_INTERVAL_DAYS,
      dueAt: new Date(now.getTime() + FIRST_INTERVAL_DAYS * DAY_MS),
      // Le compteur repart à zéro : trois réussites suivies d'un échec ne
      // valent pas trois réussites.
      reviews: 0,
      status: "open",
    };
  }

  // `Math.max(1, …)` protège contre un intervalle absent ou nul en base — une
  // ligne écrite avant cette migration doublerait sinon éternellement zéro.
  const base = Math.max(FIRST_INTERVAL_DAYS, current.intervalDays || 0);
  const intervalDays = base * 2;
  const reviews = (current.reviews || 0) + 1;

  return {
    intervalDays,
    dueAt: new Date(now.getTime() + intervalDays * DAY_MS),
    reviews,
    status: intervalDays > MASTERED_AFTER_DAYS ? "resolved" : "open",
  };
}

/**
 * Combien de jours avant la prochaine révision, arrondi vers le haut.
 *
 * Sert au libellé « dans 4 jours ». Une lacune due maintenant rend 0.
 */
export function daysUntil(dueAt: Date, now: Date): number {
  return Math.max(0, Math.ceil((dueAt.getTime() - now.getTime()) / DAY_MS));
}
