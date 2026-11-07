import { useEffect, useState } from "react";
import { Check, Loader2, RotateCcw, X } from "lucide-react";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { MarkdownContent } from "@/components/markdown-content";
import { track } from "@/lib/analytics";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import type { QuizQuestion } from "../../api/lib/quiz";

/**
 * « Prüfe mein Verständnis » : 2 QCM générées sur les 3 derniers messages.
 * Après correction, une erreur propose « Erklär mir das nochmal » : le chat
 * reçoit la question ratée, la réponse choisie et la bonne — le tuteur
 * réexplique CE point, autrement.
 */
export function UnderstandingQuiz({
  open,
  context,
  onClose,
  onReexplain,
}: {
  open: boolean;
  /** Les messages jusqu'à la réponse concernée (le serveur garde les 3 derniers). */
  context: { role: "user" | "assistant"; text: string }[];
  onClose: () => void;
  onReexplain: (prompt: string) => void;
}) {
  const { t } = useT();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("quiz.title")}
      className="max-h-[92dvh] max-w-xl overflow-y-auto border-[#E7E2D8] bg-[#FDFBF7] text-[#1A1A1A] dark:border-white/10 dark:bg-[#0F172A] dark:text-white"
    >
      {open && <QuizBody context={context} onClose={onClose} onReexplain={onReexplain} />}
    </Modal>
  );
}

function QuizBody({
  context,
  onClose,
  onReexplain,
}: {
  context: { role: "user" | "assistant"; text: string }[];
  onClose: () => void;
  onReexplain: (prompt: string) => void;
}) {
  const { t, locale } = useT();
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<(number | null)[]>([]);
  const [checked, setChecked] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setQuestions(null);
    setError(null);
    setChecked(false);
    void fetch("/api/agent/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: context.slice(-3), locale }),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { questions?: QuizQuestion[]; error?: string };
        if (!alive) return;
        if (!res.ok || !data.questions?.length) {
          setError(res.status === 402 ? t("quiz.limit") : res.status === 429 ? t("quiz.rateLimited") : t("quiz.error"));
          return;
        }
        setQuestions(data.questions);
        setPicked(data.questions.map(() => null));
      })
      .catch(() => alive && setError(t("quiz.error")));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  if (error) {
    return (
      <div className="space-y-4 py-4 text-center">
        <p className="text-destructive text-sm">{error}</p>
        <Button variant="outline" onClick={() => setAttempt((a) => a + 1)}>
          <RotateCcw className="size-4" /> {t("quiz.retry")}
        </Button>
      </div>
    );
  }
  if (!questions) {
    return (
      <p className="flex items-center justify-center gap-2 py-12 text-sm text-[#6B6B6B] dark:text-white/65">
        <Loader2 className="size-4 animate-spin" /> {t("quiz.generating")}
      </p>
    );
  }

  const score = questions.filter((q, i) => picked[i] === q.correct).length;
  const wrong = questions.filter((q, i) => picked[i] !== q.correct);

  function evaluate() {
    setChecked(true);
    track("understanding_quiz", { score, total: questions!.length });
  }

  function reexplain() {
    const details = wrong
      .map((q) => {
        const i = questions!.indexOf(q);
        const mine = picked[i] === null ? "—" : q.options[picked[i]!];
        return `• ${q.question}\n  ${t("quiz.myAnswer")}: ${mine}\n  ${t("quiz.rightAnswer")}: ${q.options[q.correct]} (${q.concept})`;
      })
      .join("\n");
    onReexplain(`${t("quiz.reexplainPrompt")}\n\n${details}`);
    onClose();
  }

  return (
    <div className="space-y-5">
      <p className="-mt-2 text-sm text-[#6B6B6B] dark:text-white/65">{t("quiz.intro")}</p>
      {questions.map((q, qi) => (
        <div key={qi} role="radiogroup" aria-label={q.question} className="space-y-2">
          <div className="mb-1 flex gap-1.5 text-sm font-semibold">
            <span className="text-[#CA8A04] dark:text-[#EAB308]">{qi + 1}.</span>
            <MarkdownContent content={q.question} className="min-w-0 flex-1 [&_p]:my-0" />
          </div>
          {q.options.map((opt, oi) => {
            const chosen = picked[qi] === oi;
            const isRight = checked && oi === q.correct;
            const isWrong = checked && chosen && oi !== q.correct;
            return (
              <label
                key={oi}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2 text-sm transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-[#EAB308]/40",
                  isRight
                    ? "border-emerald-500 bg-emerald-500/10"
                    : isWrong
                      ? "border-red-500 bg-red-500/10"
                      : chosen
                        ? "border-[#EAB308] bg-[#EAB308]/12"
                        : "border-[#E7E2D8] bg-white/70 hover:border-[#0F172A]/30 dark:border-white/10 dark:bg-white/5",
                  checked && "cursor-default",
                )}
              >
                <input
                  type="radio"
                  name={`quiz-${qi}`}
                  checked={chosen}
                  disabled={checked}
                  onChange={() => setPicked((p) => p.map((v, i) => (i === qi ? oi : v)))}
                  aria-label={opt}
                  className="mt-1 accent-[#EAB308]"
                />
                <MarkdownContent content={opt} className="min-w-0 flex-1 [&_p]:my-0" />
                {isRight && <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />}
                {isWrong && <X className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />}
              </label>
            );
          })}
          {checked && (
            <div className="rounded-lg bg-[#0F172A]/5 px-3 py-2 text-xs leading-relaxed dark:bg-white/5">
              <MarkdownContent content={q.explanation} className="text-xs [&_p]:my-0" />
            </div>
          )}
        </div>
      ))}

      {!checked ? (
        <div className="flex justify-end">
          <Button
            onClick={evaluate}
            disabled={picked.some((p) => p === null)}
            className="bg-[#EAB308] font-semibold text-[#0F172A] hover:bg-[#CA8A04] hover:text-[#0F172A]"
          >
            {t("quiz.check")}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <output className="block text-center text-base font-semibold">
            {t("quiz.score", { score, total: questions.length })}{" "}
            {score === questions.length ? t("quiz.allRight") : t("quiz.someWrong")}
          </output>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setAttempt((a) => a + 1)} className="dark:text-white/80 dark:hover:bg-white/10">
              <RotateCcw className="size-4" /> {t("quiz.newQuiz")}
            </Button>
            {wrong.length > 0 ? (
              <Button onClick={reexplain} className="bg-[#EAB308] font-semibold text-[#0F172A] hover:bg-[#CA8A04] hover:text-[#0F172A]">
                {t("quiz.reexplain")}
              </Button>
            ) : (
              <Button onClick={onClose} className="bg-[#0F172A] text-white hover:bg-[#1E293B] dark:bg-[#EAB308] dark:text-[#0F172A]">
                {t("quiz.done")}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
