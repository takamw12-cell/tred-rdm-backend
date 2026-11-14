import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from "remotion";
import { Logo } from "@/components/logo";
import { FPS, GOLD, H, INK, NIGHT, ORANGE, W, clamp, easeInOut, pop, progress } from "./kit";

/* ── La Tafel : une caméra sur une capture de la vraie interface ──────── */

/**
 * Les captures de la campagne sont prises dans une fenêtre VERTICALE de
 * 1000 × 1778 px CSS (scripts/cinematic-captures.mjs, CINE_VIEWPORT=1000x1778,
 * CINE_SCALE=2.5, --dark) : l'app y prend sa mise en page « tablette », sans
 * barre latérale, et toute une réponse de la Tafel tient sur un écran 9:16.
 * Une capture entière remplit donc exactement le cadre de la vidéo. Tous les
 * repères ci-dessous sont en px CSS de cette fenêtre.
 */
export const CAP_W = 1000;
export const CAP_H = 1778;

/** Un cadrage : centre (x, y) et largeur visible `w`, à l'image `at` de la scène. */
export type Cam = { at: number; x: number; y: number; w: number };
/** Une bande horizontale du tableau qui « s'écrit » de gauche à droite à partir de `at`. */
export type Band = { y0: number; y1: number; at: number; frames?: number };

/**
 * La capture, cadrée par une caméra animée. Avec `bands`, le tableau commence
 * flou et sombre ; chaque bande devient nette de gauche à droite, comme la
 * Tafel de l'app qui s'écrit pas à pas.
 */
export function TafelCam({
  src,
  cams,
  bands,
  width = W,
  height = H,
  from = 0,
  free = false,
}: {
  src: string;
  cams: Cam[];
  bands?: Band[];
  width?: number;
  height?: number;
  from?: number;
  /** La caméra peut dépasser le bas de la capture (pour centrer un bouton du bas de l'écran). */
  free?: boolean;
}) {
  const frame = useCurrentFrame() - from;
  const at = cams.map((c) => c.at);
  const pick = (key: "x" | "y" | "w") => (cams.length === 1 ? cams[0][key] : interpolate(frame, at, cams.map((c) => c[key]), { ...clamp, easing: easeInOut }));
  const w = pick("w");
  const scale = width / w;
  const viewH = height / scale;
  // La caméra ne sort pas de la capture (sauf vers le bas, si `free`).
  const x = Math.min(CAP_W - w / 2, Math.max(w / 2, pick("x")));
  const y = free ? Math.max(viewH / 2, pick("y")) : Math.min(CAP_H - viewH / 2, Math.max(viewH / 2, pick("y")));
  const layer: CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    width: CAP_W,
    height: CAP_H,
    maxWidth: "none",
    transformOrigin: "0 0",
    transform: `translate(${width / 2 - x * scale}px, ${height / 2 - y * scale}px) scale(${scale})`,
  };
  const path = bands
    ?.map((b) => {
      const k = progress(frame, b.at, b.at + (b.frames ?? 16));
      return k <= 0 ? "" : `M0 ${b.y0} H${CAP_W * k} V${b.y1} H0 Z`;
    })
    .join(" ");
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: NIGHT }}>
      <Img src={src} style={{ ...layer, ...(bands ? { filter: "blur(7px) brightness(0.5) saturate(0.55)" } : {}) }} />
      {bands && path && path.trim() && <Img src={src} style={{ ...layer, clipPath: `path('${path}')` }} />}
    </div>
  );
}

/** Un rectangle de la capture, cerclé d'orange (la question, un bouton) : même caméra que la capture. */
export function CamRing({ cam, rect, width = W, height = H, at, radius = 8 }: { cam: Cam; rect: [number, number, number, number]; width?: number; height?: number; at: number; radius?: number }) {
  const frame = useCurrentFrame();
  const scale = width / cam.w;
  const k = pop(frame, at, 12);
  if (frame < at) return null;
  const [rx, ry, rw, rh] = rect;
  const pulse = 1 + 0.35 * Math.sin(((frame - at) / FPS) * Math.PI * 3);
  return (
    <div
      style={{
        position: "absolute",
        left: width / 2 + (rx - cam.x) * scale - 5,
        top: height / 2 + (ry - cam.y) * scale - 5,
        width: rw * scale + 10,
        height: rh * scale + 10,
        borderRadius: radius,
        border: `3px solid ${ORANGE}`,
        boxShadow: `0 0 ${14 * pulse}px ${3 * pulse}px rgb(255 87 34 / 0.55)`,
        opacity: Math.min(1, k * 1.4),
        transform: `scale(${1.25 - 0.25 * k})`,
      }}
    />
  );
}

/* ── Le Skript qui défile ─────────────────────────────────────────────── */

const PAGE_H = 566;
const PAGE_GAP = 22;
const rnd = (seed: number) => {
  const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

function ScriptPage({ n }: { n: number }) {
  const bars: ReactNode[] = [];
  let y = 74;
  for (let i = 0; y < PAGE_H - 70; i++) {
    const r = rnd(n * 31 + i);
    if (r > 0.86) {
      // Une formule, centrée.
      bars.push(<div key={i} style={{ position: "absolute", top: y + 6, left: 110, width: 150 + rnd(n + i) * 60, height: 13, borderRadius: 4, background: "#1f2540", opacity: 0.75 }} />);
      y += 40;
    } else if (r > 0.78 && y < PAGE_H - 200) {
      // Une figure.
      bars.push(<div key={i} style={{ position: "absolute", top: y + 4, left: 70, width: 260, height: 92, borderRadius: 6, border: "2px solid rgb(31 37 64 / 0.4)", background: "rgb(31 37 64 / 0.06)" }} />);
      y += 112;
    } else {
      bars.push(<div key={i} style={{ position: "absolute", top: y, left: 34, width: 190 + rnd(n * 7 + i * 3) * 142, height: 7, borderRadius: 3, background: "#1f2540", opacity: 0.6 }} />);
      y += 17;
    }
  }
  return (
    <div style={{ position: "relative", width: 400, height: PAGE_H, borderRadius: 4, background: "#F4F1E8", boxShadow: "0 18px 40px -18px rgb(0 0 0 / 0.8)" }}>
      <div style={{ position: "absolute", top: 30, left: 34, width: 210, height: 15, borderRadius: 4, background: "#1f2540", opacity: 0.85 }} />
      <div style={{ position: "absolute", top: 54, left: 34, right: 34, height: 2, background: "rgb(31 37 64 / 0.25)" }} />
      {bars}
      <div style={{ position: "absolute", bottom: 20, right: 34, fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: "rgb(31 37 64 / 0.6)" }}>Seite {n} / 80</div>
    </div>
  );
}

/**
 * Quatre-vingts pages de Skript qui défilent de plus en plus vite, floues dans
 * le sens du mouvement. Rien n'est lisible : c'est le but.
 */
export function PdfScroll({ dur, pages = 80 }: { dur: number; pages?: number }) {
  const frame = useCurrentFrame();
  const u = Math.min(1, frame / dur);
  // La distance parcourue accélère : on finit sur la dernière page.
  const total = (pages - 1.4) * (PAGE_H + PAGE_GAP);
  const dist = total * (0.12 * u + 0.88 * u * u);
  const speed = (total * (0.12 + 1.76 * u)) / (dur / FPS); // px par seconde
  const blur = Math.min(7, speed / 900);
  const first = Math.floor(dist / (PAGE_H + PAGE_GAP));
  const counter = Math.min(pages, 1 + Math.round((pages - 1) * (0.12 * u + 0.88 * u * u)));
  return (
    <AbsoluteFill style={{ background: NIGHT, overflow: "hidden" }}>
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <filter id="scroll-blur" x="-5%" y="-20%" width="110%" height="140%">
            <feGaussianBlur stdDeviation={`0.4 ${blur}`} />
          </filter>
        </defs>
      </svg>
      <div style={{ position: "absolute", left: 70, top: 0, width: 400, height: H, filter: "url(#scroll-blur)", transform: `rotate(-1.5deg) scale(1.06)` }}>
        {[-1, 0, 1, 2].map((k) => {
          const n = first + k;
          if (n < 0 || n >= pages) return null;
          return (
            <div key={n} style={{ position: "absolute", top: 170 + n * (PAGE_H + PAGE_GAP) - dist }}>
              <ScriptPage n={n + 1} />
            </div>
          );
        })}
      </div>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgb(10 14 39 / 0.92) 0%, rgb(10 14 39 / 0) 26%, rgb(10 14 39 / 0) 60%, rgb(10 14 39 / 0.88) 100%)" }} />
      {/* Le compteur de pages, dans la zone sûre. */}
      <div style={{ position: "absolute", right: 34, top: 300, padding: "8px 14px", borderRadius: 12, background: "rgb(5 8 25 / 0.82)", border: `2px solid ${GOLD}`, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 700, fontSize: 24, color: "#FFFFFF" }}>
        {String(counter).padStart(2, "0")} <span style={{ color: "rgb(255 255 255 / 0.55)" }}>/ {pages}</span>
      </div>
    </AbsoluteFill>
  );
}

/* ── Le compresseur d'un turboréacteur (schéma animé) ─────────────────── */

const CX0 = 46;
const CX1 = 494;
const CY = 352;
/** Demi-hauteur du carter et du moyeu le long du compresseur : la veine se resserre. */
const casing = (u: number) => 132 - 52 * u;
const hub = (u: number) => 26 + 44 * u;
const STAGES = [0.14, 0.31, 0.48, 0.65, 0.82];
const SPAN = CX1 - CX0;
/** Le contour du moyeu : le dessus de gauche à droite, puis le dessous au retour. */
const HUB_PATH = (() => {
  const top = Array.from({ length: 21 }, (_, i) => `${CX0 + SPAN * (i / 20)} ${CY - hub(i / 20)}`);
  const bottom = Array.from({ length: 21 }, (_, i) => `${CX0 + SPAN * (1 - i / 20)} ${CY + hub(1 - i / 20)}`);
  return `M${[...top, ...bottom].join(" L")} Z`;
})();
const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
/** Du bleu froid de l'entrée à l'orange de la sortie. */
const heat = (t: number) => `rgb(${mix(125, 255, t)} ${mix(211, 87, t)} ${mix(252, 34, t)})`;

/**
 * L'air traverse le compresseur de gauche à droite. La veine se resserre, les
 * particules se tassent et chauffent ; la pression et la température montent
 * jusqu'aux valeurs que TRED calcule ensuite (288 K → 761 K, soit 15 °C →
 * 488 °C, pour un rapport de pression de 30 : compression idéale, isentrope).
 *
 * `workAt` : image où l'arbre se met à « verrichten Arbeit » ; `riseAt` : image
 * où les jauges commencent à monter.
 */
export function CompressorSchematic({ workAt, riseAt, dur }: { workAt: number; riseAt: number; dur: number }) {
  const frame = useCurrentFrame();
  const rise = progress(frame, riseAt, dur - 8, easeInOut);
  const work = pop(frame, workAt, 12);
  const span = SPAN;
  const outline = (sign: 1 | -1, f: (u: number) => number) =>
    Array.from({ length: 21 }, (_, i) => {
      const u = i / 20;
      return `${i === 0 ? "M" : "L"}${CX0 + span * u} ${CY + sign * f(u)}`;
    }).join(" ");
  const particles = Array.from({ length: 96 }, (_, i) => {
    const lane = 0.12 + 0.76 * rnd(i * 3.1);
    const side: 1 | -1 = i % 2 ? 1 : -1;
    const phase = rnd(i * 7.7);
    const v = 0.2 + 0.1 * rnd(i * 1.3);
    const t = (phase + (frame / FPS) * v) % 1;
    // Plus lent, donc plus serré, vers la sortie : l'air est comprimé.
    const u = 1 - (1 - t) ** 1.7;
    return { x: CX0 + span * u, y: CY + side * (hub(u) + (casing(u) - hub(u)) * lane), u, r: 4.2 - 1.6 * u };
  });
  const p = 1 + 29 * rise;
  const tC = 15 + 473 * rise;
  return (
    <AbsoluteFill style={{ background: NIGHT }}>
      <AbsoluteFill style={{ background: "radial-gradient(90% 45% at 50% 34%, rgb(255 87 34 / 0.14), rgb(10 14 39 / 0) 70%)" }} />
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
        {/* Le moyeu (plein) et le carter (deux traits). */}
        <path d={HUB_PATH} fill="#1B2550" stroke="rgb(255 255 255 / 0.25)" strokeWidth={1.5} />
        <path d={outline(-1, casing)} fill="none" stroke="#C7D2FE" strokeWidth={5} strokeLinecap="round" />
        <path d={outline(1, casing)} fill="none" stroke="#C7D2FE" strokeWidth={5} strokeLinecap="round" />
        {/* Les étages : une roue mobile (dorée, elle tourne) puis un redresseur fixe (gris-bleu). */}
        {STAGES.map((u, i) => {
          const x = CX0 + span * u;
          return ([-1, 1] as const).map((side) => {
            const y0 = CY + side * hub(u);
            const y1 = CY + side * casing(u);
            const sweep = Math.sin((frame / FPS) * 9 + i * 1.4 + (side > 0 ? Math.PI : 0)) * 5;
            return (
              <g key={`${i}-${side}`}>
                <line x1={x - 4 + sweep * work} y1={y0} x2={x + 5 - sweep * work} y2={y1} stroke={GOLD} strokeWidth={6} strokeLinecap="round" opacity={0.95} />
                <line x1={x + 22} y1={y0} x2={x + 16} y2={y1} stroke="#7C8DB5" strokeWidth={5} strokeLinecap="round" opacity={0.85} />
              </g>
            );
          });
        })}
        {/* L'air. */}
        {particles.map((pt, i) => (
          <circle key={i} cx={pt.x} cy={pt.y} r={pt.r} fill={heat(pt.u * (0.25 + 0.75 * rise))} opacity={0.92} />
        ))}
        {/* L'arbre : le travail fourni à l'air. */}
        <g opacity={Math.min(1, work * 1.3)} transform={`translate(${CX0 + span * 0.5} ${CY})`}>
          <g transform={`rotate(${(frame * 9) % 360})`}>
            <path d="M-17 0 A17 17 0 1 1 9.5 14.1" fill="none" stroke={ORANGE} strokeWidth={5} strokeLinecap="round" />
            <path d="M9.5 14.1 l-9 -1 l5 -8 Z" fill={ORANGE} />
          </g>
        </g>
      </svg>
      {/* Étiquettes. */}
      <Tag x={CX0 - 6} y={CY - 176} at={6} align="left">
        LUFT →
      </Tag>
      <Tag x={W / 2} y={CY + 148} at={workAt} align="center" hot>
        ARBEIT ⟳
      </Tag>
      {/* Jauges : pression et température. */}
      <Gauge top={556} label="DRUCK" value={`${p.toFixed(p < 10 ? 1 : 0).replace(".", ",")} bar`} fill={rise} color={GOLD} at={riseAt - 10} />
      <Gauge top={608} label="TEMPERATUR" value={`${Math.round(tC)} °C`} fill={rise} color={ORANGE} at={riseAt - 4} />
    </AbsoluteFill>
  );
}

function Tag({ x, y, at, align, hot, children }: { x: number; y: number; at: number; align: "left" | "center"; hot?: boolean; children: ReactNode }) {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const k = pop(frame, at);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translateX(${align === "center" ? "-50%" : "0"}) scale(${0.7 + 0.3 * k})`,
        transformOrigin: align === "center" ? "50% 50%" : "0 50%",
        opacity: Math.min(1, k * 1.5),
        padding: "5px 12px 6px",
        borderRadius: 10,
        background: hot ? ORANGE : "rgb(5 8 25 / 0.8)",
        border: hot ? "none" : "1.5px solid rgb(255 255 255 / 0.3)",
        fontFamily: "Inter, sans-serif",
        fontWeight: 800,
        fontSize: 19,
        letterSpacing: "0.02em",
        color: "#FFFFFF",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  );
}

function Gauge({ top, label, value, fill, color, at }: { top: number; label: string; value: string; fill: number; color: string; at: number }) {
  const frame = useCurrentFrame();
  const k = progress(frame, at, at + 10);
  return (
    <div style={{ position: "absolute", top, left: 40, right: 40, opacity: k, transform: `translateY(${(1 - k) * 12}px)` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontFamily: "Inter, sans-serif", fontWeight: 800, color: "#FFFFFF" }}>
        <span style={{ fontSize: 15, letterSpacing: "0.08em", opacity: 0.8 }}>{label}</span>
        <span style={{ fontSize: 24, fontVariantNumeric: "tabular-nums", color }}>{value}</span>
      </div>
      <div style={{ marginTop: 5, height: 12, borderRadius: 6, background: "rgb(255 255 255 / 0.12)", overflow: "hidden" }}>
        <div style={{ width: `${4 + 96 * fill}%`, height: "100%", borderRadius: 6, background: color, boxShadow: `0 0 16px ${color}` }} />
      </div>
    </div>
  );
}

/* ── L'éditeur de code (du vrai code de TRED) ─────────────────────────── */

/** Extrait réel de packages/web/src/worker.ts (le service qui traite les imports). */
const CODE = `import { Worker } from "bullmq";
import { processImport } from "./api/lib/queue/import-job";
import { runPipeline } from "./api/video/pipeline";

const num = (name: string, fallback: number) =>
  Math.max(1, Number(process.env[name]) || fallback);

// Imports traités en même temps par réplique.
const importWorker = new Worker(IMPORT_QUEUE, processImport, {
  connection: workerConnection(),
  concurrency: num("WORKER_IMPORT_CONCURRENCY", 2),
  lockDuration: 5 * 60_000,
});

importWorker.on("completed", (job) =>
  console.log(\`import \${job.id} : \${job.returnvalue.pageCount} pages\`));

// « Als Video erklären » : script → contrôle → voix → stockage.
const videoWorker = new Worker(VIDEO_QUEUE, async (job) => {
  try {
    await runPipeline(job.data);
  } catch (err) {
    if (err instanceof PipelineError && !err.retryable)
      throw new UnrecoverableError(err.code);
    throw err;
  }
}, { connection: workerConnection(), concurrency: 3 });

videoWorker.on("failed", (job, err) => {
  const final = finalFailure(job);
  if (job && final) void failVideo(job.data.id, err.message);
});

async function shutdown(signal: string) {
  console.log(\`\${signal} : arrêt après les travaux en cours\`);
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));`.split("\n");

const KEYWORDS = /\b(import|from|const|new|async|await|function|if|return|throw|try|catch|void|instanceof|export)\b/g;

function colorize(line: string): ReactNode {
  if (/^\s*\/\//.test(line)) return <span style={{ color: "#6B7AA8" }}>{line}</span>;
  // Chaînes, puis mots-clés : assez pour ressembler à l'éditeur, sans analyseur.
  const parts = line.split(/("[^"]*"|`[^`]*`)/g);
  return parts.map((part, i) =>
    /^["`]/.test(part) ? (
      <span key={i} style={{ color: "#FFC107" }}>
        {part}
      </span>
    ) : (
      part.split(KEYWORDS).map((w, j) =>
        j % 2 ? (
          <span key={`${i}-${j}`} style={{ color: ORANGE }}>
            {w}
          </span>
        ) : (
          w
        ),
      )
    ),
  );
}

export function CodeScroll({ dur }: { dur: number }) {
  const frame = useCurrentFrame();
  const LINE = 23;
  const shown = Math.min(CODE.length, 4 + Math.floor((frame / dur) * (CODE.length + 2)));
  const scroll = Math.max(0, shown - 17) * LINE;
  return (
    <AbsoluteFill style={{ background: NIGHT }}>
      <AbsoluteFill style={{ background: "radial-gradient(100% 50% at 50% 100%, rgb(255 87 34 / 0.14), rgb(10 14 39 / 0) 70%)" }} />
      <div style={{ position: "absolute", top: 210, left: 16, right: 16, height: 470, borderRadius: 16, overflow: "hidden", background: "#0B1024", border: "1px solid rgb(255 255 255 / 0.14)", boxShadow: "0 30px 70px -24px rgb(0 0 0 / 0.9)" }}>
        <div style={{ height: 34, display: "flex", alignItems: "center", gap: 7, padding: "0 12px", background: "#131A36", borderBottom: "1px solid rgb(255 255 255 / 0.08)" }}>
          {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
            <span key={c} style={{ width: 10, height: 10, borderRadius: 5, background: c }} />
          ))}
          <span style={{ marginLeft: 10, padding: "4px 10px", borderRadius: 6, background: "#0B1024", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, color: "#C7D2FE" }}>worker.ts</span>
          <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, color: "rgb(199 210 254 / 0.45)" }}>pipeline.ts</span>
        </div>
        <div style={{ position: "relative", height: 436, overflow: "hidden" }}>
          <pre style={{ margin: 0, padding: "12px 0", transform: `translateY(${-scroll}px)`, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12.5, lineHeight: `${LINE}px`, color: "#E2E8FF" }}>
            {CODE.slice(0, shown).map((line, i) => (
              <div key={i} style={{ display: "flex", background: i === shown - 1 ? "rgb(255 255 255 / 0.06)" : "transparent" }}>
                <span style={{ width: 34, textAlign: "right", paddingRight: 10, color: "rgb(199 210 254 / 0.35)", flexShrink: 0 }}>{i + 1}</span>
                <span style={{ whiteSpace: "pre" }}>
                  {colorize(line)}
                  {i === shown - 1 && <span style={{ display: "inline-block", width: 7, height: 15, marginLeft: 2, verticalAlign: "-2px", background: ORANGE, opacity: frame % 16 < 9 ? 1 : 0 }} />}
                </span>
              </div>
            ))}
          </pre>
        </div>
      </div>
    </AbsoluteFill>
  );
}

/* ── Le plan « face caméra » du fondateur (en attendant son vrai clip) ── */

/**
 * Emplacement réservé : le fondateur filmera 3 à 5 secondes face caméra, à la
 * verticale. Quand le clip existe, on le pose dans src/assets/tiktok/ et on le
 * passe à la vidéo (`faceCam`, voir videos.tsx) : ce carton disparaît.
 */
export function FaceCamPlaceholder({ backdrop }: { backdrop: ReactNode }) {
  const frame = useCurrentFrame();
  const corner = (style: CSSProperties) => <span style={{ position: "absolute", width: 34, height: 34, borderColor: ORANGE, borderStyle: "solid", borderWidth: 0, ...style }} />;
  return (
    <AbsoluteFill style={{ background: NIGHT }}>
      <AbsoluteFill style={{ filter: "blur(14px) brightness(0.55)", transform: "scale(1.12)" }}>{backdrop}</AbsoluteFill>
      <div style={{ position: "absolute", left: 70, right: 70, top: 190, height: 500, borderRadius: 26, border: "2px dashed rgb(255 255 255 / 0.4)", background: "rgb(10 14 39 / 0.45)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
        {corner({ top: -3, left: -3, borderTopWidth: 5, borderLeftWidth: 5, borderTopLeftRadius: 26 })}
        {corner({ top: -3, right: -3, borderTopWidth: 5, borderRightWidth: 5, borderTopRightRadius: 26 })}
        {corner({ bottom: -3, left: -3, borderBottomWidth: 5, borderLeftWidth: 5, borderBottomLeftRadius: 26 })}
        {corner({ bottom: -3, right: -3, borderBottomWidth: 5, borderRightWidth: 5, borderBottomRightRadius: 26 })}
        <svg width={150} height={150} viewBox="0 0 150 150">
          <circle cx={75} cy={54} r={32} fill="rgb(255 255 255 / 0.22)" />
          <path d="M14 150 C14 106 42 92 75 92 C108 92 136 106 136 150 Z" fill="rgb(255 255 255 / 0.22)" />
        </svg>
        <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 900, fontSize: 34, letterSpacing: "0.06em", color: "#FFFFFF" }}>FACE CAM</span>
        <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 15, color: "rgb(255 255 255 / 0.7)", textAlign: "center", lineHeight: 1.35 }}>
          Platzhalter · hier kommt dein Clip
          <br />
          3–5 Sekunden, hochkant
        </span>
        <div style={{ position: "absolute", top: 16, left: 18, display: "flex", alignItems: "center", gap: 7, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 700, fontSize: 14, color: "#FFFFFF" }}>
          <span style={{ width: 11, height: 11, borderRadius: 6, background: "#FF3B30", opacity: frame % 30 < 18 ? 1 : 0.25 }} />
          REC
        </div>
      </div>
    </AbsoluteFill>
  );
}

/* ── Appel à l'action et carte de fin ─────────────────────────────────── */

/** La pastille « Link im Profil », en orange, avec son reflet. */
export function ProfilePill({ at, children = "Link im Profil" }: { at: number; children?: ReactNode }) {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const k = pop(frame, at, 11);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "11px 22px 12px",
        borderRadius: 999,
        background: ORANGE,
        color: "#FFFFFF",
        fontFamily: "Inter, sans-serif",
        fontWeight: 900,
        fontSize: 26,
        letterSpacing: "-0.01em",
        boxShadow: "0 18px 40px -12px rgb(255 87 34 / 0.85)",
        transform: `scale(${0.6 + 0.4 * k})`,
        opacity: Math.min(1, k * 1.6),
      }}
    >
      {children} <span style={{ fontSize: 22 }}>↗</span>
    </span>
  );
}

/** Le logo de TRED (le vrai, celui de l'app) et l'appel à l'action, posés sur un plan. */
export function CtaOverlay({ at, top = 150 }: { at: number; top?: number }) {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const k = pop(frame, at, 12);
  const shade = Math.min(1, k);
  const mid = ((top + 80) / H) * 100;
  return (
    <AbsoluteFill>
      {/* Une bande sombre derrière le logo, pas sur le visage. */}
      <AbsoluteFill style={{ background: `linear-gradient(180deg, rgb(10 14 39 / 0) ${mid - 22}%, rgb(10 14 39 / ${0.8 * shade}) ${mid - 4}%, rgb(10 14 39 / ${0.86 * shade}) ${mid + 12}%, rgb(10 14 39 / ${0.6 * shade}) 100%)` }} />
      <div style={{ position: "absolute", top, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        <div style={{ transform: `scale(${0.75 + 0.25 * k})`, opacity: Math.min(1, k * 1.5) }}>
          <Logo variant="row" markClassName="h-[76px] text-white" />
        </div>
        <ProfilePill at={at + 7} />
      </div>
    </AbsoluteFill>
  );
}

/** Carte de fin : logo, une ou deux lignes, la pastille. */
export function EndCard({ lines, pillAt, pill }: { lines: { text: ReactNode; at: number; size?: number; hot?: boolean }[]; pillAt: number; pill?: ReactNode }) {
  const frame = useCurrentFrame();
  const k = pop(frame, 3, 12);
  return (
    <AbsoluteFill style={{ background: NIGHT }}>
      <AbsoluteFill style={{ background: "radial-gradient(110% 55% at 50% 30%, rgb(255 87 34 / 0.26), rgb(10 14 39 / 0) 65%), radial-gradient(80% 40% at 50% 100%, rgb(255 193 7 / 0.1), rgb(10 14 39 / 0) 70%)" }} />
      <div style={{ position: "absolute", top: 168, left: 30, right: 30, display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
        <div style={{ transform: `scale(${0.7 + 0.3 * k})`, opacity: Math.min(1, k * 1.5) }}>
          <Logo variant="stacked" markClassName="h-[150px] text-white" />
        </div>
        {lines.map((line, i) => {
          if (frame < line.at) return null;
          const p = pop(frame, line.at, 11);
          return (
            <span
              key={i}
              style={{
                fontFamily: "Inter, sans-serif",
                fontWeight: 900,
                fontSize: line.size ?? 34,
                lineHeight: 1.12,
                letterSpacing: "-0.02em",
                textAlign: "center",
                color: "#FFFFFF",
                padding: line.hot ? "6px 16px 8px" : 0,
                borderRadius: 12,
                background: line.hot ? ORANGE : "transparent",
                textShadow: line.hot ? "none" : `0 8px 24px ${INK}`,
                transform: `scale(${0.8 + 0.2 * p}) rotate(${line.hot ? -1.5 : 0}deg)`,
                opacity: Math.min(1, p * 1.6),
              }}
            >
              {line.text}
            </span>
          );
        })}
        <div style={{ marginTop: 6 }}>
          <ProfilePill at={pillAt}>{pill}</ProfilePill>
        </div>
      </div>
    </AbsoluteFill>
  );
}
