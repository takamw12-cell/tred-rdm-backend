import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Pluie de confettis (Arcade, sans-faute). Quelques dizaines de rectangles
 * animés par Framer Motion, sans bibliothèque de plus ; rien si l'étudiant a
 * demandé moins d'animations.
 */
const COLORS = ["#EAB308", "#22D3EE", "#A855F7", "#22C55E", "#F472B6", "#F8FAFC"];

export function ConfettiBurst({ pieces = 48 }: { pieces?: number }) {
  const reduced = useReducedMotion();
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        x: (i * 37) % 100,
        drift: ((i * 53) % 40) - 20,
        delay: ((i * 17) % 30) / 100,
        rotate: ((i * 97) % 720) - 360,
        color: COLORS[i % COLORS.length]!,
        w: 6 + ((i * 7) % 6),
      })),
    [pieces],
  );
  if (reduced) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" data-testid="confetti">
      {bits.map((b, i) => (
        <motion.span
          key={i}
          className="absolute top-0 block rounded-[2px]"
          style={{ left: `${b.x}%`, width: b.w, height: b.w * 1.6, backgroundColor: b.color }}
          initial={{ y: -20, opacity: 1, rotate: 0 }}
          animate={{ y: 520, x: b.drift * 4, opacity: [1, 1, 0], rotate: b.rotate }}
          transition={{ duration: 1.8 + b.delay * 2, delay: b.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}
