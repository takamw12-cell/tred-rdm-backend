import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Quellenangabe im Randnotiz-Stil.
 *
 * Das ist die Stelle, an der sich TRED von jedem allgemeinen KI-Chat
 * unterscheidet: die Antwort steht nicht irgendwo im Netz, sondern auf einer
 * bestimmten Seite des eigenen Skripts. Deshalb ist die Angabe keine dezente
 * Pille mehr, sondern eine Randmarkierung — gelbe Haarlinie links, Seitenzahl
 * in Mono wie eine Beschriftung am Zeichnungsrand.
 */
export function SourceCitation({
  doc,
  page,
  className,
}: {
  doc: string;
  page: number;
  className?: string;
}) {
  const { t } = useT();
  return (
    <span
      className={cn(
        "border-signature mt-2.5 inline-flex items-baseline gap-2 border-l-2 py-0.5 pl-2.5",
        className,
      )}
    >
      <span className="label-tech shrink-0">
        {t("common.page")} {page}
      </span>
      <span className="text-foreground/80 text-xs font-medium">{doc}</span>
    </span>
  );
}
