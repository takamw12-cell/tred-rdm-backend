import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chartInk, chartSurface, contrastRatio, exportBackground, parseCssColor } from "../src/web/lib/chart-ink";

/**
 * Lisibilité des graphiques (2026-11-15).
 *
 * Un graphique est dessiné sur un canevas : l'audit de contraste du 15 nov.,
 * qui mesurait les TEXTES de la page, ne le voyait pas. Mesuré ensuite sur le
 * rendu réel, thème sombre :
 *
 *   - sur les trois tableaux, titre, légende et graduations à 1,3–1,4:1 —
 *     invisibles. Les couleurs étaient choisies d'après le thème de l'APP,
 *     alors que le tableau blanc reste clair en thème sombre, et que les
 *     tableaux vert et sombre INVERSAIENT le canevas (styles.css) : le texte
 *     clair du thème sombre y ressortait noir ;
 *   - cette inversion changeait aussi le jaune TRED en brun (#844D00), à
 *     2,6:1 sur le tableau vert ;
 *   - hors du tableau (plein écran, exercices), la première courbe en encre
 *     #1A1A1A sur un panneau bleu nuit.
 *
 * La règle : le graphique se dessine pour la surface sur laquelle il sera VU,
 * et plus rien ne l'inverse après coup.
 */

const BRAND_LIGHT = ["#1A1A1A", "#EAB308", "#6B6B6B", "#B3261E", "#15803D", "#A8A29E"];
const PAPER = ["#FFFFFF", "#FDFBF7"]; // tableau blanc, feuille crème
// Tout ce sur quoi un graphique « sombre » peut se poser : fond et panneaux du
// thème sombre, tableau vert (son vert le plus clair), tableau sombre (idem).
const DARK_SURFACES = ["#0F172A", "#1E293B", "#35543F", "#1B2740"];

describe("lire une couleur calculée par le navigateur", () => {
  test("rgb(), rgba(), notation moderne, hexadécimal, color(srgb …)", () => {
    expect(parseCssColor("rgb(241, 245, 249)")).toEqual([241, 245, 249]);
    expect(parseCssColor("rgba(27, 42, 74, 0.9)")).toEqual([27, 42, 74]);
    expect(parseCssColor("rgb(245 241 230 / 0.8)")).toEqual([245, 241, 230]);
    expect(parseCssColor("#1b2a4a")).toEqual([27, 42, 74]);
    expect(parseCssColor("#fff")).toEqual([255, 255, 255]);
    expect(parseCssColor("color(srgb 1 0.5 0)")).toEqual([255, 128, 0]);
  });

  test("illisible : null, jamais une couleur inventée", () => {
    expect(parseCssColor("")).toBeNull();
    expect(parseCssColor("currentcolor")).toBeNull();
    expect(parseCssColor("oklch(0.7 0.1 200)")).toBeNull();
  });

  test("le contraste WCAG, dans les deux sens", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });
});

describe("sur quelle surface le graphique sera-t-il vu ?", () => {
  test("thème sombre, hors du tableau : le texte y est clair → surface sombre", () => {
    expect(chartSurface({ textColor: "rgb(241, 245, 249)", fallbackDark: true })).toBe("dark");
  });

  test("tableau blanc en thème SOMBRE : l'encre y est bleu nuit → surface claire", () => {
    // C'était le cas raté : la classe `dark` de la page disait « sombre ».
    expect(chartSurface({ textColor: "rgb(27, 42, 74)", fallbackDark: true })).toBe("light");
  });

  test("tableau vert ou sombre en thème CLAIR : la craie y est claire → surface sombre", () => {
    expect(chartSurface({ textColor: "rgb(245, 241, 230)", fallbackDark: false })).toBe("dark");
    expect(chartSurface({ textColor: "rgb(248, 250, 252)", fallbackDark: false })).toBe("dark");
  });

  test("couleurs libres du tableau : c'est la craie choisie par l'étudiant qui décide", () => {
    expect(chartSurface({ textColor: "rgb(255 255 255 / 0.85)", fallbackDark: false })).toBe("dark");
    expect(chartSurface({ textColor: "rgba(20, 20, 20, 0.9)", fallbackDark: true })).toBe("light");
  });

  test("thème clair, hors du tableau : surface claire", () => {
    expect(chartSurface({ textColor: "rgb(26, 26, 26)", fallbackDark: false })).toBe("light");
  });

  test("couleur illisible : on retombe sur le thème de l'app, comme avant", () => {
    expect(chartSurface({ textColor: "oklch(0.9 0 0)", fallbackDark: true })).toBe("dark");
    expect(chartSurface({ textColor: null, fallbackDark: false })).toBe("light");
  });
});

describe("les couleurs du graphique, par surface", () => {
  test("surface claire : rien ne change — la palette TRED et les graduations d'avant", () => {
    const ink = chartInk("light");
    expect(ink.palette).toEqual(BRAND_LIGHT);
    expect(ink.tick).toBe("#475569");
    for (const bg of PAPER) expect(contrastRatio(ink.tick, bg)).toBeGreaterThanOrEqual(4.5);
  });

  test("surface sombre : graduations lisibles (≥ 4,5:1) sur les panneaux ET sur les tableaux vert et sombre", () => {
    const ink = chartInk("dark");
    for (const bg of DARK_SURFACES) expect(contrastRatio(ink.tick, bg)).toBeGreaterThanOrEqual(4.5);
  });

  test("surface sombre : CHAQUE courbe visible (≥ 3:1), sur chacune de ces surfaces", () => {
    const ink = chartInk("dark");
    expect(ink.palette).toHaveLength(BRAND_LIGHT.length);
    for (const bg of DARK_SURFACES) {
      for (const color of ink.palette) expect(contrastRatio(color, bg)).toBeGreaterThanOrEqual(3);
    }
  });

  test("surface sombre : la première courbe n'est plus l'encre noire, et le jaune TRED reste LE jaune TRED", () => {
    const ink = chartInk("dark");
    expect(ink.palette[0]).not.toBe("#1A1A1A");
    expect(contrastRatio(ink.palette[0]!, "#1E293B")).toBeGreaterThan(10);
    expect(ink.palette[1]).toBe("#EAB308");
  });

  test("surface sombre : les six courbes restent distinctes entre elles", () => {
    const { palette } = chartInk("dark");
    expect(new Set(palette.map((c) => c.toLowerCase())).size).toBe(palette.length);
    // Les deux gris ne se confondent pas.
    expect(contrastRatio(palette[2]!, palette[5]!)).toBeGreaterThan(1.5);
  });

  test("les couleurs sont des #rrggbb : le remplissage ajoute sa transparence en suffixe (« 33 »)", () => {
    for (const surface of ["light", "dark"] as const) {
      for (const color of chartInk(surface).palette) expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe("l'image téléchargée reste lisible partout", () => {
  test("un fond plein, de la couleur de la surface dessinée", () => {
    expect(exportBackground("light")).toBe("#FFFFFF");
    expect(exportBackground("dark")).toBe("#0F172A");
  });

  test("sur ce fond, graduations et courbes tiennent leurs seuils", () => {
    for (const surface of ["light", "dark"] as const) {
      const ink = chartInk(surface);
      expect(contrastRatio(ink.tick, exportBackground(surface))).toBeGreaterThanOrEqual(4.5);
      // La première courbe — la principale — toujours nettement visible.
      expect(contrastRatio(ink.palette[0]!, exportBackground(surface))).toBeGreaterThanOrEqual(7);
    }
  });
});

describe("branchement", () => {
  const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8");
  const BLOCKS = read("../src/web/components/diagram-blocks.tsx");
  const FRAME = read("../src/web/components/diagram-frame.tsx");
  const STYLES = read("../src/web/styles.css");

  test("le graphique lit SA surface : la couleur du texte à l'endroit où il est posé", () => {
    expect(BLOCKS).toContain("chartSurface({");
    expect(BLOCKS).toMatch(/getComputedStyle\([^)]*\)\.color/);
    // Plus de couleur choisie d'après le seul thème de l'app.
    expect(BLOCKS).not.toContain('dark ? "#cbd5e1" : "#475569"');
  });

  test("il se redessine quand le thème de l'app OU la couleur du tableau change", () => {
    expect(BLOCKS).toContain("useBoardTheme(");
    expect(BLOCKS).toContain("useDarkMode()");
  });

  test("le plein écran a sa propre lecture : ce n'est pas la même surface que le tableau", () => {
    expect(BLOCKS).toMatch(/fullscreenChildren=\{<ThemedChart /);
    expect(BLOCKS).toMatch(/<ThemedChart [^>]*\/>\s*<\/div>/);
  });

  test("les tableaux vert et sombre n'inversent plus le canevas : il est déjà dessiné pour eux", () => {
    const rule = /:is\(\[data-board-theme="green"\], \[data-board-theme="dark"\]\) \[data-slot="diagram"\] :is\(([^)]*)\):not\(\.lucide\)\s*\{\s*filter: invert/.exec(STYLES);
    expect(rule).not.toBeNull();
    // Les schémas (svg, images) restent inversés : ils sont tracés noir sur transparent.
    expect(rule![1]).toContain("svg");
    expect(rule![1]).not.toContain("canvas");
  });

  test("le téléchargement pose le graphique sur un fond plein", () => {
    expect(FRAME).toContain("exportBackground(");
    expect(FRAME).toContain("fillRect(");
  });
});
