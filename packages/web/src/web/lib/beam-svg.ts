import { type Point, type SolveOk } from "../../api/lib/rdm-solver";
import { criticalPoints, eventPositions, type BeamDiagramPayload } from "../../api/lib/beam-tool";
import { toSI } from "../../api/lib/units";

/**
 * Partie PURE du schéma de poutre (aucun React) : bloc de texte, garde-fou
 * anti-doublon, lecture du bloc, rendu SVG. Séparée du composant pour être
 * testée directement (tests/beam-tool.test.ts).
 */

/** Sans tiret : `markdown-content` lit la langue avec /language-(\w+)/. */
export const BEAM_LANG = "balkendiagramm";

/* -------------------------------------------------------------------------- */
/* Du message au bloc                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Transforme la partie d'outil `balkenstatik` d'un message en bloc de texte.
 * Renvoie null pour toute autre partie, ou tant que le résultat n'est pas là.
 */
export function beamBlockFromPart(part: unknown): string | null {
  const p = part as {
    type?: string;
    toolName?: string;
    state?: string;
    output?: { ok?: boolean; diagramm?: unknown };
  };
  const isBeamTool =
    p?.type === "tool-balkenstatik" || (p?.type === "dynamic-tool" && p.toolName === "balkenstatik");
  if (!isBeamTool || p.state !== "output-available") return null;
  if (!p.output?.ok || !p.output.diagramm) return null;
  return `\n\n\`\`\`${BEAM_LANG}\n${JSON.stringify(p.output.diagramm)}\n\`\`\`\n\n`;
}

/* -------------------------------------------------------------------------- */
/* Garde-fou anti-doublon                                                     */
/* -------------------------------------------------------------------------- */

const CHART_BLOCK_RE = /```chart[ \t]*\n([\s\S]*?)```/g;
const BEAM_CHART_RE = /\b(Q|M)\s*\(\s*x\s*\)|Querkraft|Moment|Schnittkr|shear|bending/i;

/**
 * Si le message contient déjà un schéma calculé, on retire les ```chart de
 * Q(x) / M(x) que le modèle aurait ajoutés malgré la consigne : deux
 * diagrammes dont un recopié à la main, c'est la promesse « schéma parfait »
 * qui tombe. Les autres charts (Bode, σ-ε…) restent.
 */
export function dropDuplicateBeamCharts(text: string): string {
  if (!text.includes("```" + BEAM_LANG)) return text;
  return text.replace(CHART_BLOCK_RE, (block, body: string) =>
    BEAM_CHART_RE.test(body) ? "" : block,
  );
}

/* -------------------------------------------------------------------------- */
/* Lecture du bloc                                                            */
/* -------------------------------------------------------------------------- */

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function parseBeamPayload(raw: string): BeamDiagramPayload | null {
  try {
    const d = JSON.parse(raw.trim()) as BeamDiagramPayload;
    const p = d?.problem;
    if (d?.v !== 1 || !p || !finite(p.length) || p.length <= 0) return null;
    if (!Array.isArray(p.supports) || p.supports.length === 0) return null;
    const lists = [p.pointLoads, p.distributedLoads, p.pointMoments];
    if (!lists.every(Array.isArray)) return null;
    const allFinite =
      p.supports.every((s) => finite(s.x)) &&
      p.pointLoads.every((f) => finite(f.x) && finite(f.F)) &&
      p.distributedLoads.every(
        (q) =>
          finite(q.from) && finite(q.to) && finite(q.q) && (q.qEnd === undefined || finite(q.qEnd)),
      ) &&
      p.pointMoments.every((m) => finite(m.x) && finite(m.M));
    if (!allFinite) return null;
    return d;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Dessin                                                                     */
/* -------------------------------------------------------------------------- */

const COLOR = {
  body: "#1e293b",
  force: "#2563EB",
  dim: "#64748B",
  hatch: "#94A3B8",
  guide: "#CBD5E1",
  qStroke: "#0f4f49",
  qFill: "#3fbfa8",
  mStroke: "#b45309",
  mFill: "#f2b705",
} as const;
const FONT = "Inter, 'Helvetica Neue', Arial, sans-serif";

/**
 * Convention de signe du tracé de M. `false` : M positif vers le HAUT, comme
 * Q. Beaucoup de cours allemands portent M positif vers le BAS (côté fibre
 * tendue) — mettre `true` si c'est la convention du polycopié.
 */
const M_POSITIVE_DOWN = true;

const W = 600;
const ML = 64;
const MR = 36;
const PLOT_W = W - ML - MR;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function fmt(v: number): string {
  const a = Math.abs(v);
  const digits = a >= 100 ? 1 : a >= 1 ? 2 : 3;
  const r = Number(v.toFixed(digits));
  return (Object.is(r, -0) ? 0 : r).toLocaleString("de-DE", { maximumFractionDigits: digits });
}

function text(
  x: number,
  y: number,
  s: string,
  o: { color?: string; size?: number; anchor?: "start" | "middle" | "end"; weight?: number } = {},
) {
  return (
    `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${o.color ?? COLOR.body}" ` +
    `font-size="${o.size ?? 12}" text-anchor="${o.anchor ?? "middle"}"` +
    `${o.weight ? ` font-weight="${o.weight}"` : ""}>${esc(s)}</text>`
  );
}

function hatch(x1: number, x2: number, y: number): string {
  let out = `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${COLOR.body}" stroke-width="1.6"/>`;
  for (let x = x1 + 4; x <= x2; x += 7) {
    out += `<line x1="${x}" y1="${y}" x2="${x - 6}" y2="${y + 7}" stroke="${COLOR.hatch}" stroke-width="1.2"/>`;
  }
  return out;
}

interface Display {
  len: (v: number) => string;
  force: (v: number) => string;
  lineLoad: (v: number) => string;
  moment: (v: number) => string;
  uL: string;
  uF: string;
  uM: string;
  /** SI → unité affichée. */
  toForce: (v: number) => number;
  toMoment: (v: number) => number;
}

function display(units: BeamDiagramPayload["units"]): Display {
  const fL = toSI(1, "length", units.length);
  const fF = toSI(1, "force", units.force);
  const uM = `${units.force}·${units.length}`;
  return {
    len: (v) => `${fmt(v / fL)} ${units.length}`,
    force: (v) => `${fmt(Math.abs(v) / fF)} ${units.force}`,
    lineLoad: (v) => `${fmt(Math.abs(v) / (fF / fL))} ${units.force}/${units.length}`,
    moment: (v) => `${fmt(Math.abs(v) / (fF * fL))} ${uM}`,
    uL: units.length,
    uF: units.force,
    uM,
    toForce: (v) => v / fF,
    toMoment: (v) => v / (fF * fL),
  };
}

/**
 * Dreiecks- oder Trapezlast : la hauteur des flèches suit l'intensité,
 * comme au tableau. Une flèche par ~22 px ; celles trop courtes pour porter
 * une pointe (près du zéro d'un triangle) sont omises.
 */
function linearLoadShape(
  q: { from: number; to: number; q: number; qEnd: number },
  d: Display,
  sx: (x: number) => number,
  yB: number,
): string {
  const H = 28;
  const base = yB - 6;
  const x1 = sx(q.from);
  const x2 = sx(q.to);
  const maxAbs = Math.max(Math.abs(q.q), Math.abs(q.qEnd)) || 1;
  const h1 = (H * Math.abs(q.q)) / maxAbs;
  const h2 = (H * Math.abs(q.qEnd)) / maxAbs;
  let out =
    `<polygon points="${x1},${base} ${x1},${base - h1} ${x2},${base - h2} ${x2},${base}" ` +
    `fill="${COLOR.force}" fill-opacity="0.07"/>` +
    `<line x1="${x1}" y1="${base - h1}" x2="${x2}" y2="${base - h2}" stroke="${COLOR.force}" stroke-width="1.4"/>`;

  const n = Math.max(2, Math.round((x2 - x1) / 22));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x1 + (x2 - x1) * t;
    const qi = q.q + (q.qEnd - q.q) * t;
    const h = (H * Math.abs(qi)) / maxAbs;
    if (h < 7) continue;
    out +=
      qi < 0
        ? `<line x1="${x}" y1="${yB - 4}" x2="${x}" y2="${base - h + 2}" stroke="${COLOR.force}" stroke-width="1.4" marker-end="url(#bArrF)"/>`
        : `<line x1="${x}" y1="${base - h}" x2="${x}" y2="${yB - 3}" stroke="${COLOR.force}" stroke-width="1.4" marker-end="url(#bArrF)"/>`;
  }

  // Valeurs aux extrémités non nulles : q₀ pour un triangle, q₁ / q₂ pour un trapèze.
  const yLabel = base - H - 6;
  const triangle = q.q === 0 || q.qEnd === 0;
  if (q.q !== 0) {
    out += text(x1, yLabel, `${triangle ? "q₀" : "q₁"} = ${d.lineLoad(q.q)}`, {
      color: COLOR.force,
      anchor: "start",
    });
  }
  if (q.qEnd !== 0) {
    out += text(x2, yLabel, `${triangle ? "q₀" : "q₂"} = ${d.lineLoad(q.qEnd)}`, {
      color: COLOR.force,
      anchor: "end",
    });
  }
  return out;
}

function systemPanel(p: BeamDiagramPayload["problem"], d: Display, sx: (x: number) => number) {
  const yB = 112; // arête supérieure de la poutre
  const out: string[] = [];

  // Charges réparties : bande de flèches au-dessus de la poutre.
  for (const q of p.distributedLoads) {
    if (q.qEnd !== undefined && q.qEnd !== q.q) {
      out.push(linearLoadShape(q as Required<typeof q>, d, sx, yB));
      continue;
    }
    const x1 = sx(Math.min(q.from, q.to));
    const x2 = sx(Math.max(q.from, q.to));
    const up = q.q < 0;
    const yTop = yB - 34;
    out.push(
      `<rect x="${x1}" y="${yTop}" width="${x2 - x1}" height="28" fill="${COLOR.force}" fill-opacity="0.07"/>` +
        `<line x1="${x1}" y1="${yTop}" x2="${x2}" y2="${yTop}" stroke="${COLOR.force}" stroke-width="1.4"/>`,
    );
    const n = Math.max(2, Math.round((x2 - x1) / 22));
    for (let i = 0; i <= n; i++) {
      const x = x1 + ((x2 - x1) * i) / n;
      out.push(
        up
          ? `<line x1="${x}" y1="${yB - 4}" x2="${x}" y2="${yTop + 2}" stroke="${COLOR.force}" stroke-width="1.4" marker-end="url(#bArrF)"/>`
          : `<line x1="${x}" y1="${yTop}" x2="${x}" y2="${yB - 3}" stroke="${COLOR.force}" stroke-width="1.4" marker-end="url(#bArrF)"/>`,
      );
    }
    out.push(text((x1 + x2) / 2, yTop - 6, `q = ${d.lineLoad(q.q)}`, { color: COLOR.force }));
  }

  // Poutre.
  out.push(
    `<rect x="${sx(0)}" y="${yB}" width="${PLOT_W}" height="9" rx="2" fill="${COLOR.body}"/>`,
  );

  // Forces ponctuelles.
  p.pointLoads.forEach((f, i) => {
    const x = sx(f.x);
    const label = `F${p.pointLoads.length > 1 ? i + 1 : ""} = ${d.force(f.F)}`;
    if (f.F >= 0) {
      out.push(
        `<line x1="${x}" y1="${yB - 66}" x2="${x}" y2="${yB - 2}" stroke="${COLOR.force}" stroke-width="2.6" marker-end="url(#bArrF)"/>`,
        text(x, yB - 72, label, { color: COLOR.force, weight: 600 }),
      );
    } else {
      out.push(
        `<line x1="${x}" y1="${yB + 70}" x2="${x}" y2="${yB + 11}" stroke="${COLOR.force}" stroke-width="2.6" marker-end="url(#bArrF)"/>`,
        text(x, yB + 84, label, { color: COLOR.force, weight: 600 }),
      );
    }
  });

  // Moments ponctuels : arc orienté (positif = sens trigonométrique).
  p.pointMoments.forEach((m, i) => {
    const x = sx(m.x);
    const r = 17;
    const cy = yB + 4;
    const path =
      m.M >= 0
        ? `M${x + r},${cy} A${r},${r} 0 0 0 ${x - r},${cy}`
        : `M${x - r},${cy} A${r},${r} 0 0 1 ${x + r},${cy}`;
    out.push(
      `<path d="${path}" fill="none" stroke="${COLOR.force}" stroke-width="2.2" marker-end="url(#bArrF)"/>`,
      `<circle cx="${x}" cy="${cy}" r="2.5" fill="${COLOR.force}"/>`,
      text(x, cy - r - 8, `M${p.pointMoments.length > 1 ? i + 1 : ""} = ${d.moment(m.M)}`, {
        color: COLOR.force,
        weight: 600,
      }),
    );
  });

  // Appuis.
  for (const s of p.supports) {
    const x = sx(s.x);
    const yS = yB + 9;
    if (s.kind === "einspannung") {
      const left = s.x <= p.length / 2;
      const xw = left ? x : x;
      out.push(
        `<line x1="${xw}" y1="${yB - 26}" x2="${xw}" y2="${yB + 35}" stroke="${COLOR.body}" stroke-width="3"/>`,
      );
      for (let y = yB - 22; y <= yB + 34; y += 7) {
        const dx = left ? -7 : 7;
        out.push(
          `<line x1="${xw}" y1="${y}" x2="${xw + dx}" y2="${y + 6}" stroke="${COLOR.hatch}" stroke-width="1.2"/>`,
        );
      }
      out.push(text(xw + (left ? -14 : 14), yB + 52, s.name, { weight: 600 }));
      continue;
    }
    out.push(
      `<path d="M${x},${yS} L${x - 12},${yS + 20} L${x + 12},${yS + 20} z" fill="#fff" stroke="${COLOR.body}" stroke-width="1.8"/>`,
    );
    if (s.kind === "loslager") {
      out.push(
        `<line x1="${x - 15}" y1="${yS + 25}" x2="${x + 15}" y2="${yS + 25}" stroke="${COLOR.body}" stroke-width="1.6"/>`,
        hatch(x - 15, x + 15, yS + 29),
      );
    } else {
      out.push(hatch(x - 15, x + 15, yS + 20));
    }
    out.push(text(x, yB + 62, s.name, { weight: 600 }));
  }

  // Cotation en chaîne entre tous les points remarquables.
  const ev = eventPositions(p);
  const yD = yB + 92;
  for (const e of ev) {
    const x = sx(e);
    out.push(`<line x1="${x}" y1="${yD - 6}" x2="${x}" y2="${yD + 6}" stroke="${COLOR.dim}" stroke-width="1"/>`);
  }
  for (let i = 0; i < ev.length - 1; i++) {
    const a = sx(ev[i]);
    const b = sx(ev[i + 1]);
    out.push(
      `<line x1="${a}" y1="${yD}" x2="${b}" y2="${yD}" stroke="${COLOR.dim}" stroke-width="1" marker-start="url(#bArrD)" marker-end="url(#bArrD)"/>`,
    );
    if (b - a >= 30) out.push(text((a + b) / 2, yD - 5, d.len(ev[i + 1] - ev[i]), { color: COLOR.dim, size: 11 }));
  }
  if (ev.length > 2) {
    const yT = yD + 22;
    out.push(
      `<line x1="${sx(0)}" y1="${yT}" x2="${sx(p.length)}" y2="${yT}" stroke="${COLOR.dim}" stroke-width="1" marker-start="url(#bArrD)" marker-end="url(#bArrD)"/>`,
      `<rect x="${sx(p.length / 2) - 34}" y="${yT - 9}" width="68" height="16" fill="#fff"/>`,
      text(sx(p.length / 2), yT + 4, `L = ${d.len(p.length)}`, { color: COLOR.dim, size: 11 }),
    );
  }

  return { svg: out.join(""), height: ev.length > 2 ? yD + 36 : yD + 16 };
}

function curvePanel(opts: {
  top: number;
  title: string;
  curve: Point[];
  critical: Point[];
  extra: Point[];
  toUnit: (v: number) => number;
  stroke: string;
  fill: string;
  flip: boolean;
  sx: (x: number) => number;
  length: number;
}) {
  const { top, curve, sx } = opts;
  const H = 164;
  const pTop = top + 40;
  const pH = H - 64;
  const ys = curve.map((p) => opts.toUnit(p.y) * (opts.flip ? -1 : 1));
  const yMax = Math.max(0, ...ys);
  const yMin = Math.min(0, ...ys);
  const range = yMax - yMin || 1;
  const sy = (v: number) => pTop + ((yMax - v * (opts.flip ? -1 : 1)) / range) * pH;
  const y0 = sy(0);
  const out: string[] = [];

  out.push(text(8, top + 14, opts.title, { anchor: "start", weight: 700, size: 13 }));

  const pts = curve.map((p) => `${sx(p.x).toFixed(1)},${sy(opts.toUnit(p.y)).toFixed(1)}`);
  out.push(
    `<polygon points="${sx(curve[0].x).toFixed(1)},${y0.toFixed(1)} ${pts.join(" ")} ${sx(curve[curve.length - 1].x).toFixed(1)},${y0.toFixed(1)}" fill="${opts.fill}" fill-opacity="0.22"/>`,
    `<line x1="${sx(0)}" y1="${y0}" x2="${sx(opts.length) + 14}" y2="${y0}" stroke="${COLOR.dim}" stroke-width="1" marker-end="url(#bArrD)"/>`,
    text(sx(opts.length) + 18, y0 + 4, "x", { color: COLOR.dim, anchor: "start", size: 11 }),
    `<polyline points="${pts.join(" ")}" fill="none" stroke="${opts.stroke}" stroke-width="2.2" stroke-linejoin="round"/>`,
  );

  // Étiquettes : points critiques (deux côtés des sauts) + extrema.
  const tol = opts.length * 1e-5;
  const placed: { x: number; y: number }[] = [];
  const labels = [...opts.critical, ...opts.extra];
  labels.forEach((pt, i) => {
    const v = opts.toUnit(pt.y);
    if (Math.abs(v) < range * 1e-6 || fmt(v) === "0") return;
    const isCritical = i < opts.critical.length;
    const prevSame = isCritical && i > 0 && Math.abs(opts.critical[i - 1].x - pt.x) <= tol;
    const nextSame =
      isCritical && i < opts.critical.length - 1 && Math.abs(opts.critical[i + 1].x - pt.x) <= tol;
    const anchor = nextSame ? "end" : prevSame ? "start" : "middle";
    const px = sx(pt.x) + (anchor === "end" ? -4 : anchor === "start" ? 4 : 0);
    const above = v * (opts.flip ? -1 : 1) >= 0;
    const py = sy(v) + (above ? -6 : 14);
    if (placed.some((q) => Math.abs(q.x - px) < 34 && Math.abs(q.y - py) < 12)) return;
    placed.push({ x: px, y: py });
    out.push(
      `<circle cx="${sx(pt.x).toFixed(1)}" cy="${sy(v).toFixed(1)}" r="2.4" fill="${opts.stroke}"/>`,
      text(px, py, fmt(v), { anchor, size: 11, color: COLOR.body }),
    );
  });

  return { svg: out.join(""), height: H };
}

export function renderBeamSvg(payload: BeamDiagramPayload, r: SolveOk): string {
  const p = payload.problem;
  const d = display(payload.units);
  const sx = (x: number) => ML + (x / p.length) * PLOT_W;
  const ev = eventPositions(p);

  const sys = systemPanel(p, d, sx);
  const qTop = sys.height + 8;
  const q = curvePanel({
    top: qTop,
    title: `Q(x) [${d.uF}]`,
    curve: r.shear,
    critical: criticalPoints(r.shear, ev, p.length),
    extra: [],
    toUnit: d.toForce,
    stroke: COLOR.qStroke,
    fill: COLOR.qFill,
    flip: false,
    sx,
    length: p.length,
  });
  const mTop = qTop + q.height;
  const mExtremes = [r.extremes.momentMax, r.extremes.momentMin];
  const m = curvePanel({
    top: mTop,
    title: `M(x) [${d.uM}]`,
    curve: r.moment,
    critical: criticalPoints(r.moment, ev, p.length),
    extra: mExtremes,
    toUnit: d.toMoment,
    stroke: COLOR.mStroke,
    fill: COLOR.mFill,
    flip: M_POSITIVE_DOWN,
    sx,
    length: p.length,
  });
  const H = mTop + m.height;

  // Repères verticaux communs : on lit d'un coup d'œil ce qui se passe sous
  // chaque charge et chaque appui.
  const guides = ev
    .map(
      (e) =>
        `<line x1="${sx(e)}" y1="${qTop}" x2="${sx(e)}" y2="${H - 12}" stroke="${COLOR.guide}" stroke-width="1" stroke-dasharray="3 4"/>`,
    )
    .join("");

  const marker = (id: string, color: string) =>
    `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${color}"/></marker>`;

  return (
    `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="${FONT}" font-size="12">` +
    `<defs>${marker("bArrF", COLOR.force)}${marker("bArrD", COLOR.dim)}</defs>` +
    `<rect width="${W}" height="${H}" fill="#fff"/>` +
    guides +
    sys.svg +
    q.svg +
    m.svg +
    `</svg>`
  );
}

