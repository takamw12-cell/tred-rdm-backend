import { z } from "zod";
import { invented, texOk } from "./video-motion";

/**
 * « Als Video erklären » en style ANIME (web/video/anime-explanation.tsx).
 *
 * Le modèle devient RÉALISATEUR : des scènes très courtes (5 à 8 secondes),
 * et pour chacune un décor, UNE action choisie dans une liste, et la
 * description de l'image de fond (`image_prompt`), générée ensuite par
 * Replicate. L'image occupe tout l'écran ; le professeur est incrusté par-dessus
 * (il attend, il parle, il montre). Le texte n'apparaît que s'il est
 * nécessaire : une bulle de manga ou une formule sur une note manuscrite.
 *
 * Ce fichier est pur (aucun réseau) : la liste des actions, le contrôle de ce
 * que le modèle a écrit, la consigne, et les calculs que la composition
 * partage avec les tests (bouche, caméra, pose).
 *
 * ZÉRO INVENTION : la voix, la bulle et la formule passent par les mêmes
 * contrôles que les autres vidéos. L'IMAGE, elle, est une illustration : un
 * modèle d'image ne garantit pas un schéma exact. La consigne lui interdit donc
 * tout texte et tout chiffre, et l'image ne porte jamais une valeur du cours.
 */

/** Actif : `VIDEO_ANIME=on` ET une clé Replicate (les décors sont générés). */
export function animeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.VIDEO_ANIME?.trim().toLowerCase() === "on" && Boolean(env.REPLICATE_API_TOKEN);
}

export const ANIME_ACTIONS = ["show_tool", "use_tool", "zoom_sur_prof", "personnage_pointe_du_doigt", "fleche_pointe_objet", "formule_s_ecrit", "bulle_de_texte", "panoramique"] as const;
export type AnimeAction = (typeof ANIME_ACTIONS)[number];

/** Les noms d'action du brief du 23 nov. (soir), acceptés comme synonymes. */
const ACTION_ALIASES: Record<string, AnimeAction> = { zoom_on_formula: "formule_s_ecrit", character_point: "personnage_pointe_du_doigt", zoom_on_character: "zoom_sur_prof", speech_bubble: "bulle_de_texte", pan: "panoramique", arrow_points_object: "fleche_pointe_objet" };

/**
 * Les OBJETS que le personnage peut prendre et utiliser. Ce sont des images
 * détourées (public/video-props/) animées par le code : la clé tourne autour
 * de l'écrou, la planche bascule sur son appui. Le mouvement est calculé, donc
 * juste — contrairement à une image générée, qui dessine « à peu près ».
 */
export const ANIME_TOOLS = ["wrench", "lever"] as const;
export type AnimeTool = (typeof ANIME_TOOLS)[number];

/** Le lieu de la scène : il garde les images d'une même vidéo cohérentes entre elles. */
export const ANIME_DECORS = {
  atelier: "inside a bright, tidy workshop with wooden workbenches",
  chantier: "on a sunny construction site with cranes in the distance",
  salle_de_classe: "inside a bright classroom with a large green chalkboard",
  laboratoire: "inside a clean modern science laboratory",
  parc: "in a green city park on a sunny day",
  ville: "in a lively modern city street",
  maison: "inside a cozy living room",
  usine: "inside a modern factory hall with machines",
  bureau: "inside a calm modern office",
  hopital: "inside a bright hospital room",
  tribunal: "inside a solemn courtroom with wooden benches",
  nature: "in a wide natural landscape with mountains and a river",
  espace: "in outer space with planets and stars",
  gros_plan: "as a close-up on a soft pastel background",
} as const;
export type AnimeDecor = keyof typeof ANIME_DECORS;

export const ANIME_FOCUS = ["left", "center"] as const;
export type AnimeFocus = (typeof ANIME_FOCUS)[number];

export const MAX_BUBBLE_WORDS = 9;
const MAX_BUBBLE_CHARS = 70;
const MIN_PROMPT_CHARS = 20;
const MAX_PROMPT_CHARS = 420;

/**
 * Ce que le modèle écrit pour une scène. Tous les champs sont obligatoires et
 * sans énumération : la sortie structurée refuse un schéma trop gros.
 */
export const animeField = z.object({
  decor: z.string().describe(`Le lieu de la scène : ${Object.keys(ANIME_DECORS).join(", ")}.`),
  action: z.string().describe(`CE QUI SE PASSE à l'écran, UNE action : ${ANIME_ACTIONS.join(", ")}.`),
  illustration_prompt: z.string().describe("EN ANGLAIS : ce que montre l'image de fond, concret et visuel (un objet, une situation), 15 à 40 mots. Aucun texte, aucun chiffre dans l'image."),
  tool: z.string().describe(`Seulement pour show_tool et use_tool : ${ANIME_TOOLS.join(" ou ")}. Chaîne vide sinon.`),
  focus: z.string().describe("Où est le sujet dans l'image : left ou center (le professeur est en bas à droite)."),
  bubble: z.string().describe(`Seulement pour bulle_de_texte ou zoom_sur_prof : ${MAX_BUBBLE_WORDS} mots au plus, dans la langue de l'étudiant. Chaîne vide sinon.`),
});
export type RawAnime = Partial<z.infer<typeof animeField>> & { image_prompt?: string };

export interface AnimeScene {
  decor: AnimeDecor;
  action: AnimeAction;
  focus: AnimeFocus;
  /** La consigne complète envoyée au modèle d'image (style + lieu + sujet + interdits). */
  prompt: string;
  /** L'objet que le personnage montre ou utilise (show_tool, use_tool). */
  tool?: AnimeTool;
  /** Le texte de la bulle, ou vide. */
  bubble: string;
  /** L'adresse de l'image générée. Absente tant que Replicate n'a pas répondu. */
  image?: string;
}

const STYLE = "2D anime style educational illustration, vibrant colors, clean bold outlines, cel shading, soft painted background, cinematic wide shot";
const FORBIDDEN = "No text, no letters, no numbers, no labels, no watermark, no speech bubbles.";

/** La consigne de l'image : le style et les interdits viennent du code, jamais du modèle. */
export function imagePrompt(subject: string, decor: AnimeDecor, focus: AnimeFocus): string {
  const where = focus === "left" ? "The main subject is in the left half of the image." : "The main subject is in the center of the image.";
  return `${STYLE}. ${subject.replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "")}, ${ANIME_DECORS[decor]}. ${where} The lower right corner is calm and empty. ${FORBIDDEN}`;
}

const pick = <T extends string>(list: readonly T[], value: unknown): T | null => {
  const v = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (list as readonly string[]).includes(v) ? (v as T) : null;
};

/**
 * La mise en scène d'une scène, contrôlée. `null` : pas de description d'image
 * utilisable (la scène est alors montée par le code, voir `defaultAnime`).
 * Une action impossible est remplacée, jamais affichée à moitié :
 *   · formule_s_ecrit sans formule lisible → bulle ou panoramique ;
 *   · bulle vide, trop longue ou avec un nombre absent des sources → pas de bulle.
 */
export function cleanAnime(raw: RawAnime | null | undefined, scene: { formula?: string }, allowed: ReadonlySet<string>): AnimeScene | null {
  const subject = String(raw?.illustration_prompt ?? raw?.image_prompt ?? "").replace(/["“”«»]/g, "").trim().slice(0, MAX_PROMPT_CHARS);
  if (subject.length < MIN_PROMPT_CHARS) return null;
  const decor = pick(Object.keys(ANIME_DECORS) as AnimeDecor[], raw?.decor) ?? "gros_plan";
  const focus = pick(ANIME_FOCUS, raw?.focus) ?? "center";
  let bubble = String(raw?.bubble ?? "").replace(/\s+/g, " ").trim();
  if (bubble.length > MAX_BUBBLE_CHARS || bubble.split(" ").length > MAX_BUBBLE_WORDS || invented(bubble, allowed)) bubble = "";
  let action: AnimeAction = pick(ANIME_ACTIONS, raw?.action) ?? ACTION_ALIASES[String(raw?.action ?? "").trim().toLowerCase()] ?? "panoramique";
  const tool = pick(ANIME_TOOLS, raw?.tool);
  // Un objet inconnu n'est pas remplacé par un autre : la scène redevient un plan simple.
  if ((action === "show_tool" || action === "use_tool") && !tool) action = "panoramique";
  const formula = (scene.formula ?? "").trim();
  if (action === "formule_s_ecrit" && (!formula || !texOk(formula))) action = bubble ? "bulle_de_texte" : "panoramique";
  if (action === "bulle_de_texte" && !bubble) action = "panoramique";
  // La bulle n'existe que pour les deux actions qui la montrent.
  if (action !== "bulle_de_texte" && action !== "zoom_sur_prof") bubble = "";
  if (action === "show_tool" || action === "use_tool") {
    // L'objet animé occupe la gauche et le centre : le décor lui laisse la place, sans outil dessiné en double.
    // Le décor est un LIEU VIDE écrit par le code : la description du modèle ferait dessiner un deuxième objet, faux, à côté du vrai.
    const place = tool === "wrench" ? "An empty wooden workbench seen from the front, with nothing on it, and a tidy wall behind" : "A wide empty flat ground with nothing on it, and a calm horizon behind";
    return { decor, action, focus: "left", tool: tool!, prompt: `${imagePrompt(place, decor, "center")} An empty background scene: no tools, no objects in the foreground, no rocks, no people.`, bubble: "" };
  }
  return { decor, action, focus, prompt: imagePrompt(subject, decor, focus), bubble };
}

/** Une scène sans mise en scène valable : le décor de la matière, un plan qui avance, la formule si elle existe. */
export function defaultAnime(scene: { heading?: string; formula?: string }, index: number): AnimeScene {
  const formula = (scene.formula ?? "").trim();
  const action: AnimeAction = formula && texOk(formula) ? "formule_s_ecrit" : index % 2 === 0 ? "panoramique" : "personnage_pointe_du_doigt";
  return { decor: "salle_de_classe", action, focus: "center", prompt: imagePrompt("A large empty green chalkboard and a wooden desk with a few books", "salle_de_classe", "center"), bubble: "" };
}

export function animePromptBlock(): string {
  return `STYLE « ANIME » — TU ES LE RÉALISATEUR
Cette vidéo est un dessin animé éducatif. L'IMAGE parle plus que le texte : elle occupe tout l'écran, le professeur est incrusté dessus et explique à voix haute. Cette partie REMPLACE les consignes sur "visual_cues", "bullets", "steps" et la durée des scènes.

SCÈNES TRÈS COURTES
- Chaque scène dure 5 à 8 secondes : "voiceover" fait 12 à 22 mots, UNE idée, une ou deux phrases courtes. Jamais un long paragraphe.
- Beaucoup de scènes courtes valent mieux que peu de scènes longues : coupe dès que l'image doit changer.
- "visual_cues" vaut [] partout ; "heading" reste un titre court (il n'est pas affiché).

POUR CHAQUE SCÈNE — "anime"
- "decor" : le lieu, parmi ${Object.keys(ANIME_DECORS).join(", ")}. Garde le même lieu pour plusieurs scènes de suite : la vidéo raconte UNE histoire, pas une suite d'images sans lien.
- "illustration_prompt" : EN ANGLAIS, ce que l'on VOIT, en 15 à 40 mots. Un objet ou une situation concrète qui montre l'idée (« a wooden seesaw with a heavy rock on the short side and a small child pushing down the long side »). Décris la forme, la taille, la position. N'écris ni style ni couleur de trait (le code les ajoute), aucun texte, aucun chiffre, aucune formule, aucun nom de marque ni de personne. Ne décris PAS le professeur : il est ajouté ensuite.
- "focus" : où se trouve le sujet, "left" ou "center". Le professeur se tient en bas à droite : ne place rien d'important là.
- "action" : UNE action, celle qui sert l'idée de la scène :
  · "show_tool" : un objet apparaît en grand et bouge doucement — "tool" vaut "wrench" (une clé sur un écrou) ou "lever" (une planche sur un appui, un rocher au bout court). Pour présenter l'objet de la leçon.
  · "use_tool" : le professeur PREND l'objet ("tool") et s'en sert : il pousse le manche de la clé, ou le bras long du levier, et le rocher se soulève. C'est l'action la plus forte : utilise-la pour l'idée centrale, une ou deux fois par vidéo.
  · "panoramique" : la caméra traverse lentement l'image. Pour installer un lieu, une situation.
  · "personnage_pointe_du_doigt" : le professeur montre le sujet du doigt. Pour dire « regarde ici ».
  · "fleche_pointe_objet" : une flèche dessinée à la main part du professeur et désigne le sujet de l'image. Pour nommer un objet précis (le levier, l'appui, la charge).
  · "formule_s_ecrit" : la formule de la scène ("formula", copiée de la source) s'écrit sur une note manuscrite. SEULEMENT si la scène a une formule.
  · "bulle_de_texte" : une bulle de manga avec "bubble" (${MAX_BUBBLE_WORDS} mots au plus) : le mot-clé ou la règle à retenir. Rare : deux ou trois fois par vidéo.
  · "zoom_sur_prof" : la caméra se rapproche du professeur, qui s'adresse à l'étudiant. Pour la question du début et la phrase de conclusion ; "bubble" peut porter la question ou la règle.
- Varie les actions : jamais trois fois la même de suite.
- "tool" : "wrench" ou "lever" pour "show_tool" et "use_tool", chaîne vide sinon. Pour ces deux actions, "illustration_prompt" décrit seulement le LIEU vide (l'établi, le sol du parc) : l'objet est ajouté et animé par TRED.
- "bubble" : chaîne vide sauf pour "bulle_de_texte" et "zoom_sur_prof". Aucun chiffre qui ne vient pas des sources.

LE RESTE NE CHANGE PAS : chaque scène d'explication cite sa source ("sourceIndex", "quote"), la première scène pose la question mystère, la dernière récapitule. "bullets" et "steps" ne sont pas affichés.`;
}

/* ── Calculs partagés avec la composition ──────────────────────────────── */

/** La bouche est-elle ouverte à l'instant `ms` ? Elle bat pendant un mot (une syllabe ≈ 0,13 s), jamais dans un silence. */
export function mouthOpen(words: { startMs: number; endMs: number }[], ms: number, beatMs = 130): boolean {
  for (const w of words) {
    if (ms < w.startMs) return false;
    if (ms <= w.endMs) return Math.floor((ms - w.startMs) / beatMs) % 2 === 0;
  }
  return false;
}

/** Le professeur parle-t-il (à 0,25 s près) ? Sert à l'animer entre deux syllabes. */
export function speaking(words: { startMs: number; endMs: number }[], ms: number, slackMs = 250): boolean {
  return words.some((w) => ms >= w.startMs - slackMs && ms <= w.endMs + slackMs);
}

/** L'action commence après un quart de la scène (la voix a posé le sujet), au plus tard à 1,5 s. */
export function actionStart(frames: number, fps: number): number {
  return Math.round(Math.min(frames * 0.25, fps * 1.5));
}

/** La pose du professeur pendant une scène : il montre pour les deux actions qui désignent, sinon il attend ou parle. */
export function pointing(action: AnimeAction, local: number, frames: number, fps: number): boolean {
  if (action !== "personnage_pointe_du_doigt" && action !== "fleche_pointe_objet") return false;
  return local >= actionStart(frames, fps) - 4 && local < frames - Math.round(fps * 0.3);
}

/** Le personnage tient-il l'objet ? (use_tool, dès le début de l'action) */
export function holding(action: AnimeAction, local: number, frames: number, fps: number): boolean {
  return action === "use_tool" && local >= actionStart(frames, fps) - 4 && local < frames - Math.round(fps * 0.2);
}

/**
 * L'angle de l'objet (degrés, sens horaire à l'écran), image par image.
 *   show_tool : il se balance doucement autour de sa position de repos.
 *   use_tool  : poussées répétées — 0,8 s pour pousser, 0,5 s tenu, 0,9 s pour revenir.
 * Clé : de 0° à 9°. Levier : de −7° (le rocher posé) à +4° (le rocher soulevé).
 */
export const TOOL_ANGLES: Record<AnimeTool, [rest: number, pushed: number]> = { wrench: [0, 9], lever: [-7, 4] };
export function toolAngle(tool: AnimeTool, action: AnimeAction, local: number, frames: number, fps: number): number {
  const [rest, pushed] = TOOL_ANGLES[tool];
  if (action !== "use_tool") return rest + (tool === "wrench" ? 2.5 : 1.5) * Math.sin(local / (fps * 0.55));
  const t = (local - actionStart(frames, fps)) / fps;
  if (t <= 0) return rest;
  const cycle = t % 2.6;
  const ease = (x: number) => x * x * (3 - 2 * x);
  const p = cycle < 0.8 ? ease(cycle / 0.8) : cycle < 1.3 ? 1 : cycle < 2.2 ? 1 - ease((cycle - 1.3) / 0.9) : 0;
  return rest + (pushed - rest) * p;
}

/** Le point que l'on désigne, en fraction de l'image (le sujet est à gauche ou au centre, un peu au-dessus du milieu). */
export function focusPoint(focus: AnimeFocus): { x: number; y: number } {
  return focus === "left" ? { x: 0.3, y: 0.46 } : { x: 0.47, y: 0.46 };
}

/**
 * La caméra (effet Ken Burns) : l'image n'est jamais immobile. `t` va de 0 à 1
 * sur la scène. Rend l'échelle et le décalage en fraction de l'image ; le
 * sens change d'une scène à l'autre, et l'échelle couvre toujours le décalage.
 */
export function camera(action: AnimeAction, index: number, t: number): { scale: number; x: number; y: number } {
  const p = Math.min(1, Math.max(0, t));
  const dir = index % 2 === 0 ? 1 : -1;
  if (action === "panoramique") return { scale: 1.2, x: dir * (0.07 - 0.14 * p), y: 0 };
  if (action === "zoom_sur_prof") return { scale: 1.08 + 0.2 * p, x: -0.06 * p, y: -0.05 * p };
  const out = index % 3 === 2;
  return { scale: out ? 1.2 - 0.1 * p : 1.08 + 0.1 * p, x: dir * 0.02 * (1 - 2 * p), y: 0.012 * (2 * p - 1) };
}

/**
 * Les images manquantes (Replicate en panne pour une scène) prennent celle de
 * la scène la plus proche. Rend `false` si AUCUNE image n'existe : la vidéo
 * repasse alors en motion design.
 */
export function fillMissingImages(scenes: { anime?: AnimeScene }[]): boolean {
  const have = scenes.map((s, i) => (s.anime?.image ? i : -1)).filter((i) => i >= 0);
  if (have.length === 0) return false;
  scenes.forEach((s, i) => {
    if (!s.anime || s.anime.image) return;
    const nearest = have.reduce((best, k) => (Math.abs(k - i) < Math.abs(best - i) ? k : best), have[0]!);
    s.anime.image = scenes[nearest]!.anime!.image;
  });
  return true;
}
