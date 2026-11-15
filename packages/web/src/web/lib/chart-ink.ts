/**
 * Les couleurs d'un graphique, d'après la surface sur laquelle il sera VU
 * (2026-11-15).
 *
 * Un graphique est dessiné sur un canevas : ses textes et ses courbes ne
 * suivent aucune feuille de style, il faut les choisir en JavaScript. Le
 * choix se faisait d'après le thème de l'APP (classe `dark` sur <html>) —
 * faux dès que le graphique est posé sur un tableau :
 *
 *   - le tableau BLANC reste clair en thème sombre : graduations gris clair
 *     sur blanc, 1,4:1 ;
 *   - les tableaux VERT et SOMBRE inversaient le canevas par CSS : en thème
 *     sombre le texte clair y ressortait noir (1,3:1), et dans les deux
 *     thèmes le jaune TRED y devenait brun (2,6:1 sur le vert).
 *
 * Et hors du tableau en thème sombre (plein écran, exercices), la première
 * courbe restait en encre #1A1A1A sur un panneau bleu nuit.
 *
 * Désormais le graphique se dessine pour sa surface — claire ou sombre — et
 * plus rien ne l'inverse après coup (styles.css : l'inversion ne vise plus
 * que les schémas svg et les images).
 *
 * Module pur, testé dans tests/chart-ink.test.ts. Le composant
 * (components/diagram-blocks.tsx) lit la surface dans le navigateur.
 */

export type ChartSurface = "light" | "dark";

export interface ChartInk {
  /** Titre, légende, graduations, titres d'axes. */
  tick: string;
  /** Quadrillage. */
  grid: string;
  /** Une couleur par série, dans l'ordre : encre, jaune, gris, rouge, vert, gris clair. */
  palette: readonly string[];
}

type Rgb = [number, number, number];

/**
 * Une couleur telle que le navigateur la calcule (`getComputedStyle`) ou telle
 * qu'on l'écrit : rgb()/rgba(), #rgb/#rrggbb, color(srgb …). Autre chose
 * (oklch, mot-clé) : `null` — à l'appelant de se rabattre, pas de deviner.
 */
export function parseCssColor(value: string | null | undefined): Rgb | null {
  const v = (value ?? "").trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
  if (hex) {
    const h = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join("") : hex[1]!;
    return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as Rgb;
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(v);
  if (rgb) return [rgb[1], rgb[2], rgb[3]].map((n) => Math.round(Number(n))) as Rgb;
  const srgb = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(v);
  if (srgb) return [srgb[1], srgb[2], srgb[3]].map((n) => Math.round(Number(n) * 255)) as Rgb;
  return null;
}

/** Luminance relative (WCAG 2). */
function luminance([r, g, b]: Rgb): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Contraste WCAG entre deux couleurs (1 … 21). Couleur illisible : 1. */
export function contrastRatio(a: string, b: string): number {
  const ca = parseCssColor(a);
  const cb = parseCssColor(b);
  if (!ca || !cb) return 1;
  const [hi, lo] = [luminance(ca), luminance(cb)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * La surface, lue là où le graphique est posé : la couleur du TEXTE à cet
 * endroit — un texte clair veut dire un fond sombre. Elle suit le thème local
 * (tableau blanc en thème sombre, tableau vert en thème clair, couleurs libres
 * choisies par l'étudiant), pas seulement celui de la page.
 * Couleur illisible : le thème de l'app, comme avant.
 */
export function chartSurface(input: { textColor: string | null | undefined; fallbackDark: boolean }): ChartSurface {
  const text = parseCssColor(input.textColor);
  if (!text) return input.fallbackDark ? "dark" : "light";
  return luminance(text) > 0.4 ? "dark" : "light";
}

// Palette TRED : encre, jaune, gris, rouge, vert, gris clair. Plus d'indigo
// ni de violet (#6366f1, #a855f7 jusqu'au 5 novembre 2026).
const PALETTE = ["#1A1A1A", "#EAB308", "#6B6B6B", "#B3261E", "#15803D", "#A8A29E"] as const;

// La même, pour un fond sombre : l'encre devient craie, le jaune TRED reste
// tel quel, les autres s'éclaircissent. Chaque couleur tient 3:1 sur le bleu
// nuit de l'app (#0F172A, #1E293B) comme sur les tableaux vert et sombre.
const PALETTE_ON_DARK = ["#F1F5F9", "#EAB308", "#94A3B8", "#FB8A8A", "#4ADE80", "#D6CFC4"] as const;

const INK: Record<ChartSurface, ChartInk> = {
  light: { tick: "#475569", grid: "rgba(100,116,139,0.15)", palette: PALETTE },
  dark: { tick: "#cbd5e1", grid: "rgba(148,163,184,0.2)", palette: PALETTE_ON_DARK },
};

export function chartInk(surface: ChartSurface): ChartInk {
  return INK[surface];
}

/**
 * Le fond de l'image téléchargée. Le canevas est transparent : sans fond, un
 * graphique dessiné clair disparaît dans une visionneuse blanche (et l'inverse).
 */
export function exportBackground(surface: ChartSurface): string {
  return surface === "dark" ? "#0F172A" : "#FFFFFF";
}
