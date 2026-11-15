import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Transition entre les pages (15 nov. 2026) : la page qui arrive fond et
 * glisse de 10 px, sur un ressort. Les pages animaient déjà leurs blocs un à
 * un (components/page.tsx) ; ceci couvre TOUTES les pages, d'un seul geste.
 *
 * Entrée seulement, pas de sortie : l'ancienne page disparaît tout de suite,
 * la navigation ne paraît jamais plus lente qu'avant.
 *
 * Le Hörsaal (/chat) est laissé tel quel : c'est une scène plein cadre avec sa
 * propre chorégraphie, et un `transform` sur un ancêtre déplacerait ses
 * tiroirs en position fixe pendant l'animation.
 */
export function PageTransition({ location, children }: { location: string; children: ReactNode }) {
  const reduced = useReducedMotion();
  if (reduced || location.startsWith("/chat")) return <>{children}</>;
  return (
    <motion.div key={location} data-testid="page-transition" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 28, mass: 0.9 }}>
      {children}
    </motion.div>
  );
}
