import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Clock, Check, FileCheck, Loader2, RotateCcw, LogOut, X } from "lucide-react";
import { MarkdownContent } from "@/components/markdown-content";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { LogoMark } from "@/components/logo";
// Exam mode is ALWAYS in German — use the canonical de messages directly,
// never the reactive locale.
import { de } from "@/i18n/messages/de";
import { examQuestions, examDurationSeconds } from "@/data/exam";
import { generateExercise } from "@/lib/exercise-api";
import { splitTasks, type ExamSheet } from "@/lib/exam-sheet";
import { useReconciledSemester } from "@/hooks/use-reconciled-semester";
import { cn } from "@/lib/utils";
import { InterstitialHost } from "@/components/InterstitialAdScreen";
import { useAdStore } from "@/stores/ads";
import { track } from "@/lib/analytics";

type Phase = "warning" | "loading" | "active" | "result";

/**
 * Beispielklausur intégrée : seulement si la génération est impossible
 * (pas de clé IA, quota épuisé, réseau). Elle est annoncée comme telle.
 */
const FALLBACK_SHEET: ExamSheet = {
  title: "Beispielklausur Technische Mechanik",
  tasks: examQuestions.map((q) => ({
    id: q.id,
    title: q.title,
    points: q.points,
    prompt: q.prompt,
    solution: q.solution,
  })),
  totalPoints: examQuestions.reduce((s, q) => s + q.points, 0),
  styleSource: null,
  generated: false,
};
const m = de.exam;

function formatTime(s: number): string {
  const h = Math.floor(s / 3600);
  const min = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function ExamPage() {
  const [, navigate] = useLocation();
  const [phase, setPhase] = useState<Phase>("warning");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [remaining, setRemaining] = useState(examDurationSeconds);
  const [sheet, setSheet] = useState<ExamSheet>(FALLBACK_SHEET);
  /** Points que l'étudiant s'attribue, tâche par tâche, barème en main. */
  const [selfScore, setSelfScore] = useState<Record<string, number>>({});
  const semesterId = useReconciledSemester();
  const timerRef = useRef<number | null>(null);

  // Examen rendu (bouton ou fin du temps) = fin de session : l'écran de fin
  // peut s'afficher AVANT le résultat — jamais pendant l'examen.
  const requestInterstitial = useAdStore((st) => st.request);
  useEffect(() => {
    if (phase === "result") requestInterstitial("exam_end");
  }, [phase, requestInterstitial]);

  useEffect(() => {
    if (phase !== "active") return;
    timerRef.current = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          window.clearInterval(timerRef.current!);
          setPhase("result");
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [phase]);

  // Selbstbewertung : plus de note « à la longueur de la réponse ». Ce sont
  // les points que l'étudiant s'attribue en comparant à la Musterlösung et au
  // Bewertungsschema — honnête, et c'est ainsi qu'on apprend à se corriger.
  const totalPoints = sheet.totalPoints;
  const score = useMemo(
    () => sheet.tasks.reduce((sum, t) => sum + Math.min(t.points, selfScore[t.id] ?? 0), 0),
    [sheet, selfScore],
  );

  async function start() {
    let generationSource: "generated" | "fallback" = "fallback";
    setAnswers({});
    setSelfScore({});
    setRemaining(examDurationSeconds);
    setPhase("loading");
    try {
      // Klausur im Stil DEINER Altklausur : le serveur choisit lui-même
      // l'Altklausur la plus pertinente et en reprend barème et formulation.
      const k = await generateExercise({ mode: "klausur", semesterId, locale: "de" });
      const tasks = splitTasks(k.statement, k.points);
      setSheet({
        title: k.title || "Klausur",
        tasks,
        totalPoints: tasks.reduce((s, t) => s + t.points, 0) || k.points,
        solution: k.solution,
        scale: k.scale,
        styleSource: k.styleSource ?? null,
        generated: true,
      });
      generationSource = "generated";
    } catch {
      setSheet(FALLBACK_SHEET);
    }
    track("exam_started", { generation_source: generationSource });
    setPhase("active");
  }
  function submit() {
    track("exam_submitted", {
      answered_questions: Object.values(answers).filter((answer) => answer.trim().length > 0).length,
      question_count: sheet.tasks.length,
      seconds_remaining: remaining,
    });
    setPhase("result");
  }
  function retry() {
    setAnswers({});
    setSelfScore({});
    setRemaining(examDurationSeconds);
    setPhase("warning");
  }

  const lowTime = remaining < 300;

  return (
    <div className="bg-background fixed inset-0 z-50 flex flex-col" lang="de">
      <InterstitialHost working={phase !== "result"} />
      <AnimatePresence mode="wait">
        {phase === "warning" && (
          <motion.div
            key="warning"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-1 items-center justify-center p-4"
          >
            <Card className="w-full max-w-lg border-learning/40">
              <CardContent className="pt-0">
                <div className="bg-learning/15 text-learning mx-auto mb-5 grid size-14 place-items-center rounded-2xl">
                  <AlertTriangle className="size-7" />
                </div>
                <h1 className="font-display text-center text-2xl font-extrabold tracking-tight">
                  {m.warningTitle}
                </h1>
                <p className="text-muted-foreground mt-3 text-center text-sm leading-relaxed">
                  {m.warningBody}
                </p>
                <ul className="mt-5 space-y-2">
                  {[m.warningPoint1, m.warningPoint2, m.warningPoint3].map((p) => (
                    <li key={p} className="flex items-center gap-2.5 text-sm">
                      <span className="bg-learning/15 text-learning grid size-6 shrink-0 place-items-center rounded-full">
                        <Check className="size-3.5" />
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
                <div className="mt-7 flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => navigate("/dashboard")}>
                    {de.common.cancel}
                  </Button>
                  <Button className="brand-gradient flex-1 text-white" onClick={() => void start()}>
                    {m.startExam}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {phase === "loading" && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center"
          >
            <Loader2 className="text-primary size-10 animate-spin" />
            <p className="font-display text-xl font-bold">Deine Klausur wird erstellt …</p>
            <p className="text-muted-foreground max-w-md text-sm">
              Im Stil deiner Altklausur: gleiche Aufgabenarten, gleiche Formulierungen, gleiches
              Bewertungsschema. Das dauert bis zu zwei Minuten — der Timer startet erst danach.
            </p>
          </motion.div>
        )}

        {phase === "active" && (
          <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex min-h-0 flex-1 flex-col">
            {/* Exam header */}
            <header className="border-border bg-background/90 sticky top-0 z-10 flex h-16 items-center justify-between border-b px-4 backdrop-blur-md sm:px-6">
              <div className="flex items-center gap-2.5">
                <LogoMark className="size-8" />
                <span className="font-display font-bold">{m.title}</span>
              </div>
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-bold tabular-nums",
                    lowTime ? "bg-destructive/15 text-destructive" : "bg-secondary",
                  )}
                >
                  <Clock className="size-4" />
                  {formatTime(remaining)}
                </div>
                <Button size="sm" className="brand-gradient text-white" onClick={submit}>
                  {m.submitExam}
                </Button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
                <SheetOrigin sheet={sheet} />
                <div className="text-muted-foreground mb-6 flex items-center justify-between text-sm">
                  <span>{m.timeLeft}: {formatTime(remaining)}</span>
                  <span>{totalPoints} {m.points}</span>
                </div>
                <div className="space-y-5">
                  {sheet.tasks.map((q, i) => (
                    <Card key={q.id}>
                      <CardContent className="pt-0">
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <h2 className="font-display font-bold">
                            {m.question} {i + 1} · {q.title.replace(/^Aufgabe \d+\s*[—:.-]?\s*/, "")}
                          </h2>
                          <Badge variant="secondary" className="shrink-0">
                            {q.points} {m.points}
                          </Badge>
                        </div>
                        <MarkdownContent content={q.prompt} className="text-foreground" />
                        <textarea
                          value={answers[q.id] ?? ""}
                          onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                          placeholder={m.answerPlaceholder}
                          rows={4}
                          className="border-input focus:border-primary/60 focus:ring-primary/20 mt-3 w-full resize-y rounded-xl border bg-card px-3 py-2.5 text-sm outline-none focus:ring-4"
                        />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {phase === "result" && (
          <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex min-h-0 flex-1 flex-col">
            <header className="border-border flex h-16 items-center justify-between border-b px-4 sm:px-6">
              <div className="flex items-center gap-2.5">
                <LogoMark className="size-8" />
                <span className="font-display font-bold">{m.resultTitle}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} aria-label={m.exit}>
                <X className="size-5" />
              </Button>
            </header>

            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
                {/* Score */}
                <Card className="brand-gradient mb-6 border-0 text-white">
                  <CardContent className="pt-0 text-center">
                    <p className="text-sm font-semibold text-white/80 uppercase tracking-wide">
                      {m.score} · Selbstbewertung
                    </p>
                    <p className="font-display mt-2 text-5xl font-extrabold tabular-nums">
                      {score}
                      <span className="text-2xl text-white/70"> / {totalPoints}</span>
                    </p>
                    <div className="mx-auto mt-4 max-w-xs">
                      <Progress value={totalPoints ? (score / totalPoints) * 100 : 0} className="bg-white/25" />
                    </div>
                  </CardContent>
                </Card>

                <p className="text-muted-foreground mb-5 text-sm">
                  Vergleiche jede Antwort mit der Musterlösung und dem Bewertungsschema und trage
                  deine Punkte ein — so, wie es die Korrektur in der echten Klausur tun würde.
                </p>

                {sheet.generated && (sheet.scale || sheet.solution) && (
                  <Card className="mb-5">
                    <CardContent className="space-y-4 pt-0">
                      {sheet.scale && (
                        <div>
                          <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
                            Bewertungsschema
                          </p>
                          <MarkdownContent content={sheet.scale} className="text-foreground" />
                        </div>
                      )}
                      {sheet.solution && (
                        <div className="border-mastered/30 bg-mastered/5 rounded-lg border p-3">
                          <p className="text-mastered mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
                            <Check className="size-3.5" />
                            {m.correction}
                          </p>
                          <MarkdownContent content={sheet.solution} className="text-foreground" />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                <div className="space-y-5">
                  {sheet.tasks.map((q) => (
                    <Card key={q.id}>
                      <CardContent className="pt-0">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <h2 className="font-display font-bold">{q.title}</h2>
                          <label className="flex shrink-0 items-center gap-1.5 text-sm">
                            <input
                              type="number"
                              min={0}
                              max={q.points}
                              step={0.5}
                              inputMode="decimal"
                              aria-label={`Erreichte Punkte für ${q.title}`}
                              value={selfScore[q.id] ?? ""}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setSelfScore((s) => ({
                                  ...s,
                                  [q.id]: Number.isFinite(v) ? Math.max(0, Math.min(q.points, v)) : 0,
                                }));
                              }}
                              className="border-input w-16 rounded-lg border bg-card px-2 py-1 text-right tabular-nums"
                            />
                            <span className="text-muted-foreground">/ {q.points}</span>
                          </label>
                        </div>
                        <div className="mb-3">
                          <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
                            {m.yourAnswer}
                          </p>
                          <p className="bg-secondary/50 rounded-lg p-3 text-sm whitespace-pre-wrap">
                            {(answers[q.id] ?? "").trim() || "—"}
                          </p>
                        </div>
                        {q.solution && (
                          <div className="border-mastered/30 bg-mastered/5 rounded-lg border p-3">
                            <p className="text-mastered mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
                              <Check className="size-3.5" />
                              {m.correction}
                            </p>
                            <MarkdownContent content={q.solution.replace(/\n/g, "\n\n")} className="text-foreground" />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="mt-6 flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={retry}>
                    <RotateCcw className="size-4" />
                    {m.retry}
                  </Button>
                  <Button className="brand-gradient flex-1 text-white" onClick={() => navigate("/dashboard")}>
                    <LogOut className="size-4" />
                    {m.exit}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** D'où vient cette Klausur — dit franchement, y compris quand c'est l'exemple. */
function SheetOrigin({ sheet }: { sheet: ExamSheet }) {
  if (!sheet.generated) {
    return (
      <p className="bg-learning/10 text-foreground mb-4 rounded-xl px-3 py-2 text-sm">
        Beispielklausur — deine eigene Klausur konnte gerade nicht erstellt werden.
      </p>
    );
  }
  if (!sheet.styleSource) {
    return (
      <p className="text-muted-foreground mb-4 text-sm">
        Keine Altklausur gefunden – Standardformat einer Hochschulklausur.
      </p>
    );
  }
  return (
    <span
      title={sheet.styleSource.title}
      className="mb-4 inline-flex max-w-full rotate-[-1.5deg] items-center gap-1.5 rounded-md border-[3px] border-double border-[#1D4ED8]/80 px-2.5 py-1 font-mono text-[11px] font-bold tracking-wide text-[#1D4ED8]/85 uppercase"
    >
      <FileCheck className="size-3.5 shrink-0" />
      <span className="truncate">
        Basiert auf deiner Altklausur · <span className="normal-case">{sheet.styleSource.title}</span>
      </span>
    </span>
  );
}
