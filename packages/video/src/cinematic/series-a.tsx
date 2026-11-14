import { Broll, CinematicShort, EndCard, Glow, Kinetic, LOOKS, Screen, planFilm, type Cam, type FilmCtx, type FilmScene, type Layer, type Look } from "./engine";
import type { VoFile } from "../promo/voice";
import voEn1 from "../assets/vo-k-en1.json";
import voEn2 from "../assets/vo-k-en2.json";
import voEn3 from "../assets/vo-k-en3.json";
import voDe1 from "../assets/vo-k-de1.json";
import voDe2 from "../assets/vo-k-de2.json";
import voDe3 from "../assets/vo-k-de3.json";
import voiceEn1 from "../assets/vo-k-en1.mp3";
import voiceEn2 from "../assets/vo-k-en2.mp3";
import voiceEn3 from "../assets/vo-k-en3.mp3";
import voiceDe1 from "../assets/vo-k-de1.mp3";
import voiceDe2 from "../assets/vo-k-de2.mp3";
import voiceDe3 from "../assets/vo-k-de3.mp3";

/**
 * Courts-métrages « Cinematic », série A (2026-11-13) : l'étudiant au centre,
 * en train d'utiliser TRED. 3 films EN + 3 films DE, textes du fondateur mot
 * pour mot (src/voiceovers.mjs, CINE_A).
 *
 *   EN 1  The Night Before        nuit ambrée   vibrations amorties + vidéo
 *   EN 2  The Group Project       lumière jour  poutre : courbes Q et M du solveur
 *   EN 3  The Transfer Student    nuit froide   polycopié allemand → anglais + vidéo
 *   DE 1  Die Nacht vor der Klausur  ambre      Altklausur d'électrotechnique, Dr. Aiko
 *   DE 2  Die Lerngruppe          bibliothèque  Carnot : diagramme p-V
 *   DE 3  Der Austauschstudent    nuit froide   Werkstoffkunde → anglais + vidéo
 *
 * Tout ce qui est montré de l'app est une capture de la vraie interface
 * (scripts/cinematic-captures.mjs) ; les repères sont en px CSS de l'app.
 */

/* ── Les fichiers (captures, plans d'ambiance, musiques) ──────────────── */

type Ctx = { (key: string): string | { default: string } };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const files = (require as any).context("../assets/cine", false, /\.(jpg|mp4|mp3)$/) as Ctx;
export const asset = (name: string) => {
  const m = files(`./${name}`);
  return typeof m === "string" ? m : m.default;
};
const shot = (id: string, name: string) => asset(`${id}-${name}.jpg`);

/* ── Repères de l'interface (px CSS, 1920 × 1080) ─────────────────────── */

const BOARD: [number, number, number, number] = [302, 118, 1612, 892];
const COMPOSER: [number, number, number, number] = [600, 1020, 1215, 58];
const SEND = { x: 1845, y: 1049 };
const DOC_ROW: [number, number, number, number] = [578, 678, 684, 58];
const CHIP_Y = 960;
/** Après l'envoi, la caméra se pose sur la question écrite en haut du tableau. */
const ASKED = { x: 800, y: 270, z: 1.55 };

const typeCues = (from: number, to: number) => Array.from({ length: 7 }, (_, i) => ({ at: Math.round(from + (i * (to - from)) / 7), kind: "type" as const, volume: 0.2 }));

/** Les images du lecteur (une toutes les 0,8 s de leçon), rejouées en accéléré. */
const playerLayers = (id: string, every = 7): Layer[] => Array.from({ length: 17 }, (_, i) => ({ src: shot(id, `player${String(i).padStart(2, "0")}`), at: i === 0 ? 0 : 6 + i * every, fade: 5 }));

/* ── Scènes communes ──────────────────────────────────────────────────── */

/** Poser la question : la saisie se dévoile dans le champ, puis on envoie. */
function askScene(id: string, name: string, span: number, word: (ctx: FilmCtx) => number, wide = false): FilmScene {
  const at = (ctx: FilmCtx) => {
    const t0 = Math.max(14, word(ctx));
    return { t0, send: t0 + 46 };
  };
  return {
    name,
    span,
    gap: 0.5,
    tail: 1.0,
    render: (ctx) => {
      const { t0, send } = at(ctx);
      return (
        <Screen
          layers={[{ src: shot(id, "board0") }, { src: shot(id, "typed"), at: t0, reveal: { rect: COMPOSER, dir: "right", dur: 34 } }, { src: shot(id, "wait"), at: send + 4, fade: 8 }]}
          cams={[
            { at: 0, x: wide ? 960 : 1150, y: wide ? 560 : 860, z: wide ? 1 : 1.22 },
            { at: t0 - 8, x: wide ? 1000 : 1150, y: wide ? 600 : 880, z: wide ? 1.04 : 1.25 },
            { at: t0 + 26, x: 1230, y: 960, z: 1.5 },
            { at: send + 2, x: 1230, y: 960, z: 1.5 },
            { at: send + 32, ...ASKED },
          ]}
          cursor={[{ at: 6, x: 1040, y: 820 }, { at: t0 - 2, x: 800, y: 1049, click: true }, { at: send, x: SEND.x, y: SEND.y, click: true }]}
        />
      );
    },
    cues: (ctx) => {
      const { t0, send } = at(ctx);
      return [{ at: t0 - 2, kind: "click", volume: 0.4 }, ...typeCues(t0, t0 + 34), { at: send, kind: "click", volume: 0.5 }];
    },
  };
}

/** « Als Video erklären » : le clic, puis la fenêtre de génération. */
function videoClickScene(id: string, name: string, chipX: number, clickAt: (ctx: FilmCtx) => number, voiceStepAt?: (ctx: FilmCtx) => number): FilmScene {
  return {
    name,
    span: 1,
    tail: 1.3,
    render: (ctx) => {
      const click = Math.max(24, clickAt(ctx));
      const voice = voiceStepAt ? Math.max(click + 30, voiceStepAt(ctx)) : click + 40;
      return (
        <Screen
          layers={[{ src: shot(id, "chip") }, { src: shot(id, "gen-script"), at: click + 7, fade: 10 }, { src: shot(id, "gen-voice"), at: voice, fade: 6 }]}
          cams={[
            { at: 0, x: 1100, y: 780, z: 1.25 },
            { at: click - 6, x: chipX, y: 900, z: 1.7 },
            { at: click + 8, x: chipX, y: 900, z: 1.7 },
            { at: click + 36, x: 960, y: 540, z: 1.5 },
            { at: ctx.dur, x: 960, y: 540, z: 1.6 },
          ]}
          cursor={[{ at: 2, x: 900, y: 760 }, { at: click, x: chipX, y: CHIP_Y, click: true }]}
          hideCursorAt={click + 12}
        >
          <Glow rect={[chipX - 72, CHIP_Y - 18, 144, 36]} at={8} until={click} />
        </Screen>
      );
    },
    cues: (ctx) => {
      const click = Math.max(24, clickAt(ctx));
      return [{ at: click, kind: "click", volume: 0.55 }, { at: click + 8, kind: "pop", volume: 0.3 }];
    },
  };
}

/** Le lecteur : la leçon générée se joue, la caméra avance. */
function playerScene(id: string, name: string): FilmScene {
  return {
    name,
    span: 1,
    lead: 0.3,
    tail: 1.2,
    cut: true,
    render: (ctx) => <Screen layers={playerLayers(id, Math.max(5, Math.floor((ctx.dur - 10) / 17)))} cams={[{ at: 0, x: 960, y: 540, z: 1.6 }, { at: 18, x: 960, y: 540, z: 1.75 }, { at: ctx.dur, x: 960, y: 530, z: 2.05 }]} />,
    cues: () => [{ at: 4, kind: "success", volume: 0.3 }],
  };
}

/** Carte de fin : « TRED. » puis la signature. */
function endScene(lines: string[], accent: string): FilmScene {
  return {
    name: "Fin",
    span: 2,
    lead: 0.7,
    gap: 0.45,
    tail: 2.0,
    render: (ctx) => <EndCard logoAt={Math.max(2, ctx.voiceAt - 6)} lines={lines} linesAt={ctx.sentence(1) - 2} accent={accent} />,
    cues: (ctx) => [{ at: ctx.sentence(1), kind: "success", volume: 0.22 }],
  };
}

/* ── 1. La veille de l'examen (EN 1, DE 1) ────────────────────────────── */

type Night = {
  id: string;
  look: Look;
  lines: [string, string, string];
  /** Mots de la voix qui déclenchent l'image. */
  w: { upload: string; ask: string; draws: string; step: string; board: string; button: string };
  boardSpan: number;
  importX: number;
  chipX: number;
  /** Où regarder sur la deuxième page du tableau. */
  focus: { x: number; y: number; z: number };
  end: string[];
};

function nightBefore(c: Night): FilmScene[] {
  const pages = c.id === "en1" ? 3 : 2;
  return [
    {
      name: "Seul, tard le soir",
      span: 3,
      lead: 1.1,
      gap: 0.5,
      tail: 0.6,
      render: (ctx) => (
        <Broll src={asset(`broll-${c.id}.mp4`)}>
          <Kinetic accent={c.look.accent} lines={[{ text: c.lines[0], at: ctx.sentence(0) }, { text: c.lines[1], at: ctx.sentence(1) }, { text: c.lines[2], at: ctx.sentence(2), hot: true }]} />
        </Broll>
      ),
    },
    {
      name: "Importer le document",
      span: 1,
      tail: 1.2,
      render: (ctx) => {
        const click = Math.max(20, ctx.f(c.w.upload) + 6);
        return (
          <Screen
            layers={[{ src: shot(c.id, "dash0") }, { src: shot(c.id, "dash1"), at: click + 8, fade: 14 }]}
            cams={[{ at: 0, x: 1100, y: 400, z: 1.02 }, { at: click, x: 1330, y: 300, z: 1.42 }, { at: click + 12, x: 1330, y: 300, z: 1.42 }, { at: click + 42, x: 930, y: 650, z: 1.5 }, { at: ctx.dur, x: 930, y: 660, z: 1.56 }]}
            cursor={[{ at: 6, x: 1010, y: 500 }, { at: click, x: c.importX, y: 183, click: true }]}
            hideCursorAt={click + 16}
          >
            <Glow rect={DOC_ROW} at={click + 30} until={ctx.dur - 10} radius={18} />
          </Screen>
        );
      },
      cues: (ctx) => [{ at: Math.max(20, ctx.f(c.w.upload) + 6), kind: "click", volume: 0.5 }, { at: Math.max(20, ctx.f(c.w.upload) + 6) + 30, kind: "success", volume: 0.3 }],
    },
    askScene(c.id, "Poser la question", 1, (ctx) => ctx.f(c.w.ask) - 4),
    {
      name: "La Tafel s'écrit",
      span: c.boardSpan,
      gap: 0.45,
      tail: 1.0,
      cut: true,
      render: (ctx) => {
        const rev = Math.min(Math.max(4, ctx.f(c.w.draws) - 6), ctx.voiceAt + 12);
        const step = Math.max(rev + 50, ctx.f(c.w.step));
        const board = Math.max(step + 30, ctx.f(c.w.board));
        const layers: Layer[] = [{ src: shot(c.id, "wait") }, { src: shot(c.id, "page0"), at: rev, reveal: { rect: BOARD, dir: "down", dur: 56 } }, { src: shot(c.id, "page1"), at: step + 6, fade: 16 }];
        if (pages === 3) layers.push({ src: shot(c.id, "page2"), at: ctx.dur - 16, fade: 14 });
        const cams: Cam[] = [
          { at: 0, ...ASKED },
          { at: rev, ...ASKED },
          { at: rev + 56, x: 1040, y: 600, z: 1.24 },
          { at: step + 6, x: 1040, y: 560, z: 1.22 },
          { at: board, x: c.focus.x, y: c.focus.y, z: c.focus.z },
          { at: ctx.dur, x: c.focus.x, y: c.focus.y, z: c.focus.z + 0.06 },
        ];
        return <Screen layers={layers} cams={cams} />;
      },
      cues: (ctx) => [{ at: Math.max(4, ctx.f(c.w.draws) - 6), kind: "whoosh", volume: 0.14 }, { at: Math.max(60, ctx.f(c.w.step)) + 6, kind: "pop", volume: 0.22 }],
    },
    videoClickScene(c.id, "Als Video erklären", c.chipX, (ctx) => ctx.f(c.w.button) + 4),
    playerScene(c.id, "La leçon privée"),
    endScene(c.end, c.look.accent),
  ];
}

/* ── 2. Le projet de groupe (EN 2, DE 2) ──────────────────────────────── */

type Group = {
  id: string;
  look: Look;
  lines: [string, string];
  w: { one: string; draws: string; explains: string };
  curves: { x: number; y: number; z: number };
  steps: { x: number; y: number; z: number };
  /** La dernière page : où est le résultat, et le cadre à faire briller. */
  last: string;
  result: { x: number; y: number; z: number; rect: [number, number, number, number] };
  end: string[];
};

function groupProject(c: Group): FilmScene[] {
  return [
    {
      name: "Trois autour d'une table",
      span: 2,
      lead: 1.5,
      gap: 0.5,
      tail: 0.5,
      render: (ctx) => (
        <Broll src={asset(`broll-${c.id}.mp4`)} rate={0.6}>
          <Kinetic accent={c.look.accent} lines={[{ text: c.lines[0], at: ctx.sentence(0) }, { text: c.lines[1], at: ctx.sentence(1), hot: true }]} />
        </Broll>
      ),
    },
    askScene(c.id, "Un écran, une question", 2, (ctx) => ctx.f(c.w.one, 1) - 2, true),
    {
      name: "TRED résout, trace, explique",
      span: 1,
      lead: 0.4,
      tail: 2.4,
      cut: true,
      render: (ctx) => {
        const s = ctx.voiceAt;
        const draws = Math.max(s + 46, ctx.f(c.w.draws) - 6);
        const explains = Math.max(draws + 50, ctx.f(c.w.explains) - 2);
        return (
          <Screen
            layers={[{ src: shot(c.id, "wait") }, { src: shot(c.id, "page0"), at: s, reveal: { rect: BOARD, dir: "down", dur: 44 } }, { src: shot(c.id, "page1"), at: draws, fade: 14 }, { src: shot(c.id, "page2"), at: explains + 4, fade: 14 }]}
            cams={[
              { at: 0, ...ASKED },
              { at: s, ...ASKED },
              { at: s + 44, x: 1040, y: 560, z: 1.2 },
              { at: draws, x: 1040, y: 540, z: 1.2 },
              { at: draws + 34, x: c.curves.x, y: c.curves.y, z: c.curves.z },
              { at: explains - 8, x: c.curves.x, y: c.curves.y, z: c.curves.z + 0.05 },
              { at: explains + 22, x: c.steps.x, y: c.steps.y, z: c.steps.z },
              { at: ctx.dur, x: c.steps.x, y: c.steps.y + 20, z: c.steps.z + 0.05 },
            ]}
          />
        );
      },
      cues: (ctx) => [{ at: ctx.voiceAt, kind: "whoosh", volume: 0.14 }, { at: Math.max(ctx.voiceAt + 46, ctx.f(c.w.draws) - 6), kind: "pop", volume: 0.25 }, { at: ctx.f(c.w.explains), kind: "pop", volume: 0.22 }],
    },
    {
      name: "Plus de disputes",
      span: 1,
      lead: 0.4,
      tail: 0.4,
      render: () => <Broll src={asset(`broll-${c.id}.mp4`)} from={2.6} rate={0.6} dim={0.05} />,
    },
    {
      name: "La réponse exacte",
      span: 1,
      tail: 1.7,
      render: (ctx) => (
        <Screen layers={[{ src: shot(c.id, c.last) }]} cams={[{ at: 0, x: 1040, y: c.result.y - 40, z: 1.22 }, { at: ctx.voiceAt + 30, x: c.result.x, y: c.result.y, z: c.result.z }, { at: ctx.dur, x: c.result.x, y: c.result.y, z: c.result.z + 0.08 }]}>
          <Glow rect={c.result.rect} at={ctx.voiceAt + 16} until={ctx.dur - 8} radius={10} />
        </Screen>
      ),
      cues: (ctx) => [{ at: ctx.voiceAt + 18, kind: "success", volume: 0.32 }],
    },
    endScene(c.end, c.look.accent),
  ];
}

/* ── 3. L'étudiant venu d'ailleurs (EN 3, DE 3) ───────────────────────── */

type Transfer = {
  id: string;
  look: Look;
  lines: [string, string, string];
  w: { notes: string; concept: string; text: string; voice: string };
  /** Où la caméra se pose : la phrase du polycopié, puis sa traduction. */
  concept: { x: number; y: number; z: number };
  second: { layer: string; x: number; y: number; z: number };
  end: string[];
};

function transferStudent(c: Transfer): FilmScene[] {
  return [
    {
      name: "Nouveau pays",
      span: 3,
      lead: 1.0,
      gap: 0.55,
      tail: 0.6,
      render: (ctx) => (
        <Broll src={asset(`broll-${c.id}.mp4`)}>
          <Kinetic accent={c.look.accent} lines={[{ text: c.lines[0], at: ctx.sentence(0) }, { text: c.lines[1], at: ctx.sentence(1) }, { text: c.lines[2], at: ctx.sentence(2), hot: true }]} />
        </Broll>
      ),
    },
    {
      name: "Le polycopié en allemand",
      span: 1,
      tail: 0.9,
      render: (ctx) => {
        const notes = Math.max(12, ctx.f(c.w.notes) - 6);
        return (
          <Screen layers={[{ src: shot(c.id, "dash1") }]} cams={[{ at: 0, x: 1100, y: 420, z: 1.02 }, { at: notes + 26, x: 900, y: 690, z: 1.75 }, { at: ctx.dur, x: 915, y: 695, z: 1.85 }]} cursor={[{ at: 8, x: 1240, y: 520 }, { at: notes + 30, x: 1000, y: 725 }]}>
            <Glow rect={DOC_ROW} at={notes + 16} until={ctx.dur - 8} radius={18} />
          </Screen>
        );
      },
      cues: (ctx) => [{ at: Math.max(12, ctx.f(c.w.notes) - 6) + 16, kind: "pop", volume: 0.25 }],
    },
    {
      name: "Le concept, pas seulement le texte",
      span: 1,
      lead: 0.9,
      tail: 1.8,
      render: (ctx) => {
        const s = ctx.voiceAt;
        const concept = Math.max(s + 40, ctx.f(c.w.concept));
        const text = Math.max(concept + 40, ctx.f(c.w.text) + 8);
        const layers: Layer[] = [{ src: shot(c.id, "typed") }, { src: shot(c.id, "wait"), at: 14, fade: 8 }, { src: shot(c.id, "page0"), at: s - 4, reveal: { rect: BOARD, dir: "down", dur: 46 } }];
        if (c.second.layer !== "page0") layers.push({ src: shot(c.id, c.second.layer), at: text - 12, fade: 14 });
        return (
          <Screen
            layers={layers}
            cams={[
              { at: 0, x: 1230, y: 960, z: 1.45 },
              { at: 12, x: 1230, y: 960, z: 1.45 },
              { at: s + 6, ...ASKED },
              { at: concept, x: c.concept.x, y: c.concept.y, z: c.concept.z },
              { at: text - 14, x: c.concept.x + 30, y: c.concept.y, z: c.concept.z + 0.04 },
              { at: text + 26, x: c.second.x, y: c.second.y, z: c.second.z },
              { at: ctx.dur, x: c.second.x + 20, y: c.second.y, z: c.second.z + 0.06 },
            ]}
            cursor={[{ at: 2, x: 1700, y: 1000 }, { at: 12, x: SEND.x, y: SEND.y, click: true }]}
            hideCursorAt={22}
          />
        );
      },
      cues: (ctx) => [{ at: 12, kind: "click", volume: 0.5 }, { at: ctx.voiceAt - 4, kind: "whoosh", volume: 0.14 }, { at: Math.max(ctx.voiceAt + 80, ctx.f(c.w.text) + 8), kind: "pop", volume: 0.22 }],
    },
    videoClickScene(c.id, "Dans ta langue, avec la voix de ton professeur", 1225, (ctx) => ctx.voiceAt + 14, (ctx) => ctx.f(c.w.voice) - 8),
    playerScene(c.id, "Enfin, apprendre"),
    endScene(c.end, c.look.accent),
  ];
}

/* ── Les six films ────────────────────────────────────────────────────── */

type Film = { id: string; title: string; vo: VoFile; voice: string; music: string; look: Look; scenes: FilmScene[]; seed: number };

const FILMS: Film[] = [
  {
    id: "EN-1-The-Night-Before", title: "The Night Before", vo: voEn1, voice: voiceEn1, music: asset("music-amber.mp3"), look: LOOKS.amber, seed: 1,
    scenes: nightBefore({ id: "en1", look: LOOKS.amber, lines: ["It's 2 AM.", "The exam is tomorrow.", "And you're stuck."], w: { upload: "upload", ask: "ask", draws: "draws", step: "Step", board: "interactive", button: "Explain" }, boardSpan: 4, importX: 1421, chipX: 1225, focus: { x: 1020, y: 610, z: 1.5 }, end: ["The university", "in your pocket."] }),
  },
  {
    id: "EN-2-The-Group-Project", title: "The Group Project", vo: voEn2, voice: voiceEn2, music: asset("music-neutral.mp3"), look: LOOKS.neutral, seed: 2,
    scenes: groupProject({ id: "en2", look: LOOKS.neutral, lines: ["Group projects are chaos.", "Unless you have the right tool."], w: { one: "One", draws: "draws", explains: "explains" }, curves: { x: 700, y: 400, z: 1.7 }, steps: { x: 1000, y: 560, z: 1.25 }, last: "page3", result: { x: 880, y: 650, z: 1.5, rect: [333, 596, 1374, 140] }, end: ["Built for engineers."] }),
  },
  {
    id: "EN-3-The-Transfer-Student", title: "The Transfer Student", vo: voEn3, voice: voiceEn3, music: asset("music-cold.mp3"), look: LOOKS.cold, seed: 3,
    scenes: transferStudent({ id: "en3", look: LOOKS.cold, lines: ["New country.", "New language.", "Same struggle."], w: { notes: "notes", concept: "concept", text: "text", voice: "voice" }, concept: { x: 900, y: 390, z: 1.5 }, second: { layer: "page0", x: 980, y: 640, z: 1.5 }, end: ["Universal by design."] }),
  },
  {
    id: "DE-1-Die-Nacht-vor-der-Klausur", title: "Die Nacht vor der Klausur", vo: voDe1, voice: voiceDe1, music: asset("music-amber.mp3"), look: LOOKS.amber, seed: 4,
    scenes: nightBefore({ id: "de1", look: LOOKS.amber, lines: ["Es ist 2 Uhr nachts.", "Die Klausur ist morgen.", "Und du kommst nicht weiter."], w: { upload: "lädst", ask: "stellst", draws: "zeichnet", step: "Schritt", board: "interaktiven", button: "Video" }, boardSpan: 3, importX: 1390, chipX: 1228, focus: { x: 1000, y: 540, z: 1.4 }, end: ["Die Uni", "in deiner Hosentasche."] }),
  },
  {
    id: "DE-2-Die-Lerngruppe", title: "Die Lerngruppe", vo: voDe2, voice: voiceDe2, music: asset("music-neutral.mp3"), look: LOOKS.neutral, seed: 5,
    scenes: groupProject({ id: "de2", look: LOOKS.neutral, lines: ["Lerngruppen sind Chaos.", "Es sei denn, du hast das richtige Tool."], w: { one: "Ein", draws: "zeichnet", explains: "erklärt" }, curves: { x: 1020, y: 530, z: 1.4 }, steps: { x: 1000, y: 600, z: 1.25 }, last: "page2", result: { x: 900, y: 700, z: 1.45, rect: [333, 646, 1374, 130] }, end: ["Für Ingenieure gebaut."] }),
  },
  {
    id: "DE-3-Der-Austauschstudent", title: "Der Austauschstudent", vo: voDe3, voice: voiceDe3, music: asset("music-cold.mp3"), look: LOOKS.cold, seed: 6,
    scenes: transferStudent({ id: "de3", look: LOOKS.cold, lines: ["Neues Land.", "Neue Sprache.", "Gleicher Kampf."], w: { notes: "Skripte", concept: "Konzept", text: "Text", voice: "Stimme" }, concept: { x: 900, y: 380, z: 1.5 }, second: { layer: "page0", x: 1010, y: 690, z: 1.4 }, end: ["Universell by Design."] }),
  },
];

/** [id de composition, composant, durée en images] — pour Root.tsx. */
export const CINEMATIC_A = FILMS.map((film) => {
  const Component = () => <CinematicShort vo={film.vo} voice={film.voice} music={film.music} look={film.look} scenes={film.scenes} seed={film.seed} />;
  return [`Cine-${film.id}`, Component, planFilm(film.vo, film.scenes).frames] as const;
});
