/**
 * Mode socratique, côté navigateur : lire le compteur que le tuteur écrit en
 * dernière ligne de sa réponse, et ne jamais le montrer.
 *
 *   [[SOKRATES versuch=1 von=3]]   essais faits sur le problème en cours
 *   [[SOKRATES geloest]]           l'étudiant a trouvé seul
 *   [[SOKRATES aufgegeben]]        il a cliqué « Ich gebe auf »
 *
 * La consigne correspondante est dans api/lib/socratic.ts.
 */

export const SOCRATIC_MAX = 3;

export interface SocraticState {
  status: "open" | "solved" | "gave_up";
  /** Essais faits (0 à 3). */
  attempt: number;
  max: number;
}

const MARKER = /\[\[\s*SOKRATES\b([^\]]*)\]\]/gi;
/** Un marqueur encore en cours d'écriture, en fin de texte : « [[SOKR », « [[SOKRATES versuch=1 vo ». */
const PARTIAL = /\[\[?\s*S(?:O(?:K(?:R(?:A(?:T(?:E(?:S[^\]]*\]?)?)?)?)?)?)?)?$/i;

/** L'état annoncé par la réponse : le DERNIER marqueur compte. `null` s'il n'y en a pas. */
export function parseSocratic(text: string): SocraticState | null {
  let last: string | null = null;
  for (const m of text.matchAll(MARKER)) last = m[1] ?? "";
  if (last === null) return null;
  if (/aufgegeben/i.test(last)) return { status: "gave_up", attempt: SOCRATIC_MAX, max: SOCRATIC_MAX };
  if (/gel(?:oe|ö)st/i.test(last)) return { status: "solved", attempt: 0, max: SOCRATIC_MAX };
  const n = /versuch\s*=\s*(-?\d+)/i.exec(last);
  const attempt = Math.min(SOCRATIC_MAX, Math.max(0, n ? Number(n[1]) : 0));
  return { status: "open", attempt, max: SOCRATIC_MAX };
}

/** Le texte sans aucun marqueur socratique, complet ou en cours d'écriture. */
export function stripSocratic(text: string): string {
  if (!/\[\[?\s*S/i.test(text)) return text;
  return text.replace(MARKER, "").replace(PARTIAL, "").trimEnd();
}
