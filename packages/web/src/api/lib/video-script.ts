import { z } from "zod";
import type { Language } from "./languages";

/**
 * « Als Video erklären » — le script de la vidéo explicative, et son contrôle.
 *
 * Module pur (aucune base, aucun réseau), testé dans tests/video-script.test.ts.
 *
 * ── Zéro hallucination, vérifiée par du code ──────────────────────────────
 *
 * Le prompt interdit au modèle d'inventer, mais un prompt ne garantit rien.
 * Chaque scène doit donc citer un extrait du cours (`sourceIndex` + `quote`),
 * et `validateVideoScript` vérifie, sans modèle :
 *
 *   1. que la citation se retrouve mot pour mot dans l'extrait fourni ;
 *   2. que chaque nombre dit, affiché ou écrit dans une formule figure dans
 *      les extraits (ou dans la question de l'étudiant).
 *
 * Une scène qui échoue est supprimée. S'il ne reste pas de quoi faire une
 * explication, la vidéo est refusée : mieux vaut pas de vidéo qu'une vidéo
 * inventée.
 *
 * ── La durée ──────────────────────────────────────────────────────────────
 *
 * Elle n'est fixée nulle part : c'est la longueur de la voix off qui la donne
 * (30 s à 3 min, soit 75 à 450 mots à ~150 mots par minute).
 */

export const MIN_VOICE_WORDS = 75;
export const MAX_VOICE_WORDS = 450;
/** En dessous, la voix restante après contrôle ne fait plus une explication. */
export const MIN_VALID_WORDS = 40;
export const MIN_SCENES = 2;
export const MAX_SCENES = 14;
const MIN_QUOTE_CHARS = 12;

export interface VideoSource {
  title: string;
  kind?: string;
  content: string;
}

export const videoSceneSchema = z.object({
  heading: z.string().describe("Titre court de la scène, 2 à 6 mots."),
  bullets: z.array(z.string()).describe("0 à 3 points très courts affichés à l'écran."),
  formula: z.string().describe("UNE formule en LaTeX pur, copiée de l'extrait cité. Chaîne vide s'il n'y en a pas."),
  sourceIndex: z.number().int().describe("Numéro de l'extrait cité : 1 pour [S1], 2 pour [S2]…"),
  quote: z.string().describe("Passage copié MOT POUR MOT de cet extrait, qui prouve ce que dit la scène (10 à 40 mots)."),
  voiceover: z.string().describe("Ce que dit la voix pendant la scène. Langue parlée, sans LaTeX ni symboles."),
});

export const videoScriptSchema = z.object({
  title: z.string().describe("Titre court de la vidéo."),
  scenes: z.array(videoSceneSchema),
});

export type VideoScene = z.infer<typeof videoSceneSchema>;
export type VideoScript = z.infer<typeof videoScriptSchema>;

/** Une scène validée : la source est résolue (titre du document). */
export interface ValidatedScene extends VideoScene {
  sourceTitle: string;
}

export type DropReason = "unknown_source" | "quote_too_short" | "quote_not_in_source" | "number_not_in_sources" | "empty_voiceover";

export type ValidationResult =
  | { ok: true; title: string; scenes: ValidatedScene[]; words: number; dropped: { index: number; reason: DropReason; detail?: string }[] }
  | { ok: false; error: "no_valid_scene" | "too_short" | "too_long"; words: number; dropped: { index: number; reason: DropReason; detail?: string }[] };

/* ── Texte ─────────────────────────────────────────────────────────────── */

/** Compare deux textes sans se laisser tromper par la casse, les espaces ou la typographie. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„«»]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/­/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function scriptVoiceText(scenes: { voiceover: string }[]): string {
  return scenes.map((s) => s.voiceover.trim()).filter(Boolean).join(" ");
}

/* ── Nombres ───────────────────────────────────────────────────────────── */

/**
 * Les nombres d'un texte, sous forme canonique : « 4,50 » et « 4.5 » → « 4.5 »,
 * « 1.000 » (séparateur de milliers allemand) → « 1000 ».
 */
export function extractNumbers(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.normalize("NFKC").match(/\d+(?:[.,]\d+)*/g) ?? []) {
    out.push(...canonicalNumbers(raw));
  }
  return out;
}

/** Une écriture peut se lire de deux façons (« 1.000 » : mille ou un) : on garde les deux. */
function canonicalNumbers(raw: string): string[] {
  const forms = new Set<string>();
  const parts = raw.split(/[.,]/);
  if (parts.length === 1) {
    forms.add(trimNumber(raw));
  } else {
    // Dernier séparateur = décimale.
    forms.add(trimNumber(`${parts.slice(0, -1).join("")}.${parts[parts.length - 1]}`));
    // Tous les séparateurs = milliers (groupes de 3 chiffres seulement).
    if (parts.slice(1).every((p) => p.length === 3)) forms.add(trimNumber(parts.join("")));
  }
  return [...forms];
}

function trimNumber(n: string): string {
  let [int, dec = ""] = n.split(".");
  int = int!.replace(/^0+(?=\d)/, "");
  dec = dec.replace(/0+$/, "");
  return dec ? `${int}.${dec}` : int!;
}

/** Un chiffre seul (0 à 9) est structurel : exposant, « Schritt 2 », « deux appuis ». */
const isStructural = (n: string) => /^\d$/.test(n);

/* ── Contrôle ──────────────────────────────────────────────────────────── */

/**
 * Garde les scènes prouvées par les extraits, supprime les autres.
 * `question` : les nombres de l'énoncé de l'étudiant sont permis (il les a donnés).
 */
export function validateVideoScript(script: VideoScript, sources: VideoSource[], question = ""): ValidationResult {
  const normalized = sources.map((s) => normalizeText(s.content));
  const allowed = new Set<string>([...sources.flatMap((s) => extractNumbers(s.content)), ...extractNumbers(question)]);
  const dropped: { index: number; reason: DropReason; detail?: string }[] = [];
  const scenes: ValidatedScene[] = [];

  script.scenes.slice(0, MAX_SCENES).forEach((scene, index) => {
    const src = sources[scene.sourceIndex - 1];
    if (!src) return void dropped.push({ index, reason: "unknown_source" });
    if (!scene.voiceover.trim()) return void dropped.push({ index, reason: "empty_voiceover" });

    const quote = normalizeText(scene.quote);
    if (quote.length < MIN_QUOTE_CHARS) return void dropped.push({ index, reason: "quote_too_short" });
    if (!normalized[scene.sourceIndex - 1]!.includes(quote)) return void dropped.push({ index, reason: "quote_not_in_source" });

    const said = [scene.heading, ...scene.bullets, scene.formula, scene.voiceover].join(" ");
    const invented = extractNumbers(said).find((n) => !isStructural(n) && !allowed.has(n));
    if (invented !== undefined) return void dropped.push({ index, reason: "number_not_in_sources", detail: invented });

    scenes.push({ ...scene, bullets: scene.bullets.slice(0, 3), sourceTitle: src.title });
  });

  const words = countWords(scriptVoiceText(scenes));
  if (scenes.length < MIN_SCENES) return { ok: false, error: "no_valid_scene", words, dropped };
  if (words < MIN_VALID_WORDS) return { ok: false, error: "too_short", words, dropped };
  if (words > MAX_VOICE_WORDS) return { ok: false, error: "too_long", words, dropped };
  return { ok: true, title: script.title.trim(), scenes, words, dropped };
}

/* ── Prompt ────────────────────────────────────────────────────────────── */

export function buildVideoPrompt(input: { language: Language; sources: VideoSource[]; question: string; answer: string }): { system: string; prompt: string } {
  const { language, sources, question, answer } = input;
  const system = `${language.top}

Tu es TRED, professeur. Tu écris le script d'une courte vidéo qui explique à un étudiant le point exact qui le bloque.

RÈGLE ABSOLUE — ZÉRO INVENTION
Tu expliques en te basant UNIQUEMENT sur les extraits de cours fournis ([S1], [S2]…). Si une information n'est pas dans ces extraits, tu ne l'inventes pas et tu n'en parles pas. Aucune formule, aucune valeur, aucun chiffre qui ne figure pas dans un extrait ou dans la question de l'étudiant.

LANGUE
Le script et la voix off sont écrits dans cette langue : ${language.label}. Les formules et les termes techniques des extraits restent dans leur langue d'origine (par exemple l'allemand), mais l'explication est dans la langue de l'étudiant.

CHAQUE SCÈNE
- "sourceIndex" : le numéro de l'extrait sur lequel elle s'appuie.
- "quote" : un passage de cet extrait copié MOT POUR MOT (10 à 40 mots), sans le reformuler ni le traduire. Un programme vérifie cette citation : une scène dont la citation n'est pas exacte est supprimée.
- "voiceover" : ce que dit la voix, en langue parlée, naturelle et fluide. Pas de LaTeX, pas de symboles : écris « sigma égale M sur W » dans la langue de l'étudiant.
- "formula" : au plus UNE formule, en LaTeX pur sans dollars, copiée de l'extrait. Chaîne vide sinon.
- "bullets" : 0 à 3 points de 8 mots au plus.
- Aucun schéma, aucun dessin : tu n'en décris pas.

DURÉE
Elle dépend de la difficulté : de ${MIN_VOICE_WORDS} mots de voix (30 secondes) pour un point simple à ${MAX_VOICE_WORDS} mots (3 minutes) pour un raisonnement long. N'allonge pas pour allonger. Entre ${MIN_SCENES} et ${MAX_SCENES} scènes.

PÉDAGOGIE
Pars de ce que l'étudiant n'a pas compris, avance pas à pas, donne une image concrète seulement si l'extrait en contient une, et termine par la phrase à retenir.

${language.bottom}`;

  const block = sources.map((s, i) => `[S${i + 1}] ${s.title}${s.kind ? ` (${s.kind})` : ""}\n${s.content}`).join("\n\n");
  const prompt = `EXTRAITS DU COURS DE L'ÉTUDIANT\n${block}\n\nQUESTION DE L'ÉTUDIANT\n${question.trim() || "(non précisée)"}\n\nDERNIÈRE RÉPONSE DU TUTEUR (contexte seulement : ce n'est PAS une source, n'y prends aucun chiffre)\n${answer.trim() || "(aucune)"}\n\nÉcris maintenant le script.`;
  return { system, prompt };
}

/* ── Requête ───────────────────────────────────────────────────────────── */

export const videoRequestSchema = z.object({
  question: z.string().max(4000).default(""),
  answer: z.string().max(12_000).default(""),
  /** Langue de l'interface de l'étudiant (obligatoire). */
  language: z.string().min(2).max(12),
  chatId: z.string().max(100).nullish(),
  messageId: z.string().max(100).nullish(),
  docId: z.string().max(100).nullish(),
  semesterId: z.string().max(100).nullish(),
  /** Le professeur choisi (sa voix). */
  professor: z.string().max(40).nullish(),
});

export type VideoRequest = z.infer<typeof videoRequestSchema>;

/* ── Horodatage de la voix ─────────────────────────────────────────────── */

export interface VoiceWord {
  text: string;
  startMs: number;
  endMs: number;
}

/** Caractères horodatés (ElevenLabs « with-timestamps ») → mots horodatés. */
export function alignmentToWords(alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }): VoiceWord[] {
  const words: VoiceWord[] = [];
  let cur: VoiceWord | null = null;
  alignment.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (cur) words.push(cur), (cur = null);
      return;
    }
    const start = Math.round((alignment.character_start_times_seconds[i] ?? 0) * 1000);
    const end = Math.round((alignment.character_end_times_seconds[i] ?? 0) * 1000);
    if (!cur) cur = { text: "", startMs: start, endMs: end };
    cur.text += ch;
    cur.endMs = end;
  });
  if (cur) words.push(cur);
  return words;
}

/** Marge après le dernier mot, pour que la vidéo ne coupe pas la voix. */
export const TAIL_MS = 1500;

/** La durée de la vidéo : celle de la voix, jamais une valeur fixe. */
export function videoDurationMs(words: VoiceWord[]): number {
  const last = words[words.length - 1];
  return last ? last.endMs + TAIL_MS : 0;
}

/**
 * Répartit les mots horodatés entre les scènes : la scène n commence au
 * premier mot de sa voix off. Les mots sont comptés, pas comparés — la voix a
 * lu exactement le texte envoyé.
 */
export function sceneStartsMs(scenes: { voiceover: string }[], words: VoiceWord[]): number[] {
  const starts: number[] = [];
  let k = 0;
  for (const scene of scenes) {
    starts.push(words[Math.min(k, Math.max(0, words.length - 1))]?.startMs ?? 0);
    k += countWords(scene.voiceover);
  }
  return starts;
}
