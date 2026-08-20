import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, ListOrdered } from "lucide-react";
import hljs from "highlight.js/lib/core";
import python from "highlight.js/lib/languages/python";
import matlab from "highlight.js/lib/languages/matlab";
import javascript from "highlight.js/lib/languages/javascript";
import cpp from "highlight.js/lib/languages/cpp";
import "highlight.js/styles/atom-one-dark.css";
import { useT } from "@/i18n";

hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("matlab", matlab);
hljs.registerLanguage("m", matlab);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("cpp", cpp);

// Chat provides this so a code block can ask the tutor to explain itself
// line by line. When absent (e.g. in exam/exercise pages) the button is hidden.
export const CodeExplainContext = createContext<((code: string, lang: string) => void) | null>(
  null,
);

function triggerDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const CODE_LANGS = new Set([
  "python",
  "py",
  "matlab",
  "m",
  "javascript",
  "js",
  "cpp",
  "c",
  "octave",
]);

export function isHighlightableLang(lang?: string): boolean {
  return !!lang && CODE_LANGS.has(lang.toLowerCase());
}

export function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const { t } = useT();
  const onExplain = useContext(CodeExplainContext);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const normLang = lang.toLowerCase();
  const isMatlab = normLang === "matlab" || normLang === "m" || normLang === "octave";
  const label = isMatlab ? t("calc.matlab") : normLang === "python" || normLang === "py" ? t("calc.python") : normLang;

  const highlighted = useMemo(() => {
    try {
      const hlLang = hljs.getLanguage(normLang) ? normLang : "plaintext";
      return hljs.highlight(code, { language: hlLang === "plaintext" ? "python" : hlLang }).value;
    } catch {
      return null;
    }
  }, [code, normLang]);

  useEffect(() => {
    if (ref.current && highlighted) ref.current.innerHTML = highlighted;
  }, [highlighted]);

  function copy() {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function download() {
    const ext = isMatlab ? "m" : "py";
    triggerDownload(code, `aerostudy-code.${ext}`);
  }

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-[#2b3038] bg-[#282c34]">
      <div className="flex items-center justify-between gap-2 border-b border-[#2b3038] px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#abb2bf]">
          {label}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={copy}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[#abb2bf] transition-colors hover:bg-white/10 hover:text-white"
            title={t("calc.copy")}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? t("calc.copied") : t("calc.copy")}
          </button>
          <button
            onClick={download}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[#abb2bf] transition-colors hover:bg-white/10 hover:text-white"
            title={isMatlab ? t("calc.downloadM") : t("calc.downloadPy")}
          >
            <Download className="size-3.5" />
            .{isMatlab ? "m" : "py"}
          </button>
          {onExplain && (
            <button
              onClick={() => onExplain(code, normLang)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[#abb2bf] transition-colors hover:bg-white/10 hover:text-white"
              title={t("calc.explain")}
            >
              <ListOrdered className="size-3.5" />
              <span className="hidden sm:inline">{t("calc.explain")}</span>
            </button>
          )}
        </div>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
        <code ref={ref} className={`hljs language-${normLang}`}>
          {code}
        </code>
      </pre>
    </div>
  );
}
