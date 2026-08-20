import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileText,
  Trash2,
  Loader2,
  BookOpen,
  ClipboardList,
  FileCheck,
  File,
  Sparkles,
  Eye,
} from "lucide-react";
import { DocumentViewer } from "./document-viewer";
import { Button } from "@/components/ui/button";
import {
  documentsListOptions,
  documentsListKey,
  documentRemoveOptions,
} from "@/queries/documents";
import { semestersListKey } from "@/queries/semesters";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

type DocKind = "vorlesung" | "uebung" | "klausur" | "other";

// Muss zur Liste in src/api/lib/extract.ts passen. Bilder und Fotos sind
// bewusst dabei: abfotografierte Tafelbilder und Mitschriften sind der
// häufigste "Upload" im Studium.
const ACCEPTED_EXTENSIONS = [
  "pdf", "docx", "pptx", "txt", "md", "csv",
  "png", "jpg", "jpeg", "webp", "heic",
] as const;

const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(",");

function hasAcceptedExtension(name: string): boolean {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  return (ACCEPTED_EXTENSIONS as readonly string[]).includes(ext);
}

const KIND_ICON: Record<DocKind, typeof BookOpen> = {
  vorlesung: BookOpen,
  uebung: ClipboardList,
  klausur: FileCheck,
  other: File,
};

// Guess the document type from its filename.
function guessKind(name: string): DocKind {
  const n = name.toLowerCase();
  if (n.includes("klausur") || n.includes("exam") || n.includes("prüf")) return "klausur";
  if (n.includes("übung") || n.includes("uebung") || n.includes("aufgabe") || n.includes("exercise"))
    return "uebung";
  if (n.includes("vorlesung") || n.includes("skript") || n.includes("lecture")) return "vorlesung";
  return "other";
}

export function DocumentLibrary({
  activeId,
  semesterId = null,
  onSelect,
}: {
  activeId: string | null;
  semesterId?: string | null;
  onSelect: (id: string | null, title?: string) => void;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [viewerDocId, setViewerDocId] = useState<string | null>(null);

  const { data: docs = [], isLoading } = useQuery(documentsListOptions(semesterId));
  const removeMut = useMutation(documentRemoveOptions());

  async function handleFiles(files: FileList | null) {
    setUploadError(null);
    const file = files?.[0];
    if (!file) return;
    if (!hasAcceptedExtension(file.name)) {
      setUploadError(t("library.onlyPdf"));
      return;
    }

    try {
      setProgress(t("library.processing"));
      const cleanTitle = file.name.replace(/\.[a-z0-9]{1,5}$/i, "");
      const form = new FormData();
      form.append("file", file);
      form.append("title", cleanTitle);
      form.append("kind", guessKind(file.name));
      if (semesterId) form.append("semesterId", semesterId);

      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (data.error === "unsupported_format") {
          setUploadError(t("library.onlyPdf"));
        } else if (data.error === "no_text") {
          setUploadError(t("library.scanned"));
        } else {
          setUploadError(t("library.uploadFailed", { msg: data.error ?? res.statusText }));
        }
        return;
      }

      const { id } = (await res.json()) as { id: string };
      await qc.invalidateQueries({ queryKey: documentsListKey() });
      await qc.invalidateQueries({ queryKey: semestersListKey() });
      onSelect(id, cleanTitle);
    } catch (err) {
      console.error("[upload] failed", err);
      const msg = err instanceof Error ? err.message : String(err);
      setUploadError(t("library.uploadFailed", { msg }));
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("library.deleteConfirm"))) return;
    await removeMut.mutateAsync({ id });
    await qc.invalidateQueries({ queryKey: documentsListKey() });
    await qc.invalidateQueries({ queryKey: semestersListKey() });
  }

  const busy = progress !== null;

  return (
    <div className="flex h-full flex-col">
      <div className="border-border flex h-12 items-center gap-2 border-b px-4">
        <FileText className="text-primary size-4" />
        <span className="text-sm font-semibold">{t("library.title")}</span>
      </div>

      <div className="p-3">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="brand-gradient h-10 w-full gap-2 text-sm font-semibold text-white"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {busy ? progress : t("library.upload")}
        </Button>
        {uploadError && (
          <p className="text-destructive mt-2 text-xs font-medium">{uploadError}</p>
        )}
      </div>

      {/* Whole-scope selector: chat across all docs in the current scope. */}
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "mx-3 mb-2 flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
          activeId === null
            ? "border-primary/50 bg-primary/10"
            : "border-border hover:bg-accent",
        )}
      >
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg",
            activeId === null ? "brand-gradient text-white" : "bg-secondary text-muted-foreground",
          )}
        >
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{t("library.allScope")}</p>
          <p className="text-muted-foreground text-xs">{t("library.allScopeSub")}</p>
        </div>
      </button>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {isLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 px-1 py-4 text-sm">
            <Loader2 className="size-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : docs.length === 0 ? (
          <p className="text-muted-foreground px-1 py-6 text-center text-sm">
            {t("library.empty")}
          </p>
        ) : (
          <div className="space-y-1.5">
            <AnimatePresence initial={false}>
              {docs.map((doc) => {
                const Icon = KIND_ICON[(doc.kind as DocKind) ?? "other"] ?? File;
                const active = doc.id === activeId;
                return (
                  <motion.div
                    key={doc.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className={cn(
                      "group flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                      active
                        ? "border-primary/50 bg-primary/10"
                        : "border-border hover:bg-accent",
                    )}
                    onClick={() => onSelect(doc.id, doc.title)}
                  >
                    <div
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-lg",
                        active ? "brand-gradient text-white" : "bg-secondary text-muted-foreground",
                      )}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{doc.title}</p>
                      <p className="text-muted-foreground text-xs">
                        {t("library.pages", { count: doc.pageCount })}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewerDocId(doc.id);
                      }}
                      className="text-muted-foreground hover:text-primary shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label={t("library.view")}
                      title={t("library.view")}
                    >
                      <Eye className="size-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDelete(doc.id);
                      }}
                      className="text-muted-foreground hover:text-destructive shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label={t("library.delete")}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      <DocumentViewer docId={viewerDocId} onClose={() => setViewerDocId(null)} />
    </div>
  );
}
