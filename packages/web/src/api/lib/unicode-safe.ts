/**
 * Moitiés de caractères Unicode (« surrogates » isolés).
 *
 * ── L'incident du 5 novembre 2026 ─────────────────────────────────────────
 *
 * Le chat répondait « Die Verbindung wurde unterbrochen ». Anthropic refusait
 * la requête : `The request body is not valid JSON: lone leading surrogate in
 * hex escape`. Un emoji ou un symbole mathématique de PDF (𝑥, 𝜎 …) occupe
 * DEUX unités UTF-16 ; `retrieval.ts` découpe les documents par `.slice()` à
 * taille fixe et coupait parfois entre les deux. `JSON.stringify` écrit alors
 * `\ud835` seul, que l'API rejette. Selon la question, d'autres extraits
 * étaient retenus : la panne était intermittente.
 *
 * Deux protections :
 *   - `wellFormed()` à la source, là où l'on découpe du texte ;
 *   - `stripLoneSurrogateEscapes()` sur le corps JSON juste avant l'envoi à
 *     Anthropic (agent/gateway.ts) — couvre aussi l'historique, les résultats
 *     d'outils et tout découpage futur qu'on aurait oublié.
 */

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Remplace toute moitié de caractère isolée par U+FFFD. */
export function wellFormed(s: string): string {
  const native = (s as string & { toWellFormed?: () => string }).toWellFormed;
  return typeof native === "function" ? native.call(s) : s.replace(LONE_SURROGATE, "�");
}

// Dans du JSON, une moitié isolée apparaît comme un échappement \uD8xx–\uDBxx
// non suivi d'un \uDCxx–\uDFxx (ou l'inverse). Le `\` ne doit pas être lui-même
// échappé : un nombre PAIR de barres obliques le précède.
const LONE_HIGH_ESCAPE =
  /(?<=(?:^|[^\\])(?:\\\\)*)\\u[dD][89abAB][0-9a-fA-F]{2}(?!\\u[dD][c-fC-F][0-9a-fA-F]{2})/g;
const LONE_LOW_ESCAPE =
  /(?<=(?:^|[^\\])(?:\\\\)*)(?<!\\u[dD][89abAB][0-9a-fA-F]{2})\\u[dD][c-fC-F][0-9a-fA-F]{2}/g;

/** Rend un corps JSON acceptable pour une API stricte sur l'UTF-8. */
export function stripLoneSurrogateEscapes(json: string): string {
  if (!json.includes("\\u")) return json;
  return json.replace(LONE_HIGH_ESCAPE, "\\ufffd").replace(LONE_LOW_ESCAPE, "\\ufffd");
}
