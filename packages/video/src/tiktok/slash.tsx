import type { ReactNode } from "react";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { AbsoluteFill, Easing, Freeze, interpolate } from "remotion";
import { GOLD, H, ORANGE, W, clamp } from "./kit";

/**
 * La signature de la campagne : le moment où l'étudiant passe de « je ne
 * comprends pas » à « TRED m'explique ».
 *
 *   1. l'image se FIGE (la scène sortante est gelée sur sa dernière image) ;
 *   2. un trait orange la traverse en diagonale (SVG, stroke-dashoffset) ;
 *   3. l'image se fend le long du trait et ses deux moitiés s'écartent :
 *      l'écran de TRED était dessous.
 *
 * C'est une présentation pour <TransitionSeries> (@remotion/transitions) :
 *   <TransitionSeries.Transition presentation={slashCut({ freezeFrame })} timing={linearTiming({ durationInFrames: SLASH_FRAMES })} />
 */

export const SLASH_FRAMES = 22;
/** Part de la transition où le trait est entièrement tracé et l'image encore entière (pour la capture). */
export const SLASH_DRAWN = 0.44;

// Le trait : du bord droit (en haut) au bord gauche (en bas).
const P1 = { x: W + 40, y: H * 0.22 };
const P2 = { x: -40, y: H * 0.78 };
const LEN = Math.hypot(P2.x - P1.x, P2.y - P1.y);
// Normale au trait, vers le bas à droite : les deux moitiés glissent le long d'elle.
const N = { x: (P2.y - P1.y) / LEN, y: -(P2.x - P1.x) / LEN };
// Ordonnées du trait sur les bords gauche et droit du cadre.
const yAt = (x: number) => P1.y + ((x - P1.x) / (P2.x - P1.x)) * (P2.y - P1.y);
const UPPER = `polygon(0px 0px, ${W}px 0px, ${W}px ${yAt(W)}px, 0px ${yAt(0)}px)`;
const LOWER = `polygon(${W}px ${yAt(W)}px, ${W}px ${H}px, 0px ${H}px, 0px ${yAt(0)}px)`;

export type SlashProps = {
  /** Image (relative à la scène sortante) sur laquelle elle se fige. */
  freezeFrame: number;
};

/** Le trait seul — aussi utilisé pour l'image fixe de la capture d'écran. */
export function SlashMark({ draw, opacity = 1 }: { draw: number; opacity?: number }) {
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, opacity, overflow: "visible" }}>
      <defs>
        <filter id="slash-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="9" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Le halo, le trait orange, puis l'âme dorée : trois tracés du même segment. */}
      <line x1={P1.x} y1={P1.y} x2={P2.x} y2={P2.y} stroke={ORANGE} strokeOpacity={0.55} strokeWidth={46} strokeLinecap="round" strokeDasharray={LEN} strokeDashoffset={LEN * (1 - draw)} filter="url(#slash-glow)" />
      <line x1={P1.x} y1={P1.y} x2={P2.x} y2={P2.y} stroke={ORANGE} strokeWidth={24} strokeLinecap="round" strokeDasharray={LEN} strokeDashoffset={LEN * (1 - draw)} />
      <line x1={P1.x} y1={P1.y} x2={P2.x} y2={P2.y} stroke={GOLD} strokeWidth={5} strokeLinecap="round" strokeDasharray={LEN} strokeDashoffset={LEN * (1 - Math.max(0, draw * 1.08 - 0.08))} />
    </svg>
  );
}

function Half({ clip, shift, children }: { clip: string; shift: number; children: ReactNode }) {
  return <AbsoluteFill style={{ clipPath: clip, transform: `translate(${N.x * shift}px, ${N.y * shift}px)` }}>{children}</AbsoluteFill>;
}

function SlashPresentation({ children, presentationDirection, presentationProgress: p, passedProps }: TransitionPresentationComponentProps<SlashProps>) {
  const draw = interpolate(p, [0.06, SLASH_DRAWN - 0.06], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const split = interpolate(p, [SLASH_DRAWN + 0.06, 1], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });

  // <TransitionSeries> garde la présentation montée avant et après la
  // transition (progression 0, puis 1) : hors transition, la scène est rendue
  // telle quelle — ni gelée, ni dédoublée, ni placée au-dessus des sous-titres.
  if (p <= 0 || p >= 1) return <AbsoluteFill>{children}</AbsoluteFill>;

  if (presentationDirection === "entering") {
    // Sous les deux moitiés : l'écran de TRED arrive, légèrement en avant.
    return (
      <AbsoluteFill style={{ zIndex: 1 }}>
        <AbsoluteFill style={{ transform: `scale(${1.12 - 0.12 * split})` }}>{children}</AbsoluteFill>
      </AbsoluteFill>
    );
  }

  const frozen = (
    <AbsoluteFill style={{ transform: `scale(${1 + 0.05 * Math.min(1, p / SLASH_DRAWN)})`, filter: `saturate(${1 - 0.45 * draw}) brightness(${1 - 0.22 * draw})` }}>
      <Freeze frame={passedProps.freezeFrame}>{children}</Freeze>
    </AbsoluteFill>
  );
  const shift = split * (W * 1.15);
  return (
    <AbsoluteFill style={{ zIndex: 2 }}>
      <Half clip={UPPER} shift={-shift}>
        {frozen}
      </Half>
      <Half clip={LOWER} shift={shift}>
        {frozen}
      </Half>
      {/* Éclair bref quand le trait a fini de traverser. */}
      <AbsoluteFill style={{ background: "#FFFFFF", opacity: interpolate(p, [SLASH_DRAWN - 0.08, SLASH_DRAWN - 0.03, SLASH_DRAWN + 0.1], [0, 0.32, 0], clamp) }} />
      <SlashMark draw={draw} opacity={1 - interpolate(p, [SLASH_DRAWN + 0.1, SLASH_DRAWN + 0.38], [0, 1], clamp)} />
    </AbsoluteFill>
  );
}

export const slashCut = (props: SlashProps): TransitionPresentation<SlashProps> => ({ component: SlashPresentation, props });
