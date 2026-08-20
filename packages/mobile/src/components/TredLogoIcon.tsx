import React from "react";
import Svg, { Path, Polygon, Rect } from "react-native-svg";

/**
 * Logo TRED — un « T » fracturé d'où s'échappe une énergie dorée.
 *
 * Construit en primitives géométriques, PAS vectorisé depuis une image :
 * chaque coordonnée ci-dessous se modifie à la main. Déplacer un éclat,
 * allonger une fissure ou incliner la flamme se fait en changeant quelques
 * nombres — ce qui est impossible sur un tracé automatique.
 *
 * Repère : viewBox 1024 × 1024, contenu entre y = 58 et y = 902, centré
 * horizontalement autour de x = 512.
 */

/** Barre horizontale : trapèze cisaillé, lame vue légèrement de dessus. */
const BAR = "306,320 734,320 716,348 288,348";

/** Tige fuselée, base biseautée en pointe décalée à gauche. */
const STEM = "484,348 550,348 540,862 516,902 496,866";

/** La cassure jaune, à la jonction barre / tige. */
const BREAK = "492,310 546,310 542,352 498,352";

/**
 * Flamme : bande diagonale à base étroite. Le bord amont est déchiqueté, le
 * bord aval lisse — c'est ce qui la fait lire comme poussée par le vent
 * plutôt que comme une rangée de pics.
 */
const FLAME = "528,318 546,244 568,272 588,194 610,224 632,148 652,182 672,110 690,152 704,198 698,246 672,272 640,292 600,308 566,318";

/** Éclats détachés, de plus en plus petits en montant vers la droite. */
const SHARDS = [
  "712,118 730,92 736,118 718,146",
  "742,182 758,162 760,190 744,210",
  "690,74 704,58 706,84 692,100",
  "766,236 778,224 776,248 764,258",
];

/**
 * Fissures : veine principale irrégulière + ramifications asymétriques.
 * Une fissure régulière ressemble à une arête de poisson, pas à une cassure.
 * Le second nombre est l'épaisseur du trait.
 */
const CRACKS: Array<[string, number]> = [
  ["M512,356 L504,410 L520,448 L508,500 L523,548 L509,604 L521,658 L510,716 L522,770 L514,824 L518,858", 5.5],
  ["M520,448 L536,470 L532,506", 3.6],
  ["M509,604 L494,626 L498,660", 3.6],
  ["M510,716 L524,740", 3.2],
  ["M504,410 L492,430", 3.2],
  ["M523,548 L537,566", 2.8],
  ["M522,770 L508,790", 2.8],
];

export const TRED_BLACK = "#1A1A1A";
export const TRED_YELLOW = "#EAB308";

export interface TredLogoIconProps {
  /** Raccourci : fixe largeur ET hauteur. */
  size?: number;
  width?: number;
  height?: number;
  /** Couleur du T. Passer "#FFFFFF" sur fond sombre. */
  color?: string;
  /** Couleur de la flamme, de la cassure et des fissures. */
  accentColor?: string;
  /** Peint tout avec `color` — rendu à une seule encre. */
  monochrome?: boolean;
  /** Carré de fond. Absent = transparent. */
  backgroundColor?: string;
  /** Rayon des coins du fond. Laisser à 0 pour une icône iOS. */
  backgroundRadius?: number;
}

export function TredLogoIcon({
  size = 100,
  width,
  height,
  color = TRED_BLACK,
  accentColor = TRED_YELLOW,
  monochrome = false,
  backgroundColor,
  backgroundRadius = 0,
}: TredLogoIconProps) {
  const w = width ?? size;
  const h = height ?? size;
  const accent = monochrome ? color : accentColor;

  return (
    <Svg width={w} height={h} viewBox="0 0 1024 1024" accessibilityLabel="TRED">
      {backgroundColor ? (
        <Rect width={1024} height={1024} rx={backgroundRadius} fill={backgroundColor} />
      ) : null}

      <Polygon points={BAR} fill={color} />
      <Polygon points={STEM} fill={color} />

      <Polygon points={BREAK} fill={accent} />
      <Polygon points={FLAME} fill={accent} />
      {SHARDS.map((p, i) => (
        <Polygon key={`shard-${i}`} points={p} fill={accent} />
      ))}

      {CRACKS.map(([d, strokeWidth], i) => (
        <Path
          key={`crack-${i}`}
          d={d}
          fill="none"
          stroke={accent}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}

export default TredLogoIcon;
