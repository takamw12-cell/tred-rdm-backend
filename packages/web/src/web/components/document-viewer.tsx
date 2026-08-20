import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { X, FileText, FileType, ExternalLink, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { documentGetOptions, documentFileUrlOptions } from "@/queries/documents";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

// Build a whitespace-tolerant, case-insensitive regex from a cited excerpt so
// small differences (line breaks vs. spaces) between the AI's quote and the
// stored text still match.
function buildQueryRegex(query: string): RegExp | null {
  const q = query.trim();
  if (q.length < 4) return null;
  const escaped = q
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  try {
    return new RegExp(escaped, "i");
  } catch {
    return null;
  }
}

// Render a page's text, wrapping the first regex match in a <mark> and scrolling
// it into view. Only used on the page that actually contains the citation.
function highlightNode(
  raw: string,
  re: RegExp | null,
  onMark: (el: HTMLElement | null) => void,
): ReactNode {
  if (!re) return raw;
  const m = re.exec(raw);
  if (!m) return raw;
  const start = m.index;
  const end = start + m[0].length;
  return (
    <>
      {raw.slice(0, start)}
      <mark
        ref={onMark}
        className="rounded bg-yellow-300/70 px-0.5 text-black dark:bg-yellow-400/80"
      >
        {raw.slice(start, end)}
      </mark>
      {raw.slice(end)}
    </>
  );
}

type Page = { n: number; text: string };

// Split the extracted text on [[SEITE n]] markers into labelled pages.
function splitPages(textContent: string): Page[] {
  const parts = textContent.split(/\[\[SEITE (\d+)\]\]/);
  const pages: Page[] = [];
  // parts[0] is any preamble before the first marker.
  if (parts[0]?.trim()) pages.push({ n: 0, text: parts[0] });
  for (let i = 1; i < parts.length; i += 2) {
    const n = Number(parts[i]);
    const text = parts[i + 1] ?? "";
    pages.push({ n, text });
  }
  if (pages.length === 0) pages.push({ n: 0, text: textContent });
  return pages;
}

export function DocumentViewer({
  docId,
  highlight = null,
  onClose,
}: {
  docId: string | null;
  highlight?: string | null;
  onClose: () => void;
}) {
  const { t } = useT();
  const open = docId !== null;
  const [tab, setTab] = useState<"pdf" | "text">("pdf");

  const docQuery = useQuery({
    ...documentGetOptions(docId ?? ""),
    enabled: open,
  });
  const urlQuery = useQuery({
    ...documentFileUrlOptions(docId ?? ""),
    enabled: open,
  });

  const doc = docQuery.data;
  const fileUrl = urlQuery.data?.url ?? null;
  // Der Schlüssel im signierten Link endet auf die Originalendung. Nur PDF und
  // Bilder kann der Browser im Rahmen anzeigen — Word- und PowerPoint-Dateien
  // würde er stumm herunterladen, was in einem Modal wie ein Fehler wirkt.
  const inlineViewable = useMemo(() => {
    if (!fileUrl) return false;
    const path = fileUrl.split("?")[0] ?? "";
    return /\.(pdf|png|jpe?g|webp|heic)$/i.test(path);
  }, [fileUrl]);
  const pdfUrl = inlineViewable ? fileUrl : null;
  const re = useMemo(() => (highlight ? buildQueryRegex(highlight) : null), [highlight]);

  const pages = useMemo(
    () => (doc?.textContent ? splitPages(doc.textContent) : []),
    [doc?.textContent],
  );

  // Which page holds the citation (first match). -1 = none.
  const matchPage = useMemo(() => {
    if (!re) return -1;
    for (let i = 0; i < pages.length; i++) {
      re.lastIndex = 0;
      if (re.test(pages[i].text)) return i;
    }
    return -1;
  }, [re, pages]);

  // When opened with a citation, jump straight to the text tab.
  useEffect(() => {
    if (!open) return;
    setTab(highlight ? "text" : "pdf");
  }, [open, highlight, docId]);

  // Ohne anzeigbare Originaldatei bleibt nur die Textansicht.
  useEffect(() => {
    if (open && urlQuery.isSuccess && !pdfUrl) setTab("text");
  }, [open, urlQuery.isSuccess, pdfUrl]);

  const scrollMark = (el: HTMLElement | null) => {
    if (el) {
      // Defer so the element is laid out before scrolling.
      requestAnimationFrame(() =>
        el.scrollIntoView({ block: "center", behavior: "smooth" }),
      );
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          />
          <div className="fixed inset-0 z-50 grid place-items-center p-3 sm:p-6">
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: "spring", damping: 24, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card border-border relative flex h-full max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border shadow-xl"
            >
              {/* Header */}
              <div className="border-border flex items-center gap-3 border-b px-4 py-3">
                <FileText className="text-primary size-5 shrink-0" />
                <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {doc?.title ?? t("viewer.title")}
                </h2>
                <Button variant="ghost" size="icon" onClick={onClose} className="-mr-1">
                  <X className="size-4" />
                </Button>
              </div>

              {/* Tabs */}
              <div className="border-border flex items-center gap-1 border-b px-3 py-2">
                {inlineViewable && (
                  <button
                    onClick={() => setTab("pdf")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                      tab === "pdf"
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    <FileType className="size-3.5" /> {t("viewer.tabPdf")}
                  </button>
                )}
                <button
                  onClick={() => setTab("text")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    tab === "text"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  <FileText className="size-3.5" /> {t("viewer.tabText")}
                </button>
                {(tab === "pdf" || !inlineViewable) && fileUrl && (
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
                  >
                    <ExternalLink className="size-3.5" /> {t("viewer.openInTab")}
                  </a>
                )}
              </div>

              {/* Body */}
              <div className="min-h-0 flex-1 overflow-hidden">
                {docQuery.isLoading ? (
                  <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
                    <Loader2 className="size-4 animate-spin" /> {t("viewer.loading")}
                  </div>
                ) : tab === "pdf" ? (
                  urlQuery.isLoading ? (
                    <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
                      <Loader2 className="size-4 animate-spin" /> {t("viewer.loading")}
                    </div>
                  ) : pdfUrl ? (
                    <iframe
                      src={pdfUrl}
                      title={doc?.title ?? "PDF"}
                      className="h-full w-full border-0 bg-neutral-100 dark:bg-neutral-900"
                    />
                  ) : (
                    <div className="text-muted-foreground mx-auto flex h-full max-w-md flex-col items-center justify-center gap-3 p-6 text-center text-sm">
                      <AlertTriangle className="size-6" />
                      {t("viewer.noPdf")}
                    </div>
                  )
                ) : (
                  <div className="h-full overflow-y-auto px-5 py-4">
                    {highlight && matchPage === -1 && (
                      <div className="border-border bg-secondary/40 text-muted-foreground mb-4 flex items-center gap-2 rounded-lg border p-3 text-xs">
                        <AlertTriangle className="size-3.5 shrink-0" />
                        {t("viewer.sourceNotFound")}
                      </div>
                    )}
                    <div className="mx-auto max-w-2xl space-y-6">
                      {pages.map((page, i) => (
                        <div key={i}>
                          {page.n > 0 && (
                            <div className="text-muted-foreground mb-1.5 text-[11px] font-semibold tracking-wide uppercase">
                              {t("viewer.page", { page: page.n })}
                            </div>
                          )}
                          <p className="text-foreground/90 text-sm leading-relaxed whitespace-pre-wrap">
                            {i === matchPage
                              ? highlightNode(page.text, re, scrollMark)
                              : page.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
