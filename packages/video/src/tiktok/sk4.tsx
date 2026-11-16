import type { ReactNode } from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, useCurrentFrame } from "remotion";
import type { Cue, VoFile } from "../promo/voice";
import { FPS, GOLD, NIGHT, Sticker, media, pop, s } from "./kit";
import { SurviveVideo } from "./engine";
import { EndCard, PdfScroll } from "./scenes";
import vo4Json from "../assets/vo-t-de4.json";
import voice4 from "../assets/vo-t-de4.mp3";
import music1 from "../assets/music-t-de1.mp3";
import sfxSlash from "../assets/sfx-slash.wav";
import sfxUi from "../assets/sfx-tred-ui.wav";
import sfxWhoosh from "../assets/sfx-whoosh.wav";
import sfxPop from "../assets/sfx-pop.wav";
import sfxSuccess from "../assets/sfx-success.wav";

/**
 * SK-4 · Visual Learning (20 s) — « Ce n'est pas juste du texte ».
 *
 *   un mur de texte → slash → un téléphone : la Tafel, puis l'Explorateur 3D
 *   (le turboréacteur tourne, on touche la chambre de combustion), puis le
 *   mini-jeu → « Das ist nicht nur Text. » → TRED, lien dans le profil.
 *
 * Les trois écrans sont la VRAIE app, filmée image par image sur le serveur
 * local (tred-perf/sk4-captures.ts → src/assets/tiktok/app-sk4-*.mp4) : rien
 * n'est maquetté. Voix : Liam, comme SK-1 (src/voiceovers.mjs, t-de4).
 * Musique : la nappe de SK-1, les deux vidéos se répondent.
 */
const vo4 = vo4Json as VoFile;
const cue = (at: number, src: string, volume: number): Cue => ({ frame: Math.round(at), src, volume });

/** Le téléphone : un cadre, et dedans une prise de vue de l'app (1000 × 1778), cadrée sur sa partie utile. */
const PHONE = { w: 470, h: 850, radius: 50, bezel: 9 };

export function Phone({ children, tilt = 0 }: { children: ReactNode; tilt?: number }) {
  const frame = useCurrentFrame();
  const k = pop(frame, 0, 14);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(90% 60% at 50% 34%, #1E3154 0%, ${NIGHT} 70%)`, alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          width: PHONE.w,
          height: PHONE.h,
          marginTop: 40,
          borderRadius: PHONE.radius,
          padding: PHONE.bezel,
          background: "linear-gradient(160deg, #3B4458, #11162B)",
          boxShadow: `0 40px 90px rgb(0 0 0 / 0.55), 0 0 0 1.5px rgb(255 255 255 / 0.14), 0 0 60px rgb(255 193 7 / 0.12)`,
          transform: `perspective(1400px) rotateY(${tilt * (1 - k)}deg) scale(${0.9 + 0.1 * k})`,
          opacity: Math.min(1, k * 1.6),
        }}
      >
        <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: PHONE.radius - PHONE.bezel, overflow: "hidden", background: NIGHT }}>{children}</div>
      </div>
    </AbsoluteFill>
  );
}

/**
 * Une prise de vue de l'app (1000 × 1778) dans l'écran du téléphone : ajustée
 * à la LARGEUR de l'écran, remontée de `top` px de capture (pour passer sous
 * la barre du haut de l'app quand elle n'apporte rien).
 */
export function Shot({ src, from, rate, top = 0 }: { src: string; from: number; rate: number; top?: number }) {
  const scale = (PHONE.w - 2 * PHONE.bezel) / 1000;
  return (
    <OffthreadVideo
      src={src}
      muted
      trimBefore={Math.round(from * FPS)}
      playbackRate={rate}
      style={{ position: "absolute", left: 0, top: -top * scale, width: 1000 * scale, height: 1778 * scale, maxWidth: "none" }}
    />
  );
}

/** Un mot posé sur le téléphone (« Tafel », « 3D », « Mini-Spiel »). */
export function Tag({ text, at }: { text: string; at: number }) {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const k = pop(frame, at, 10);
  return (
    <div style={{ position: "absolute", top: 60, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
      <div style={{ transform: `scale(${0.7 + 0.3 * k}) rotate(-2deg)`, opacity: Math.min(1, k * 1.5), background: GOLD, color: NIGHT, fontWeight: 900, fontSize: 30, padding: "6px 18px", borderRadius: 12, boxShadow: "0 10px 30px rgb(0 0 0 / 0.4)" }}>{text}</div>
    </div>
  );
}

/** « Falsch. » (ou un autre verdict) : le mot barre l'écran, puis s'efface. */
export function Wrong({ word = "Falsch" }: { word?: string }) {
  const frame = useCurrentFrame();
  const k = pop(frame, 2, 9);
  return (
    <AbsoluteFill style={{ background: NIGHT, alignItems: "center", justifyContent: "center" }}>
      <AbsoluteFill style={{ background: "radial-gradient(70% 40% at 50% 50%, rgb(255 87 34 / 0.35), rgb(10 14 39 / 0) 70%)" }} />
      <div style={{ transform: `scale(${0.5 + 0.5 * k}) rotate(-4deg)`, color: "#fff", fontWeight: 900, fontSize: 104, letterSpacing: -2, textShadow: "0 12px 40px rgb(0 0 0 / 0.5)" }}>
        {word}
        <span style={{ color: "#FF5722" }}>.</span>
      </div>
    </AbsoluteFill>
  );
}

/** Les trois écrans côte à côte : « Das ist nicht nur Text. » */
function Trio() {
  const frame = useCurrentFrame();
  const items: [string, number, number, string][] = [
    [media("app-sk4-tafel.mp4"), 7.6, 110, "Tafel"],
    [media("app-sk4-explorer.mp4"), 24.5, 180, "3D"],
    [media("app-sk4-game.mp4"), 2.2, 60, "Spiel"],
  ];
  return (
    <AbsoluteFill style={{ background: `radial-gradient(90% 60% at 50% 40%, #1E3154 0%, ${NIGHT} 70%)` }}>
      {items.map(([src, from, top, label], i) => {
        const k = pop(frame, 2 + i * 5, 12);
        const w = 158;
        const h = 262;
        const scale = w / 1000;
        return (
          <div key={label} style={{ position: "absolute", left: 18 + i * (w + 14), top: 300 + (i === 1 ? -26 : 0), width: w, transform: `translateY(${(1 - k) * 60}px) scale(${0.85 + 0.15 * k})`, opacity: Math.min(1, k * 1.5) }}>
            <div style={{ position: "relative", width: w, height: h, borderRadius: 20, overflow: "hidden", boxShadow: "0 20px 50px rgb(0 0 0 / 0.5), 0 0 0 2px rgb(255 255 255 / 0.16)", background: NIGHT }}>
              <OffthreadVideo src={src} muted trimBefore={Math.round(from * FPS)} playbackRate={0.6} style={{ position: "absolute", left: 0, top: -top * scale, width: 1000 * scale, height: 1778 * scale, maxWidth: "none" }} />
            </div>
            <div style={{ marginTop: 10, textAlign: "center", color: i === 1 ? GOLD : "#fff", fontWeight: 800, fontSize: 22 }}>{label}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

export function SurviveVisual() {
  return (
    <SurviveVideo
      vo={vo4}
      voice={voice4}
      music={music1}
      seconds={20}
      //       Lernen…  Falsch.  In TRED…  Dann drehe…  Und am Ende…  Das ist…  TRED — Link
      starts={[0.5, 2.95, 4.0, 7.75, 11.75, 14.75, 17.2]}
      captionsY={(f) => (f < s(2.85) ? 600 : f < s(3.85) ? 720 : f < s(14.6) ? 880 : f < s(17.05) ? 700 : 640)}
      // « TRED — Link im Profil » : la carte de fin le montre, les sous-titres s'effacent.
      captionsUntil={s(17.1)}
      sfx={[
        cue(s(2.85), sfxSlash, 0.6),
        cue(s(3.85) - 4, sfxUi, 0.6),
        cue(s(7.6) - 4, sfxWhoosh, 0.28),
        cue(s(10.2), sfxPop, 0.4),
        cue(s(11.65) - 4, sfxWhoosh, 0.28),
        cue(s(12.6), sfxPop, 0.35),
        cue(s(13.5), sfxSuccess, 0.3),
        cue(s(14.6) - 4, sfxWhoosh, 0.25),
        cue(s(17.05) - 6, sfxSuccess, 0.35),
      ]}
      scenes={[
        {
          name: "Nur Text?",
          at: 0,
          render: ({ dur, f }) => (
            <>
              <PdfScroll dur={dur} />
              <Sticker
                lines={[
                  { text: "Lernen mit KI =", at: f("Lernen"), size: 40 },
                  { text: "nur Text?", at: f("nur"), hot: true, size: 46 },
                ]}
              />
            </>
          ),
        },
        { name: "Falsch", at: 2.85, enter: "slash", render: () => <Wrong /> },
        {
          name: "Tafel",
          at: 3.85,
          enter: "fade",
          render: () => (
            <>
              <Phone tilt={-14}>
                <Shot src={media("app-sk4-tafel.mp4")} from={0.5} rate={2} />
              </Phone>
              <Tag text="1 · Die Tafel" at={8} />
            </>
          ),
        },
        {
          name: "3D-Explorer",
          at: 7.6,
          enter: "slide",
          render: ({ f }) => {
            const tap = Math.max(s(1.6), f("tippe") - 8);
            return (
              <>
                <Phone tilt={12}>
                  {/* Le moteur tourne (la prise dure 20 s : elle est lue quatre fois plus vite)… */}
                  <Sequence durationInFrames={tap} layout="none">
                    <Shot src={media("app-sk4-explorer.mp4")} from={2.4} rate={4.2} />
                  </Sequence>
                  {/* … puis le doigt touche la chambre de combustion. */}
                  <Sequence from={tap} layout="none">
                    <Shot src={media("app-sk4-explorer.mp4")} from={22.6} rate={1.5} />
                  </Sequence>
                </Phone>
                <Tag text="2 · In 3D" at={8} />
              </>
            );
          },
        },
        {
          name: "Mini-Spiel",
          at: 11.65,
          enter: "slide",
          render: () => (
            <>
              <Phone tilt={-12}>
                <Shot src={media("app-sk4-game.mp4")} from={0.4} rate={2.6} />
              </Phone>
              <Tag text="3 · Das Mini-Spiel" at={8} />
            </>
          ),
        },
        {
          name: "Nicht nur Text",
          at: 14.6,
          enter: "fade",
          render: ({ f }) => (
            <>
              <Trio />
              <Sticker
                top={110}
                lines={[
                  { text: "Das ist nicht", at: Math.max(2, f("Das", 0)), size: 42 },
                  { text: "nur Text.", at: Math.max(8, f("nicht")), hot: true, size: 48 },
                ]}
              />
            </>
          ),
        },
        {
          name: "TRED",
          at: 17.05,
          enter: "fade",
          render: () => (
            <EndCard
              lines={[
                { text: "Sehen. Drehen. Spielen.", at: 8, size: 32 },
                { text: "Verstehen.", at: 16, size: 40, hot: true },
              ]}
              pillAt={32}
            />
          ),
        },
      ]}
    />
  );
}

