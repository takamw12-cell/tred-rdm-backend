import katex from "katex";
import { z } from "zod";
import iconLibrary from "../video-engine/icons.json";

/**
 * « Als Video erklären » en MOTION DESIGN — les blocs visuels et leurs actions.
 *
 * Module pur (aucune base, aucun réseau), testé dans tests/video-motion.test.ts.
 * Il sert au serveur (contrôle du script) ET au navigateur (mise en page et
 * minutage de la composition Remotion, web/video/motion-explanation.tsx).
 *
 * ── Le modèle orchestre, il ne dessine pas ────────────────────────────────
 * Les deux premiers essais (22 nov. 2026) laissaient le modèle poser des
 * traits par coordonnées : croquis tassés, étiquettes sur les traits. Ici il
 * ne donne plus AUCUNE coordonnée. Pour chaque scène il choisit :
 *
 *   · des BLOCS dans une bibliothèque fermée (titre, carte de texte, icône,
 *     formule KaTeX, étapes, liste, courbe, barres, levier) ;
 *   · des ACTIONS dans une liste fermée (fadeIn, slideUp, popIn, write, pulse,
 *     rotate, highlight, pointTo, annotate…), chacune calée sur un MOT de la
 *     voix.
 *
 * La place de chaque bloc est calculée par `layoutBlocks` : deux blocs ne se
 * chevauchent jamais, et quand un bloc arrive, les autres glissent pour lui
 * faire de la place.
 *
 * ── Rien n'est inventé à l'écran ──────────────────────────────────────────
 * `cleanMotion` applique la règle du script : un nombre affiché (texte,
 * formule, barre) doit figurer dans les sources ou dans la question. Un bloc
 * qui échoue est retiré. Une scène sans bloc valable reçoit `defaultMotion`,
 * fabriqué par du code à partir des champs déjà contrôlés de la scène.
 */

/**
 * Le motion design a été REFUSÉ par le fondateur le 23 nov. 2026 (« un diaporama animé ») :
 * il est éteint par défaut. `VIDEO_MOTION=on` le rallume ; sans cela, la composition classique.
 */
export const motionEnabled = (env: Record<string, string | undefined> = process.env): boolean => env.VIDEO_MOTION?.trim().toLowerCase() === "on";

/* ── La bibliothèque ───────────────────────────────────────────────────── */

export const BLOCK_TYPES = ["title", "text", "icon", "formula", "steps", "list", "chart", "bars", "lever"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

/** Les entrées : comment un bloc arrive à l'écran. */
export const ENTRANCES = ["fadeIn", "slideUp", "slideLeft", "popIn", "write"] as const;
/** Les accents : ce qu'on fait d'un bloc déjà là. */
export const EMPHASES = ["pulse", "shake", "rotate", "highlight", "pointTo", "annotate", "fadeOut"] as const;
export const ACTIONS = [...ENTRANCES, ...EMPHASES] as const;
export type MotionActionName = (typeof ACTIONS)[number];

/** Courbes de principe, sans valeurs : seule la FORME est affirmée. */
export const CURVES = ["linear", "proportional", "inverse", "quadratic", "exponential", "decay", "saturation", "sine", "bell", "step"] as const;
export type CurveName = (typeof CURVES)[number];

export const MOTION_COLORS = ["white", "yellow", "blue", "green", "red"] as const;
export type MotionColor = (typeof MOTION_COLORS)[number];

export const TRANSITIONS = ["fade", "wipe", "slide", "zoom"] as const;
export type Transition = (typeof TRANSITIONS)[number];

export interface MotionIcon {
  anim: string;
  paths: string[];
}
/** Les 84 icônes animées (Lucide, licence ISC) : le modèle choisit un nom, le mouvement appartient à l'icône. */
export const MOTION_ICONS = iconLibrary.icons as Record<string, MotionIcon>;
export const MOTION_ICON_NAMES: readonly string[] = Object.keys(MOTION_ICONS);

export const MAX_BLOCKS = 5;
export const MAX_ACTIONS = 12;
const MAX = { title: 64, text: 120, caption: 30, step: 30, item: 56, axis: 20, note: 26, tex: 160 } as const;

/* ── Ce que le modèle écrit ────────────────────────────────────────────── */

/*
 * Tous les champs sont obligatoires et sans liste fermée dans le schéma : la
 * sortie structurée du modèle refuse une grammaire trop grosse (« compiled
 * grammar is too large », essai du 22 nov. 2026 avec des enum et des champs
 * facultatifs). Les listes fermées sont dans la consigne, et `cleanMotion`
 * les applique : un type ou une action inconnus sont retirés.
 */
const blockSchema = z.object({
  id: z.string().describe("Nom court et unique du bloc, en minuscules : « levier », « formule », « force1 »."),
  type: z.string().describe(`Un type de la bibliothèque : ${BLOCK_TYPES.join(", ")}.`),
  text: z.string().describe(`title, text : le texte affiché. icon : le nom EXACT de l'icône. formula : UNE formule en LaTeX pur, sans dollars, copiée de la source. chart : la courbe (${CURVES.join(", ")}). Vide sinon.`),
  items: z.array(z.string()).describe("steps : 2 à 4 étapes de 1 à 4 mots. list : 1 à 4 points de 8 mots au plus. icon : [légende de 1 à 3 mots]. bars : le nom de chaque barre. chart : [nom de l'axe x, nom de l'axe y]. lever : [texte à gauche, texte à droite]. Vide sinon."),
  values: z.array(z.number()).describe("bars : la valeur de chaque barre (des nombres de la source). lever : [longueur du bras gauche, longueur du bras droit], en proportion, des entiers de 1 à 9. Vide sinon."),
  color: z.string().describe(`La couleur d'accent : ${MOTION_COLORS.join(", ")}. Vide : blanc.`),
});

const actionSchema = z.object({
  action: z.string().describe(`Une action de la liste : ${ACTIONS.join(", ")}.`),
  element: z.string().describe("L'id du bloc visé."),
  word: z.string().describe("UN mot copié tel quel de \"voiceover\" : l'action part quand la voix le prononce. Les actions sont dans l'ordre de la voix."),
  target: z.string().describe("pointTo : l'id du bloc vers lequel la flèche va. annotate : le morceau de la formule à désigner, copié tel quel du \"text\" de la formule (par exemple « F_1 »). Vide sinon."),
  text: z.string().describe("annotate : l'étiquette qui apparaît sous le morceau désigné (1 à 3 mots). Vide sinon."),
  angle: z.number().describe("rotate : l'angle en degrés (positif = sens horaire). Pour un levier : de -15 à 15, le côté qui descend. 0 sinon."),
  color: z.string().describe(`pulse, highlight, annotate, pointTo : ${MOTION_COLORS.join(", ")}. Vide : jaune.`),
});

export const motionField = z
  .object({
    blocks: z.array(blockSchema),
    actions: z.array(actionSchema),
    transition: z.string().describe(`Comment la scène arrive : ${TRANSITIONS.join(", ")}.`),
  })
  .describe(`La mise en scène : ${MAX_BLOCKS} blocs au plus, ${MAX_ACTIONS} actions au plus.`);

/** Ce que le modèle a écrit, avant contrôle : rien n'y est garanti. */
export interface RawMotion {
  blocks?: { id?: string; type?: string; text?: string; items?: string[]; values?: number[]; color?: string }[];
  actions?: { action?: string; element?: string; word?: string; target?: string; text?: string; angle?: number; color?: string }[];
  transition?: string;
}

/* ── Ce que la composition joue ────────────────────────────────────────── */

export interface MotionBlock {
  id: string;
  type: BlockType;
  text: string;
  icon: string;
  tex: string;
  items: string[];
  values: number[];
  curve: CurveName | "";
  color: MotionColor;
}

export interface MotionAction {
  action: MotionActionName;
  element: string;
  word: string;
  target: string;
  text: string;
  angle: number;
  color: MotionColor;
}

export interface MotionScene {
  blocks: MotionBlock[];
  actions: MotionAction[];
  transition: Transition;
}

export type MotionDrop = "unknown_type" | "empty" | "unknown_icon" | "bad_tex" | "bad_items" | "bad_values" | "bad_curve" | "number_not_in_sources" | "too_many";

/* ── Contrôle ──────────────────────────────────────────────────────────── */

const clean = (s: unknown, max: number): string => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  // Coupé au dernier mot entier : jamais un mot tronqué à l'écran.
  const cut = t.slice(0, max);
  return (cut.includes(" ") ? cut.slice(0, cut.lastIndexOf(" ")) : cut).replace(/[\s,;:·–-]+$/, "");
};

const colorOf = (raw: unknown, fallback: MotionColor): MotionColor => {
  const c = String(raw ?? "").trim().toLowerCase();
  return (MOTION_COLORS as readonly string[]).includes(c) ? (c as MotionColor) : fallback;
};

/** Les nombres d'un texte, sous la forme canonique de video-script.ts (4,50 → 4.5 ; 1.000 → 1000 et 1). */
function numbersOf(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.normalize("NFKC").match(/\d+(?:[.,]\d+)*/g) ?? []) {
    const parts = raw.split(/[.,]/);
    const trim = (n: string) => {
      const [int, dec = ""] = n.split(".");
      const d = dec.replace(/0+$/, "");
      const i = int!.replace(/^0+(?=\d)/, "");
      return d ? `${i}.${d}` : i;
    };
    if (parts.length === 1) out.push(trim(raw));
    else {
      out.push(trim(`${parts.slice(0, -1).join("")}.${parts[parts.length - 1]}`));
      if (parts.slice(1).every((p) => p.length === 3)) out.push(trim(parts.join("")));
    }
  }
  return out;
}

/** Un chiffre seul (0 à 9) est structurel : exposant, indice, « étape 2 ». */
export const invented = (text: string, allowed: ReadonlySet<string>): boolean => numbersOf(text).some((n) => !/^\d$/.test(n) && !allowed.has(n));

/** La formule est-elle lisible par KaTeX ? (le navigateur n'affiche jamais une formule cassée) */
export function texOk(tex: string): boolean {
  try {
    katex.renderToString(tex, { displayMode: true, throwOnError: true, output: "html" });
    return true;
  } catch {
    return false;
  }
}

/** Où se trouve `part` dans la formule, hors des noms de commandes (« l » n'est pas dans « \\lambda ») et hors des zones déjà prises. */
function findTexPart(tex: string, part: string, taken: [number, number][]): number {
  if (!part) return -1;
  const commands = [...tex.matchAll(/\\[a-zA-Z]+/g)].map((m) => [m.index, m.index + m[0].length] as [number, number]);
  for (let at = tex.indexOf(part); at >= 0; at = tex.indexOf(part, at + 1)) {
    const end = at + part.length;
    // Le morceau peut contenir des commandes entières, jamais en couper une.
    const cuts = commands.some(([a, b]) => at < b && end > a && !(at <= a && end >= b));
    if (!cuts && !taken.some(([a, b]) => at < b && end > a)) return at;
  }
  return -1;
}

/**
 * La formule avec des morceaux marqués (`\htmlClass{mg-p0}{…}`), pour l'action
 * « annotate ». `ok[i]` dit si le morceau i a pu être marqué : un morceau
 * introuvable, ou dont le marquage casse la formule, est laissé tel quel.
 */
export function markTexParts(tex: string, parts: string[]): { tex: string; ok: boolean[] } {
  const ok = parts.map(() => false);
  const taken: [number, number][] = [];
  const build = (ranges: { at: number; end: number; i: number }[]) => {
    let out = tex;
    for (const r of [...ranges].sort((a, b) => b.at - a.at)) out = `${out.slice(0, r.at)}\\htmlClass{mg-p${r.i}}{${out.slice(r.at, r.end)}}${out.slice(r.end)}`;
    return out;
  };
  const kept: { at: number; end: number; i: number }[] = [];
  parts.forEach((part, i) => {
    const at = findTexPart(tex, part, taken);
    if (at < 0) return;
    const candidate = [...kept, { at, end: at + part.length, i }];
    try {
      katex.renderToString(build(candidate), { displayMode: true, throwOnError: true, output: "html", trust: true, strict: false });
    } catch {
      return;
    }
    kept.push(candidate[candidate.length - 1]!);
    taken.push([at, at + part.length]);
    ok[i] = true;
  });
  return { tex: build(kept), ok };
}

function cleanBlock(raw: NonNullable<RawMotion["blocks"]>[number], allowed: ReadonlySet<string>): MotionBlock | MotionDrop {
  const type = String(raw.type ?? "").trim().toLowerCase() as BlockType;
  if (!(BLOCK_TYPES as readonly string[]).includes(type)) return "unknown_type";
  const base: MotionBlock = { id: "", type, text: "", icon: "", tex: "", items: [], values: [], curve: "", color: colorOf(raw.color, "white") };
  const items = (raw.items ?? []).map((x) => clean(x, type === "steps" ? MAX.step : type === "chart" ? MAX.axis : MAX.item)).filter(Boolean);
  const values = (raw.values ?? []).filter((v) => Number.isFinite(v));

  if (type === "title" || type === "text") {
    base.text = clean(raw.text, type === "title" ? MAX.title : MAX.text);
    if (!base.text) return "empty";
  } else if (type === "icon") {
    base.icon = String(raw.text ?? "").trim().toLowerCase();
    if (!MOTION_ICONS[base.icon]) return "unknown_icon";
    base.text = clean(raw.items?.[0], MAX.caption);
  } else if (type === "formula") {
    base.tex = String(raw.text ?? "").trim().replace(/^\$+|\$+$/g, "");
    if (!base.tex || base.tex.length > MAX.tex || !texOk(base.tex)) return "bad_tex";
  } else if (type === "steps") {
    if (items.length < 2) return "bad_items";
    base.items = items.slice(0, 4);
  } else if (type === "list") {
    if (items.length < 1) return "bad_items";
    base.items = items.slice(0, 4);
  } else if (type === "chart") {
    const curve = String(raw.text ?? "").trim().toLowerCase();
    if (!(CURVES as readonly string[]).includes(curve)) return "bad_curve";
    base.curve = curve as CurveName;
    base.items = [items[0] ?? "", items[1] ?? ""];
  } else if (type === "bars") {
    const n = Math.min(items.length, values.length, 4);
    if (n < 2 || values.slice(0, n).some((v) => v <= 0)) return "bad_values";
    base.items = items.slice(0, n);
    base.values = values.slice(0, n);
  } else if (type === "lever") {
    // Les bras sont une PROPORTION (1 à 9), pas une mesure : aucun nombre n'est affiché pour eux.
    const [a, b] = [Math.round(values[0] ?? 1), Math.round(values[1] ?? 1)];
    if (!(a >= 1 && a <= 9 && b >= 1 && b <= 9)) return "bad_values";
    base.values = [a, b];
    base.items = [clean(raw.items?.[0], MAX.caption), clean(raw.items?.[1], MAX.caption)];
  }

  const shown = [base.text, base.tex, ...base.items, ...(type === "bars" ? base.values.map(String) : [])].join(" ");
  if (invented(shown, allowed)) return "number_not_in_sources";
  return base;
}

/**
 * La mise en scène du modèle, contrôlée. `null` : aucun bloc valable (la scène
 * prend alors `defaultMotion`).
 */
export function cleanMotion(raw: RawMotion | undefined | null, allowed: ReadonlySet<string>): { motion: MotionScene | null; dropped: MotionDrop[] } {
  const dropped: MotionDrop[] = [];
  const blocks: MotionBlock[] = [];
  /** id écrit par le modèle → id gardé. */
  const ids = new Map<string, string>();
  for (const rawBlock of raw?.blocks ?? []) {
    if (blocks.length >= MAX_BLOCKS) {
      dropped.push("too_many");
      continue;
    }
    const block = cleanBlock(rawBlock, allowed);
    if (typeof block === "string") {
      dropped.push(block);
      continue;
    }
    const wanted = String(rawBlock.id ?? "").trim();
    let id = wanted.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24) || `${block.type}${blocks.length + 1}`;
    while (blocks.some((b) => b.id === id)) id = `${id}_${blocks.length + 1}`;
    if (wanted && !ids.has(wanted)) ids.set(wanted, id);
    blocks.push({ ...block, id });
  }
  if (blocks.length === 0) return { motion: null, dropped };

  const actions: MotionAction[] = [];
  for (const a of raw?.actions ?? []) {
    if (actions.length >= MAX_ACTIONS) break;
    const name = String(a.action ?? "").trim() as MotionActionName;
    if (!(ACTIONS as readonly string[]).includes(name)) continue;
    const element = ids.get(String(a.element ?? "").trim());
    const block = blocks.find((b) => b.id === element);
    if (!element || !block) continue;
    const action: MotionAction = { action: name, element, word: clean(a.word, 40), target: "", text: "", angle: 0, color: colorOf(a.color, "yellow") };
    if (name === "pointTo") {
      const target = ids.get(String(a.target ?? "").trim());
      if (!target || target === element) continue;
      action.target = target;
    } else if (name === "annotate") {
      const part = String(a.target ?? "").trim();
      const note = clean(a.text, MAX.note);
      if (block.type !== "formula" || !note || invented(note, allowed) || !markTexParts(block.tex, [part]).ok[0]) continue;
      action.target = part;
      action.text = note;
    } else if (name === "rotate") {
      const limit = block.type === "lever" ? 15 : 360;
      action.angle = Math.max(-limit, Math.min(limit, typeof a.angle === "number" && Number.isFinite(a.angle) ? a.angle : 0));
    }
    actions.push(action);
  }
  const t = String(raw?.transition ?? "").trim().toLowerCase();
  return { motion: { blocks, actions, transition: (TRANSITIONS as readonly string[]).includes(t) ? (t as Transition) : "fade" }, dropped };
}

/** Les champs d'une scène déjà contrôlée, dont `defaultMotion` a besoin. */
export interface MotionSource {
  heading: string;
  bullets: string[];
  formula: string;
  steps?: string[];
  visual?: string;
  stage?: string;
}

/**
 * La mise en scène par défaut, fabriquée par du code : la scène n'est jamais
 * vide, même si le modèle n'a rien donné de valable. Tous ses textes viennent
 * de champs déjà contrôlés (`validateVideoScript`).
 */
export function defaultMotion(scene: MotionSource, index = 0): MotionScene {
  const blocks: MotionBlock[] = [];
  const actions: MotionAction[] = [];
  const add = (b: Partial<MotionBlock> & Pick<MotionBlock, "id" | "type">, action: MotionActionName) => {
    blocks.push({ text: "", icon: "", tex: "", items: [], values: [], curve: "", color: "white", ...b });
    actions.push({ action, element: b.id, word: "", target: "", text: "", angle: 0, color: "yellow" });
  };
  const bullets = scene.bullets.map((b) => clean(b, MAX.item)).filter(Boolean);
  const steps = (scene.steps ?? []).map((s) => clean(s, MAX.step)).filter(Boolean);
  const formula = scene.formula.trim();

  if (scene.visual === "question" || scene.stage === "hook") {
    add({ id: "question", type: "title", text: clean(scene.heading, MAX.title), color: "yellow" }, "write");
    add({ id: "mark", type: "icon", icon: "lightbulb" }, "popIn");
  } else if (scene.visual === "flowchart" && steps.length >= 2) {
    add({ id: "steps", type: "steps", items: steps.slice(0, 4) }, "write");
  } else if (scene.visual === "recap" && bullets.length > 0) {
    add({ id: "recap", type: "list", items: bullets.slice(0, 4), color: "green" }, "write");
  } else if (formula && formula.length <= MAX.tex && texOk(formula)) {
    add({ id: "formula", type: "formula", tex: formula }, "write");
    actions.push({ action: "highlight", element: "formula", word: "", target: "", text: "", angle: 0, color: "yellow" });
    if (bullets[0]) add({ id: "point", type: "text", text: bullets[0] }, "slideUp");
  } else {
    add({ id: "title", type: "title", text: clean(scene.heading, MAX.title) }, "write");
    bullets.slice(0, 2).forEach((b, i) => add({ id: `point${i + 1}`, type: "text", text: b }, "slideUp"));
  }
  return { blocks, actions, transition: TRANSITIONS[index % TRANSITIONS.length]! };
}

/* ── La consigne ───────────────────────────────────────────────────────── */

export function motionPromptBlock(): string {
  return `LA MISE EN SCÈNE — "motion" : tu ORCHESTRES, tu ne dessines pas
La vidéo est un film de motion design : fond sombre, typographie nette, éléments qui glissent, rebondissent et se répondent. Tu ne donnes AUCUNE coordonnée et tu ne traces aucun trait : pour chaque scène tu choisis des BLOCS dans la bibliothèque de TRED, puis des ACTIONS qui les animent quand la voix en parle. TRED place les blocs lui-même (jamais de chevauchement) et les fait glisser quand un nouveau bloc arrive.
Remplis "motion" pour CHAQUE scène, en plus de "visual_cues". Dans cette vidéo, seuls ces ordres existent pour "visual_cues" : ask_question, draw_flowchart, write_equation, write_points, check_recap — c'est "motion" qui montre tout le reste (pas d'image, pas de texte surligné, pas de code, pas de poutre).

LES BLOCS ("blocks", 1 à 4 par scène, ${MAX_BLOCKS} au plus)
- "title" : une phrase en très grand ("text", 10 mots au plus). Pour la question mystère, une idée forte.
- "text" : une carte de texte ("text", 16 mots au plus). Une idée par carte.
- "icon" : une icône animée ("text" = un nom EXACT de la liste, "items" = [légende de 1 à 3 mots]). Une icône par objet ou idée que la voix nomme — jamais pour décorer. Liste : ${MOTION_ICON_NAMES.join(", ")}.
- "formula" : UNE formule ("text" = LaTeX pur, sans dollars, copié de la source). Elle s'écrit signe après signe.
- "steps" : 2 à 4 étapes qui s'enchaînent ("items"), reliées par des flèches.
- "list" : 1 à 4 points qui se cochent ("items"). Pour le récapitulatif.
- "chart" : une courbe de principe qui se trace ("text" = la courbe, parmi ${CURVES.join(", ")} ; "items" = [axe x, axe y]). Aucune valeur : seule la forme compte (« proportional » : quand x double, y double ; « inverse » : quand x double, y est divisé par deux).
- "bars" : 2 à 4 barres qui poussent ("items" = les noms, "values" = les valeurs). Pour comparer des grandeurs de la source.
- "lever" : un levier sur son pivot, avec une force à chaque bout ("values" = [bras gauche, bras droit] en proportion, entiers de 1 à 9 ; "items" = [texte à gauche, texte à droite]). Pour un levier, une balance, un moment, un équilibre.
Chaque bloc a un "id" court et unique. "color" est son accent : ${MOTION_COLORS.join(", ")}.

LES ACTIONS ("actions", ${MAX_ACTIONS} au plus, dans l'ordre de la voix)
Chaque action vise un bloc ("element" = son id) et part sur un MOT ("word") copié tel quel de "voiceover" : choisis le mot où la voix NOMME la chose.
- Entrées (la première action d'un bloc) : "fadeIn", "slideUp", "slideLeft", "popIn" (rebond), "write" (le texte arrive mot à mot, la formule s'écrit, la courbe se trace).
- "pulse" : le bloc bat une fois et prend la couleur "color". Pour insister sur ce que la voix dit à cet instant.
- "shake" : le bloc tremble. Pour une erreur, un danger, une chose qui résiste.
- "rotate" : le bloc tourne de "angle" degrés. Sur un "lever" : il penche (de -15 à 15 ; négatif = le côté gauche descend, 0 = retour à l'équilibre).
- "highlight" : un encadré se trace autour du bloc. Pour le résultat, la formule clé.
- "pointTo" : une flèche part du bloc et va vers le bloc "target". Pour relier une cause à son effet, un objet à sa formule.
- "annotate" : seulement sur une "formula" — désigne un morceau de la formule ("target", copié tel quel de son "text", par exemple « F_1 ») et écrit dessous l'étiquette "text" (1 à 3 mots). Pour dire ce qu'est chaque variable.
- "fadeOut" : le bloc s'en va, les autres se recentrent et grandissent. Garde 2 ou 3 blocs à l'écran à la fois : fais sortir un bloc dont la voix ne parle plus avant d'en faire entrer un quatrième.
Un bloc sans action entre tout seul, dans l'ordre. "transition" dit comment la scène arrive : ${TRANSITIONS.join(", ")} — varie-les.

UNE BONNE SCÈNE
- Elle se construit : un bloc arrive, la voix l'explique, un deuxième arrive, une flèche les relie, un encadré marque le résultat.
- Elle ne reste jamais immobile : UNE ACTION TOUTES LES 4 À 6 SECONDES de voix (15 mots de voix ≈ 6 secondes), réparties du premier au dernier mot. Une scène de 50 mots a donc au moins 4 actions et au moins 2 blocs. Un seul bloc pour toute une scène, c'est une diapositive : interdit dès que la voix dépasse 20 mots.
- La question mystère ("hook") : le "title" (la question, courte), puis un deuxième bloc qui intrigue — l'icône de l'objet, un levier, une courbe — et un "pulse" ou un "shake" sur le mot fort.
- Le récapitulatif ("recap") : la "list", et à côté la formule ou l'icône clé de la leçon, avec un "highlight" à la fin.
- Une formule mérite une suite : "write", puis un "annotate" par variable importante, puis "highlight".
- Les mêmes règles que le script : aucun nombre qui ne figure pas dans une source ou dans la question. Un bloc qui affiche un nombre inconnu est retiré.
- Écris les textes des blocs dans la langue de l'étudiant.

EXEMPLE (une scène sur le moment d'une force)
"motion": {"transition":"wipe","blocks":[{"id":"cle","type":"icon","text":"wrench","items":["Schraubenschlüssel"]},{"id":"moment","type":"formula","text":"M = F \\\\cdot l"},{"id":"regle","type":"text","text":"Längerer Hebelarm, größeres Moment","color":"yellow"}],"actions":[{"action":"popIn","element":"cle","word":"Schraubenschlüssel"},{"action":"write","element":"moment","word":"Moment"},{"action":"annotate","element":"moment","word":"Kraft","target":"F","text":"Kraft"},{"action":"annotate","element":"moment","word":"Hebelarm","target":"l","text":"Hebelarm"},{"action":"pointTo","element":"cle","target":"moment","word":"länger"},{"action":"slideUp","element":"regle","word":"größer"},{"action":"highlight","element":"moment","word":"merken"}]}`;
}

/* ── La mise en page (calculée, jamais donnée par le modèle) ───────────── */

export interface Size {
  w: number;
  h: number;
}
export interface Rect extends Size {
  /** Le CENTRE du bloc. */
  x: number;
  y: number;
  scale: number;
}

const GAP = 30;

/** La taille naturelle d'un bloc, en points logiques de la composition. `narrow` : vidéo verticale. */
export function blockSize(block: MotionBlock, narrow = false): Size {
  const lines = (text: string, perLine: number) => Math.max(1, Math.ceil(text.length / perLine));
  switch (block.type) {
    case "title": {
      const size = titleFont(block.text, narrow);
      const perLine = Math.floor((narrow ? 440 : 780) / (size * 0.52));
      return { w: Math.min(narrow ? 440 : 780, block.text.length * size * 0.52 + 20), h: lines(block.text, perLine) * size * 1.14 + 24 };
    }
    case "text":
      return { w: narrow ? 400 : 330, h: 44 + lines(block.text, narrow ? 30 : 25) * 29 };
    case "icon":
      return { w: 170, h: block.text ? 150 + lines(block.text, 15) * 22 : 130 };
    case "formula": {
      // Large comme sa formule (commandes et accolades ne comptent pas) ; la composition la réduit si elle déborde.
      const glyphs = block.tex.replace(/\\[a-zA-Z]+/g, "x").replace(/[\s{}^_]/g, "").length;
      return { w: Math.min(narrow ? 440 : 500, Math.max(230, 90 + glyphs * 24)), h: 132 };
    }
    case "steps":
      return narrow ? { w: 300, h: block.items.length * 62 + (block.items.length - 1) * 30 } : { w: block.items.length * 176 + (block.items.length - 1) * 44, h: 78 };
    case "list":
      return { w: narrow ? 430 : 520, h: block.items.reduce((h, item) => h + 20 + lines(item, narrow ? 30 : 38) * 28, 0) + (block.items.length - 1) * 10 };
    case "chart":
    case "bars":
      return { w: 364, h: 240 };
    case "lever":
      return { w: narrow ? 440 : 540, h: 250 };
  }
}

/** Le corps d'un titre selon sa longueur : court = très grand. */
export function titleFont(text: string, narrow = false): number {
  const base = text.length <= 18 ? 62 : text.length <= 34 ? 50 : text.length <= 50 ? 42 : 36;
  return narrow ? Math.round(base * 0.72) : base;
}

/**
 * Place des blocs dans la zone : rangées centrées, jamais de chevauchement.
 * Toutes les coupes en rangées sont essayées ; on garde celle qui laisse les
 * blocs les plus grands (à égalité : le moins de rangées). `spacing` : l'écart
 * entre deux blocs — plus large quand une flèche doit passer entre eux.
 */
export function layoutBlocks(sizes: Size[], area: { x: number; y: number; w: number; h: number }, maxScale = 1.35, spacing = GAP): Rect[] {
  const n = sizes.length;
  if (n === 0) return [];
  let best: { scale: number; rows: number[][] } | null = null;
  // Chaque bit dit si une rangée se termine après le bloc i.
  for (let mask = 0; mask < 1 << (n - 1); mask++) {
    const rows: number[][] = [[]];
    for (let i = 0; i < n; i++) {
      rows[rows.length - 1]!.push(i);
      if (i < n - 1 && mask & (1 << i)) rows.push([]);
    }
    if (rows.length > 3) continue;
    const width = Math.max(...rows.map((r) => r.reduce((w, i) => w + sizes[i]!.w, 0) + (r.length - 1) * spacing));
    const height = rows.reduce((h, r) => h + Math.max(...r.map((i) => sizes[i]!.h)), 0) + (rows.length - 1) * spacing;
    const scale = Math.min(maxScale, area.w / width, area.h / height);
    if (!best || scale > best.scale + 1e-6 || (Math.abs(scale - best.scale) <= 1e-6 && rows.length < best.rows.length)) best = { scale, rows };
  }
  const { scale, rows } = best!;
  const gap = spacing * scale;
  const rowH = rows.map((r) => Math.max(...r.map((i) => sizes[i]!.h)) * scale);
  const total = rowH.reduce((a, b) => a + b, 0) + (rows.length - 1) * gap;
  const out: Rect[] = [];
  let y = area.y + (area.h - total) / 2;
  rows.forEach((row, k) => {
    const width = row.reduce((w, i) => w + sizes[i]!.w * scale, 0) + (row.length - 1) * gap;
    let x = area.x + (area.w - width) / 2;
    for (const i of row) {
      const w = sizes[i]!.w * scale;
      out[i] = { x: x + w / 2, y: y + rowH[k]! / 2, w: sizes[i]!.w, h: sizes[i]!.h, scale };
      x += w + gap;
    }
    y += rowH[k]! + gap;
  });
  return out;
}

/* ── Le minutage (calé sur la voix) ────────────────────────────────────── */

export interface TimedAction extends MotionAction {
  /** L'image, dans la scène, où l'action part. */
  at: number;
}

export interface BlockTiming {
  /** Image d'entrée dans la scène, et de sortie (fadeOut) ou Infinity. */
  enter: number;
  exit: number;
  entrance: (typeof ENTRANCES)[number];
}

const isEntrance = (a: string): a is (typeof ENTRANCES)[number] => (ENTRANCES as readonly string[]).includes(a);
const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[^\p{L}\p{N}]/gu, "");

/**
 * Quand part chaque action ? Sur le mot que le modèle a désigné, cherché dans
 * les mots horodatés de la scène, dans l'ordre. Un mot introuvable (ou vide) :
 * l'action se place à intervalles réguliers entre ses voisines. Toujours
 * croissant, avec un écart minimal : deux actions ne se marchent pas dessus.
 * La première action ouvre toujours la scène.
 *
 * `words` : les mots de la scène, `at` en images depuis le début de la scène.
 */
export function resolveTimeline(motion: MotionScene, words: { text: string; at: number }[], frames: number, fps = 30): { actions: TimedAction[]; blocks: Record<string, BlockTiming> } {
  const lead = Math.round(fps * 0.15);
  const minGap = Math.round(fps * 0.3);
  const first = Math.round(fps * 0.25);
  const last = Math.max(first, frames - Math.round(fps * 0.9));

  // Un bloc sans entrée en reçoit une, juste avant sa première action (ou à son tour).
  const list: MotionAction[] = [];
  const entered = new Set<string>();
  for (const a of motion.actions) {
    if (!entered.has(a.element)) {
      entered.add(a.element);
      if (!isEntrance(a.action)) list.push({ action: "fadeIn", element: a.element, word: a.word, target: "", text: "", angle: 0, color: "yellow" });
    } else if (isEntrance(a.action)) continue; // une seule entrée par bloc
    if (a.action === "pointTo" && !entered.has(a.target)) {
      // La flèche ne peut pas viser un bloc absent : il entre avec elle.
      entered.add(a.target);
      list.push({ action: "fadeIn", element: a.target, word: a.word, target: "", text: "", angle: 0, color: "yellow" });
    }
    list.push(a);
  }
  for (const b of motion.blocks) {
    if (!entered.has(b.id)) list.push({ action: b.type === "formula" || b.type === "title" ? "write" : "slideUp", element: b.id, word: "", target: "", text: "", angle: 0, color: "yellow" });
  }

  // 1. Le mot de chaque action, cherché dans l'ordre.
  const wanted: (number | null)[] = [];
  let cursor = 0;
  for (const a of list) {
    const token = norm(a.word.split(/\s+/)[0] ?? "");
    let at: number | null = null;
    if (token.length >= 2) {
      for (let k = cursor; k < words.length; k++) {
        const w = norm(words[k]!.text);
        if (w === token || (token.length >= 5 && w.startsWith(token.slice(0, Math.max(5, token.length - 2))))) {
          at = words[k]!.at - lead;
          cursor = k;
          break;
        }
      }
    }
    wanted.push(at);
  }
  // 2. Les actions sans mot : réparties entre leurs voisines connues.
  for (let i = 0; i < wanted.length; i++) {
    if (wanted[i] !== null) continue;
    let j = i;
    while (j < wanted.length && wanted[j] === null) j++;
    const from = i === 0 ? first : wanted[i - 1]!;
    const to = j < wanted.length ? wanted[j]! : last;
    const count = j - i;
    const lead0 = i === 0 ? 0 : 1;
    for (let k = 0; k < count; k++) wanted[i + k] = from + ((to - from) * (k + lead0)) / (count + lead0);
    i = j - 1;
  }
  // 3. Croissant, espacé, dans la scène. La première action part dès le début
  //    de la scène, quel que soit son mot : l'écran n'est jamais vide (essai réel
  //    du 23 nov. 2026 : onze secondes de fond nu avant le premier bloc).
  if (wanted.length > 0) wanted[0] = first;
  const actions: TimedAction[] = [];
  list.forEach((a, i) => {
    const min = i === 0 ? first : actions[i - 1]!.at + minGap;
    const room = last - (list.length - 1 - i) * minGap;
    actions.push({ ...a, at: Math.round(Math.max(Math.min(min, room), Math.min(Math.max(wanted[i]!, min), room))) });
  });

  const blocks: Record<string, BlockTiming> = {};
  for (const a of actions) {
    if (!blocks[a.element]) blocks[a.element] = { enter: a.at, exit: Number.POSITIVE_INFINITY, entrance: isEntrance(a.action) ? a.action : "fadeIn" };
    else if (a.action === "fadeOut") blocks[a.element]!.exit = Math.min(blocks[a.element]!.exit, a.at);
  }
  return { actions, blocks };
}

/* ── La musique baissée sous la voix (le même réglage que le moteur MP4) ── */

const MUSIC_GAIN = 10 ** (-10 / 20);
const DUCK_GAIN = 10 ** (-20 / 20);
const DUCK_ATTACK = 0.3;
const DUCK_RELEASE = 0.7;

/** Les passages parlés : des mots séparés par moins de `gapMs` forment un seul passage. */
export function speechSpans(words: { startMs: number; endMs: number }[], gapMs = 700): [number, number][] {
  const spans: [number, number][] = [];
  for (const w of words) {
    const lastSpan = spans[spans.length - 1];
    if (lastSpan && w.startMs - lastSpan[1] * 1000 <= gapMs) lastSpan[1] = Math.max(lastSpan[1], w.endMs / 1000);
    else spans.push([w.startMs / 1000, w.endMs / 1000]);
  }
  return spans;
}

/**
 * Le volume de la musique à l'instant `t` (secondes) : −20 dB sous la voix,
 * −10 dB dans les silences, avec une attaque de 0,3 s et un relâchement de
 * 0,7 s ; fondu au début et à la fin de la vidéo.
 */
export function musicGain(t: number, spans: [number, number][], duration: number): number {
  let duck = 0;
  for (const [a, b] of spans) {
    if (t < a - DUCK_ATTACK || t > b + DUCK_RELEASE) continue;
    duck = Math.max(duck, Math.min(1, (t - (a - DUCK_ATTACK)) / DUCK_ATTACK, (b + DUCK_RELEASE - t) / DUCK_RELEASE));
  }
  const gain = MUSIC_GAIN + (DUCK_GAIN - MUSIC_GAIN) * Math.max(0, duck);
  return gain * Math.max(0, Math.min(1, t / 0.6)) * Math.max(0, Math.min(1, (duration - t) / 1.5));
}
