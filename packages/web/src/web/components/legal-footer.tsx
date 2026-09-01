import { Link } from "wouter";
import { LEGAL_ORDER, LEGAL_SHORT, LEGAL_PATH } from "@/data/legal";
import { cn } from "@/lib/utils";

/**
 * Liens légaux du pied de page.
 *
 * § 5 DDG demande que l'Impressum soit « ständig verfügbar » — disponible en
 * permanence. En pratique, cela veut dire : depuis **chaque** page, y compris
 * celles qu'on voit sans être connecté. D'où sa présence à la fois sur l'écran
 * de connexion et dans la coquille de l'application.
 *
 * Les libellés restent en allemand quelle que soit la langue choisie. Ce sont
 * des dénominations juridiques : un lecteur allemand, et surtout une autorité,
 * cherche le mot « Impressum » — pas sa traduction.
 */
export function LegalFooter({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Rechtliches"
      className={cn(
        "text-muted-foreground flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs",
        className,
      )}
    >
      {LEGAL_ORDER.map((doc) => (
        <Link
          key={doc}
          to={LEGAL_PATH[doc]}
          className="hover:text-foreground underline-offset-4 transition-colors hover:underline"
        >
          {LEGAL_SHORT[doc]}
        </Link>
      ))}
    </nav>
  );
}
