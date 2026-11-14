import { AlertCircle, CheckCircle2, Clock, Loader2, UploadCloud } from "lucide-react";
import { useT } from "@/i18n";
import { summarize, type QueueItem, type QueueStatus } from "@/lib/import-batch";
import { cn } from "@/lib/utils";

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Code d'erreur d'un import (contrôle local, réponse du serveur ou travail de
 * la file) → la phrase que lit l'étudiant. Un code inconnu est montré tel
 * quel plutôt que caché : « Upload fehlgeschlagen: … ».
 */
export function importErrorText(t: Translate, code: string | undefined): string {
  switch (code) {
    case "unsupported_format":
      return t("library.onlyPdf");
    case "no_text":
      return t("library.scanned");
    case "scan_unreadable":
      return t("library.scanUnreadable");
    case "file_too_large":
      return t("library.tooLarge");
    case "RATE_LIMITED":
      return t("library.rateLimited");
    case "password_protected":
      return t("library.passwordProtected");
    case "corrupted_file":
      return t("library.corrupted");
    case "empty_file":
      return t("library.emptyFile");
    case "document_limit":
      return t("library.documentLimit");
    case "too_many_files":
      return t("library.tooManyFiles");
    case "batch_too_large":
      return t("library.batchTooLarge");
    default:
      return t("library.uploadFailed", { msg: code ?? "?" });
  }
}

const STATUS_KEY: Record<QueueStatus, string> = {
  waiting: "library.queue.waiting",
  uploading: "library.queue.uploading",
  reading: "library.queue.reading",
  done: "library.queue.done",
  error: "library.queue.error",
};

function StatusIcon({ status }: { status: QueueStatus }) {
  const box = "grid size-7 shrink-0 place-items-center rounded-lg";
  if (status === "done") return <span className={cn(box, "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400")}><CheckCircle2 className="size-4" /></span>;
  if (status === "error") return <span className={cn(box, "bg-destructive/10 text-destructive")}><AlertCircle className="size-4" /></span>;
  if (status === "reading") return <span className={cn(box, "bg-signature/15 text-foreground")}><Loader2 className="size-4 animate-spin" /></span>;
  if (status === "uploading") return <span className={cn(box, "bg-signature/15 text-foreground")}><UploadCloud className="size-4" /></span>;
  return <span className={cn(box, "bg-secondary text-muted-foreground")}><Clock className="size-4" /></span>;
}

/** « 2,4 MB », ou « 340 kB » sous le mégaoctet : jamais « 0 MB ». */
export function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  return `${(bytes / (1024 * 1024)).toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`;
}

/**
 * La file d'un import par lot : une ligne par fichier, avec SON statut
 * (Wartet · Wird hochgeladen · Wird gelesen · Fertig · Fehler). Un fichier en
 * erreur dit pourquoi, sur sa ligne ; les autres continuent.
 */
export function ImportQueueList({ items, className }: { items: QueueItem[]; className?: string }) {
  const { t } = useT();
  return (
    <ul className={cn("divide-border divide-y", className)} data-testid="import-queue" aria-live="polite">
      {items.map((item) => (
        <li key={item.index} className="flex items-start gap-2.5 py-2" data-testid="import-queue-item" data-status={item.status}>
          <StatusIcon status={item.status} />
          <div className="min-w-0 flex-1">
            <p className="text-foreground truncate text-sm font-medium" title={item.name}>
              {item.name}
            </p>
            {item.status === "error" ? (
              <p className="text-destructive mt-0.5 text-xs leading-snug">{importErrorText(t, item.error)}</p>
            ) : item.status === "reading" ? (
              <div className="bg-secondary mt-1.5 h-1.5 overflow-hidden rounded-full" aria-hidden="true">
                <div className="bg-signature h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${Math.max(8, item.progress)}%` }} />
              </div>
            ) : (
              <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">{fileSize(item.size)}</p>
            )}
          </div>
          <span
            className={cn(
              "label-tech mt-1 shrink-0",
              item.status === "done" && "text-emerald-600 dark:text-emerald-400",
              item.status === "error" && "text-destructive",
            )}
          >
            {t(STATUS_KEY[item.status])}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** « 2 von 3 fertig » et la barre d'ensemble. */
export function ImportQueueSummary({ items }: { items: QueueItem[] }) {
  const { t } = useT();
  const s = summarize(items);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="label-tech">{t("library.queue.title", { count: s.total })}</p>
        <p className="label-tech tabular-nums">{t("library.queue.summary", { done: s.done, total: s.total })}</p>
      </div>
      <progress className="sr-only" max={100} value={s.percent} aria-label={t("library.queue.summary", { done: s.done, total: s.total })} data-testid="import-queue-bar" />
      <div className="bg-secondary mt-2 h-2 overflow-hidden rounded-full" aria-hidden="true">
        <div className="bg-signature h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${s.percent}%` }} />
      </div>
    </div>
  );
}
