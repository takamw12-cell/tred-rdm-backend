import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Sigma,
  List,
  Eye,
  Pencil,
  Send,
  Trash2,
  FileDown,
  Check,
} from "lucide-react";
import { MarkdownContent } from "@/components/markdown-content";
import { useScratchpadStore } from "@/stores/scratchpad";
import { printElement } from "@/lib/pdf-print";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

// A brouillon / scratchpad panel next to the chat: free text + LaTeX with a
// live preview, a small formatting toolbar, autosave, send-to-AI and PDF export.
export function Scratchpad({
  onSendToAi,
  busy,
}: {
  onSendToAi: (text: string) => void;
  busy?: boolean;
}) {
  const { t } = useT();
  const content = useScratchpadStore((s) => s.content);
  const setContent = useScratchpadStore((s) => s.setContent);
  const clear = useScratchpadStore((s) => s.clear);

  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [savedFlash, setSavedFlash] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // "Saved" indicator: flash briefly after typing settles.
  useEffect(() => {
    if (!content) return;
    const id = setTimeout(() => {
      setSavedFlash(true);
      const off = setTimeout(() => setSavedFlash(false), 1200);
      return () => clearTimeout(off);
    }, 500);
    return () => clearTimeout(id);
  }, [content]);

  // Wrap the current selection (or insert a snippet) in the textarea.
  function surround(before: string, after: string, placeholder: string) {
    const ta = taRef.current;
    if (!ta) {
      setContent(content + before + placeholder + after);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = content.slice(start, end) || placeholder;
    const next = content.slice(0, start) + before + sel + after + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + before.length;
      ta.setSelectionRange(pos, pos + sel.length);
    });
  }

  function insertLine(prefix: string) {
    const ta = taRef.current;
    const start = ta?.selectionStart ?? content.length;
    const lineStart = content.lastIndexOf("\n", start - 1) + 1;
    const next = content.slice(0, lineStart) + prefix + content.slice(lineStart);
    setContent(next);
    requestAnimationFrame(() => ta?.focus());
  }

  function exportPdf() {
    printElement(printRef.current, { title: t("scratchpad.title") });
  }

  function handleClear() {
    if (content.trim() && !window.confirm(t("scratchpad.confirmClear"))) return;
    clear();
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-border flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t("scratchpad.title")}</p>
          <p className="text-muted-foreground truncate text-xs">
            {savedFlash ? (
              <span className="text-primary inline-flex items-center gap-1">
                <Check className="size-3" />
                {t("scratchpad.saved")}
              </span>
            ) : (
              t("scratchpad.subtitle")
            )}
          </p>
        </div>
        <div className="bg-secondary flex shrink-0 gap-0.5 rounded-lg p-0.5">
          <button
            onClick={() => setMode("edit")}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
              mode === "edit" ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            <Pencil className="size-3.5" />
            <span className="hidden sm:inline">{t("scratchpad.edit")}</span>
          </button>
          <button
            onClick={() => setMode("preview")}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
              mode === "preview" ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            <Eye className="size-3.5" />
            <span className="hidden sm:inline">{t("scratchpad.preview")}</span>
          </button>
        </div>
      </div>

      {/* Toolbar */}
      {mode === "edit" && (
        <div className="border-border flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
          <ToolBtn label={t("scratchpad.bold")} onClick={() => surround("**", "**", "Text")}>
            <Bold className="size-3.5" />
          </ToolBtn>
          <ToolBtn label={t("scratchpad.italic")} onClick={() => surround("*", "*", "Text")}>
            <Italic className="size-3.5" />
          </ToolBtn>
          <ToolBtn label={t("scratchpad.formula")} onClick={() => surround("$", "$", "x^2")}>
            <Sigma className="size-3.5" />
          </ToolBtn>
          <ToolBtn label={t("scratchpad.list")} onClick={() => insertLine("- ")}>
            <List className="size-3.5" />
          </ToolBtn>
        </div>
      )}

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {mode === "edit" ? (
          <textarea
            ref={taRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t("scratchpad.placeholder")}
            className="h-full min-h-full w-full resize-none bg-transparent p-3 font-mono text-sm outline-none"
            spellCheck={false}
          />
        ) : content.trim() ? (
          <div className="p-3">
            <MarkdownContent content={content} />
          </div>
        ) : (
          <p className="text-muted-foreground p-3 text-sm">{t("scratchpad.empty")}</p>
        )}
      </div>

      {/* Footer actions */}
      <div className="border-border flex flex-wrap items-center gap-1.5 border-t px-2 py-2">
        <button
          onClick={() => content.trim() && onSendToAi(content)}
          disabled={!content.trim() || busy}
          className="bg-primary text-primary-foreground flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-50"
        >
          <Send className="size-3.5" />
          {t("scratchpad.sendToAi")}
        </button>
        <button
          onClick={exportPdf}
          disabled={!content.trim()}
          className="border-border text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
        >
          <FileDown className="size-3.5" />
          {t("scratchpad.exportPdf")}
        </button>
        <button
          onClick={handleClear}
          disabled={!content.trim()}
          className="text-muted-foreground hover:text-destructive ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
        >
          <Trash2 className="size-3.5" />
          {t("scratchpad.clear")}
        </button>
      </div>

      {/* Hidden render used only for PDF export (proper KaTeX + markdown). */}
      <div className="pointer-events-none absolute -left-[9999px] top-0 w-[720px]" aria-hidden>
        <div ref={printRef}>
          <MarkdownContent content={content} />
        </div>
      </div>
    </div>
  );
}

function ToolBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="text-muted-foreground hover:text-foreground hover:bg-accent grid size-7 place-items-center rounded-md transition-colors"
    >
      {children}
    </button>
  );
}
