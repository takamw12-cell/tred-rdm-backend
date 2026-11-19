import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Box, FileSearch, Flame, Loader2, RotateCcw, Trophy } from "lucide-react";
import { PageContainer, PageHeader, Reveal } from "@/components/page";
import { ProfessorPortrait } from "@/components/professor-portrait";
import type { Feedback } from "@/components/MiniGame";
import { useT } from "@/i18n";
import { EXPLORER_MODELS, hotspotOf, pick } from "@/lib/explorer-models";
import { answer, buildRounds, medalFor, multiplier, ROUND_COUNT, START, ZONES, type GameState } from "@/lib/minigame";
import { useProfessor } from "@/lib/professors";
import { cn } from "@/lib/utils";
import { safeLazy } from "@/lib/lazy-import";

/**
 * Mini-jeu « Triebwerk-Check » (2026-11-15) : huit questions, on touche la
 * bonne pièce sur la coupe du turboréacteur. Les questions sont celles de
 * l'Explorateur 3D — on y apprend, on vérifie ici.
 */
const MiniGame = safeLazy(() => import("@/components/MiniGame"));
const MODEL = EXPLORER_MODELS.turbofan;
const SPRING = { type: "spring", stiffness: 380, damping: 22 } as const;

export default function MiniGamePage() {
  const { t, locale } = useT();
  const professor = useProfessor();
  const reduced = useReducedMotion();
  const [rounds, setRounds] = useState(() => buildRounds(ZONES.map((z) => z.id), ROUND_COUNT));
  const [state, setState] = useState<GameState>(START);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [boardReady, setBoardReady] = useState(false);
  const askedAt = useRef(Date.now());

  const done = state.round >= rounds.length && !feedback;
  // Pendant le retour d'une réponse, la question affichée reste celle qu'on vient de jouer.
  const target = hotspotOf(MODEL, rounds[feedback ? state.round - 1 : state.round]);
  const ok = feedback ? feedback.picked === feedback.correct : null;

  const onPick = useCallback(
    (id: string) => {
      if (feedback || !target || state.round >= rounds.length) return;
      const correct = id === target.id;
      setState((s) => answer(s, correct, Date.now() - askedAt.current));
      setFeedback({ picked: id, correct: target.id });
    },
    [feedback, target, state.round, rounds.length],
  );
  const next = useCallback(() => {
    setFeedback(null);
    askedAt.current = Date.now();
  }, []);
  function restart() {
    setRounds(buildRounds(ZONES.map((z) => z.id), ROUND_COUNT));
    setState(START);
    setFeedback(null);
    askedAt.current = Date.now();
  }
  const onReady = useCallback(() => {
    setBoardReady(true);
    askedAt.current = Date.now();
  }, []);

  // Clavier : 1–6 choisit une zone, Entrée passe à la suite.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (feedback && e.key === "Enter") return next();
      const zone = ZONES.find((z) => String(z.n) === e.key);
      if (zone) onPick(zone.id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [feedback, next, onPick]);

  const medal = useMemo(() => medalFor(state.correct, rounds.length), [state.correct, rounds.length]);
  const boost = multiplier(state.streak);

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader title={t("minigame.title")} subtitle={t("minigame.subtitle")} />

      {/* L'autre jeu : des cas tirés des documents de l'étudiant, toutes filières. */}
      <Link to="/fall-check" data-testid="to-fallcheck" className="mb-4 flex min-h-12 items-center gap-3 rounded-xl bg-[#0F172A] px-4 py-3 text-sm font-semibold text-white ring-1 ring-white/10 transition-colors hover:bg-[#16213A] focus-visible:ring-2 focus-visible:ring-[#EAB308] focus-visible:outline-none">
        <FileSearch className="size-5 shrink-0 text-[#EAB308]" />
        {t("fallcheck.link")}
      </Link>

      <Reveal>
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B1220] text-white shadow-xl" data-testid="minigame" data-round={state.round} data-done={done}>
          {/* Compteurs. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/10 bg-[#0F172A] px-4 py-3 text-sm">
            <span className="font-semibold" data-testid="minigame-round">
              {t("minigame.round", { n: Math.min(state.round + (feedback ? 0 : 1), rounds.length), total: rounds.length })}
            </span>
            <span className="ml-auto flex items-center gap-1.5 font-semibold text-[#EAB308]" data-testid="minigame-score">
              <Trophy className="size-4" />
              {state.score} {t("minigame.score")}
            </span>
            {boost > 1 && (
              <motion.span key={boost} initial={reduced ? false : { scale: 0.6 }} animate={{ scale: 1 }} transition={SPRING} className="flex items-center gap-1 rounded-full bg-[#EAB308] px-2 py-0.5 text-xs font-bold text-[#0F172A]">
                <Flame className="size-3.5" />
                {t("minigame.streak", { n: String(boost).replace(".", ",") })}
              </motion.span>
            )}
          </div>

          {done ? (
            <motion.div initial={reduced ? false : { opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={SPRING} className="flex flex-col items-center gap-4 px-6 py-12 text-center" data-testid="minigame-result">
              <span className="size-20 overflow-hidden rounded-full ring-4 ring-[#EAB308]">
                <ProfessorPortrait professor={professor} eager />
              </span>
              <h2 className="font-display text-2xl font-bold text-[#EAB308]">{t("minigame.finishedTitle")}</h2>
              <p className="text-lg font-semibold">{t("minigame.result", { correct: state.correct, total: rounds.length, points: state.score })}</p>
              <p className="max-w-md text-sm text-white/80">{t(`minigame.medal.${medal}`)}</p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                <button type="button" onClick={restart} data-testid="minigame-again" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#EAB308] px-5 text-sm font-semibold text-[#0F172A] transition-transform hover:bg-[#FACC15] focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none motion-safe:active:scale-[0.97]">
                  <RotateCcw className="size-4" />
                  {t("minigame.again")}
                </button>
                <Link to="/explorer" className="inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold text-white ring-1 ring-white/25 transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#EAB308] focus-visible:outline-none">
                  <Box className="size-4" />
                  {t("minigame.toExplorer")}
                </Link>
              </div>
            </motion.div>
          ) : (
            <>
              {/* La question, dite par le professeur — il hoche la tête ou la secoue. */}
              <div className="flex items-center gap-3 px-4 pt-4">
                <motion.span
                  key={`${state.round}-${ok}`}
                  animate={reduced || ok === null ? {} : ok ? { y: [0, -9, 0, -5, 0] } : { x: [0, -7, 7, -5, 5, 0] }}
                  transition={{ duration: 0.6 }}
                  className={cn("size-14 shrink-0 overflow-hidden rounded-full ring-2", ok === null ? "ring-[#EAB308]" : ok ? "ring-[#22C55E]" : "ring-[#EF4444]")}
                >
                  <ProfessorPortrait professor={professor} eager />
                </motion.span>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.p
                    key={`${state.round}-${feedback ? "fb" : "q"}`}
                    initial={reduced ? false : { opacity: 0, y: 10, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={reduced ? undefined : { opacity: 0, transition: { duration: 0.1 } }}
                    transition={SPRING}
                    aria-live="assertive"
                    data-testid="minigame-prompt"
                    className={cn("min-w-0 flex-1 rounded-2xl rounded-tl-sm px-4 py-3 text-base font-semibold ring-1", ok === null ? "bg-white/[0.07] ring-white/10" : ok ? "bg-[#22C55E]/15 text-[#BBF7D0] ring-[#22C55E]/40" : "bg-[#EF4444]/15 text-[#FECACA] ring-[#EF4444]/40")}
                  >
                    {!target ? "" : ok === null ? pick(target.quiz, locale) : ok ? t("minigame.correct") : t("minigame.wrong", { name: pick(target.title, locale) })}
                    {feedback && target && <span className="mt-1 block text-sm font-normal text-white/85">{pick(target.fact, locale)}</span>}
                  </motion.p>
                </AnimatePresence>
              </div>

              {/* La planche. */}
              <div className="relative mx-auto aspect-[4/3] w-full max-w-3xl p-3">
                {!boardReady && (
                  <output className="absolute inset-0 grid place-items-center text-sm text-white/80" data-testid="minigame-loading">
                    <span className="flex items-center gap-2">
                      <Loader2 className="size-5 animate-spin text-[#EAB308]" />
                      {t("minigame.loading")}
                    </span>
                  </output>
                )}
                <Suspense fallback={null}>
                  <MiniGame onPick={onPick} feedback={feedback} onReady={onReady} label={t("minigame.canvasLabel")} />
                </Suspense>
              </div>

              {/* Les mêmes choix au clavier, et la suite. */}
              <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-[#0F172A] px-4 py-3">
                <span className="mr-1 text-xs text-white/70">{t("minigame.keysHint")}</span>
                {ZONES.map((z) => (
                  <button
                    key={z.id}
                    type="button"
                    disabled={Boolean(feedback)}
                    onClick={() => onPick(z.id)}
                    aria-label={t("minigame.zone", { n: z.n })}
                    data-testid={`zone-${z.n}`}
                    className="grid size-10 place-items-center rounded-full bg-[#0B1220] text-sm font-bold text-white ring-1 ring-[#EAB308] transition-colors hover:bg-[#EAB308] hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none disabled:opacity-40"
                  >
                    {z.n}
                  </button>
                ))}
                {feedback && (
                  <button type="button" onClick={next} data-testid="minigame-next" className="ml-auto inline-flex min-h-10 items-center rounded-full bg-[#EAB308] px-5 text-sm font-semibold text-[#0F172A] transition-transform hover:bg-[#FACC15] focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none motion-safe:active:scale-[0.97]">
                    {t("minigame.next")}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </Reveal>
    </PageContainer>
  );
}
