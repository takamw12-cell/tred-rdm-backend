import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkCheck, BookmarkPlus, Check, Clapperboard, Loader2, PenLine, Play, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/modal";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { safeLazy } from "@/lib/lazy-import";
import {
  fetchExplainerVideo,
  formatDuration,
  listSavedExplainerVideos,
  saveExplainerVideo,
  type DrawStyle,
  type ExplainerState,
  type ExplainerStep,
  type ExplainerVideo,
} from "@/lib/explainer-video";

/**
 * « Als Video erklären » — la fenêtre de la vidéo explicative (chat et tableau
 * de bord) et la section « Meine Erklärvideos ».
 *
 * Le lecteur (Remotion) est chargé à la demande : il ne pèse rien tant que
 * personne n'ouvre une vidéo.
 */
const ExplainerPlayer = safeLazy(() => import("@/video/explainer-player"));

const SAVED_KEY = ["explainer-videos"] as const;

/** Ordinateur : vidéo horizontale ; téléphone et tablette en portrait : verticale. */
const WIDE = "(min-width: 1024px)";
function useWideScreen(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(WIDE);
      mq.addEventListener("change", notify);
      return () => mq.removeEventListener("change", notify);
    },
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}

const Spinner = () => (
  <div className="grid place-items-center py-16">
    <Loader2 className="text-primary size-8 animate-spin" aria-hidden />
  </div>
);

/** La préparation : ce que TRED est en train de faire, étape par étape. */
function Preparing({ step, drawn, progress }: { step: ExplainerStep; drawn?: boolean; progress?: number }) {
  const { t } = useT();
  const steps: { key: ExplainerStep; label: string }[] = [
    { key: "script", label: t("explainer.stepScript") },
    { key: "voice", label: t("explainer.stepVoice") },
    // Vidéo dessinée : deux étapes de plus, le dessin puis l'assemblage du MP4.
    ...(drawn ? [{ key: "drawing" as const, label: t("explainer.stepDrawing") }, { key: "assembly" as const, label: t("explainer.stepAssembly") }] : []),
  ];
  const active = Math.max(0, steps.findIndex((s) => s.key === step));
  // La barre : une part égale par étape ; pendant le dessin, elle avance avec les images rendues.
  const within = step === "drawing" ? Math.min(100, Math.max(0, progress ?? 0)) / 100 : 0.5;
  const percent = Math.round(((active + (step === "pending" ? 0.1 : within)) / steps.length) * 100);
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center" role="status" aria-live="polite">
      <Loader2 className="text-primary size-10 animate-spin" aria-hidden />
      <p className="font-display text-lg font-semibold">{t("explainer.preparing")}</p>
      {drawn && (
        <progress className="h-2 w-full max-w-xs [accent-color:var(--primary)]" value={percent} max={100} aria-label={t("explainer.preparing")} />
      )}
      <ul className="flex flex-col gap-1.5 text-sm">
        {steps.map((s, i) => (
          <li key={s.key} className={cn("flex items-center justify-center gap-2", i === active ? "text-foreground font-medium" : "text-muted-foreground")}>
            {i < active ? <Check className="size-4 text-emerald-600" aria-hidden /> : <span className={cn("size-2 rounded-full", i === active ? "bg-primary" : "bg-muted-foreground/40")} aria-hidden />}
            {s.label} …
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Le lecteur et le bouton « Im Dashboard speichern ». */
function Ready({ video }: { video: ExplainerVideo }) {
  const { t } = useT();
  const wide = useWideScreen();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(video.saved);
  const [busy, setBusy] = useState(false);
  useEffect(() => setSaved(video.saved), [video.id, video.saved]);

  const toggle = async () => {
    setBusy(true);
    const next = !saved;
    if (await saveExplainerVideo(video.id, next)) {
      setSaved(next);
      void qc.invalidateQueries({ queryKey: SAVED_KEY });
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Vertical : la hauteur de l'écran limite la largeur, jamais l'inverse. */}
      {video.videoUrl ? (
        // La vidéo dessinée : un vrai fichier MP4 (16:9), sous-titres dans le fichier.
        <video key={video.id} src={video.videoUrl} controls autoPlay playsInline preload="metadata" className="border-border mx-auto aspect-video w-full rounded-xl border bg-black" data-slot="drawn-video">
          {/* Sous-titres désactivables : les mots horodatés de la voix, servis en WebVTT. */}
          <track kind="captions" src={`/api/video/${video.id}/captions`} srcLang={video.language} label={video.language.toUpperCase()} />
        </video>
      ) : (
        <div className="mx-auto w-full" style={wide ? undefined : { maxWidth: "calc(64vh * 9 / 16)" }}>
          <Suspense fallback={<Spinner />}>
            <ExplainerPlayer video={video} orientation={wide ? "landscape" : "portrait"} />
          </Suspense>
        </div>
      )}
      <div className="flex justify-center">
        <Button onClick={toggle} disabled={busy} variant={saved ? "outline" : "default"} title={saved ? t("explainer.remove") : undefined}>
          {saved ? <BookmarkCheck className="size-4" aria-hidden /> : <BookmarkPlus className="size-4" aria-hidden />}
          {saved ? t("explainer.saved") : t("explainer.save")}
        </Button>
      </div>
    </div>
  );
}

/** Avant la génération : tableau blanc ou cinématique ? */
function StyleChoice({ onChoose }: { onChoose: (style: DrawStyle) => void }) {
  const { t } = useT();
  const options: { style: DrawStyle; icon: typeof PenLine; label: string; hint: string; swatch: string }[] = [
    { style: "whiteboard", icon: PenLine, label: t("explainer.styleWhiteboard"), hint: t("explainer.styleWhiteboardHint"), swatch: "bg-[#FDFBF7] text-[#1A1A1A]" },
    { style: "cinematic", icon: Sparkles, label: t("explainer.styleCinematic"), hint: t("explainer.styleCinematicHint"), swatch: "bg-[#0F172A] text-[#EAB308]" },
  ];
  return (
    <div className="flex flex-col gap-4 py-4">
      <p className="text-center text-base font-medium">{t("explainer.styleTitle")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((o) => (
          <button
            key={o.style}
            type="button"
            onClick={() => onChoose(o.style)}
            data-slot={`style-${o.style}`}
            className="border-border hover:border-primary focus-visible:ring-ring/50 flex flex-col items-start gap-3 rounded-2xl border p-4 text-left transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
          >
            <span className={cn("border-border grid aspect-video w-full place-items-center rounded-xl border", o.swatch)}>
              <o.icon className="size-9" aria-hidden />
            </span>
            <span className="font-display text-lg font-semibold">{o.label}</span>
            <span className="text-muted-foreground text-sm">{o.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ExplainerVideoDialog({
  state,
  onClose,
  onRetry,
  onChooseStyle,
}: {
  /** null = fermée. */
  state: ExplainerState | null;
  onClose: () => void;
  onRetry?: () => void;
  /** Le style choisi par l'étudiant (phase « chooseStyle »). */
  onChooseStyle?: (style: DrawStyle) => void;
}) {
  const { t } = useT();
  const title = state?.phase === "done" && state.video.title ? state.video.title : t("video.title");
  return (
    <Modal open={state !== null} onClose={onClose} title={title} className="max-h-[94vh] max-w-3xl overflow-y-auto p-4 sm:p-6">
      {state?.phase === "chooseStyle" && onChooseStyle && <StyleChoice onChoose={onChooseStyle} />}

      {state?.phase === "working" && <Preparing step={state.step} drawn={state.drawn} progress={state.progress} />}

      {state?.phase === "done" && <Ready video={state.video} />}

      {/* Ni cours ni calcul de solveur : pas de vidéo inventée. */}
      {state?.phase === "needDocs" && (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <Upload className="text-primary size-9" aria-hidden />
          <p className="max-w-md text-base">{t("explainer.needDocs")}</p>
          <Button asChild>
            <Link to="/dashboard" onClick={onClose}>
              <Upload className="size-4" aria-hidden />
              {t("explainer.upload")}
            </Link>
          </Button>
        </div>
      )}

      {state?.phase === "error" && (
        <div className="flex flex-col items-center gap-4 py-8 text-center" role="alert">
          <p className="max-w-md text-base">
            {state.code === "grounded" ? t("explainer.errorGrounded") : state.code === "limit" ? t("explainer.errorLimit") : t("explainer.errorGeneric")}
          </p>
          {state.code === "generic" && onRetry && (
            <Button variant="outline" onClick={onRetry}>
              {t("video.retry")}
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Tableau de bord : « Meine Erklärvideos » — les vidéos sauvegardées, à relire. */
export function ExplainerVideosWidget() {
  const { t, locale } = useT();
  const { data: videos = [] } = useQuery({ queryKey: SAVED_KEY, queryFn: listSavedExplainerVideos, staleTime: 60_000 });
  const [open, setOpen] = useState<ExplainerState | null>(null);

  const play = async (id: string) => {
    setOpen({ phase: "working", step: "voice" });
    const video = await fetchExplainerVideo(id);
    setOpen(video ? { phase: "done", video } : { phase: "error", code: "generic" });
  };

  return (
    <Card className="rounded-2xl" data-slot="card" data-tour="explainer-videos">
      <CardContent className="pt-0">
        <h2 className="font-display mb-3 flex items-center gap-2 text-xl font-semibold">
          <Clapperboard className="text-primary size-5" aria-hidden />
          {t("explainer.myVideos")}
        </h2>
        {videos.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("explainer.myVideosEmpty")}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => void play(v.id)}
                  className="border-border hover:bg-accent focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
                  aria-label={`${t("explainer.play")}: ${v.title}`}
                >
                  <span className="bg-primary text-primary-foreground grid size-10 shrink-0 place-items-center rounded-lg">
                    <Play className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{v.title || t("video.title")}</span>
                    <span className="text-muted-foreground block text-xs">
                      {new Date(v.createdAt).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })} · {formatDuration(v.durationMs)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <ExplainerVideoDialog state={open} onClose={() => setOpen(null)} />
    </Card>
  );
}
