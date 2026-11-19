import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BookOpenCheck, Check, Crown, FileText, Loader2, Quote, RotateCcw, Scale, Stethoscope, Timer, Trophy, Volume2, VolumeX, X, Zap } from "lucide-react";
import { DocumentViewer } from "@/components/document-viewer";
import { PageContainer, PageHeader, Reveal } from "@/components/page";
import { ProfessorPortrait } from "@/components/professor-portrait";
import { ConfettiBurst } from "@/components/confetti-burst";
import { useT } from "@/i18n";
import {
  arcadeAnswer,
  arcadeLeaderboard,
  arcadeQuestion,
  CHALLENGE_MODES,
  CHALLENGE_START,
  progressOf,
  startArcade,
  timerTone,
  type ArcadeAnswer,
  type ArcadeQuestion,
  type ArcadeStart,
  type ChallengeError,
  type ChallengeMode,
  type ChallengeState,
} from "@/lib/doc-challenge";
import { playSound, setSoundMuted, soundMuted } from "@/lib/game-sounds";
import { medalFor } from "@/lib/minigame";
import { useProfessor } from "@/lib/professors";
import { cn } from "@/lib/utils";
import { documentsListOptions } from "@/queries/documents";
import { creditsMeKey } from "@/queries/credits";
import { useToastStore } from "@/stores/toast";

/**
 * « Arcade » (19 nov. 2026) — le Fall-Check en partie chronométrée.
 *
 * Un jeu de cas tiré d'UN document de l'étudiant. Trois modes — diagnostic
 * (médecine), décision (droit), notion (toutes filières). Chaque réponse est
 * montrée avec la phrase du document qui la prouve et sa page : le serveur ne
 * laisse sortir aucune question sans elle.
 *
 * La partie est tenue par le SERVEUR (api/arcade) : une question n'arrive
 * qu'au moment d'être jouée, la bonne réponse seulement après, et le chrono
 * de 15 s est mesuré là-bas. Un sans-faute rapporte +2 crédits (3 fois par
 * jour au plus). La Bestenliste de la semaine montre le prénom seul, et
 * seulement de qui l'a demandé (case décochée par défaut).
 */
const SPRING = { type: "spring", stiffness: 380, damping: 26 } as const;
const MODE_ICON = { diagnosis: Stethoscope, decision: Scale, concept: BookOpenCheck } as const;
const LETTERS = ["A", "B", "C", "D"];
const BOARD_PREF = "tred.arcade.board";

type Feedback = ArcadeAnswer & { picked: number };

export default function FallCheckPage() {
  const { t, locale } = useT();
  const professor = useProfessor();
  const reduced = useReducedMotion();
  const qc = useQueryClient();
  const showToast = useToastStore((s) => s.show);
  const { data: docs = [], isLoading: docsLoading } = useQuery(documentsListOptions(null));
  const board = useQuery({ queryKey: ["arcade", "leaderboard"], queryFn: arcadeLeaderboard, staleTime: 30_000 });
  const [mode, setMode] = useState<ChallengeMode>("diagnosis");
  const [docId, setDocId] = useState("");
  const [challenge, setChallenge] = useState<ArcadeStart | null>(null);
  const [question, setQuestion] = useState<ArcadeQuestion | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ChallengeError | null>(null);
  const [state, setState] = useState<ChallengeState>(CHALLENGE_START);
  const [done, setDone] = useState(false);
  const [muted, setMuted] = useState(soundMuted);
  const [showOnBoard, setShowOnBoard] = useState(() => {
    try {
      return localStorage.getItem(BOARD_PREF) === "1";
    } catch {
      return false;
    }
  });
  /** Le lecteur de l'original, ouvert sur la page de la preuve. */
  const [reader, setReader] = useState<{ page: number; quote: string } | null>(null);
  const [left, setLeft] = useState(15_000);
  const deadline = useRef(0);

  const chosenDoc = docId || docs[0]?.id || "";
  const total = challenge?.total ?? 0;
  const picked = feedback?.picked ?? null;
  // La question jouée, et — une fois répondue — sa preuve.
  const current = question && feedback ? { ...question, ...feedback } : null;
  const medal = useMemo(() => medalFor(state.correct, total), [state.correct, total]);

  const loadQuestion = useCallback(async (sessionId: string) => {
    const q = await arcadeQuestion(sessionId);
    deadline.current = performance.now() + q.remainingMs;
    setLeft(q.remainingMs);
    setFeedback(null);
    setQuestion(q);
  }, []);

  async function start() {
    if (!chosenDoc || loading) return;
    setLoading(true);
    setError(null);
    try {
      const next = await startArcade({ documentId: chosenDoc, mode, locale, showOnBoard });
      setChallenge(next);
      setState(CHALLENGE_START);
      setDone(false);
      await loadQuestion(next.sessionId);
    } catch (e) {
      setError(((e as Error).message as ChallengeError) || "failed");
      setChallenge(null);
    } finally {
      setLoading(false);
    }
  }

  const submit = useCallback(
    async (choice: number) => {
      if (!challenge || !question || feedback || busy) return;
      setBusy(true);
      try {
        const res = await arcadeAnswer(challenge.sessionId, choice);
        playSound(res.right ? "success" : "error");
        setFeedback({ ...res, picked: choice });
        setState({ index: res.state.index, correct: res.state.correct, streak: res.state.streak, score: res.state.score });
        if (res.state.finished) {
          if (res.reward?.granted) {
            showToast(t("arcade.perfect", { n: res.reward.amount }));
            void qc.invalidateQueries({ queryKey: creditsMeKey() });
          } else if (res.reward?.reason === "daily_cap") showToast(t("arcade.perfectCap"));
          void board.refetch();
        }
      } catch {
        setError("failed");
      } finally {
        setBusy(false);
      }
    },
    [challenge, question, feedback, busy, showToast, t, qc, board],
  );
  const pickOption = useCallback((i: number) => void submit(i), [submit]);

  // Le chrono : 15 s par question. À zéro, la réponse part « vide » (le serveur tranche de toute façon).
  useEffect(() => {
    if (!question || feedback) return;
    const id = window.setInterval(() => {
      const ms = Math.max(0, deadline.current - performance.now());
      setLeft(ms);
      if (ms <= 0) {
        window.clearInterval(id);
        void submit(-1);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [question, feedback, submit]);

  const next = useCallback(() => {
    if (!challenge || !feedback) return;
    if (feedback.state.finished) {
      setDone(true);
      setFeedback(null);
      setQuestion(null);
      return;
    }
    void loadQuestion(challenge.sessionId).catch(() => setError("failed"));
  }, [challenge, feedback, loadQuestion]);

  function leave() {
    setReader(null);
    setChallenge(null);
    setQuestion(null);
    setFeedback(null);
    setDone(false);
    setError(null);
    setState(CHALLENGE_START);
  }
  function toggleSound() {
    setSoundMuted(!muted);
    setMuted(!muted);
  }
  function toggleBoard(on: boolean) {
    setShowOnBoard(on);
    try {
      localStorage.setItem(BOARD_PREF, on ? "1" : "0");
    } catch {
      /* navigation privée : le choix vaut pour cette visite */
    }
  }

  // Clavier : 1–4 ou A–D répond, Entrée passe à la suite.
  useEffect(() => {
    if (!challenge) return;
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName) && e.key === "Enter") return;
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      // Lecteur ouvert : ses propres touches (← → + −) ; le jeu attend.
      if (reader) return;
      if (picked !== null && e.key === "Enter") return next();
      const i = "1234".indexOf(e.key) >= 0 ? "1234".indexOf(e.key) : "abcd".indexOf(e.key.toLowerCase());
      if (i >= 0 && e.key.length === 1) pickOption(i);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [challenge, picked, next, pickOption, reader]);

  const right = feedback ? feedback.right : null;
  const tone = timerTone(left);
  const perfect = done && total > 0 && state.correct === total;

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title={t("arcade.title")} subtitle={t("fallcheck.subtitle")} />

      {/* La Bestenliste de la semaine, en haut. */}
      <Reveal>
        <Leaderboard rows={board.data?.rows ?? []} mine={board.data?.mine ?? null} loading={board.isLoading} />
      </Reveal>

      <Reveal>
        <div
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0B0F19] text-white shadow-[0_30px_80px_-30px_rgba(124,58,237,0.55),0_0_0_1px_rgba(34,211,238,0.06)]"
          data-testid="fallcheck"
          data-phase={!challenge ? "setup" : done ? "done" : "play"}
        >
          {/* Lueurs néon, très discrètes. */}
          <div aria-hidden className="pointer-events-none absolute -top-32 -left-24 size-72 rounded-full bg-[#7C3AED]/25 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -right-20 -bottom-32 size-72 rounded-full bg-[#06B6D4]/20 blur-3xl" />

          {!challenge ? (
            <div className="relative space-y-6 p-5 sm:p-7">
              {/* 1. Le mode. */}
              <fieldset className="m-0 border-0 p-0">
                <legend className="mb-3 text-xs font-semibold tracking-[0.14em] text-[#EAB308] uppercase">{t("fallcheck.modeLabel")}</legend>
                <motion.div className="grid gap-3 sm:grid-cols-3" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: reduced ? 0 : 0.07 } } }}>
                  {CHALLENGE_MODES.map((m) => {
                    const Icon = MODE_ICON[m];
                    const on = m === mode;
                    return (
                      <motion.button
                        key={m}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setMode(m)}
                        data-testid={`fallcheck-mode-${m}`}
                        variants={{ hidden: reduced ? {} : { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
                        whileHover={reduced ? undefined : { y: -3 }}
                        className={cn(
                          "rounded-2xl p-4 text-left ring-1 transition-[background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-[#EAB308] focus-visible:outline-none",
                          on ? "bg-[#EAB308]/12 shadow-[0_0_28px_-6px_rgba(234,179,8,0.55)] ring-[#EAB308]" : "bg-white/[0.04] ring-white/10 hover:bg-white/[0.07] hover:shadow-[0_0_24px_-8px_rgba(124,58,237,0.6)]",
                        )}
                      >
                        <Icon className={cn("mb-2 size-5", on ? "text-[#EAB308]" : "text-white/70")} />
                        <span className="block text-sm font-semibold">{t(`fallcheck.mode.${m}.name`)}</span>
                        <span className="mt-1 block text-xs leading-snug text-white/70">{t(`fallcheck.mode.${m}.hint`)}</span>
                      </motion.button>
                    );
                  })}
                </motion.div>
              </fieldset>

              {/* 2. Le document. */}
              <div>
                <label htmlFor="fallcheck-doc" className="mb-3 block text-xs font-semibold tracking-[0.14em] text-[#EAB308] uppercase">
                  {t("fallcheck.docLabel")}
                </label>
                {docsLoading ? (
                  <p className="flex items-center gap-2 text-sm text-white/70">
                    <Loader2 className="size-4 animate-spin" />
                    {t("fallcheck.docsLoading")}
                  </p>
                ) : docs.length === 0 ? (
                  <p className="rounded-xl bg-white/[0.04] p-4 text-sm text-white/85 ring-1 ring-white/10" data-testid="fallcheck-nodocs">
                    {t("fallcheck.noDocs")}{" "}
                    <Link to="/" className="font-semibold text-[#EAB308] underline underline-offset-2">
                      {t("fallcheck.toLibrary")}
                    </Link>
                  </p>
                ) : (
                  <div className="relative">
                    <FileText className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-white/60" />
                    <select
                      id="fallcheck-doc"
                      value={chosenDoc}
                      onChange={(e) => setDocId(e.target.value)}
                      data-testid="fallcheck-doc"
                      className="min-h-12 w-full appearance-none rounded-xl bg-white/[0.06] pr-4 pl-10 text-sm text-white ring-1 ring-white/15 focus-visible:ring-2 focus-visible:ring-[#EAB308] focus-visible:outline-none [&>option]:text-[#0F172A]"
                    >
                      {docs.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <p className="flex items-start gap-2 rounded-xl bg-white/[0.04] p-3 text-xs leading-relaxed text-white/75 ring-1 ring-white/10">
                <Timer className="mt-0.5 size-4 shrink-0 text-[#22D3EE]" />
                {t("arcade.rules")}
              </p>

              {/* Bestenliste : seulement sur demande, prénom seul. */}
              <div className="flex items-start gap-3 rounded-xl bg-white/[0.04] p-3 text-sm ring-1 ring-white/10" data-testid="arcade-board-optin">
                <input id="arcade-board" type="checkbox" checked={showOnBoard} onChange={(e) => toggleBoard(e.target.checked)} aria-describedby="arcade-board-hint" className="mt-0.5 size-4 cursor-pointer accent-[#EAB308]" />
                <div>
                  <label htmlFor="arcade-board" className="block cursor-pointer font-medium">
                    {t("arcade.optIn")}
                  </label>
                  <p id="arcade-board-hint" className="mt-0.5 text-xs text-white/65">
                    {t("arcade.optInHint")}
                  </p>
                </div>
              </div>

              {error && (
                <p role="alert" data-testid="fallcheck-error" className="rounded-xl bg-[#EF4444]/12 p-3 text-sm text-[#FECACA] ring-1 ring-[#EF4444]/40">
                  {t(`fallcheck.error.${error}`)}
                </p>
              )}

              <motion.button
                type="button"
                onClick={start}
                disabled={!chosenDoc || loading}
                data-testid="fallcheck-start"
                whileHover={reduced || loading ? undefined : { scale: 1.015 }}
                whileTap={reduced ? undefined : { scale: 0.985 }}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#EAB308] to-[#F59E0B] px-6 text-sm font-bold text-[#0F172A] shadow-[0_12px_32px_-12px_rgba(234,179,8,0.85)] transition-shadow hover:shadow-[0_14px_40px_-10px_rgba(234,179,8,0.95)] focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none disabled:opacity-50"
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
                {loading ? t("fallcheck.preparing") : t("arcade.start")}
              </motion.button>
            </div>
          ) : (
            <>
              {/* Avancement, chrono et compteurs. */}
              <div className="relative border-b border-white/10 bg-white/[0.03] px-4 py-3 backdrop-blur sm:px-6">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="font-semibold" data-testid="fallcheck-round">
                    {t("fallcheck.round", { n: Math.min(state.index + (picked === null ? 1 : 0), total), total })}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-white/65">{challenge.title}</span>
                  {state.streak >= 2 && !done && (
                    <span className="rounded-full bg-[#A855F7]/20 px-2 py-0.5 text-xs font-semibold text-[#E9D5FF] ring-1 ring-[#A855F7]/50" data-testid="arcade-streak">
                      ×{state.streak}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 font-semibold text-[#EAB308]" data-testid="fallcheck-score">
                    <Trophy className="size-4" />
                    {state.score}
                  </span>
                  <button type="button" onClick={toggleSound} aria-pressed={muted} aria-label={t(muted ? "fallcheck.soundOn" : "fallcheck.soundOff")} data-testid="fallcheck-sound" className="grid size-9 place-items-center rounded-lg text-white/80 transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#EAB308] focus-visible:outline-none">
                    {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                  </button>
                </div>
                {/* L'avancement, pour les lecteurs d'écran ; la barre dessinée en dessous n'en est que l'image. */}
                <progress className="sr-only" value={state.index} max={total} aria-label={t("fallcheck.progress")} data-testid="fallcheck-progress" />
                <div aria-hidden className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <motion.div className="h-full rounded-full bg-gradient-to-r from-[#EAB308] to-[#22D3EE]" initial={false} animate={{ width: `${progressOf(state, total) * 100}%` }} transition={reduced ? { duration: 0 } : SPRING} />
                </div>
              </div>

              {done ? (
                <motion.div initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="relative flex flex-col items-center gap-4 px-6 py-12 text-center" data-testid="fallcheck-done">
                  {perfect && <ConfettiBurst />}
                  <span className="size-20 overflow-hidden rounded-full shadow-[0_0_40px_-6px_rgba(234,179,8,0.8)] ring-4 ring-[#EAB308]">
                    <ProfessorPortrait professor={professor} eager />
                  </span>
                  <h2 className="font-display text-2xl font-bold text-[#EAB308]">{perfect ? t("arcade.perfectTitle") : t("fallcheck.finishedTitle")}</h2>
                  <p className="text-lg font-semibold">{t("fallcheck.result", { correct: state.correct, total, points: state.score })}</p>
                  <p className="max-w-md text-sm text-white/80">{t(`fallcheck.medal.${medal}`)}</p>
                  {board.data?.mine && (
                    <p className="text-sm font-medium text-[#67E8F9]" data-testid="arcade-rank">
                      {t("arcade.rank", { rank: board.data.mine.rank })}
                    </p>
                  )}
                  <div className="flex flex-wrap justify-center gap-2 pt-2">
                    <button type="button" onClick={start} disabled={loading} data-testid="fallcheck-again" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#EAB308] px-5 text-sm font-semibold text-[#0F172A] transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none">
                      {loading ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                      {t("fallcheck.again")}
                    </button>
                    <button type="button" onClick={leave} className="inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-semibold text-white ring-1 ring-white/25 transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#EAB308] focus-visible:outline-none">
                      {t("fallcheck.otherDoc")}
                    </button>
                  </div>
                </motion.div>
              ) : (
                question && (
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={question.index} initial={reduced ? false : { opacity: 0, x: 32, scale: 0.98 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={reduced ? undefined : { opacity: 0, x: -32, scale: 0.98 }} transition={SPRING} className="relative space-y-5 p-5 sm:p-7">
                      {/* Le chrono : 15 s, rouge et pulsant sous 3 s. */}
                      {picked === null && <Countdown left={left} tone={tone} reduced={Boolean(reduced)} label={t("arcade.timeLeft", { s: Math.ceil(left / 1000) })} />}

                      {/* Le cas. */}
                      <div className="flex items-start gap-3">
                        <span className="size-12 shrink-0 overflow-hidden rounded-full ring-2 ring-[#EAB308]">
                          <ProfessorPortrait professor={professor} eager />
                        </span>
                        <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-white/[0.06] p-4 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.9)] ring-1 ring-white/10 backdrop-blur">
                          <p className="text-xs font-semibold tracking-[0.14em] text-[#EAB308] uppercase">{t(`fallcheck.mode.${mode}.caseLabel`)}</p>
                          <p className="mt-1.5 text-sm leading-relaxed text-white/90" data-testid="fallcheck-situation">
                            {question.situation}
                          </p>
                        </div>
                      </div>
                      <h2 className="text-base font-semibold sm:text-lg" data-testid="fallcheck-question" aria-live="polite">
                        {question.question}
                      </h2>

                      {/* Les réponses. */}
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        {question.options.map((option, i) => {
                          const isRight = feedback !== null && i === feedback.correct;
                          const isWrongPick = picked === i && feedback !== null && i !== feedback.correct;
                          return (
                            <motion.button
                              key={option}
                              type="button"
                              disabled={picked !== null || busy}
                              onClick={() => pickOption(i)}
                              whileHover={reduced || picked !== null ? undefined : { y: -2 }}
                              whileTap={reduced || picked !== null ? undefined : { scale: 0.985 }}
                              animate={reduced || !isWrongPick ? {} : { x: [0, -6, 6, -4, 4, 0] }}
                              transition={{ duration: 0.4 }}
                              data-testid={`fallcheck-option-${i}`}
                              data-state={isRight ? "right" : isWrongPick ? "wrong" : "idle"}
                              className={cn(
                                "flex min-h-14 items-center gap-3 rounded-2xl px-3.5 py-3 text-left text-sm ring-1 transition-[background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-[#EAB308] focus-visible:outline-none",
                                isRight
                                  ? "bg-[#22C55E]/15 text-[#DCFCE7] shadow-[0_0_28px_-8px_rgba(34,197,94,0.8)] ring-[#22C55E]"
                                  : isWrongPick
                                    ? "bg-[#EF4444]/15 text-[#FEE2E2] shadow-[0_0_28px_-8px_rgba(239,68,68,0.8)] ring-[#EF4444]"
                                    : picked !== null
                                      ? "bg-white/[0.03] text-white/55 ring-white/10"
                                      : "bg-white/[0.05] ring-white/15 hover:bg-white/[0.09] hover:shadow-[0_0_24px_-8px_rgba(34,211,238,0.6)]",
                              )}
                            >
                              <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold", isRight ? "bg-[#22C55E] text-[#052E16]" : isWrongPick ? "bg-[#EF4444] text-white" : "bg-white/10 text-white/85")}>
                                {isRight ? <Check className="size-4" /> : isWrongPick ? <X className="size-4" /> : LETTERS[i]}
                              </span>
                              <span className="min-w-0 flex-1">{option}</span>
                            </motion.button>
                          );
                        })}
                      </div>

                      {/* Le retour : la phrase du document fait foi. */}
                      {current && (
                        <motion.div initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="space-y-3" data-testid="fallcheck-feedback" data-right={right ? "true" : "false"}>
                          <p className={cn("text-sm font-semibold", right ? "text-[#86EFAC]" : "text-[#FCA5A5]")}>
                            {right ? `${t("fallcheck.correct")} +${current.points}` : current.timedOut ? t("arcade.timeUp", { answer: current.options[current.correct] ?? "" }) : t("fallcheck.wrong", { answer: current.options[current.correct] ?? "" })}
                          </p>
                          {/* La preuve se touche : l'original s'ouvre à cette page, la phrase surlignée. */}
                          <button
                            type="button"
                            onClick={() => setReader({ page: current.page, quote: current.quote })}
                            aria-label={t("fallcheck.openSource", { doc: challenge.title, page: current.page })}
                            data-testid="fallcheck-open-source"
                            className="group block w-full rounded-xl border-l-2 border-[#EAB308] bg-[#EAB308]/[0.07] p-4 text-left transition-colors hover:bg-[#EAB308]/[0.13] focus-visible:ring-2 focus-visible:ring-[#EAB308] focus-visible:outline-none"
                          >
                            <span className="mb-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-semibold text-[#EAB308]" data-testid="fallcheck-source">
                              <Quote className="size-3.5" />
                              {t("fallcheck.source", { doc: challenge.title, page: current.page })}
                              <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-[#EAB308]/15 px-2 py-0.5 text-[11px] transition-colors group-hover:bg-[#EAB308] group-hover:text-[#0F172A]">
                                <FileText className="size-3" />
                                {t("fallcheck.openHint")}
                              </span>
                            </span>
                            <span className="block text-sm leading-relaxed text-white/90" data-testid="fallcheck-quote">
                              „{current.quote}“
                            </span>
                          </button>
                          <p className="text-sm leading-relaxed text-white/80">{current.explanation}</p>
                          <div className="flex justify-end">
                            <button type="button" onClick={next} data-testid="fallcheck-next" className="inline-flex min-h-11 items-center rounded-xl bg-[#EAB308] px-6 text-sm font-semibold text-[#0F172A] transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none">
                              {current.state.finished ? t("fallcheck.finish") : t("fallcheck.next")}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                )
              )}
              {error && challenge && (
                <p role="alert" className="relative m-5 rounded-xl bg-[#EF4444]/12 p-3 text-sm text-[#FECACA] ring-1 ring-[#EF4444]/40">
                  {t("arcade.sessionLost")}{" "}
                  <button type="button" onClick={leave} className="font-semibold underline underline-offset-2">
                    {t("fallcheck.otherDoc")}
                  </button>
                </p>
              )}
            </>
          )}
        </div>
      </Reveal>

      {/* Le même lecteur que pour les citations du tuteur : l'original, réservé à son propriétaire. */}
      <DocumentViewer docId={reader && challenge ? challenge.documentId : null} page={reader?.page ?? null} highlight={reader?.quote ?? null} onClose={() => setReader(null)} />
    </PageContainer>
  );
}

/** Une barre fine qui se vide, et les secondes ; rouge et pulsante sous 3 s. */
function Countdown({ left, tone, reduced, label }: { left: number; tone: "calm" | "hurry" | "critical"; reduced: boolean; label: string }) {
  const color = tone === "critical" ? "#EF4444" : tone === "hurry" ? "#F59E0B" : "#22D3EE";
  return (
    <div className="flex items-center gap-3" data-testid="arcade-timer" data-tone={tone}>
      <div aria-hidden className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full transition-[width] duration-100 ease-linear" style={{ width: `${(left / 15_000) * 100}%`, backgroundColor: color, boxShadow: `0 0 14px ${color}` }} />
      </div>
      <motion.span
        role="timer"
        aria-label={label}
        className="min-w-12 text-right font-mono text-lg font-bold tabular-nums"
        style={{ color }}
        animate={tone === "critical" && !reduced ? { scale: [1, 1.25, 1] } : { scale: 1 }}
        transition={tone === "critical" && !reduced ? { duration: 0.5, repeat: Infinity } : { duration: 0.2 }}
      >
        {Math.ceil(left / 1000)}s
      </motion.span>
    </div>
  );
}

/** La Bestenliste de la semaine : prénom et points, rien d'autre. */
function Leaderboard({ rows, mine, loading }: { rows: Array<{ rank: number; name: string; score: number; me: boolean }>; mine: { rank: number; score: number } | null; loading: boolean }) {
  const { t } = useT();
  return (
    <section className="mb-5 rounded-3xl border border-white/10 bg-[#0B0F19] p-4 text-white shadow-[0_20px_60px_-30px_rgba(6,182,212,0.5)] sm:p-5" data-testid="arcade-leaderboard">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Crown className="size-4 text-[#EAB308]" />
          {t("arcade.boardTitle")}
        </h2>
        {mine && <span className="text-xs text-[#67E8F9]">{t("arcade.rank", { rank: mine.rank })}</span>}
      </div>
      {loading ? (
        <Loader2 className="size-4 animate-spin text-white/60" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-white/65" data-testid="arcade-board-empty">
          {t("arcade.boardEmpty")}
        </p>
      ) : (
        <ol className="grid gap-1.5 sm:grid-cols-2">
          {rows.map((r) => (
            <li key={`${r.rank}-${r.name}`} className={cn("flex items-center gap-3 rounded-xl px-3 py-2 text-sm ring-1", r.me ? "bg-[#EAB308]/12 ring-[#EAB308]/60" : "bg-white/[0.04] ring-white/10")}>
              <span className={cn("grid size-6 place-items-center rounded-full text-xs font-bold", r.rank === 1 ? "bg-[#EAB308] text-[#0F172A]" : r.rank <= 3 ? "bg-white/20" : "bg-white/10 text-white/80")}>{r.rank}</span>
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className="font-semibold text-[#EAB308] tabular-nums">{r.score}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
