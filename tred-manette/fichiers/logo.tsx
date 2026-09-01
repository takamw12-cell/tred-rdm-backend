import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Logo TRED — la manette.
 *
 * ── L'idée ────────────────────────────────────────────────────────────────
 *
 * Une manette de console vue de face : corps massif, deux poignées effilées,
 * quatre touches à droite. À gauche, là où se trouve la croix directionnelle,
 * on ne met pas une croix : on met le T de TRED, en jaune.
 *
 * C'est le point de bascule du dessin. La croix directionnelle est ce avec
 * quoi on dirige. En la remplaçant par la lettre, on dit que ce qui dirige
 * ici, c'est TRED — l'étudiant ne subit pas son semestre, il le pilote.
 *
 * ── Les quatre touches sont des trous, pas des disques ─────────────────────
 *
 * C'est la seule finesse technique du fichier et elle mérite d'être dite.
 * Peindre les touches en blanc cassé marche en thème clair — blanc sur noir —
 * et disparaît en thème sombre, où le corps devient ivoire : blanc sur blanc.
 * On les découpe donc dans le corps avec un masque. Elles laissent voir la
 * page derrière elles, et se retournent donc toutes seules avec le thème.
 *
 * L'identifiant du masque vient de `useId()` : deux logos sur la même page
 * partageraient sinon le même `id`, et le second emprunterait le masque du
 * premier.
 *
 * ── Ce qui change par rapport à l'ancien ──────────────────────────────────
 *
 * 1. Plus de tuile blanche imposée. L'ancien logo commençait par un
 *    `<rect fill="#F8F9FA">` : dans la barre latérale sombre, cela dessinait
 *    un carré blanc autour du glyphe. Ici la tuile est optionnelle (`tile`) —
 *    on la veut pour une icône d'application, jamais dans une en-tête.
 *
 * 2. Le corps suit `currentColor`. Noir carbone en clair, ivoire en sombre,
 *    sans deux fichiers à maintenir. Sauf sur la tuile, qui impose un fond
 *    clair et fixe donc le corps au noir carbone. Le jaune, lui, ne bouge
 *    jamais : c'est la seule couleur de marque, elle doit rester
 *    reconnaissable dans les deux thèmes.
 *
 * 3. Deux cadrages. Sans tuile, la vue est recadrée sur le dessin lui-même :
 *    la manette est large et basse, un carré 100×100 la laissait flotter au
 *    milieu du vide, et à `size-8` elle devenait minuscule.
 *
 * 4. `variant="stacked"` et `tagline` existent vraiment. Trois pages les
 *    passaient déjà — login, onboarding, reset-password — alors que l'ancien
 *    composant ne déclarait que `className` et `omitle`.
 */

/** Jaune TRED. Fixe dans les deux thèmes — c'est le repère de la marque. */
const YELLOW = "#EAB308";

/** Blanc cassé de la tuile, quand il y en a une. */
const OFFWHITE = "#F8F9FA";

/**
 * Noir carbone. Sert uniquement avec la tuile : celle-ci impose un fond clair,
 * donc le corps ne peut pas suivre `currentColor` — en thème sombre il
 * deviendrait ivoire sur blanc cassé, et le logo disparaîtrait.
 */
const INK = "#111111";

/**
 * Le dessin occupe 10,27 → 90,77.6. Sans tuile on recadre dessus avec une
 * marge de 3 ; sinon le glyphe, large et bas, se perd dans un carré.
 */
const VIEWBOX_BARE = "7 24 86 57";
const VIEWBOX_TILE = "0 0 100 100";

/** Le corps : un bloc central et deux poignées inclinées à 26°. */
function Body() {
  return (
    <>
      <rect x="10" y="27" width="80" height="32" rx="16" />
      <g transform="rotate(-26 24 47)">
        <rect x="11" y="39" width="23" height="40" rx="11.5" />
      </g>
      <g transform="rotate(26 76 47)">
        <rect x="66" y="39" width="23" height="40" rx="11.5" />
      </g>
    </>
  );
}

/** Les quatre touches, en losange comme sur une manette. */
function Buttons() {
  return (
    <>
      <circle cx="70" cy="35" r="4.4" />
      <circle cx="79" cy="43" r="4.4" />
      <circle cx="61.5" cy="43" r="4.4" />
      <circle cx="70" cy="51" r="4.4" />
    </>
  );
}

export function LogoMark({
  className,
  tile = false,
  title,
}: {
  className?: string;
  /** Pose la manette sur la tuile blanc cassé — pour une icône, pas une en-tête. */
  tile?: boolean;
  /** Rend le logo lisible aux lecteurs d'écran. Sans titre, il est décoratif. */
  title?: string;
}) {
  const maskId = `tred-mask-${useId().replace(/:/g, "")}`;

  return (
    <svg
      viewBox={tile ? VIEWBOX_TILE : VIEWBOX_BARE}
      className={cn("text-foreground size-10", className)}
      xmlns="http://www.w3.org/2000/svg"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {/* Blanc = ce qui reste, noir = ce qui est percé. */}
      <mask
        id={maskId}
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="100"
        height="100"
      >
        <g fill="#fff">
          <Body />
        </g>
        <g fill="#000">
          <Buttons />
        </g>
      </mask>

      {tile && <rect width="100" height="100" rx="22" fill={OFFWHITE} />}

      {/* Un seul aplat, découpé par le masque. Le corps et ses trous ne
          peuvent donc jamais se désaligner. */}
      <rect
        x="0"
        y="0"
        width="100"
        height="100"
        fill={tile ? INK : "currentColor"}
        mask={`url(#${maskId})`}
      />

      {/* Le T, à la place de la croix directionnelle. Épaisseur 7.5 : celle
          d'une croix de manette, pour que la substitution se voie sans
          s'annoncer. */}
      <g fill={YELLOW}>
        <rect x="21" y="32.5" width="21" height="7.5" rx="3.75" />
        <rect x="27.75" y="32.5" width="7.5" height="21" rx="3.75" />
      </g>
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
  /** `row` : manette puis mot. `stacked` : manette au-dessus, centré. */
  variant?: "row" | "stacked";
  /** Ligne de signature sous le mot — connexion, onboarding. */
  tagline?: string;
  markClassName?: string;
}) {
  const stacked = variant === "stacked";

  return (
    <div
      className={cn(
        "flex",
        stacked ? "flex-col items-center text-center" : "items-center gap-2.5",
        className,
      )}
    >
      <LogoMark
        title="TRED"
        className={cn(stacked ? "size-16" : "size-10", markClassName)}
      />

      {/* Le mot est du texte, pas un tracé : il suit la police de titrage du
          thème, reste sélectionnable et ne pixellise à aucune taille. */}
      <span
        className={cn(
          "font-display leading-none font-bold tracking-tight",
          stacked ? "mt-2 text-2xl" : "text-xl",
        )}
      >
        TRED
      </span>

      {tagline && (
        <span className="text-muted-foreground mt-2 text-sm leading-snug">
          {tagline}
        </span>
      )}
    </div>
  );
}
