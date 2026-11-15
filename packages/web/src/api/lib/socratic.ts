/**
 * Le mode socratique (2026-11-15) : le meilleur tuteur est celui qui ne donne
 * pas la réponse.
 *
 * L'étudiant l'allume dans le Hörsaal. Tant qu'il est allumé :
 *
 *   - le tuteur ne donne JAMAIS le résultat final ni le corrigé ;
 *   - chaque réponse se termine par UNE question, puis il attend ;
 *   - à chaque essai manqué, un indice de plus en plus fort : niveau 1 (où
 *     regarder), niveau 2 (l'approche ou la formule), niveau 3 (l'étape
 *     suivante presque faite) ;
 *   - « Ich gebe auf » : le tour suivant, il donne la solution complète et
 *     ajoute une note — où ça a bloqué, et « relis ce chapitre demain ».
 *
 * ── Qui compte les essais ─────────────────────────────────────────────────
 *
 * Le tuteur, pas le navigateur : lui seul sait si le message est un essai sur
 * le même problème ou une nouvelle question. Il écrit le compteur en dernière
 * ligne de sa réponse — [[SOKRATES versuch=N von=3]] — et l'interface le lit
 * (web/lib/socratic.ts) pour afficher « Versuche : 1/3 ». Le marqueur n'est
 * jamais montré à l'étudiant.
 *
 * Module pur : pas de base, pas de réseau. La consigne est en allemand, comme
 * tout le prompt ; la langue de réponse reste celle de l'étudiant.
 */

export const SOCRATIC_MAX_ATTEMPTS = 3;

export interface SocraticFlags {
  on: boolean;
  /** L'étudiant a cliqué « Ich gebe auf » : ce tour-ci, la solution complète. */
  giveUp: boolean;
}

/** Les drapeaux du corps de la requête. Seul un vrai `true` compte ; pas d'abandon sans le mode. */
export function socraticFlags(body: unknown): SocraticFlags {
  const b = (body ?? {}) as { socratic?: unknown; socraticGiveUp?: unknown };
  const on = b.socratic === true;
  return { on, giveUp: on && b.socraticGiveUp === true };
}

const RULE = "═".repeat(59);

/** La consigne du mode. Liste vide quand il est éteint. */
export function socraticPromptLines(flags: SocraticFlags): string[] {
  if (!flags.on) return [];
  const header = [RULE, "NIVEAU 2d — SOKRATISCHER MODUS (von der Person eingeschaltet)", RULE];

  if (flags.giveUp) {
    return [
      ...header,
      "DIE PERSON HAT „ICH GEBE AUF“ GEDRÜCKT. Für DIESE Antwort gilt:",
      "- Gib jetzt die VOLLSTÄNDIGE Lösung, Schritt für Schritt, wie sonst auch.",
      "- Schließe mit einer pädagogischen Notiz in einem eigenen Schritt:",
      "  benenne genau die Stelle, an der es gehakt hat, und empfiehl in der",
      "  Antwortsprache:",
      "  „Hier hat es gehakt — lies dieses Kapitel morgen noch einmal.“",
      "  Nenne das Kapitel oder Dokument, wenn du es kennst.",
      "- Kein Vorwurf: Aufgeben nach echten Versuchen ist ein normaler Schritt.",
      "- Halte die Lücke fest, falls du das Werkzeug lernstand_melden hast.",
      "- Schreibe als ALLERLETZTE Zeile, allein auf der Zeile: [[SOKRATES aufgegeben]]",
      "",
    ];
  }

  return [
    ...header,
    "Die Person will die Lösung SELBST finden. Diese Regeln gehen dem",
    "Lernstil und der Rolle vor — nicht der Richtigkeit:",
    "",
    "- Gib NIE das Endergebnis, den fertigen Rechenweg oder eine Musterlösung",
    "  — auch nicht „zur Kontrolle“ und auch nicht auf Nachfrage. Dafür hat",
    "  die Person den Knopf „Ich gebe auf“.",
    "- Jede Antwort endet mit GENAU EINER Frage, die den nächsten Denkschritt",
    "  öffnet. Dann wartest du auf die Antwort.",
    "- Zähle die Versuche an der AKTUELLEN Aufgabe (ein Versuch = die Person",
    "  hat geantwortet, gerechnet oder eine Vermutung geäußert):",
    "    • vor dem ersten Versuch: nur die Frage, kein Hinweis.",
    "    • nach dem 1. falschen Versuch — HINWEIS STUFE 1, leicht: wohin schauen (welches Prinzip, welche Größe).",
    "    • nach dem 2. falschen Versuch — HINWEIS STUFE 2, mittel: der Ansatz oder die Formel, ohne Zahlen einzusetzen.",
    "    • nach dem 3. falschen Versuch — HINWEIS STUFE 3, stark: der nächste Schritt fast ausgeführt; das Endergebnis bleibt der Person.",
    "  Danach bleibst du bei Stufe 3 und zerlegst den Schritt weiter.",
    "- Stimmt ein Versuch: bestätige knapp, lass die Person begründen, und",
    "  geh zum nächsten Schritt — oder schließe ab, wenn die Aufgabe gelöst ist.",
    "- Beginnt die Person eine NEUE Aufgabe, beginnt die Zählung bei null.",
    "- Rechenwerkzeuge benutzt du still, um einen Versuch zu PRÜFEN; ihr",
    "  Ergebnis nennst du nicht.",
    "- Schreibe als ALLERLETZTE Zeile jeder Antwort, allein auf der Zeile, den",
    "  Zähler: [[SOKRATES versuch=N von=3]] (N = bisherige Versuche an dieser",
    "  Aufgabe, 0 bis 3). Hat die Person die Aufgabe selbst gelöst: [[SOKRATES geloest]]",
    "  Erwähne den Zähler nie im Text.",
    "",
  ];
}
