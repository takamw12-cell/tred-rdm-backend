import { describe, expect, test } from "bun:test";
import { MOTION_ICON_NAMES, blockSize, cleanMotion, defaultMotion, layoutBlocks, markTexParts, motionEnabled, motionPromptBlock, musicGain, resolveTimeline, speechSpans, type MotionBlock, type MotionScene } from "../src/api/lib/video-motion";

const allowed = new Set(["120", "300", "0.5"]);
const block = (b: Partial<MotionBlock> & Pick<MotionBlock, "id" | "type">): MotionBlock => ({ text: "", icon: "", tex: "", items: [], values: [], curve: "", color: "white", ...b });
const act = (action: string, element: string, extra: Record<string, unknown> = {}) => ({ action, element, word: "", target: "", text: "", angle: 0, color: "", ...extra }) as never;

describe("cleanMotion — le modèle choisit dans la bibliothèque, le code contrôle", () => {
  test("garde les blocs valables et relie les actions à leurs ids", () => {
    const { motion, dropped } = cleanMotion(
      {
        transition: "wipe",
        blocks: [
          { id: "Clé", type: "icon", text: "wrench", items: ["Schlüssel"] },
          { id: "moment", type: "formula", text: "M = F \\cdot l" },
        ],
        actions: [act("popIn", "Clé", { word: "Schlüssel" }), act("write", "moment"), act("pointTo", "Clé", { target: "moment" }), act("annotate", "moment", { target: "F", text: "Kraft" })],
      },
      allowed,
    );
    expect(dropped).toEqual([]);
    expect(motion!.blocks.map((b) => b.id)).toEqual(["cl", "moment"]);
    expect(motion!.actions.map((a) => [a.action, a.element, a.target])).toEqual([["popIn", "cl", ""], ["write", "moment", ""], ["pointTo", "cl", "moment"], ["annotate", "moment", "F"]]);
    expect(motion!.transition).toBe("wipe");
  });

  test("retire un bloc qui affiche un nombre absent des sources", () => {
    const { motion, dropped } = cleanMotion(
      {
        blocks: [
          { id: "a", type: "text", text: "Die Kraft beträgt 450 N" },
          { id: "b", type: "bars", items: ["F1", "F2"], values: [120, 300] },
          { id: "c", type: "bars", items: ["F1", "F2"], values: [120, 999] },
          { id: "d", type: "formula", text: "F = 120 \\cdot 2" },
        ],
        actions: [act("pulse", "a"), act("fadeIn", "b")],
      },
      allowed,
    );
    expect(dropped).toEqual(["number_not_in_sources", "number_not_in_sources"]);
    expect(motion!.blocks.map((b) => b.id)).toEqual(["b", "d"]);
    // L'action qui visait le bloc retiré part avec lui.
    expect(motion!.actions.map((a) => a.element)).toEqual(["b"]);
  });

  test("refuse l'icône inconnue, la formule cassée, la courbe inconnue ; rien de valable → null", () => {
    const { motion, dropped } = cleanMotion(
      { blocks: [{ id: "a", type: "icon", text: "dragon" }, { id: "b", type: "formula", text: "\\frac{1}{" }, { id: "c", type: "chart", text: "zigzag" }, { id: "e", type: "hologram", text: "x" }, { id: "d", type: "steps", items: ["seul"] }] },
      allowed,
    );
    expect(motion).toBeNull();
    expect(dropped).toEqual(["unknown_icon", "bad_tex", "bad_curve", "unknown_type", "bad_items"]);
  });

  test("borne l'angle d'un levier et retire une annotation introuvable", () => {
    const { motion } = cleanMotion(
      {
        blocks: [{ id: "l", type: "lever", items: ["F1", "F2"], values: [3, 1] }, { id: "f", type: "formula", text: "\\lambda = a" }],
        actions: [act("rotate", "l", { angle: 80 }), act("annotate", "f", { target: "l", text: "Länge" }), act("annotate", "f", { target: "a", text: "Wert" }), act("pointTo", "l", { target: "l" })],
      },
      allowed,
    );
    expect(motion!.actions.map((a) => [a.action, a.angle, a.target])).toEqual([["rotate", 15, ""], ["annotate", 0, "a"]]);
  });

  test("un texte trop long est coupé au dernier mot entier", () => {
    const { motion } = cleanMotion({ blocks: [{ id: "t", type: "title", text: "Ein sehr langer Titel der weit über die erlaubte Länge hinausgeht und deshalb gekürzt wird" }] }, allowed);
    expect(motion!.blocks[0]!.text.length).toBeLessThanOrEqual(64);
    expect(motion!.blocks[0]!.text).toBe("Ein sehr langer Titel der weit über die erlaubte Länge");
  });
});

describe("markTexParts", () => {
  test("marque un morceau sans couper une commande", () => {
    expect(markTexParts("M = F \\cdot l", ["F", "l"])).toEqual({ tex: "M = \\htmlClass{mg-p0}{F} \\cdot \\htmlClass{mg-p1}{l}", ok: [true, true] });
    expect(markTexParts("\\lambda", ["l"]).ok).toEqual([false]);
    expect(markTexParts("\\sigma = \\frac{M}{W}", ["\\sigma", "W"]).ok).toEqual([true, true]);
  });
});

describe("defaultMotion — une scène n'est jamais vide", () => {
  test("question, formule, étapes, récapitulatif, texte", () => {
    expect(defaultMotion({ heading: "Warum?", bullets: [], formula: "", stage: "hook" }).blocks.map((b) => b.type)).toEqual(["title", "icon"]);
    expect(defaultMotion({ heading: "Formel", bullets: ["Merke"], formula: "a=b" }).blocks.map((b) => b.type)).toEqual(["formula", "text"]);
    expect(defaultMotion({ heading: "Weg", bullets: [], formula: "", steps: ["A", "B"], visual: "flowchart" }).blocks[0]!.type).toBe("steps");
    expect(defaultMotion({ heading: "Merke", bullets: ["x", "y"], formula: "", visual: "recap" }).blocks[0]!.type).toBe("list");
    expect(defaultMotion({ heading: "Titel", bullets: ["x"], formula: "\\frac{" }).blocks.map((b) => b.type)).toEqual(["title", "text"]);
  });
});

describe("layoutBlocks — jamais de chevauchement", () => {
  const area = { x: 46, y: 92, w: 868, h: 332 };
  const overlap = (a: { x: number; y: number; w: number; h: number; scale: number }, b: typeof a) => Math.abs(a.x - b.x) < ((a.w + b.w) * a.scale) / 2 - 0.5 && Math.abs(a.y - b.y) < ((a.h + b.h) * a.scale) / 2 - 0.5;
  test("toutes les combinaisons de blocs tiennent dans la zone, sans se toucher", () => {
    const kinds: MotionBlock[] = [
      block({ id: "t", type: "title", text: "Warum löst ein langer Schlüssel die Mutter leichter?" }),
      block({ id: "x", type: "text", text: "Längerer Hebelarm bedeutet größeres Moment bei gleicher Kraft" }),
      block({ id: "i", type: "icon", icon: "wrench", text: "Schlüssel" }),
      block({ id: "f", type: "formula", tex: "M = F \\cdot l" }),
      block({ id: "s", type: "steps", items: ["Kraft", "Hebelarm", "Moment", "Drehung"] }),
      block({ id: "l", type: "list", items: ["eins", "zwei", "drei", "vier"] }),
      block({ id: "c", type: "chart", curve: "linear" }),
      block({ id: "v", type: "lever", values: [3, 1] }),
    ];
    for (const narrow of [false, true]) {
      const zone = narrow ? { x: 30, y: 150, w: 480, h: 580 } : area;
      for (let mask = 1; mask < 1 << kinds.length; mask++) {
        const chosen = kinds.filter((_, i) => mask & (1 << i));
        if (chosen.length > 5) continue;
        const rects = layoutBlocks(chosen.map((b) => blockSize(b, narrow)), zone, 1.35, 84);
        rects.forEach((r, i) => {
          expect(r.x - (r.w * r.scale) / 2).toBeGreaterThanOrEqual(zone.x - 0.5);
          expect(r.x + (r.w * r.scale) / 2).toBeLessThanOrEqual(zone.x + zone.w + 0.5);
          expect(r.y - (r.h * r.scale) / 2).toBeGreaterThanOrEqual(zone.y - 0.5);
          expect(r.y + (r.h * r.scale) / 2).toBeLessThanOrEqual(zone.y + zone.h + 0.5);
          for (let j = 0; j < i; j++) expect(overlap(r, rects[j]!)).toBe(false);
        });
      }
    }
  });
  test("un bloc seul est centré et agrandi", () => {
    const [r] = layoutBlocks([{ w: 170, h: 130 }], area);
    expect(r).toMatchObject({ x: 480, y: 258, scale: 1.35 });
  });
});

describe("resolveTimeline — chaque action part sur son mot", () => {
  const words = ["Ein", "langer", "Schraubenschlüssel", "hat", "ein", "großes", "Moment", "merke", "dir", "das"].map((text, i) => ({ text, at: 10 + i * 12 }));
  const motion: MotionScene = {
    transition: "fade",
    blocks: [block({ id: "cle", type: "icon", icon: "wrench" }), block({ id: "moment", type: "formula", tex: "M" }), block({ id: "seul", type: "text", text: "x" })],
    actions: [
      { action: "popIn", element: "cle", word: "Schraubenschlüssel", target: "", text: "", angle: 0, color: "yellow" },
      { action: "pulse", element: "moment", word: "Moment", target: "", text: "", angle: 0, color: "red" },
      { action: "highlight", element: "moment", word: "", target: "", text: "", angle: 0, color: "yellow" },
      { action: "fadeOut", element: "cle", word: "merke", target: "", text: "", angle: 0, color: "yellow" },
    ],
  };
  const { actions, blocks } = resolveTimeline(motion, words, 200);
  test("le mot fixe l'instant ; un bloc sans entrée en reçoit une", () => {
    expect(actions.map((a) => `${a.action}:${a.element}`)).toEqual(["popIn:cle", "fadeIn:moment", "pulse:moment", "highlight:moment", "fadeOut:cle", "slideUp:seul"]);
    // La première action ouvre la scène, même si son mot vient plus tard : l'écran n'est jamais vide.
    expect(actions[0]!.at).toBe(8);
    // « Moment » commence à l'image 82 ; l'action part 0,15 s avant.
    expect(actions[1]!.at).toBe(77);
    expect(blocks.cle).toMatchObject({ entrance: "popIn", exit: actions[4]!.at });
    expect(blocks.moment!.entrance).toBe("fadeIn");
  });
  test("toujours croissant, espacé, dans la scène", () => {
    for (let i = 1; i < actions.length; i++) expect(actions[i]!.at - actions[i - 1]!.at).toBeGreaterThanOrEqual(9);
    expect(actions[actions.length - 1]!.at).toBeLessThanOrEqual(200 - 27);
  });
  test("sans aucun mot : réparti sur la scène", () => {
    const even = resolveTimeline({ ...motion, actions: motion.actions.map((a) => ({ ...a, word: "" })) }, [], 300);
    expect(even.actions[0]!.at).toBe(8);
    expect(even.actions[even.actions.length - 1]!.at).toBeGreaterThan(150);
  });
});

describe("la musique sous la voix", () => {
  test("−20 dB sous la voix, −10 dB dans le silence, fondus aux extrémités", () => {
    const spans = speechSpans([{ startMs: 2000, endMs: 2400 }, { startMs: 2500, endMs: 4000 }, { startMs: 8000, endMs: 9000 }]);
    expect(spans).toEqual([[2, 4], [8, 9]]);
    expect(musicGain(3, spans, 20)).toBeCloseTo(0.1, 5);
    expect(musicGain(6, spans, 20)).toBeCloseTo(10 ** -0.5, 5);
    expect(musicGain(0, spans, 20)).toBe(0);
    expect(musicGain(20, spans, 20)).toBe(0);
  });
});

test("la consigne nomme toutes les icônes ; l'interrupteur VIDEO_MOTION", () => {
  const prompt = motionPromptBlock();
  for (const name of MOTION_ICON_NAMES) expect(prompt).toContain(name);
  expect(MOTION_ICON_NAMES.length).toBe(84);
  expect(motionEnabled({})).toBe(true);
  expect(motionEnabled({ VIDEO_MOTION: "Off" })).toBe(false);
});
