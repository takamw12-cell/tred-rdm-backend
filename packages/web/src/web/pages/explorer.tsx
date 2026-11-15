import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Gamepad2, Lightbulb, Loader2, Maximize2, MessageCircleQuestion, Minimize2, Pause, Play, RotateCcw } from "lucide-react";
import { PageContainer, PageHeader, Reveal } from "@/components/page";
import { ProfessorPortrait } from "@/components/professor-portrait";
import { FormulaSteps } from "@/components/formula-steps";
import { useT } from "@/i18n";
import { askPrompt, customModel, DISCIPLINES, EXPLORER_MODELS, glbUrl, hotspotOf, isModelId, modelsOf, pick, type Discipline, type ExplorerModelId } from "@/lib/explorer-models";
import { useProfessor } from "@/lib/professors";
import { cn } from "@/lib/utils";

/**
 * L'Explorateur 3D (2026-11-15) : un modèle que l'on tourne et que l'on
 * touche. Chaque point ouvre l'explication du professeur ; une formule peut
 * s'y construire pas à pas ; « Den Tutor fragen » emmène la question au
 * Hörsaal, préremplie.
 *
 * Three.js n'est chargé qu'ICI, à l'ouverture de la page (React.lazy) : le
 * reste de l'app ne le télécharge jamais pour rien.
 */
const Explorer3D = lazy(() => import("@/components/Explorer3D"));

/** Clé lue par le Hörsaal à son ouverture : la question l'attend dans le champ de saisie. */
export const ASK_DRAFT_KEY = "tred.askDraft";

const SPRING = { type: "spring", stiffness: 320, damping: 28 } as const;

export default function ExplorerPage() {
  const { t, locale } = useT();
  const [, navigate] = useLocation();
  const search = useSearch();
  const professor = useProfessor();
  const reduced = useReducedMotion();

  // /explorer?model=gearbox&part=wheel : un lien peut ouvrir un modèle et une pièce.
  const fromUrl = useMemo(() => new URLSearchParams(search), [search]);
  const [modelId, setModelId] = useState<ExplorerModelId>(() => {
    const wanted = fromUrl.get("model");
    return isModelId(wanted) ? wanted : "turbofan";
  });
  // /explorer?glb=nom : un fichier déposé dans public/models/ (nom restreint, lib/explorer-models.ts).
  const customName = fromUrl.get("glb");
  const [modelUrl, setModelUrl] = useState<string | null>(() => glbUrl(customName));
  const model = modelUrl && customName ? customModel(customName) : EXPLORER_MODELS[modelId];
  const discipline = EXPLORER_MODELS[modelId].discipline;
  const [active, setActive] = useState<string | null>(() => hotspotOf(EXPLORER_MODELS[modelId], fromUrl.get("part"))?.id ?? null);
  // Mouvement réduit : la scène démarre à l'arrêt, l'étudiant la lance s'il le veut.
  const [playing, setPlaying] = useState(!reduced);
  const hotspot = hotspotOf(model, active);

  const labels = useMemo(() => Object.fromEntries(model.hotspots.map((h) => [h.id, pick(h.title, locale)])), [model, locale]);
  const steps = useMemo(() => hotspot?.steps?.map((s) => ({ tex: s.tex, note: pick(s.note, locale) })) ?? null, [hotspot, locale]);

  const resetView = useRef<() => void>(() => {});
  const onResetReady = useCallback((fn: () => void) => {
    resetView.current = fn;
  }, []);

  function switchModel(id: ExplorerModelId) {
    if (id === modelId && !modelUrl) return;
    setModelUrl(null);
    setModelId(id);
    setActive(null);
  }
  /** Changer de filière ouvre son premier modèle. */
  function switchDiscipline(next: Discipline) {
    const first = modelsOf(next)[0];
    if (first && first.id !== "custom") switchModel(first.id);
  }

  // Plein écran : la scène et son panneau ensemble (l'explication reste lisible).
  const stage = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const canFullscreen = typeof document !== "undefined" && document.fullscreenEnabled;
  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === stage.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stage.current?.requestFullscreen().catch(() => {});
  }

  /** La question part au Hörsaal, préremplie : c'est l'étudiant qui l'envoie (rien n'est décompté sans lui). */
  function askTutor() {
    if (!hotspot) return;
    try {
      sessionStorage.setItem(ASK_DRAFT_KEY, JSON.stringify(askPrompt(model, hotspot, locale)));
    } catch {
      /* navigation privée : le Hörsaal s'ouvre, le champ reste vide */
    }
    navigate("/chat");
  }

  const tool = "grid size-10 place-items-center rounded-full bg-[#0F172A]/80 text-white ring-1 ring-white/15 backdrop-blur transition-colors hover:bg-[#0F172A] hover:text-[#EAB308] focus-visible:ring-2 focus-visible:ring-[#EAB308] focus-visible:outline-none";

  return (
    <PageContainer className="max-w-7xl">
      <PageHeader title={t("explorer.title")} subtitle={t("explorer.subtitle")} />

      {/* Les filières : TRED n'est pas réservé aux ingénieurs. */}
      <Reveal className="mb-3">
        <div role="tablist" aria-label={t("explorer.discipline")} className="flex gap-1.5 overflow-x-auto pb-1" data-testid="discipline-tabs">
          {DISCIPLINES.map((d) => {
            const on = !modelUrl && d.id === discipline;
            return (
              <button
                key={d.id}
                type="button"
                role="tab"
                aria-selected={on}
                data-testid={`discipline-${d.id}`}
                onClick={() => switchDiscipline(d.id)}
                className={cn(
                  "min-h-10 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-[#EAB308] focus-visible:outline-none motion-safe:active:scale-[0.97]",
                  on ? "border-[#0F172A] bg-[#0F172A] text-white" : "border-border bg-card text-card-foreground hover:border-[#EAB308]",
                )}
              >
                {pick(d.name, locale)}
              </button>
            );
          })}
        </div>
      </Reveal>

      <Reveal>
        <div
          ref={stage}
          data-testid="explorer-stage"
          data-model={model.id}
          className={cn(
            "grid overflow-hidden border border-white/10 bg-[#0B1220] text-white shadow-xl lg:grid-cols-[minmax(0,1fr)_23rem]",
            full ? "h-screen grid-rows-[minmax(0,1fr)_auto] rounded-none lg:grid-rows-1" : "rounded-3xl",
          )}
        >
          {/* ── La scène ─────────────────────────────────────────────────── */}
          <div
            className={cn(
              "relative bg-[radial-gradient(ellipse_at_30%_15%,#1E3154_0%,#0B1220_62%)]",
              full ? "min-h-0 lg:h-full" : "aspect-[4/3] sm:aspect-[16/10] lg:aspect-auto lg:h-[min(72vh,680px)]",
            )}
          >
            {/* Quadrillage d'atelier, très discret. */}
            <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:44px_44px]" />

            <Suspense
              fallback={
                <output className="absolute inset-0 grid place-items-center text-sm text-white/80" data-testid="explorer-loading">
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-5 animate-spin text-[#EAB308]" />
                    {t("explorer.loading")}
                  </span>
                </output>
              }
            >
              <Explorer3D
                model={model}
                modelUrl={modelUrl}
                active={active}
                onSelect={setActive}
                playing={playing}
                labels={labels}
                label={t("explorer.sceneLabel", { name: pick(model.name, locale) })}
                noWebGL={t("explorer.noWebgl")}
                onResetReady={onResetReady}
              />
            </Suspense>

            {/* Choix du modèle. */}
            <fieldset aria-label={t("explorer.model")} // Téléphone : en bas, sur une ligne (en haut, les deux noms passaient sur deux lignes et couvraient le modèle).
              className="absolute bottom-3 left-3 m-0 flex min-w-0 gap-1 rounded-full border-0 bg-[#0F172A]/80 p-1 ring-1 ring-white/15 backdrop-blur sm:top-3 sm:bottom-auto">
              {modelsOf(discipline).map(({ id }) => id).filter((id): id is ExplorerModelId => id !== "custom").map((id) => (
                <button
                  key={id}
                  type="button"
                  data-testid={`model-${id}`}
                  aria-pressed={id === modelId && !modelUrl}
                  onClick={() => switchModel(id)}
                  className={cn(
                    "min-h-9 rounded-full px-3 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-[#EAB308] focus-visible:outline-none",
                    id === modelId && !modelUrl ? "bg-[#EAB308] text-[#0F172A]" : "text-white/80 hover:text-white",
                  )}
                >
                  {pick(EXPLORER_MODELS[id].name, locale)}
                </button>
              ))}
            </fieldset>

            {/* Commandes de la scène. */}
            <div className="absolute top-3 right-3 flex gap-1.5">
              <button type="button" className={tool} onClick={() => setPlaying((p) => !p)} aria-label={playing ? t("explorer.pause") : t("explorer.play")} title={playing ? t("explorer.pause") : t("explorer.play")} data-testid="explorer-play">
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              </button>
              <button type="button" className={tool} onClick={() => resetView.current()} aria-label={t("explorer.reset")} title={t("explorer.reset")} data-testid="explorer-reset">
                <RotateCcw className="size-4" />
              </button>
              {canFullscreen && (
                <button type="button" className={tool} onClick={toggleFullscreen} aria-label={full ? t("explorer.exitFullscreen") : t("explorer.fullscreen")} title={full ? t("explorer.exitFullscreen") : t("explorer.fullscreen")}>
                  {full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                </button>
              )}
            </div>

            <p className="pointer-events-none absolute bottom-3 left-3 hidden rounded-full bg-[#0F172A]/75 px-3 py-1 text-[11px] text-white/80 ring-1 ring-white/10 backdrop-blur sm:block">{t("explorer.hint")}</p>
          </div>

          {/* ── Le professeur explique ───────────────────────────────────── */}
          <aside className={cn("flex min-h-0 flex-col gap-4 overflow-y-auto border-t border-white/10 bg-[#0F172A] p-4 sm:p-5 lg:border-t-0 lg:border-l", full ? "max-h-[45vh] lg:max-h-none" : "lg:max-h-[min(72vh,680px)]")} data-testid="explorer-panel">
            <div className="flex items-center gap-3">
              <span className="size-12 shrink-0 overflow-hidden rounded-full ring-2 ring-[#EAB308]">
                <ProfessorPortrait professor={professor} eager />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{t("explorer.professorSays", { name: professor.name })}</p>
                <p className="truncate text-xs text-white/70">{pick(model.name, locale)}</p>
              </div>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${modelId}:${active ?? "intro"}`}
                initial={reduced ? false : { opacity: 0, y: 14, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduced ? undefined : { opacity: 0, y: -8, transition: { duration: 0.12 } }}
                transition={SPRING}
                className="space-y-3"
                aria-live="polite"
              >
                {hotspot ? (
                  <>
                    <div className="rounded-2xl rounded-tl-sm bg-white/[0.07] p-4 ring-1 ring-white/10" data-testid="explorer-explanation">
                      <h2 className="font-display text-lg font-bold text-[#EAB308]">{pick(hotspot.title, locale)}</h2>
                      <p className="mt-1.5 text-sm leading-relaxed text-white/90">{pick(hotspot.text, locale)}</p>
                    </div>
                    <div className="flex items-start gap-2.5 rounded-2xl border-l-4 border-[#EAB308] bg-[#EAB308]/10 p-3">
                      <Lightbulb className="mt-0.5 size-4 shrink-0 text-[#EAB308]" />
                      <p className="text-sm leading-snug text-white/90">
                        <span className="font-semibold text-[#EAB308]">{t("explorer.remember")}: </span>
                        {pick(hotspot.fact, locale)}
                      </p>
                    </div>
                    {steps && <FormulaSteps steps={steps} title={t("explorer.stepsTitle")} replayLabel={t("explorer.replay")} />}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={askTutor}
                        data-testid="explorer-ask"
                        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#EAB308] px-4 text-sm font-semibold text-[#0F172A] transition-transform hover:bg-[#FACC15] focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none motion-safe:active:scale-[0.97]"
                      >
                        <MessageCircleQuestion className="size-4" />
                        {t("explorer.ask")}
                      </button>
                      {modelId === "turbofan" && (
                        <Link
                          to="/minigame"
                          className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white ring-1 ring-white/25 transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#EAB308] focus-visible:outline-none"
                        >
                          <Gamepad2 className="size-4" />
                          {t("explorer.test")}
                        </Link>
                      )}
                    </div>
                    <p className="text-[11px] leading-snug text-white/60">{t("explorer.askHint")}</p>
                  </>
                ) : (
                  <div className="rounded-2xl rounded-tl-sm bg-white/[0.07] p-4 ring-1 ring-white/10">
                    <p className="text-sm leading-relaxed text-white/90">{pick(model.intro, locale)}</p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* La même sélection, en liste : clavier, lecteur d'écran, et petits écrans. */}
            <div>
              {model.hotspots.length > 0 && <h3 className="mb-2 text-xs font-semibold tracking-[0.14em] text-white/70 uppercase">{hotspot ? t("explorer.parts") : t("explorer.pickPart")}</h3>}
              <ul className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
                {model.hotspots.map((h, i) => {
                  const on = h.id === active;
                  return (
                    <li key={h.id}>
                      <button
                        type="button"
                        data-testid={`part-${h.id}`}
                        aria-pressed={on}
                        onClick={() => setActive(on ? null : h.id)}
                        className={cn(
                          "flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[#EAB308] focus-visible:outline-none",
                          on ? "bg-[#EAB308] text-[#0F172A]" : "bg-white/[0.05] text-white/90 hover:bg-white/10",
                        )}
                      >
                        <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold", on ? "bg-[#0F172A] text-white" : "bg-[#0F172A] text-[#EAB308] ring-1 ring-[#EAB308]")}>{i + 1}</span>
                        <span className="min-w-0 truncate">{pick(h.title, locale)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>
        </div>
      </Reveal>
    </PageContainer>
  );
}
