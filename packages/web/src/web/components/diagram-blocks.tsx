import { useEffect, useRef, useState } from "react";
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
// sanitize it first: strip <script> tags, inline event-handler attributes
// (on*), and any external resource references (href/xlink:href) that could
// leak requests or execute code.
function sanitizeSvg(raw: string): string {
  let svg = raw.trim();

  // Keep only the <svg>…</svg> region if the model wrapped it in prose.
  const start = svg.toLowerCase().indexOf("<svg");
  const end = svg.toLowerCase().lastIndexOf("</svg>");
  if (start >= 0 && end > start) svg = svg.slice(start, end + "</svg>".length);

  // Drop <script>…</script> blocks entirely.
  svg = svg.replace(/<script[\s\S]*?<\/script>/gi, "");
  // Drop <foreignObject> (can embed arbitrary HTML/scripts).
  svg = svg.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "");
  // Strip inline event handlers: onload="…", onclick='…', onmouseover=… .
  svg = svg.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "");
  svg = svg.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
  svg = svg.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
  // Neutralise external / javascript references in href and xlink:href.
  svg = svg.replace(
    /\s(?:xlink:)?href\s*=\s*"(?!#)[^"]*"/gi,
    "",
  );
  svg = svg.replace(
    /\s(?:xlink:)?href\s*=\s*'(?!#)[^']*'/gi,
    "",
  );

  return svg.trim();
}

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

// ── TikZ (legacy) ─────────────────────────────────────────────────────
// Older conversations may still contain ```tikz blocks. We no longer compile
// TikZ (the WASM engine froze the browser and prod has no LaTeX toolchain).
// Instead of dumping raw code at the user, show a clean neutral placeholder.
// New sketches are emitted as native ```svg blocks (see SvgBlock above).
export function TikzDiagram(_props: { code: string }) {
  return (
    <div className="border-border bg-secondary/40 text-muted-foreground my-3 flex items-center gap-2 rounded-xl border p-4 text-xs">
      <AlertTriangle className="size-3.5 shrink-0" />
      <span>
        Diese Skizze wurde in einem älteren Format erstellt und kann hier nicht
        mehr angezeigt werden. Bitte den Tutor um eine neue Skizze.
      </span>
    </div>
  );
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
