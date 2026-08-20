import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Clock, Check, RotateCcw, LogOut, X } from "lucide-react";
import { MarkdownContent } from "@/components/markdown-content";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { LogoMark } from "@/components/logo";
// Exam mode is ALWAYS in German — use the canonical de messages directly,
// never the reactive locale.
import { de } from "@/i18n/messages/de";
import { examQuestions, examDurationSeconds, totalPoints } from "@/data/exam";
import { cn } from "@/lib/utils";

type Phase = "warning" | "active" | "result";
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
  const timerRef = useRef<number | null>(null);

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

  const score = useMemo(() => {
    return examQuestions.reduce((sum, q) => {
      const a = (answers[q.id] ?? "").trim();
      if (a.length >= 20) return sum + q.points;
      if (a.length > 0) return sum + Math.round(q.points / 2);
      return sum;
    }, 0);
  }, [answers]);

  function start() {
    setAnswers({});
    setRemaining(examDurationSeconds);
    setPhase("active");
  }
  function retry() {
    setAnswers({});
    setRemaining(examDurationSeconds);
    setPhase("warning");
  }

  const lowTime = remaining < 300;

  return (
    <div className="bg-background fixed inset-0 z-50 flex flex-col" lang="de">
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
                  <Button className="brand-gradient flex-1 text-white" onClick={start}>
                    {m.startExam}
                  </Button>
                </div>
              </CardContent>
            </Card>
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
                <Button size="sm" className="brand-gradient text-white" onClick={() => setPhase("result")}>
                  {m.submitExam}
                </Button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
                <div className="text-muted-foreground mb-6 flex items-center justify-between text-sm">
                  <span>{m.timeLeft}: {formatTime(remaining)}</span>
                  <span>{totalPoints} {m.points}</span>
                </div>
                <div className="space-y-5">
                  {examQuestions.map((q, i) => (
                    <Card key={q.id}>
                      <CardContent className="pt-0">
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <h2 className="font-display font-bold">
                            {m.question} {i + 1} · {q.title.replace(/^Aufgabe \d+ — /, "")}
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
                    <p className="text-sm font-semibold text-white/80 uppercase tracking-wide">{m.score}</p>
                    <p className="font-display mt-2 text-5xl font-extrabold tabular-nums">
                      {score}
                      <span className="text-2xl text-white/70"> / {totalPoints}</span>
                    </p>
                    <div className="mx-auto mt-4 max-w-xs">
                      <Progress value={(score / totalPoints) * 100} className="bg-white/25" />
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-5">
                  {examQuestions.map((q) => (
                    <Card key={q.id}>
                      <CardContent className="pt-0">
                        <h2 className="font-display mb-3 font-bold">{q.title}</h2>
                        <div className="mb-3">
                          <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
                            {m.yourAnswer}
                          </p>
                          <p className="bg-secondary/50 rounded-lg p-3 text-sm whitespace-pre-wrap">
                            {(answers[q.id] ?? "").trim() || "—"}
                          </p>
                        </div>
                        <div className="border-mastered/30 bg-mastered/5 rounded-lg border p-3">
                          <p className="text-mastered mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
                            <Check className="size-3.5" />
                            {m.correction}
                          </p>
                          <MarkdownContent content={q.solution.replace(/\n/g, "\n\n")} className="text-foreground" />
                        </div>
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
