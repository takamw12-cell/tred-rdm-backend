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

// ── La voix du professeur ([[PROFESSEUR]], NIVEAU 7) ─────────────────────
//
// Décision fondateur (2026-11-11) : le professeur ne lit JAMAIS le tableau.
// Il écrit la formule en silence, se retourne, et explique avec ses mots.
// La voix (ElevenLabs ou navigateur) ne reçoit donc que :
//   1. le contenu des blocs [[PROFESSEUR]] ;
//   2. à défaut (ancien format, app mobile), le texte HORS des blocs
//      [[TAFEL]] / [[REASONING]] / [[OFFICIAL]]… — jamais leur contenu.
// Puis on retire tout ce qui n'est pas une phrase : formules, équations
// écrites en clair (« I = U/R = 3 A »), symboles, code.

const SPOKEN_BLOCK_RE =
  /\[\[\s*(?:PROFESSEUR|PROFESSOR|PROFESOR|PROFESSORE)\b[^\]]*\]\]([\s\S]*?)(?:\[\[\s*\/\s*(?:PROFESSEUR|PROFESSOR|PROFESOR|PROFESSORE)\s*\]\]|$)/gi;
// Un bloc d'écrit, contenu compris (le contenu est pour les yeux, pas pour l'oreille).
const WRITTEN_BLOCK_RE =
  /\[\[\s*(TAFEL|REASONING|OFFICIAL|AEROSTUDY|QUELLE)\b[^\]]*\]\][\s\S]*?(?:\[\[\s*\/\s*\1\s*\]\]|$)/gi;
// « I = U/R = 3 A », « R_ges = 5,33 Ω », « x² + 2x » : une équation écrite en clair.
const EQUATION_RE = /[^\s.,;:!?()]*\s*[=≈≤≥<>]\s*[^\s,;!?]+(?:\s*[=≈+\-−·×*/^]\s*[^\s,;!?]+)*/g;

/** Ce que le professeur doit DIRE d'une réponse (voir plus haut). */
export function professorSpeech(raw: string): string {
  const said = [...raw.matchAll(SPOKEN_BLOCK_RE)].map((m) => m[1]).join("\n\n");
  const source = said.trim() ? said : raw.replace(WRITTEN_BLOCK_RE, "\n\n");
  return cleanForVoice(source);
}

/**
 * Nettoyage final avant la synthèse : balises, formules ($…$, $$…$$, \(…\)),
 * équations en clair, code, symboles. Ne garde que des phrases.
 */
export function cleanForVoice(text: string): string {
  return answerToSpeech(
    text
      .replace(/```[\s\S]*?(?:```|$)/g, " ")
      .replace(/`[^`\n]*`/g, " ")
      .replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]/g, " ")
      // Une formule en ligne disparaît ; un symbole seul ($R$, $I_1$) reste lisible.
      .replace(/\$([^$\n]+)\$|\\\(([\s\S]*?)\\\)/g, (_m, a: string, b: string) => {
        const tex = (a ?? b ?? "").trim();
        return /[=+\-*/^<>]|\\(?:frac|sqrt|sum|int|cdot|times)/.test(tex) || tex.length > 6 ? " " : tex;
      })
      .replace(EQUATION_RE, " "),
  )
    .replace(/[\\^_{}#=≈≤≥<>|~*]/g, " ")
    // Ponctuation orpheline laissée par une formule retirée : « , , » → « , ».
    .replace(/\s+([,.])/g, "$1")
    .replace(/([,;:])(?:\s*[,;:])+/g, "$1")
    .replace(/(^|[.!?]\s*)[,;:]\s*/g, "$1")
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

/* -------------------------------------------------------------------------- */
/* Styles de voix (Calme / Énergique / Sévère)                                */
/* -------------------------------------------------------------------------- */

export type VoiceStyle = "calm" | "energetic" | "strict";
export const VOICE_STYLES: readonly VoiceStyle[] = ["calm", "energetic", "strict"];

/**
 * Le style ne change pas la voix de l'appareil (impossible d'en connaître le
 * timbre) : il change sa DICTION — débit et hauteur. Une voix ElevenLabs
 * reçoit l'équivalent côté serveur (voice_settings).
 */
export const STYLE_PROSODY: Record<VoiceStyle, { rate: number; pitch: number }> = {
  calm: { rate: 0.92, pitch: 0.96 },
  energetic: { rate: 1.08, pitch: 1.08 },
  strict: { rate: 0.98, pitch: 0.88 },
};

/** Style par défaut de chaque professeur du vestiaire. */
export const PROFESSOR_STYLE: Record<string, VoiceStyle> = {
  genius: "energetic",
  sensei: "calm",
  maverick: "energetic",
  examiner: "strict",
};

/** Débit et hauteur d'une voix navigateur, bornés aux valeurs sûres. */
export function prosodyFor(style: VoiceStyle, naturalVoice: boolean): { rate: number; pitch: number } {
  // Les voix « Natural » sont justes à 1 ; les classiques gagnent à ralentir.
  const base = naturalVoice ? 1 : 0.95;
  const p = STYLE_PROSODY[style];
  const clamp = (v: number) => Math.min(1.3, Math.max(0.7, Math.round(v * 100) / 100));
  return { rate: clamp(base * p.rate), pitch: clamp(p.pitch) };
}

/** Préférence enregistrée « eleven:<slot> » = voix premium du serveur. */
export const PREMIUM_PREFIX = "eleven:";

/** L'emplacement premium qui correspond le mieux au style voulu. */
export function premiumSlotFor<S extends { id: string; style: VoiceStyle }>(slots: S[], style: VoiceStyle): S | undefined {
  return slots.find((s) => s.style === style) ?? slots[0];
}
