import { describe, expect, test } from "bun:test";
import { ANIME_ACTIONS, holding, toolAngle, actionStart, animeEnabled, animePromptBlock, camera, cleanAnime, defaultAnime, fillMissingImages, focusPoint, imagePrompt, mouthOpen, pointing, speaking, type AnimeScene } from "../src/api/lib/video-anime";
import { animeScriptSchema, fromAnimeScript } from "../src/api/lib/video-script";

const allowed = new Set(["300", "120", "0.2", "0.5"]);
const raw = (over: Record<string, string> = {}) => ({ decor: "atelier", action: "fleche_pointe_objet", illustration_prompt: "a long wrench tightening a bolt on a metal engine block", focus: "left", bubble: "", tool: "", ...over });

describe("style anime — interrupteur", () => {
  test("actif seulement avec VIDEO_ANIME=on ET une clé Replicate", () => {
    expect(animeEnabled({})).toBe(false);
    expect(animeEnabled({ VIDEO_ANIME: "on" })).toBe(false);
    expect(animeEnabled({ REPLICATE_API_TOKEN: "x" })).toBe(false);
    expect(animeEnabled({ VIDEO_ANIME: " ON ", REPLICATE_API_TOKEN: "x" })).toBe(true);
  });
});

describe("style anime — contrôle de la mise en scène", () => {
  test("une scène valable garde son décor, son action, et reçoit le style et les interdits du code", () => {
    const a = cleanAnime(raw(), {}, allowed)!;
    expect(a.decor).toBe("atelier");
    expect(a.action).toBe("fleche_pointe_objet");
    expect(a.focus).toBe("left");
    expect(a.prompt).toContain("2D anime style");
    expect(a.prompt).toContain("a long wrench tightening a bolt");
    expect(a.prompt).toContain("No text, no letters, no numbers");
    expect(a.prompt).toContain("lower right corner is calm");
  });

  test("sans description d'image : null (la scène est montée par le code)", () => {
    expect(cleanAnime(raw({ illustration_prompt: "a lever" }), {}, allowed)).toBeNull();
    expect(cleanAnime(null, {}, allowed)).toBeNull();
  });

  test("décor, action ou cadrage inconnus : une valeur sûre", () => {
    const a = cleanAnime(raw({ decor: "lune", action: "explosion", focus: "right" }), {}, allowed)!;
    expect(a.decor).toBe("gros_plan");
    expect(a.action).toBe("panoramique");
    expect(a.focus).toBe("center");
  });

  test("formule_s_ecrit exige une formule lisible", () => {
    expect(cleanAnime(raw({ action: "formule_s_ecrit" }), { formula: String.raw`M = F \cdot l` }, allowed)!.action).toBe("formule_s_ecrit");
    expect(cleanAnime(raw({ action: "formule_s_ecrit" }), { formula: "" }, allowed)!.action).toBe("panoramique");
    expect(cleanAnime(raw({ action: "formule_s_ecrit" }), { formula: String.raw`\frac{1` }, allowed)!.action).toBe("panoramique");
  });

  test("la bulle : courte, sans nombre inventé, et seulement pour les deux actions qui la montrent", () => {
    expect(cleanAnime(raw({ action: "bulle_de_texte", bubble: "Langer Arm = weniger Kraft" }), {}, allowed)!.bubble).toBe("Langer Arm = weniger Kraft");
    expect(cleanAnime(raw({ action: "bulle_de_texte", bubble: "Nur 120 Newton" }), {}, allowed)!.bubble).toBe("Nur 120 Newton");
    // 999 n'est dans aucune source : pas de bulle, donc pas d'action « bulle ».
    const invented = cleanAnime(raw({ action: "bulle_de_texte", bubble: "Nur 999 Newton" }), {}, allowed)!;
    expect(invented.bubble).toBe("");
    expect(invented.action).toBe("panoramique");
    expect(cleanAnime(raw({ action: "zoom_sur_prof", bubble: "eins zwei drei vier fünf sechs sieben acht neun zehn" }), {}, allowed)!.bubble).toBe("");
    expect(cleanAnime(raw({ action: "panoramique", bubble: "Hallo" }), {}, allowed)!.bubble).toBe("");
  });

  test("show_tool / use_tool : un objet de la bibliothèque, sinon un plan simple ; les noms anglais du brief sont compris", () => {
    const use = cleanAnime(raw({ action: "use_tool", tool: "Lever" }), {}, allowed)!;
    expect(use.action).toBe("use_tool");
    expect(use.tool).toBe("lever");
    expect(use.prompt).toContain("no tools, no objects in the foreground");
    // La description du modèle n'entre pas dans le décor d'une scène à objet.
    expect(use.prompt).not.toContain("a long wrench tightening a bolt");
    expect(cleanAnime(raw({ action: "use_tool", tool: "hammer" }), {}, allowed)!.action).toBe("panoramique");
    expect(cleanAnime(raw({ action: "character_point" }), {}, allowed)!.action).toBe("personnage_pointe_du_doigt");
    expect(cleanAnime(raw({ action: "zoom_on_formula" }), { formula: "M = F l" }, allowed)!.action).toBe("formule_s_ecrit");
    // L'ancien nom du champ reste lu.
    expect(cleanAnime({ decor: "parc", action: "panoramique", image_prompt: "a wooden seesaw in a sunny park", focus: "center", bubble: "" }, {}, allowed)).not.toBeNull();
  });

  test("le mouvement de l'objet : au repos avant l'action, poussé ensuite, et le levier soulève le rocher", () => {
    expect(toolAngle("wrench", "use_tool", 0, 240, 30)).toBe(0);
    const pushed = toolAngle("wrench", "use_tool", 45 + 30, 240, 30);
    expect(pushed).toBeCloseTo(9, 5);
    expect(toolAngle("lever", "use_tool", 0, 240, 30)).toBe(-7);
    expect(toolAngle("lever", "use_tool", 45 + 30, 240, 30)).toBeCloseTo(4, 5);
    // show_tool : un balancement de quelques degrés, jamais une poussée.
    for (let f = 0; f < 240; f += 7) expect(Math.abs(toolAngle("wrench", "show_tool", f, 240, 30))).toBeLessThanOrEqual(2.5);
    expect(holding("use_tool", 60, 240, 30)).toBe(true);
    expect(holding("use_tool", 5, 240, 30)).toBe(false);
    expect(holding("show_tool", 60, 240, 30)).toBe(false);
  });

  test("la consigne nomme toutes les actions, et la scène de repli est toujours jouable", () => {
    const block = animePromptBlock();
    for (const action of ANIME_ACTIONS) expect(block).toContain(action);
    expect(defaultAnime({ formula: String.raw`M = F \cdot l` }, 0).action).toBe("formule_s_ecrit");
    expect(defaultAnime({}, 0).action).toBe("panoramique");
    expect(imagePrompt("a bridge.", "chantier", "center")).toContain("a bridge, on a sunny construction site");
  });

  test("le schéma du script : une scène sans points ni étapes, remise à la forme du contrôle", () => {
    const script = animeScriptSchema.parse({ title: "T", backdrop: "bridge", beam: null, scenes: [{ kind: "analogy", stage: "hook", heading: "Warum?", formula: "", sourceIndex: 1, quote: "", voiceover: "Warum ist das so?", anime: raw() }] });
    const back = fromAnimeScript(script);
    expect(back.scenes[0]!.visual_cues).toEqual(["ask_question"]);
    expect(back.scenes[0]!.bullets).toEqual([]);
    expect((back.scenes[0] as { anime?: unknown }).anime).toBeDefined();
  });
});

describe("style anime — le professeur et la caméra", () => {
  const words = [{ startMs: 1000, endMs: 1400 }, { startMs: 1500, endMs: 1700 }];

  test("la bouche bat pendant un mot, jamais dans un silence", () => {
    expect(mouthOpen(words, 500)).toBe(false);
    expect(mouthOpen(words, 1010)).toBe(true);
    expect(mouthOpen(words, 1140)).toBe(false);
    expect(mouthOpen(words, 1270)).toBe(true);
    expect(mouthOpen(words, 1450)).toBe(false);
    expect(mouthOpen(words, 3000)).toBe(false);
    expect(speaking(words, 1450)).toBe(true);
    expect(speaking(words, 3000)).toBe(false);
  });

  test("il montre du doigt seulement pour les deux actions qui désignent, après le début de l'action", () => {
    const at = actionStart(180, 30);
    expect(at).toBe(45);
    expect(pointing("fleche_pointe_objet", 10, 180, 30)).toBe(false);
    expect(pointing("fleche_pointe_objet", 60, 180, 30)).toBe(true);
    expect(pointing("personnage_pointe_du_doigt", 60, 180, 30)).toBe(true);
    expect(pointing("fleche_pointe_objet", 178, 180, 30)).toBe(false);
    expect(pointing("panoramique", 60, 180, 30)).toBe(false);
  });

  test("la caméra bouge toujours, et l'image couvre toujours l'écran", () => {
    for (const action of ANIME_ACTIONS) {
      for (let index = 0; index < 4; index++) {
        const a = camera(action, index, 0);
        const b = camera(action, index, 1);
        expect(a.scale !== b.scale || a.x !== b.x || a.y !== b.y).toBe(true);
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          const c = camera(action, index, t);
          // Un décalage de d (fraction de l'image) est couvert si l'échelle vaut au moins 1 + 2|d|.
          expect(c.scale).toBeGreaterThanOrEqual(1 + 2 * Math.abs(c.x) - 1e-9);
          expect(c.scale).toBeGreaterThanOrEqual(1 + 2 * Math.abs(c.y) - 1e-9);
        }
      }
    }
    expect(focusPoint("left").x).toBeLessThan(focusPoint("center").x);
  });

  test("une image manquante prend celle de la scène la plus proche ; aucune image : faux", () => {
    const scene = (image?: string): { anime: AnimeScene } => ({ anime: { ...defaultAnime({}, 0), image } });
    const scenes = [scene(), scene("a"), scene(), scene(), scene("b")];
    expect(fillMissingImages(scenes)).toBe(true);
    expect(scenes.map((s) => s.anime.image)).toEqual(["a", "a", "a", "b", "b"]);
    expect(fillMissingImages([scene(), scene()])).toBe(false);
  });
});
