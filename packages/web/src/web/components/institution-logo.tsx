import { useState } from "react";
import { initialsOf } from "@/lib/universities";
import { cn } from "@/lib/utils";

/**
 * Le logo d'un établissement, ou son monogramme.
 *
 *   • `domain` connu → GET /api/logo/:domain (NOTRE serveur relaie et met en
 *     cache : le navigateur ne contacte aucun tiers — RGPD) ;
 *   • pas de domaine, logo introuvable (404) ou trop petit/flou → monogramme
 *     dans un cercle, aux couleurs de TRED : encre #1A1A1A, jaune #EAB308.
 *
 * Pas de saut de mise en page : la place (size × size) est réservée dès le
 * premier rendu ; pendant le chargement, un disque clair discret, puis le
 * logo apparaît en fondu.
 */
export function InstitutionLogo({
  domain,
  name,
  short,
  size = 32,
  className,
}: {
  domain?: string | null;
  /** Nom de l'établissement : texte alternatif, et initiales de secours. */
  name: string;
  /** Sigle déjà connu (« RWTH ») : prioritaire sur les initiales. */
  short?: string;
  size?: 24 | 32 | 40;
  className?: string;
}) {
  const [state, setState] = useState<"loading" | "ok" | "error">(domain ? "loading" : "error");
  const [forDomain, setForDomain] = useState(domain);
  // Autre établissement choisi : on recommence le chargement.
  if (forDomain !== domain) {
    setForDomain(domain);
    setState(domain ? "loading" : "error");
  }

  const box = size === 24 ? "size-6" : size === 40 ? "size-10" : "size-8";
  const label = (short || initialsOf(name)).slice(0, 5);

  if (state === "error" || !domain) {
    return (
      <span
        title={name}
        data-slot="institution-monogram"
        className={cn(
          box,
          "inline-grid shrink-0 place-items-center rounded-full bg-[#1A1A1A] font-bold tracking-tight text-[#EAB308] ring-1 ring-[#EAB308]/40",
          label.length <= 2 ? (size === 24 ? "text-[10px]" : "text-xs") : label.length <= 3 ? "text-[9px]" : "text-[7px]",
          size === 40 && "text-sm",
          className,
        )}
      >
        <span aria-hidden>{label}</span>
        <span className="sr-only">{name}</span>
      </span>
    );
  }

  return (
    <span
      data-slot="institution-logo"
      className={cn(
        box,
        "relative inline-block shrink-0 overflow-hidden rounded-full bg-white ring-1 ring-black/10 dark:ring-white/20",
        state === "loading" && "motion-safe:animate-pulse",
        className,
      )}
    >
      <img
        src={`/api/logo/${domain}`}
        alt={name}
        title={name}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onLoad={() => setState("ok")}
        onError={() => setState("error")}
        className={cn(
          "absolute inset-[12%] size-[76%] object-contain transition-opacity duration-300",
          state === "ok" ? "opacity-100" : "opacity-0",
        )}
      />
    </span>
  );
}
