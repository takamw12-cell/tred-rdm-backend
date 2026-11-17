import { useMemo, type ReactNode } from "react";
import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, useCurrentFrame } from "remotion";
import { planVoice, type Cue, type VoFile, type VoicePlan } from "../promo/voice";
import { FPS, GOLD, H, INK, NIGHT, ORANGE, W, clamp, easeInOut, media, pop, progress, s } from "./kit";
import { EndCard, PdfScroll } from "./scenes";
import voEn1Json from "../assets/vo-n-en1.json";
import voiceEn1 from "../assets/vo-n-en1.mp3";
import voEn2Json from "../assets/vo-n-en2.json";
import voiceEn2 from "../assets/vo-n-en2.mp3";
import voEn3aJson from "../assets/vo-n-en3a.json";
import voiceEn3a from "../assets/vo-n-en3a.mp3";
import voEn3bJson from "../assets/vo-n-en3b.json";
import voiceEn3b from "../assets/vo-n-en3b.mp3";
import voDe1Json from "../assets/vo-n-de1.json";
import voiceDe1 from "../assets/vo-n-de1.mp3";
import voDe2Json from "../assets/vo-n-de2.json";
import voiceDe2 from "../assets/vo-n-de2.mp3";
import voDe3Json from "../assets/vo-n-de3.json";
import voiceDe3 from "../assets/vo-n-de3.mp3";
import musicEn1 from "../assets/music-n-en1.mp3";
import musicEn2 from "../assets/music-n-en2.mp3";
import musicEn3 from "../assets/music-n-en3.mp3";
import musicDe1 from "../assets/music-n-de1.mp3";
import musicDe2 from "../assets/music-n-de2.mp3";
import musicDe3 from "../assets/music-n-de3.mp3";
import sfxWhoosh from "../assets/sfx-whoosh.wav";
import sfxPop from "../assets/sfx-pop.wav";
import sfxSuccess from "../assets/sfx-success.wav";
import sfxAlarm from "../assets/sfx-alarm.wav";

/**
 * Campagne V6 « StudyTok » (2026-11-17) : du contenu natif, pas une publicité.
 * Trois formats repris de StudyTok — POV avant/après, « busy hands », sketch —
 * en anglais et en allemand, 9:16, 15 à 19 s.
 *
 * Ce qui change par rapport à V5 : plus de téléphone incliné ni de trait
 * orange. L'app est montrée plein cadre, comme un enregistrement d'écran ; les
 * accroches sont des étiquettes blanches à texte noir (le style de texte de
 * TikTok) ; la voix est suivie par un texte cinétique — chaque mot arrive en
 * rebondissant à l'instant où il est dit, le mot en cours est surligné au
 * marqueur, les mots-clés restent en orange.
 *
 * À l'image : la VRAIE app (prises V5/V8 et `n-en-voice`, scripts/v5-captures.ts ;
 * texte des réponses simulé, tout le reste réel), deux plans de mains sous
 * licence Pexels et trois plans générés (voir assets/tiktok/CREDITS.md), le
 * portrait de Prof. Ren tel que l'app le sert.
 * Voix (src/voiceovers.mjs, n-*) : Liam, Laura, Jessica, Hale. Musique : boucles
 * lofi synthétisées (scripts/audio.py native), libres de droits.
 */
const cue = (at: number, src: string, volume: number): Cue => ({ frame: Math.round(at), src, volume });
const norm = (w: string) => w.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]/gu, "");

/* ── Son ──────────────────────────────────────────────────────────────── */

/** Une voix, phrase par phrase, aux instants du plan (même découpe que promo/voice.tsx). */
function Voice({ plan, src }: { plan: VoicePlan; src: string }) {
  const ms2f = (ms: number) => (ms / 1000) * FPS;
  return (
    <>
      {plan.sentences.map((se, i) => {
        const prevEnd = i > 0 ? plan.sentences[i - 1].srcEndMs : 0;
        const nextStart = i < plan.sentences.length - 1 ? plan.sentences[i + 1].srcStartMs : Infinity;
        const from = Math.max(Math.ceil(ms2f(prevEnd)), Math.floor(ms2f(se.srcStartMs)) - 3);
        const to = Math.min(Math.floor(ms2f(nextStart)), Math.ceil(ms2f(se.srcEndMs)) + 6);
        const lead = ms2f(se.srcStartMs) - from;
        return (
          <Sequence key={i} from={Math.round(ms2f(se.atMs) - lead)} durationInFrames={Math.max(1, to - from)} name={`Voix ${i + 1}`}>
            <Audio src={src} trimBefore={from} trimAfter={to} volume={1} />
          </Sequence>
        );
      })}
    </>
  );
}

/** La boucle lofi : baissée sous la voix, elle remonte entre les phrases. */
function Music({ src, plans, total }: { src: string; plans: VoicePlan[]; total: number }) {
  const spans = plans.flatMap((plan) => plan.sentences.map((se) => [(se.atMs / 1000) * FPS, ((se.atMs + se.srcEndMs - se.srcStartMs) / 1000) * FPS] as const));
  return (
    <Audio
      src={src}
      volume={(f) => {
        const d = Math.min(...spans.map(([a, b]) => (f < a ? a - f : f > b ? f - b : 0)));
        const v = 0.085 + (0.3 - 0.085) * Math.min(1, d / 10);
        return v * interpolate(f, [0, 10], [0, 1], clamp) * interpolate(f, [total - 22, total], [1, 0], clamp);
      }}
    />
  );
}

/* ── Texte cinétique ──────────────────────────────────────────────────── */

type Word = Caption & { who?: "b" };

/**
 * Deux ou trois mots à la fois. Un mot n'existe pas à l'écran avant d'être
 * dit : il arrive par en dessous en rebondissant. Le mot en cours est passé
 * au marqueur jaune (le trait se tire de gauche à droite) ; les mots de `hot`
 * restent sur un aplat orange ; la seconde voix (`who: "b"`) écrit en blanc
 * sur noir, pour qu'on voie qui parle.
 */
function Kinetic({ words, y, hideFrom, hot = [] }: { words: Word[]; y: (frame: number) => number; hideFrom?: number; hot?: string[] }) {
  const frame = useCurrentFrame();
  const { pages } = useMemo(() => {
    const spoken = words.filter((c) => /[\p{L}\p{N}]/u.test(c.text));
    return createTikTokStyleCaptions({ captions: spoken, combineTokensWithinMilliseconds: 560 });
  }, [words]);
  const second = useMemo(() => new Set(words.filter((w) => w.who === "b").map((w) => Math.round(w.startMs))), [words]);
  const hotSet = useMemo(() => new Set(hot.map(norm)), [hot]);

  if (hideFrom !== undefined && frame >= hideFrom) return null;
  const now = (frame / FPS) * 1000;
  const page = pages.find((p, i) => {
    const lastWord = p.tokens[p.tokens.length - 1]?.toMs ?? p.startMs + p.durationMs;
    const end = Math.min(lastWord + 300, pages[i + 1]?.startMs ?? Infinity);
    return now >= p.startMs && now < end;
  });
  if (!page) return null;

  const longest = Math.max(...page.tokens.map((t) => t.text.trim().length));
  const fontSize = Math.max(34, Math.min(58, (W - 64) / (longest * 0.66 + 0.6)));
  const center = y(frame);

  return (
    <AbsoluteFill style={{ pointerEvents: "none", zIndex: 10 }}>
      <div style={{ position: "absolute", left: 20, right: 20, top: center - 130, height: 260, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ margin: 0, display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: `${fontSize * 0.16}px ${fontSize * 0.22}px`, fontFamily: "Inter, sans-serif", fontWeight: 900, fontSize, lineHeight: 1.08, letterSpacing: "-0.03em", textAlign: "center" }}>
          {page.tokens.map((tk, i) => {
            const from = Math.round((tk.fromMs / 1000) * FPS);
            const said = frame >= from;
            const active = now >= tk.fromMs && now < tk.toMs;
            const b = second.has(Math.round(tk.fromMs));
            const keep = hotSet.has(norm(tk.text));
            const k = pop(frame, from, 9);
            const wipe = progress(frame, from, from + 5);
            const tilt = (i % 2 ? 1 : -1) * (active ? 2.2 : 0);
            const fill = keep ? ORANGE : b ? "#0B0F1F" : GOLD;
            const boxed = active || keep;
            return (
              <span
                key={i}
                style={{
                  position: "relative",
                  display: "inline-block",
                  padding: `${fontSize * 0.02}px ${fontSize * 0.16}px ${fontSize * 0.08}px`,
                  visibility: said ? "visible" : "hidden",
                  color: boxed ? (keep || b ? "#FFFFFF" : INK) : "#FFFFFF",
                  textShadow: boxed ? "none" : `0 3px 0 ${INK}, 3px 0 0 ${INK}, -3px 0 0 ${INK}, 0 -3px 0 ${INK}, 2px 2px 0 ${INK}, -2px 2px 0 ${INK}, 0 10px 24px rgb(0 0 0 / 0.75)`,
                  transform: `translateY(${(1 - k) * 22}px) scale(${0.55 + 0.45 * k + (active ? 0.06 : 0)}) rotate(${tilt}deg)`,
                }}
              >
                {boxed && (
                  <span
                    style={{
                      position: "absolute",
                      inset: `${fontSize * 0.06}px 0 0 0`,
                      borderRadius: fontSize * 0.16,
                      background: fill,
                      transformOrigin: "0 50%",
                      transform: `scaleX(${keep && !active ? 1 : wipe}) skewX(-6deg)`,
                      boxShadow: "0 10px 26px -8px rgb(0 0 0 / 0.6)",
                    }}
                  />
                )}
                <span style={{ position: "relative" }}>{tk.text.trim()}</span>
              </span>
            );
          })}
        </p>
      </div>
    </AbsoluteFill>
  );
}

/* ── Habillage natif ──────────────────────────────────────────────────── */

/** Une étiquette de texte comme dans TikTok : fond blanc arrondi, texte noir, une ligne par bloc. */
function Label({ lines, at = 0, until, top = 118, dark = false }: { lines: string[]; at?: number; until?: number; top?: number; dark?: boolean }) {
  const frame = useCurrentFrame();
  if (frame < at || (until !== undefined && frame >= until)) return null;
  return (
    <div style={{ position: "absolute", top, left: 24, right: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 0, zIndex: 8 }}>
      {lines.map((line, i) => {
        const k = pop(frame, at + i * 4, 9);
        if (frame < at + i * 4) return null;
        return (
          <span
            key={i}
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 800,
              fontSize: 27,
              lineHeight: 1.2,
              letterSpacing: "-0.01em",
              color: dark ? "#FFFFFF" : "#0B0B0F",
              background: dark ? "#0B0B0F" : "#FFFFFF",
              padding: "7px 14px 8px",
              borderRadius: 11,
              marginTop: i ? -5 : 0,
              transform: `scale(${0.75 + 0.25 * k})`,
              opacity: Math.min(1, k * 1.7),
              boxShadow: "0 8px 22px rgb(0 0 0 / 0.28)",
            }}
          >
            {line}
          </span>
        );
      })}
    </div>
  );
}

/** Le mot qui claque en travers de l'écran (« 80 PAGES »), puis s'en va. */
function Slam({ text, at, until, color = "#E11D2E", size = 92, y = 430, rotate = -5 }: { text: string; at: number; until: number; color?: string; size?: number; y?: number; rotate?: number }) {
  const frame = useCurrentFrame();
  if (frame < at || frame >= until) return null;
  const k = pop(frame, at, 8);
  const out = progress(frame, until - 5, until);
  const shake = Math.sin(frame * 2.3) * 2.2 * Math.max(0, 1 - (frame - at) / 14);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: y, display: "flex", justifyContent: "center", zIndex: 9 }}>
      <span
        style={{
          fontFamily: "Inter, sans-serif",
          fontWeight: 900,
          fontSize: size,
          lineHeight: 1,
          letterSpacing: "-0.04em",
          color: "#FFFFFF",
          background: color,
          padding: "10px 22px 14px",
          borderRadius: 18,
          transform: `translateX(${shake}px) scale(${(2.1 - 1.1 * k) * (1 - 0.3 * out)}) rotate(${rotate}deg)`,
          opacity: Math.min(1, k * 2) * (1 - out),
          boxShadow: "0 22px 50px rgb(0 0 0 / 0.5)",
        }}
      >
        {text}
      </span>
    </div>
  );
}

/** La coupe « flash » : 0,2 s de blanc entre le stress et la solution. */
function Flash({ at, frames = 6 }: { at: number; frames?: number }) {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [at - 2, at, at + frames], [0, 1, 0], clamp);
  return o > 0 ? <AbsoluteFill style={{ background: "#FFFFFF", opacity: o, zIndex: 20, pointerEvents: "none" }} /> : null;
}

function Scene({ from, to, children, name }: { from: number; to: number; children: ReactNode; name?: string }) {
  return (
    <Sequence from={s(from)} durationInFrames={s(to) - s(from)} name={name}>
      <AbsoluteFill style={{ background: NIGHT, overflow: "hidden" }}>{children}</AbsoluteFill>
    </Sequence>
  );
}

/** Un plan réel plein cadre, sans voile bleu : la lumière du clip reste telle quelle. */
function Footage({ name, from = 0, rate = 1, zoom = 1.03, drift = 0.0005, focus = "50% 50%", shade = 0.3, tint }: { name: string; from?: number; rate?: number; zoom?: number; drift?: number; focus?: string; shade?: number; tint?: string }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      <OffthreadVideo src={media(name)} muted trimBefore={Math.round(from * FPS)} playbackRate={rate} style={{ width: "100%", height: "100%", objectFit: "cover", transformOrigin: focus, transform: `scale(${zoom + frame * drift})` }} />
      {tint && <AbsoluteFill style={{ background: tint, mixBlendMode: "multiply" }} />}
      <AbsoluteFill style={{ background: `linear-gradient(180deg, rgb(0 0 0 / ${shade}) 0%, rgb(0 0 0 / 0) 26%, rgb(0 0 0 / 0) 55%, rgb(0 0 0 / ${shade + 0.18}) 100%)` }} />
    </AbsoluteFill>
  );
}

/**
 * L'app plein cadre, comme un enregistrement d'écran : une prise 1000 × 1778
 * remplit exactement les 540 × 960. `zoom` / `focus` / `land` : avancer vers
 * un point de la capture (fractions), comme dans V5.
 */
function Screen({ name, from = 0, rate = 1, still = false, zoom = 1, focus = [0.5, 0.5], land = [0.5, 0.5], start = 0, frames = 22 }: { name: string; from?: number; rate?: number; still?: boolean; zoom?: number; focus?: [number, number]; land?: [number, number]; start?: number; frames?: number }) {
  const frame = useCurrentFrame();
  const enter = progress(frame, 0, 7);
  const k = zoom === 1 ? 0 : progress(frame, start, start + frames, easeInOut);
  const z = 1 + (zoom - 1) * k;
  const cx = focus[0] * W;
  const cy = focus[1] * H;
  const tx = cx + (land[0] * W - cx) * k - cx * z;
  const ty = cy + (land[1] * H - cy) * k - cy * z;
  const style = { position: "absolute", left: 0, top: 0, width: W, height: H, maxWidth: "none" } as const;
  return (
    <AbsoluteFill style={{ background: NIGHT, transform: `scale(${1.08 - 0.08 * enter})`, opacity: 0.4 + 0.6 * enter }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${z})` }}>
        {still ? <Img src={media(name)} style={style} /> : <OffthreadVideo src={media(name)} muted trimBefore={Math.round(from * FPS)} playbackRate={rate} style={style} />}
      </div>
    </AbsoluteFill>
  );
}

/** Une prise au format fenêtre (1200 × 1720, campagne V8) posée comme une carte sur fond flou. */
function WindowCard({ name, from, rate = 1, zoom = 1, focus = [0.5, 0.5], zoomAt = 0 }: { name: string; from: number; rate?: number; zoom?: number; focus?: [number, number]; zoomAt?: number }) {
  const frame = useCurrentFrame();
  const enter = pop(frame, 0, 12);
  const w = 504;
  const h = (1720 / 1200) * w;
  const k = zoom === 1 ? 0 : progress(frame, zoomAt, zoomAt + 24, easeInOut);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(90% 60% at 50% 40%, #223761 0%, ${NIGHT} 72%)` }}>
      <div style={{ position: "absolute", left: (W - w) / 2, top: 168, width: w, height: h, borderRadius: 22, overflow: "hidden", boxShadow: "0 36px 80px rgb(0 0 0 / 0.6), 0 0 0 1.5px rgb(255 255 255 / 0.16)", transform: `translateY(${(1 - enter) * 40}px) scale(${0.92 + 0.08 * enter})`, opacity: Math.min(1, enter * 1.6) }}>
        <div style={{ width: w, height: h, transformOrigin: `${focus[0] * 100}% ${focus[1] * 100}%`, transform: `scale(${1 + (zoom - 1) * k})` }}>
          <OffthreadVideo src={media(name)} muted trimBefore={Math.round(from * FPS)} playbackRate={rate} style={{ width: w, height: h, maxWidth: "none", display: "block" }} />
        </div>
      </div>
    </AbsoluteFill>
  );
}

/** Le PDF ouvert sur la phrase surlignée (images fixes de V5). */
const HIGHLIGHT = { focus: [0.44, 0.347] as [number, number], land: [0.5, 0.42] as [number, number], zoom: 1.55 };

/** La citation : le curseur appuie, le PDF s'ouvre à la page, puis on s'approche de la phrase. */
function Proof({ clip, clipFrom, pdf, opened }: { clip: string; clipFrom: number; pdf: string; opened: number }) {
  return (
    <>
      <Sequence durationInFrames={opened} layout="none">
        <Screen name={clip} from={clipFrom} />
      </Sequence>
      <Sequence from={opened} layout="none">
        <Screen still name={pdf} start={6} {...HIGHLIGHT} />
      </Sequence>
    </>
  );
}

/** Le cadre commun : image, texte cinétique, voix, musique, effets. */
function Native({ seconds, plans, voices, music, sfx, y, hideFrom, hot, words, children }: { seconds: number; plans: VoicePlan[]; voices: string[]; music: string; sfx: Cue[]; y: (frame: number) => number; hideFrom: number; hot?: string[]; words?: Word[]; children: ReactNode }) {
  const all = words ?? plans.flatMap((p) => p.captions);
  return (
    <AbsoluteFill style={{ background: NIGHT, fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      {children}
      <Kinetic words={all} y={y} hideFrom={hideFrom} hot={hot} />
      {plans.map((plan, i) => (
        <Voice key={i} plan={plan} src={voices[i]} />
      ))}
      <Music src={music} plans={plans} total={s(seconds)} />
      {sfx.map((c, i) => (
        <Sequence key={i} from={c.frame} durationInFrames={FPS * 2} name="SFX">
          <Audio src={c.src} volume={c.volume ?? 0.4} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

/* ── EN 1 · POV: Exam Tomorrow ────────────────────────────────────────── */
export function NativePovExam() {
  //                     POV: You have…  Yeah, we've…  But what if…  That's TRED.  Link in bio.
  const plan = useMemo(() => planVoice(voEn1Json as VoFile, [0.3, 4.95, 7.15, 12.75, 14.6]), []);
  const f = plan.frameOf;
  const cut = s(7.0);
  return (
    <Native seconds={17.6} plans={[plan]} voices={[voiceEn1]} music={musicEn1} hot={["80", "pages", "7-day", "plan", "seconds"]} y={(fr) => (fr < cut ? 560 : 760)} hideFrom={s(12.6)} sfx={[cue(f("80") - 2, sfxAlarm, 0.22), cue(cut - 3, sfxWhoosh, 0.4), cue(s(9.7), sfxPop, 0.4), cue(s(12.6) - 4, sfxSuccess, 0.3)]}>
      <Scene from={0} to={4.85} name="80 pages">
        {/* La « photo floue » du PDF de 80 pages : le polycopié défile, hors mise au point, teinté de rouge. */}
        <AbsoluteFill style={{ filter: "blur(3.2px) saturate(0.8)", transform: `scale(1.08)` }}>
          <PdfScroll dur={s(4.85)} pages={80} />
        </AbsoluteFill>
        <AbsoluteFill style={{ background: "radial-gradient(80% 60% at 50% 45%, rgb(225 29 46 / 0.05), rgb(120 10 20 / 0.5) 100%)" }} />
        <Label lines={["POV: exam tomorrow,", "80 pages to read"]} at={3} />
        <Slam text="80 PAGES" at={f("80")} until={s(4.85)} y={290} />
      </Scene>
      <Scene from={4.85} to={7.0} name="We've all been there">
        <Footage name="broll-stress.mp4" from={3.2} rate={0.9} focus="50% 40%" shade={0.34} />
        <Label lines={["we've all been there"]} at={4} />
      </Scene>
      <Scene from={7.0} to={9.7} name="Upload">
        <WindowCard name="app-v8-en-doc-import.mp4" from={8.2} />
        <Label lines={["just upload the PDF"]} at={6} top={96} />
      </Scene>
      <Scene from={9.7} to={12.6} name="7-day plan">
        <WindowCard name="app-v8-en-doc-plan.mp4" from={5.6} rate={1.9} zoom={1.22} focus={[0.3, 0.45]} zoomAt={20} />
        <Label lines={["TRED: 7-day plan"]} at={4} top={96} />
      </Scene>
      <Scene from={12.6} to={17.6} name="TRED">
        <EndCard
          lines={[
            { text: "Your 7-day study plan.", at: 8, size: 33 },
            { text: "tred-tutor.de", at: 18, size: 42, hot: true },
          ]}
          pillAt={34}
          pill="Link in bio"
        />
      </Scene>
      <Flash at={cut} />
    </Native>
  );
}

/* ── EN 2 · The Busy Hands Study Hack ─────────────────────────────────── */
export function NativeBusyHands() {
  //                     Here's a study hack…  Just ask TRED…  It's like having…  Link in bio.
  const plan = useMemo(() => planVoice(voEn2Json as VoFile, [0.3, 5.5, 12.25, 15.5]), []);
  const f = plan.frameOf;
  const cut = s(12.05);
  return (
    <Native seconds={18.6} plans={[plan]} voices={[voiceEn2]} music={musicEn2} hot={["hack", "exact", "page", "proves"]} y={(fr) => (fr < cut ? 610 : 770)} hideFrom={s(15.3)} sfx={[cue(cut - 4, sfxWhoosh, 0.3), cue(cut + s(2.2), sfxPop, 0.35), cue(s(15.3) - 4, sfxSuccess, 0.26)]}>
      <Scene from={0} to={12.05} name="Tea">
        {/* Les mains qui versent le thé (Pexels 7302885), ralenties pour tenir toute la confidence. */}
        <Footage name="broll-tea.mp4" from={0} rate={0.8} zoom={1.02} drift={0.0003} shade={0.26} />
        <Label lines={["the study hack", "nobody talks about"]} at={4} until={f("Just") - 4} />
        <Label lines={["stop re-reading.", "ask instead."]} at={f("Just")} />
      </Scene>
      <Scene from={12.05} to={15.3} name="The exact page">
        <Proof clip="app-v5-en-proof.mp4" clipFrom={9.9} pdf="app-v5-en-proof-pdf.jpg" opened={s(2.1)} />
        <Label lines={["your own PDF · page 12"]} at={s(2.1) + 6} top={96} />
      </Scene>
      <Scene from={15.3} to={18.6} name="TRED">
        <EndCard
          lines={[
            { text: "The answer, with its page.", at: 8, size: 31 },
            { text: "tred-tutor.de", at: 18, size: 42, hot: true },
          ]}
          pillAt={32}
          pill="Link in bio"
        />
      </Scene>
    </Native>
  );
}

/* ── EN 3 · The AI Voice Tutoring ─────────────────────────────────────── */
/** Qui parle : une pastille au-dessus du texte. */
function Speaker({ who, at, until }: { who: "TRED" | "YOU"; at: number; until: number }) {
  const frame = useCurrentFrame();
  if (frame < at || frame >= until) return null;
  const k = pop(frame, at, 8);
  const tred = who === "TRED";
  return (
    <div style={{ position: "absolute", top: 596, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 11 }}>
      <span style={{ fontWeight: 900, fontSize: 19, letterSpacing: "0.08em", padding: "5px 13px 6px", borderRadius: 999, background: tred ? GOLD : "#FFFFFF", color: INK, transform: `scale(${0.7 + 0.3 * k})`, opacity: Math.min(1, k * 1.6), boxShadow: "0 8px 20px rgb(0 0 0 / 0.4)" }}>{tred ? "TRED" : "YOU"}</span>
    </div>
  );
}

export function NativeVoiceTutor() {
  // La voix du tuteur :  The derivative…  Imagine…  The rate…  TRED breaks…  Try it.
  const tutor = useMemo(() => planVoice(voEn3aJson as VoFile, [0.4, 6.45, 8.8, 11.95, 14.6]), []);
  // L'étudiant coupe :   Wait, explain that like I'm 12.
  const student = useMemo(() => planVoice(voEn3bJson as VoFile, [3.75]), []);
  const words = useMemo<Word[]>(() => [...tutor.captions, ...student.captions.map((c) => ({ ...c, who: "b" as const }))].sort((a, b) => a.startMs - b.startMs), [tutor, student]);
  const wait = s(3.65);
  const back = s(6.3);
  return (
    <Native seconds={17.6} plans={[tutor, student]} voices={[voiceEn3a, voiceEn3b]} music={musicEn3} words={words} hot={["2", "x.", "12.", "step"]} y={() => 700} hideFrom={s(14.45)} sfx={[cue(wait - 2, sfxPop, 0.5), cue(back - 3, sfxWhoosh, 0.28), cue(s(14.45) - 4, sfxSuccess, 0.26)]}>
      <Scene from={0} to={3.65} name="Question">
        {/* La question tapée, envoyée ; la Tafel écrit d/dx x² = 2x. */}
        <Screen name="app-v6-en-voice.mp4" from={2.3} rate={2.0} />
      </Scene>
      <Scene from={3.65} to={6.3} name="Wait">
        {/* L'étudiant coupe : il tape déjà sa relance. */}
        <Screen name="app-v6-en-voice.mp4" from={12.6} rate={2.15} />
        <Slam text="WAIT." at={2} until={s(1.0)} color="#0B0F1F" size={84} y={300} rotate={-4} />
      </Scene>
      <Scene from={6.3} to={14.45} name="Like I'm 12">
        {/* La seconde réponse : le carré qui grandit, en trois étapes. */}
        <Screen name="app-v6-en-voice.mp4" from={18.7} rate={1} zoom={1.16} focus={[0.5, 0.3]} land={[0.5, 0.3]} start={30} frames={40} />
        <Label lines={["explained like you're 12"]} at={8} top={96} />
      </Scene>
      <Scene from={14.45} to={17.6} name="TRED">
        <EndCard
          lines={[
            { text: "Step by step.", at: 8, size: 38 },
            { text: "tred-tutor.de", at: 18, size: 42, hot: true },
          ]}
          pillAt={30}
          pill="Try it"
        />
      </Scene>
      <Speaker who="TRED" at={s(0.4)} until={wait} />
      <Speaker who="YOU" at={wait + 2} until={back} />
      <Speaker who="TRED" at={back + 4} until={s(14.45)} />
    </Native>
  );
}

/* ── DE 1 · Der Mad Professor ─────────────────────────────────────────── */
/** Des formules visiblement fausses, qui sautent autour du professeur. */
const NONSENSE = [
  { t: "E = mc³", x: 44, y: 250, r: -9, at: 0.9 },
  { t: "a² + b² = c³", x: 286, y: 214, r: 7, at: 1.5 },
  { t: "F = m / a", x: 60, y: 668, r: 6, at: 2.1 },
  { t: "U = R + I", x: 316, y: 706, r: -7, at: 2.6 },
  { t: "π = 4", x: 392, y: 404, r: 10, at: 3.0 },
];

function MadProf({ panic, zoomAt }: { panic: boolean; zoomAt?: number }) {
  const frame = useCurrentFrame();
  const enter = pop(frame, 0, 12);
  const punch = zoomAt === undefined ? 0 : pop(frame, zoomAt, 9);
  const shake = panic ? 1 : 0;
  const dx = Math.sin(frame * 1.9) * 5 * shake;
  const dy = Math.cos(frame * 2.7) * 4 * shake;
  const size = 300;
  return (
    <AbsoluteFill style={{ background: panic ? "#FFD23F" : "#DDF3E4" }}>
      {/* Trame de points et rayons : le décor d'une case de bande dessinée. */}
      <AbsoluteFill style={{ backgroundImage: `radial-gradient(${panic ? "rgb(225 29 46 / 0.28)" : "rgb(22 163 74 / 0.2)"} 2.2px, transparent 2.6px)`, backgroundSize: "18px 18px" }} />
      {panic && <AbsoluteFill style={{ background: "repeating-conic-gradient(from 0deg at 50% 46%, rgb(255 87 34 / 0.2) 0deg 6deg, transparent 6deg 14deg)", transform: `rotate(${frame * 0.5}deg) scale(1.6)` }} />}
      <div style={{ position: "absolute", left: (W - size) / 2, top: 318, width: size, height: size, transform: `translate(${dx}px, ${dy}px) scale(${(0.6 + 0.4 * enter) * (1 + 0.55 * punch)}) rotate(${panic ? Math.sin(frame * 0.9) * 3 : 0}deg)` }}>
        <Img src={media("prof-ren.jpg")} style={{ width: size, height: size, borderRadius: "50%", border: `7px solid ${INK}`, boxShadow: `10px 12px 0 ${INK}`, objectFit: "cover" }} />
        {panic && (
          <>
            <span style={{ position: "absolute", right: -34, top: -36, fontWeight: 900, fontSize: 92, color: "#E11D2E", WebkitTextStroke: `4px ${INK}`, transform: `rotate(${12 + Math.sin(frame * 1.3) * 8}deg)` }}>!?</span>
            <span style={{ position: "absolute", left: -6, top: 18, width: 22, height: 34, borderRadius: "50% 50% 50% 50% / 30% 30% 70% 70%", background: "#7DD3FC", border: `3px solid ${INK}`, transform: `translateY(${(frame % 18) * 1.6}px)`, opacity: 1 - (frame % 18) / 18 }} />
          </>
        )}
      </div>
      {panic &&
        NONSENSE.map((n) => {
          const at = s(n.at);
          if (frame < at) return null;
          const k = pop(frame, at, 9);
          return (
            <span key={n.t} style={{ position: "absolute", left: n.x, top: n.y, fontFamily: "Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: 30, color: INK, background: "#FFFFFF", border: `3px solid ${INK}`, borderRadius: 10, padding: "4px 12px 6px", boxShadow: `5px 6px 0 ${INK}`, transform: `scale(${0.4 + 0.6 * k}) rotate(${n.r + Math.sin(frame * 0.4 + n.x) * 2}deg)` }}>
              {n.t}
            </span>
          );
        })}
    </AbsoluteFill>
  );
}

export function NativeMadProfessor() {
  //                     Meine Studenten…  Aber mit TRED…  Keine Ausreden mehr!  Probiert es aus.
  const plan = useMemo(() => planVoice(voDe1Json as VoFile, [0.3, 4.6, 8.55, 10.25]), []);
  const f = plan.frameOf;
  return (
    <Native seconds={15.2} plans={[plan]} voices={[voiceDe1]} music={musicDe1} hot={["erfinden", "Formeln!", "exakte", "Seite", "Ausreden"]} y={(fr) => (fr < s(4.45) ? 800 : fr < s(8.4) ? 770 : 790)} hideFrom={s(10.1)} sfx={[cue(f("erfinden") - 2, sfxAlarm, 0.2), cue(s(4.45) - 4, sfxWhoosh, 0.35), cue(s(6.7), sfxPop, 0.35), cue(s(8.4), sfxPop, 0.45), cue(s(10.1) - 4, sfxSuccess, 0.28)]}>
      <Scene from={0} to={4.45} name="Panik">
        <MadProf panic zoomAt={f("erfinden")} />
        <Label lines={["Mein Prof, wenn er", "die Abgaben liest:"]} at={3} top={104} />
      </Scene>
      <Scene from={4.45} to={8.4} name="Beweis">
        <Proof clip="app-v5-de-answer.mp4" clipFrom={10.3} pdf="app-v5-de-answer-pdf.jpg" opened={s(2.0)} />
        <Label lines={["TRED: Beweise statt raten"]} at={8} top={96} />
      </Scene>
      <Scene from={8.4} to={10.1} name="Keine Ausreden">
        <MadProf panic={false} />
        <Label lines={["Prof, zwei Wochen später:"]} at={2} top={104} />
      </Scene>
      <Scene from={10.1} to={15.2} name="TRED">
        <EndCard
          lines={[
            { text: "Beweise statt raten.", at: 8, size: 36 },
            { text: "tred-tutor.de", at: 18, size: 42, hot: true },
          ]}
          pillAt={30}
          pill="Probiert es aus"
        />
      </Scene>
    </Native>
  );
}

/* ── DE 2 · POV: Die Klausur ──────────────────────────────────────────── */
export function NativePovKlausur() {
  //                     POV: Die Klausur…  Kein Stress.  Lade dein PDF…  Lerne smarter…  Link in Bio.
  const plan = useMemo(() => planVoice(voDe2Json as VoFile, [0.3, 5.45, 6.75, 10.95, 13.45]), []);
  const f = plan.frameOf;
  const cut = s(5.35);
  return (
    <Native seconds={16.4} plans={[plan]} voices={[voiceDe2]} music={musicDe2} hot={["80", "Seiten", "7-Tage-Plan.", "smarter,"]} y={(fr) => (fr < cut ? 640 : fr < s(6.65) ? 480 : fr < s(10.85) ? 770 : 640)} hideFrom={s(13.3)} sfx={[cue(f("80") - 2, sfxAlarm, 0.22), cue(cut - 3, sfxWhoosh, 0.4), cue(s(8.75), sfxPop, 0.4), cue(s(13.3) - 4, sfxSuccess, 0.28)]}>
      <Scene from={0} to={5.35} name="Klausur morgen">
        <Footage name="broll-stress.mp4" from={0.4} rate={0.95} focus="50% 42%" shade={0.36} tint="rgb(255 214 214)" />
        <Label lines={["POV: Klausur morgen"]} at={3} />
        {/* « 80 Seiten » : gros, rouge, puis il disparaît pour laisser la place au plan. */}
        <Slam text="80 SEITEN" at={f("80")} until={cut} size={84} y={300} />
      </Scene>
      <Scene from={5.35} to={6.65} name="Kein Stress">
        <AbsoluteFill style={{ background: "#F6F1E7" }} />
      </Scene>
      <Scene from={6.65} to={8.75} name="Hochladen">
        <Screen name="app-v5-de-import80.mp4" from={8.3} rate={0.9} />
        <Label lines={["PDF hochladen"]} at={5} top={96} />
      </Scene>
      <Scene from={8.75} to={10.85} name="7-Tage-Plan">
        <Screen name="app-v5-de-plan.mp4" from={6.3} rate={2.0} zoom={1.2} focus={[0.4, 0.5]} land={[0.5, 0.5]} start={6} frames={26} />
        <Label lines={["TRED: 7-Tage-Plan"]} at={5} top={96} />
      </Scene>
      <Scene from={10.85} to={13.3} name="Smarter">
        <Footage name="broll-relief.mp4" from={2.6} rate={0.95} focus="50% 40%" shade={0.3} />
      </Scene>
      <Scene from={13.3} to={16.4} name="TRED">
        <EndCard
          lines={[
            { text: "Dein 7-Tage-Plan.", at: 8, size: 36 },
            { text: "tred-tutor.de", at: 18, size: 42, hot: true },
          ]}
          pillAt={30}
          pill="Link in Bio"
        />
      </Scene>
      <Flash at={cut} />
    </Native>
  );
}

/* ── DE 3 · Das Study-Hack ────────────────────────────────────────────── */
export function NativeStudyHack() {
  //                     Der ultimative…  Stell TRED…  Beweise statt…  Jetzt testen.
  const plan = useMemo(() => planVoice(voDe3Json as VoFile, [0.3, 4.95, 9.7, 12.1]), []);
  const f = plan.frameOf;
  const cut = f("zeigt") - 3;
  const end = s(11.95);
  return (
    <Native seconds={15.2} plans={[plan]} voices={[voiceDe3]} music={musicDe3} hot={["Study-Hack:", "exakte", "Seite", "Beweise"]} y={(fr) => (fr < cut ? 690 : 780)} hideFrom={end} sfx={[cue(cut - 4, sfxWhoosh, 0.24), cue(cut + s(2.0), sfxPop, 0.3), cue(end - 4, sfxSuccess, 0.24)]}>
      <Sequence durationInFrames={cut} name="Kerze">
        {/* La main qui allume la bougie (Pexels 6754311, recadré en vertical). */}
        <Footage name="broll-candle.mp4" from={1.6} rate={1} zoom={1.02} drift={0.0003} shade={0.22} />
        <Label lines={["Der Study-Hack"]} at={4} until={f("Stell") - 4} />
        <Label lines={["nicht suchen.", "fragen."]} at={f("Stell")} />
      </Sequence>
      <Sequence from={cut} durationInFrames={end - cut} name="Die exakte Seite">
        <AbsoluteFill style={{ background: NIGHT, overflow: "hidden" }}>
          <Proof clip="app-v5-de-answer.mp4" clipFrom={10.3} pdf="app-v5-de-answer-pdf.jpg" opened={s(2.0)} />
          <Label lines={["dein Skript · Seite 12"]} at={s(2.0) + 6} top={96} />
        </AbsoluteFill>
      </Sequence>
      <Scene from={11.95} to={15.2} name="TRED">
        <EndCard
          lines={[
            { text: "Beweise statt Vermutungen.", at: 8, size: 30 },
            { text: "tred-tutor.de", at: 18, size: 42, hot: true },
          ]}
          pillAt={30}
          pill="Jetzt testen"
        />
      </Scene>
    </Native>
  );
}

/** Identifiant de composition, composant, durée (images). */
export const NATIVE = [
  ["V6-EN1-POV-Exam-Tomorrow", NativePovExam, s(17.6)],
  ["V6-EN2-Busy-Hands-Study-Hack", NativeBusyHands, s(18.6)],
  ["V6-EN3-AI-Voice-Tutoring", NativeVoiceTutor, s(17.6)],
  ["V6-DE1-Der-Mad-Professor", NativeMadProfessor, s(15.2)],
  ["V6-DE2-POV-Die-Klausur", NativePovKlausur, s(16.4)],
  ["V6-DE3-Das-Study-Hack", NativeStudyHack, s(15.2)],
] as const;
