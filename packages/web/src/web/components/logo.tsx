import { cn } from "@/lib/utils";

/**
 * TRED-Bildmarke: ein T aus zwei Balken, darunter ein Markerstrich.
 *
 * Das T steht aufrecht und exakt wie eine Konstruktionslinie; der Strich ist
 * leicht schräg, wie von Hand gezogen. Genau diese Reibung ist die Marke:
 * Präzision plus die eigene Markierung im Skript.
 *
 * Die Pfade liegen bewusst hier und nicht in einer Bilddatei, damit die Marke
 * die Themenfarben erbt und in jeder Größe scharf bleibt. Wer sie ändert,
 * ändert auch public/icon.svg und die daraus erzeugten PNGs.
 */
const STROKE = "M84,262 L426,236 L432,310 L90,336 Z";
const BAR = "M100,124 H412 V180 H100 Z";
const STEM = "M228,180 H284 V404 H228 Z";

export function LogoMark({
  className,
  onTile = false,
}: {
  className?: string;
  /** Auf der Verlaufskachel (Seitenleiste, Avatar) statt auf Papier. */
  onTile?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={cn("size-8 shrink-0", className)}
      role="img"
      aria-label="TRED"
    >
      {onTile && <rect width="512" height="512" rx="112" className="fill-primary" />}
      <path d={STROKE} className="fill-signature" />
      <g className={onTile ? "fill-primary-foreground" : "fill-foreground"}>
        <path d={BAR} />
        <path d={STEM} />
      </g>
    </svg>
  );
}

/**
 * Wortmarke. `stacked` ist der große Auftritt (Anmeldung, Onboarding),
 * `inline` die kompakte Zeile für Seitenleiste und Kopfzeilen.
 */
export function Logo({
  className,
  showText = true,
  variant = "inline",
  tagline,
}: {
  className?: string;
  showText?: boolean;
  variant?: "inline" | "stacked";
  tagline?: string;
}) {
  const wordmark = (
    <span className="font-display font-bold uppercase leading-none tracking-[0.14em]">
      TRED
    </span>
  );

  if (variant === "stacked") {
    return (
      <div className={cn("flex flex-col items-center text-center", className)}>
        <LogoMark className="size-14" />
        {showText && (
          <>
            <span className="mt-4 text-3xl">{wordmark}</span>
            {tagline && <span className="label-tech mt-2.5">{tagline}</span>}
          </>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      {showText && <span className="text-lg">{wordmark}</span>}
    </div>
  );
}

/** Rein dekoratives Alias — der freigestellte Flügel von früher entfällt. */
export const LogoWing = LogoMark;
