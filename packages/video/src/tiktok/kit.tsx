import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, OffthreadVideo, interpolate, useCurrentFrame } from "remotion";

/**
 * Campagne TikTok / Snapchat « Survive Your Klausur » (2026-11-14).
 *
 * Trois pilotes verticaux (540 × 960 px CSS, rendus en `--scale=2` →
 * 1080 × 1920). L'univers de la campagne a sa propre palette — bleu nuit,
 * orange, jaune doré — décidée par le fondateur pour les réseaux. L'app, elle,
 * garde ses couleurs : tout ce qu'on voit de TRED ici est une capture de la
 * vraie interface (scripts/cinematic-captures.mjs), jamais une maquette.
 */

export const FPS = 30;
export const W = 540;
export const H = 960;
export const s = (sec: number) => Math.round(sec * FPS);

export const NIGHT = "#0A0E27";
export const ORANGE = "#FF5722";
export const GOLD = "#FFC107";
export const INK = "#050819";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const easeOut = Easing.bezier(0.33, 1, 0.68, 1);
export const easeInOut = Easing.inOut(Easing.cubic);

/** 0 → 1 entre deux images, adouci. */
export const progress = (frame: number, start: number, end: number, easing: (n: number) => number = easeOut) => interpolate(frame, [start, end], [0, 1], { ...clamp, easing });

/** Pop : ressort amorti, léger dépassement. */
export function pop(frame: number, start: number, frames = 10): number {
  const t = Math.max(0, frame - start) / frames;
  if (t >= 1) return 1;
  return 1 - Math.cos(t * Math.PI * 1.35) * Math.exp(-t * 4.2) * (1 - t);
}

/* ── Les fichiers de la campagne (plans d'ambiance, captures de l'app) ── */

type Ctx = { (key: string): string | { default: string }; keys(): string[] };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const files = (require as any).context("../assets/tiktok", false, /\.(jpg|mp4)$/) as Ctx;
export const media = (name: string) => {
  const m = files(`./${name}`);
  return typeof m === "string" ? m : m.default;
};

/* ── Les clips « face caméra » du fondateur ───────────────────────────── */

// Le dossier où le fondateur dépose ses clips (voir son LISEZ-MOI). Il est lu
// au moment où Remotion assemble le projet : un fichier posé là est pris au
// rendu suivant, sans toucher au code. Majuscules acceptées (« INTRO.MOV » :
// la règle Webpack correspondante est dans remotion.config.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const clips = (require as any).context("../../public/facecam", false, /\.(mp4|mov|webm)$/i) as Ctx;

export type FaceCamSlot = "intro" | "outro";

/**
 * Le clip déposé pour cet emplacement — `intro.*` ouvre la vidéo 3, `outro.*`
 * la ferme — ou `null` tant qu'il n'existe pas : la vidéo garde alors son plan
 * de remplacement.
 */
export function faceCam(slot: FaceCamSlot): string | null {
  const stem = (key: string) => (key.split("/").pop() ?? "").replace(/\.[^.]+$/, "").toLowerCase();
  const key = clips.keys().find((k) => stem(k) === slot);
  if (!key) return null;
  const m = clips(key);
  return typeof m === "string" ? m : m.default;
}

/* ── Plan d'ambiance plein cadre ──────────────────────────────────────── */

/**
 * Un plan Replicate (1080 × 1920, 25 i/s). `from` : seconde de départ dans le
 * clip ; `rate` : vitesse ; `zoom` / `focus` : recadrage (« 50% 40% »).
 * Un voile bleu nuit unifie les plans et garde les textes lisibles.
 */
export function BRoll({
  src,
  from = 0,
  rate = 1,
  zoom = 1.04,
  drift = 0.0006,
  focus = "50% 45%",
  veil = 0.28,
  children,
}: {
  src: string;
  from?: number;
  rate?: number;
  zoom?: number;
  drift?: number;
  focus?: string;
  veil?: number;
  children?: ReactNode;
}) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: NIGHT, overflow: "hidden" }}>
      <OffthreadVideo
        src={src}
        muted
        trimBefore={Math.round(from * FPS)}
        playbackRate={rate}
        style={{ width: "100%", height: "100%", objectFit: "cover", transformOrigin: focus, transform: `scale(${zoom + frame * drift})` }}
      />
      {/* Teinte bleu nuit, puis dégradés haut et bas pour les textes. */}
      <AbsoluteFill style={{ background: NIGHT, opacity: veil * 0.55, mixBlendMode: "multiply" }} />
      <AbsoluteFill style={{ background: `linear-gradient(180deg, rgb(10 14 39 / ${veil + 0.42}) 0%, rgb(10 14 39 / 0) 30%, rgb(10 14 39 / 0) 52%, rgb(10 14 39 / ${veil + 0.5}) 100%)` }} />
      {children}
    </AbsoluteFill>
  );
}

/* ── Textes d'accroche (« stickers ») ─────────────────────────────────── */

export type StickerLine = {
  text: ReactNode;
  /** Image (relative à la scène) où la ligne apparaît. */
  at: number;
  /** Ligne posée sur un aplat orange. */
  hot?: boolean;
  size?: number;
};

/**
 * Le texte d'accroche de la scène, en haut de l'écran, hors des zones que
 * TikTok et Snapchat recouvrent (barre du haut, boutons à droite, légende en bas).
 */
export function Sticker({ lines, top = 96, until, align = "center" }: { lines: StickerLine[]; top?: number; until?: number; align?: "center" | "left" }) {
  const frame = useCurrentFrame();
  const out = until === undefined ? 0 : progress(frame, until - 6, until);
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: 26,
        right: 26,
        display: "flex",
        flexDirection: "column",
        alignItems: align === "center" ? "center" : "flex-start",
        gap: 8,
        opacity: 1 - out,
        transform: `translateY(${-out * 14}px)`,
      }}
    >
      {lines.map((line, i) => {
        const k = pop(frame, line.at);
        if (frame < line.at) return null;
        const base: CSSProperties = {
          fontFamily: "Inter, sans-serif",
          fontWeight: 900,
          fontStyle: "italic",
          fontSize: line.size ?? 39,
          lineHeight: 1.08,
          letterSpacing: "-0.02em",
          textTransform: "uppercase",
          textAlign: "center",
          color: "#FFFFFF",
          transform: `scale(${0.7 + 0.3 * k}) rotate(${line.hot ? -2 : 0}deg)`,
          opacity: Math.min(1, k * 1.6),
        };
        return line.hot ? (
          <span key={i} style={{ ...base, background: ORANGE, padding: "6px 16px 8px", borderRadius: 12, boxShadow: "0 14px 34px -12px rgb(255 87 34 / 0.75)" }}>
            {line.text}
          </span>
        ) : (
          <span key={i} style={{ ...base, textShadow: `0 3px 0 ${INK}, 3px 0 0 ${INK}, -3px 0 0 ${INK}, 0 -3px 0 ${INK}, 0 10px 26px rgb(0 0 0 / 0.75)` }}>
            {line.text}
          </span>
        );
      })}
    </div>
  );
}
