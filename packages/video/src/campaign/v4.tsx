import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { BadgeCheck, Calculator, Check, Copy, Eye, FileText, Link2, MessageSquareText, Search, Send, Sparkles, UserPlus, Users } from "lucide-react";
import { Logo } from "@/components/logo";
import { Tex } from "../promo/board";
import { CREAM, INK, NIGHT, YELLOW, clamp, easeOut, pop, progress, rise } from "../promo/kit";
import { CampaignVideo, type CampCtx, type CampScene } from "./engine";
import { BG, mark } from "./parts";
import { BeamBoard, type Lang, type Outro } from "./videos";
import { ChatScreen, Cursor, DashboardScreen, INPUT, SEND, SolverBeamBoard, VideoFeature } from "./demo";
import voEn1 from "../assets/vo-v-en1.json";
import voEn2 from "../assets/vo-v-en2.json";
import voEn3 from "../assets/vo-v-en3.json";
import voDe1 from "../assets/vo-v-de1.json";
import voDe2 from "../assets/vo-v-de2.json";
import voDe3 from "../assets/vo-v-de3.json";
import voiceEn1 from "../assets/vo-v-en1.mp3";
import voiceEn2 from "../assets/vo-v-en2.mp3";
import voiceEn3 from "../assets/vo-v-en3.mp3";
import voiceDe1 from "../assets/vo-v-de1.mp3";
import voiceDe2 from "../assets/vo-v-de2.mp3";
import voiceDe3 from "../assets/vo-v-de3.mp3";
import music1 from "../assets/music-c1-en.mp3";
import music2 from "../assets/music-c2-en.mp3";
import music3 from "../assets/music-c3-en.mp3";
import music4 from "../assets/music-c4-de.mp3";
import music5 from "../assets/music-c5-de.mp3";
import music6 from "../assets/music-c1-de.mp3";

/**
 * Campagne V4 « Studyflix » — 3 vidéos EN + 3 vidéos DE, 30 s, 9:16 (2026-11-12).
 *
 * Très pédagogique : un curseur guide l'œil, et chaque clic déclenche une
 * réaction de l'interface (le PDF s'ouvre à la bonne page, la vidéo se
 * génère, l'interface s'efface). Les textes de la voix sont ceux du
 * fondateur, mot pour mot (src/voiceovers.mjs, V4) ; les animations sont
 * calées sur les mots prononcés (`f("mot")`).
 *
 * Le tableau, le schéma du solveur, le logo et la charte sont ceux de l'app ;
 * la recherche, le lecteur PDF, le formulaire de feedback et les écrans de
 * partage sont des maquettes dans la charte de l'app.
 */

const V4_MAX_GAP = 4;
const font = "Inter, ui-sans-serif, system-ui, sans-serif";

/* ── Briques communes ─────────────────────────────────────────────────── */

/** Un écran de l'app : photo de la filière, voile sombre, logo en haut. */
function AppScreen({ bg, chip, children }: { bg: string; chip?: string; children?: ReactNode }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: NIGHT, overflow: "hidden", fontFamily: font }}>
      <Img src={staticFile(bg)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: `scale(${1.06 + frame * 0.0004})` }} />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgb(7 11 20 / 0.84), rgb(11 18 34 / 0.6) 45%, rgb(7 11 20 / 0.84))" }} />
      <div style={{ position: "absolute", top: 54, left: 24, right: 24, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Logo markClassName="h-8 text-white" />
        {chip && <span style={{ padding: "6px 14px", borderRadius: 999, background: "rgb(255 255 255 / 0.12)", border: "1px solid rgb(255 255 255 / 0.2)", color: "#FFF", fontSize: 14, fontWeight: 600 }}>{chip}</span>}
      </div>
      {children}
    </AbsoluteFill>
  );
}

/** Des lignes de texte grisées : le « corps » d'une page de cours. */
function TextLines({ n, seed = 0 }: { n: number; seed?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} style={{ height: 8, borderRadius: 4, background: "#D6D3CB", width: `${62 + ((i * 37 + seed * 53) % 38)}%` }} />
      ))}
    </div>
  );
}

/** Une page de polycopié : titre, lignes, et une zone de contenu facultative. */
function PdfPage({ n, title, children, style }: { n: number; title: string; children?: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ borderRadius: 10, background: "#FFFEFA", color: INK, padding: "20px 22px 16px", boxShadow: "0 24px 50px -24px rgb(0 0 0 / 0.9)", ...style }}>
      <p style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 800 }}>{title}</p>
      <TextLines n={3} seed={n} />
      {children}
      <div style={{ marginTop: 14 }}>
        <TextLines n={4} seed={n + 3} />
      </div>
      <p style={{ margin: "14px 0 0", textAlign: "center", fontSize: 12, color: "#8A857A", fontFamily: "ui-monospace, monospace" }}>{n}</p>
    </div>
  );
}

/** Un coup de surligneur jaune qui passe de gauche à droite sous son contenu. */
function Marker({ k, children, style }: { k: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ position: "relative", ...style }}>
      <span style={{ position: "absolute", inset: "-4px -8px", borderRadius: 8, background: "rgb(234 179 8 / 0.5)", transformOrigin: "left center", transform: `scaleX(${k})` }} />
      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );
}

const typed = (text: string, frame: number, from: number, to: number) => text.slice(0, Math.floor(progress(frame, from, Math.max(from + 1, to)) * text.length));

/** Les images où claquent les touches pendant une saisie. */
const typeCues = (from: number, to: number) => {
  const n = Math.max(3, Math.min(9, Math.floor((to - from) / 6)));
  return Array.from({ length: n }, (_, i) => ({ at: Math.round(from + (i * (to - from)) / n), kind: "type" as const, volume: 0.25 }));
};

/* ═══ EN 1 — The Research ═══════════════════════════════════════════════ */

const SEARCH_BAR = { x: 250, y: 150 };
const RESULT = { x: 270, y: 262 };
const R = {
  query: "Where is the formula for bending moment?",
  file: "TM2_Lecture_Notes.pdf",
  hit: "Page 47 · 5.3 Bending moment",
  heading: "5.3 Bending moment of a beam",
  context: "In context",
  contextBody: "Maximum bending moment at mid-span of a simply supported beam under a uniform load.",
  pages: ["3.1 Internal forces", "3.4 Shear force", "4.2 Sign convention", "4.6 Equilibrium", "5.1 Distributed loads"],
};

/** Le champ de recherche de l'app. `glow` : il attire l'œil quand la voix le nomme. */
function SearchBar({ text, glow = 0, focused = false }: { text: string; glow?: number; focused?: boolean }) {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        left: 20,
        right: 20,
        top: SEARCH_BAR.y - 30,
        height: 60,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 18px",
        borderRadius: 20,
        background: "rgb(255 255 255 / 0.96)",
        border: `2px solid ${focused ? YELLOW : "transparent"}`,
        boxShadow: `0 0 0 ${glow * 9}px rgb(234 179 8 / ${0.3 * glow}), 0 24px 50px -20px rgb(0 0 0 / 0.9)`,
      }}
    >
      <Search size={22} color="#475569" />
      <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", fontSize: text ? 16 : 18, fontWeight: text ? 600 : 400, color: text ? INK : "#64748B" }}>
        {text || "Search your lecture notes …"}
        {focused && <span style={{ opacity: frame % 16 < 8 ? 1 : 0 }}>|</span>}
      </span>
    </div>
  );
}

/** Scène A : on fait défiler un PDF sans fin ; la recherche de TRED arrive. */
function EndlessScroll({ f }: { f: CampCtx["f"] }) {
  const frame = useCurrentFrame();
  const searchAt = f("search");
  // Le défilement ralentit puis s'arrête quand la recherche apparaît.
  const scroll = interpolate(frame, [0, searchAt, searchAt + 20], [0, 1500, 1620], clamp);
  const bar = pop(frame, searchAt - 6);
  const page = 12 + Math.floor(scroll / 34);
  return (
    <AppScreen bg={BG("mechanical", 2)} chip={R.file}>
      <div style={{ position: "absolute", left: 40, right: 40, top: 210, bottom: 0, overflow: "hidden", opacity: 1 - 0.45 * progress(frame, searchAt, searchAt + 14) }}>
        <div style={{ transform: `translateY(${-scroll}px)`, display: "flex", flexDirection: "column", gap: 18 }}>
          {Array.from({ length: 9 }, (_, i) => (
            <PdfPage key={i} n={12 + i * 6} title={R.pages[i % R.pages.length]} />
          ))}
        </div>
      </div>
      <span style={{ position: "absolute", right: 22, top: 222, padding: "6px 12px", borderRadius: 999, background: "rgb(15 23 42 / 0.9)", color: "#FFF", fontSize: 14, fontWeight: 700, fontFamily: "ui-monospace, monospace" }}>
        {page} / 248
      </span>
      <div style={{ opacity: Math.min(1, bar * 1.5), transform: `translateY(${(1 - bar) * -40}px)` }}>
        <SearchBar text="" glow={frame >= searchAt ? 0.5 + 0.5 * Math.sin((frame - searchAt) / 4) : 0} />
      </div>
      {/* Le curseur fait tourner la molette, puis file vers la recherche. */}
      <Cursor keys={[{ at: 4, x: 470, y: 560 }, { at: Math.max(20, searchAt - 2), x: 470, y: 600 }, { at: searchAt + 18, x: SEARCH_BAR.x, y: SEARCH_BAR.y + 6 }]} />
    </AppScreen>
  );
}

/** Scène B : taper la question, le résultat tombe, le PDF s'ouvre à la page, la formule se surligne. */
function SearchAndFind({ f }: { f: CampCtx["f"] }) {
  const frame = useCurrentFrame();
  const type0 = f("type");
  const typeEnd = f("moment");
  const finds = f("finds");
  const open = Math.max(f("page"), finds + 16);
  const para = Math.max(f("paragraph"), open + 14);
  const explains = f("explains");
  const text = typed(R.query, frame, type0 + 6, typeEnd + 4);
  const hit = pop(frame, finds);
  const opened = progress(frame, open, open + 16);
  const scroll = interpolate(frame, [open, open + 22], [240, 0], { ...clamp, easing: easeOut });
  const note = pop(frame, explains);
  return (
    <AppScreen bg={BG("mechanical", 2)} chip={R.file}>
      <SearchBar text={text} focused={frame >= type0 && frame < finds + 10} />
      {/* Le résultat : la page exacte. */}
      {frame >= finds && (
        <div style={{ position: "absolute", left: 20, right: 20, top: RESULT.y - 36, height: 72, display: "flex", alignItems: "center", gap: 14, padding: "0 16px", borderRadius: 18, background: CREAM, color: INK, opacity: Math.min(1, hit * 1.5) * (1 - 0.0 * opened), transform: `scale(${0.9 + 0.1 * hit})`, border: `2px solid ${frame >= open ? YELLOW : "transparent"}`, boxShadow: "0 24px 50px -22px rgb(0 0 0 / 0.9)" }}>
          <span style={{ display: "grid", placeItems: "center", width: 42, height: 42, borderRadius: 12, background: NIGHT }}>
            <FileText size={22} color={YELLOW} />
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{R.hit}</p>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "#64748B" }}>{R.file}</p>
          </div>
        </div>
      )}
      {/* Le PDF s'ouvre et défile jusqu'à la page 47. */}
      {frame >= open && (
        <div style={{ position: "absolute", left: 30, right: 30, top: 322, height: 400, overflow: "hidden", borderRadius: 12, opacity: opened }}>
          <div style={{ transform: `translateY(${scroll}px)` }}>
            <PdfPage n={47} title={R.heading}>
              <Marker k={progress(frame, para, para + 14)} style={{ margin: "16px 6px 4px", padding: "4px 0" }}>
                <Tex tex={String.raw`M_{max} = \frac{q\,l^2}{8}`} size={1.25} />
              </Marker>
            </PdfPage>
          </div>
        </div>
      )}
      {/* Le contexte, expliqué. */}
      {frame >= explains && (
        <div style={{ position: "absolute", left: 20, right: 20, top: 560, padding: "14px 18px", borderRadius: 20, background: NIGHT, color: "#FFF", border: `2px solid ${YELLOW}`, opacity: Math.min(1, note * 1.5), transform: `translateY(${(1 - note) * 26}px)`, boxShadow: "0 30px 60px -24px rgb(0 0 0 / 0.95)" }}>
          <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: YELLOW }}>
            <Sparkles size={16} /> {R.context}
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 18, fontWeight: 600, lineHeight: 1.3 }}>{R.contextBody}</p>
        </div>
      )}
      <Cursor
        keys={[
          { at: 0, x: SEARCH_BAR.x, y: SEARCH_BAR.y + 6 },
          { at: type0, x: SEARCH_BAR.x, y: SEARCH_BAR.y + 6, click: true },
          { at: finds + 6, x: 400, y: 330 },
          { at: open, x: RESULT.x, y: RESULT.y + 6, click: true },
          { at: para + 4, x: 330, y: 500 },
        ]}
        hideAt={explains + 20}
      />
    </AppScreen>
  );
}

const en1: CampScene[] = [
  {
    name: "Endless PDF scrolling — the search arrives",
    span: 2,
    render: ({ f }) => <EndlessScroll f={f} />,
    cues: ({ f }) => [{ at: f("search") - 6, kind: "pop" as const, volume: 0.4 }],
  },
  {
    name: "Type the question — exact page — highlighted formula — context",
    span: 2,
    enter: "fade",
    render: ({ f }) => <SearchAndFind f={f} />,
    cues: ({ f }) => [
      { at: f("type"), kind: "click" as const, volume: 0.5 },
      ...typeCues(f("type") + 6, f("moment") + 4),
      { at: f("finds"), kind: "pop" as const, volume: 0.45 },
      { at: Math.max(f("page"), f("finds") + 16), kind: "click" as const, volume: 0.6 },
      { at: Math.max(f("paragraph"), f("finds") + 30), kind: "success" as const, volume: 0.4 },
      { at: f("explains"), kind: "pop" as const, volume: 0.4 },
    ],
  },
];

/* ═══ EN 2 — The Workflow ═══════════════════════════════════════════════ */

const en2: CampScene[] = [
  {
    name: "Explain as video — generate — animated diagram — save to dashboard",
    span: 4,
    render: ({ f, dur }) => (
      <VideoFeature lang="en" f={f} dur={dur} diagram w={{ button: "Explain", click: "Click", generates: "generates", voice: "custom", visual: "animated", step: ["exact", 0], saves: "Save" }} />
    ),
    cues: ({ f }) => [
      { at: f("Click") + 6, kind: "click" as const, volume: 0.6 },
      { at: f("generates") + 34, kind: "success" as const, volume: 0.45 },
      ...["custom", "animated", "exact"].map((x) => ({ at: f(x), kind: "pop" as const, volume: 0.3 })),
      { at: f("Save") + 8, kind: "click" as const, volume: 0.6 },
      { at: f("Save") + 16, kind: "success" as const, volume: 0.35 },
    ],
  },
];

/* ═══ EN 3 — The Expansion ══════════════════════════════════════════════ */

const FAB = { x: 470, y: 690 };
const FB_SEND = { x: 404, y: 566 };
const INVITE = { x: 270, y: 520 };
const X = {
  built: "Built for students",
  by: "by students",
  coCreator: "Co-creator",
  feedback: "Feedback",
  feedbackTitle: "Tell us what's missing",
  message: "Great app, please add Thermodynamics!",
  send: "Send",
  thanks: "Thank you! Your idea is on the list.",
  beta: "Beta",
  joinTitle: "Join the beta",
  joinBody: "Build the ultimate engineering companion with us.",
  invite: "Invite a friend",
  copied: "Invite link copied",
};

/** Scène A : par des étudiants, pour des étudiants — et toi, co-créateur. */
function CoCreator({ f }: { f: CampCtx["f"] }) {
  const frame = useCurrentFrame();
  const a = f("students");
  const b = f("by");
  const c = f("co-creator");
  const chip = (at: number, label: string, top: number, hot = false) => {
    const k = pop(frame, at);
    return (
      <span className="font-display" style={{ position: "absolute", left: 0, right: 0, top, textAlign: "center", opacity: Math.min(1, k * 1.5), transform: `scale(${0.8 + 0.2 * k})` }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "12px 24px", borderRadius: 999, background: hot ? YELLOW : CREAM, color: hot ? NIGHT : INK, fontSize: hot ? 34 : 30, fontWeight: 700, boxShadow: "0 24px 50px -22px rgb(0 0 0 / 0.9)" }}>
          {hot && <BadgeCheck size={30} />}
          {label}
        </span>
      </span>
    );
  };
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ filter: `blur(${4 * progress(frame, a - 6, a + 6)}px)` }}>
        <DashboardScreen lang="en" active={-1} bg={BG("aerospace", 4)} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `rgb(7 11 20 / ${0.55 * progress(frame, a - 6, a + 6)})` }} />
      {chip(a, X.built, 300)}
      {chip(b, X.by, 380)}
      {chip(c, X.coCreator, 500, true)}
    </AbsoluteFill>
  );
}

/** Le bouton flottant « Feedback » de l'app. */
function FeedbackFab({ glow, pressed }: { glow: number; pressed: boolean }) {
  return (
    <span
      style={{
        position: "absolute",
        left: FAB.x - 34,
        top: FAB.y - 34,
        width: 68,
        height: 68,
        borderRadius: 34,
        display: "grid",
        placeItems: "center",
        background: pressed ? YELLOW : NIGHT,
        border: `3px solid ${YELLOW}`,
        boxShadow: `0 0 0 ${glow * 12}px rgb(234 179 8 / ${0.3 * glow}), 0 20px 40px -14px rgb(0 0 0 / 0.9)`,
        transform: `scale(${1 + 0.06 * glow})`,
      }}
    >
      <MessageSquareText size={30} color={pressed ? NIGHT : YELLOW} />
    </span>
  );
}

/** Scène B : le curseur clique sur « Feedback », on écrit, on envoie. */
function FeedbackFlow({ f, dur }: { f: CampCtx["f"]; dur: number }) {
  const frame = useCurrentFrame();
  const see = f("feedback");
  const click = see + 20;
  const type0 = Math.max(f("tell"), click + 14);
  const typeEnd = Math.max(type0 + 40, f("features") + 2);
  const send = Math.min(dur - 26, typeEnd + 12);
  const sheet = pop(frame, click + 2);
  const sent = frame >= send + 3;
  const glow = frame >= see - 4 && frame < click ? 0.5 + 0.5 * Math.sin((frame - see) / 3) : 0;
  return (
    <AbsoluteFill>
      <DashboardScreen lang="en" active={-1} bg={BG("aerospace", 4)} />
      <FeedbackFab glow={glow} pressed={frame >= click} />
      {frame >= click && (
        <>
          <AbsoluteFill style={{ background: `rgb(7 11 20 / ${0.6 * Math.min(1, sheet)})` }} />
          <div style={{ position: "absolute", left: 24, right: 24, top: 300, padding: "20px 20px 18px", borderRadius: 26, background: CREAM, color: INK, opacity: Math.min(1, sheet * 1.5), transform: `translateY(${(1 - sheet) * 60}px) scale(${0.94 + 0.06 * sheet})`, boxShadow: "0 40px 80px -30px rgb(0 0 0 / 0.95)", fontFamily: font }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", color: "#8A6D0B" }}>{X.feedback}</p>
            <p className="font-display" style={{ margin: "4px 0 14px", fontSize: 26, fontWeight: 700 }}>{sent ? X.thanks : X.feedbackTitle}</p>
            {!sent && (
              <>
                <div style={{ minHeight: 96, padding: "12px 14px", borderRadius: 16, background: "#FFF", border: `2px solid ${frame >= type0 ? YELLOW : "#E5E1D8"}`, fontSize: 19, fontWeight: 600, lineHeight: 1.35 }}>
                  {typed(X.message, frame, type0, typeEnd)}
                  <span style={{ opacity: frame % 16 < 8 ? 1 : 0 }}>|</span>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 22px", borderRadius: 16, background: YELLOW, color: NIGHT, fontSize: 18, fontWeight: 800 }}>
                    <Send size={18} /> {X.send}
                  </span>
                </div>
              </>
            )}
            {sent && (
              <span style={{ display: "inline-grid", placeItems: "center", width: 54, height: 54, borderRadius: 27, background: "#16A34A", transform: `scale(${pop(frame, send + 3)})` }}>
                <Check size={30} color="#FFF" strokeWidth={3} />
              </span>
            )}
          </div>
        </>
      )}
      <Cursor
        keys={[
          { at: Math.max(2, see - 22), x: 220, y: 470 },
          { at: click, x: FAB.x, y: FAB.y, click: true },
          { at: type0, x: 250, y: 430, click: true },
          { at: send, x: FB_SEND.x, y: FB_SEND.y, click: true },
        ]}
        hideAt={send + 16}
      />
    </AbsoluteFill>
  );
}

/** Scène C : rejoindre la bêta, inviter ses amis. */
function InviteFriends({ f }: { f: CampCtx["f"] }) {
  const frame = useCurrentFrame();
  const join = f("Join");
  const invite = f("invite");
  const click = invite + 8;
  const together = f("together");
  const card = pop(frame, Math.max(2, join - 4));
  const copied = frame >= click + 3;
  const friends = ["LM", "AK", "JS", "MR", "TN"];
  return (
    <AppScreen bg={BG("aerospace", 4)}>
      <div style={{ position: "absolute", left: 24, right: 24, top: 250, padding: "26px 22px 24px", borderRadius: 28, background: CREAM, color: INK, textAlign: "center", opacity: Math.min(1, card * 1.5), transform: `scale(${0.92 + 0.08 * card})`, boxShadow: "0 40px 80px -30px rgb(0 0 0 / 0.95)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 999, background: NIGHT, color: YELLOW, fontSize: 13, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          <Sparkles size={14} /> {X.beta}
        </span>
        <p className="font-display" style={{ margin: "12px 0 6px", fontSize: 34, fontWeight: 700 }}>{X.joinTitle}</p>
        <p style={{ margin: "0 0 22px", fontSize: 17, color: "#57534E", lineHeight: 1.3 }}>{X.joinBody}</p>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "16px 28px", borderRadius: 18, background: copied ? "#16A34A" : YELLOW, color: copied ? "#FFF" : NIGHT, fontSize: 21, fontWeight: 800, boxShadow: `0 0 0 ${frame >= invite - 6 && !copied ? 6 + 4 * Math.sin(frame / 3) : 0}px rgb(234 179 8 / 0.3)` }}>
          {copied ? <Check size={22} strokeWidth={3} /> : <UserPlus size={22} />}
          {copied ? X.copied : X.invite}
        </span>
      </div>
      {/* Les amis arrivent un par un. */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 590, display: "flex", justifyContent: "center", gap: 12 }}>
        {friends.map((initials, i) => {
          const k = pop(frame, Math.min(together, click + 10) + i * 5);
          return (
            <span key={initials} style={{ display: "grid", placeItems: "center", width: 62, height: 62, borderRadius: 31, background: i % 2 ? CREAM : YELLOW, color: NIGHT, fontSize: 20, fontWeight: 800, border: "3px solid #0F172A", opacity: Math.min(1, k * 1.5), transform: `scale(${k}) translateY(${(1 - k) * 20}px)` }}>
              {initials}
            </span>
          );
        })}
      </div>
      <Cursor keys={[{ at: Math.max(2, join), x: 400, y: 640 }, { at: click, x: INVITE.x, y: INVITE.y, click: true }]} hideAt={click + 26} />
    </AppScreen>
  );
}

const en3: CampScene[] = [
  {
    name: "Built for students, by students — co-creator",
    span: 2,
    render: ({ f }) => <CoCreator f={f} />,
    cues: ({ f }) => ["students", "by", "co-creator"].map((x) => ({ at: f(x), kind: "pop" as const, volume: 0.4 })),
  },
  {
    name: "Click Feedback — type — send",
    span: 2,
    enter: "fade",
    render: ({ f, dur }) => <FeedbackFlow f={f} dur={dur} />,
    cues: ({ f, dur }) => {
      const click = f("feedback") + 20;
      const type0 = Math.max(f("tell"), click + 14);
      const typeEnd = Math.max(type0 + 40, f("features") + 2);
      const send = Math.min(dur - 26, typeEnd + 12);
      return [{ at: click, kind: "click" as const, volume: 0.6 }, ...typeCues(type0, typeEnd), { at: send, kind: "click" as const, volume: 0.6 }, { at: send + 4, kind: "success" as const, volume: 0.4 }];
    },
  },
  {
    name: "Join the beta — invite a friend",
    enter: "slide",
    render: ({ f }) => <InviteFriends f={f} />,
    cues: ({ f }) => [{ at: f("invite") + 8, kind: "click" as const, volume: 0.6 }, ...[0, 5, 10, 15, 20].map((d) => ({ at: Math.min(f("together"), f("invite") + 18) + d, kind: "pop" as const, volume: 0.25 }))],
  },
];

/* ═══ DE 1 — Die Altklausur-Suche ═══════════════════════════════════════ */

const K = {
  hint: "Welche Aufgabe suchst du?",
  question: "Zeig mir die Aufgabe zur Biegelinie aus der letzten Klausur",
  searching: "TRED durchsucht deine Dokumente …",
  docs: ["TM2_Skript.pdf", "Übungsblatt_07.pdf", "Formelsammlung.pdf", "Klausur_WS25.pdf"],
  found: "Gefunden",
  task: "Aufgabe 3 — Biegelinie",
  taskBody: "Bestimmen Sie die Biegelinie w(x) des Balkens.",
};

/** Scène A : on tape la demande, on envoie. */
function AskForTask({ f }: { f: CampCtx["f"] }) {
  const frame = useCurrentFrame();
  const send = f("Frag") + 30;
  const isSent = frame >= send + 3;
  const text = typed(K.question, frame, 26, send - 12);
  return (
    <AbsoluteFill>
      <ChatScreen lang="de" hint={K.hint} typed={isSent ? "" : text} sent={isSent ? K.question : undefined} sentAt={send + 3} />
      <Cursor keys={[{ at: 6, x: 380, y: 620 }, { at: 24, x: INPUT.x, y: INPUT.y, click: true }, { at: send, x: SEND.x, y: SEND.y, click: true }]} />
    </AbsoluteFill>
  );
}

const DOC_TOP = 208;
const DOC_STEP = 78;

/** Scène B : les documents sont parcourus, la Klausur s'ouvre, la solution s'écrit au tableau. */
function FindAndSolve({ f, dur }: { f: CampCtx["f"]; dur: number }) {
  const frame = useCurrentFrame();
  const scan = f("durchsucht");
  const found = f("findet");
  const open = found + 14;
  const board = Math.max(f("Schritt") - 4, open + 40);
  const boardIn = progress(frame, board, board + 14);
  // Le faisceau de recherche passe d'un document à l'autre, puis s'arrête sur la Klausur.
  const scanning = interpolate(frame, [scan, found], [0, K.docs.length - 1], clamp);
  const opened = pop(frame, open);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `circle(${boardIn * 135}% at 50% 62%)` }}>
        <BeamBoard lang="de" at={board + 10} step={(fr) => Math.min(4, Math.max(0, Math.floor((fr - board - 12) / 18)))} />
      </AbsoluteFill>
      {boardIn < 1 && (
        <AbsoluteFill style={{ opacity: 1 - boardIn }}>
          <AppScreen bg={BG("mechanical", 2)} chip="Technische Mechanik 2">
            <p style={{ ...rise(frame, 2), position: "absolute", left: 24, top: 138, margin: 0, display: "flex", alignItems: "center", gap: 10, color: "#FFF", fontSize: 19, fontWeight: 700 }}>
              <Search size={20} color={YELLOW} /> {K.searching}
            </p>
            {K.docs.map((name, i) => {
              const isHit = i === K.docs.length - 1 && frame >= found;
              const lit = frame >= scan && !isHit ? Math.max(0, 1 - Math.abs(scanning - i)) : 0;
              return (
                <div key={name} style={{ ...rise(frame, 4 + i * 4), position: "absolute", left: 20, right: 20, top: DOC_TOP + i * DOC_STEP, height: 64, display: "flex", alignItems: "center", gap: 14, padding: "0 16px", borderRadius: 18, background: isHit ? CREAM : `rgb(255 255 255 / ${0.1 + 0.16 * lit})`, color: isHit ? INK : "#FFF", border: `2px solid ${isHit ? YELLOW : `rgb(234 179 8 / ${lit})`}`, boxShadow: isHit ? "0 0 0 6px rgb(234 179 8 / 0.25)" : "none" }}>
                  <FileText size={24} color={isHit ? "#8A6D0B" : YELLOW} />
                  <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>{name}</span>
                  {isHit && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, background: "#16A34A", color: "#FFF", fontSize: 13, fontWeight: 800, transform: `scale(${pop(frame, found)})` }}>
                      <Check size={14} strokeWidth={3} /> {K.found}
                    </span>
                  )}
                </div>
              );
            })}
            {/* La Klausur s'ouvre sur l'exercice exact. */}
            {frame >= open && (
              <div style={{ position: "absolute", left: 30, right: 30, top: 536, opacity: Math.min(1, opened * 1.5), transform: `translateY(${(1 - opened) * 40}px)` }}>
                <PdfPage n={4} title="Klausur Technische Mechanik 2 · WS 2025/26" style={{ padding: "16px 20px 12px" }}>
                  <Marker k={progress(frame, open + 10, open + 24)} style={{ margin: "14px 6px 2px", padding: "2px 0" }}>
                    <p style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{K.task}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 14 }}>{K.taskBody}</p>
                  </Marker>
                </PdfPage>
              </div>
            )}
          </AppScreen>
        </AbsoluteFill>
      )}
      <Cursor keys={[{ at: Math.max(2, found - 20), x: 420, y: 520 }, { at: found + 10, x: 300, y: DOC_TOP + 3 * DOC_STEP + 34, click: true }, { at: Math.min(dur - 4, board - 2), x: 300, y: 640, click: true }]} hideAt={board + 4} />
    </AbsoluteFill>
  );
}

const de1: CampScene[] = [
  {
    name: "Aufgabe aus der Altklausur anfragen",
    span: 2,
    render: ({ f }) => <AskForTask f={f} />,
    cues: ({ f }) => [{ at: 24, kind: "click" as const, volume: 0.5 }, ...typeCues(26, f("Frag") + 18), { at: f("Frag") + 30, kind: "click" as const, volume: 0.6 }],
  },
  {
    name: "Dokumente durchsuchen — Aufgabe — Lösung an der Tafel",
    enter: "fade",
    render: ({ f, dur }) => <FindAndSolve f={f} dur={dur} />,
    cues: ({ f }) => {
      const found = f("findet");
      const board = Math.max(f("Schritt") - 4, found + 54);
      return [
        ...[0, 1, 2].map((i) => ({ at: f("durchsucht") + i * 8, kind: "pop" as const, volume: 0.22 })),
        { at: found, kind: "success" as const, volume: 0.4 },
        { at: found + 10, kind: "click" as const, volume: 0.6 },
        { at: board - 2, kind: "click" as const, volume: 0.5 },
        ...[1, 2, 3, 4].map((i) => ({ at: board + 12 + i * 18, kind: "pop" as const, volume: 0.28 })),
      ];
    },
  },
];

/* ═══ DE 2 — Deep Work ══════════════════════════════════════════════════ */

const EYE = { x: 478, y: 70 };
const SOLVER_TILE = { x: 270, y: 470 };
const Z = {
  idle: "Keine Eingabe",
  immersive: "Immersiver Modus",
  solverTitle: "Deterministische Solver",
  solvers: ["Balkenstatik", "Schaltungen", "Thermodynamik"],
  open: "Solver starten",
};

/** Scène A : rien ne bouge, le compte à rebours tourne, l'interface s'efface. */
function GoImmersive({ f }: { f: CampCtx["f"] }) {
  const frame = useCurrentFrame();
  const activate = f("Aktiviere");
  const vanish = f("verschwindet");
  const hidden = progress(frame, vanish - 4, vanish + 22);
  // Les 15 secondes d'inactivité, en accéléré.
  const idle = interpolate(frame, [activate + 4, vanish - 4], [0, 15], clamp);
  const ring = 2 * Math.PI * 30;
  return (
    <AbsoluteFill style={{ background: NIGHT, overflow: "hidden", fontFamily: font }}>
      {/* Le fond seul : ce qui reste quand tout s'efface. */}
      <Img src={staticFile(BG("architecture", 1))} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: `scale(${1.04 + frame * 0.0007})` }} />
      <AbsoluteFill style={{ background: `rgb(7 11 20 / ${0.25 - 0.15 * hidden})` }} />
      <AbsoluteFill style={{ opacity: 1 - hidden }}>
        <DashboardScreen lang="de" active={-1} bg={BG("architecture", 1)} />
        {/* Le bouton « mode immersif » de la barre du haut. */}
        <span style={{ position: "absolute", left: EYE.x - 24, top: EYE.y - 24, width: 48, height: 48, borderRadius: 24, display: "grid", placeItems: "center", background: frame >= activate ? YELLOW : "rgb(255 255 255 / 0.14)", border: "1px solid rgb(255 255 255 / 0.25)" }}>
          <Eye size={24} color={frame >= activate ? NIGHT : "#FFF"} />
        </span>
        {frame >= activate && (
          <div style={{ position: "absolute", left: 0, right: 0, top: 760 - 250, display: "flex", justifyContent: "center", opacity: Math.min(1, pop(frame, activate + 2) * 1.5) }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 22px 12px 14px", borderRadius: 999, background: "rgb(15 23 42 / 0.92)", border: `2px solid ${YELLOW}`, color: "#FFF", boxShadow: "0 30px 60px -24px rgb(0 0 0 / 0.95)" }}>
              <svg width={72} height={72} viewBox="0 0 72 72">
                <circle cx={36} cy={36} r={30} fill="none" stroke="rgb(255 255 255 / 0.18)" strokeWidth={6} />
                <circle cx={36} cy={36} r={30} fill="none" stroke={YELLOW} strokeWidth={6} strokeLinecap="round" strokeDasharray={ring} strokeDashoffset={ring * (1 - idle / 15)} transform="rotate(-90 36 36)" />
                <text x={36} y={43} textAnchor="middle" fontSize={22} fontWeight={800} fill="#FFF" fontFamily={font}>{Math.floor(idle)}</text>
              </svg>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: YELLOW }}>{Z.idle} · 15 s</p>
                <p className="font-display" style={{ margin: "2px 0 0", fontSize: 24, fontWeight: 700 }}>{Z.immersive}</p>
              </div>
            </div>
          </div>
        )}
      </AbsoluteFill>
      {/* Le curseur active le mode, puis ne touche plus à rien et s'efface avec l'interface. */}
      <Cursor keys={[{ at: Math.max(2, activate - 22), x: 300, y: 420 }, { at: activate, x: EYE.x, y: EYE.y, click: true }, { at: activate + 24, x: 360, y: 640 }]} hideAt={vanish - 6} />
    </AbsoluteFill>
  );
}

/** Scène B : un clic sur un solveur, le résultat est là tout de suite. */
function SolveNow({ f }: { f: CampCtx["f"] }) {
  const frame = useCurrentFrame();
  const back = 4;
  const click = Math.max(f("nutze") + 4, 40);
  const stamp = f("verlässliche");
  const open = progress(frame, click + 3, click + 15);
  const ui = pop(frame, back);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `circle(${open * 135}% at 50% 49%)` }}>
        <SolverBeamBoard lang="de" at={{ draws: click + 4, calc: click + 20, explains: click + 36 }} stampAt={Math.max(stamp, click + 40)} />
      </AbsoluteFill>
      {open < 1 && (
        <AbsoluteFill style={{ opacity: 1 - open }}>
          <AppScreen bg={BG("architecture", 1)} chip="Technische Mechanik 2">
            <div style={{ opacity: Math.min(1, ui * 1.4), transform: `translateY(${(1 - ui) * 18}px)` }}>
              <p className="font-display" style={{ position: "absolute", left: 24, top: 250, margin: 0, color: "#FFF", fontSize: 32, fontWeight: 700 }}>{Z.solverTitle}</p>
              {Z.solvers.map((name, i) => {
                const hot = i === 0;
                const glow = hot && frame < click ? 0.5 + 0.5 * Math.sin(frame / 4) : 0;
                return (
                  <div key={name} style={{ position: "absolute", left: 20, right: 20, top: 430 - 106 + i * 106 + (hot ? 106 : i === 1 ? -106 : 0), height: 92, display: "flex", alignItems: "center", gap: 16, padding: "0 18px", borderRadius: 22, background: hot ? CREAM : "rgb(255 255 255 / 0.1)", color: hot ? INK : "#FFF", border: `2px solid ${hot ? YELLOW : "rgb(255 255 255 / 0.18)"}`, boxShadow: hot ? `0 0 0 ${4 + glow * 6}px rgb(234 179 8 / ${0.2 + 0.2 * glow})` : "none" }}>
                    <span style={{ display: "grid", placeItems: "center", width: 52, height: 52, borderRadius: 16, background: hot ? NIGHT : "rgb(255 255 255 / 0.12)" }}>
                      <Calculator size={26} color={YELLOW} />
                    </span>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 21, fontWeight: 800 }}>{name}</p>
                      {hot && <p style={{ margin: "2px 0 0", fontSize: 14, color: "#57534E" }}>q = 2 kN/m · l = 4 m</p>}
                    </div>
                    {hot && <span style={{ padding: "9px 14px", borderRadius: 14, background: YELLOW, color: NIGHT, fontSize: 15, fontWeight: 800 }}>{Z.open}</span>}
                  </div>
                );
              })}
            </div>
          </AppScreen>
        </AbsoluteFill>
      )}
      <Cursor keys={[{ at: back, x: 400, y: 640 }, { at: click, x: SOLVER_TILE.x + 120, y: SOLVER_TILE.y - 46, click: true }]} hideAt={click + 12} />
    </AbsoluteFill>
  );
}

const de2: CampScene[] = [
  {
    name: "Immersiver Modus — die Oberfläche verschwindet",
    span: 2,
    render: ({ f }) => <GoImmersive f={f} />,
    cues: ({ f }) => [{ at: f("Aktiviere"), kind: "click" as const, volume: 0.6 }, { at: f("verschwindet") - 4, kind: "whoosh" as const, volume: 0.35 }],
  },
  {
    name: "Solver anklicken — Ergebnis sofort",
    span: 2,
    enter: "fade",
    render: ({ f }) => <SolveNow f={f} />,
    cues: ({ f }) => {
      const click = Math.max(f("nutze") + 4, 40);
      return [{ at: click, kind: "click" as const, volume: 0.6 }, { at: click + 6, kind: "success" as const, volume: 0.4 }, { at: Math.max(f("verlässliche"), click + 40), kind: "pop" as const, volume: 0.45 }];
    },
  },
];

/* ═══ DE 3 — Die Fachschaft ═════════════════════════════════════════════ */

const SHARE = { x: 270, y: 596 };
const F = {
  group: ["Fachschaft", "Kommilitonen", "Freunde"],
  share: "Link teilen",
  shared: "Link geteilt",
  link: "tred-tutor.de",
  more: "Studierende machen mit",
  better: "Die KI wird besser",
  uni: "FH Aachen",
  uniSub: "University of Applied Sciences",
  tester: "Beta-Tester",
  feedback: "Dein Feedback",
  platform: "Die Lernplattform",
};

/** Un étudiant, dessiné simplement : une tête, des épaules. */
function Student({ x, y, size, color, k }: { x: number; y: number; size: number; color: string; k: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" style={{ position: "absolute", left: x - size / 2, top: y - size / 2, opacity: Math.min(1, k * 1.5), transform: `scale(${k})` }}>
      <circle cx={30} cy={30} r={29} fill={color} stroke="#0F172A" strokeWidth={2} />
      <circle cx={30} cy={23} r={10} fill="#0F172A" />
      <path d="M11 50 C13 37 22 34 30 34 C38 34 47 37 49 50 Z" fill="#0F172A" />
    </svg>
  );
}

const GROUPS = [
  { cx: 110, cy: 300, label: 0 },
  { cx: 270, cy: 350, label: 1 },
  { cx: 430, cy: 300, label: 2 },
];
const SPOTS = [
  [-34, -6],
  [34, -6],
  [0, 30],
];

/** Scène A : le groupe arrive, le curseur partage le lien, il part vers chacun. */
function ShareWithGroup({ f }: { f: CampCtx["f"] }) {
  const frame = useCurrentFrame();
  const at = [f("Fachschaft"), f("Kommilitonen"), f("Freunden")];
  const zeig = f("Zeig");
  const click = at[2] + 14;
  const shared = frame >= click + 3;
  return (
    <AppScreen bg={BG("architecture", 1)}>
      {GROUPS.map((g, gi) => {
        const k0 = pop(frame, at[gi]);
        // Le lien file du bouton vers le groupe.
        const fly = progress(frame, click + 4 + gi * 5, click + 20 + gi * 5);
        return (
          <div key={gi}>
            {SPOTS.map(([dx, dy], i) => (
              <Student key={i} x={g.cx + dx} y={g.cy + dy} size={58} color={(gi + i) % 2 ? CREAM : YELLOW} k={pop(frame, at[gi] + i * 3)} />
            ))}
            <span className="font-display" style={{ position: "absolute", left: g.cx - 90, width: 180, top: g.cy + 66, textAlign: "center", color: "#FFF", fontSize: 19, fontWeight: 700, opacity: Math.min(1, k0 * 1.5) }}>
              {F.group[g.label]}
            </span>
            {frame >= click + 4 + gi * 5 && fly < 1 && (
              <span style={{ position: "absolute", left: SHARE.x + (g.cx - SHARE.x) * fly - 16, top: SHARE.y + (g.cy - SHARE.y) * fly - 16, width: 32, height: 32, borderRadius: 16, display: "grid", placeItems: "center", background: YELLOW, boxShadow: "0 0 18px 4px rgb(234 179 8 / 0.6)" }}>
                <Link2 size={18} color={NIGHT} />
              </span>
            )}
            {fly >= 1 && (
              <span style={{ position: "absolute", left: g.cx + 22, top: g.cy - 58, width: 30, height: 30, borderRadius: 15, display: "grid", placeItems: "center", background: "#16A34A", border: "2px solid #0F172A", transform: `scale(${pop(frame, click + 20 + gi * 5)})` }}>
                <Check size={17} color="#FFF" strokeWidth={3} />
              </span>
            )}
          </div>
        );
      })}
      {/* Le lien de TRED et le bouton de partage. */}
      <div style={{ ...rise(frame, Math.max(2, zeig - 4)), position: "absolute", left: 40, right: 40, top: 500, padding: "16px 18px", borderRadius: 24, background: CREAM, color: INK, textAlign: "center", boxShadow: "0 40px 80px -30px rgb(0 0 0 / 0.95)" }}>
        <p style={{ margin: "0 0 12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 19, fontWeight: 700, fontFamily: "ui-monospace, monospace" }}>
          <Link2 size={19} color="#8A6D0B" /> {F.link}
        </p>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "13px 26px", borderRadius: 16, background: shared ? "#16A34A" : YELLOW, color: shared ? "#FFF" : NIGHT, fontSize: 19, fontWeight: 800 }}>
          {shared ? <Check size={20} strokeWidth={3} /> : <Copy size={20} />}
          {shared ? F.shared : F.share}
        </span>
      </div>
      <Cursor keys={[{ at: Math.max(2, at[0] - 6), x: 420, y: 660 }, { at: click, x: SHARE.x, y: SHARE.y, click: true }]} hideAt={click + 30} />
    </AppScreen>
  );
}

/** Scène B : plus il y a d'étudiants, meilleure est l'IA. */
function MoreStudents({ f }: { f: CampCtx["f"] }) {
  const frame = useCurrentFrame();
  const more = f("mehr");
  const better = f("besser");
  const n = 24;
  const grown = progress(frame, more, better + 10);
  const bar = progress(frame, better - 4, better + 26);
  return (
    <AppScreen bg={BG("architecture", 1)}>
      <p className="font-display" style={{ ...rise(frame, Math.max(2, more - 4)), position: "absolute", left: 24, right: 24, top: 150, margin: 0, textAlign: "center", color: "#FFF", fontSize: 30, fontWeight: 700 }}>
        <Users size={28} color={YELLOW} style={{ display: "inline", verticalAlign: "-4px", marginRight: 10 }} />
        {Math.round(3 + grown * 245)} {F.more}
      </p>
      <div style={{ position: "absolute", left: 42, top: 230, width: 456, height: 300 }}>
        {Array.from({ length: n }, (_, i) => (
          <Student key={i} x={38 + (i % 6) * 76} y={36 + Math.floor(i / 6) * 76} size={56} color={i % 3 === 0 ? YELLOW : CREAM} k={pop(frame, more + i * 2.2)} />
        ))}
      </div>
      <div style={{ position: "absolute", left: 40, right: 40, top: 590, opacity: progress(frame, better - 8, better) }}>
        <p style={{ margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8, color: "#FFF", fontSize: 20, fontWeight: 700 }}>
          <Sparkles size={20} color={YELLOW} /> {F.better}
        </p>
        <div style={{ height: 18, borderRadius: 9, background: "rgb(255 255 255 / 0.16)", overflow: "hidden" }}>
          <div style={{ width: `${18 + bar * 78}%`, height: "100%", borderRadius: 9, background: `linear-gradient(90deg, #CA8A04, ${YELLOW})`, boxShadow: "0 0 18px 2px rgb(234 179 8 / 0.5)" }} />
        </div>
      </div>
    </AppScreen>
  );
}

/** Scène C : ta Hochschule, ton badge de testeur, ton retour qui construit la plateforme. */
function BetaTester({ f }: { f: CampCtx["f"] }) {
  const frame = useCurrentFrame();
  const fb = f("Feedback");
  const platform = f("Lernplattform");
  const together = f("Zusammen");
  const uni = pop(frame, 4);
  const badge = pop(frame, Math.max(16, fb - 10));
  const line = progress(frame, fb + 4, platform);
  const built = pop(frame, platform);
  return (
    <AppScreen bg={BG("architecture", 1)}>
      {/* La Hochschule, telle que l'app l'affiche dans le profil : un monogramme, pas un logo. */}
      <div style={{ position: "absolute", left: 40, right: 40, top: 150, padding: "20px 20px", borderRadius: 26, background: CREAM, color: INK, display: "flex", alignItems: "center", gap: 16, opacity: Math.min(1, uni * 1.5), transform: `scale(${0.92 + 0.08 * uni})`, boxShadow: "0 40px 80px -30px rgb(0 0 0 / 0.95)" }}>
        <span className="font-display" style={{ display: "grid", placeItems: "center", width: 74, height: 74, borderRadius: 20, background: NIGHT, color: YELLOW, fontSize: 26, fontWeight: 800 }}>FH</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="font-display" style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>{F.uni}</p>
          <p style={{ margin: "2px 0 0", fontSize: 14, color: "#57534E" }}>{F.uniSub}</p>
        </div>
      </div>
      <span style={{ position: "absolute", right: 30, top: 126, display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 999, background: YELLOW, color: NIGHT, fontSize: 18, fontWeight: 800, border: "3px solid #0F172A", opacity: Math.min(1, badge * 1.5), transform: `scale(${badge}) rotate(${6 - 6 * Math.min(1, badge)}deg)`, boxShadow: "0 16px 30px -12px rgb(0 0 0 / 0.9)" }}>
        <BadgeCheck size={21} /> {F.tester}
      </span>
      {/* Le retour de l'étudiant construit la plateforme. */}
      <div style={{ position: "absolute", left: 40, top: 330, width: 460, height: 300 }}>
        <span style={{ ...rise(frame, fb), position: "absolute", left: 0, top: 0, display: "inline-flex", alignItems: "center", gap: 9, padding: "13px 18px", borderRadius: "20px 20px 20px 6px", background: YELLOW, color: NIGHT, fontSize: 20, fontWeight: 800 }}>
          <MessageSquareText size={21} /> {F.feedback}
        </span>
        <svg width={460} height={300} style={{ position: "absolute", inset: 0 }}>
          <path d="M70 62 C 70 150, 300 110, 330 196" fill="none" stroke={YELLOW} strokeWidth={4} strokeLinecap="round" strokeDasharray={420} strokeDashoffset={420 * (1 - line)} />
        </svg>
        <div style={{ position: "absolute", right: 0, top: 190, width: 280, padding: "16px 18px", borderRadius: 22, background: "rgb(255 255 255 / 0.12)", border: `2px solid ${YELLOW}`, color: "#FFF", opacity: Math.min(1, built * 1.5), transform: `scale(${0.9 + 0.1 * built})`, backdropFilter: "blur(12px)" }}>
          <p className="font-display" style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 700 }}>{F.platform}</p>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ height: 12, borderRadius: 6, marginTop: 8, background: "rgb(255 255 255 / 0.16)", overflow: "hidden" }}>
              <div style={{ width: `${progress(frame, platform + 6 + i * 6, together + i * 6) * (92 - i * 14)}%`, height: "100%", background: YELLOW, borderRadius: 6 }} />
            </div>
          ))}
        </div>
      </div>
    </AppScreen>
  );
}

const de3: CampScene[] = [
  {
    name: "Fachschaft, Kommilitonen, Freunde — Link teilen",
    span: 2,
    render: ({ f }) => <ShareWithGroup f={f} />,
    cues: ({ f }) => [
      ...["Fachschaft", "Kommilitonen", "Freunden"].map((x) => ({ at: f(x), kind: "pop" as const, volume: 0.4 })),
      { at: f("Freunden") + 14, kind: "click" as const, volume: 0.6 },
      { at: f("Freunden") + 36, kind: "success" as const, volume: 0.4 },
    ],
  },
  {
    name: "Je mehr Studierende, desto besser die KI",
    enter: "slide",
    render: ({ f }) => <MoreStudents f={f} />,
    cues: ({ f }) => [...[0, 8, 16, 24].map((d) => ({ at: f("mehr") + d, kind: "pop" as const, volume: 0.22 })), { at: f("besser"), kind: "success" as const, volume: 0.35 }],
  },
  {
    name: "FH Aachen — Beta-Tester — Feedback baut die Plattform",
    span: 2,
    enter: "fade",
    render: ({ f }) => <BetaTester f={f} />,
    cues: ({ f }) => [{ at: Math.max(16, f("Feedback") - 10), kind: "pop" as const, volume: 0.45 }, { at: f("Lernplattform"), kind: "success" as const, volume: 0.4 }],
  },
];

/* ═══ Les 6 compositions ════════════════════════════════════════════════ */

const INTRO: Record<string, ReactNode> = {
  en1: <>The {mark("Research")}.</>,
  en2: <>The {mark("Workflow")}.</>,
  en3: <>Built {mark("with you")}.</>,
  de1: <>Die {mark("Altklausur")}-Suche.</>,
  de2: <>{mark("Deep Work")}.</>,
  de3: <>Die {mark("Fachschaft")}.</>,
};

const OUTRO: Record<string, Outro> = {
  en1: { tagline: <>Studying, {mark("a whole lot faster")}.</>, sub: "Exact page · exact paragraph · in context", word: "Studying" },
  en2: { tagline: <>A private tutor, {mark("on demand")}.</>, sub: "Explain as video · saved to your dashboard", word: "tutor" },
  en3: { tagline: <>Your feedback {mark("shapes V2")}.</>, sub: "Join the beta · invite your friends", word: "shapes" },
  de1: { tagline: <>Perfekt auf die Prüfung {mark("vorbereitet")}.</>, sub: "Altklausur · Aufgabe · Lösung an der Tafel", word: "perfekt" },
  de2: { tagline: <>Lerne mit {mark("voller Konzentration")}.</>, sub: "Immersiver Modus · deterministische Solver", word: "voller" },
  de3: { tagline: <>Zusammen machen wir das Studium {mark("einfacher")}.</>, sub: "Starte jetzt · teile deine Erfahrungen", word: "Starte" },
};

type Vo = Parameters<typeof CampaignVideo>[0]["vo"];
const video = (key: keyof typeof INTRO, vo: Vo, voice: string, music: string, scenes: CampScene[]) => (
  <CampaignVideo vo={vo} voice={voice} music={music} scenes={scenes} outro={OUTRO[key]} outroSpan={1} maxGap={V4_MAX_GAP} intro={{ title: INTRO[key] }} />
);

export const V4En1 = () => video("en1", voEn1, voiceEn1, music1, en1);
export const V4En2 = () => video("en2", voEn2, voiceEn2, music2, en2);
export const V4En3 = () => video("en3", voEn3, voiceEn3, music3, en3);
export const V4De1 = () => video("de1", voDe1, voiceDe1, music4, de1);
export const V4De2 = () => video("de2", voDe2, voiceDe2, music5, de2);
export const V4De3 = () => video("de3", voDe3, voiceDe3, music6, de3);

export const V4_IDS = [
  ["V4-EN-1-The-Research", V4En1],
  ["V4-EN-2-The-Workflow", V4En2],
  ["V4-EN-3-The-Expansion", V4En3],
  ["V4-DE-1-Die-Altklausur-Suche", V4De1],
  ["V4-DE-2-Deep-Work", V4De2],
  ["V4-DE-3-Die-Fachschaft", V4De3],
] as const;

