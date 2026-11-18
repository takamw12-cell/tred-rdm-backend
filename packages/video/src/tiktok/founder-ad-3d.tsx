import type { CSSProperties, ReactNode } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { AbsoluteFill, Easing, OffthreadVideo, interpolate, useCurrentFrame } from "remotion";

// Mêmes mesures et mêmes courbes que le reste de la campagne (./kit), recopiées ici :
// le gabarit ne dépend d'aucun fichier de campagne et se rend seul.
const FPS = 30;
const W = 540;
const H = 960;
const s = (sec: number) => Math.round(sec * FPS);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const easeOut = Easing.bezier(0.33, 1, 0.68, 1);
const easeInOut = Easing.inOut(Easing.cubic);
/** 0 → 1 entre deux images, adouci. */
const progress = (frame: number, start: number, end: number, easing: (n: number) => number = easeOut) => interpolate(frame, [start, end], [0, 1], { ...clamp, easing });

/**
 * Gabarit « FounderAd3D » (18 nov. 2026) — TikTok / Reels, 540 × 960 px CSS,
 * rendu en `--scale=2` → 1080 × 1920.
 *
 *   ┌──────────────────────────┐
 *   │  haut, 60 % : fond gris   │   trois cartes de l'app en verre dépoli,
 *   │  clair, cartes flottantes │   en perspective : Lernprofil → Tafel → citation PDF
 *   ├──── sous-titres ─────────┤   à cheval sur la jointure, au centre de l'image
 *   │  bas, 40 % : face caméra  │   rectangle noir tant qu'aucun clip n'est donné
 *   └──────────────────────────┘
 *
 * La 3D est en CSS pur (`perspective`, `rotateX/Y`, `translateZ`), pilotée
 * image par image par `useCurrentFrame()`. Pas de WebGL, et PAS Framer
 * Motion : ses animations suivent l'horloge du navigateur, alors que Remotion
 * rend chaque image séparément — le résultat sauterait d'un rendu à l'autre.
 * Les mêmes courbes (ressort amorti, ease-in-out) sont reproduites ici.
 *
 * Ce que montrent les cartes existe dans l'app : le plan de « Mein Lernprofil »,
 * la Tafel et ses étapes, la citation avec sa page. La pastille « Mit SymPy
 * geprüft » suit `proofBadge` (vrai dans la composition depuis que le serveur
 * vérifie réellement, 18 nov. 2026 — api/lib/sympy-verify.ts). À ne publier
 * qu'une fois la ligne « [sympy] vérification symbolique active » vue en
 * production : une publicité ne montre que ce qui est en ligne.
 */

export const FOUNDER_AD_FRAMES = s(15);

export interface FounderAdCaption {
  /** Secondes depuis le début. */
  from: number;
  to: number;
  text: string;
  /** Mots à surligner en jaune. */
  accent?: string[];
}

export interface FounderAd3DProps {
  /** Clip face caméra (URL ou fichier statique). Absent : rectangle noir et silhouette. */
  faceCamSrc?: string | null;
  captions?: FounderAdCaption[];
  /** Pastille « Mit SymPy geprüft » sur la Tafel — à n'activer que quand la vérification existe. */
  proofBadge?: boolean;
}

export const FOUNDER_AD_CAPTIONS: FounderAdCaption[] = [
  { from: 0.4, to: 4.8, text: "Dein Lernplan. Aus deinen Skripten.", accent: ["Lernplan."] },
  { from: 5.2, to: 9.8, text: "Die Tafel rechnet Schritt für Schritt.", accent: ["Schritt", "für", "Schritt."] },
  { from: 10.2, to: 14.6, text: "Mit Seitenangabe aus deinem PDF.", accent: ["Seitenangabe"] },
];

/* ── Mise en page ───────────────────────────────────────────────────────── */

const TOP_H = Math.round(H * 0.6); // 576
const INK = "#0F172A";
const CREAM = "#FDFBF7";
const YELLOW = "#EAB308";
const GREEN = "#16A34A";
const FONT = 'Inter, "SF Pro Display", system-ui, sans-serif';

/** Les trois scènes : début et fin (secondes), avec 0,8 s de fondu enchaîné. */
const SCENES = [
  { from: 0, to: 5 },
  { from: 5, to: 10 },
  { from: 10, to: 15 },
] as const;
const CROSS = s(0.8);

/** Ressort amorti : 0 → 1 avec un très léger dépassement (l'entrée « Apple »). */
function springIn(frame: number, start: number, frames = 26): number {
  const t = Math.min(1, Math.max(0, (frame - start) / frames));
  return 1 - Math.exp(-6.2 * t) * Math.cos(t * Math.PI * 1.15) * (1 - t * 0.15);
}

/* ── Le verre ───────────────────────────────────────────────────────────── */

const glass: CSSProperties = {
  borderRadius: 26,
  background: "linear-gradient(145deg, rgba(255,255,255,0.86), rgba(255,255,255,0.62))",
  border: "1px solid rgba(255,255,255,0.95)",
  boxShadow: [
    "0 1px 0 rgba(255,255,255,0.9) inset",
    "0 -1px 0 rgba(15,23,42,0.04) inset",
    "0 2px 4px rgba(15,23,42,0.04)",
    "0 12px 24px rgba(15,23,42,0.08)",
    "0 36px 70px rgba(15,23,42,0.16)",
  ].join(", "),
  backdropFilter: "blur(18px) saturate(1.3)",
  overflow: "hidden",
};

/**
 * Une carte dans l'espace : elle arrive de la droite en tournant, flotte, puis
 * part vers la gauche en s'enfonçant. `index` décale la respiration de chacune.
 */
function FloatingCard({ scene, index, children }: { scene: { from: number; to: number }; index: number; children: ReactNode }) {
  const frame = useCurrentFrame();
  const start = s(scene.from);
  const end = s(scene.to);
  const first = index === 0;
  const last = index === SCENES.length - 1;

  const enter = first ? springIn(frame, start + 4, 30) : springIn(frame, start - CROSS / 2, 30);
  const exit = last ? 0 : progress(frame, end - CROSS / 2, end + CROSS / 2, easeInOut);
  if (frame < start - CROSS || frame > end + CROSS) return null;

  const t = (frame + index * 37) / FPS;
  // Flottement : deux sinusoïdes lentes, jamais synchrones.
  const floatY = Math.sin(t * 1.15) * 7;
  const tiltX = 7 + Math.sin(t * 0.8) * 2.2;
  const tiltY = -13 + Math.cos(t * 0.65) * 3.5;

  const x = (1 - enter) * 300 - exit * 330;
  const z = (1 - enter) * -260 - exit * 320;
  const rotY = tiltY + (1 - enter) * -38 + exit * 42;
  const opacity = Math.min(1, enter * 1.4) * (1 - exit);
  const blur = (1 - Math.min(1, enter)) * 10 + exit * 12;

  return (
    <div
      style={{
        position: "absolute",
        left: 44,
        right: 44,
        top: 92,
        height: 372,
        transformStyle: "preserve-3d",
        transform: `translate3d(${x}px, ${floatY}px, ${z}px) rotateX(${tiltX}deg) rotateY(${rotY}deg)`,
        opacity,
        filter: blur > 0.3 ? `blur(${blur}px)` : undefined,
      }}
    >
      {/* Le reflet qui glisse sur le verre quand la carte tourne. */}
      <div style={{ ...glass, position: "absolute", inset: 0 }}>
        {children}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: `linear-gradient(${112 + rotY * 1.4}deg, rgba(255,255,255,0) 38%, rgba(255,255,255,0.42) 50%, rgba(255,255,255,0) 62%)`,
            transform: `translateX(${(rotY + 13) * 9}px)`,
            mixBlendMode: "soft-light",
          }}
        />
      </div>
      {/* L'ombre portée, posée plus bas dans l'espace. */}
      <div
        style={{
          position: "absolute",
          left: 34,
          right: 34,
          bottom: -46,
          height: 34,
          borderRadius: "50%",
          background: "rgba(15,23,42,0.22)",
          filter: "blur(22px)",
          transform: "translateZ(-80px)",
          opacity: 0.75 - Math.abs(floatY) * 0.02,
        }}
      />
    </div>
  );
}

function CardHeader({ title, tag }: { title: string; tag: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 22px 12px" }}>
      <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.3, color: INK }}>{title}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(15,23,42,0.55)", padding: "5px 10px", borderRadius: 99, background: "rgba(15,23,42,0.06)" }}>{tag}</div>
    </div>
  );
}

/* ── Carte 1 : « Mein Lernprofil » et son plan ──────────────────────────── */

const PLAN = [
  { topic: "Entropie und zweiter Hauptsatz", source: "Thermo_Kapitel_3 · S. 12", minutes: 10, level: 0.34 },
  { topic: "Kreisprozesse", source: "Thermo_Kapitel_3 · S. 27", minutes: 10, level: 0.52 },
  { topic: "Wirkungsgrad", source: "Thermo_Kapitel_4 · S. 3", minutes: 5, level: 0.71 },
];

function LernprofilCard({ start }: { start: number }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ fontFamily: FONT, color: INK }}>
      <CardHeader title="Mein Lernprofil" tag="Heute · 25 Min" />
      <div style={{ padding: "0 22px", display: "flex", gap: 8 }}>
        {["Stärke: Bilanzen", "Lücke: Entropie"].map((chip, i) => (
          <div
            key={chip}
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              padding: "6px 11px",
              borderRadius: 99,
              background: i === 0 ? "rgba(22,163,74,0.12)" : "rgba(234,179,8,0.2)",
              color: i === 0 ? "#166534" : "#854D0E",
              opacity: progress(frame, start + 14 + i * 5, start + 26 + i * 5),
            }}
          >
            {chip}
          </div>
        ))}
      </div>
      <div style={{ padding: "16px 22px 0", display: "flex", flexDirection: "column", gap: 11 }}>
        {PLAN.map((row, i) => {
          const at = start + 24 + i * 10;
          const appear = springIn(frame, at, 20);
          const fill = progress(frame, at + 8, at + 40, easeInOut) * row.level;
          return (
            <div
              key={row.topic}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 13px",
                borderRadius: 16,
                background: "rgba(255,255,255,0.78)",
                border: "1px solid rgba(15,23,42,0.06)",
                opacity: Math.min(1, appear * 1.3),
                transform: `translateY(${(1 - appear) * 16}px)`,
              }}
            >
              <div style={{ width: 30, height: 30, borderRadius: 10, background: INK, color: CREAM, display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700 }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 650, letterSpacing: -0.1 }}>{row.topic}</div>
                <div style={{ fontSize: 11, color: "rgba(15,23,42,0.55)", marginTop: 2 }}>{row.source}</div>
                <div style={{ marginTop: 7, height: 5, borderRadius: 99, background: "rgba(15,23,42,0.08)" }}>
                  <div style={{ width: `${fill * 100}%`, height: "100%", borderRadius: 99, background: YELLOW }} />
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 650, color: "rgba(15,23,42,0.7)" }}>{row.minutes} Min</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Carte 2 : la Tafel, la dérivée de x² ───────────────────────────────── */

const tex = (source: string) => katex.renderToString(source, { throwOnError: false, displayMode: true });
const STEPS = [
  { label: "Funktion", html: tex("f(x) = x^{2}") },
  { label: "Differenzenquotient", html: tex("\\dfrac{(x+h)^{2}-x^{2}}{h} = 2x + h") },
  { label: "Grenzwert h → 0", html: tex("f'(x) = 2x") },
];

function ProofBadge({ opacity }: { opacity: number }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 11px 5px 8px",
        borderRadius: 99,
        background: "rgba(22,163,74,0.16)",
        border: "1px solid rgba(74,222,128,0.5)",
        color: "#BBF7D0",
        fontSize: 11.5,
        fontWeight: 650,
        opacity,
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
      Mit SymPy geprüft
    </div>
  );
}

function TafelCard({ start, proofBadge }: { start: number; proofBadge: boolean }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: "absolute", inset: 0, fontFamily: FONT, background: "linear-gradient(160deg, #1F4D3C, #163A2D)", color: "#F4F1E8" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 22px 6px" }}>
        <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.3 }}>Tafel</div>
        <div style={{ fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 99, background: "rgba(244,241,232,0.12)", color: "rgba(244,241,232,0.8)" }}>Ableitung von x²</div>
      </div>
      <div style={{ padding: "8px 22px 0", display: "flex", flexDirection: "column", gap: 13 }}>
        {STEPS.map((step, i) => {
          const at = start + 18 + i * 30;
          const write = progress(frame, at, at + 22, easeOut);
          const final = i === STEPS.length - 1;
          return (
            <div key={step.label} style={{ opacity: Math.min(1, write * 1.5), transform: `translateY(${(1 - write) * 10}px)` }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.2, color: "rgba(244,241,232,0.6)", marginBottom: 5 }}>{step.label}</div>
              <div
                style={{
                  fontSize: final ? 30 : 20,
                  margin: 0,
                  color: final ? "#FDE68A" : "#F4F1E8",
                  // La craie s'écrit de gauche à droite.
                  clipPath: `inset(0 ${(1 - write) * 100}% 0 0)`,
                  textAlign: "left",
                }}
                className="founder-ad-tex"
                // eslint-disable-next-line react/no-danger -- sortie de KaTeX, à partir de formules écrites ici
                dangerouslySetInnerHTML={{ __html: step.html }}
              />
            </div>
          );
        })}
      </div>
      {proofBadge ? (
        <div style={{ position: "absolute", left: 22, bottom: 18 }}>
          <ProofBadge opacity={progress(frame, start + 100, start + 114)} />
        </div>
      ) : null}
      {/* Le rebord de la Tafel. */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 7, background: "rgba(0,0,0,0.25)" }} />
    </div>
  );
}

/* ── Carte 3 : la citation, avec sa page ────────────────────────────────── */

function CitationCard({ start }: { start: number }) {
  const frame = useCurrentFrame();
  const mark = progress(frame, start + 30, start + 56, easeInOut);
  const badge = springIn(frame, start + 58, 18);
  const lines = [0.92, 0.78, 1, 0.86, 0.95, 0.7, 0.9, 0.55];
  return (
    <div style={{ fontFamily: FONT, color: INK }}>
      <CardHeader title="Antwort mit Quelle" tag="aus deinem PDF" />
      <div style={{ padding: "0 22px", fontSize: 14.5, lineHeight: 1.5, fontWeight: 500 }}>
        Die Entropie eines abgeschlossenen Systems{" "}
        <span style={{ backgroundImage: `linear-gradient(${YELLOW}66, ${YELLOW}66)`, backgroundRepeat: "no-repeat", backgroundSize: `${mark * 100}% 100%`, borderRadius: 4, padding: "1px 2px" }}>nimmt niemals ab</span>.
      </div>
      <div
        style={{
          margin: "12px 22px 0",
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          padding: "7px 12px",
          borderRadius: 12,
          background: "rgba(255,255,255,0.85)",
          border: "1px solid rgba(15,23,42,0.1)",
          fontSize: 12.5,
          fontWeight: 650,
          opacity: Math.min(1, badge * 1.4),
          transform: `scale(${0.86 + badge * 0.14})`,
          transformOrigin: "left center",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
          <path d="M14 2v5h6M9 13h6M9 17h4" />
        </svg>
        Thermo_Kapitel_3 · S. 12
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12 5 5L20 7" />
        </svg>
      </div>
      {/* La page du PDF, avec la phrase surlignée. */}
      <div style={{ margin: "14px 22px 0", padding: "14px 16px", borderRadius: 14, background: "#FFFFFF", border: "1px solid rgba(15,23,42,0.08)", boxShadow: "0 6px 16px rgba(15,23,42,0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 600, color: "rgba(15,23,42,0.45)", marginBottom: 9 }}>
          <span>Thermo_Kapitel_3.pdf</span>
          <span>Seite 12</span>
        </div>
        {lines.map((w, i) => (
          <div key={i} style={{ position: "relative", height: 7, marginBottom: 9 }}>
            <div style={{ width: `${w * 100}%`, height: "100%", borderRadius: 4, background: "rgba(15,23,42,0.12)" }} />
            {i === 2 ? <div style={{ position: "absolute", left: -3, top: -3, height: 13, width: `${mark * 72}%`, borderRadius: 4, background: `${YELLOW}88` }} /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Sous-titres : au centre de l'image, sur la jointure ────────────────── */

function Captions({ captions }: { captions: FounderAdCaption[] }) {
  const frame = useCurrentFrame();
  const current = captions.find((c) => frame >= s(c.from) && frame < s(c.to));
  if (!current) return null;
  const from = s(current.from);
  const to = s(current.to);
  const words = current.text.split(" ");
  // Toute la phrase est posée, estompée ; chaque mot s'allume à son tour (deux premiers tiers de la durée).
  const perWord = ((to - from) * 0.62) / words.length;
  const out = progress(frame, to - 6, to);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: TOP_H - 46, display: "flex", justifyContent: "center", padding: "0 26px", opacity: 1 - out }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "2px 8px",
          padding: "13px 20px",
          borderRadius: 22,
          background: "rgba(10,12,18,0.82)",
          border: "1px solid rgba(255,255,255,0.14)",
          boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
          backdropFilter: "blur(14px)",
          fontFamily: FONT,
          fontSize: 25,
          fontWeight: 800,
          letterSpacing: -0.5,
          lineHeight: 1.18,
          textAlign: "center",
        }}
      >
        {words.map((word, i) => {
          const at = from + i * perWord;
          const inn = springIn(frame, at, 9);
          const accent = current.accent?.includes(word);
          return (
            <span key={`${word}-${i}`} style={{ display: "inline-block", color: accent ? "#FACC15" : "#FFFFFF", opacity: 0.22 + 0.78 * Math.min(1, inn * 1.6), transform: `translateY(${(1 - inn) * 4}px) scale(${0.96 + inn * 0.04})` }}>
              {word}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ── Le bas : face caméra, ou son emplacement ───────────────────────────── */

function FaceCam({ src }: { src?: string | null }) {
  const frame = useCurrentFrame();
  if (src) {
    return <OffthreadVideo src={src} style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
  }
  const breathe = 1 + Math.sin(frame / 22) * 0.012;
  return (
    <div style={{ position: "absolute", inset: 0, background: "#000000", display: "grid", placeItems: "center" }}>
      <div style={{ position: "absolute", inset: 14, borderRadius: 22, border: "1.5px dashed rgba(255,255,255,0.22)" }} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginTop: 26, transform: `scale(${breathe})` }}>
        {/* Silhouette : une tête et des épaules, pour cadrer le visage. */}
        <svg width="150" height="170" viewBox="0 0 150 170" fill="none">
          <circle cx="75" cy="58" r="40" fill="rgba(255,255,255,0.13)" />
          <path d="M5 170c0-40 31-66 70-66s70 26 70 66z" fill="rgba(255,255,255,0.13)" />
        </svg>
        <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, letterSpacing: 3, color: "rgba(255,255,255,0.5)" }}>FACE CAM</div>
        <div style={{ fontFamily: FONT, fontSize: 11, color: "rgba(255,255,255,0.32)" }}>1080 × 768 · Augen auf dieser Höhe</div>
      </div>
    </div>
  );
}

/* ── La composition ─────────────────────────────────────────────────────── */

export function FounderAd3D({ faceCamSrc = null, captions = FOUNDER_AD_CAPTIONS, proofBadge = false }: FounderAd3DProps) {
  const frame = useCurrentFrame();
  // La lumière du fond dérive lentement : le gris n'est jamais plat.
  const glowX = interpolate(frame, [0, FOUNDER_AD_FRAMES], [28, 68], clamp);
  return (
    <AbsoluteFill style={{ background: "#000000" }}>
      <style>{`.founder-ad-tex .katex-display{margin:0;text-align:left}.founder-ad-tex .katex-display>.katex{text-align:left}`}</style>
      {/* Haut, 60 % : la scène. */}
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: TOP_H, overflow: "hidden", background: "linear-gradient(180deg, #F5F6F8 0%, #E9EBEF 62%, #DFE2E7 100%)" }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(520px 380px at ${glowX}% 18%, rgba(255,255,255,0.95), rgba(255,255,255,0) 70%)` }} />
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(420px 260px at 50% 104%, rgba(15,23,42,0.10), rgba(15,23,42,0) 70%)" }} />
        {/* Le nom, discret, en haut. */}
        <div style={{ position: "absolute", top: 34, left: 0, right: 0, textAlign: "center", fontFamily: FONT, fontSize: 15, fontWeight: 800, letterSpacing: 5, color: "rgba(15,23,42,0.72)" }}>TRED</div>
        <div style={{ position: "absolute", inset: 0, perspective: 1100, perspectiveOrigin: "50% 42%" }}>
          <FloatingCard scene={SCENES[0]} index={0}>
            <LernprofilCard start={s(SCENES[0].from)} />
          </FloatingCard>
          <FloatingCard scene={SCENES[1]} index={1}>
            <TafelCard start={s(SCENES[1].from)} proofBadge={proofBadge} />
          </FloatingCard>
          <FloatingCard scene={SCENES[2]} index={2}>
            <CitationCard start={s(SCENES[2].from)} />
          </FloatingCard>
        </div>
      </div>
      {/* Bas, 40 % : la face caméra. */}
      <div style={{ position: "absolute", left: 0, top: TOP_H, width: W, height: H - TOP_H, overflow: "hidden", background: "#000000" }}>
        <FaceCam src={faceCamSrc} />
      </div>
      <Captions captions={captions} />
    </AbsoluteFill>
  );
}
