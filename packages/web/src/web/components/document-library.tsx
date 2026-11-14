import { followImportJob } from "@/lib/import-job";
import { checkSelection, runImportBatch, summarize, type BatchTransport, type QueueItem } from "@/lib/import-batch";
import { ImportQueueList, ImportQueueSummary, importErrorText } from "./import-queue";
import { ImportWaitOverlay, type ImportWaitState } from "./import-wait-overlay";
import { useRef, useState } from "react";
import { paywallFromResponse } from "@/lib/paywall";
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
import { DocFlashcardsButton } from "./flashcards-widget";
import { Button } from "@/components/ui/button";
import {
  documentsListOptions,
  documentsListKey,
  documentRemoveOptions,
} from "@/queries/documents";
import { semestersListKey } from "@/queries/semesters";
import { useFeatures } from "@/queries/features";
import { track } from "@/lib/analytics";
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

/** Même plafond que le serveur (api/lib/upload-guard.ts). */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

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
  // L'écran d'attente (film + barre). `waitHidden` : l'étudiant l'a masqué,
  // l'import continue et le bouton garde son indicateur.
  const [wait, setWait] = useState<ImportWaitState | null>(null);
  const [waitHidden, setWaitHidden] = useState(false);
  // Import par lot : la file (une ligne par fichier). Elle reste affichée dans
  // le panneau quand l'écran d'attente est masqué, et après la fin s'il y a eu
  // des échecs — jusqu'à ce que l'étudiant la ferme.
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const features = useFeatures();
  const [viewerDocId, setViewerDocId] = useState<string | null>(null);

  const { data: docs = [], isLoading } = useQuery(documentsListOptions(semesterId));
  const removeMut = useMutation(documentRemoveOptions());

  /** Envoi d'UN fichier par la route classique (elle extrait dans la requête quand le serveur n'a pas de file). */
  async function uploadOne(file: File): ReturnType<BatchTransport["uploadOne"]> {
    const form = new FormData();
    form.append("file", file);
    form.append("title", file.name.replace(/\.[a-z0-9]{1,5}$/i, ""));
    form.append("kind", guessKind(file.name));
    if (semesterId) form.append("semesterId", semesterId);
    const res = await fetch("/api/documents/upload", { method: "POST", body: form });
    if (!res.ok) {
      // Limite de documents du tarif : la fenêtre s'ouvre une fois, et les fichiers suivants ne sont pas tentés.
      if (await paywallFromResponse(res, "documents")) return { ok: false, error: "document_limit", stop: true };
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      const error = data.error ?? `http_${res.status}`;
      return { ok: false, error, stop: error === "RATE_LIMITED" };
    }
    const body = (await res.json()) as { id?: string; jobId?: string };
    if (body.id) return { ok: true, documentId: body.id };
    if (body.jobId) return { ok: true, jobId: body.jobId };
    return { ok: false, error: "extraction_failed" };
  }

  const transport: BatchTransport = {
    // Le lot en UN envoi : possible seulement quand le serveur a une file.
    uploadBatch: async (batch) => {
      const form = new FormData();
      for (const f of batch) {
        form.append("files", f);
        form.append("kinds", guessKind(f.name));
      }
      if (semesterId) form.append("semesterId", semesterId);
      const res = await fetch("/api/documents/upload-batch", { method: "POST", body: form });
      if (res.status === 503) return { kind: "no_queue" };
      if (!res.ok) {
        if (await paywallFromResponse(res, "documents")) return { kind: "refused", error: "document_limit" };
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        return { kind: "refused", error: data.error ?? `http_${res.status}` };
      }
      const body = (await res.json()) as { results?: { name: string; jobId: string | null; documentId: string | null; error: string | null }[] };
      return { kind: "accepted", results: body.results ?? [] };
    },
    uploadOne,
    follow: followImportJob,
  };

  /** Plusieurs fichiers : chacun a sa ligne et son statut ; un échec n'arrête pas les autres. */
  async function importBatch(files: File[]) {
    const sizeMb = Math.round(files.reduce((n, f) => n + f.size, 0) / 100_000) / 10;
    const refusal = checkSelection(files);
    if (refusal) {
      setUploadError(importErrorText(t, refusal));
      track("upload_failed", { ext: "batch", reason: refusal });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    // Jamais les noms des fichiers : seulement leur nombre et leur poids.
    track("upload_batch_started", { count: files.length, sizeMb });
    try {
      setProgress(t("library.processing"));
      setWaitHidden(false);
      const refresh = () => {
        void qc.invalidateQueries({ queryKey: documentsListKey() });
        void qc.invalidateQueries({ queryKey: semestersListKey() });
      };
      const final = await runImportBatch(files, {
        queue: features.importQueue,
        accepted: hasAcceptedExtension,
        transport,
        onChange: (items) => {
          setQueue(items);
          setWait({ status: "processing", progress: null, title: "", queue: items });
        },
        // Chaque document apparaît dans la liste dès qu'il est prêt, sans attendre la fin du lot.
        onImported: refresh,
      });
      const result = summarize(final);
      track("upload_batch_completed", { count: result.total, done: result.done, failed: result.failed });
      // Tout est passé : la file disparaît. Sinon elle reste, pour dire quoi et pourquoi.
      setQueue(result.failed > 0 ? final : null);
    } finally {
      setProgress(null);
      setWait(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleFiles(list: FileList | null) {
    setUploadError(null);
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    setQueue(null);
    if (files.length > 1) return importBatch(files);
    return importSingle(files[0]!);
  }

  async function importSingle(file: File) {
    // Trichter « import » (analyse, seulement avec consentement) : jamais le
    // nom du fichier, seulement son type et sa taille.
    const ext = (file.name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? "?").toLowerCase();
    const sizeMb = Math.round(file.size / 100_000) / 10;
    track("upload_started", { ext, sizeMb });
    if (!hasAcceptedExtension(file.name)) {
      setUploadError(t("library.onlyPdf"));
      track("upload_failed", { ext, reason: "format" });
      return;
    }
    // 50 Mo au plus (même plafond que le serveur, api/lib/upload-guard.ts) :
    // refusé ici, avant de faire monter le fichier pour rien.
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(t("library.tooLarge"));
      track("upload_failed", { ext, reason: "too_large" });
      return;
    }

    try {
      setProgress(t("library.processing"));
      const cleanTitle = file.name.replace(/\.[a-z0-9]{1,5}$/i, "");
      setWaitHidden(false);
      setWait({ status: "uploading", progress: null, title: cleanTitle });
      const form = new FormData();
      form.append("file", file);
      form.append("title", cleanTitle);
      form.append("kind", guessKind(file.name));
      if (semesterId) form.append("semesterId", semesterId);

      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: form,
      });

      // Message d'échec selon le code du serveur (réponse directe ou travail de la file).
      const showFailure = (code: string | undefined, fallback: string) => {
        track("upload_failed", { ext, reason: code ?? fallback });
        setUploadError(importErrorText(t, code ?? fallback));
      };

      if (!res.ok) {
        // Limite de documents du tarif : la fenêtre de limite s'ouvre.
        await paywallFromResponse(res, "documents");
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        showFailure(data.error, res.statusText || `http_${res.status}`);
        return;
      }

      // 202 { jobId } : le serveur traite l'import en arrière-plan, on suit
      // son avancement. 200 { id } : serveur sans file, le document est prêt.
      const body = (await res.json()) as { id?: string; jobId?: string };
      let id = body.id;
      if (!id && body.jobId) {
        setWait({ status: "pending", progress: 8, title: cleanTitle });
        const outcome = await followImportJob(body.jobId, (p) => setWait({ ...p, title: cleanTitle }));
        if (!outcome.ok) {
          showFailure(outcome.error, "extraction_failed");
          return;
        }
        id = outcome.documentId;
      }
      if (!id) {
        showFailure(undefined, "extraction_failed");
        return;
      }
      track("upload_completed", { ext, sizeMb });
      await qc.invalidateQueries({ queryKey: documentsListKey() });
      await qc.invalidateQueries({ queryKey: semestersListKey() });
      onSelect(id, cleanTitle);
    } catch (err) {
      console.error("[upload] failed", err);
      track("upload_failed", { ext, reason: "network" });
      const msg = err instanceof Error ? err.message : String(err);
      setUploadError(t("library.uploadFailed", { msg }));
    } finally {
      setProgress(null);
      setWait(null);
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
  const queueSummary = queue ? summarize(queue) : null;

  return (
    <div
      className="relative flex h-full flex-col"
      // Glisser-déposer : un ou plusieurs fichiers, lâchés n'importe où sur le panneau.
      onDragOver={(e) => {
        if (busy || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(false);
        if (!busy) void handleFiles(e.dataTransfer.files);
      }}
    >
      {dragging && (
        <div className="border-signature bg-background/90 pointer-events-none absolute inset-2 z-10 grid place-items-center rounded-xl border-2 border-dashed p-4 text-center" data-testid="import-drop-zone">
          <p className="text-foreground flex flex-col items-center gap-2 text-sm font-semibold">
            <Upload className="size-5" />
            {t("library.dropHere")}
          </p>
        </div>
      )}
      <ImportWaitOverlay state={waitHidden ? null : wait} onHide={() => setWaitHidden(true)} />
      <div className="border-border flex h-12 items-center gap-2 border-b px-4">
        <FileText className="text-primary size-4" />
        <span className="text-sm font-semibold">{t("library.title")}</span>
      </div>

      <div className="p-3">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          // Jusqu'à 5 fichiers d'un coup (100 Mo en tout) : voir lib/import-batch.ts.
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Button
          onClick={() => {
            track("upload_opened");
            inputRef.current?.click();
          }}
          disabled={busy}
          className="brand-gradient h-10 w-full gap-2 text-sm font-semibold text-white"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {busy ? progress : t("library.upload")}
        </Button>
        {uploadError && (
          <p className="text-destructive mt-2 text-xs font-medium">{uploadError}</p>
        )}
        {/* La file du lot, ici quand l'écran d'attente est masqué — et après la fin, s'il reste des échecs à lire. */}
        {queue && queueSummary && (!busy || waitHidden) && (
          <div className="border-border bg-card mt-3 rounded-xl border p-3" data-testid="import-queue-panel">
            <ImportQueueSummary items={queue} />
            <ImportQueueList items={queue} className="mt-1" />
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="text-destructive text-xs font-medium">{queueSummary.finished && queueSummary.failed > 0 ? t("library.queue.failed", { count: queueSummary.failed }) : ""}</p>
              <button
                type="button"
                onClick={() => (queueSummary.finished ? setQueue(null) : setWaitHidden(false))}
                className="text-muted-foreground hover:text-foreground shrink-0 text-xs font-medium underline underline-offset-2"
              >
                {queueSummary.finished ? t("library.queue.dismiss") : t("library.queue.show")}
              </button>
            </div>
          </div>
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
                    <DocFlashcardsButton
                      documentId={doc.id}
                      className="hover:text-primary transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                    />
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
