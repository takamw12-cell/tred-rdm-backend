import { Sequence } from "remotion";
import type { Cue, VoFile } from "../promo/voice";
import { Sticker, media, s } from "./kit";
import { SurviveVideo } from "./engine";
import { EndCard, PdfScroll } from "./scenes";
import { Phone, Shot, Tag, Wrong } from "./sk4";
import vo5Json from "../assets/vo-t-de5.json";
import voice5 from "../assets/vo-t-de5.mp3";
import vo6Json from "../assets/vo-t-de6.json";
import voice6 from "../assets/vo-t-de6.mp3";
import music1 from "../assets/music-t-de1.mp3";
import sfxSlash from "../assets/sfx-slash.wav";
import sfxUi from "../assets/sfx-tred-ui.wav";
import sfxWhoosh from "../assets/sfx-whoosh.wav";
import sfxPop from "../assets/sfx-pop.wav";
import sfxSuccess from "../assets/sfx-success.wav";

/**
 * SK-5 « 3D real » et SK-6 « Zero Hallucination » (2026-11-16).
 *
 * Même moteur que SK-1 à SK-4 ; textes validés par le fondateur. Les écrans
 * sont la VRAIE app avec le rendu « studio », filmée sur le serveur local
 * (tred-perf/sk5-captures.ts → src/assets/tiktok/app-sk5-*.mp4) : le cœur
 * BodyParts3D qu'on tourne puis qu'on coupe, le turboréacteur en coupe, et une
 * partie de Fall-Check sur le texte du BGB §§ 104–113 (texte de loi, domaine
 * public), au format téléphone. Les prises de l'Explorateur sont longues (le
 * rendu logiciel du navigateur de test est lent) : elles sont lues accélérées.
 * Voix : Liam (src/voiceovers.mjs, t-de5 et t-de6). Musique : la nappe de SK-1.
 */
const vo5 = vo5Json as VoFile;
const vo6 = vo6Json as VoFile;
const cue = (at: number, src: string, volume: number): Cue => ({ frame: Math.round(at), src, volume });
/** Les prises sont au format téléphone (500 points de large) ; `top` est exprimé pour une largeur de 1000. */
const HEART_TOP = 170;
const ENGINE_TOP = 250;
const FALLCHECK_TOP = 200;

export function SurviveReal3D() {
  return (
    <SurviveVideo
      vo={vo5}
      voice={voice5}
      music={music1}
      seconds={19}
      //       Anatomie…?  Flach.  Bei TRED…  Oder du…  Tippe…  Jetzt kostenlos…
      starts={[0.4, 2.3, 3.2, 8.2, 11.35, 14.0]}
      captionsY={(f) => (f < s(2.2) ? 600 : f < s(3.1) ? 720 : f < s(13.9) ? 880 : 640)}
      captionsUntil={s(14.0)}
      sfx={[
        cue(s(2.2), sfxSlash, 0.6),
        cue(s(3.1) - 4, sfxUi, 0.6),
        cue(s(5.85), sfxPop, 0.4),
        cue(s(8.1) - 4, sfxWhoosh, 0.28),
        cue(s(11.5), sfxPop, 0.4),
        cue(s(13.9) - 6, sfxSuccess, 0.35),
      ]}
      scenes={[
        {
          name: "Lehrbuch",
          at: 0,
          render: ({ dur, f }) => (
            <>
              <PdfScroll dur={dur} />
              <Sticker
                lines={[
                  { text: "Anatomie", at: f("Anatomie"), size: 46 },
                  { text: "aus dem Lehrbuch?", at: f("aus"), hot: true, size: 40 },
                ]}
              />
            </>
          ),
        },
        { name: "Flach", at: 2.2, enter: "slash", render: () => <Wrong word="Flach" /> },
        {
          name: "Herz",
          at: 3.1,
          enter: "fade",
          render: ({ f }) => {
            const cut = Math.max(s(1.8), f("schneidest") - 4);
            return (
              <>
                <Phone tilt={-14}>
                  {/* On tourne le cœur (23 s de prise, lues en accéléré)… */}
                  <Sequence durationInFrames={cut} layout="none">
                    <Shot src={media("app-sk5-coeur.mp4")} from={1} rate={9} top={HEART_TOP} />
                  </Sequence>
                  {/* … puis le mode coupe : le plan avance dans le cœur. */}
                  <Sequence from={cut} layout="none">
                    <Shot src={media("app-sk5-coeur.mp4")} from={24.0} rate={1.3} top={HEART_TOP} />
                  </Sequence>
                </Phone>
                <Sequence durationInFrames={cut} layout="none">
                  <Tag text="Anatomisches Modell" at={8} />
                </Sequence>
                <Sequence from={cut} layout="none">
                  <Tag text="Aufgeschnitten" at={2} />
                </Sequence>
              </>
            );
          },
        },
        {
          name: "Triebwerk",
          at: 8.1,
          enter: "slide",
          render: ({ f }) => {
            const tap = Math.max(s(2), f("Tippe") - 6);
            return (
              <>
                <Phone tilt={12}>
                  <Sequence durationInFrames={tap} layout="none">
                    <Shot src={media("app-sk5-turbofan.mp4")} from={1} rate={5} top={ENGINE_TOP} />
                  </Sequence>
                  <Sequence from={tap} layout="none">
                    <Shot src={media("app-sk5-turbofan.mp4")} from={16.5} rate={1.3} top={ENGINE_TOP} />
                  </Sequence>
                </Phone>
                <Tag text="Triebwerk im Schnitt" at={8} />
              </>
            );
          },
        },
        {
          name: "TRED",
          at: 13.9,
          enter: "fade",
          render: () => (
            <EndCard
              lines={[
                { text: "Jetzt kostenlos ausprobieren", at: 8, size: 30 },
                { text: "tred-tutor.de", at: 18, size: 42, hot: true },
              ]}
              pillAt={36}
            />
          ),
        },
      ]}
    />
  );
}

export function SurviveProof() {
  return (
    <SurviveVideo
      vo={vo6}
      voice={voice6}
      music={music1}
      seconds={19.5}
      //       KI erfindet…?  Nicht hier.  TRED macht…  Nach jeder…  Ein Tipp…  Lernen mit Beleg…
      starts={[0.4, 2.5, 3.5, 6.55, 11.7, 14.85]}
      captionsY={(f) => (f < s(2.4) ? 600 : f < s(3.4) ? 720 : f < s(14.75) ? 880 : 640)}
      captionsUntil={s(14.85)}
      sfx={[
        cue(s(2.4), sfxSlash, 0.6),
        cue(s(3.4) - 4, sfxUi, 0.6),
        cue(s(6.45) - 4, sfxWhoosh, 0.28),
        cue(s(7.6), sfxPop, 0.4),
        cue(s(11.6) - 4, sfxWhoosh, 0.28),
        cue(s(12.4), sfxPop, 0.4),
        cue(s(14.75) - 6, sfxSuccess, 0.35),
      ]}
      scenes={[
        {
          name: "Erfunden?",
          at: 0,
          render: ({ dur, f }) => (
            <>
              <PdfScroll dur={dur} />
              <Sticker
                lines={[
                  { text: "KI erfindet", at: f("KI"), size: 44 },
                  { text: "Antworten?", at: f("Antworten"), hot: true, size: 48 },
                ]}
              />
            </>
          ),
        },
        { name: "Nicht hier", at: 2.4, enter: "slash", render: () => <Wrong word="Nicht hier" /> },
        {
          name: "Aus deinem Skript",
          at: 3.4,
          enter: "fade",
          render: () => (
            <>
              <Phone tilt={-14}>
                {/* Le cas, tiré du document : l'écran est lu lentement, on a le temps de le voir. */}
                <Shot src={media("app-sk5-fallcheck.mp4")} from={0} rate={0.55} top={FALLCHECK_TOP} />
              </Phone>
              <Tag text="Aus deinem Skript" at={8} />
            </>
          ),
        },
        {
          name: "Mit Beleg",
          at: 6.45,
          enter: "slide",
          render: () => (
            <>
              <Phone tilt={12}>
                {/* La réponse est donnée ; la page descend jusqu'à la phrase du document qui la prouve, avec sa page. */}
                <Shot src={media("app-sk5-fallcheck.mp4")} from={3.3} rate={0.55} top={FALLCHECK_TOP} />
              </Phone>
              <Tag text="Beleg + Seitenzahl" at={8} />
            </>
          ),
        },
        {
          name: "Ein Tipp",
          at: 11.6,
          enter: "slide",
          render: () => (
            <>
              <Phone tilt={-12}>
                {/* Un toucher sur la preuve : le document s'ouvre, la phrase surlignée. */}
                <Shot src={media("app-sk5-fallcheck.mp4")} from={5.6} rate={1} top={0} />
              </Phone>
              <Tag text="Ein Tipp → dein Dokument" at={8} />
            </>
          ),
        },
        {
          name: "TRED",
          at: 14.75,
          enter: "fade",
          render: () => (
            <EndCard
              lines={[
                { text: "Lernen mit Beleg.", at: 8, size: 38 },
                { text: "tred-tutor.de", at: 18, size: 42, hot: true },
              ]}
              pillAt={36}
            />
          ),
        },
      ]}
    />
  );
}
