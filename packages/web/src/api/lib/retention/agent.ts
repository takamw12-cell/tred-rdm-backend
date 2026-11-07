/**
 * L'agent de rétention — la DÉCISION, et rien d'autre.
 *
 * Inspiré de la boucle de Harvey/Sellbird : un battement de cœur réveille
 * l'agent, il regarde l'état, prend UNE décision déterministe, et un humain
 * garde la main (l'étudiant accepte ou refuse, l'admin peut tout mettre en
 * pause). Ici : aucun modèle, aucun appel réseau, aucune base. Des règles
 * écrites, testées, qu'on peut lire à voix haute :
 *
 *   1. Au plus UNE notification par jour et par étudiant (jour de Berlin).
 *   2. Inactif depuis plus de 3 jours → relance (send_push_notification),
 *      avec un frein : pas deux relances à moins de 3 jours d'écart, plus
 *      rien après 3 relances sans retour, ni après 2 relances refusées en
 *      30 jours. Un étudiant inactif ne reçoit QUE la relance.
 *   3. Une lacune (échec à un exercice, notée par le tuteur) vieille de plus
 *      de 48 h, sans cartes ni proposition antérieure → proposer des
 *      Karteikarten (create_flashcard). L'étudiant accepte ou refuse.
 *   4. Des révisions dues aujourd'hui → le récapitulatif (send_daily_digest).
 *
 * Les lectures (scan.ts) et les écritures (store.ts) sont ailleurs : cette
 * fonction se teste avec des objets, sans rien simuler.
 */

export const INACTIVITY_DAYS = 3;
export const FAILED_EXERCISE_DELAY_HOURS = 48;
export const MAX_NOTIFICATIONS_PER_DAY = 1;
/** Écart minimal entre deux relances d'inactivité. */
export const NUDGE_COOLDOWN_DAYS = 3;
/** Après autant de relances restées sans retour, l'agent se tait. */
export const MAX_NUDGES_WITHOUT_RETURN = 3;
/** Après autant de relances refusées en 30 jours, l'agent se tait aussi. */
export const MAX_DISMISSED_NUDGES_30D = 2;

const DAY_MS = 24 * 60 * 60_000;
const HOUR_MS = 60 * 60_000;

export type RetentionActionKind = "send_push_notification" | "create_flashcard" | "send_daily_digest";
export const RETENTION_ACTIONS: readonly RetentionActionKind[] = ["send_push_notification", "create_flashcard", "send_daily_digest"];

export interface RetentionUser {
  id: string;
  /** de | en | fr | es ; tout le reste → de. */
  locale: string;
  createdAt: Date;
  /** Au moins un appareil mobile enregistré (Expo). Sinon : boîte de réception web seulement. */
  hasPush: boolean;
}

export interface FailedGap {
  id: string;
  topic: string;
  label: string;
  /** La dernière fois que l'étudiant a buté dessus. */
  lastSeen: Date;
}

export interface RetentionContext {
  now: Date;
  /** Dernière activité d'apprentissage (chat, carte révisée, lacune revue). null = jamais. */
  lastActivityAt: Date | null;
  /** Notifications de l'agent déjà envoyées aujourd'hui (Berlin). */
  notificationsToday: number;
  dueFlashcards: number;
  dueGaps: number;
  /** Lacunes ouvertes sans cartes et jamais proposées (filtrées par scan.ts). */
  failedGaps: FailedGap[];
  lastInactivityNudgeAt: Date | null;
  /** Relances d'inactivité envoyées depuis la dernière activité. */
  inactivityNudgesSinceActivity: number;
  /** Relances d'inactivité refusées (« Ausblenden ») ces 30 derniers jours. */
  dismissedNudges30d: number;
}

export interface RetentionMessage {
  title: string;
  body: string;
}

export type Decision =
  | { action: "none"; reason: string }
  | {
      action: RetentionActionKind;
      reason: string;
      /** push = mobile + boîte de réception ; inbox = boîte de réception seulement (web). */
      channel: "push" | "inbox";
      message: RetentionMessage;
      /** Où mène la notification : chemin web et écran mobile. */
      href: string;
      screen: string;
      gapId?: string;
      counts?: { flashcards: number; gaps: number };
    };

/* -------------------------------------------------------------------------- */
/* Textes                                                                     */
/* -------------------------------------------------------------------------- */

type Lang = "de" | "en" | "fr" | "es";
const langOf = (l: string): Lang => (["de", "en", "fr", "es"].includes(l) ? (l as Lang) : "de");

const TEXTS: Record<
  Lang,
  {
    nudgeTitle: string;
    nudgeDue: (n: number) => string;
    nudgeIdle: string;
    cardTitle: (label: string) => string;
    cardBody: (label: string, topic: string, days: number) => string;
    digestTitle: string;
    digestBody: (cards: number, gaps: number) => string;
  }
> = {
  de: {
    nudgeTitle: "Weiter geht's mit TRED",
    nudgeDue: (n) => (n === 1 ? "Eine Wiederholung wartet auf dich. Fünf Minuten reichen." : `${n} Wiederholungen warten auf dich. Fünf Minuten reichen für den Anfang.`),
    nudgeIdle: "Ein paar Tage Pause? Eine kurze Frage an TRED hält den Stoff frisch.",
    cardTitle: (label) => `Karteikarten zu „${label}“?`,
    cardBody: (label, topic, days) =>
      `Vor ${days} Tagen hat dich „${label}“ (${topic}) gebremst. Soll TRED dir drei Karteikarten dazu erstellen?`,
    digestTitle: "Deine Wiederholung für heute",
    digestBody: (c, g) => `Heute fällig: ${parts("de", c, g)}.`,
  },
  en: {
    nudgeTitle: "Pick up where you left off",
    nudgeDue: (n) => (n === 1 ? "One review is waiting. Five minutes is enough." : `${n} reviews are waiting. Five minutes is enough to start.`),
    nudgeIdle: "Taking a few days off? One quick question to TRED keeps the material fresh.",
    cardTitle: (label) => `Flashcards on “${label}”?`,
    cardBody: (label, topic, days) => `${days} days ago “${label}” (${topic}) slowed you down. Should TRED make you three flashcards on it?`,
    digestTitle: "Your review for today",
    digestBody: (c, g) => `Due today: ${parts("en", c, g)}.`,
  },
  fr: {
    nudgeTitle: "On reprend avec TRED ?",
    nudgeDue: (n) => (n === 1 ? "Une révision t'attend. Cinq minutes suffisent." : `${n} révisions t'attendent. Cinq minutes suffisent pour commencer.`),
    nudgeIdle: "Quelques jours de pause ? Une petite question à TRED garde la matière fraîche.",
    cardTitle: (label) => `Des Karteikarten sur « ${label} » ?`,
    cardBody: (label, topic, days) =>
      `Il y a ${days} jours, « ${label} » (${topic}) t'a freiné. TRED te prépare trois Karteikarten dessus ?`,
    digestTitle: "Ta révision du jour",
    digestBody: (c, g) => `À réviser aujourd'hui : ${parts("fr", c, g)}.`,
  },
  es: {
    nudgeTitle: "Sigue con TRED",
    nudgeDue: (n) => (n === 1 ? "Te espera un repaso. Cinco minutos bastan." : `Te esperan ${n} repasos. Cinco minutos bastan para empezar.`),
    nudgeIdle: "¿Unos días de pausa? Una pregunta rápida a TRED mantiene fresca la materia.",
    cardTitle: (label) => `¿Tarjetas sobre «${label}»?`,
    cardBody: (label, topic, days) => `Hace ${days} días «${label}» (${topic}) te frenó. ¿Te preparo tres tarjetas sobre ello?`,
    digestTitle: "Tu repaso de hoy",
    digestBody: (c, g) => `Para hoy: ${parts("es", c, g)}.`,
  },
};

function parts(lang: Lang, cards: number, gaps: number): string {
  const w = {
    de: [(n: number) => `${n} ${n === 1 ? "Karteikarte" : "Karteikarten"}`, (n: number) => `${n} ${n === 1 ? "Lücke" : "Lücken"}`, " und "],
    en: [(n: number) => `${n} ${n === 1 ? "flashcard" : "flashcards"}`, (n: number) => `${n} ${n === 1 ? "gap" : "gaps"}`, " and "],
    fr: [(n: number) => `${n} ${n === 1 ? "Karteikarte" : "Karteikarten"}`, (n: number) => `${n} ${n === 1 ? "lacune" : "lacunes"}`, " et "],
    es: [(n: number) => `${n} ${n === 1 ? "tarjeta" : "tarjetas"}`, (n: number) => `${n} ${n === 1 ? "laguna" : "lagunas"}`, " y "],
  }[lang] as [(n: number) => string, (n: number) => string, string];
  const out = [cards > 0 ? w[0](cards) : "", gaps > 0 ? w[1](gaps) : ""].filter(Boolean);
  return out.join(w[2]);
}

/* -------------------------------------------------------------------------- */
/* Décision                                                                   */
/* -------------------------------------------------------------------------- */

const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Une décision par étudiant et par cycle, toujours la même pour le même état.
 * `reason` est écrite pour l'admin (allemand, comme les pages admin).
 */
export function decideAction(user: RetentionUser, ctx: RetentionContext): Decision {
  const t = TEXTS[langOf(user.locale)];
  const channel = user.hasPush ? "push" : "inbox";
  const now = ctx.now.getTime();

  if (ctx.notificationsToday >= MAX_NOTIFICATIONS_PER_DAY) {
    return { action: "none", reason: `Tageslimit erreicht (${MAX_NOTIFICATIONS_PER_DAY} Benachrichtigung pro Tag)` };
  }

  const since = (ctx.lastActivityAt ?? user.createdAt).getTime();
  const inactiveDays = (now - since) / DAY_MS;
  const due = ctx.dueFlashcards + ctx.dueGaps;

  // 2. Inactivité : la relance, et seulement elle.
  if (inactiveDays > INACTIVITY_DAYS) {
    if (ctx.dismissedNudges30d >= MAX_DISMISSED_NUDGES_30D) {
      return { action: "none", reason: `${ctx.dismissedNudges30d} Erinnerungen in 30 Tagen abgelehnt — keine weitere` };
    }
    if (ctx.inactivityNudgesSinceActivity >= MAX_NUDGES_WITHOUT_RETURN) {
      return { action: "none", reason: `${ctx.inactivityNudgesSinceActivity} Erinnerungen ohne Rückkehr — Agent wartet` };
    }
    if (ctx.lastInactivityNudgeAt && now - ctx.lastInactivityNudgeAt.getTime() < NUDGE_COOLDOWN_DAYS * DAY_MS) {
      return { action: "none", reason: `Letzte Erinnerung vor weniger als ${NUDGE_COOLDOWN_DAYS} Tagen` };
    }
    return {
      action: "send_push_notification",
      reason: `Inaktiv seit ${Math.floor(inactiveDays)} Tagen${due > 0 ? `, ${due} fällig` : ""}`,
      channel,
      message: { title: t.nudgeTitle, body: due > 0 ? t.nudgeDue(due) : t.nudgeIdle },
      href: due > 0 ? "/flashcards" : "/dashboard",
      screen: due > 0 ? "review" : "home",
      counts: { flashcards: ctx.dueFlashcards, gaps: ctx.dueGaps },
    };
  }

  // 3. Échec à un exercice il y a plus de 48 h : proposer des cartes (la plus ancienne d'abord).
  const ripe = ctx.failedGaps
    .filter((g) => now - g.lastSeen.getTime() > FAILED_EXERCISE_DELAY_HOURS * HOUR_MS)
    .sort((a, b) => a.lastSeen.getTime() - b.lastSeen.getTime());
  if (ripe.length > 0) {
    const g = ripe[0];
    const days = Math.max(2, Math.floor((now - g.lastSeen.getTime()) / DAY_MS));
    const label = short(g.label);
    return {
      action: "create_flashcard",
      reason: `Lücke „${label}“ seit ${Math.floor((now - g.lastSeen.getTime()) / HOUR_MS)} h offen, noch keine Karten`,
      channel,
      message: { title: t.cardTitle(label), body: t.cardBody(label, short(g.topic, 40), days) },
      href: "/dashboard",
      screen: "home",
      gapId: g.id,
    };
  }

  // 4. Des révisions dues aujourd'hui : le récapitulatif.
  if (due > 0) {
    return {
      action: "send_daily_digest",
      reason: `${ctx.dueFlashcards} Karten und ${ctx.dueGaps} Lücken fällig`,
      channel,
      message: { title: t.digestTitle, body: t.digestBody(ctx.dueFlashcards, ctx.dueGaps) },
      href: "/flashcards",
      screen: "review",
      counts: { flashcards: ctx.dueFlashcards, gaps: ctx.dueGaps },
    };
  }

  return { action: "none", reason: "Nichts zu tun" };
}

/* -------------------------------------------------------------------------- */
/* Temps                                                                      */
/* -------------------------------------------------------------------------- */

const FUSEAU = "Europe/Berlin";

/** « 2026-11-07 » — le jour de Berlin, la base de la limite quotidienne. */
export function berlinDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function berlinHour(d: Date): number {
  return Number.parseInt(new Intl.DateTimeFormat("de-DE", { timeZone: FUSEAU, hour: "numeric", hour12: false }).format(d), 10);
}

/** Les notifications partent entre 9 h et 20 h à Berlin — jamais la nuit. */
export const SEND_WINDOW = { start: 9, end: 20 } as const;
export function inSendWindow(d: Date): boolean {
  const h = berlinHour(d);
  return h >= SEND_WINDOW.start && h < SEND_WINDOW.end;
}

/** Le battement est-il dû ? (dernier cycle + intervalle ≤ maintenant) */
export function cycleDue(lastRanAt: number, now: Date, intervalHours: number): boolean {
  return now.getTime() - lastRanAt >= intervalHours * HOUR_MS;
}

/** RETENTION_INTERVAL_HOURS, borné à 1 h … 7 j ; 12 h par défaut. */
export function intervalHoursFromEnv(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.min(168, Math.round(n)) : 12;
}
