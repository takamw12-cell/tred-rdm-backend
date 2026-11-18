/**
 * La preuve d'une réponse : quel moteur a VÉRIFIÉ le calcul côté serveur.
 *
 * La pastille « Mit SymPy geprüft » (components/proof-badge.tsx) ne s'affiche
 * que si la réponse porte le résultat d'un outil de vérification, terminé, qui
 * dit lui-même `verified: true` et nomme son moteur. Ce que le tuteur ÉCRIT
 * dans son texte ne compte jamais : une réponse ne peut pas se déclarer
 * vérifiée toute seule.
 *
 * Au 18 nov. 2026, aucun outil du serveur ne produit ce résultat (la
 * vérification SymPy n'est pas branchée) : la pastille n'apparaît donc dans
 * aucune vraie réponse. Elle est prête pour le jour où l'outil existera.
 *
 * Module pur : tests/proof-badge.test.ts.
 */

export type ProofEngine = "sympy";

/** Le nom de l'outil de vérification, tel que le serveur le déclarera. */
export const PROOF_TOOL = "symbolische_pruefung";

const ENGINES: ReadonlySet<string> = new Set<ProofEngine>(["sympy"]);

interface PartLike {
  type?: unknown;
  state?: unknown;
  output?: unknown;
}

export function proofOf(parts: ReadonlyArray<unknown> | undefined | null): ProofEngine | null {
  for (const raw of parts ?? []) {
    const part = raw as PartLike | null;
    if (!part || part.type !== `tool-${PROOF_TOOL}` || part.state !== "output-available") continue;
    const out = part.output as { verified?: unknown; engine?: unknown } | null | undefined;
    if (out && out.verified === true && typeof out.engine === "string" && ENGINES.has(out.engine)) return out.engine as ProofEngine;
  }
  return null;
}
