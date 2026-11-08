import { cn } from "@/lib/utils";
import {
  ROW_VIEWBOX,
  ROW_WORDMARK,
  STACKED_VIEWBOX,
  STACKED_WORDMARK,
  SYMBOL_BUTTONS,
  SYMBOL_TASSEL,
  SYMBOL_VIEWBOX,
  TILE_SYMBOL_TRANSFORM,
  TILE_VIEWBOX,
} from "@/components/logo-paths";

/**
 * Logo TRED — concept A « Boutons-Toque » (validé le 2026-11-08).
 *
 * Vue de dessus, la toque est un losange. Coupée en quatre, elle devient les
 * quatre boutons d'une manette, et le cordon du gland passe dans le vide qui
 * les sépare. Kit complet et règles d'usage : public/brand/preview.html.
 *
 * ── Couleurs (décision fondateur, 2026-11-08) ──────────────────────────────
 * L'app garde ses couleurs d'origine (crème, encre, jaune). Dans l'app, les
 * losanges et le mot « TRED » suivent donc `currentColor` — encre sur crème
 * (16,8:1), blanc sur la barre latérale bleu nuit — et le gland garde le jaune
 * TRED #EAB308, comme le T jaune de l'ancienne manette. L'orange du kit
 * (#FF6B00) jurait à côté du jaune de l'interface (1,49:1 entre les deux).
 * Les icônes suivent la même règle (favicon, PWA, `tile` ci-dessous) : losanges
 * encre et gland jaune sur une tuile crème (public/brand/tred-app-icon-ink.svg).
 * Le kit orange d'origine reste dans public/brand/, mis de côté avec la
 * palette TRED Signal.
 *
 * ── Tracés ──────────────────────────────────────────────────────────────────
 * Inline et non <img> : net à toute taille, coloré par le thème, sans requête.
 * Les tracés viennent des fichiers du kit (logo-paths.ts) ; le mot est en
 * Poppins Bold converti en courbes, aucune police n'est chargée.
 */

/** Jaune TRED : le gland, fixe dans les deux thèmes. */
const YELLOW = "#EAB308";
/** La tuile d'icône : encre sur crème, comme tred-app-icon-ink.svg. */
const INK = "#1A1A1A";
const CREAM = "#FDFBF7";

/** `ink` : losanges fixés à l'encre (tuile crème) ; sinon ils suivent le texte. */
function BrandSymbol({ ink = false }: { ink?: boolean }) {
  return (
    <>
      <path fill={ink ? INK : "currentColor"} d={SYMBOL_BUTTONS} />
      <path fill={YELLOW} d={SYMBOL_TASSEL} />
    </>
  );
}

export function LogoMark({
  className,
  tile = false,
  title,
}: {
  className?: string;
  /** Pose le symbole sur la tuile crème de l'icône d'app — pour une icône, pas une en-tête. */
  tile?: boolean;
  /** Rend le logo lisible aux lecteurs d'écran. Sans titre, il est décoratif. */
  title?: string;
}) {
  return (
    <svg
      viewBox={tile ? TILE_VIEWBOX : SYMBOL_VIEWBOX}
      className={cn("text-foreground size-10 shrink-0", className)}
      xmlns="http://www.w3.org/2000/svg"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {tile ? (
        <>
          <rect width="1024" height="1024" rx="230" fill={CREAM} />
          <g transform={TILE_SYMBOL_TRANSFORM}>
            <BrandSymbol ink />
          </g>
        </>
      ) : (
        <BrandSymbol />
      )}
    </svg>
  );
}

export function Logo({
  className,
  variant = "row",
  tagline,
  markClassName,
}: {
  className?: string;
  /** `row` : symbole puis mot (logo horizontal). `stacked` : symbole au-dessus (logo vertical). */
  variant?: "row" | "stacked";
  /** Ligne de signature sous le logo — connexion, onboarding. */
  tagline?: string;
  /** Classes du dessin : taille, et couleur du mot (`text-white` sur fond Nuit). */
  markClassName?: string;
}) {
  const stacked = variant === "stacked";

  return (
    <div className={cn("flex", stacked ? "flex-col items-center text-center" : "items-center", className)}>
      <svg
        viewBox={stacked ? STACKED_VIEWBOX : ROW_VIEWBOX}
        className={cn("text-foreground w-auto shrink-0", stacked ? "h-24" : "h-9", markClassName)}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
        focusable="false"
      >
        <BrandSymbol />
        <path fill="currentColor" d={stacked ? STACKED_WORDMARK : ROW_WORDMARK} />
      </svg>
      {/* Le mot est dessiné : on le redonne en texte aux lecteurs d'écran. */}
      <span className="sr-only">TRED</span>

      {tagline && <span className="text-muted-foreground mt-3 text-sm leading-snug">{tagline}</span>}
    </div>
  );
}
