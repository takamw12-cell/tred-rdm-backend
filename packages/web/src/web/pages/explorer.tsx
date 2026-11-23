import { Component, type ReactNode, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Gamepad2, Lightbulb, Loader2, Maximize2, MessageCircleQuestion, Minimize2, Pause, Play, RotateCcw, Scissors } from "lucide-react";
import { PageContainer, PageHeader, Reveal } from "@/components/page";
import { ProfessorPortrait } from "@/components/professor-portrait";
import { FormulaSteps } from "@/components/formula-steps";
import { useT } from "@/i18n";
import { askPrompt, customModel, DISCIPLINES, EXPLORER_MODELS, glbUrl, hotspotOf, isModelId, modelsOf, pick, type Discipline, type ExplorerModelId } from "@/lib/explorer-models";
import { useProfessor } from "@/lib/professors";
import { cn } from "@/lib/utils";
import { safeLazy } from "@/lib/lazy-import";
import { deviceTier } from "@/lib/device-tier";
import { report as reportClientError } from "@/components/error-boundary";
import { Atelier } from "@/components/atelier";
import { ExplorerLibrary } from "@/components/explorer-library";
import { guessDetective, startDetective } from "@/lib/detective";
import { useQueryClient } from "@tanstack/react-query";
import { creditsMeKey } from "@/queries/credits";
import { useToastStore } from "@/stores/toast";

/**
 * L'Explorateur 3D (2026-11-15) : un modèle que l'on tourne et que l'on
 * touche. Chaque point ouvre l'explication du professeur ; une formule peut
 * s'y construire pas à pas ; « Den Tutor fragen » emmène la question au
 * Hörsaal, préremplie.
 *
 * Three.js n'est chargé qu'ICI, à l'ouverture de la page (React.lazy) : le
 * reste de l'app ne le télécharge jamais pour rien.
 */
const Explorer3D = safeLazy(() => import("@/components/Explorer3D"));

/** Clé lue par le Hörsaal à son ouverture : la question l'attend dans le champ de saisie. */
export const ASK_DRAFT_KEY = "tred.askDraft";

const SPRING = { type: "spring", stiffness: 320, damping: 28 } as const;

/**
 * /explorer : la bibliothèque (grille des scènes) ; /explorer?model=… ou ?glb=… : la scène ;
 * /explorer?atelier=… : un simulateur interactif (components/atelier.tsx).
 */
export default function ExplorerPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  if (params.get("atelier")) return <Atelier />;
  return params.get("model") || params.get("glb") ? <ExplorerViewer /> : <ExplorerLibrary />;
}

function ExplorerViewer() {
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
  // Mode coupe (cœur) : la profondeur du plan, ou null pour le modèle entier.
  const [section, setSection] = useState<number | null>(null);
  const canSection = !modelUrl && modelId === "heart";

  const labels = useMemo(() => Object.fromEntries(model.hotspots.map((h) => [h.id, pick(h.title, locale)])), [model, locale]);
  const steps = useMemo(() => hotspot?.steps?.map((s) => ({ tex: s.tex, note: pick(s.note, locale) })) ?? null, [hotspot, locale]);

  // Ce que l'appareil peut afficher (lib/device-tier.ts) ; « low » : 3D seulement sur demande.
  const tier = useMemo(() => deviceTier(), []);
  const [force3d, setForce3d] = useState(false);
  const show3d = tier === "high" || tier === "mobile" || (tier === "low" && force3d);
  const posterId = modelUrl ? null : modelId;

  // ── 3D Detective (api/explorer/detective.ts) : le serveur tire les pièces et corrige.
  const qc = useQueryClient();
  const showToast = useToastStore((x) => x.show);
  const [game, setGame] = useState<{ sessionId: string; total: number; target: string; nextTarget: string | null; round: number; correct: number; finished: boolean } | null>(null);
  const [guessFx, setGuessFx] = useState<{ right: boolean; clicked: string; target: string } | null>(null);
  const [marks, setMarks] = useState<Record<string, "right" | "wrong">>({});
  const [gameBusy, setGameBusy] = useState(false);
  const canPlay = !modelUrl && model.hotspots.length >= 3;

  async function startGame() {
    setGameBusy(true);
    try {
      const data = await startDetective(modelId);
      if (!data) return;
      setActive(null);
      setMarks({});
      setGuessFx(null);
      setGame({ ...data, nextTarget: null, round: 0, correct: 0, finished: false });
    } finally {
      setGameBusy(false);
    }
  }
  async function guessPart(id: string | null) {
    if (!game || !id || guessFx || gameBusy || game.finished) return;
    setGameBusy(true);
    try {
      const r = await guessDetective(game.sessionId, id);
      if (!r) return;
      setMarks(r.right ? { [id]: "right" } : { [id]: "wrong", [r.target]: "right" });
      setGuessFx({ right: r.right, clicked: id, target: r.target });
      // La question affichée reste celle qu'on vient de jouer jusqu'à « Weiter ».
      setGame((g) => (g ? { ...g, round: r.round, correct: r.correct, finished: r.finished, nextTarget: r.next } : g));
      if (r.finished && r.reward?.granted) {
        showToast(t("detective.reward", { n: r.reward.amount }));
        void qc.invalidateQueries({ queryKey: creditsMeKey() });
      } else if (r.finished && r.reward?.reason === "daily_cap") showToast(t("detective.rewardCap"));
    } finally {
      setGameBusy(false);
    }
  }
  function nextRound() {
    setGuessFx(null);
    setMarks({});
    setGame((g) => (g && g.nextTarget ? { ...g, target: g.nextTarget, nextTarget: null } : g));
  }
  function endGame() {
    setGame(null);
    setGuessFx(null);
    setMarks({});
  }
  const targetSpot = game ? hotspotOf(model, game.target) : null;
  const pickPart = useCallback((id: string | null) => (game ? void guessPart(id) : setActive(id)), [game, guessFx, gameBusy]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetView = useRef<() => void>(() => {});
  const onResetReady = useCallback((fn: () => void) => {
    resetView.current = fn;
  }, []);

  function switchModel(id: ExplorerModelId) {
    if (id === modelId && !modelUrl) return;
    setModelUrl(null);
    setModelId(id);
    setActive(null);
    setSection(null);
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
      <Link to="/explorer" className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-sm font-medium" data-testid="explorer-back">
        ← {t("explorer.allModels")}
      </Link>
      <PageHeader title={t("explorer.title")} subtitle={t("explorer.subtitle")} />

      {/* Les filières : TRED n'est pas réservé aux ingénieurs. */}
      <Reveal className="mb-3">
        <div role="tablist" aria-label={t("explorer.discipline")} className="flex gap-1.5 overflow-x-auto pb-1" data-testid="discipline-tabs">
          {DISCIPLINES.filter((d) => modelsOf(d.id).length > 0).map((d) => {
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
            "grid overflow-hidden border border-white/10 bg-[#05070C] text-white shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] lg:grid-cols-[minmax(0,1fr)_23rem]",
            full ? "h-screen grid-rows-[minmax(0,1fr)_auto] rounded-none lg:grid-rows-1" : "rounded-3xl",
          )}
        >
          {/* ── La scène ─────────────────────────────────────────────────── */}
          <div
            className={cn(
              "relative bg-[radial-gradient(ellipse_at_35%_20%,#1A2233_0%,#07090E_68%)]",
              full ? "min-h-0 lg:h-full" : "aspect-[4/3] sm:aspect-[16/10] lg:aspect-auto lg:h-[min(72vh,680px)]",
            )}
          >
            {/* Quadrillage d'atelier, très discret. */}
            <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:44px_44px]" />

            {/* Appareil modeste ou sans WebGL 2 : image fixe d'abord (lib/device-tier.ts). */}
            {!show3d ? (
              <SceneUnavailable
                posterId={posterId}
                message={tier === "none" ? t("explorer.noWebgl") : t("explorer.lightDevice")}
                action={tier === "none" ? null : t("explorer.open3d")}
                onAction={() => setForce3d(true)}
              />
            ) : (
            // Un plantage de la scène reste DANS la scène : la page, les explications et le reste de l'app continuent.
            <ExplorerCrashBoundary
              resetKey={`${modelId}:${modelUrl ?? ""}`}
              fallback={<SceneUnavailable posterId={posterId} message={t("explorer.crashed")} action={t("explorer.reload")} onAction={() => window.location.reload()} />}
            >
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
                  section={canSection ? section : null}
                  active={active}
                  onSelect={pickPart}
                  marks={marks}
                  playing={playing}
                  labels={labels}
                  label={t("explorer.sceneLabel", { name: pick(model.name, locale) })}
                  noWebGL={t("explorer.noWebgl")}
                  onResetReady={onResetReady}
                  tier={tier}
                loadingLabel={t("explorer.loading")}
                  contextLost={<SceneUnavailable posterId={posterId} message={t("explorer.crashed")} action={t("explorer.reload")} onAction={() => window.location.reload()} />}
                />
              </Suspense>
            </ExplorerCrashBoundary>
            )}

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

            {/* 3D Detective : la pièce à trouver, en haut à gauche de la scène. */}
            {game && targetSpot && !(game.finished && !guessFx) && (
              <div className="absolute top-3 left-3 z-10 max-w-[min(26rem,calc(100%-11rem))] rounded-2xl bg-[#0B0F19]/85 p-3 text-white shadow-[0_0_30px_-8px_rgba(34,211,238,0.6)] ring-1 ring-[#22D3EE]/40 backdrop-blur" data-testid="detective-question">
                <p className="text-[11px] font-semibold tracking-[0.14em] text-[#67E8F9] uppercase">{t("detective.round", { n: Math.min(game.round + (guessFx ? 0 : 1), game.total), total: game.total })}</p>
                <p className="mt-1 text-sm leading-snug font-medium">{pick(targetSpot.quiz, locale)}</p>
              </div>
            )}

            {/* Commandes de la scène (absentes tant que la 3D n'est pas ouverte). */}
            <div className={cn("absolute top-3 right-3 flex gap-1.5", !show3d && "hidden")}>
              <button type="button" className={tool} onClick={() => setPlaying((p) => !p)} aria-label={playing ? t("explorer.pause") : t("explorer.play")} title={playing ? t("explorer.pause") : t("explorer.play")} data-testid="explorer-play">
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              </button>
              {canSection && (
                <button type="button" className={cn(tool, section !== null && "bg-[#EAB308] text-[#0F172A] hover:bg-[#EAB308] hover:text-[#0F172A]")} onClick={() => setSection((v) => (v === null ? 0.15 : null))} aria-pressed={section !== null} aria-label={t("explorer.section")} title={t("explorer.section")} data-testid="explorer-section">
                  <Scissors className="size-4" />
                </button>
              )}
              <button type="button" className={tool} onClick={() => resetView.current()} aria-label={t("explorer.reset")} title={t("explorer.reset")} data-testid="explorer-reset">
                <RotateCcw className="size-4" />
              </button>
              {canFullscreen && (
                <button type="button" className={tool} onClick={toggleFullscreen} aria-label={full ? t("explorer.exitFullscreen") : t("explorer.fullscreen")} title={full ? t("explorer.exitFullscreen") : t("explorer.fullscreen")}>
                  {full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                </button>
              )}
            </div>

            {/* Profondeur de la coupe : on avance ou on recule le plan dans le cœur. */}
            {canSection && section !== null && (
              <label className="absolute top-16 right-3 flex items-center gap-2 rounded-lg bg-[#05070C]/80 px-3 py-2 text-[11px] font-medium text-white ring-1 ring-white/15 backdrop-blur">
                {t("explorer.sectionDepth")}
                <input type="range" min={-1.1} max={1.4} step={0.02} value={-section} onChange={(e) => setSection(-Number(e.target.value))} data-testid="explorer-section-depth" className="h-1 w-28 accent-[#EAB308] sm:w-36" />
              </label>
            )}

            <p className="pointer-events-none absolute bottom-3 left-3 hidden rounded-full bg-[#0F172A]/75 px-3 py-1 text-[11px] text-white/80 ring-1 ring-white/10 backdrop-blur sm:block">{t("explorer.hint")}</p>
          </div>

          {/* ── Le professeur explique ───────────────────────────────────── */}
          <aside className={cn("flex min-h-0 flex-col gap-4 overflow-y-auto border-t border-white/10 bg-[#05070C] p-4 sm:p-5 lg:border-t-0 lg:border-l", full ? "max-h-[45vh] lg:max-h-none" : "lg:max-h-[min(72vh,680px)]")} data-testid="explorer-panel">
            <div className="flex items-center gap-3">
              <span className="size-12 shrink-0 overflow-hidden rounded-full ring-2 ring-[#EAB308]">
                <ProfessorPortrait professor={professor} eager />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{t("explorer.professorSays", { name: professor.name })}</p>
                <p className="truncate text-xs text-white/70">{pick(model.name, locale)}</p>
              </div>
            </div>

            {game ? (
              <DetectivePanel
                game={game}
                feedback={guessFx}
                titleOf={(id) => pick(hotspotOf(model, id)?.title ?? { de: id, en: id, fr: id, es: id }, locale)}
                textOf={(id) => pick(hotspotOf(model, id)?.text ?? { de: "", en: "", fr: "", es: "" }, locale)}
                onNext={nextRound}
                onAgain={() => void startGame()}
                onEnd={endGame}
              />
            ) : (
              canPlay && (
                <button type="button" onClick={() => void startGame()} disabled={gameBusy} data-testid="detective-start" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#06B6D4] px-4 text-sm font-bold text-white shadow-[0_10px_30px_-10px_rgba(124,58,237,0.8)] transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none disabled:opacity-60">
                  {gameBusy ? <Loader2 className="size-4 animate-spin" /> : <Gamepad2 className="size-4" />}
                  {t("detective.start")}
                </button>
              )
            )}

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
                    <div className="rounded-xl bg-white/[0.04] p-4 ring-1 ring-white/[0.08]" data-testid="explorer-explanation">
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
                    {model.credit && <p data-testid="explorer-credit" className="mt-2 text-xs leading-snug text-white/70">{pick(model.credit, locale)}</p>}
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
                        onClick={() => pickPart(on ? null : h.id)}
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

/**
 * À la place de la scène : l'image fixe du modèle (public/explorer/<id>.jpg,
 * capturée depuis la scène elle-même), un message et, au besoin, un bouton.
 * Les repères et les explications restent à côté : rien n'est perdu.
 */
function SceneUnavailable({ posterId, message, action, onAction }: { posterId: string | null; message: string; action: string | null; onAction: () => void }) {
  const [imageOk, setImageOk] = useState(true);
  return (
    <div className="absolute inset-0" data-testid="explorer-fallback">
      {posterId && imageOk && (
        <img src={`/explorer/${posterId}.jpg`} alt="" className="absolute inset-0 size-full object-contain" onError={() => setImageOk(false)} />
      )}
      {/* En haut à gauche, compact : le modèle reste visible ; en bas, le choix des modèles. */}
      <div className="absolute top-3 right-3 left-3 flex max-w-md items-center gap-3 rounded-2xl bg-[#0F172A]/85 px-3 py-2 text-xs text-white ring-1 ring-white/15 backdrop-blur sm:right-auto">
        <p className="min-w-0 flex-1 leading-snug">{message}</p>
        {action && (
          <button type="button" onClick={onAction} className="shrink-0 rounded-full bg-[#EAB308] px-3 py-1.5 text-xs font-semibold text-[#1A1A1A] hover:brightness-105" data-testid="explorer-fallback-action">
            {action}
          </button>
        )}
      </div>
    </div>
  );
}

/** Garde-fou de la scène 3D : une erreur WebGL n'affiche plus l'écran d'erreur de toute l'app. */
class ExplorerCrashBoundary extends Component<{ resetKey: string; fallback: ReactNode; children: ReactNode }, { failed: boolean; key: string }> {
  state = { failed: false, key: this.props.resetKey };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  static getDerivedStateFromProps(props: { resetKey: string }, state: { failed: boolean; key: string }) {
    // Un autre modèle choisi : on réessaie.
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }
  componentDidCatch(error: Error) {
    reportClientError({ kind: "render", area: "explorer-3d", message: String(error?.message ?? error).slice(0, 500), stack: error?.stack?.slice(0, 2000) });
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Le panneau du 3D Detective : retour sur le clic, puis la suite ou le résultat. */
function DetectivePanel({
  game,
  feedback,
  titleOf,
  textOf,
  onNext,
  onAgain,
  onEnd,
}: {
  game: { round: number; total: number; correct: number; finished: boolean };
  feedback: { right: boolean; clicked: string; target: string } | null;
  titleOf: (id: string) => string;
  textOf: (id: string) => string;
  onNext: () => void;
  onAgain: () => void;
  onEnd: () => void;
}) {
  const { t } = useT();
  const done = game.finished && feedback === null;
  return (
    <div className="space-y-3 rounded-2xl bg-white/[0.05] p-4 ring-1 ring-white/10 backdrop-blur" data-testid="detective-panel" aria-live="polite">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-semibold text-[#67E8F9]">
          <Gamepad2 className="size-4" />
          3D Detective
        </span>
        <span className="font-semibold text-[#EAB308] tabular-nums">{t("detective.score", { n: game.correct, total: game.total })}</span>
      </div>
      {feedback ? (
        <>
          <p className={cn("text-sm font-semibold", feedback.right ? "text-[#86EFAC]" : "text-[#FCA5A5]")} data-testid="detective-feedback" data-right={feedback.right ? "true" : "false"}>
            {feedback.right ? t("detective.right", { part: titleOf(feedback.target) }) : t("detective.wrong", { part: titleOf(feedback.clicked), target: titleOf(feedback.target) })}
          </p>
          {/* Pourquoi : ce que fait la pièce cliquée (texte écrit et relu, pas d'appel à l'IA). */}
          {!feedback.right && <p className="text-sm leading-relaxed text-white/80">{textOf(feedback.clicked)}</p>}
          <p className="text-sm leading-relaxed text-white/70">{textOf(feedback.target)}</p>
          <button type="button" onClick={onNext} data-testid="detective-next" className="inline-flex min-h-10 items-center rounded-xl bg-[#EAB308] px-4 text-sm font-semibold text-[#0F172A]">
            {game.finished ? t("detective.result") : t("detective.next")}
          </button>
        </>
      ) : done ? (
        <>
          <p className="text-lg font-bold" data-testid="detective-done">
            {t("detective.final", { n: game.correct, total: game.total })}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onAgain} className="inline-flex min-h-10 items-center rounded-xl bg-[#EAB308] px-4 text-sm font-semibold text-[#0F172A]">
              {t("detective.again")}
            </button>
            <button type="button" onClick={onEnd} className="inline-flex min-h-10 items-center rounded-xl px-4 text-sm font-semibold text-white ring-1 ring-white/25">
              {t("detective.end")}
            </button>
          </div>
        </>
      ) : (
        <p className="text-sm text-white/75">{t("detective.hint")}</p>
      )}
    </div>
  );
}
