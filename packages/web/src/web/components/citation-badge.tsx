import { BadgeCheck, FileQuestion, FileText } from "lucide-react";
import { useT } from "@/i18n";
import type { Citation, CitationVerdict } from "@/lib/citations";
import { cn } from "@/lib/utils";

/**
 * Une citation du tuteur, comme une référence de bas de page :
 *
 *     ▢ Thermo_Kapitel_3 · S. 12 ✓
 *
 * Verre dépoli, bordure fine, icône de document. Un clic ouvre l'original à
 * cette page. Ce que le badge affiche est ce que le serveur a VÉRIFIÉ, pas ce
 * que le tuteur a écrit : la vraie page si elle différait, la coche seulement
 * si la phrase est bien dans le document, et rien de cliquable quand le
 * document n'existe pas chez l'étudiant.
 */
export function CitationBadge({
  citation,
  verdict,
  onOpen,
}: {
  citation: Citation;
  /** `undefined` : pas encore vérifiée (ou vérification indisponible). */
  verdict: CitationVerdict | undefined;
  /** Absent : aucune visionneuse sur cette page. */
  onOpen?: () => void;
}) {
  const { t } = useT();
  const unknown = verdict?.status === "unknown_document";
  const title = verdict?.title ?? citation.docTitle;
  const page = verdict ? verdict.page : citation.page;
  const verified = verdict?.status === "verified" || verdict?.status === "page_corrected";

  const hint = !verdict
    ? citation.excerpt
    : verdict.status === "verified"
      ? t("viewer.citeVerified")
      : verdict.status === "page_corrected"
        ? t("viewer.citeCorrected", { page: verdict.page ?? "?", cited: verdict.citedPage ?? "–" })
        : verdict.status === "quote_not_found"
          ? t("viewer.citeUnverified")
          : t("viewer.citeUnknown");

  const shell =
    "inline-flex max-w-full items-center gap-1.5 rounded-full border px-1 py-0.5 pr-2.5 text-xs font-medium backdrop-blur-md transition-[border-color,box-shadow,transform] duration-200";

  // Le document n'existe pas chez l'étudiant : on le dit, sans rien ouvrir.
  if (unknown || !onOpen) {
    return (
      <span
        className={cn(shell, "border-border/70 bg-background/40 text-muted-foreground", unknown && "border-dashed")}
        title={hint}
        data-testid="citation-badge"
        data-status={verdict?.status ?? "pending"}
      >
        <span className="bg-secondary grid size-5 shrink-0 place-items-center rounded-full">
          {unknown ? <FileQuestion className="size-3" /> : <FileText className="size-3" />}
        </span>
        <span className="truncate">{unknown ? t("viewer.citeUnknown") : (title ?? t("viewer.title"))}</span>
        {!unknown && page !== null && <span className="label-tech shrink-0">{t("viewer.pageShort", { page })}</span>}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      title={hint}
      aria-label={t("viewer.openAtPage", { doc: title ?? t("viewer.title"), page: page ?? "–" })}
      data-testid="citation-badge"
      data-status={verdict?.status ?? "pending"}
      className={cn(
        shell,
        "border-foreground/10 bg-background/55 text-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.55),0_6px_16px_-10px_rgb(15_23_42/0.55)]",
        "hover:border-signature hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.55),0_8px_20px_-10px_rgb(234_179_8/0.7)] hover:-translate-y-px",
        "focus-visible:ring-signature focus-visible:ring-2 focus-visible:outline-none",
      )}
    >
      <span className="bg-signature/20 text-foreground grid size-5 shrink-0 place-items-center rounded-full">
        <FileText className="size-3" />
      </span>
      <span className="truncate">{title ?? t("viewer.title")}</span>
      {page !== null && <span className="label-tech shrink-0">{t("viewer.pageShort", { page })}</span>}
      {verified && <BadgeCheck className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />}
    </button>
  );
}
