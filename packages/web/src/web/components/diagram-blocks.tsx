import { useEffect, useRef, useState } from "react";
import { sanitizeSvg } from "@/lib/svg-sanitize";
import { isCompleteTikz } from "@/lib/tikz-complete";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line, Scatter, Bar } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import { AlertTriangle, Loader2 } from "lucide-react";
import { SvgDiagramFrame, CanvasDiagramFrame } from "./diagram-frame";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

// ── Theme awareness ─────────────────────────────────────────────────────
// The app toggles a `dark` class on <html>. Diagrams must re-render when it
// flips, so we observe the attribute and expose a boolean.
function useDarkMode(): boolean {
  const [dark, setDark] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setDark(el.classList.contains("dark")));
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

// ── Mermaid ────────────────────────────────────────────────────────────
// Renders a ```mermaid fenced block as a real SVG diagram. Re-renders on
// theme change. Falls back to the raw source if the graph is invalid.
let mermaidSeq = 0;

/**
 * Räumt die Hilfsknoten weg, die mermaid beim Rendern in den <body> hängt.
 * Bricht das Rendern ab, bleiben sie sonst als sichtbarer Rest im Dokument
 * stehen — auch mit suppressErrorRendering, denn der Messknoten wird vor dem
 * Fehler erzeugt.
 */
function cleanupMermaidNodes(id: string, dark: boolean) {
  if (typeof document === "undefined") return;
  const base = `${id}-${dark ? "d" : "l"}`;
  for (const candidate of [base, `d${base}`]) {
    document.getElementById(candidate)?.remove();
  }
  // Notbremse: mermaid hängt seine Fehlergrafik direkt an den <body>, außerhalb
  // unseres Containers. Findet sich dort noch eine, fliegt sie raus — sonst
  // liegt sie sichtbar über Seitenleiste und Chat.
  for (const el of document.body.querySelectorAll(
    ":scope > svg[id^='mmd-'], :scope > svg[id^='dmmd-'], :scope > div[id^='dmmd-']",
  )) {
    el.remove();
  }
}

export function MermaidDiagram({ code }: { code: string }) {
  const dark = useDarkMode();
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(`mmd-${(mermaidSeq += 1)}`);

  useEffect(() => {
    let cancelled = false;
    // Mermaid (~3 MB) is loaded on demand, only when a diagram is rendered —
    // it never weighs on the initial page load.
    void import("mermaid").then(({ default: mermaid }) => {
      if (cancelled) return;
      mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      fontFamily: "inherit",
      // Ohne das malt mermaid bei einem Syntaxfehler seine eigene riesige
      // Fehlergrafik ("Syntax error in text — mermaid version 11.x") direkt in
      // den <body> — sie hängt dann quer über der Oberfläche. Wir fangen den
      // Fehler unten selbst ab und zeigen stattdessen den Quelltext.
      suppressErrorRendering: true,
      theme: dark ? "dark" : "default",
      themeVariables: dark
        ? { background: "transparent", primaryColor: "#1e293b" }
        : { background: "transparent" },
    });
      // Erst prüfen, dann zeichnen. mermaid.parse() fasst das DOM nicht an —
      // render() dagegen legt seine Messknoten an, bevor es merkt, dass der
      // Graph kaputt ist, und dann steht die riesige "Syntax error in text"-
      // Grafik quer über der Oberfläche. Mit suppressErrors wirft parse nicht,
      // sondern liefert false.
      void Promise.resolve(
        mermaid.parse(code.trim(), { suppressErrors: true }),
      ).then((valid) => {
        if (cancelled) return;
        if (!valid) {
          setError("invalid diagram");
          return;
        }
        return mermaid
        .render(`${idRef.current}-${dark ? "d" : "l"}`, code.trim())
        .then(({ svg }) => {
          if (!cancelled) {
            setSvg(svg);
            setError(null);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err.message : String(err));
          cleanupMermaidNodes(idRef.current, dark);
        });
      });
    });
    return () => {
      cancelled = true;
      cleanupMermaidNodes(idRef.current, dark);
    };
  }, [code, dark]);

  if (error) {
    return (
      <div className="border-border bg-secondary/40 my-3 overflow-x-auto rounded-xl border p-3">
        <div className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-xs font-medium">
          <AlertTriangle className="size-3.5" /> Diagramm
        </div>
        <pre className="text-xs whitespace-pre-wrap">{code.trim()}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="border-border bg-card text-muted-foreground my-3 flex items-center justify-center gap-2 rounded-xl border p-6 text-xs">
        <Loader2 className="size-4 animate-spin" /> Diagramm wird gezeichnet …
      </div>
    );
  }

  // Mermaid output is sanitized by its own strict security level.
  return <SvgDiagramFrame svg={svg} name="diagramm" background="card" />;
}

// ── SVG ───────────────────────────────────────────────────────────────
// Renders a ```svg fenced block as a real figure. The AI tutor emits native
// SVG markup directly (no TeX/WASM engine), so this cannot freeze the browser
// and works identically in local dev and deployed prod. Used for exam-style
// statics/physics schemas (beams, supports, loads, forces, dimensions) that
// mermaid/chart can't draw.
//
// SVG is injected via dangerouslySetInnerHTML (inside SvgDiagramFrame), so we
// sanitize it first — see lib/svg-sanitize.ts (scripts, on*, external hrefs,
// and SMIL animations restricted to presentation attributes).

export function SvgBlock({ code }: { code: string }) {
  const svg = sanitizeSvg(code);

  if (!svg || !/<svg[\s>]/i.test(svg)) {
    return (
      <div className="border-border bg-secondary/40 my-3 overflow-x-auto rounded-xl border p-3">
        <div className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-xs font-medium">
          <AlertTriangle className="size-3.5" /> Skizze konnte nicht gezeichnet werden
        </div>
      </div>
    );
  }

  // White "paper" background — a technical figure reads best on white and keeps
  // strokes visible in dark mode. Markup is sanitized above (no scripts).
  return <SvgDiagramFrame svg={svg} name="skizze" background="white" />;
}

// ── TikZ / CircuiTikz ─────────────────────────────────────────────────
//
// Compilé PAR LE SERVEUR, pas dans le navigateur.
//
// La première tentative faisait tourner un moteur TeX en WebAssembly dans
// l'onglet ; il gelait le fil principal, ce que Playwright avait confirmé.
// L'abandon était juste — mais la conclusion tirée alors, « on ne compile
// plus de TikZ », coûtait cher : le tuteur s'est mis à dessiner ses circuits
// en SVG à la main, segment par segment, et un amplificateur opérationnel
// placé à la main est de travers.
//
// `/api/tikz/render` compile avec pdflatex et met en cache par empreinte du
// contenu. Le navigateur ne fait que recevoir un SVG.
//
// ── Quand la compilation échoue ───────────────────────────────────────
//
// Elle échouera : LaTeX absent d'un environnement de développement, macro
// inconnue, image déployée sans circuitikz. On n'affiche alors PAS le code
// source — un étudiant à qui l'on montre du LaTeX brut au milieu d'une
// explication croit à une panne. On affiche une ligne honnête, et le texte
// autour du schéma continue d'enseigner.
// ── Quand compiler ────────────────────────────────────────────────────
//
// Incident du 5 novembre 2026 (« Kirchhoff ») : pendant que la réponse
// s'écrivait, ce composant recevait le bloc caractère par caractère et lançait
// une compilation à CHAQUE fragment — du LaTeX incomplet, donc 422 — puis se
// faisait bloquer par la limite de débit (une quinzaine de 429 en 300 ms).
// Le code final, lui, n'était jamais compilé : « Diese Skizze konnte nicht
// gezeichnet werden », alors que le schéma était correct.
//
// Désormais : on attend que le bloc soit COMPLET (\end{…} présent) et stable
// depuis 600 ms ; un même code n'est compilé qu'une fois par page ; un 429 est
// réessayé, ce n'est pas un échec.

const TIKZ_SETTLE_MS = 600;
const TIKZ_RETRIES = 3;
/** Une compilation par code et par page : remontages et re-rendus réutilisent le résultat. */
const tikzCache = new Map<string, Promise<string | null>>();

async function compileTikz(code: string): Promise<string | null> {
  for (let attempt = 0; attempt <= TIKZ_RETRIES; attempt++) {
    const r = await fetch("/api/tikz/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ code }),
    }).catch(() => null);
    if (r?.ok) return ((await r.json()) as { svg?: string }).svg || null;
    // Trop de demandes : patienter et réessayer. Toute autre réponse est un
    // vrai échec de compilation, inutile d'insister.
    if (r?.status !== 429 || attempt === TIKZ_RETRIES) return null;
    await new Promise((res) => setTimeout(res, 800 * 2 ** attempt));
  }
  return null;
}

function compileTikzOnce(code: string): Promise<string | null> {
  let p = tikzCache.get(code);
  if (!p) {
    p = compileTikz(code);
    tikzCache.set(code, p);
    // Un échec n'est pas mis en cache : rouvrir la conversation réessaie.
    void p.then((svg) => {
      if (!svg) tikzCache.delete(code);
    });
  }
  return p;
}

export function TikzDiagram({ code }: { code: string }) {
  const [svg, setSvg] = useState<string>("");
  const [failed, setFailed] = useState(false);
  const complete = isCompleteTikz(code);

  useEffect(() => {
    let cancelled = false;
    setSvg("");
    setFailed(false);
    if (!complete) return; // encore en cours d'écriture : on patiente

    const timer = setTimeout(() => {
      void compileTikzOnce(code).then((result) => {
        if (cancelled) return;
        if (result) setSvg(result);
        else setFailed(true);
      });
    }, TIKZ_SETTLE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code, complete]);

  if (failed) {
    return (
      <div className="border-border bg-secondary/40 text-muted-foreground my-3 flex items-center gap-2 rounded-xl border p-3 text-xs">
        <AlertTriangle className="size-3.5 shrink-0" />
        <span>Diese Skizze konnte nicht gezeichnet werden.</span>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="border-border bg-card text-muted-foreground my-3 flex items-center justify-center gap-2 rounded-xl border p-6 text-xs">
        <Loader2 className="size-4 animate-spin" /> Skizze wird gezeichnet …
      </div>
    );
  }

  // Le SVG vient de dvisvgm, donc de notre propre serveur — mais il est
  // injecté par innerHTML, et le code TikZ, lui, vient du modèle. On le
  // repasse par le même nettoyage que les blocs ```svg.
  return <SvgDiagramFrame svg={sanitizeSvg(svg)} name="skizze" background="white" />;
}
// ── Charts ──────────────────────────────────────────────────────────────
// Renders a ```chart fenced block. Expected JSON:
// {
//   "type": "line" | "scatter" | "bar",
//   "title": "Querkraftverlauf Q(x)",
//   "xLabel": "x [m]", "yLabel": "Q [kN]",
//   "series": [{ "label": "Q(x)", "data": [{ "x": 0, "y": 5 }, ...],
//                "color": "#6366f1", "fill": false }]
// }
type Point = { x: number; y: number };
type Series = {
  label?: string;
  data: (Point | number)[];
  color?: string;
  fill?: boolean;
};
type ChartSpec = {
  type?: "line" | "scatter" | "bar";
  title?: string;
  xLabel?: string;
  yLabel?: string;
  labels?: (string | number)[];
  series: Series[];
};

const PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#0ea5e9", "#a855f7"];

export function ChartBlock({ code }: { code: string }) {
  const dark = useDarkMode();

  let spec: ChartSpec | null = null;
  let parseError: string | null = null;
  try {
    spec = JSON.parse(code.trim()) as ChartSpec;
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
  }

  if (parseError || !spec || !Array.isArray(spec.series)) {
    return (
      <div className="border-border bg-secondary/40 my-3 overflow-x-auto rounded-xl border p-3">
        <div className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-xs font-medium">
          <AlertTriangle className="size-3.5" /> Diagramm-Daten
        </div>
        <pre className="text-xs whitespace-pre-wrap">{code.trim()}</pre>
      </div>
    );
  }

  const grid = dark ? "rgba(148,163,184,0.15)" : "rgba(100,116,139,0.15)";
  const tick = dark ? "#cbd5e1" : "#475569";
  const type = spec.type ?? "line";

  const datasets = spec.series.map((s, i) => {
    const color = s.color ?? PALETTE[i % PALETTE.length];
    return {
      label: s.label ?? `Serie ${i + 1}`,
      data: s.data as never,
      borderColor: color,
      backgroundColor:
        type === "bar"
          ? color
          : s.fill
            ? `${color}33`
            : color,
      fill: type === "line" ? (s.fill ?? false) : false,
      tension: 0.25,
      pointRadius: type === "scatter" ? 3 : 2,
      borderWidth: 2,
    };
  });

  const data = { labels: spec.labels, datasets } as ChartData<never>;

  const options: ChartOptions<never> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "nearest", intersect: false },
    plugins: {
      legend: {
        display: datasets.length > 1 || !!datasets[0]?.label,
        labels: { color: tick, boxWidth: 12, font: { size: 11 } },
      },
      title: spec.title
        ? { display: true, text: spec.title, color: tick, font: { size: 13, weight: "bold" } }
        : { display: false },
      tooltip: { intersect: false },
    },
    scales: {
      x: {
        type: type === "bar" ? "category" : "linear",
        title: spec.xLabel
          ? { display: true, text: spec.xLabel, color: tick, font: { size: 11 } }
          : { display: false },
        grid: { color: grid },
        ticks: { color: tick, font: { size: 10 } },
      },
      y: {
        title: spec.yLabel
          ? { display: true, text: spec.yLabel, color: tick, font: { size: 11 } }
          : { display: false },
        grid: { color: grid },
        ticks: { color: tick, font: { size: 10 } },
      },
    },
  } as ChartOptions<never>;

  const ChartComp = type === "scatter" ? Scatter : type === "bar" ? Bar : Line;

  return (
    <CanvasDiagramFrame
      name="diagramm"
      fullscreenChildren={<ChartComp data={data} options={options} />}
    >
      <div className="h-64 w-full">
        <ChartComp data={data} options={options} />
      </div>
    </CanvasDiagramFrame>
  );
}
