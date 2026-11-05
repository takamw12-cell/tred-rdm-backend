import { lazy, Suspense } from "react";

/**
 * Tableau blanc libre (tldraw) — SQUELETTE, utilisé nulle part pour l'instant.
 *
 * Il se branchera dans le slot `board` de <VirtualClassroom> le jour où
 * l'étudiant devra dessiner lui-même (schéma de circuit, croquis).
 * La Tafel du professeur reste, elle, rendue par notre code (lib/tafel.ts).
 *
 * ⚠️ Licence : tldraw exige une clé en production (VITE_TLDRAW_LICENSE_KEY).
 * Sans clé, il ne fonctionne qu'en développement. Voir GUIDE_FOUNDER.md.
 *
 * Import paresseux : tldraw pèse plusieurs centaines de Ko, il n'est chargé
 * que si ce composant est réellement affiché.
 */
const Tldraw = lazy(async () => {
  await import("tldraw/tldraw.css");
  const { Tldraw } = await import("tldraw");
  return { default: Tldraw };
});

export function TafelWhiteboard() {
  return (
    <div data-slot="tafel-whiteboard" className="relative size-full">
      <Suspense fallback={<div className="size-full bg-slate-200 motion-safe:animate-pulse" />}>
        <Tldraw licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY || undefined} />
      </Suspense>
    </div>
  );
}
