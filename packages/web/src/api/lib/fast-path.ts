/**
 * Fast-path : calculer AVANT d'appeler le modèle, quand la question le permet.
 *
 * Mesuré le 7 nov. 2026 (Collatz de 27) : même avec le solveur, le graphique
 * n'apparaissait qu'après ~3,7 s — le temps que le modèle décide d'appeler
 * l'outil et en écrive les arguments. Or « Collatz + un nombre » ne laisse
 * aucun choix : le serveur lance le solveur lui-même (0,04 ms), envoie le
 * résultat au navigateur AVANT le premier token du modèle — le graphique est
 * là tout de suite — et le modèle n'a plus qu'à rédiger l'explication.
 *
 * Volontairement étroit : un seul cas (Collatz suivi d'un nombre), une seule
 * expression régulière, ici et nulle part ailleurs. Tout le reste passe par
 * le chemin normal (le modèle choisit ses outils).
 *
 * Pour le navigateur et l'historique, c'est exactement comme si le modèle
 * avait appelé `solve_open_math` : même partie d'outil, même graphique, même
 * badge, et la question suivante voit l'appel dans l'historique.
 */
import type { UIMessageChunk } from "ai";
import { solveOpenMath, type OpenMathInput } from "./solvers/open-math-solver";

export interface FastPath {
  /** Pour le log [perf]. */
  name: "collatz";
  toolName: "solve_open_math";
  toolCallId: string;
  input: OpenMathInput;
  output: Record<string, unknown>;
  /** Message système pour le modèle : le résultat, et la consigne de ne pas recalculer. */
  modelNote: string;
}

// « Collatz-Folge von 27 », « suite de Collatz de 27 », « Collatz für n = 27 »,
// « Syracuse 97 ». Le nombre suit le mot à 30 caractères au plus, sans retour
// à la ligne ni autre chiffre entre les deux.
const COLLATZ = /\b(?:collatz|syracuse|syrakus)\b[^\d\n]{0,30}?(\d{1,16})(?!\d)/i;

export function detectCollatzNumber(text: string): string | null {
  const m = COLLATZ.exec(text ?? "");
  if (!m) return null;
  const n = m[1].replace(/^0+(?=\d)/, "");
  return n === "0" ? null : n;
}

/** Le fast-path pour cette question, ou null (chemin normal). */
export function resolveFastPath(text: string, makeId: () => string = () => crypto.randomUUID()): FastPath | null {
  const n = detectCollatzNumber(text);
  if (!n) return null;
  const input: OpenMathInput = { aufgabe: "collatz", n };
  const output = solveOpenMath(input);
  // Une entrée hors limites (n > 10^15…) : on laisse le chemin normal, qui
  // dira l'erreur avec les mots du modèle.
  if (!output.ok) return null;
  const { diagramme: _chart, ...forModel } = output as Record<string, unknown>;
  return {
    name: "collatz",
    toolName: "solve_open_math",
    toolCallId: `fast_${makeId().replace(/-/g, "").slice(0, 24)}`,
    input,
    output,
    modelNote: [
      "VORAB BERECHNET — der Server hat solve_open_math (aufgabe collatz) für diese Frage bereits ausgeführt.",
      "Das Diagramm der Folge wird der Person BEREITS angezeigt. Rufe solve_open_math NICHT erneut auf und",
      "rechne nichts nach: erkläre mit GENAU diesen Zahlen (wörtlich übernehmen).",
      "Es gilt die Regel KEIN BEWEIS: ein geprüfter Fall beweist die Vermutung nicht.",
      `ERGEBNIS: ${JSON.stringify(forModel)}`,
    ].join("\n"),
  };
}

/**
 * Le flux du chat avec le résultat du fast-path inséré juste après « start » :
 * le navigateur reçoit la partie d'outil (et donc le graphique) avant que le
 * modèle n'ait produit son premier token.
 */
export function withFastPathResult(stream: ReadableStream<UIMessageChunk>, fast: FastPath): ReadableStream<UIMessageChunk> {
  let injected = false;
  const inject = (controller: TransformStreamDefaultController<UIMessageChunk>) => {
    if (injected) return;
    injected = true;
    controller.enqueue({ type: "tool-input-available", toolCallId: fast.toolCallId, toolName: fast.toolName, input: fast.input });
    controller.enqueue({ type: "tool-output-available", toolCallId: fast.toolCallId, output: fast.output });
  };
  return stream.pipeThrough(
    new TransformStream<UIMessageChunk, UIMessageChunk>({
      transform(chunk, controller) {
        if (chunk.type === "start") {
          controller.enqueue(chunk);
          inject(controller);
          return;
        }
        // Pas de « start » (ne devrait pas arriver) : on insère avant le premier morceau.
        inject(controller);
        controller.enqueue(chunk);
      },
    }),
  );
}
