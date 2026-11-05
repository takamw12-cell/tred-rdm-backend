import { Clapperboard, ImageIcon, Loader2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { MEDIA_URL_RE, parseMediaBlock } from "@/lib/media-block";

/**
 * Carte d'un média généré (image ou vidéo) : sur la Tafel et dans le fil.
 * Spinner pendant la génération, puis le média. Une vidéo ne démarre jamais
 * seule (pas d'autoplay) et reste muette tant qu'on ne la lance pas.
 */
export function MediaCard({ code }: { code: string }) {
  const block = parseMediaBlock(code.trim());
  const [broken, setBroken] = useState(false);
  if (!block) return null;

  const Icon = block.type === "video" ? Clapperboard : ImageIcon;
  const label = block.type === "video" ? "Video" : "Bild";

  return (
    <figure
      data-slot="media-card"
      className="my-3 overflow-hidden rounded-2xl border border-[#E7E2D8] bg-white shadow-sm"
    >
      <div className="relative aspect-video w-full bg-slate-100">
        {block.pending ? (
          <div
            aria-live="polite"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-slate-500"
          >
            <Loader2 className="size-7 animate-spin text-[#EAB308]" />
            {label} wird generiert…
          </div>
        ) : broken ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-slate-500">
            <TriangleAlert className="size-4" /> {label} nicht mehr verfügbar
          </div>
        ) : block.type === "video" ? (
          // Les vidéos générées sont muettes (aucune parole à sous-titrer).
          // oxlint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={block.url}
            controls
            playsInline
            preload="metadata"
            className="size-full object-contain"
            onError={() => setBroken(true)}
          />
        ) : (
          <img
            src={block.url}
            alt="KI-generiertes Bild"
            loading="lazy"
            className="size-full object-contain"
            onError={() => setBroken(true)}
          />
        )}
      </div>
      <figcaption className="flex items-center gap-1.5 px-3 py-2 text-xs text-slate-500">
        <Icon className="size-3.5" /> KI-generiert — kann ungenau sein
      </figcaption>
    </figure>
  );
}

/**
 * `![…](url)` dans le Markdown : nos vidéos (.mp4/.webm) deviennent un
 * lecteur ; une image reste une image, chargée paresseusement.
 */
export function MarkdownMedia({ src, alt }: { src?: string; alt?: string }) {
  if (!src) return null;
  if (MEDIA_URL_RE.test(src) && /\.(mp4|webm)$/.test(src)) {
    return (
      // oxlint-disable-next-line jsx-a11y/media-has-caption -- vidéo générée, muette
      <video src={src} controls playsInline preload="metadata" className="my-3 w-full rounded-2xl" />
    );
  }
  return <img src={src} alt={alt ?? ""} loading="lazy" className="my-3 max-w-full rounded-2xl" />;
}
