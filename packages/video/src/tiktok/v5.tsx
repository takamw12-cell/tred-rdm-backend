import type { ReactNode } from "react";
import { Img, OffthreadVideo, Sequence, useCurrentFrame } from "remotion";
import type { Cue, VoFile } from "../promo/voice";
import { BRoll, FPS, Sticker, easeInOut, media, progress, s } from "./kit";
import { SurviveVideo } from "./engine";
import { EndCard, PdfScroll } from "./scenes";
import { Phone, Shot, Tag, Wrong } from "./sk4";
import voEn1Json from "../assets/vo-p-en1.json";
import voiceEn1 from "../assets/vo-p-en1.mp3";
import voEn2Json from "../assets/vo-p-en2.json";
import voiceEn2 from "../assets/vo-p-en2.mp3";
import voEn3Json from "../assets/vo-p-en3.json";
import voiceEn3 from "../assets/vo-p-en3.mp3";
import voDe1Json from "../assets/vo-p-de1.json";
import voiceDe1 from "../assets/vo-p-de1.mp3";
import voDe2Json from "../assets/vo-p-de2.json";
import voiceDe2 from "../assets/vo-p-de2.mp3";
import voDe3Json from "../assets/vo-p-de3.json";
import voiceDe3 from "../assets/vo-p-de3.mp3";
import musicEn1 from "../assets/music-en1.mp3";
import musicEn2 from "../assets/music-en2.mp3";
import musicEn3 from "../assets/music-en3.mp3";
import musicDe1 from "../assets/music-de1.mp3";
import musicDe2 from "../assets/music-de2.mp3";
import musicDe3 from "../assets/music-de3.mp3";
import sfxSlash from "../assets/sfx-slash.wav";
import sfxUi from "../assets/sfx-tred-ui.wav";
import sfxWhoosh from "../assets/sfx-whoosh.wav";
import sfxPop from "../assets/sfx-pop.wav";
import sfxSuccess from "../assets/sfx-success.wav";

/**
 * Campagne V5 « la pépite » (2026-11-16) : trois vidéos en anglais, trois en
 * allemand, 9:16, moins de 25 s. Textes du fondateur, sans promesse absolue
 * (règle du 2026-11-16 : « Checked citations », pas « Zero Hallucination »). Aucune 3D,
 * aucun mini-jeu : seulement ce qui tourne en production — le tuteur, l'import,
 * les preuves PDF, la vidéo explicative, le plan de révision.
 *
 * Même moteur que SK-1 à SK-6. Les écrans sont la VRAIE app, filmée au format
 * téléphone sur le serveur local avec un curseur visible
 * (tred-perf/v5/v5-captures.ts → src/assets/tiktok/app-v5-*.mp4). Ce qui est
 * simulé dans ces prises : le texte des réponses du tuteur et le contenu de la
 * vidéo explicative (pas de clé de modèle en local) — écrits au format exact
 * de l'app. Ce qui est réel : l'import, la vérification de la citation, le
 * lecteur PDF et son surlignage, le Lernprofil et le plan sur 7 jours.
 *
 * Voix (src/voiceovers.mjs, p-*) : Laura, Liam, Jessica, Hale.
 */
const cue = (at: number, src: string, volume: number): Cue => ({ frame: Math.round(at), src, volume });

/** L'écran du téléphone de sk4.tsx : 470 px de large moins deux bords de 9 px. */
const SCREEN_W = 452;
const SCALE = SCREEN_W / 1000;

/**
 * Une prise de vue qui AVANCE vers un point : `focus` (fraction de la capture
 * 1000 × 1778) vient se poser en `land` (fraction de l'écran du téléphone), agrandi `zoom` fois.
 */
function ZoomShot({ src, from = 0, rate = 1, zoom, focus, land, start = 0, frames = 20, still = false }: { src: string; from?: number; rate?: number; zoom: number; focus: [number, number]; land: [number, number]; start?: number; frames?: number; /** `src` est une image : l'écran est immobile (une vidéo lue au ralenti sur un écran fixe fait échouer le moteur). */ still?: boolean }) {
  const frame = useCurrentFrame();
  const k = progress(frame, start, start + frames, easeInOut);
  const w = 1000 * SCALE;
  const h = 1778 * SCALE;
  const z = 1 + (zoom - 1) * k;
  const cx = focus[0] * w;
  const cy = focus[1] * h;
  const tx = cx + (land[0] * w - cx) * k - cx * z;
  const ty = cy + (land[1] * h - cy) * k - cy * z;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${z})` }}>
      {still ? <Img src={src} style={{ position: "absolute", left: 0, top: 0, width: w, height: h, maxWidth: "none" }} /> : <OffthreadVideo src={src} muted trimBefore={Math.round(from * FPS)} playbackRate={rate} style={{ position: "absolute", left: 0, top: 0, width: w, height: h, maxWidth: "none" }} />}
    </div>
  );
}

/** Deux plans à la suite dans la même scène. */
function Cut({ at, first, then }: { at: number; first: ReactNode; then: ReactNode }) {
  return (
    <>
      <Sequence durationInFrames={at} layout="none">
        {first}
      </Sequence>
      <Sequence from={at} layout="none">
        {then}
      </Sequence>
    </>
  );
}

/** Le PDF ouvert sur la phrase surlignée : où elle est dans la capture, où on la pose à l'écran. */
const HIGHLIGHT = { focus: [0.44, 0.347] as [number, number], land: [0.5, 0.4] as [number, number], zoom: 1.6 };

/* ── EN 1 · The Proof ─────────────────────────────────────────────────── */
export function PepiteProof() {
  return (
    <SurviveVideo
      vo={voEn1Json as VoFile}
      voice={voiceEn1}
      music={musicEn1}
      seconds={19.2}
      //       Tired…?  TRED doesn't…  Answers from…  Click on…  Every citation…  Try it now…
      starts={[0.3, 2.85, 4.55, 7.4, 12.0, 15.55]}
      captionsY={(f) => (f < s(2.7) ? 600 : f < s(4.4) ? 720 : f < s(15.4) ? 880 : 640)}
      captionsUntil={s(15.5)}
      sfx={[cue(s(2.7), sfxSlash, 0.6), cue(s(4.4) - 4, sfxUi, 0.6), cue(s(7.3) - 4, sfxWhoosh, 0.28), cue(s(8.7), sfxPop, 0.45), cue(s(12.5), sfxPop, 0.35), cue(s(15.4) - 6, sfxSuccess, 0.35)]}
      scenes={[
        {
          name: "Making things up?",
          at: 0,
          render: ({ f }) => (
            <>
              <BRoll src={media("broll-desk.mp4")} from={0.3} rate={0.8} veil={0.34} />
              <Sticker
                lines={[
                  { text: "AI making", at: Math.max(2, f("Tired")), size: 46 },
                  { text: "things up?", at: f("making"), hot: true, size: 48 },
                ]}
              />
            </>
          ),
        },
        { name: "No guessing", at: 2.7, enter: "slash", render: () => <Wrong word="No guessing" /> },
        {
          name: "Answer",
          at: 4.4,
          enter: "fade",
          render: () => (
            <>
              <Phone tilt={-14}>
                {/* La question tapée, puis la réponse qui s'écrit avec sa citation. */}
                <Shot src={media("app-v5-en-proof.mp4")} from={1.0} rate={2.5} />
              </Phone>
              <Tag text="The answer, with its proof" at={8} />
            </>
          ),
        },
        {
          name: "Citation",
          at: 7.3,
          enter: "slide",
          render: ({ f }) => {
            const opened = s(2.3);
            const claim = f("Every") - 4;
            return (
              <>
                <Phone tilt={12}>
                  <Cut
                    at={opened}
                    // Le curseur va sur la citation, appuie : le PDF s'ouvre à la page 12.
                    first={<Shot src={media("app-v5-en-proof.mp4")} from={9.7} rate={1} />}
                    // Puis on s'approche de la phrase surlignée (l'écran est immobile : lu au ralenti).
                    then={<ZoomShot still src={media("app-v5-en-proof-pdf.jpg")} start={8} {...HIGHLIGHT} />}
                  />
                </Phone>
                <Sequence durationInFrames={opened} layout="none">
                  <Tag text="Click the citation" at={6} />
                </Sequence>
                <Sequence from={opened} durationInFrames={claim - opened} layout="none">
                  <Tag text="Your own PDF · page 12" at={4} />
                </Sequence>
                <Sequence from={claim} layout="none">
                  <Sticker
                    lines={[
                      { text: "Checked citations.", at: 4, size: 40 },
                      { text: "Real proofs.", at: f("against") - claim, hot: true, size: 44 },
                    ]}
                  />
                </Sequence>
              </>
            );
          },
        },
        {
          name: "TRED",
          at: 15.4,
          enter: "fade",
          render: () => (
            <EndCard
              lines={[
                { text: "Checked citations. Real proofs.", at: 8, size: 28 },
                { text: "tred-tutor.de", at: 18, size: 42, hot: true },
              ]}
              pillAt={36}
              pill="Try it now"
            />
          ),
        },
      ]}
    />
  );
}

/* ── EN 2 · The Magic Video ───────────────────────────────────────────── */
export function PepiteMovie() {
  return (
    <SurviveVideo
      vo={voEn2Json as VoFile}
      voice={voiceEn2}
      music={musicEn2}
      seconds={17.6}
      //       What if…?  Just click…  It's like…  Link in bio.
      starts={[0.3, 4.8, 11.35, 14.6]}
      captionsY={(f) => (f < s(4.6) ? 600 : f < s(14.5) ? 880 : 640)}
      captionsUntil={s(14.55)}
      sfx={[cue(s(4.6), sfxSlash, 0.6), cue(s(5.5), sfxPop, 0.45), cue(s(7.4) - 4, sfxWhoosh, 0.28), cue(s(11.3) - 4, sfxWhoosh, 0.28), cue(s(14.5) - 6, sfxSuccess, 0.35)]}
      scenes={[
        {
          name: "Boring text?",
          at: 0,
          render: ({ dur, f }) => (
            <>
              <PdfScroll dur={dur} />
              <Sticker
                lines={[
                  { text: "Boring text", at: Math.max(2, f("boring") - 6), size: 46 },
                  { text: "→ a private movie?", at: f("private"), hot: true, size: 38 },
                ]}
              />
            </>
          ),
        },
        {
          name: "Explain as video",
          at: 4.6,
          enter: "slash",
          render: () => (
            <>
              <Phone tilt={-14}>
                {/* Le curseur appuie sur « Explain as video » : la préparation commence. */}
                <Shot src={media("app-v5-en-video.mp4")} from={1.3} rate={1.2} />
              </Phone>
              <Tag text="Explain as video" at={8} />
            </>
          ),
        },
        {
          name: "Player",
          at: 7.4,
          enter: "slide",
          render: () => (
            <>
              <Phone tilt={12}>
                {/* Le lecteur s'ouvre : la question s'écrit, la phrase du polycopié est surlignée. */}
                <Shot src={media("app-v5-en-video.mp4")} from={7.7} rate={1.55} />
              </Phone>
              <Tag text="Your private movie" at={8} />
            </>
          ),
        },
        {
          name: "Studio",
          at: 11.3,
          enter: "slide",
          render: () => (
            <>
              <Phone tilt={-12}>
                {/* La formule s'écrit, puis le récapitulatif. */}
                <Shot src={media("app-v5-en-video.mp4")} from={15.4} rate={1.7} />
              </Phone>
              <Sticker
                lines={[
                  { text: "Turn text", at: 8, size: 44 },
                  { text: "into a movie.", at: 18, hot: true, size: 44 },
                ]}
              />
            </>
          ),
        },
        {
          name: "TRED",
          at: 14.5,
          enter: "fade",
          render: () => (
            <EndCard
              lines={[
                { text: "Turn text into a movie.", at: 8, size: 32 },
                { text: "tred-tutor.de", at: 18, size: 42, hot: true },
              ]}
              pillAt={32}
              pill="Link in bio"
            />
          ),
        },
      ]}
    />
  );
}

/* ── EN 3 · The University in your Pocket ─────────────────────────────── */
export function PepitePocket() {
  return (
    <SurviveVideo
      vo={voEn3Json as VoFile}
      voice={voiceEn3}
      music={musicEn3}
      seconds={18.3}
      //       Law, Medicine…  TRED adapts…  Upload your…  The ultimate…
      starts={[0.3, 2.9, 5.5, 12.9]}
      captionsY={(f) => (f < s(2.75) ? 640 : f < s(15.5) ? 880 : 640)}
      captionsUntil={s(15.55)}
      sfx={[cue(s(2.75), sfxSlash, 0.6), cue(s(6.25), sfxPop, 0.4), cue(s(7.8) - 4, sfxWhoosh, 0.28), cue(s(9.9), sfxPop, 0.45), cue(s(10.5) - 4, sfxWhoosh, 0.28), cue(s(15.5) - 6, sfxSuccess, 0.35)]}
      scenes={[
        {
          name: "Three majors",
          at: 0,
          render: ({ dur, f }) => (
            <>
              <PdfScroll dur={dur} />
              <Sticker
                lines={[
                  { text: "Law.", at: Math.max(2, f("Law")), size: 50 },
                  { text: "Medicine.", at: f("Medicine"), size: 50 },
                  { text: "Engineering.", at: f("Engineering"), hot: true, size: 46 },
                ]}
              />
            </>
          ),
        },
        {
          name: "Upload",
          at: 2.75,
          enter: "slash",
          render: ({ f }) => {
            const upload = f("Upload") - 4;
            return (
              <>
                <Phone tilt={-14}>
                  {/* Le panneau des documents, « Upload documents », puis le PDF et le PowerPoint dans la liste. */}
                  <Shot src={media("app-v5-en-import.mp4")} from={0.6} rate={1.2} />
                </Phone>
                <Cut at={upload} first={<Tag text="Adapts to your major" at={8} />} then={<Tag text="PDFs & PowerPoints" at={2} />} />
              </>
            );
          },
        },
        {
          name: "Professor",
          at: 7.8,
          enter: "slide",
          render: () => (
            <>
              <Phone tilt={12}>
                <Cut
                  at={s(1.3)}
                  // Les professeurs défilent (8 s de prise, lues en accéléré)…
                  first={<Shot src={media("app-v5-en-profs.mp4")} from={1.2} rate={6.3} />}
                  // … puis on en choisit un.
                  then={<Shot src={media("app-v5-en-profs.mp4")} from={11.0} rate={1.3} />}
                />
              </Phone>
              <Tag text="Choose your professor" at={8} />
            </>
          ),
        },
        {
          name: "Step by step",
          at: 10.5,
          enter: "slide",
          render: ({ f }) => {
            const pocket = f("ultimate") - 4;
            return (
              <>
                <Phone tilt={-12}>
                  {/* La question est envoyée, le tableau s'écrit en trois étapes. */}
                  <Shot src={media("app-v5-en-steps.mp4")} from={4.6} rate={1.15} />
                </Phone>
                <Cut
                  at={pocket}
                  first={<Tag text="Step by step" at={8} />}
                  then={
                    <Sticker
                      lines={[
                        { text: "The university", at: 2, size: 40 },
                        { text: "in your pocket.", at: 12, hot: true, size: 42 },
                      ]}
                    />
                  }
                />
              </>
            );
          },
        },
        {
          name: "TRED",
          at: 15.5,
          enter: "fade",
          render: () => (
            <EndCard
              lines={[
                { text: "The university in your pocket.", at: 8, size: 29 },
                { text: "tred-tutor.de", at: 18, size: 42, hot: true },
              ]}
              pillAt={32}
              pill="Link in bio"
            />
          ),
        },
      ]}
    />
  );
}

/* ── DE 1 · Die Klausur-Rettung ───────────────────────────────────────── */
export function PepiteLernplan() {
  return (
    <SurviveVideo
      vo={voDe1Json as VoFile}
      voice={voiceDe1}
      music={musicDe1}
      seconds={18.9}
      //       Klausur in…?  Keine Panik.  Lade dein…  Es zeigt…  Dein persönlicher…  Jetzt testen.
      starts={[0.3, 3.95, 5.2, 10.4, 13.6, 16.05]}
      captionsY={(f) => (f < s(3.8) ? 600 : f < s(5.05) ? 720 : f < s(15.9) ? 880 : 640)}
      captionsUntil={s(15.95)}
      sfx={[cue(s(3.8), sfxSlash, 0.6), cue(s(5.05) - 4, sfxUi, 0.6), cue(s(7.55) - 4, sfxWhoosh, 0.28), cue(s(9.0), sfxPop, 0.45), cue(s(10.3) - 4, sfxWhoosh, 0.25), cue(s(15.9) - 6, sfxSuccess, 0.35)]}
      scenes={[
        {
          name: "80 Seiten",
          at: 0,
          render: ({ dur, f }) => (
            <>
              <PdfScroll dur={dur} pages={80} />
              <Sticker
                lines={[
                  { text: "Klausur in 2 Tagen.", at: Math.max(2, f("Klausur")), size: 40 },
                  { text: "80 Seiten Skript?", at: f("80"), hot: true, size: 42 },
                ]}
              />
            </>
          ),
        },
        { name: "Keine Panik", at: 3.8, enter: "slash", render: () => <Wrong word="Keine Panik" /> },
        {
          name: "Hochladen",
          at: 5.05,
          enter: "fade",
          render: () => (
            <>
              <Phone tilt={-14}>
                <Cut
                  at={s(1.3)}
                  // Le panneau des documents, « Dokumente hochladen »…
                  first={<Shot src={media("app-v5-de-import80.mp4")} from={1.7} rate={1.7} />}
                  // … et le Skript dans la liste : 80 Seiten.
                  then={<Shot src={media("app-v5-de-import80.mp4")} from={8.3} rate={0.9} />}
                />
              </Phone>
              <Tag text="PDF hochladen" at={8} />
            </>
          ),
        },
        {
          name: "Lernplan erstellen",
          at: 7.55,
          enter: "slide",
          render: () => (
            <>
              <Phone tilt={12}>
                {/* Le Lernprofil défile jusqu'au bouton ; le curseur appuie ; le plan apparaît. */}
                <Shot src={media("app-v5-de-plan.mp4")} from={3.4} rate={1.1} />
              </Phone>
              <Tag text="Lernplan erstellen" at={8} />
            </>
          ),
        },
        {
          name: "Seiten",
          at: 10.3,
          enter: "fade",
          render: ({ f }) => {
            const coach = f("Coach") - 12;
            return (
              <>
                <Phone>
                  {/* Le plan, jour après jour, un peu rapproché : on lit les pages du Skript (S. 42, S. 57, S. 23…). */}
                  <ZoomShot src={media("app-v5-de-plan.mp4")} from={6.3} rate={2.2} zoom={1.3} focus={[0.4, 0.5]} land={[0.52, 0.5]} frames={24} />
                </Phone>
                <Cut
                  at={coach}
                  first={<Tag text="Seiten aus deinem Skript" at={8} />}
                  then={
                    <Sticker
                      lines={[
                        { text: "Dein", at: 2, size: 40 },
                        { text: "7-Tage-Lernplan.", at: 10, hot: true, size: 42 },
                      ]}
                    />
                  }
                />
              </>
            );
          },
        },
        {
          name: "TRED",
          at: 15.9,
          enter: "fade",
          render: () => (
            <EndCard
              lines={[
                { text: "Dein 7-Tage-Lernplan.", at: 8, size: 34 },
                { text: "tred-tutor.de", at: 18, size: 42, hot: true },
              ]}
              pillAt={32}
              pill="Jetzt testen"
            />
          ),
        },
      ]}
    />
  );
}

/* ── DE 2 · Der Tafel-Erklärer ────────────────────────────────────────── */
export function PepiteTafel() {
  return (
    <SurviveVideo
      vo={voDe2Json as VoFile}
      voice={voiceDe2}
      music={musicDe2}
      seconds={16.9}
      //       Hör auf…  Stell TRED…  Der virtuelle…  Wie in…  Probiere es aus.
      starts={[0.3, 3.15, 5.75, 11.3, 14.05]}
      captionsY={(f) => (f < s(3.0) ? 600 : f < s(13.8) ? 880 : 640)}
      captionsUntil={s(13.85)}
      sfx={[cue(s(3.0), sfxSlash, 0.6), cue(s(5.6) - 4, sfxWhoosh, 0.28), cue(s(6.4), sfxPop, 0.35), cue(s(11.4), sfxPop, 0.35), cue(s(13.8) - 6, sfxSuccess, 0.35)]}
      scenes={[
        {
          name: "Seitenlange Skripte",
          at: 0,
          render: ({ f }) => (
            <>
              <BRoll src={media("broll-desk.mp4")} from={0.2} rate={0.8} veil={0.34} />
              <Sticker
                lines={[
                  { text: "Seitenlange Skripte", at: Math.max(2, f("seitenlange") - 8), size: 38 },
                  { text: "lesen?", at: f("lesen"), hot: true, size: 50 },
                ]}
              />
            </>
          ),
        },
        {
          name: "Frage",
          at: 3.0,
          enter: "slash",
          render: () => (
            <>
              <Phone tilt={-14}>
                {/* La question de mécanique, tapée puis envoyée. */}
                <Shot src={media("app-v5-de-tafel.mp4")} from={1.0} rate={2.4} />
              </Phone>
              <Tag text="Stell deine Frage" at={8} />
            </>
          ),
        },
        {
          name: "Tafel",
          at: 5.6,
          enter: "slide",
          render: ({ f }) => {
            const tutor = f("Wie") - 4;
            return (
              <>
                <Phone tilt={12}>
                  <Cut
                    at={s(5.4)}
                    // Prof. Kenta écrit : Freischneiden, Momente um A, Kräfte in z.
                    first={<Shot src={media("app-v5-de-tafel.mp4")} from={7.6} rate={1} />}
                    // Le résultat, encadré en vert.
                    then={<Shot src={media("app-v5-de-tafel.mp4")} from={13.0} rate={0.9} />}
                  />
                </Phone>
                <Cut
                  at={tutor}
                  first={<Tag text="Schritt für Schritt erklärt." at={8} />}
                  then={
                    <Sticker
                      lines={[
                        { text: "Wie echte", at: 2, size: 42 },
                        { text: "Nachhilfe.", at: 12, hot: true, size: 46 },
                      ]}
                    />
                  }
                />
              </>
            );
          },
        },
        {
          name: "TRED",
          at: 13.8,
          enter: "fade",
          render: () => (
            <EndCard
              lines={[
                { text: "Schritt für Schritt erklärt.", at: 8, size: 30 },
                { text: "tred-tutor.de", at: 18, size: 42, hot: true },
              ]}
              pillAt={32}
              pill="Probiere es aus"
            />
          ),
        },
      ]}
    />
  );
}

/* ── DE 3 · Die perfekte Antwort ──────────────────────────────────────── */
export function PepiteAntwort() {
  return (
    <SurviveVideo
      vo={voDe3Json as VoFile}
      voice={voiceDe3}
      music={musicDe3}
      seconds={17.2}
      //       Keine Lust…?  TRED gibt…  Antworten aus…  Lerne smarter…
      starts={[0.3, 4.5, 8.1, 11.9]}
      captionsY={(f) => (f < s(4.3) ? 600 : f < s(14.2) ? 880 : 640)}
      captionsUntil={s(14.25)}
      sfx={[cue(s(4.3), sfxSlash, 0.6), cue(s(8.0) - 4, sfxWhoosh, 0.28), cue(s(9.5), sfxPop, 0.45), cue(s(12.0), sfxPop, 0.35), cue(s(14.2) - 6, sfxSuccess, 0.35)]}
      scenes={[
        {
          name: "Verwirrende Antworten",
          at: 0,
          render: ({ dur, f }) => (
            <>
              <PdfScroll dur={dur} />
              <Sticker
                lines={[
                  { text: "Verwirrende", at: Math.max(2, f("verwirrende") - 10), size: 44 },
                  { text: "KI-Antworten?", at: f("Antworten"), hot: true, size: 44 },
                ]}
              />
            </>
          ),
        },
        {
          name: "Antwort",
          at: 4.3,
          enter: "slash",
          render: () => (
            <>
              <Phone tilt={-14}>
                {/* La question tapée dans la barre, la réponse qui s'écrit avec sa citation. */}
                <Shot src={media("app-v5-de-answer.mp4")} from={1.0} rate={2.3} />
              </Phone>
              <Tag text="Lösung + Beweis" at={8} />
            </>
          ),
        },
        {
          name: "Beweis",
          at: 8.0,
          enter: "slide",
          render: ({ f }) => {
            const opened = s(2.2);
            const smarter = f("Lerne") - 4;
            return (
              <>
                <Phone tilt={12}>
                  <Cut
                    at={opened}
                    // Le curseur appuie sur la citation : le Skript s'ouvre à la page 12.
                    first={<Shot src={media("app-v5-de-answer.mp4")} from={10.1} rate={1} />}
                    then={<ZoomShot still src={media("app-v5-de-answer-pdf.jpg")} start={8} {...HIGHLIGHT} />}
                  />
                </Phone>
                <Sequence durationInFrames={smarter} layout="none">
                  <Tag text="Dein eigenes Skript · S. 12" at={8} />
                </Sequence>
                <Sequence from={smarter} layout="none">
                  <Sticker
                    lines={[
                      { text: "Lerne smarter,", at: 2, size: 42 },
                      { text: "nicht härter.", at: f("nicht", 1) - smarter, hot: true, size: 44 },
                    ]}
                  />
                </Sequence>
              </>
            );
          },
        },
        {
          name: "TRED",
          at: 14.2,
          enter: "fade",
          render: () => (
            <EndCard
              lines={[
                { text: "Antwort + Beweis.", at: 8, size: 36 },
                { text: "tred-tutor.de", at: 18, size: 42, hot: true },
              ]}
              pillAt={32}
            />
          ),
        },
      ]}
    />
  );
}

/** Identifiant de composition, composant, durée (images). */
export const PEPITE = [
  ["V5-EN1-The-Proof", PepiteProof, s(19.2)],
  ["V5-EN2-The-Magic-Video", PepiteMovie, s(17.6)],
  ["V5-EN3-University-in-your-Pocket", PepitePocket, s(18.3)],
  ["V5-DE1-Die-Klausur-Rettung", PepiteLernplan, s(18.9)],
  ["V5-DE2-Der-Tafel-Erklaerer", PepiteTafel, s(16.9)],
  ["V5-DE3-Die-perfekte-Antwort", PepiteAntwort, s(17.2)],
] as const;
