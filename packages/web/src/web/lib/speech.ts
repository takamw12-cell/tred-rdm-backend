/**
 * Lecture à voix haute des réponses du tuteur (window.speechSynthesis).
 *
 * Module PUR — aucune dépendance à React ni au navigateur — pour être testé
 * sans DOM. Le bouton qui s'en sert est ListenButton (components/ai-answer.tsx).
 */

// Ce que la synthèse vocale doit DIRE d'une réponse : le texte, sans les
// marqueurs [[…]], sans blocs de code/SVG/diagrammes (illisibles à l'oral),
// et avec le LaTeX ramené à quelque chose de prononçable.

function latexToSpeech(tex: string): string {
  return tex
    .replace(/\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "$1 / $2")
    .replace(/\\sqrt\s*\{([^{}]*)\}/g, "√ $1")
    .replace(/\\(?:cdot|times)/g, " · ")
    .replace(/\\(?:left|right|displaystyle|mathrm|text|mathbf|operatorname)\b/g, "")
    .replace(/\\([a-zA-Z]+)/g, " $1 ") // \sigma → sigma
    .replace(/[{}]/g, "")
    .replace(/_/g, " ")
    // Carré et cube : les voix les prononcent correctement dans chaque langue.
    .replace(/\^\s*2(?!\d)/g, "²")
    .replace(/\^\s*3(?!\d)/g, "³")
    .replace(/\s+/g, " ")
    .trim();
}

// Citations [[QUELLE …]]extrait[[/QUELLE]] : retirées, comme à l'écran.
const CITE_RE = /\[\[\s*QUELLE[^\]]*\]\][\s\S]*?(?:\[\[\s*\/\s*QUELLE\s*\]\]|$)/gi;
// Tout autre marqueur [[OFFICIAL]], [[/REASONING]]… : seul le marqueur part,
// le contenu du bloc est lu.
const MARKER_RE = /\[\[\s*\/?\s*[A-Za-zÄÖÜäöü]+[^\]]*\]\]/g;

export function answerToSpeech(raw: string): string {
  return raw
    .replace(CITE_RE, " ")
    .replace(MARKER_RE, "\n\n")
    .replace(/```[\s\S]*?(?:```|$)/g, " ") // code, svg, chart, schémas
    .replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]/g, " ") // formules en display
    .replace(/\$([^$\n]+)\$|\\\(([\s\S]*?)\\\)/g, (_m, a: string, b: string) =>
      latexToSpeech(a ?? b ?? ""),
    )
    .replace(/<[^>]+>/g, " ") // HTML éventuel
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // liens → leur texte
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // titres
    .replace(/^\s*>\s?/gm, "") // citations
    .replace(/^\s*[-*+]\s+/gm, "") // puces
    .replace(/^\s*\|?[-:\s|]+\|?\s*$/gm, " ") // séparateurs de tableau
    .replace(/\|/g, ", ")
    .replace(/(\*\*|__|\*|_|`)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Découpe en phrases de ≤ ~220 caractères : Chrome coupe les longues lectures. */
export function speechChunks(text: string): string[] {
  const sentences = text.match(/[^.!?。！？؟।]+[.!?。！？؟।]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + s).length > 220 && cur) {
      chunks.push(cur.trim());
      cur = "";
    }
    cur += s;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

export const SPEECH_LANG: Record<string, string> = {
  de: "de-DE", en: "en-US", fr: "fr-FR", es: "es-ES", it: "it-IT", pt: "pt-PT",
  ru: "ru-RU", ar: "ar-SA", zh: "zh-CN", hi: "hi-IN", bn: "bn-IN", ja: "ja-JP",
};

