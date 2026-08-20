import { useState } from "react";
import { motion } from "framer-motion";
import { X, Loader2, ExternalLink, Sparkles, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

export interface YoutubeHit {
  id: string;
  title: string;
  channel: string;
  channelId: string;
  thumbnail: string;
  publishedAt: string;
  duration: string;
  views: number | null;
  trusted: boolean;
}

export type VideoSearchError = "not_configured" | "quota" | "failed" | null;

function formatViews(views: number | null, locale: string): string {
  if (!views) return "";
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(views);
}

/**
 * Zeigt passende Erklärvideos von YouTube zum aktuellen Chat-Thema.
 * Abgespielt wird über youtube-nocookie.com, damit ohne Klick des Studenten
 * keine Werbe-Cookies gesetzt werden (DSGVO-freundlicher als der Standard-
 * Embed) — das Video lädt erst, wenn er es wirklich startet.
 */
export function VideoSearch({
  hits,
  query,
  loading,
  error,
  onClose,
  onRetry,
}: {
  hits: YoutubeHit[];
  query: string;
  loading: boolean;
  error: VideoSearchError;
  onClose: () => void;
  onRetry?: () => void;
}) {
  const { t, locale } = useT();
  const [playing, setPlaying] = useState<string | null>(null);

  const errorText =
    error === "not_configured"
      ? t("videoSearch.notConfigured")
      : error === "quota"
        ? t("videoSearch.quota")
        : t("videoSearch.error");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border-border relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border shadow-2xl"
      >
        <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{t("videoSearch.title")}</p>
            {query && !loading && !error && (
              <p className="text-muted-foreground truncate text-xs">
                {t("videoSearch.searchedFor", { query })}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label={t("common.close")}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-5">
          {loading && (
            <div className="text-muted-foreground flex flex-col items-center gap-3 py-14 text-sm">
              <Loader2 className="size-6 animate-spin" />
              <p>{t("videoSearch.searching")}</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center gap-3 py-14 text-center text-sm">
              <p className="text-destructive max-w-md">{errorText}</p>
              {onRetry && error !== "not_configured" && (
                <Button variant="outline" onClick={onRetry}>
                  {t("videoSearch.retry")}
                </Button>
              )}
            </div>
          )}

          {!loading && !error && hits.length === 0 && (
            <p className="text-muted-foreground py-14 text-center text-sm">
              {t("videoSearch.empty")}
            </p>
          )}

          {!loading && !error && hits.length > 0 && (
            <ul className="space-y-3">
              {hits.map((hit) => (
                <li
                  key={hit.id}
                  className="border-border hover:border-primary/40 overflow-hidden rounded-xl border transition-colors"
                >
                  {playing === hit.id ? (
                    <div className="aspect-video w-full bg-black">
                      <iframe
                        src={`https://www.youtube-nocookie.com/embed/${hit.id}?autoplay=1&rel=0&modestbranding=1&hl=${locale}`}
                        title={hit.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="size-full border-0"
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPlaying(hit.id)}
                      className="group relative block w-full"
                      aria-label={hit.title}
                    >
                      <img
                        src={hit.thumbnail}
                        alt=""
                        loading="lazy"
                        className="aspect-video w-full object-cover"
                      />
                      <span className="absolute inset-0 grid place-items-center bg-black/25 transition-colors group-hover:bg-black/40">
                        <span className="grid size-12 place-items-center rounded-full bg-white/90 shadow-lg">
                          <Play className="size-5 translate-x-px fill-current text-[#0f172a]" />
                        </span>
                      </span>
                      {hit.duration && (
                        <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[0.7rem] font-medium text-white">
                          {hit.duration}
                        </span>
                      )}
                    </button>
                  )}

                  <div className="flex items-start justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-semibold leading-snug">
                        {hit.title}
                      </p>
                      <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        <span className="truncate">{hit.channel}</span>
                        {hit.views !== null && (
                          <span>{t("videoSearch.views", { count: formatViews(hit.views, locale) })}</span>
                        )}
                        {hit.trusted && (
                          <span
                            className={cn(
                              "text-primary bg-primary/10 inline-flex items-center gap-1",
                              "rounded-full px-1.5 py-0.5 font-semibold",
                            )}
                          >
                            <Sparkles className="size-3" />
                            {t("videoSearch.recommended")}
                          </span>
                        )}
                      </p>
                    </div>
                    <a
                      href={`https://www.youtube.com/watch?v=${hit.id}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-muted-foreground hover:text-primary mt-0.5 shrink-0"
                      aria-label={t("videoSearch.openYoutube")}
                      title={t("videoSearch.openYoutube")}
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!loading && !error && hits.length > 0 && (
          <p className="border-border text-muted-foreground border-t px-4 py-2 text-[0.7rem]">
            {t("videoSearch.disclaimer")}
          </p>
        )}
      </motion.div>
    </div>
  );
}
