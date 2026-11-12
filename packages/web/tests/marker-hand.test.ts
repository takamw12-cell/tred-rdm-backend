/**
 * La main-feutre de « Als Video erklären » (prototype : scène de la poutre).
 * Elle suit le tracé, elle ne change rien : ni le texte, ni l'ordre, ni les
 * points de contrôle des 8 scènes du script réel de référence.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EFFECTS, HAND_VISUALS, beamPen, easeOutCubic, loadCueFrame, planHandEffects } from "../src/web/video/marker-hand";
import { VISUALS, cueOf, lessonStages, tiePunctuation } from "../src/api/lib/video-visuals";
import fixture from "./fixtures/explainer-flexion.json";

type Scene = (typeof fixture.scenes)[number];
const scenes = fixture.scenes as Scene[];

// Le schéma de la composition : poutre de X0 à X1 à la hauteur Y, 12 flèches.
const X0 = 56;
const X1 = 424;
const Y = 132;
const arrows = Array.from({ length: 12 }, (_, i) => ({ x: X0 + ((X1 - X0) * i) / 11, top: 62, tip: Y - 5 }));
const base = { x0: X0, x1: X1, y: Y, supportXs: [X0, X1], loadLine: { from: X0, to: X1, top: 62 }, arrows };

describe("les 8 scènes du script réel, après passage par la main-feutre", () => {
  const avant = JSON.stringify(scenes);
  const plan = planHandEffects(scenes as never);

  test("8 scènes, dans le même ordre, avec le même texte", () => {
    expect(scenes).toHaveLength(8);
    expect(JSON.stringify(scenes)).toBe(avant);
    expect(plan.map((p) => p.heading)).toEqual(scenes.map((s) => s.heading));
    expect(scenes.map((s) => s.heading)).toEqual([
      "Pourquoi une poutre casse-t-elle au milieu et pas aux appuis ?",
      "La poutre : un pont entre deux appuis",
      "Ce qui se passe à l'intérieur",
      "Effort tranchant et moment fléchissant",
      "La poutre sous charge répartie",
      "Les courbes Q(x) et M(x)",
      "La contrainte de flexion",
      "Récap : pourquoi ça casse au milieu ?",
    ]);
    for (const s of scenes) expect(s.voiceover.trim().length).toBeGreaterThan(20);
  });

  test("la structure de la leçon et les ordres visuels sont intacts", () => {
    expect(scenes.map((s) => s.stage)).toEqual(lessonStages(scenes as never));
    expect(scenes[0]!.stage).toBe("hook");
    expect(scenes.at(-1)!.stage).toBe("recap");
    for (const s of scenes) expect(s.visual_cues).toEqual([cueOf(s.visual as never)]);
    expect(scenes.map((s) => s.visual)).toEqual(["question", "real_image", "highlight", "formula", "loads", "solver_plot", "formula", "recap"]);
  });

  test("les points de contrôle restent ceux du contrôle anti-invention", () => {
    // Chaque scène d'explication garde sa source ; la citation du cours n'a pas bougé.
    for (const s of scenes) {
      if (s.sourceKind === "document") expect(s.sourceTitle).toBe("TM2_Skript_Kapitel3.pdf");
      if (s.sourceKind === "analogy") expect(s.quote).toBe("");
    }
    expect(scenes[2]!.quote).toContain("neutrale Faser");
    expect(scenes.filter((s) => s.sourceKind === "solver")).toHaveLength(1);
    expect(fixture.sceneStartsMs).toHaveLength(8);
    expect([...fixture.sceneStartsMs].sort((a, b) => a - b)).toEqual(fixture.sceneStartsMs);
  });

  test("un effet par scène ; la main tient le feutre partout où quelque chose se trace", () => {
    // Toutes les scènes sauf l'image d'illustration (scène 2), où rien ne se trace.
    expect(plan.filter((p) => p.hand).map((p) => p.index + 1)).toEqual([1, 3, 4, 5, 6, 7, 8]);
    for (const p of plan) expect(p.effect).toBe(EFFECTS[p.visual]);
    for (const v of VISUALS) expect(EFFECTS[v].length).toBeGreaterThan(5);
    expect(HAND_VISUALS).toContain("loads");
    expect(HAND_VISUALS).not.toContain("real_image");
    // Chaque visuel « à main » marque dans la composition l'élément que la main suit.
    const src = readFileSync(join(import.meta.dir, "../src/web/video/dynamic-explanation.tsx"), "utf8");
    // question, citation (texte + mot-clé), diagramme, courbes, récapitulatif ; la formule écrit son attribut elle-même.
    expect(src.match(/\{\.\.\.(?:\([^)]*\? )?penAttrs\(/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(src.match(/penAttrs\(/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
    expect(src).toContain('` data-pen data-pen-o="${o.toFixed(3)}"`');
    expect(src).toContain("<PenFollower frame={frame} />");
  });

  test("le titre du récapitulatif ne laisse plus de « ? » seul", () => {
    expect(tiePunctuation(scenes.at(-1)!.heading).endsWith("milieu ?")).toBe(true);
  });
});

describe("la pointe du feutre suit le tracé", () => {
  test("avant le tracé : pas de main", () => {
    expect(beamPen({ ...base, draw: 0, loads: 0 })).toMatchObject({ opacity: 0, phase: "idle" });
  });

  test("sur la poutre : la pointe est exactement au bout du trait, de gauche à droite", () => {
    let last = X0 - 1;
    for (const draw of [0.05, 0.15, 0.3, 0.45, 0.59]) {
      const pen = beamPen({ ...base, draw, loads: 0 });
      expect(pen.phase).toBe("beam");
      expect(pen.y).toBe(Y);
      // Même formule que le stroke-dashoffset de la composition.
      expect(pen.x).toBeCloseTo(X0 + easeOutCubic(draw / 0.6) * (X1 - X0), 6);
      expect(pen.x).toBeGreaterThan(last);
      last = pen.x;
    }
  });

  test("puis les appuis, puis la main se retire", () => {
    expect(beamPen({ ...base, draw: 0.7, loads: 0 }).phase).toBe("supports");
    const fin = beamPen({ ...base, draw: 0.9, loads: 0 });
    expect(fin.x).toBeGreaterThanOrEqual(X0);
    expect(fin.x).toBeLessThanOrEqual(X1);
    expect(beamPen({ ...base, draw: 1, loads: 0 })).toMatchObject({ opacity: 0, phase: "done" });
  });

  test("les charges : chaque flèche de haut en bas, de gauche à droite", () => {
    // Le trait du haut et la première flèche partent ensemble, à gauche : la main est là.
    const debut = beamPen({ ...base, draw: 1, loads: 0.01 });
    expect(debut.x).toBeCloseTo(X0, 6);
    expect(debut.y).toBeGreaterThanOrEqual(62);
    // Sans flèche (charge sans détail), elle suit le trait du haut.
    expect(beamPen({ ...base, arrows: [], draw: 1, loads: 0.2 })).toMatchObject({ phase: "load-line", y: 62 });
    let lastX = X0 - 1;
    for (const loads of [0.2, 0.4, 0.6, 0.8]) {
      const pen = beamPen({ ...base, draw: 1, loads });
      expect(pen.phase).toBe("arrows");
      expect(pen.opacity).toBe(1);
      expect(pen.x).toBeGreaterThanOrEqual(lastX);
      expect(pen.y).toBeGreaterThanOrEqual(62);
      expect(pen.y).toBeLessThanOrEqual(Y - 5);
      // La main est sur une vraie flèche, pas entre deux.
      expect(arrows.some((a) => Math.abs(a.x - pen.x) < 1e-6)).toBe(true);
      lastX = pen.x;
    }
    expect(beamPen({ ...base, draw: 1, loads: 1 })).toMatchObject({ opacity: 0, phase: "done" });
  });

  test("la main ne sort jamais du schéma", () => {
    for (let d = 0; d <= 1.001; d += 0.05) {
      for (const loads of [0, 0.1, 0.5, 0.95]) {
        const pen = beamPen({ ...base, draw: d, loads: d >= 1 ? loads : 0 });
        expect(pen.x).toBeGreaterThanOrEqual(X0 - 1e-6);
        expect(pen.x).toBeLessThanOrEqual(X1 + 1e-6);
        expect(pen.opacity).toBeGreaterThanOrEqual(0);
        expect(pen.opacity).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("calée sur la voix", () => {
  const FPS = 30;
  const from = Math.round((fixture.sceneStartsMs[4]! / 1000) * FPS);
  const to = Math.round((fixture.sceneStartsMs[5]! / 1000) * FPS);

  test("les charges arrivent quand la voix dit « charge »", () => {
    const cue = loadCueFrame(fixture.words, from, to, FPS);
    expect(cue).toBeDefined();
    const mot = fixture.words.find((w) => Math.round((w.startMs / 1000) * FPS) - from === cue);
    expect(mot?.text.toLowerCase().startsWith("charge")).toBe(true);
    // Après le tracé de la poutre et de ses appuis (44 images).
    expect(cue!).toBeGreaterThan(44);
  });

  test("allemand et anglais aussi ; rien si la voix n'en parle pas", () => {
    const w = (text: string, startMs: number) => ({ text, startMs });
    expect(loadCueFrame([w("Die", 0), w("Gleichstreckenlast", 1000)], 0, 300, FPS)).toBe(30);
    expect(loadCueFrame([w("the", 0), w("„load", 2000)], 0, 300, FPS)).toBe(60);
    expect(loadCueFrame([w("Der", 0), w("Balken", 500)], 0, 300, FPS)).toBeUndefined();
  });

  test("la composition utilise la main et le repère de la voix, sans toucher aux scènes", () => {
    const src = readFileSync(join(import.meta.dir, "../src/web/video/dynamic-explanation.tsx"), "utf8");
    expect(src).toContain("<MarkerHand pen={pen} frame={frame} />");
    expect(src).toContain("loadCueFrame(props.words, start, sceneEnd, EXPLAINER_FPS)");
    const hand = readFileSync(join(import.meta.dir, "../src/web/video/marker-hand.ts"), "utf8");
    // Module pur : ni React, ni Remotion, ni solveur.
    expect(/from "(react|remotion)"|from "[^"]*solver/.test(hand)).toBe(false);
  });
});

describe("les trois corrections du 12 nov. 2026", () => {
  const src = readFileSync(join(import.meta.dir, "../src/web/video/dynamic-explanation.tsx"), "utf8");

  test("fondu : la main apparaît et disparaît en 0,3 à 0,5 s, sur la poutre comme ailleurs", () => {
    // Poutre : le tracé dure 40 images ; le fondu en prend un quart (10 images, 0,33 s).
    expect(beamPen({ ...base, draw: 0.05, loads: 0 }).opacity).toBeCloseTo(0.2, 6);
    expect(beamPen({ ...base, draw: 0.125, loads: 0 }).opacity).toBeCloseTo(0.5, 6);
    expect(beamPen({ ...base, draw: 0.25, loads: 0 }).opacity).toBe(1);
    const sortie = [0.8, 0.9, 0.99].map((draw) => beamPen({ ...base, draw, loads: 0 }).opacity);
    expect(sortie[0]!).toBeGreaterThan(sortie[1]!);
    expect(sortie[1]!).toBeGreaterThan(sortie[2]!);
    // Charges : entrée et sortie progressives aussi.
    expect(beamPen({ ...base, draw: 1, loads: 0.08 }).opacity).toBeCloseTo(0.5, 6);
    const fin = beamPen({ ...base, draw: 1, loads: 0.95 }).opacity;
    expect(fin).toBeGreaterThan(0);
    expect(fin).toBeLessThan(1);
    // Les autres visuels : 10 images à 30 images par seconde.
    expect(src).toContain("const PEN_FADE = 10;");
    expect(src).toContain("(local - from) / PEN_FADE, (to - local) / PEN_FADE");
  });

  test("diagramme : la main n'arrive jamais avant la case", () => {
    expect(src).toContain("penFade(local, at + 4, at + 40)");
    expect(src).not.toContain("local >= at && local < at + 22");
  });

  test("texte : le feutre arrive par-dessous, la main reste sous la ligne qu'elle suit", () => {
    // Citation (texte et mot-clé), question et diagramme demandent la position « under ».
    expect(src.match(/"data-pen-v": "under"/g)?.length).toBe(4);
    expect(src).toContain("under ? 1.04 : 0.9");
    expect(src).toContain("angle={pen.under ? 78 : 38}");
  });
});
