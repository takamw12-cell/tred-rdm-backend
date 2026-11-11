import { z } from "zod";
import type { Language } from "./languages";
import { runBalkenstatik, type BalkenstatikInput, type BeamDiagramPayload } from "./beam-tool";
import { collectNumbers, type SolverRun } from "./solver-results";
import { CHARTS, MAX_FLOW_STEPS, MAX_KEYWORDS, REAL_IMAGE_KEYS, VISUALS, resolveVisual, type ChartKey, type RealImageKey, type Visual } from "./video-visuals";

/**
 * « Als Video erklären » — le script de la vidéo explicative, et son contrôle.
 *
 * Module pur (aucune base, aucun réseau), testé dans tests/video-script.test.ts.
 *
 * ── Zéro hallucination, vérifiée par du code ──────────────────────────────
 *
 * Le prompt interdit au modèle d'inventer, mais un prompt ne garantit rien.
 * Chaque scène doit donc citer sa source (`sourceIndex`) : un extrait du
 * cours, avec une citation (`quote`), ou un calcul d'un solveur.
 * `validateVideoScript` vérifie, sans modèle :
 *
 *   1. pour un extrait de cours, que la citation s'y retrouve mot pour mot ;
 *   2. que chaque nombre dit, affiché ou écrit dans une formule figure dans
 *      les extraits, dans une sortie de solveur (lib/solver-results.ts) ou
 *      dans la question de l'étudiant. Tout autre nombre est rejeté.
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
/** Les exemples du quotidien éclairent l'explication, ils ne la remplacent pas. */
export const MAX_ANALOGIES = 2;
export const MAX_SCENES = 14;
const MIN_QUOTE_CHARS = 12;

export interface VideoSource {
  title: string;
  kind?: string;
  content: string;
  /**
   * Présent : la source est un calcul de solveur (entrée + sortie), pas un
   * extrait de cours. Aucune citation n'est exigée — ce sont des données, pas
   * un texte — mais ses nombres sont les seuls que la scène peut employer.
   */
  solver?: SolverRun;
}

/** Un calcul de solveur, présenté comme une source numérotée du script. */
export function solverSource(run: SolverRun): VideoSource {
  return {
    title: `Solver · ${run.solver}`,
    kind: "solver",
    content: `EINGABE: ${JSON.stringify(run.input)}\nERGEBNIS: ${JSON.stringify(run.output)}`,
    solver: run,
  };
}

export const videoSceneSchema = z.object({
  kind: z
    .enum(["explanation", "analogy"])
    .describe("explanation : la scène explique le cours et cite sa source. analogy : un exemple de la vie courante, sans chiffre ni formule (deux au plus)."),
  visual: z
    .enum(VISUALS)
    .describe(
      "Ce que la scène MONTRE. highlight : la phrase du cours avec ses mots-clés surlignés. flowchart : un enchaînement d'étapes. formula : la formule en grand, ligne par ligne. beam : la poutre se dessine. loads : les charges arrivent sur la poutre et elle fléchit. solver_plot : le schéma exact du solveur. chart : une courbe de principe. real_image : une image d'illustration. text : une feuille avec les points.",
    ),
  steps: z.array(z.string()).describe(`Seulement pour visual = flowchart : 2 à ${MAX_FLOW_STEPS} étapes dans l'ordre, 1 à 4 mots chacune. Tableau vide sinon.`),
  keywords: z.array(z.string()).describe(`Seulement pour visual = highlight : 1 à ${MAX_KEYWORDS} mots-clés copiés tels quels de "quote". Tableau vide sinon.`),
  chart: z.string().describe(`Seulement pour visual = chart : ${CHARTS.join(", ")}. Chaîne vide sinon.`),
  image: z.string().describe(`Seulement pour visual = real_image : un mot-clé parmi ${REAL_IMAGE_KEYS.join(", ")}. Chaîne vide sinon.`),
  heading: z.string().describe("Titre court de la scène, 2 à 6 mots."),
  bullets: z.array(z.string()).describe("0 à 3 points très courts affichés à l'écran."),
  formula: z.string().describe("UNE formule en LaTeX pur, copiée de l'extrait cité. Chaîne vide s'il n'y en a pas."),
  sourceIndex: z.number().int().describe("Numéro de la source citée : 1 pour [S1], 2 pour [S2]…"),
  quote: z.string().describe("Pour un extrait de cours : UNE phrase courte (8 à 25 mots) copiée MOT POUR MOT de l'extrait, sans formule, qui prouve ce que dit la scène. Pour un calcul de solveur : chaîne vide."),
  voiceover: z.string().describe("Ce que dit la voix pendant la scène. Langue parlée, sans LaTeX ni symboles."),
});

const beamSchema = z.object({
  laenge: z.number().describe("Longueur de la poutre"),
  lager: z.array(z.object({ x: z.number(), art: z.enum(["loslager", "festlager", "einspannung"]), name: z.string() })).describe("Appuis, x depuis l'extrémité gauche"),
  einzellasten: z.array(z.object({ x: z.number(), F: z.number() })).describe("Forces ponctuelles, positives vers le bas"),
  streckenlasten: z.array(z.object({ von: z.number(), bis: z.number(), q: z.number() })).describe("Charges réparties constantes, positives vers le bas"),
  einheiten: z.object({ laenge: z.enum(["m", "cm", "mm"]), kraft: z.enum(["N", "kN", "MN"]) }),
});

export const videoScriptSchema = z.object({
  title: z.string().describe("Titre court de la vidéo."),
  backdrop: z.string().describe(`L'image de contexte de TOUTE la vidéo, selon la matière : un mot-clé parmi ${REAL_IMAGE_KEYS.join(", ")}.`),
  beam: beamSchema
    .nullable()
    .describe(
      "Seulement si la question porte sur une poutre ET qu'un extrait de cours donne un exemple chiffré complet (longueur, appuis, charges) : recopie ses données ici, sans rien calculer. Le solveur de TRED fera le calcul et le schéma. null dans tous les autres cas.",
    ),
  scenes: z.array(videoSceneSchema),
});

export type VideoScene = z.infer<typeof videoSceneSchema>;
export type VideoScript = z.infer<typeof videoScriptSchema>;

/** Une scène validée : la source est résolue (titre du document). */
export interface ValidatedScene extends Omit<VideoScene, "visual" | "image" | "chart"> {
  sourceTitle: string;
  /** « document » : prouvée par une citation ; « solver » : par un calcul ; « analogy » : exemple du quotidien, sans chiffre. */
  sourceKind: "document" | "solver" | "analogy";
  /** Ce que la scène montre, garde-fous appliqués (video-visuals.ts). */
  visual: Visual;
  image: RealImageKey | null;
  chart: ChartKey | null;
}

export type DropReason =
  | "unknown_source"
  | "quote_too_short"
  | "quote_not_in_source"
  | "number_not_in_sources"
  | "empty_voiceover"
  | "number_in_analogy"
  | "too_many_analogies";

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

/* ── Citations ─────────────────────────────────────────────────────────── */

/**
 * Seuil au-dessus duquel une citation est considérée comme tirée de l'extrait.
 *
 * Le premier contrôle exigeait une copie caractère pour caractère. Le premier
 * essai réel (11 nov. 2026) a rejeté 12 scènes sur 12 : le texte extrait d'un
 * PDF est plein de coupures de ligne, de mots coupés par un tiret, de
 * ligatures et de symboles, et le modèle, même en recopiant, répare ces
 * accidents sans le vouloir. Une égalité stricte refusait donc des citations
 * authentiques.
 *
 * On compare maintenant des MOTS, et on mesure quelle part des suites de trois
 * mots de la citation se retrouve dans l'extrait. Une citation recopiée, même
 * abîmée, dépasse largement le seuil ; une phrase inventée, reformulée ou
 * traduite reste proche de zéro.
 */
export const QUOTE_SUPPORT_MIN = 0.6;
const MIN_QUOTE_WORDS = 4;

/** Les mots d'un texte, pour comparer : minuscules, sans ponctuation, mots coupés en fin de ligne recollés. */
export function quoteTokens(text: string): string[] {
  return (
    text
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\u00AD/g, "")
      // « Gleich-\nstreckenlast » → « Gleichstreckenlast »
      .replace(/(\p{L})[-\u2010\u2011]\s*\n\s*(\p{L})/gu, "$1$2")
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

const grams = (tokens: string[], n: number): string[] => {
  const out: string[] = [];
  for (let i = 0; i + n <= tokens.length; i++) out.push(tokens.slice(i, i + n).join(" "));
  return out;
};

/** L'extrait, préparé une fois pour vérifier plusieurs citations. */
export function indexSource(content: string): { text: string; words: Set<string>; trigrams: Set<string> } {
  const tokens = quoteTokens(content);
  return { text: ` ${tokens.join(" ")} `, words: new Set(tokens), trigrams: new Set(grams(tokens, 3)) };
}

/**
 * À quel point la citation est portée par l'extrait, de 0 à 1.
 * 1 : elle s'y trouve telle quelle (aux espaces et à la ponctuation près).
 */
export function quoteSupport(quote: string, source: ReturnType<typeof indexSource>): number {
  const tokens = quoteTokens(quote);
  if (tokens.length < MIN_QUOTE_WORDS) return 0;
  if (source.text.includes(` ${tokens.join(" ")} `)) return 1;
  const tri = grams(tokens, 3);
  const inOrder = tri.filter((g) => source.trigrams.has(g)).length / tri.length;
  const known = tokens.filter((t) => source.words.has(t)).length / tokens.length;
  // Les suites de mots comptent (l'ordre fait la citation) ; les mots seuls ne suffisent jamais.
  return Math.min(inOrder, known);
}

/* ── Contrôle ──────────────────────────────────────────────────────────── */

/**
 * Garde les scènes prouvées par les extraits, supprime les autres.
 * `question` : les nombres de l'énoncé de l'étudiant sont permis (il les a donnés).
 */
export function validateVideoScript(script: Pick<VideoScript, "title" | "scenes">, sources: VideoSource[], question = "", has: { beam: boolean } = { beam: false }): ValidationResult {
  const indexed = sources.map((s) => (s.solver ? null : indexSource(s.content)));
  // Les nombres permis : ceux du cours, ceux de la question, et ceux que les
  // solveurs ont calculés (avec leurs arrondis et conversions d'unité).
  const allowed = new Set<string>([...sources.filter((s) => !s.solver).flatMap((s) => extractNumbers(s.content)), ...extractNumbers(question)]);
  for (const s of sources) if (s.solver) collectNumbers([s.solver.input, s.solver.output], extractNumbers, allowed);
  const dropped: { index: number; reason: DropReason; detail?: string }[] = [];
  const scenes: ValidatedScene[] = [];

  let analogies = 0;
  script.scenes.slice(0, MAX_SCENES).forEach((scene, index) => {
    if (!scene.voiceover.trim()) return void dropped.push({ index, reason: "empty_voiceover" });
    const shown = resolveVisual(scene, has);

    // Un exemple du quotidien ne cite rien — donc il n'affirme rien de chiffré :
    // aucun nombre, aucune formule. Il éclaire, il ne remplace pas le cours.
    if (scene.kind === "analogy") {
      if (analogies >= MAX_ANALOGIES) return void dropped.push({ index, reason: "too_many_analogies" });
      const figure = extractNumbers([scene.heading, ...scene.bullets, ...(scene.steps ?? []), scene.voiceover].join(" ")).find((n) => !isStructural(n));
      if (figure !== undefined) return void dropped.push({ index, reason: "number_in_analogy", detail: figure });
      analogies++;
      // Un exemple n'a ni citation à surligner, ni formule, ni calcul.
      const visual = shown.visual === "formula" || shown.visual === "solver_plot" || shown.visual === "highlight" ? "text" : shown.visual;
      return void scenes.push({ ...scene, formula: "", quote: "", bullets: scene.bullets.slice(0, 3), sourceTitle: "", sourceKind: "analogy", ...shown, visual });
    }

    // Le schéma du solveur se prouve par le calcul lui-même : la scène n'a pas à
    // citer le cours, même si le modèle ne connaissait pas le numéro de cette source.
    const viaSolver = shown.visual === "solver_plot" && has.beam;
    const src = sources[scene.sourceIndex - 1] ?? (viaSolver ? sources.find((x) => x.solver) : undefined);
    if (!src) return void dropped.push({ index, reason: "unknown_source" });
    const computed = Boolean(src.solver) || viaSolver;

    // Un extrait de cours se prouve par une citation ; un calcul de solveur, par ses nombres.
    if (!computed) {
      if (normalizeText(scene.quote).length < MIN_QUOTE_CHARS || quoteTokens(scene.quote).length < MIN_QUOTE_WORDS) {
        return void dropped.push({ index, reason: "quote_too_short" });
      }
      const support = quoteSupport(scene.quote, indexed[scene.sourceIndex - 1]!);
      // `detail` : le score seulement, jamais le texte du cours (journaux du serveur).
      if (support < QUOTE_SUPPORT_MIN) return void dropped.push({ index, reason: "quote_not_in_source", detail: support.toFixed(2) });
    }

    const said = [scene.heading, ...scene.bullets, ...(scene.steps ?? []), scene.formula, scene.voiceover].join(" ");
    const invented = extractNumbers(said).find((n) => !isStructural(n) && !allowed.has(n));
    if (invented !== undefined) return void dropped.push({ index, reason: "number_not_in_sources", detail: invented });

    scenes.push({
      ...scene,
      quote: computed ? "" : scene.quote,
      bullets: scene.bullets.slice(0, 3),
      sourceTitle: computed ? (sources.find((x) => x.solver)?.title ?? src.title) : src.title,
      sourceKind: computed ? "solver" : "document",
      ...shown,
      // Un calcul de solveur n'a pas de phrase à surligner.
      visual: computed && shown.visual === "highlight" ? "text" : shown.visual,
    });
  });

  const words = countWords(scriptVoiceText(scenes));
  // Les exemples du quotidien ne comptent pas : il faut de vraies scènes de cours.
  if (scenes.filter((sc) => sc.sourceKind !== "analogy").length < MIN_SCENES) return { ok: false, error: "no_valid_scene", words, dropped };
  if (words < MIN_VALID_WORDS) return { ok: false, error: "too_short", words, dropped };
  if (words > MAX_VOICE_WORDS) return { ok: false, error: "too_long", words, dropped };
  return { ok: true, title: script.title.trim(), scenes, words, dropped };
}

/* ── La poutre de la vidéo ─────────────────────────────────────────────── */

const canonical = (v: number) => extractNumbers(String(Math.abs(v)))[0] ?? "";

/** Toutes les valeurs numériques d'une description de poutre. */
function beamNumbers(beam: BalkenstatikInput): number[] {
  return [
    beam.laenge,
    ...beam.lager.map((l) => l.x),
    ...(beam.einzellasten ?? []).flatMap((p) => [p.x, p.F]),
    ...(beam.streckenlasten ?? []).flatMap((d) => [d.von, d.bis, d.q]),
  ];
}

/**
 * La poutre que la vidéo dessinera — toujours CALCULÉE par le solveur de TRED,
 * jamais dessinée d'après le modèle :
 *
 *   1. un calcul de poutre déjà fait dans le chat (le plus récent) ;
 *   2. sinon, l'exemple chiffré que le modèle a recopié d'un extrait de cours,
 *      si CHACUNE de ses valeurs figure bien dans les extraits ou la question.
 *      Le solveur le calcule alors ; son résultat devient une source de plus.
 *
 * Sans l'un ni l'autre : `payload` nul. La vidéo montre alors un croquis de
 * principe sans aucune valeur, et aucun diagramme.
 */
export function resolveBeam(
  script: Pick<VideoScript, "beam">,
  sources: VideoSource[],
  question = "",
): { payload: BeamDiagramPayload | null; run: SolverRun | null; rejected?: "numbers_not_in_sources" | "solver_refused" } {
  for (const s of sources) {
    const diagram = s.solver?.solver === "balkenstatik" ? (s.solver.output as { ok?: boolean; diagramm?: BeamDiagramPayload } | null) : null;
    if (diagram?.ok !== false && diagram?.diagramm?.v === 1) return { payload: diagram.diagramm, run: null };
  }
  if (!script.beam) return { payload: null, run: null };

  const allowed = new Set<string>([...sources.filter((s) => !s.solver).flatMap((s) => extractNumbers(s.content)), ...extractNumbers(question)]);
  // Zéro est une position (l'extrémité gauche), pas une donnée du cours.
  const unknown = beamNumbers(script.beam).some((v) => v !== 0 && !allowed.has(canonical(v)));
  if (unknown) return { payload: null, run: null, rejected: "numbers_not_in_sources" };

  const result = runBalkenstatik(script.beam);
  if (!result.ok) return { payload: null, run: null, rejected: "solver_refused" };
  return { payload: result.diagramm, run: { solver: "balkenstatik", input: script.beam, output: result } };
}

/* ── Prompt ────────────────────────────────────────────────────────────── */

export function buildVideoPrompt(input: { language: Language; sources: VideoSource[]; question: string; answer: string }): { system: string; prompt: string } {
  const { language, sources, question, answer } = input;
  const hasSolver = sources.some((s) => s.solver);
  const system = `${language.top}

Tu es TRED, professeur. Tu écris le script d'une courte vidéo qui explique à un étudiant le point exact qui le bloque.

RÈGLE ABSOLUE — ZÉRO INVENTION
Tu expliques en te basant UNIQUEMENT sur les extraits de cours fournis et sur les résultats des solveurs ([S1], [S2]…). Si une information n'est pas dans ces sources, tu ne l'inventes pas et tu n'en parles pas. Aucune formule, aucune valeur, aucun chiffre qui ne figure pas dans une source ou dans la question de l'étudiant.
${hasSolver ? "\nCHIFFRES CALCULÉS\nUtilise EXCLUSIVEMENT ces chiffres calculés par nos solveurs (sources marquées « solver ») pour tout résultat numérique : tu ne recalcules rien, tu n'arrondis pas autrement, tu ne complètes pas une valeur manquante. Un programme vérifie chaque nombre : une scène qui contient un nombre absent des sources est supprimée.\n" : ""}

LANGUE
Le script et la voix off sont écrits dans cette langue : ${language.label}. Les formules et les termes techniques des extraits restent dans leur langue d'origine (par exemple l'allemand), mais l'explication est dans la langue de l'étudiant.

CHAQUE SCÈNE
- "sourceIndex" : le numéro de la source sur laquelle elle s'appuie.
- "quote" : si la source est un extrait de cours, UNE phrase courte (8 à 25 mots) copiée MOT POUR MOT de cet extrait, dans SA langue d'origine. Ne la reformule pas, ne la traduis pas, ne la résume pas, ne corrige pas ses fautes. Choisis une phrase de texte courant, pas une formule ni un tableau. Un programme vérifie cette citation : une scène dont la citation ne vient pas de l'extrait est supprimée. Si la source est un calcul de solveur, laisse "quote" vide.
- "voiceover" : ce que dit la voix, en langue parlée, naturelle et fluide. Pas de LaTeX, pas de symboles : écris « sigma égale M sur W » dans la langue de l'étudiant.
- "formula" : au plus UNE formule, en LaTeX pur sans dollars, copiée de l'extrait. Chaîne vide sinon.
- "bullets" : 0 à 3 points de 8 mots au plus.

CE QUE LA VIDÉO MONTRE — une démonstration, pas des diapositives
Tu ne dessines rien toi-même : pour chaque scène tu CHOISIS "visual" dans la bibliothèque, et TRED dessine avec ses vrais outils. Varie les visuels : une suite de scènes "text" fait une mauvaise vidéo.
- "highlight" : la phrase du cours ("quote") s'affiche en grand, et ses "keywords" se surlignent en jaune. Pour un texte de loi, une définition, une thèse.
- "flowchart" : un enchaînement d'étapes ("steps", 2 à ${MAX_FLOW_STEPS}, CINQ MOTS AU PLUS chacune : un nom, pas une phrase) qui se construit. Pour des conditions à vérifier dans l'ordre, un processus, un cycle, un raisonnement.
- "formula" : la formule en grand, qui s'écrit. Plusieurs lignes séparées par \\\\ s'écrivent l'une après l'autre.
- "beam" : la poutre se dessine (appuis, portée). "loads" : les charges arrivent flèche après flèche et la poutre fléchit.
- "solver_plot" : le schéma exact du solveur (système, effort tranchant Q(x), moment M(x)). Seulement si un calcul de poutre existe (source « solver » ou champ "beam").
- "chart" : une courbe de principe sans valeurs, avec "chart" parmi : ${CHARTS.join(", ")} (offre et demande).
- "real_image" : une image d'illustration, avec "image" parmi : ${REAL_IMAGE_KEYS.join(", ")}. Pour relier la théorie à ce que l'étudiant connaît.
- "text" : une feuille avec les points. Pour la phrase à retenir.
"bullets" reste très court (2 points au plus quand il y a un visuel) : c'est la voix qui explique, l'écran montre.

LE CONTEXTE ("backdrop")
Une image de la matière reste en fond, très sombre, derrière les diagrammes et les textes : "courthouse" ou "gavel" pour le droit, "operating_room" ou "heart" pour la médecine, "bridge" pour le génie civil et la mécanique, "stock_market" pour l'économie, et ainsi de suite.

SELON LA MATIÈRE
- Droit, philosophie, sciences humaines : surtout "highlight" (le texte et ses mots-clés) et "flowchart" (les conditions, le raisonnement), avec une "real_image".
- Médecine, biologie, psychologie : surtout "flowchart" (les phases, le mécanisme) et "real_image" (l'organe, le lieu).
- Ingénierie, physique, mathématiques : surtout "formula", "beam", "loads", "solver_plot".
- Économie, gestion : surtout "chart", "formula" et "flowchart".
Tu ne décris jamais un schéma d'anatomie ni un dessin que TRED ne sait pas tracer : choisis dans la bibliothèque.

EXEMPLES DU QUOTIDIEN ("kind": "analogy", ${MAX_ANALOGIES} au plus)
Une comparaison avec la vie courante aide à comprendre (« comme un pont qui porte les voitures »). Dans une scène "analogy" : aucune citation, mais AUCUN chiffre et AUCUNE formule, et rien qui prétende venir du cours. Toutes les autres scènes sont "explanation" et citent leur source.

LA POUTRE ("beam")
Si la question porte sur une poutre et qu'un extrait donne un exemple chiffré complet, recopie ses données dans "beam" : uniquement des valeurs qui figurent dans l'extrait, sans rien calculer. Le solveur de TRED fait le calcul. Sinon "beam" vaut null, et tu n'annonces aucun résultat chiffré.

DURÉE
Elle dépend de la difficulté : de ${MIN_VOICE_WORDS} mots de voix (30 secondes) pour un point simple à ${MAX_VOICE_WORDS} mots (3 minutes) pour un raisonnement long. N'allonge pas pour allonger. Entre ${MIN_SCENES} et ${MAX_SCENES} scènes.

PÉDAGOGIE
Pars de ce que l'étudiant n'a pas compris, montre avant d'expliquer, avance pas à pas, relie la théorie à un exemple réel, et termine par la phrase à retenir.

${language.bottom}`;

  const block = sources.map((s, i) => `[S${i + 1}] ${s.title}${s.kind ? ` (${s.kind})` : ""}\n${s.content}`).join("\n\n");
  const prompt = `SOURCES (extraits du cours de l'étudiant${hasSolver ? " et calculs des solveurs" : ""})\n${block}\n\nQUESTION DE L'ÉTUDIANT\n${question.trim() || "(non précisée)"}\n\nDERNIÈRE RÉPONSE DU TUTEUR (contexte seulement : ce n'est PAS une source, n'y prends aucun chiffre)\n${answer.trim() || "(aucune)"}\n\nÉcris maintenant le script.`;
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
