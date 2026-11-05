import type { Professor } from "@/lib/professors";
import { cn } from "@/lib/utils";

/**
 * Portrait d'un professeur : sa photo / son avatar, ou — tant que les avatars
 * anime ne sont pas générés — un médaillon stylisé (dégradé + initiales,
 * trames façon manga). Remplacé automatiquement dès que `image` existe.
 */
export function ProfessorPortrait({
  professor,
  className,
  eager = false,
}: {
  professor: Professor;
  className?: string;
  eager?: boolean;
}) {
  if (professor.image) {
    return (
      <img
        src={professor.image}
        alt={professor.name}
        width={480}
        height={480}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className={cn("size-full object-cover", className)}
      />
    );
  }
  const { from, to, ink } = professor.palette;
  const initials = professor.name
    .replace(/^(Prof\.|Dr\.|Sensei)\s+/, "")
    .slice(0, 1)
    .toUpperCase();
  return (
    <div
      className={cn("relative flex size-full items-center justify-center overflow-hidden", className)}
      style={{ background: `linear-gradient(145deg, ${from}, ${to})`, color: ink }}
    >
      {/* Trame de points façon manga */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-25 [background-image:radial-gradient(currentColor_1.2px,transparent_1.3px)] [background-size:9px_9px]"
      />
      {/* Lignes de vitesse */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-20 [background-image:repeating-conic-gradient(from_0deg_at_50%_50%,currentColor_0deg_2deg,transparent_2deg_14deg)]"
      />
      <span
        aria-hidden
        className="font-hand relative text-[2.6em] leading-none font-bold drop-shadow-[0_2px_0_rgb(255_255_255/0.6)]"
      >
        {initials}
      </span>
      <span className="sr-only">{professor.name}</span>
    </div>
  );
}
