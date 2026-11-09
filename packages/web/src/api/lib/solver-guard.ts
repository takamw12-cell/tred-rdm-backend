/**
 * Garde des solveurs : un solveur qui plante ne casse JAMAIS la réponse.
 *
 * Sans garde, une exception dans `execute` (division par zéro mal gérée,
 * entrée inattendue, bug) remontait comme une erreur d'outil brute : selon le
 * cas, l'étudiant voyait une réponse vide ou un message technique. Avec la
 * garde, le modèle reçoit un résultat propre ({ ok: false }) et une consigne :
 * le dire honnêtement, puis expliquer la théorie — sans inventer de chiffre.
 *
 * L'interface lit déjà `output.ok` avant d'afficher un résultat de solveur
 * (lib/solver-charts.ts, lib/beam-svg.ts) : un échec n'y affiche rien.
 *
 * Module pur, testé dans tests/solver-guard.test.ts.
 */

export interface SolverFailure {
  ok: false;
  solver: string;
  fehler: "solver_ausgefallen";
  /** Consigne pour le modèle (langue du prompt), pas un texte pour l'étudiant. */
  anweisung: string;
}

export const SOLVER_FAILURE_INSTRUCTION =
  "Der Rechner ist bei dieser Eingabe ausgefallen. Sag der Person ehrlich in IHRER Sprache sinngemäß: " +
  "„Ich kann das gerade nicht berechnen — hier ist die theoretische Erklärung.“ Erkläre dann den Lösungsweg " +
  "theoretisch (Ansatz, Formeln, Schritte) und erfinde KEIN Zahlenergebnis. Ruf denselben Rechner mit derselben " +
  "Eingabe nicht noch einmal auf.";

export function solverFailure(solver: string): SolverFailure {
  return { ok: false, solver, fehler: "solver_ausgefallen", anweisung: SOLVER_FAILURE_INSTRUCTION };
}

/**
 * Enveloppe l'`execute` d'un outil de calcul. Le détail technique part dans
 * les journaux du serveur (jamais vers l'étudiant ni vers le modèle).
 */
export function guardSolver<I, O>(solver: string, fn: (input: I) => O | Promise<O>): (input: I) => Promise<O | SolverFailure> {
  return async (input: I) => {
    try {
      return await fn(input);
    } catch (err) {
      console.error(`[solver] ${solver} ausgefallen:`, err instanceof Error ? err.message : String(err));
      return solverFailure(solver);
    }
  };
}
