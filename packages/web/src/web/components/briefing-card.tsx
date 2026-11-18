import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ORPCError } from "@orpc/client";
import { ArrowRight, CalendarPlus, Loader2, RefreshCw, Sunrise, X } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { orpc } from "@/lib/api";
import { useT } from "@/i18n";
import { useLocaleStore } from "@/stores/locale";
import { cn } from "@/lib/utils";

/**
 * « Dein Briefing » — tout en haut du tableau de bord (2026-11-18).
 *
 * Une phrase du jour, choisie par le serveur selon l'état du compte (aucun
 * document, de retour après une pause, examen proche, jour ordinaire), un
 * bouton pour s'y mettre, et les examens saisis avec leur compte à rebours.
 *
 * Le serveur renvoie les PHRASES (clé + valeurs) et, quand le modèle a tourné,
 * un texte déjà rédigé. Sans texte, les phrases s'affichent dans la langue de
 * l'interface : la carte ne dépend jamais du modèle.
 *
 * La salutation (« Guten Morgen! ») est choisie ici, à l'heure de l'étudiant :
 * le briefing est gardé pour la journée, et « Guten Morgen » à 21 h se lirait
 * comme un défaut.
 */

type Kind = "welcome" | "comeback" | "exam" | "standard";

function greetingKey(hour: number): string {
  if (hour < 11) return "briefing.greetMorning";
  if (hour < 18) return "briefing.greetDay";
  return "briefing.greetEvening";
}

/** Le jour local de l'étudiant, « 2026-11-18 » : la date la plus ancienne que le champ accepte. */
function localDay(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function BriefingCard() {
  const { t } = useT();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const locale = useLocaleStore((s) => s.locale);
  const input = { locale };

  const today = useQuery({ ...orpc.briefing.today.queryOptions({ input }), staleTime: 5 * 60_000 });
  const refresh = useMutation({
    ...orpc.briefing.refresh.mutationOptions(),
    onSuccess: (fresh) => qc.setQueryData(orpc.briefing.today.queryKey({ input }), fresh),
  });
  const removeExam = useMutation({
    ...orpc.briefing.examRemove.mutationOptions(),
    onSuccess: () => qc.invalidateQueries({ queryKey: orpc.briefing.today.key() }),
  });

  const [adding, setAdding] = useState(false);
  const data = today.data;
  const busy = today.isLoading || refresh.isPending;

  /** La question est POSÉE dans le champ du Hörsaal, jamais envoyée d'office (comme « Mein Lernprofil »). */
  function ask(text: string) {
    try {
      sessionStorage.setItem("tred.askDraft", JSON.stringify(text));
    } catch {
      /* navigation privée : le Hörsaal s'ouvre, le champ reste vide */
    }
    navigate("/chat");
  }

  const action = (() => {
    if (!data) return null;
    const { subject, focus } = data;
    switch (data.kind as Kind) {
      case "welcome":
        return { label: t("briefing.ctaUpload"), run: () => navigate("/chat") };
      case "comeback":
        return { label: t("briefing.ctaQuiz"), run: () => ask(subject ? t("briefing.draftQuiz", { subject }) : t("briefing.draftQuizPlain")) };
      case "exam":
        return { label: t("briefing.ctaFocus"), run: () => ask(focus ? t("briefing.draftFocus", { focus }) : t("briefing.draftExam", { subject: subject ?? "" })) };
      default:
        return focus ? { label: t("briefing.ctaFocus"), run: () => ask(t("briefing.draftFocus", { focus })) } : { label: t("briefing.ctaAsk"), run: () => navigate("/chat") };
    }
  })();

  const sentence = data ? (data.text ?? data.parts.map((p) => t(`briefing.${p.key}`, p.params)).join(" ")) : "";
  const canRefresh = Boolean(data?.migrated) && (data?.refreshLeft ?? 0) > 0;

  return (
    <section
      data-testid="briefing-card"
      aria-labelledby="briefing-title"
      aria-busy={busy}
      // Le liseré doré : un dégradé d'un pixel autour de la carte, et un halo qui reste sous elle.
      className="rounded-2xl bg-[linear-gradient(135deg,#EAB308_0%,rgb(234_179_8/0.28)_34%,rgb(234_179_8/0.14)_66%,#EAB308_100%)] p-px shadow-[0_24px_70px_-30px_rgb(234_179_8/0.85)]"
    >
      <div className="bg-card text-card-foreground rounded-[15px] p-5 backdrop-blur-xl sm:p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#EAB308]/15 text-[#A16207] dark:text-[#EAB308]">
              <Sunrise className="size-4" aria-hidden />
            </span>
            <h2 id="briefing-title" className="font-display text-base font-semibold">
              {t("briefing.title")}
            </h2>
          </div>
          {data?.migrated && (
            <button
              type="button"
              data-testid="briefing-refresh"
              onClick={() => refresh.mutate(input)}
              disabled={busy || !canRefresh}
              title={canRefresh ? t("briefing.refresh") : t("briefing.refreshUsed")}
              aria-label={canRefresh ? t("briefing.refresh") : t("briefing.refreshUsed")}
              className="text-muted-foreground hover:text-foreground hover:bg-accent grid size-9 shrink-0 place-items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-[#EAB308] focus-visible:outline-none disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <RefreshCw className={cn("size-4", refresh.isPending && "motion-safe:animate-spin")} aria-hidden />
            </button>
          )}
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-8">
          <div className="min-w-0">
            {busy ? (
              <div data-testid="briefing-skeleton" className="space-y-2.5 py-1 motion-safe:animate-pulse" role="status" aria-label={t("common.loading")}>
                <div className="bg-foreground/10 h-5 w-11/12 rounded-md" />
                <div className="bg-foreground/10 h-5 w-8/12 rounded-md" />
                <div className="bg-foreground/10 mt-4 h-9 w-36 rounded-full" />
              </div>
            ) : !data ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-muted-foreground text-sm">{t("briefing.error")}</p>
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => void today.refetch()}>
                  {t("briefing.retry")}
                </Button>
              </div>
            ) : (
              <>
                <p data-testid="briefing-text" className="font-display max-w-[62ch] text-lg leading-snug font-medium text-balance sm:text-xl">
                  {data.greet && <span className="text-[#A16207] dark:text-[#EAB308]">{t(greetingKey(new Date().getHours()))} </span>}
                  {sentence}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {action && (
                    <Button onClick={action.run} className="rounded-full bg-[#EAB308] font-semibold text-[#0F172A] hover:bg-[#FACC15]">
                      {action.label}
                      <ArrowRight className="size-4" aria-hidden />
                    </Button>
                  )}
                  {data.migrated && !adding && (
                    <Button variant="outline" className="rounded-full" data-testid="briefing-add-exam" onClick={() => setAdding(true)}>
                      <CalendarPlus className="size-4" aria-hidden />
                      {t("briefing.addExam")}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>

          {data && data.exams.length > 0 && (
            <ul className="flex flex-wrap gap-2.5 lg:justify-end" data-testid="briefing-exams">
              {data.exams.slice(0, 3).map((exam) => (
                <li key={exam.id} className="group border-border/70 bg-background/60 relative flex min-w-36 items-center gap-3 rounded-xl border py-2.5 pr-9 pl-3.5">
                  <span className="font-display text-3xl leading-none font-semibold tabular-nums">{exam.days <= 0 ? t("briefing.countdownToday") : exam.days}</span>
                  <span className="min-w-0">
                    <span className="text-muted-foreground block text-xs leading-tight">
                      {exam.days <= 0 ? t("briefing.countdownTodayLabel") : exam.days === 1 ? t("briefing.countdownOne") : t("briefing.countdownDays")}
                    </span>
                    <span className="block max-w-40 truncate text-sm font-medium">{exam.subject}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeExam.mutate({ id: exam.id })}
                    disabled={removeExam.isPending}
                    aria-label={`${t("briefing.examRemove")}: ${exam.subject}`}
                    title={t("briefing.examRemove")}
                    className="text-muted-foreground hover:text-destructive absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full transition-opacity focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {adding && <ExamForm onClose={() => setAdding(false)} />}
      </div>
    </section>
  );
}

/** « Klausur hinzufügen » : une matière, une date. */
function ExamForm({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const qc = useQueryClient();
  const listId = useId();
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { data: known } = useQuery(orpc.briefing.subjects.queryOptions());

  const add = useMutation({
    ...orpc.briefing.examAdd.mutationOptions(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: orpc.briefing.today.key() });
      onClose();
    },
    onError: (err) => setError(err instanceof ORPCError && err.message === "exam_limit" ? t("briefing.examLimit") : t("briefing.examError")),
  });

  const min = localDay(new Date());
  const ready = subject.trim().length >= 2 && date >= min;

  return (
    <form
      data-testid="briefing-exam-form"
      className="border-border/60 mt-5 grid gap-3 border-t pt-4 sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!ready) return setError(t("briefing.examError"));
        add.mutate({ subject: subject.trim(), date });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={`${listId}-subject`}>{t("briefing.examSubject")}</Label>
        <Input
          id={`${listId}-subject`}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={t("briefing.examSubjectPlaceholder")}
          list={listId}
          maxLength={60}
          autoFocus
        />
        <datalist id={listId}>
          {known?.subjects.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${listId}-date`}>{t("briefing.examDate")}</Label>
        <Input id={`${listId}-date`} type="date" value={date} min={min} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={add.isPending} className="rounded-full bg-[#EAB308] font-semibold text-[#0F172A] hover:bg-[#FACC15]">
          {add.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {t("briefing.examSave")}
        </Button>
        <Button type="button" variant="ghost" className="rounded-full" onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm sm:col-span-3">
          {error}
        </p>
      )}
    </form>
  );
}
