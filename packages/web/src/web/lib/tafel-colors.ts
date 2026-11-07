import type { BoardTheme } from "@/stores/board-theme";

/**
 * Couleurs libres de la Tafel : fond et craie (encre), chacun avec sa
 * densité (opacité). Module pur, testé dans tests/hoersaal-choreography.test.ts.
 *
 * Le tableau lit deux variables : --tafel-bg et --tafel-text. Elles sont
 * aussi recopiées dans --board-surface / --board-ink, que tout ce qui est
 * écrit au tableau suit déjà (titres, feuilles, KaTeX, tampon, coches).
 * Un fond sombre active les règles « tableau sombre » (feuilles en trait de
 * craie, schémas inversés) : le texte reste lisible quelle que soit la couleur.
 */
export interface TafelColors {
  /** #rrggbb */
  bg: string;
  /** 0 … 1 : 1 = opaque ; en dessous, la salle sombre transparaît (verre). */
  bgAlpha: number;
  ink: string;
  inkAlpha: number;
}

export const DEFAULT_TAFEL_COLORS: TafelColors = { bg: "#2e4a3a", bgAlpha: 1, ink: "#f5f1e6", inkAlpha: 1 };

const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = HEX.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);

export function rgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex) ?? [0, 0, 0];
  return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]} / ${Math.round(clamp01(alpha) * 100) / 100})`;
}

/** Luminance relative (WCAG) < 0,35 → fond sombre. */
export function isDarkColor(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.35;
}

/** Le thème dont les règles s'appliquent : celui choisi, ou clair/sombre d'après le fond libre. */
export function effectiveBoardTheme(theme: BoardTheme, custom: TafelColors | null | undefined): BoardTheme {
  if (!custom) return theme;
  return isDarkColor(custom.bg) ? "dark" : "white";
}

/** Les variables CSS posées sur le verre (style inline : elles priment sur le thème). */
export function tafelStyle(custom: TafelColors | null | undefined): Record<string, string> | undefined {
  if (!custom) return undefined;
  const bg = rgba(custom.bg, custom.bgAlpha);
  const text = rgba(custom.ink, custom.inkAlpha);
  return {
    "--tafel-bg": bg,
    "--tafel-text": text,
    "--board-surface": bg,
    "--board-ink": text,
    "--board-muted": rgba(custom.ink, clamp01(custom.inkAlpha) * 0.65),
  };
}
