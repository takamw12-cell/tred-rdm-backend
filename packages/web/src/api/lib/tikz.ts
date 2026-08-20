// TikZ → SVG compilation pipeline.
//
// The tutor agent emits ```tikz fenced blocks for exam-style statics schemas
// (beams, supports, distributed loads, dimensions) that mermaid/chart can't
// draw. We compile them server-side with pdflatex and convert the PDF to SVG
// with dvisvgm, cache the result by content hash, and hand the SVG to the web
// client. Rendering is deterministic, so the on-disk cache makes repeat views
// (history, re-open, re-render) instant and free.

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CACHE_DIR = join(tmpdir(), "aerostudy-tikz-cache");
const COMPILE_TIMEOUT_MS = 20_000;
const MAX_CODE_CHARS = 20_000;

// Standalone LaTeX wrapper with the TikZ libraries needed for mechanics
// schematics. Applied only when the agent sends a bare tikzpicture (the
// common case); a full \documentclass document is compiled as-is.
const PREAMBLE = String.raw`\documentclass[border=8pt,varwidth]{standalone}
\usepackage{tikz}
\usepackage{amsmath}
\usepackage{amssymb}
% Units are everywhere in mechanics/engineering figures, so the model routinely
% emits siunitx macros (\SI, \qty, \si, \ang, \num, \unit). Load siunitx when
% available; otherwise fall back to lightweight, math-safe text macros so a
% figure with units still compiles instead of failing with an "Undefined
% control sequence" and dropping the whole schematic to a raw-code box.
\IfFileExists{siunitx.sty}{\usepackage{siunitx}\sisetup{detect-all}}{%
  \providecommand{\SI}[2]{#1\,#2}%
  \providecommand{\si}[1]{#1}%
  \providecommand{\num}[1]{#1}%
  \providecommand{\qty}[2]{#1\,#2}%
  \providecommand{\unit}[1]{#1}%
  \providecommand{\ang}[1]{\ensuremath{#1^\circ}}%
  \providecommand{\milli}{m}\providecommand{\meter}{m}\providecommand{\metre}{m}%
  \providecommand{\centi}{c}\providecommand{\kilo}{k}\providecommand{\mega}{M}\providecommand{\giga}{G}%
  \providecommand{\newton}{N}\providecommand{\pascal}{Pa}\providecommand{\joule}{J}\providecommand{\watt}{W}%
  \providecommand{\gram}{g}\providecommand{\second}{s}\providecommand{\ampere}{A}\providecommand{\kelvin}{K}%
  \providecommand{\per}{/}\providecommand{\squared}{\ensuremath{{}^2}}\providecommand{\cubed}{\ensuremath{{}^3}}%
}
\usepackage{helvet}
\renewcommand{\familydefault}{\sfdefault}
\usetikzlibrary{arrows.meta,patterns,patterns.meta,decorations.pathmorphing,decorations.markings,decorations.pathreplacing,calc,angles,quotes,positioning,shapes.geometric,shapes.misc,backgrounds,intersections,through}
% Professional engineering-textbook palette — always available so figures use
% a consistent colour language: blue=forces, red=compression, green=tension,
% grey=neutral/reference axes.
\definecolor{forceblue}{HTML}{2563EB}
\definecolor{compressred}{HTML}{EF4444}
\definecolor{tensiongreen}{HTML}{10B981}
\definecolor{neutralgray}{HTML}{64748B}
% Readable defaults for every figure: larger labels, clear line weight, and
% a bit of breathing room so schematics don't look cramped on a phone screen.
\tikzset{
  every picture/.style={line width=0.7pt, font=\sffamily\large},
  every node/.style={inner sep=2.2pt},
}
\begin{document}
`;
const POSTAMBLE = "\n\\end{document}\n";

function wrap(code: string): string {
  const trimmed = code.trim();
  if (/\\documentclass/.test(trimmed)) return trimmed;
  return PREAMBLE + trimmed + POSTAMBLE;
}

// Reject the handful of primitives that could touch the filesystem or shell.
// Content originates from our own model, but this keeps a prompt-injected
// document from doing anything beyond drawing.
const FORBIDDEN = [
  /\\write18/,
  /\\immediate\s*\\write/,
  /\\openin/,
  /\\openout/,
  /\\input\b/,
  /\\include\b/,
  /\\usepackage\s*\{\s*(shellesc|write18)/,
  /\\directlua/,
  /\\catcode/,
];

function run(cmd: string, args: string[], cwd: string): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    const child = execFile(
      cmd,
      args,
      { cwd, timeout: COMPILE_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, openout_any: "p", openin_any: "p" } },
      (err, stdout) => {
        resolve({ code: err && typeof (err as { code?: number }).code === "number" ? (err as { code: number }).code : err ? 1 : 0, stdout: String(stdout ?? "") });
      },
    );
    child.on("error", () => resolve({ code: 127, stdout: "" }));
  });
}

export type TikzResult = { svg: string } | { error: string };

export async function renderTikz(rawCode: string): Promise<TikzResult> {
  const code = (rawCode ?? "").slice(0, MAX_CODE_CHARS);
  if (!code.trim()) return { error: "empty tikz code" };
  for (const rx of FORBIDDEN) {
    if (rx.test(code)) return { error: "forbidden LaTeX primitive" };
  }

  const source = wrap(code);
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 32);
  const svgCache = join(CACHE_DIR, `${hash}.svg`);

  // Cache hit.
  try {
    await access(svgCache);
    return { svg: await readFile(svgCache, "utf8") };
  } catch {
    // miss — compile below
  }

  const work = join(CACHE_DIR, hash);
  await mkdir(work, { recursive: true });
  const tex = join(work, "fig.tex");
  const pdf = join(work, "fig.pdf");
  const svg = join(work, "fig.svg");

  try {
    await writeFile(tex, source, "utf8");

    // No -halt-on-error: nonstopmode pushes past recoverable errors (an unknown
    // macro, a stray token) and still emits a best-effort PDF with the rest of
    // the figure, which beats dropping the whole schematic to a raw-code box.
    // Only a truly fatal error leaves no PDF, and we surface that below.
    const latex = await run(
      "pdflatex",
      ["-interaction=nonstopmode", "-no-shell-escape", "fig.tex"],
      work,
    );
    // pdflatex can exit non-zero yet still emit a usable PDF; trust the PDF.
    let pdfOk = false;
    try {
      await access(pdf);
      pdfOk = true;
    } catch {
      pdfOk = false;
    }
    if (!pdfOk) {
      const log = extractTexError(latex.stdout);
      return { error: log || "LaTeX-Kompilierung fehlgeschlagen" };
    }

    const conv = await run("dvisvgm", ["--pdf", "--no-fonts", "--exact-bbox", "fig.pdf", "-o", "fig.svg"], work);
    let svgText: string;
    try {
      svgText = await readFile(svg, "utf8");
    } catch {
      return { error: `SVG-Konvertierung fehlgeschlagen (${conv.code})` };
    }

    svgText = normalizeSvg(svgText);
    // Persist to the flat cache keyed by content hash.
    await writeFile(svgCache, svgText, "utf8");
    return { svg: svgText };
  } finally {
    // Clean the per-compile work dir; keep the flat .svg cache file.
    void rm(work, { recursive: true, force: true });
  }
}

// dvisvgm emits fixed pt width/height. Make it fluid so the figure scales to
// its container while keeping the aspect ratio via the viewBox.
function normalizeSvg(svg: string): string {
  let out = svg.replace(/<\?xml[^>]*\?>\s*/i, "").replace(/<!DOCTYPE[^>]*>\s*/i, "");
  out = out.replace(/<svg([^>]*)>/i, (_full, attrs: string) => {
    let a = attrs
      .replace(/\swidth='[^']*'/i, "")
      .replace(/\sheight='[^']*'/i, "")
      .replace(/\swidth="[^"]*"/i, "")
      .replace(/\sheight="[^"]*"/i, "");
    if (!/preserveAspectRatio/i.test(a)) a += ` preserveAspectRatio="xMidYMid meet"`;
    return `<svg${a} width="100%" height="100%">`;
  });
  return out.trim();
}

function extractTexError(log: string): string {
  const lines = log.split("\n");
  const idx = lines.findIndex((l) => l.startsWith("! "));
  if (idx === -1) return "";
  return lines.slice(idx, idx + 4).join("\n").slice(0, 400);
}
