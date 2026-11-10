import { useLayoutEffect, type CSSProperties, type ReactNode } from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import type { Professor } from "../../../web/src/api/lib/professors";

/**
 * Boîte à outils commune aux vidéos promo : temps, apparitions, transitions.
 * Toutes les animations sont des fonctions pures de l'image courante.
 */

export const FPS = 30;
export const W = 540;
export const H = 960;
export const s = (sec: number) => Math.round(sec * FPS);

export const CREAM = "#FDFBF7";
export const INK = "#1A1A1A";
export const YELLOW = "#EAB308";
export const NIGHT = "#0F172A";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const easeOut = Easing.bezier(0.33, 1, 0.68, 1);

/** 0 → 1 entre deux images, adouci. */
export function progress(frame: number, start: number, end: number) {
  return interpolate(frame, [start, end], [0, 1], { ...clamp, easing: easeOut });
}

/** Apparition « fondu + montée ». */
export function rise(frame: number, start: number, distance = 18, frames = 10): CSSProperties {
  const p = progress(frame, start, start + frames);
  return { opacity: p, transform: `translateY(${(1 - p) * distance}px)` };
}

/** Pop (ressort amorti, sans dépassement excessif). */
export function pop(frame: number, start: number): number {
  const t = Math.max(0, frame - start) / 9;
  if (t >= 1) return 1;
  return 1 - Math.cos(t * Math.PI * 1.35) * Math.exp(-t * 4.2) * (1 - t);
}

/** Les avatars de l'app vivent sur /avatars/ ; dans Remotion, via staticFile. */
export function withStaticImage(p: Professor): Professor {
  return p.image ? { ...p, image: staticFile(p.image.replace(/^\//, "")) } : p;
}

export type Enter = "fade" | "zoom" | "wipe" | "slide";

/**
 * Une scène avec son entrée et sa sortie. Les transitions passent par le fond
 * (jamais de double exposition entre deux mises en page chargées).
 */
export function SceneFrame({
  dur,
  enter = "fade",
  exitFrames = 7,
  background = NIGHT,
  children,
}: {
  dur: number;
  enter?: Enter;
  exitFrames?: number;
  background?: string;
  children: ReactNode;
}) {
  const frame = useCurrentFrame();
  const inP = progress(frame, 0, enter === "wipe" ? 14 : 10);
  const out = exitFrames ? progress(frame, dur - exitFrames, dur) : 0;
  let style: CSSProperties = {};
  if (enter === "zoom") style = { transform: `scale(${1.08 - 0.08 * inP})`, opacity: inP };
  if (enter === "fade") style = { opacity: inP };
  if (enter === "slide") style = { transform: `translateY(${(1 - inP) * 60}px)`, opacity: inP };
  if (enter === "wipe") style = { clipPath: `circle(${inP * 120}% at 50% 50%)` };
  return (
    <AbsoluteFill style={{ background }}>
      <AbsoluteFill style={{ ...style, opacity: (style.opacity as number | undefined ?? 1) * (1 - out) }}>
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** Photo de la filière (fonds de l'app), lente dérive « Ken Burns ». */
export function PhotoBackdrop({ src, opacity = 0.45, veil = 0.6 }: { src: string; opacity?: number; veil?: number }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img
        src={staticFile(src)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity,
          transform: `scale(${1.08 + frame * 0.0009}) translateY(${-frame * 0.08}px)`,
        }}
      />
      <AbsoluteFill style={{ background: `linear-gradient(180deg, rgb(15 23 42 / ${veil * 0.7}), rgb(15 23 42 / ${veil}))` }} />
    </AbsoluteFill>
  );
}

/**
 * Les composants de l'app affichent leurs images avec <img> (pas <Img> de
 * Remotion) : on retient chaque capture jusqu'à ce qu'elles soient décodées.
 */
export function useImagesReady() {
  const frame = useCurrentFrame();
  useLayoutEffect(() => {
    const handle = delayRender("Images de l'app");
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        continueRender(handle);
      }
    };
    requestAnimationFrame(() => {
      const waits = Array.from(document.images).map((img) =>
        img.complete
          ? img.decode().catch(() => undefined)
          : new Promise<void>((resolve) => {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
            }),
      );
      void Promise.all(waits).then(finish);
    });
    return finish;
  }, [frame]);
}

/** « Défilement » du tableau entre deux images (translation pilotée par la timeline). */
export function interpolateScroll(frame: number, start: number, end: number, from: number, to: number) {
  return interpolate(frame, [start, end], [from, to], { ...clamp, easing: Easing.inOut(Easing.cubic) });
}
