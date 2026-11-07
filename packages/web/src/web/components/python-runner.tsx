import { useContext, useEffect, useState } from "react";
import { Loader2, Send, X } from "lucide-react";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { onPythonStatus, runPython, tracePython, type RunResult } from "@/lib/python-sandbox";
import {
  changedInRow,
  traceColumns,
  traceToMarkdown,
  type TraceResult,
} from "../../api/lib/solvers/variable-tracer";
import { CodeSendContext } from "@/components/code-block";

/**
 * Sortie d'un bloc ```python : exécution réelle (Pyodide, bac à sable) ou
 * tableau des variables ligne par ligne. Monté sous le code, dans le même
 * cadre sombre.
 */
export function PythonRunner({
  code,
  mode,
  onClose,
}: {
  code: string;
  mode: "run" | "trace";
  onClose: () => void;
}) {
  const { t } = useT();
  const send = useContext(CodeSendContext);
  const needsInput = /\binput\s*\(/.test(code);
  const [stdin, setStdin] = useState("");
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(false);
  const [run, setRun] = useState<(RunResult & { timedOut?: boolean }) | null>(null);
  const [trace, setTrace] = useState<(TraceResult & { timedOut?: boolean }) | null>(null);

  useEffect(() => onPythonStatus((s) => setBooting(s === "loading")), []);

  async function go() {
    setBusy(true);
    setRun(null);
    setTrace(null);
    try {
      if (mode === "run") setRun(await runPython(code, stdin));
      else setTrace(await tracePython(code, stdin));
    } finally {
      setBusy(false);
    }
  }

  // Sans input() : on lance tout de suite. Avec : l'étudiant saisit d'abord.
  useEffect(() => {
    if (!needsInput) void go();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, code]);

  const result = run ?? trace;
  const src = code.split("\n");
  const cols = trace ? traceColumns(trace.rows) : [];

  return (
    <div className="not-prose border-t border-[#2b3038] bg-[#21252b] px-3 py-2.5 text-xs text-[#d7dae0]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold tracking-wide text-[#EAB308] uppercase">
          {mode === "run" ? t("pyRun.output") : t("pyRun.traceTitle")}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-[#abb2bf] hover:bg-white/10 hover:text-white"
          aria-label={t("common.close")}
        >
          <X className="size-3.5" />
        </button>
      </div>

      {needsInput && (
        <div className="mb-2 space-y-1.5">
          <label htmlFor="py-stdin" className="block text-[11px] text-[#abb2bf]">
            {t("pyRun.stdinLabel")}
          </label>
          <textarea
            id="py-stdin"
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            rows={2}
            className="w-full resize-y rounded-md border border-white/10 bg-black/30 px-2 py-1 font-mono text-xs text-white outline-none focus:border-[#EAB308]"
          />
          <button
            type="button"
            onClick={() => void go()}
            disabled={busy}
            className="rounded-md bg-[#EAB308] px-2.5 py-1 text-[11px] font-semibold text-[#0F172A] hover:bg-[#CA8A04] disabled:opacity-60"
          >
            {mode === "run" ? t("pyRun.run") : t("pyRun.trace")}
          </button>
        </div>
      )}

      {busy && (
        <p className="flex items-center gap-2 text-[#abb2bf]">
          <Loader2 className="size-3.5 animate-spin" />
          {booting ? t("pyRun.loading") : t("pyRun.running")}
        </p>
      )}

      {result?.timedOut && <p className="text-red-300">{t("pyRun.timeout")}</p>}

      {run && !run.timedOut && (
        <pre className="max-h-64 overflow-auto font-mono leading-relaxed whitespace-pre-wrap">
          {run.stdout || (run.ok ? <span className="text-[#7f8692]">{t("pyRun.noOutput")}</span> : null)}
        </pre>
      )}

      {trace && !trace.timedOut && trace.rows.length > 0 && (
        <div className="max-h-80 overflow-auto rounded-md border border-white/10">
          <table className="w-full border-collapse font-mono text-[11px]">
            <thead className="sticky top-0 bg-[#2c313a] text-[#EAB308]">
              <tr>
                <th className="px-2 py-1 text-left font-semibold">#</th>
                <th className="px-2 py-1 text-left font-semibold">{t("pyRun.line")}</th>
                {cols.map((c) => (
                  <th key={c} className="px-2 py-1 text-left font-semibold">
                    {c}
                  </th>
                ))}
                <th className="px-2 py-1 text-left font-semibold">{t("pyRun.printed")}</th>
                {/* Le code en dernier : dans la colonne étroite du chat, les
                    variables restent visibles sans défilement. */}
                <th className="px-2 py-1 text-left font-semibold">{t("pyRun.code")}</th>
              </tr>
            </thead>
            <tbody>
              {trace.rows.map((r, i) => {
                const changed = changedInRow(trace.rows, i);
                return (
                  <tr key={r.step} className="border-t border-white/5 align-top">
                    <td className="px-2 py-0.5 text-[#7f8692]">{r.step}</td>
                    <td className="px-2 py-0.5 text-[#7f8692]" title={src[r.line - 1]}>
                      {r.line}
                    </td>
                    {cols.map((c) => (
                      <td
                        key={c}
                        className={cn(
                          "px-2 py-0.5 whitespace-nowrap",
                          changed.has(c) ? "font-semibold text-[#EAB308]" : "text-[#abb2bf]",
                        )}
                      >
                        {r.vars[c] ?? ""}
                      </td>
                    ))}
                    <td className="px-2 py-0.5 whitespace-pre text-[#98c379]">{r.output.trimEnd()}</td>
                    <td className="max-w-[16rem] truncate px-2 py-0.5 text-[#d7dae0]" title={src[r.line - 1]}>
                      {(src[r.line - 1] ?? "").trim()}
                      {r.returned !== undefined && <span className="text-[#98c379]"> → {r.returned}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {trace?.truncated && <p className="mt-1.5 text-[#abb2bf]">{t("pyRun.truncated")}</p>}

      {result && !result.timedOut && result.error && (
        <p className="mt-2 font-mono text-red-300">
          {result.errorLine ? `${t("pyRun.line")} ${result.errorLine}: ` : ""}
          {result.error}
        </p>
      )}

      {trace && !trace.timedOut && send && trace.rows.length > 0 && (
        <button
          type="button"
          onClick={() => send(`${t("pyRun.sharePrompt")}\n\n${traceToMarkdown(code, trace)}`)}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[#EAB308]/40 px-2.5 py-1 text-[11px] font-medium text-[#EAB308] hover:bg-[#EAB308]/10"
        >
          <Send className="size-3" />
          {t("pyRun.share")}
        </button>
      )}
    </div>
  );
}
