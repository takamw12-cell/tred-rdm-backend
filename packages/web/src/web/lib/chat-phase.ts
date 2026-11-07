/**
 * Ce que le tuteur est en train de faire, quand aucun texte ne s'écrit.
 *
 * L'indicateur disait toujours « TRED denkt nach … ». Pendant dix secondes de
 * recherche puis de calcul, l'étudiant croyait que c'était bloqué. On lit la
 * DERNIÈRE partie du message en cours et on nomme l'étape :
 *
 *   analyse    rien encore (requête envoyée)      « TRED analysiert deine Frage … »
 *   reasoning  raisonnement en cours              « TRED denkt nach … »
 *   search     suche_in_unterlagen                « Ich suche in deinen Dokumenten … »
 *   solve      un solveur (rechnen, *_berechnen…) « Ich berechne die Lösung … »
 *   review     evaluate_structure                 « Ich prüfe den Aufbau deiner Lösung … »
 *   research   recherche externe                  « Ich schlage im Fachwissen nach … »
 *   draw       skizze / image / vidéo             « Ich zeichne … »
 *   write      un outil vient de répondre         « TRED formuliert die Antwort … »
 */
export type ChatPhase = "analyse" | "reasoning" | "search" | "solve" | "review" | "research" | "draw" | "write";

export const SOLVER_TOOL_NAMES = new Set([
  "rechnen",
  "balkenstatik",
  "statik_berechnen",
  "schaltung_berechnen",
  "thermo_berechnen",
  "physik_berechnen",
  "mathe_berechnen",
  "solve_cyber",
  "solve_ai",
  "solve_open_math",
  "elektro_berechnen",
  "werkstoff_berechnen",
  "chemie_berechnen",
  "wirtschaft_berechnen",
  "schule_berechnen",
]);
const DRAW_TOOLS = new Set(["skizze", "generiere_bild_oder_video"]);

interface PartLike {
  type: string;
  state?: string;
  toolName?: string;
}

function toolName(p: PartLike): string | null {
  if (p.type === "dynamic-tool") return p.toolName ?? null;
  return p.type.startsWith("tool-") ? p.type.slice(5) : null;
}

export function chatPhase(parts: PartLike[] | undefined): ChatPhase {
  const visible = (parts ?? []).filter((p) => p.type !== "step-start");
  const last = visible[visible.length - 1];
  if (!last) return "analyse";
  if (last.type === "reasoning") return "reasoning";
  const name = toolName(last);
  if (name) {
    const finished = last.state === "output-available" || last.state === "output-error";
    if (finished) return "write";
    if (name === "suche_in_unterlagen") return "search";
    if (name === "recherche_connaissances_externes") return "research";
    if (SOLVER_TOOL_NAMES.has(name)) return "solve";
    if (name === "evaluate_structure") return "review";
    if (DRAW_TOOLS.has(name)) return "draw";
    return "write";
  }
  // Texte terminé, la suite n'a pas encore commencé.
  return "write";
}

/** Clé i18n de chaque étape (chat.phase*). */
export const PHASE_KEY = {
  analyse: "chat.phaseAnalyse",
  reasoning: "chat.phaseReasoning",
  search: "chat.phaseSearch",
  solve: "chat.phaseSolve",
  review: "chat.phaseReview",
  research: "chat.phaseResearch",
  draw: "chat.phaseDraw",
  write: "chat.phaseWrite",
} as const satisfies Record<ChatPhase, string>;
