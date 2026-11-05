/**
 * Un bloc TikZ / circuitikz est-il COMPLET ?
 *
 * Pendant le streaming, le bloc arrive caractère par caractère ; le compiler
 * avant son \end{…} produit forcément une erreur LaTeX. Voir TikzDiagram
 * (components/diagram-blocks.tsx), incident du 5 novembre 2026.
 */
export function isCompleteTikz(code: string): boolean {
  const begins = code.match(/\\begin\{(circuitikz|tikzpicture|document)\}/g)?.length ?? 0;
  const ends = code.match(/\\end\{(circuitikz|tikzpicture|document)\}/g)?.length ?? 0;
  return begins > 0 && ends >= begins;
}
