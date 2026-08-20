import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, SkipBack, SkipForward, X, Loader2, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SvgDiagramFrame } from "@/components/diagram-frame";
import { MarkdownContent } from "@/components/markdown-content";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

export interface VideoScene {
  heading: string;
  narration: string;
  bullets: string[];
  formula: string;
  svg: string;
  seconds: number;
}
export interface VideoScript {
  title: string;
  scenes: VideoScene[];
}

const SPEECH_LANG: Record<string, string> = {
  de: "de-DE",
  fr: "fr-FR",
  en: "en-US",
};

/**
 * Studyflix-style explainer: animated slides narrated by the device's speech
 * synthesis. A scene advances when its narration finishes (or after its
 * estimated duration when speech is unavailable or muted).
 */
export function VideoExplainer({
  script,
  loading,
  error,
  onClose,
  onRetry,
}: {
  script: VideoScript | null;
  loading: boolean;
  error: boolean;
  onClose: () => void;
  onRetry?: () => void;
}) {
  const { t, locale } = useT();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);

  const scenes = script?.scenes ?? [];
  const scene = scenes[index];

  const speechSupported = useMemo(
    () => typeof window !== "undefined" && "speechSynthesis" in window,
    [],
  );

  const stopSpeech = useCallback(() => {
    if (speechSupported) window.speechSynthesis.cancel();
  }, [speechSupported]);

  // Reset when a new script arrives.
  useEffect(() => {
    setIndex(0);
    setPlaying(true);
    setProgress(0);
  }, [script]);

  // Always stop the voice when the player unmounts.
  useEffect(() => () => stopSpeech(), [stopSpeech]);

  const goNext = useCallback(() => {
    setProgress(0);
    setIndex((i) => {
      if (i + 1 < scenes.length) return i + 1;
      setPlaying(false);
      return i;
    });
  }, [scenes.length]);

  // Narration + scene timing.
  useEffect(() => {
    if (!scene || !playing) return;
    let cancelled = false;
    const durationMs = Math.max(4, scene.seconds) * 1000;

    stopSpeech();
    let usedSpeech = false;
    if (speechSupported && !muted && scene.narration.trim()) {
      const utter = new SpeechSynthesisUtterance(scene.narration);
      utter.lang = SPEECH_LANG[locale] ?? "de-DE";
      utter.rate = 0.98;
      utter.onend = () => {
        if (!cancelled) goNext();
      };
      window.speechSynthesis.speak(utter);
      usedSpeech = true;
    }

    // Progress bar, and the fallback advance when there is no speech.
    const started = Date.now();
    const tick = window.setInterval(() => {
      const ratio = Math.min(1, (Date.now() - started) / durationMs);
      setProgress(ratio);
      if (ratio >= 1 && !usedSpeech && !cancelled) goNext();
    }, 100);

    return () => {
      cancelled = true;
      window.clearInterval(tick);
      stopSpeech();
    };
  }, [scene, playing, muted, locale, speechSupported, goNext, stopSpeech]);

  function jump(delta: number) {
    stopSpeech();
    setProgress(0);
    setIndex((i) => Math.min(scenes.length - 1, Math.max(0, i + delta)));
  }

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
          <p className="truncate text-sm font-semibold">
            {script?.title || t("video.title")}
          </p>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label={t("common.close")}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6">
          {loading && (
            <div className="text-muted-foreground flex flex-col items-center gap-3 py-14 text-sm">
              <Loader2 className="size-6 animate-spin" />
              <p>{t("video.generating")}</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center gap-3 py-14 text-sm">
              <p className="text-destructive">{t("video.error")}</p>
              {onRetry && (
                <Button variant="outline" onClick={onRetry}>
                  {t("video.retry")}
                </Button>
              )}
            </div>
          )}

          {scene && !loading && !error && (
            <AnimatePresence mode="wait">
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35 }}
                className="space-y-4"
              >
                <h3 className="font-display text-xl font-bold sm:text-2xl">
                  {scene.heading}
                </h3>

                {scene.bullets.length > 0 && (
                  <ul className="space-y-2">
                    {scene.bullets.map((b, i) => (
                      <motion.li
                        key={i}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.25 + i * 0.35 }}
                        className="flex items-start gap-2 text-sm sm:text-base"
                      >
                        <span className="bg-primary mt-2 size-1.5 shrink-0 rounded-full" />
                        <span>{b}</span>
                      </motion.li>
                    ))}
                  </ul>
                )}

                {scene.svg.trim() && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    <SvgDiagramFrame svg={scene.svg} name="szene" background="card" />
                  </motion.div>
                )}

                {scene.formula.trim() && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.45 }}
                    className="bg-secondary/60 rounded-xl px-4 py-3"
                  >
                    <MarkdownContent content={`$$${scene.formula}$$`} />
                  </motion.div>
                )}

                <p className="text-muted-foreground border-border/60 border-t pt-3 text-sm leading-relaxed">
                  {scene.narration}
                </p>
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {scenes.length > 0 && !loading && !error && (
          <div className="border-border space-y-2 border-t px-4 py-3">
            <div className="flex gap-1">
              {scenes.map((_, i) => (
                <div key={i} className="bg-muted h-1 flex-1 overflow-hidden rounded-full">
                  <div
                    className="brand-gradient h-full rounded-full transition-[width] duration-100"
                    style={{
                      width: i < index ? "100%" : i === index ? `${progress * 100}%` : "0%",
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">
                {t("video.scene", { current: index + 1, total: scenes.length })}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setMuted((m) => !m)}
                  className={cn(
                    "text-muted-foreground hover:text-foreground grid size-8 place-items-center rounded-lg",
                    !speechSupported && "opacity-40",
                  )}
                  disabled={!speechSupported}
                  aria-label={t("video.sound")}
                  title={t("video.sound")}
                >
                  {muted || !speechSupported ? (
                    <VolumeX className="size-4" />
                  ) : (
                    <Volume2 className="size-4" />
                  )}
                </button>
                <button
                  onClick={() => jump(-1)}
                  disabled={index === 0}
                  className="text-muted-foreground hover:text-foreground grid size-8 place-items-center rounded-lg disabled:opacity-40"
                  aria-label={t("video.prev")}
                >
                  <SkipBack className="size-4" />
                </button>
                <button
                  onClick={() => setPlaying((p) => !p)}
                  className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-full"
                  aria-label={playing ? t("video.pause") : t("video.play")}
                >
                  {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                </button>
                <button
                  onClick={() => jump(1)}
                  disabled={index >= scenes.length - 1}
                  className="text-muted-foreground hover:text-foreground grid size-8 place-items-center rounded-lg disabled:opacity-40"
                  aria-label={t("video.next")}
                >
                  <SkipForward className="size-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
