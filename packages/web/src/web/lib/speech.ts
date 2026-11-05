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


// ── Choix de la voix ─────────────────────────────────────────────────────
//
// La voix par défaut du navigateur est souvent la plus ancienne (eSpeak,
// « compact ») : robotique. Les appareils récents en ont de bien meilleures
// — « Microsoft Katja Online (Natural) » dans Edge, « Google Deutsch » dans
// Chrome, les voix « Premium / Enhanced » de Safari. On les note et on
// prend la meilleure de la bonne langue, sauf choix explicite de l'étudiant.

export interface VoiceLike {
  name: string;
  lang: string;
  voiceURI: string;
  localService?: boolean;
}

/** Plus c'est haut, plus la voix est naturelle — pour cette langue. */
export function scoreVoice(v: VoiceLike, locale: string): number {
  const want = (SPEECH_LANG[locale] ?? locale).toLowerCase();
  const lang = v.lang.toLowerCase().replace("_", "-");
  let score = 0;
  if (lang === want) score += 100;
  else if (lang.startsWith(want.slice(0, 2))) score += 60;
  else return -1000; // mauvaise langue : jamais

  const name = v.name.toLowerCase();
  if (/natural|neural/.test(name)) score += 45; // Edge (Azure)
  if (/premium|enhanced|siri/.test(name)) score += 40; // Safari / iOS
  if (/\bonline\b/.test(name)) score += 15;
  if (/google/.test(name)) score += 30; // Chrome
  if (/katja|conrad|amala|killian|seraphina|florian|anna|helena|marlene/.test(name)) score += 8;
  if (/espeak|compact|robot|novelty|whisper|bad news|bells|zarvox/.test(name)) score -= 80;
  return score;
}

/** La voix à utiliser : celle choisie si elle existe encore, sinon la meilleure. */
export function pickVoice<V extends VoiceLike>(
  voices: V[],
  locale: string,
  preferredURI?: string | null,
): V | undefined {
  if (preferredURI) {
    const chosen = voices.find((v) => v.voiceURI === preferredURI);
    if (chosen) return chosen;
  }
  return rankVoices(voices, locale)[0];
}

/** Voix de la langue, de la plus naturelle à la moins naturelle. */
export function rankVoices<V extends VoiceLike>(voices: V[], locale: string): V[] {
  return voices
    .map((v) => ({ v, s: scoreVoice(v, locale) }))
    .filter((x) => x.s > -1000)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.v);
}
