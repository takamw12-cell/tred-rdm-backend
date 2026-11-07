import { MAX_TRACE_STEPS, TRACE_HARNESS, parseTrace, type TraceResult } from "../../api/lib/solvers/variable-tracer";

/**
 * Python im Browser — für Datenverarbeitung (Ausführen + Variablentabelle).
 *
 * Pyodide (CPython 3.14 als WebAssembly, MPL-2.0, offizielles CDN) läuft:
 *   - in einem <iframe sandbox="allow-scripts"> OHNE allow-same-origin :
 *     eigener, undurchsichtiger Ursprung → kein Zugriff auf Cookies, die
 *     Sitzung, localStorage oder die API von TRED. Code aus einer Antwort
 *     (die ein manipuliertes PDF beeinflusst haben könnte) kann also nichts
 *     im Namen der/des Studierenden tun ;
 *   - darin in einem Web Worker : eine Endlosschleife friert die Seite nicht
 *     ein, nach TIMEOUT_MS wird der Worker beendet und neu gestartet.
 *
 * Kein Server, keine Kosten : ~12 MB beim ersten Mal, danach aus dem
 * Browser-Cache. Version exakt angegeben (veröffentlicht am 14.09.2026).
 */

export const PYODIDE_VERSION = "314.0.7";
const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const TIMEOUT_MS = 12_000;

export interface RunResult {
  ok: boolean;
  stdout: string;
  error?: string;
  errorLine?: number;
  timedOut?: boolean;
}

/**
 * Läuft im Worker (Modul-Worker : Pyodide 314 unterstützt keine klassischen
 * Worker mehr). Kein Zugriff auf irgendetwas außer Pyodide.
 */
const WORKER_SRC = `
let py = null;
const boot = import(${JSON.stringify(INDEX_URL + "pyodide.mjs")}).then((m) => m.loadPyodide({ indexURL: ${JSON.stringify(INDEX_URL)} })).then((p) => {
  py = p;
  py.runPython(${JSON.stringify(TRACE_HARNESS)});
  postMessage({ type: "ready" });
}).catch((e) => postMessage({ type: "boot-error", error: String(e && e.message || e) }));
onmessage = async (e) => {
  const { id, code, stdin, trace } = e.data;
  try {
    await boot;
    try { await py.loadPackagesFromImports(code); } catch (_) {}
    const fn = py.globals.get("__tred_trace");
    const json = fn(code, stdin || "", trace ? ${MAX_TRACE_STEPS} : 0);
    fn.destroy();
    postMessage({ type: "result", id, json });
  } catch (err) {
    postMessage({ type: "result", id, json: JSON.stringify({ ok: false, rows: [], stdout: "", error: String(err && err.message || err) }) });
  }
};
`;

/** Läuft im Sandbox-Iframe : Vermittler zwischen Seite und Worker, mit Zeitlimit. */
const FRAME_SRC = `<!doctype html><meta charset="utf-8"><script>
const WSRC = ${JSON.stringify(WORKER_SRC).replace(/</g, "\\u003c")};
let worker = null, ready = false, queue = [], timers = new Map();
function start() {
  ready = false;
  // URL data: + type module : dans une origine opaque, un Worker « blob: »
  // ne démarre pas et importScripts échoue ; celui-ci fonctionne (testé Edge).
  worker = new Worker("data:text/javascript;charset=utf-8," + encodeURIComponent(WSRC), { type: "module" });
  worker.onmessage = (e) => {
    const d = e.data;
    if (d.type === "ready") { ready = true; parent.postMessage({ type: "ready" }, "*"); queue.splice(0).forEach(send); return; }
    if (d.type === "boot-error") { parent.postMessage({ type: "boot-error", error: d.error }, "*"); return; }
    clearTimeout(timers.get(d.id)); timers.delete(d.id);
    parent.postMessage(d, "*");
  };
}
function send(m) {
  worker.postMessage(m);
  timers.set(m.id, setTimeout(() => {
    worker.terminate();
    timers.forEach((t, id) => { clearTimeout(t); parent.postMessage({ type: "timeout", id }, "*"); });
    timers.clear();
    start();
  }, ${TIMEOUT_MS}));
}
addEventListener("message", (e) => {
  if (e.source !== parent) return;
  if (ready) send(e.data); else queue.push(e.data);
});
start();
</script>`;

let frame: HTMLIFrameElement | null = null;
let seq = 0;
const waiting = new Map<number, (r: { json?: string; timeout?: boolean; bootError?: string }) => void>();
let status: "idle" | "loading" | "ready" | "failed" = "idle";
const statusListeners = new Set<(s: typeof status) => void>();

function setStatus(s: typeof status) {
  status = s;
  statusListeners.forEach((fn) => fn(s));
}

export function onPythonStatus(fn: (s: typeof status) => void): () => void {
  statusListeners.add(fn);
  fn(status);
  return () => statusListeners.delete(fn);
}

function ensureFrame(): HTMLIFrameElement {
  if (frame && document.body.contains(frame)) return frame;
  frame = document.createElement("iframe");
  // allow-scripts SANS allow-same-origin : origine opaque, aucune session.
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden";
  frame.srcdoc = FRAME_SRC;
  setStatus("loading");
  window.addEventListener("message", (e) => {
    if (!frame || e.source !== frame.contentWindow) return;
    const d = e.data as { type?: string; id?: number; json?: string; error?: string };
    if (d.type === "ready") setStatus("ready");
    else if (d.type === "boot-error") {
      setStatus("failed");
      waiting.forEach((resolve) => resolve({ bootError: d.error }));
      waiting.clear();
    } else if ((d.type === "result" || d.type === "timeout") && typeof d.id === "number") {
      const resolve = waiting.get(d.id);
      waiting.delete(d.id);
      resolve?.(d.type === "timeout" ? { timeout: true } : { json: d.json });
    }
  });
  document.body.appendChild(frame);
  return frame;
}

async function call(code: string, stdin: string, trace: boolean): Promise<TraceResult & { timedOut?: boolean }> {
  const f = ensureFrame();
  const id = ++seq;
  const answer = await new Promise<{ json?: string; timeout?: boolean; bootError?: string }>((resolve) => {
    waiting.set(id, resolve);
    const post = () => f.contentWindow?.postMessage({ id, code, stdin, trace }, "*");
    if (f.contentWindow && f.dataset.loaded) post();
    else
      f.addEventListener(
        "load",
        () => {
          f.dataset.loaded = "1";
          post();
        },
        { once: true },
      );
  });
  if (answer.bootError) return { ok: false, rows: [], stdout: "", error: `Python konnte nicht geladen werden: ${answer.bootError}` };
  if (answer.timeout) return { ok: false, rows: [], stdout: "", timedOut: true };
  return parseTrace(answer.json ?? "");
}

/** Führt das Programm aus (ohne Tabelle). */
export async function runPython(code: string, stdin = ""): Promise<RunResult> {
  const r = await call(code, stdin, false);
  return { ok: r.ok, stdout: r.stdout, error: r.error, errorLine: r.errorLine, timedOut: r.timedOut };
}

/** Führt das Programm Zeile für Zeile aus und liefert die Variablentabelle. */
export function tracePython(code: string, stdin = ""): Promise<TraceResult & { timedOut?: boolean }> {
  return call(code, stdin, true);
}
