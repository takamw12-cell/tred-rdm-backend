import type { ReactNode } from "react";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Logo } from "@/components/logo";
import { PROFESSORS } from "../../../web/src/api/lib/professors";
import type { Cue, VoFile } from "../promo/voice";
import { BRoll, GOLD, H, NIGHT, Sticker, W, clamp, easeInOut, faceCam, media, pop, progress, s } from "./kit";
import { SurviveVideo, type SurviveScene } from "./engine";
import { CamRing, CodeScroll, CompressorSchematic, CtaOverlay, EndCard, PdfScroll, ProfHologram, TafelCam, TopCta, camAt, type Band, type Cam } from "./scenes";
import vo1Json from "../assets/vo-t-de1.json";
import vo2Json from "../assets/vo-t-de2.json";
import vo3Json from "../assets/vo-t-de3.json";
import voice1 from "../assets/vo-t-de1.mp3";
import voice2 from "../assets/vo-t-de2.mp3";
import voice3 from "../assets/vo-t-de3.mp3";
import music1 from "../assets/music-t-de1.mp3";
import music2 from "../assets/music-t-de2.mp3";
import music3 from "../assets/music-t-de3.mp3";
import sfxAlarm from "../assets/sfx-alarm.wav";
import sfxSlash from "../assets/sfx-slash.wav";
import sfxUi from "../assets/sfx-tred-ui.wav";
import sfxWhoosh from "../assets/sfx-whoosh.wav";
import sfxPop from "../assets/sfx-pop.wav";
import sfxClick from "../assets/sfx-click.wav";
import sfxSuccess from "../assets/sfx-success.wav";

/**
 * Les trois pilotes de « Survive Your Klausur » (allemand, 9:16).
 *
 *   SK-1  Die Klausur morgen   20 s  panique → slash → TRED explique → soulagement
 *   SK-2  Physik verstehen     20 s  turboréacteur → compresseur → slash → la Tafel
 *   SK-3  Founder Story        25 s  ce qu'il étudie → bureau, code → slash → le professeur de l'app, la démo → appel
 *
 * Textes de la voix : src/voiceovers.mjs (TIKTOK), mot pour mot ceux du
 * fondateur. Les instants ci-dessous sont en secondes ; `starts` pose chaque
 * phrase de la voix, les scènes sont taillées autour.
 *
 * Le visage de la campagne est Prof. Kenta, « Das junge Genie » : le professeur
 * par défaut de l'app. Toutes les captures le montrent (CINE_PROFESSOR=genius),
 * SK-3 le fait apparaître en hologramme, et l'écran d'attente de l'import
 * l'affiche à son tour — l'étudiant retrouve dans TRED celui qu'il a vu sur TikTok.
 */

const vo1 = vo1Json as VoFile;
const vo2 = vo2Json as VoFile;
const vo3 = vo3Json as VoFile;

/** Dégradés haut et bas sur une capture plein cadre : place aux textes. */
const Shade = () => <AbsoluteFill style={{ background: "linear-gradient(180deg, rgb(10 14 39 / 0.86) 0%, rgb(10 14 39 / 0) 24%, rgb(10 14 39 / 0) 60%, rgb(10 14 39 / 0.9) 82%)" }} />;

const cue = (at: number, src: string, volume: number): Cue => ({ frame: Math.round(at), src, volume });

/* ── SK-1 · Die Klausur morgen ────────────────────────────────────────── */

/** L'écran entier de l'app : la capture remplit le cadre 9:16. */
const FULL = { x: 500, y: 889, w: 1000 };

// La réponse de la Tafel (capture app-de1-page0) : l'énoncé et son schéma,
// puis 1. Ersatzwiderstand, 2. Ohmsches Gesetz, 3. Ergebnis, Kontrolle.
const DE1_BANDS = (b1: number, b2: number, b3: number, rest: number): Band[] => [
  { y0: 0, y1: 750, at: -100 },
  { y0: 752, y1: 912, at: b1, frames: 18 },
  { y0: 914, y1: 1074, at: b2 },
  { y0: 1076, y1: 1218, at: b3 },
  { y0: 1218, y1: 1640, at: rest, frames: 18 },
  { y0: 1640, y1: 1778, at: -100 },
];
const TAFEL_CAMS: Cam[] = [
  { at: 0, ...FULL },
  { at: 10, ...FULL },
  { at: 26, x: 262, y: 904, w: 440 }, // 1. Ersatzwiderstand
  { at: 46, x: 262, y: 904, w: 440 },
  { at: 58, x: 255, y: 1050, w: 440 }, // 2. Ohmsches Gesetz
  { at: 80, x: 255, y: 1050, w: 440 },
  { at: 94, x: 250, y: 1200, w: 440 }, // 3. Ergebnis, Kontrolle
  { at: 100, x: 250, y: 1200, w: 440 },
  // L'étiquette « Ahhh, jetzt verstehe ich! » arrive : le tableau remonte, le résultat se place juste dessous.
  { at: 114, x: 250, y: 1330, w: 440 },
  { at: 165, x: 250, y: 1340, w: 425 },
];
// L'écran « TRED analysiert deine Frage … » (capture app-de1-wait) : la question, en haut du tableau.
const WAIT_CAM: Cam = { at: 46, x: 292, y: 498, w: 564 };
// Sur cet écran, la pastille « TRED analysiert … » décale la question de 32 px vers le bas.
const QUESTION: [number, number, number, number] = [30, 188, 524, 38];

export function SurviveKlausur() {
  return (
    <SurviveVideo
      vo={vo1}
      voice={voice1}
      music={music1}
      seconds={20}
      //       Morgen  80 Seiten  Und ich…  nichts  Statt…  Schau!  Hier wird…  Welche…  TRED — Link
      starts={[0.7, 2.95, 4.55, 6.15, 7.45, 10.4, 11.1, 15.95, 18.2]}
      captionsY={(f) => (f < s(6.7) ? 565 : f < s(10.25) ? 600 : f < s(15.75) ? 735 : 640)}
      // « TRED — Link im Profil » : le logo et la pastille le montrent, les sous-titres s'effacent.
      captionsUntil={s(18.1)}
      sfx={[
        cue(0, sfxAlarm, 0.5),
        cue(s(2.8) - 4, sfxWhoosh, 0.25),
        cue(s(6.7), sfxSlash, 0.6),
        cue(s(6.7) + 13, sfxUi, 0.7),
        cue(s(10.25) - 4, sfxWhoosh, 0.25),
        cue(s(10.25) + 24, sfxPop, 0.35),
        cue(s(10.25) + 52, sfxPop, 0.35),
        cue(s(10.25) + 84, sfxPop, 0.35),
        cue(s(10.25) + 100, sfxSuccess, 0.4),
        cue(s(15.75) - 4, sfxWhoosh, 0.25),
        cue(s(18.1) - 6, sfxSuccess, 0.35),
      ]}
      scenes={[
        {
          name: "Panik",
          at: 0,
          // Le plan commence à 3,55 s : les mains dans les cheveux, sans l'ordinateur à l'image.
          render: () => (
            <BRoll src={media("broll-stress.mp4")} from={3.55} rate={0.86} zoom={1.06}>
              <Sticker lines={[{ text: "Morgen Klausur 💀", at: 2, hot: true, size: 42 }]} />
            </BRoll>
          ),
        },
        {
          name: "80 Seiten",
          at: 2.8,
          enter: "fade",
          render: ({ dur, f }) => (
            <>
              <PdfScroll dur={dur} />
              <Sticker
                lines={[
                  { text: "80 Seiten.", at: f("80"), size: 44 },
                  { text: "0 Ahnung.", at: f("nichts"), hot: true, size: 44 },
                ]}
              />
            </>
          ),
        },
        {
          name: "Die Frage in TRED",
          at: 6.7,
          enter: "slash",
          render: () => (
            <>
              <TafelCam src={media("app-de1-wait.jpg")} cams={[{ at: 0, ...FULL }, { at: 24, ...FULL }, WAIT_CAM]} />
              <CamRing cam={WAIT_CAM} rect={QUESTION} at={50} />
              <Shade />
              <Sticker lines={[{ text: "Moment mal …", at: 30, hot: true, size: 44 }]} top={330} />
            </>
          ),
        },
        {
          name: "Die Tafel",
          at: 10.25,
          enter: "fade",
          render: () => (
            <>
              <TafelCam src={media("app-de1-page0.jpg")} cams={TAFEL_CAMS} bands={DE1_BANDS(24, 52, 84, 108)} />
              <Shade />
              <Sticker
                lines={[
                  { text: "Ahhh,", at: 100 },
                  { text: "jetzt verstehe ich!", at: 105, hot: true, size: 36 },
                ]}
              />
            </>
          ),
        },
        {
          name: "Erleichtert",
          at: 15.75,
          enter: "fade",
          render: () => (
            <BRoll src={media("broll-relief.mp4")} from={0.9} zoom={1.04} veil={0.2}>
              <CtaOverlay at={s(18.1) - s(15.75)} top={500} />
            </BRoll>
          ),
        },
      ]}
    />
  );
}

/* ── SK-2 · Physik verstehen ──────────────────────────────────────────── */

// La réponse de la Tafel sur le compresseur (capture app-sk2-page0) : l'énoncé
// et ses données, 1. Isentrope Verdichtung (formule, courbe), 2. Arbeit, 3. Ergebnis.
const SK2_CAMS: Cam[] = [
  { at: 0, ...FULL },
  { at: 24, ...FULL },
  { at: 42, x: 405, y: 658, w: 740 }, // « Der Verdichter verrichtet Arbeit an der Luft », les données
  { at: 62, x: 405, y: 658, w: 740 },
  { at: 80, x: 262, y: 760, w: 460 }, // T₂ = … = 761 K, la courbe
  { at: 112, x: 262, y: 766, w: 450 },
  { at: 130, x: 262, y: 1090, w: 460 }, // 2. Arbeit des Verdichters
  { at: 168, x: 262, y: 1090, w: 460 },
  { at: 186, x: 250, y: 1290, w: 440 }, // 3. Ergebnis : 475 kJ/kg
  { at: 237, x: 250, y: 1296, w: 425 },
];
const SK2_BANDS: Band[] = [
  { y0: 0, y1: 270, at: -100 },
  { y0: 272, y1: 578, at: 26, frames: 18 },
  { y0: 580, y1: 1050, at: 66, frames: 20 },
  { y0: 1052, y1: 1210, at: 134 },
  { y0: 1212, y1: 1640, at: 176, frames: 18 },
  { y0: 1640, y1: 1778, at: -100 },
];

/** `sayAt` : image où la voix dit « verstehen statt auswendig lernen ». */
function BraytonTafel({ sayAt }: { sayAt: number }) {
  return (
    <>
      <TafelCam src={media("app-sk2-page0.jpg")} cams={SK2_CAMS} bands={SK2_BANDS} />
      <Shade />
      <Sticker
        top={70}
        lines={[
          { text: "Verstehen", at: sayAt, size: 34 },
          { text: "statt auswendig lernen", at: sayAt + 8, hot: true, size: 29 },
        ]}
      />
    </>
  );
}

export function SurvivePhysik() {
  const tafel = s(9.7);
  return (
    <SurviveVideo
      vo={vo2}
      voice={voice2}
      music={music2}
      seconds={20}
      //       Warum…  Die Antwort…  Er verrichtet…  Dadurch…  Genau so…  Das ist…
      starts={[0.3, 5.45, 7.6, 10.45, 13.3, 17.75]}
      captionsY={(f) => (f < s(3.1) ? 565 : f < tafel ? 735 : 738)}
      // La carte de fin porte la dernière phrase : pas de sous-titres par-dessus.
      captionsUntil={s(17.6)}
      sfx={[
        cue(s(3.1) - 4, sfxWhoosh, 0.25),
        cue(s(5.45) + 22, sfxPop, 0.35),
        cue(tafel, sfxSlash, 0.6),
        cue(tafel + 13, sfxUi, 0.7),
        cue(tafel + 26, sfxPop, 0.3),
        cue(tafel + 66, sfxPop, 0.3),
        cue(tafel + 134, sfxPop, 0.3),
        cue(tafel + 176, sfxSuccess, 0.4),
        cue(s(17.6) + 8, sfxSuccess, 0.5),
      ]}
      scenes={[
        {
          name: "Triebwerk",
          at: 0,
          // Un VRAI moteur d'avion de ligne (au sol, soufflante en moulinet), pas une image générée : les
          // étudiants en aéronautique le reconnaissent. Source et licence : assets/tiktok/CREDITS.md.
          render: () => (
            <BRoll src={media("broll-turbine.mp4")} from={0.4} zoom={1.03} drift={0.0009} focus="56% 33%" veil={0.16}>
              <Sticker
                lines={[
                  { text: "Triebwerk:", at: 3, size: 40 },
                  { text: "heiß ohne Feuer?", at: 9, hot: true, size: 38 },
                ]}
              />
            </BRoll>
          ),
        },
        {
          name: "Der Verdichter",
          at: 3.1,
          enter: "slide",
          render: ({ dur, f }) => (
            <>
              <CompressorSchematic workAt={f("verrichtet")} riseAt={f("verrichtet") + 4} dur={dur} />
              <Sticker
                top={56}
                lines={[
                  { text: "Die Antwort:", at: f("Antwort"), size: 30 },
                  { text: "der Verdichter", at: f("Verdichter"), hot: true, size: 38 },
                ]}
              />
            </>
          ),
        },
        { name: "TRED erklärt", at: 9.7, enter: "slash", render: ({ f }) => <BraytonTafel sayAt={f("verstehen")} /> },
        {
          name: "Die Idee",
          at: 17.6,
          enter: "fade",
          render: () => (
            <EndCard
              lines={[
                { text: "Das ist die Idee", at: 8, size: 34 },
                { text: "hinter TRED.", at: 14, size: 38, hot: true },
              ]}
              pillAt={30}
            />
          ),
        },
      ]}
    />
  );
}

/* ── SK-3 · Founder Story ─────────────────────────────────────────────── */

/**
 * Les clips « face caméra » du fondateur, déposés dans public/facecam/
 * (`intro.*` et `outro.*`, voir le LISEZ-MOI du dossier) : ils prennent leur
 * place tout seuls. Leur durée est mesurée par scripts/tiktok-render.sh et
 * arrive ici ; sans elle (Studio), on les suppose assez longs.
 */
export type FounderProps = {
  /** Durée (s) de public/facecam/intro.*. */
  introSeconds?: number;
  /** Durée (s) de public/facecam/outro.*. */
  outroSeconds?: number;
};

/** La place du clip d'ouverture : « Ich studiere … », puis le début de « Und manchmal … ». */
const INTRO_SLOT = 5;
/** Sans clip : le moteur, le temps de la première phrase. */
const OPENING = 3.2;
/** La fin : « Wenn du studierst, probier TRED aus … ». */
const OUTRO_AT = 20.9;
const END = 25;
/** Un clip ne dépasse pas sa place ; il lui faut deux secondes pour exister. */
const fit = (seconds: number | undefined, slot: number) => Math.min(slot, Math.max(2, (seconds ?? slot + 0.2) - 0.2));

/** Le professeur de la campagne, avec le portrait que sert l'app (public/avatars de packages/web). */
const KENTA = PROFESSORS.genius;
const KENTA_IMG = staticFile((KENTA.image ?? "/avatars/kenta.webp").replace(/^\//, ""));
/** Son portrait sur la Tafel, dans la capture app-de1-page0 (repère « hologram » du script de capture) : centre et diamètre. */
const PORTRAIT = { x: 879, y: 280, d: 112 };
/** Là où l'hologramme se tient pendant « Sie heißt TRED. ». */
const STAGE = { x: W / 2, y: 318, d: 196 };
const T_HOLO = 9; // la fente du slash s'ouvre : il s'imprime
const T_FLY = 40; // il part rejoindre son portrait dans l'app
const T_DOCK = 54; // il y est

// La démonstration, en plein cadre, sur les captures de l'app : la Tafel qui
// s'écrit, le bouton « Als Video erklären », la vidéo qui se prépare, le lecteur.
const DEMO_CAMS: Cam[] = [
  { at: 0, ...FULL },
  { at: 56, ...FULL }, // le professeur se pose sur son portrait : l'écran entier
  { at: 70, x: 262, y: 904, w: 480 },
  { at: 80, x: 262, y: 904, w: 480 },
  { at: 94, x: 250, y: 1190, w: 480 },
  { at: 106, x: 300, y: 1330, w: 560 },
];
const DEMO_BANDS = [52, 63, 74, 84] as const;
// Le bouton « Als Video erklären » (repère relevé par le script de capture).
const CHIP: [number, number, number, number] = [387, 1450, 149, 36];
const CHIP_CAM: Cam = { at: 0, x: 462, y: 1500, w: 520 };
const T_CHIP = 106;
const T_MODAL = 132;
const T_VOICE = 158;
const T_PLAYER = 184;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function FounderDemo() {
  const frame = useCurrentFrame();
  // « Sie heißt TRED. » : le logo et le professeur, le temps de la phrase, puis l'app.
  const sting = interpolate(frame, [3, 9, T_FLY - 6, T_FLY + 6], [0, 1, 1, 0], clamp);
  // Le professeur quitte la scène et se pose sur son vrai portrait, dans la
  // capture — même caméra que la capture, donc au pixel près.
  const fly = progress(frame, T_FLY, T_DOCK, easeInOut);
  const cam = camAt(DEMO_CAMS, frame);
  const dock = { x: W / 2 + (PORTRAIT.x - cam.x) * cam.scale, y: H / 2 + (PORTRAIT.y - cam.y) * cam.scale, d: PORTRAIT.d * cam.scale };
  let screen: ReactNode;
  if (frame < T_CHIP) {
    screen = <TafelCam src={media("app-de1-page0.jpg")} cams={DEMO_CAMS} bands={DE1_BANDS(...DEMO_BANDS)} />;
  } else if (frame < T_MODAL) {
    const tap = interpolate(frame, [T_CHIP + 14, T_CHIP + 24], [0, 1], clamp);
    const scale = W / CHIP_CAM.w;
    screen = (
      <>
        <TafelCam src={media("app-de1-page0.jpg")} cams={[CHIP_CAM]} free />
        <CamRing cam={CHIP_CAM} rect={CHIP} at={T_CHIP + 3} radius={20} />
        {/* Le doigt : une onde qui part du bouton. */}
        {frame >= T_CHIP + 14 && (
          <div
            style={{
              position: "absolute",
              left: W / 2 + (CHIP[0] + CHIP[2] / 2 - CHIP_CAM.x) * scale - 34,
              top: H / 2 + (CHIP[1] + CHIP[3] / 2 - CHIP_CAM.y) * scale - 34,
              width: 68,
              height: 68,
              borderRadius: 34,
              background: "rgb(255 255 255 / 0.55)",
              transform: `scale(${0.4 + 1.4 * tap})`,
              opacity: 1 - tap,
            }}
          />
        )}
      </>
    );
  } else if (frame < T_PLAYER) {
    // La fenêtre « TRED bereitet dein persönliches Video vor … » : le script, puis la voix.
    const src = media(frame < T_VOICE ? "app-de1-gen-script.jpg" : "app-de1-gen-voice.jpg");
    screen = <TafelCam src={src} from={T_MODAL} cams={[{ at: 0, x: 497, y: 889, w: 840 }, { at: T_PLAYER - T_MODAL, x: 497, y: 889, w: 790 }]} />;
  } else {
    // La leçon générée, dans le lecteur de l'app (six captures de la lecture, dix images chacune) : c'est encore lui qui explique.
    const n = Math.min(5, Math.floor((frame - T_PLAYER) / 10));
    screen = <TafelCam src={media(`app-de1-player0${n}.jpg`)} cams={[{ at: 0, x: 500, y: 889, w: 700 }]} />;
  }
  return (
    <>
      {screen}
      <Shade />
      {/* Le projet est en bêta : la vidéo le dit, l'écran aussi. */}
      {frame >= T_PLAYER + 6 && (
        <span style={{ position: "absolute", top: 92, right: 30, padding: "5px 14px 6px", borderRadius: 999, background: GOLD, color: NIGHT, fontFamily: "Inter, sans-serif", fontWeight: 900, fontSize: 17, letterSpacing: "0.08em", transform: `scale(${0.6 + 0.4 * pop(frame, T_PLAYER + 6)})` }}>BETA</span>
      )}
      {sting > 0 && (
        <AbsoluteFill style={{ background: `radial-gradient(85% 55% at 50% 36%, rgb(10 14 39 / ${0.97 * sting}), rgb(10 14 39 / ${0.66 * sting}) 100%)` }}>
          <div style={{ position: "absolute", top: 92, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: sting, transform: `scale(${0.8 + 0.2 * pop(frame, 3, 12)})` }}>
            <Logo variant="row" markClassName="h-[70px] text-white" />
          </div>
        </AbsoluteFill>
      )}
      {/* L'app a déjà ses professeurs : Prof. Kenta, en hologramme comme dans le Hörsaal. */}
      <ProfHologram
        src={KENTA_IMG}
        at={T_HOLO}
        x={lerp(STAGE.x, dock.x, fly)}
        y={lerp(STAGE.y, dock.y, fly)}
        size={lerp(STAGE.d, dock.d, fly)}
        name={KENTA.name}
        role="KI-Professor in TRED"
        stage={1 - progress(frame, T_FLY - 3, T_FLY + 4)}
        opacity={1 - progress(frame, T_DOCK, T_DOCK + 8)}
      />
    </>
  );
}

export function SurviveFounder({ introSeconds, outroSeconds }: FounderProps) {
  const intro = faceCam("intro");
  const outro = faceCam("outro");
  // Un clip plus court que sa place ne se fige pas : la scène suivante commence
  // plus tôt (ouverture), ou la démonstration dure un peu plus (fin).
  const deskAt = intro ? fit(introSeconds, INTRO_SLOT) : OPENING;
  const endAt = outro ? END - fit(outroSeconds, END - OUTRO_AT) : OUTRO_AT;
  const demo = s(12.7);

  const opening: SurviveScene = intro
    ? { name: "Face cam", at: 0, render: () => <BRoll src={intro} zoom={1} drift={0} focus="50% 40%" veil={0.05} /> }
    : {
        name: "Triebwerk",
        at: 0,
        // Sans clip du fondateur : ce qu'il étudie. Le vrai moteur de SK-2, plus serré et plus tard dans le plan.
        render: ({ f }) => (
          <BRoll src={media("broll-turbine.mp4")} from={3.1} rate={0.9} zoom={1.32} drift={0.0008} focus="56% 33%" veil={0.16}>
            <Sticker
              lines={[
                { text: "Ich studiere", at: 4, size: 38 },
                { text: "Luft- & Raumfahrt", at: Math.max(9, f("Raumfahrt") - 3), hot: true, size: 36 },
              ]}
            />
          </BRoll>
        ),
      };

  const ending: SurviveScene = outro
    ? {
        name: "Ende",
        at: endAt,
        enter: "fade",
        // Le logo et « Link im Profil » arrivent en haut pour les deux dernières secondes : le visage reste dégagé.
        render: ({ dur }) => (
          <BRoll src={outro} zoom={1} drift={0} focus="50% 40%" veil={0.05}>
            <TopCta at={Math.max(10, dur - 64)} />
          </BRoll>
        ),
      }
    : {
        name: "Ende",
        at: endAt,
        enter: "fade",
        render: () => (
          <EndCard
            lines={[
              { text: "Ich baue TRED.", at: 6, size: 42 },
              { text: "Teste es und sag mir,", at: 26, size: 27 },
              { text: "was ich verbessern soll.", at: 34, size: 27, hot: true },
            ]}
            pillAt={58}
          />
        ),
      };

  return (
    <SurviveVideo
      vo={vo3}
      voice={voice3}
      music={music3}
      seconds={END}
      rate={1.06}
      //       Ich studiere…  Und manchmal…  Also habe ich…  Sie heißt…  Die Idee…  Das Projekt…  Wenn du…
      starts={[0.3, 3.3, 9.72, 12.9, 14.0, 18.98, 20.98]}
      // Face caméra : sous le visage. Plans d'ambiance : au milieu. Écrans de TRED : sous le tableau.
      captionsY={(f) => (f < s(deskAt) ? (intro ? 760 : 565) : f < s(9.67) ? 565 : f < demo ? 752 : f < s(endAt) ? 720 : outro ? 748 : 700)}
      sfx={[
        cue(s(deskAt) - 4, sfxWhoosh, 0.25),
        cue(s(7.4) - 4, sfxWhoosh, 0.22),
        cue(s(9.67) - 4, sfxWhoosh, 0.25),
        cue(demo, sfxSlash, 0.6),
        cue(demo + 13, sfxUi, 0.7),
        cue(demo + DEMO_BANDS[0], sfxPop, 0.3),
        cue(demo + DEMO_BANDS[1], sfxPop, 0.3),
        cue(demo + DEMO_BANDS[2], sfxPop, 0.3),
        cue(demo + T_CHIP + 14, sfxClick, 0.7),
        cue(demo + T_MODAL, sfxPop, 0.35),
        cue(demo + T_PLAYER, sfxSuccess, 0.4),
        cue(s(endAt) - 4, sfxWhoosh, 0.25),
        cue(outro ? s(END) - 64 : s(endAt) + 58, sfxSuccess, 0.5),
      ]}
      scenes={[
        opening,
        {
          name: "Schreibtisch",
          at: deskAt,
          enter: "fade",
          render: ({ f }) => (
            <BRoll src={media("broll-desk.mp4")} from={0.2} rate={0.8}>
              <Sticker
                lines={[
                  { text: "Stundenlang", at: Math.max(4, f("stundenlang") - 2), size: 40 },
                  { text: "vor dem Skript …", at: Math.max(9, f("Skript") - 2), hot: true, size: 36 },
                ]}
              />
            </BRoll>
          ),
        },
        {
          name: "Kaffee",
          at: 7.4,
          enter: "fade",
          render: () => (
            <BRoll src={media("broll-desk.mp4")} from={3.4} rate={0.9} zoom={1.55} focus="72% 62%">
              <Sticker
                lines={[
                  { text: "Warum so", at: 3, size: 40 },
                  { text: "kompliziert?", at: 7, hot: true, size: 40 },
                ]}
              />
            </BRoll>
          ),
        },
        {
          name: "Code",
          at: 9.67,
          enter: "slide",
          render: ({ dur, f }) => (
            <>
              <CodeScroll dur={dur} />
              <Sticker
                top={84}
                lines={[
                  { text: "Also baue ich", at: 5, size: 34 },
                  { text: "meine eigene Lern-App", at: f("Lern-App") - 4, hot: true, size: 30 },
                ]}
              />
            </>
          ),
        },
        { name: "Demo", at: 12.7, enter: "slash", render: () => <FounderDemo /> },
        ending,
      ]}
    />
  );
}

/** Identifiant de composition, composant, durée (images). */
export const SURVIVE = [
  ["SK-1-Die-Klausur-morgen", SurviveKlausur, s(20)],
  ["SK-2-Physik-verstehen", SurvivePhysik, s(20)],
  ["SK-3-Founder-Story", SurviveFounder, s(25)],
] as const;
