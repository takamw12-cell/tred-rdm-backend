/**
 * Promesses absolues sur TRED (UWG, droit allemand de la concurrence déloyale).
 *
 * Une vidéo peut dire ce que TRED vérifie. Elle ne peut pas promettre que tout
 * est juste. La règle du fondateur (GUIDE_FOUNDER.md, « Ce que TRED peut
 * affirmer dans une publicité ») tient en deux listes : ce qu'on dit, ce qu'on
 * ne dit pas. Ce module porte la seconde, pour le prompt ET pour le contrôle
 * du script rendu par le modèle — une consigne seule ne garantit rien.
 *
 * Portée : les phrases qui parlent de TRED, du tuteur ou de l'IA. Une leçon
 * peut dire « l'énergie est toujours conservée » ou « le théorème est prouvé ».
 *
 * Module pur.
 */

/** À employer telles quelles. */
export const ALLOWED_CLAIMS = [
  "Every citation is checked against your own PDF.",
  "Real proofs from your own files.",
  "Jedes Zitat wird gegen dein eigenes Skript geprüft.",
  "Zahlen aus deterministischen Solvern, nicht geraten.",
] as const;

/** Interdit quel que soit le sujet de la phrase : ces tournures n'existent que pour vanter le produit. */
const ALWAYS: [RegExp, string][] = [
  [/\b(zero|no|keine|null|z[ée]ro)[\s-]+hall?u[cz]inat/i, "zero hallucination"],
  [/\bprov(e|es|ed|en|ing)\s+(every|each|all)\b/i, "proves every …"],
  [/\b(every|each)\s+(single\s+)?answer\b[^.!?]{0,40}\b(prov|proof|correct|right|verified|checked)/i, "every answer is proved/checked"],
  [/\bjede\s+antwort\b[^.!?]{0,40}\b(bewiesen|belegt|beweis|richtig|korrekt|geprüft)/i, "jede Antwort wird bewiesen"],
  [/\bchaque\s+r[ée]ponse\b[^.!?]{0,40}\b(prouv|preuve|juste|v[ée]rifi)/i, "chaque réponse est prouvée"],
  [/\b(dsgvo|gdpr|rgpd)[\s-]*(konform|compliant|conforme)\b/i, "DSGVO-konform"],
  [/\b(fully|end[\s-]to[\s-]end|vollständig|komplett|ende[\s-]zu[\s-]ende)\s+(encrypted|verschlüsselt)\b/i, "fully encrypted"],
];

/** Interdit dans une phrase qui parle de TRED, du tuteur ou de l'IA. */
const ABOUT_PRODUCT = /\b(tred|tutor|tuteur|ki|ai|ia|k\.i\.|a\.i\.)\b/i;
const WHEN_ABOUT_PRODUCT: [RegExp, string][] = [
  [/\b100\s?%/, "100 %"],
  [/\b(always|never|immer|nie|niemals|toujours|jamais)\s+(right|wrong|correct|richtig|falsch|korrekt|juste|faux)\b/i, "always right / never wrong"],
  [/\b(guarantee[ds]?|garantiert|garantie|garanti[es]?)\b/i, "guarantee"],
  [/\b(error[\s-]free|fehlerfrei|unfehlbar|infallible|sans\s+erreur)\b/i, "error-free"],
  [/\b(never|nie|niemals|jamais)\s+(guess|guesses|rät|raten|halluzinier|hallucinat|devine|invente)/i, "never guesses"],
  [/(rät|raten|guess(es)?|halluzinier\w*|hallucinat\w*)\s+(nie|niemals|never)\b/i, "never guesses"],
  [/\b(every|all|jede|alle|chaque|toutes?)\s+(\w+\s+)?(answers?|antwort(en)?|r[ée]ponses?)\b/i, "every answer"],
];

/** Les promesses absolues trouvées dans un texte (leur nom, pas le texte). Vide = rien à redire. */
export function absoluteClaims(text: string): string[] {
  const found = new Set<string>();
  for (const sentence of text.split(/(?<=[.!?…])\s+|\n+/)) {
    for (const [pattern, name] of ALWAYS) if (pattern.test(sentence)) found.add(name);
    if (ABOUT_PRODUCT.test(sentence)) for (const [pattern, name] of WHEN_ABOUT_PRODUCT) if (pattern.test(sentence)) found.add(name);
  }
  return [...found];
}

/** Le bloc ajouté à la consigne de tout script vidéo. */
export const AD_CLAIMS_PROMPT = `CE QUE TU DIS DE TRED (droit allemand de la publicité, UWG)
Si une scène parle de TRED, du tuteur ou de l'IA elle-même, tu ne fais AUCUNE promesse absolue. Cela vaut pour le titre, la question mystère, la voix, les points et les encadrés.
- Interdit, dans toutes les langues : « every answer is proved », « proved every answer », « always right », « never wrong », « never guesses », « 100 % », « zero hallucination », « guaranteed », « error-free », « jede Antwort wird bewiesen », « garantiert », « fehlerfrei », « GDPR compliant », « fully encrypted ».
- Tu dis ce que TRED VÉRIFIE, avec ces formulations validées, telles quelles : ${ALLOWED_CLAIMS.map((c) => `« ${c} »`).join(" · ")}
- TRED vérifie les CITATIONS contre le document de l'étudiant. Il ne prouve pas chaque réponse : une réponse sans document n'a pas de citation. Ne transforme jamais « chaque citation est vérifiée » en « chaque réponse est prouvée ».
Une scène qui contient une promesse absolue est supprimée par le contrôle.`;
