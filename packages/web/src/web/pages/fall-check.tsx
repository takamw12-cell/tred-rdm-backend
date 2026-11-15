import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BookOpenCheck, Check, FileText, Loader2, Quote, RotateCcw, Scale, Stethoscope, Trophy, Volume2, VolumeX, X } from "lucide-react";
import { PageContainer, PageHeader, Reveal } from "@/components/page";
import { ProfessorPortrait } from "@/components/professor-portrait";
import { useT } from "@/i18n";
import { answerChallenge, CHALLENGE_MODES, CHALLENGE_START, fetchChallenge, progressOf, type Challenge, type ChallengeError, type ChallengeMode, type ChallengeState } from "@/lib/doc-challenge";
import { playSound, setSoundMuted, soundMuted } from "@/lib/game-sounds";
import { medalFor } from "@/lib/minigame";
import { useProfessor } from "@/lib/professors";
import { cn } from "@/lib/utils";
import { documentsListOptions } from "@/queries/documents";

/**
 * « Fall-Check » (2026-11-15) : un jeu de cas tiré d'UN document de
 * l'étudiant. Trois modes — diagnostic (médecine), décision (droit), notion
 * (toutes filières). Chaque réponse est montrée avec la phrase du document qui
 * la prouve et sa page : le serveur ne laisse sortir aucune question sans elle.
 */
const SPRING = { type: "spring", stiffness: 380, damping: 26 } as const;
const MODE_ICON = { diagnosis: Stethoscope, decision: Scale, concept: BookOpenCheck } as const;
const LETTERS = ["A", "B", "C", "D"];

export default function FallCheckPage() {
  const { t, locale } = useT();
  const professor = useProfessor();
  const reduced = useReducedMotion();
  const { data: docs = [], isLoading: docsLoading } = useQuery(documentsListOptions(null));
  const [mode, setMode] = useState<ChallengeMode>("diagnosis");
  const [docId, setDocId] = useState("");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ChallengeError | null>(null);
  const [state, setState] = useState<ChallengeState>(CHALLENGE_START);
  const [picked, setPicked] = useState<number | null>(null);
  const [muted, setMuted] = useState(soundMuted);

  const chosenDoc = docId || docs[0]?.id || "";
  const total = challenge?.questions.length ?? 0;
  // Pendant le retour d'une réponse, la question affichée reste celle qu'on vient de jouer.
  const current = challenge?.questions[picked === null ? state.index : state.index - 1] ?? null;
  const done = Boolean(challenge) && picked === null && state.index >= total;
  const medal = useMemo(() => medalFor(state.correct, total), [state.correct, total]);

  async function start() {
    if (!chosenDoc || loading) return;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchChallenge({ documentId: chosenDoc, mode, locale });
      setChallenge(next);
      setState(CHALLENGE_START);
      setPicked(null);
    } catch (e) {
      setError(((e as Error).message as ChallengeError) || "failed");
    } finally {
      setLoading(false);
    }
  }
  const pickOption = useCallback(
    (i: number) => {
      if (!current || picked !== null || done) return;
      const right = i === current.correct;
      playSound(right ? "success" : "error");
      setPicked(i);
      setState((s) => answerChallenge(s, right));
    },
    [current, picked, done],
  );
  const next = useCallback(() => setPicked(null), []);
  function leave() {
    setChallenge(null);
    setPicked(null);
    setState(CHALLENGE_START);
  }
  function toggleSound() {
    setSoundMuted(!muted);
    setMuted(!muted);
  }

  // Clavier : 1–4 ou A–D répond, Entrée passe à la suite.
  useEffect(() => {
    if (!challenge) return;
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (picked !== null && e.key === "Enter") return next();
      const i = "1234".indexOf(e.key) >= 0 ? "1234".indexOf(e.key) : "abcd".indexOf(e.key.toLowerCase());
      if (i >= 0 && e.key.length === 1) pickOption(i);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [challenge, picked, next, pickOption]);

  const right = picked !== null && current ? picked === current.correct : null;

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title={t("fallcheck.title")} subtitle={t("fallcheck.subtitle")} />

      <Reveal>
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0B1220] text-white shadow-[0_24px_60px_-28px_rgba(15,23,42,0.75)]" data-testid="fallcheck" data-phase={!challenge ? "setup" : done ? "done" : "play"}>
          {!challenge ? (
            <div className="space-y-6 p-5 sm:p-7">
              {/* 1. Le mode. */}
              <fieldset className="m-0 border-0 p-0">
                <legend className="mb-3 text-xs font-semibold tracking-[0.14em] text-[#EAB308] uppercase">{t("fallcheck.modeLabel")}</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  {CHALLENGE_MODES.map((m) => {
                    const Icon = MODE_ICON[m];
                    const on = m === mode;
                    return (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setMode(m)}
                        data-testid={`fallcheck-mode-${m}`}
                        className={cn(
                          "rounded-xl p-4 text-left ring-1 transition-[background-color,box-shadow,transform] duration-200 focus-visible:ring-2 focus-visible:ring-[#EAB308] focus-visible:outline-none active:scale-[0.99]",
                          on ? "bg-[#EAB308]/12 ring-[#EAB308]" : "bg-white/[0.04] ring-white/10 hover:bg-white/[0.07]",
                        )}
                      >
                        <Icon className={cn("mb-2 size-5", on ? "text-[#EAB308]" : "text-white/70")} />
                        <span className="block text-sm font-semibold">{t(`fallcheck.mode.${m}.name`)}</span>
                        <span className="mt-1 block text-xs leading-snug text-white/70">{t(`fallcheck.mode.${m}.hint`)}</span>
                      </button>
                    );
                  })}
                </div>
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
                <Quote className="mt-0.5 size-4 shrink-0 text-[#EAB308]" />
                {t("fallcheck.promise")}
              </p>

              {error && (
                <p role="alert" data-testid="fallcheck-error" className="rounded-xl bg-[#EF4444]/12 p-3 text-sm text-[#FECACA] ring-1 ring-[#EF4444]/40">
                  {t(`fallcheck.error.${error}`)}
                </p>
              )}

              <button
                type="button"
                onClick={start}
                disabled={!chosenDoc || loading}
                data-testid="fallcheck-start"
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#EAB308] px-6 text-sm font-semibold text-[#0F172A] shadow-[0_10px_24px_-12px_rgba(234,179,8,0.7)] transition-[transform,filter] duration-200 hover:brightness-105 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {loading && <Loader2 className="size-4 animate-spin" />}
                {loading ? t("fallcheck.preparing") : t("fallcheck.start")}
              </button>
            </div>
          ) : (
            <>
              {/* Avancement et compteurs. */}
              <div className="border-b border-white/10 bg-[#0F172A] px-4 py-3 sm:px-6">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="font-semibold" data-testid="fallcheck-round">
                    {t("fallcheck.round", { n: Math.min(state.index + (picked === null ? 1 : 0), total), total })}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-white/65">{challenge.title}</span>
                  <span className="flex items-center gap-1.5 font-semibold text-[#EAB308]" data-testid="fallcheck-score">
                    <Trophy className="size-4" />
                    {state.score}
                  </span>
                  <button type="button" onClick={toggleSound} aria-pressed={muted} aria-label={t(muted ? "fallcheck.soundOn" : "fallcheck.soundOff")} data-testid="fallcheck-sound" className="grid size-9 place-items-center rounded-lg text-white/80 ring-1 ring-white/15 transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#EAB308] focus-visible:outline-none">
                    {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                  </button>
                </div>
                {/* L'avancement, pour les lecteurs d'écran ; la barre dessinée en dessous n'en est que l'image. */}
                <progress className="sr-only" value={state.index} max={total} aria-label={t("fallcheck.progress")} data-testid="fallcheck-progress" />
                <div aria-hidden className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <motion.div className="h-full rounded-full bg-[#EAB308]" initial={false} animate={{ width: `${progressOf(state, total) * 100}%` }} transition={reduced ? { duration: 0 } : SPRING} />
                </div>
              </div>

              {done ? (
                <motion.div initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="flex flex-col items-center gap-4 px-6 py-12 text-center" data-testid="fallcheck-done">
                  <span className="size-20 overflow-hidden rounded-full ring-4 ring-[#EAB308]">
                    <ProfessorPortrait professor={professor} eager />
                  </span>
                  <h2 className="font-display text-2xl font-bold text-[#EAB308]">{t("fallcheck.finishedTitle")}</h2>
                  <p className="text-lg font-semibold">{t("fallcheck.result", { correct: state.correct, total, points: state.score })}</p>
                  <p className="max-w-md text-sm text-white/80">{t(`fallcheck.medal.${medal}`)}</p>
                  <div className="flex flex-wrap justify-center gap-2 pt-2">
                    <button type="button" onClick={start} disabled={loading} data-testid="fallcheck-again" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#EAB308] px-5 text-sm font-semibold text-[#0F172A] transition-[transform,filter] hover:brightness-105 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none active:scale-[0.99] disabled:opacity-50">
                      {loading ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                      {t("fallcheck.again")}
                    </button>
                    <button type="button" onClick={leave} className="inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-semibold text-white ring-1 ring-white/25 transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#EAB308] focus-visible:outline-none">
                      {t("fallcheck.otherDoc")}
                    </button>
                  </div>
                </motion.div>
              ) : (
                current && (
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={picked === null ? state.index : state.index - 1} initial={reduced ? false : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={reduced ? undefined : { opacity: 0, x: -24, transition: { duration: 0.12 } }} transition={SPRING} className="space-y-4 p-4 sm:p-6">
                      {/* Le cas. */}
                      <div className="flex items-start gap-3">
                        <span className="size-12 shrink-0 overflow-hidden rounded-full ring-2 ring-[#EAB308]">
                          <ProfessorPortrait professor={professor} eager />
                        </span>
                        <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm bg-white/[0.06] p-4 ring-1 ring-white/10">
                          <p className="text-xs font-semibold tracking-[0.14em] text-[#EAB308] uppercase">{t(`fallcheck.mode.${mode}.caseLabel`)}</p>
                          <p className="mt-1.5 text-sm leading-relaxed text-white/90" data-testid="fallcheck-situation">
                            {current.situation}
                          </p>
                        </div>
                      </div>
                      <h2 className="text-base font-semibold sm:text-lg" data-testid="fallcheck-question" aria-live="polite">
                        {current.question}
                      </h2>

                      {/* Les réponses. */}
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        {current.options.map((option, i) => {
                          const isRight = picked !== null && i === current.correct;
                          const isWrongPick = picked === i && i !== current.correct;
                          return (
                            <motion.button
                              key={option}
                              type="button"
                              disabled={picked !== null}
                              onClick={() => pickOption(i)}
                              whileTap={reduced || picked !== null ? undefined : { scale: 0.985 }}
                              animate={reduced || !isWrongPick ? {} : { x: [0, -6, 6, -4, 4, 0] }}
                              transition={{ duration: 0.4 }}
                              data-testid={`fallcheck-option-${i}`}
                              data-state={isRight ? "right" : isWrongPick ? "wrong" : "idle"}
                              className={cn(
                                "flex min-h-14 items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm ring-1 transition-[background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-[#EAB308] focus-visible:outline-none",
                                isRight ? "bg-[#22C55E]/15 text-[#DCFCE7] ring-[#22C55E]" : isWrongPick ? "bg-[#EF4444]/15 text-[#FEE2E2] ring-[#EF4444]" : picked !== null ? "bg-white/[0.03] text-white/60 ring-white/10" : "bg-white/[0.05] ring-white/12 hover:bg-white/[0.09] hover:ring-white/25",
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
                      {picked !== null && (
                        <motion.div initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="space-y-3" data-testid="fallcheck-feedback" data-right={right}>
                          <p className={cn("text-sm font-semibold", right ? "text-[#86EFAC]" : "text-[#FCA5A5]")}>{right ? t("fallcheck.correct") : t("fallcheck.wrong", { answer: current.options[current.correct] })}</p>
                          <figure className="m-0 rounded-xl border-l-2 border-[#EAB308] bg-[#EAB308]/[0.07] p-4">
                            <figcaption className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[#EAB308]" data-testid="fallcheck-source">
                              <Quote className="size-3.5" />
                              {t("fallcheck.source", { doc: challenge.title, page: current.page })}
                            </figcaption>
                            <blockquote className="m-0 text-sm leading-relaxed text-white/90" data-testid="fallcheck-quote">
                              „{current.quote}“
                            </blockquote>
                          </figure>
                          <p className="text-sm leading-relaxed text-white/80">{current.explanation}</p>
                          <div className="flex justify-end">
                            <button type="button" onClick={next} data-testid="fallcheck-next" className="inline-flex min-h-11 items-center rounded-xl bg-[#EAB308] px-6 text-sm font-semibold text-[#0F172A] transition-[transform,filter] hover:brightness-105 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none active:scale-[0.99]">
                              {state.index >= total ? t("fallcheck.finish") : t("fallcheck.next")}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                )
              )}
            </>
          )}
        </div>
      </Reveal>
    </PageContainer>
  );
}
