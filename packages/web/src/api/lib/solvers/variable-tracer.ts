/**
 * Datenverarbeitung — Variablentabelle (« Variable Tracer ») für Python.
 *
 * Die typische Klausuraufgabe « Was gibt das Programm aus? Notieren Sie die
 * Werte der Variablen nach jeder Zeile » rechnet ein Sprachmodell im Kopf
 * und liegt dabei gern eine Schleifenrunde daneben. Hier läuft der Code
 * WIRKLICH: im Browser der/des Studierenden (Pyodide, siehe
 * web/lib/python-sandbox.ts), mit `sys.settrace` — jede ausgeführte Zeile
 * ergibt eine Zeile der Tabelle mit den Variablenwerten danach.
 *
 * Dieses Modul ist reines TypeScript ohne Abhängigkeiten: das Python-Skript
 * des Tracers, die Typen und die Auswertung (getestet in
 * tests/variable-tracer.test.ts).
 */

/** Höchstens so viele Schritte — eine Endlosschleife soll eine Tabelle ergeben, keinen Absturz. */
export const MAX_TRACE_STEPS = 400;
/** Länge eines Variablenwerts in der Tabelle. */
export const MAX_VALUE_CHARS = 60;

export interface TraceRow {
  /** Laufende Nummer des Schritts (1, 2, …). */
  step: number;
  /** Ausgeführte Zeile im Quelltext (1-basiert). */
  line: number;
  /** Funktion, in der die Zeile steht ("<module>" = Hauptprogramm). */
  scope: string;
  /** Variablen NACH der Zeile (Name → repr). */
  vars: Record<string, string>;
  /** Was diese Zeile ausgegeben hat (print). */
  output: string;
  /** Rückgabewert, wenn die Zeile eine Funktion verlässt. */
  returned?: string;
}

export interface TraceResult {
  ok: boolean;
  rows: TraceRow[];
  /** Gesamte Ausgabe des Programms. */
  stdout: string;
  /** Python-Fehlermeldung (letzte Zeile des Tracebacks), falls einer auftrat. */
  error?: string;
  /** Zeile des Fehlers. */
  errorLine?: number;
  /** Abgebrochen, weil MAX_TRACE_STEPS erreicht war. */
  truncated?: boolean;
}

/**
 * Das Python-Skript des Tracers. Es definiert `__tred_trace(src, stdin)`,
 * das ein JSON (TraceResult) zurückgibt. Die Variablen werden mit `repr`
 * gezeigt — genau so, wie sie in einer Klausurlösung stehen: 'abc' mit
 * Anführungszeichen, [1, 2] als Liste.
 */
export const TRACE_HARNESS = String.raw`
import sys, io, json, types, traceback, builtins

class __TredStop(Exception):
    pass

def __tred_trace(src, stdin_text, max_steps=${MAX_TRACE_STEPS}, max_chars=${MAX_VALUE_CHARS}):
    rows = []
    out = io.StringIO()
    printed = [0]
    pending = {}
    lines_in = iter(stdin_text.splitlines())

    def fake_input(prompt=""):
        out.write(str(prompt))
        try:
            value = next(lines_in)
        except StopIteration:
            raise EOFError("input(): keine Eingabe mehr — trage die Eingaben im Feld darüber ein (eine pro Zeile).")
        out.write(value + "\n")
        return value

    def short(v):
        try:
            r = repr(v)
        except Exception:
            r = "<?>"
        return r if len(r) <= max_chars else r[: max_chars - 1] + "…"

    def snapshot(frame):
        res = {}
        for k, v in list(frame.f_locals.items()):
            if k.startswith("__") or isinstance(v, (types.ModuleType, types.FunctionType, type, types.BuiltinFunctionType)):
                continue
            res[k] = short(v)
        return res

    def emit(frame, line, returned=None):
        text = out.getvalue()
        row = {
            "step": len(rows) + 1,
            "line": line,
            "scope": frame.f_code.co_name,
            "vars": snapshot(frame),
            "output": text[printed[0]:],
        }
        printed[0] = len(text)
        if returned is not None:
            row["returned"] = returned
        rows.append(row)
        if len(rows) >= max_steps:
            raise __TredStop()

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != "<student>":
            return None
        key = id(frame)
        if event == "line":
            if key in pending:
                emit(frame, pending[key])
            pending[key] = frame.f_lineno
        elif event == "return":
            if key in pending:
                emit(frame, pending.pop(key), None if frame.f_code.co_name == "<module>" else short(arg))
        return tracer

    g = {"__name__": "__main__", "__builtins__": builtins}
    old_out, old_input = sys.stdout, builtins.input
    result = {"ok": True}
    try:
        code = compile(src, "<student>", "exec")
        sys.stdout = out
        builtins.input = fake_input
        # max_steps = 0 : simple exécution, sans tableau.
        if max_steps:
            sys.settrace(tracer)
        exec(code, g)
    except __TredStop:
        result["truncated"] = True
    except SyntaxError as e:
        result["ok"] = False
        result["error"] = "SyntaxError: " + str(e.msg)
        result["errorLine"] = e.lineno
    except BaseException as e:
        result["ok"] = False
        result["error"] = type(e).__name__ + ": " + str(e)
        tb = traceback.extract_tb(e.__traceback__)
        mine = [f for f in tb if f.filename == "<student>"]
        if mine:
            result["errorLine"] = mine[-1].lineno
    finally:
        sys.settrace(None)
        sys.stdout = old_out
        builtins.input = old_input
    result["rows"] = rows
    result["stdout"] = out.getvalue()
    return json.dumps(result)
`;

/** Liest das JSON des Tracers; alles Unerwartete wird verworfen. */
export function parseTrace(json: string): TraceResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, rows: [], stdout: "", error: "Tracer-Ausgabe unlesbar." };
  }
  const o = (raw ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(o.rows)
    ? o.rows.slice(0, MAX_TRACE_STEPS).map((r, i): TraceRow => {
        const x = (r ?? {}) as Record<string, unknown>;
        const vars: Record<string, string> = {};
        if (x.vars && typeof x.vars === "object") {
          for (const [k, v] of Object.entries(x.vars as Record<string, unknown>)) vars[k] = String(v);
        }
        return {
          step: i + 1,
          line: Number(x.line) || 0,
          scope: String(x.scope ?? "<module>"),
          vars,
          output: String(x.output ?? ""),
          returned: x.returned === undefined ? undefined : String(x.returned),
        };
      })
    : [];
  return {
    ok: o.ok === true,
    rows,
    stdout: String(o.stdout ?? ""),
    error: o.error === undefined ? undefined : String(o.error),
    errorLine: typeof o.errorLine === "number" ? o.errorLine : undefined,
    truncated: o.truncated === true,
  };
}

/** Alle Variablennamen in der Reihenfolge ihres ersten Auftretens — die Spalten der Tabelle. */
export function traceColumns(rows: TraceRow[]): string[] {
  const seen: string[] = [];
  for (const r of rows) for (const k of Object.keys(r.vars)) if (!seen.includes(k)) seen.push(k);
  return seen;
}

/** Welche Variablen hat dieser Schritt geändert (gegenüber dem vorigen Schritt im selben Bereich)? */
export function changedInRow(rows: TraceRow[], index: number): Set<string> {
  const row = rows[index];
  const changed = new Set<string>();
  if (!row) return changed;
  let prev: TraceRow | undefined;
  for (let i = index - 1; i >= 0; i--) {
    if (rows[i].scope === row.scope) {
      prev = rows[i];
      break;
    }
  }
  for (const [k, v] of Object.entries(row.vars)) if (prev?.vars[k] !== v) changed.add(k);
  return changed;
}

/**
 * Die Tabelle als Markdown — für « In den Chat übernehmen »: der Tutor sieht
 * dann die ECHTEN Werte und erklärt mit ihnen.
 */
export function traceToMarkdown(code: string, t: TraceResult, maxRows = 60): string {
  const src = code.split("\n");
  const cols = traceColumns(t.rows);
  const head = ["Schritt", "Zeile", "Code", ...cols, "Ausgabe"];
  const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, "⏎ ").trim();
  const lines = [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`];
  for (const r of t.rows.slice(0, maxRows)) {
    const codeLine = esc(src[r.line - 1] ?? "");
    const cells = cols.map((c) => esc(r.vars[c] ?? ""));
    lines.push(`| ${r.step} | ${r.line} | \`${codeLine}\` | ${cells.join(" | ")} | ${esc(r.output)} |`);
  }
  if (t.rows.length > maxRows) lines.push(`\n… ${t.rows.length - maxRows} weitere Schritte.`);
  if (t.error) lines.push(`\nFehler${t.errorLine ? ` in Zeile ${t.errorLine}` : ""}: ${t.error}`);
  return lines.join("\n");
}
