import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { creditsMeKey, creditsMeOptions } from "@/queries/credits";
import { useToastStore } from "@/stores/toast";
import { formatCredits } from "@/lib/credit-format";
import { CalendarDays, FileText, Loader2, MessagesSquare, RotateCcw, Target } from "lucide-react";
import { Link, useLocation } from "wouter";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import { simulatorFor, studyTaskHref } from "@/lib/atelier";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DocumentViewer } from "@/components/document-viewer";
import { orpc } from "@/lib/api";
import { authClient } from "@/lib/auth";
import { useT } from "@/i18n";
import { useLocaleStore } from "@/stores/locale";
import { cn } from "@/lib/utils";
import { clearPlan, dateOfDay, loadPlan, planDay, planExpired, planProgress, savePlan, toggleDone, type PlanState, type PlanStorage } from "@/lib/study-plan";
import type { PlanTask } from "../../api/lib/learning-profile";

/**
 * « Mein Lernprofil » sur le tableau de bord (2026-11-16) :
 *
 *   - par matière, combien de concepts sont sûrs, en construction, fragiles —
 *     une barre empilée par matière, les nombres écrits à côté ;
 *   - les concepts les plus sûrs, les plus fragiles (avec leur erreur
 *     typique), les erreurs les plus fréquentes, le style d'apprentissage ;
 *   - le plan de révision sur 7 jours, avec les pages des documents de
 *     l'étudiant où chaque concept est écrit.
 *
 * Tout vient de ce que le tuteur a vu l'étudiant répondre
 * (api/lib/concept-mastery.ts). Le plan est calculé par le serveur
 * (api/lib/learning-profile.ts), sans modèle de langage, et gardé sur
 * l'appareil pour la semaine (lib/study-plan.ts).
 *
 * « Mein Fortschritt » (progress-section.tsx) reste à côté : la moyenne par
 * matière et les cartes du jour. Ici, c'est le détail et le plan.
 *
 * Table pas encore migrée → rien d'affiché. Aucune réponse enregistrée → la
 * section explique comment le profil se construit.
 */

type ErrorKind = "vorzeichen" | "einheit" | "formel" | "rechenfehler" | "begriff" | "ansatz" | "sonstiges";

const ERROR_KEY: Record<ErrorKind, string> = {
  vorzeichen: "lernprofil.errorVorzeichen",
  einheit: "lernprofil.errorEinheit",
  formel: "lernprofil.errorFormel",
  rechenfehler: "lernprofil.errorRechenfehler",
  begriff: "lernprofil.errorBegriff",
  ansatz: "lernprofil.errorAnsatz",
  sonstiges: "lernprofil.errorSonstiges",
};

const STYLE_KEY: Record<string, string> = {
  visual: "settings.lsVisual",
  auditory: "settings.lsAuditory",
  text: "settings.lsText",
  interactive: "settings.lsInteractive",
  balanced: "settings.lsBalanced",
};

/** Le stockage de l'appareil. L'accès lui-même peut être refusé (navigation privée) : lib/study-plan.ts l'encaisse. */
const deviceStorage: PlanStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
};

const dot = "size-2 shrink-0 rounded-full";

export function LernprofilSection() {
  const { t } = useT();
  const { data } = useQuery(orpc.learning.profile.queryOptions());
  const { data: session } = authClient.useSession();
  const uid = session?.user?.id ?? null;

  if (!data?.available) return null;
  const hasProfile = data.totals.concepts > 0;

  return (
    <Card data-testid="lernprofil-section" id="lernprofil">
      <CardContent className="space-y-6 pt-0">
        <div className="flex items-center gap-3">
          <span className="bg-secondary text-foreground grid size-10 shrink-0 place-items-center rounded-xl">
            <Target className="size-5" />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold">{t("lernprofil.title")}</h2>
            <p className="text-muted-foreground text-xs">{t("lernprofil.subtitle")}</p>
          </div>
        </div>

        {!hasProfile ? (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between" data-testid="lernprofil-empty">
            <p className="text-muted-foreground max-w-2xl text-sm">{t("lernprofil.empty")}</p>
            <Button asChild variant="outline" className="shrink-0 rounded-full">
              <Link to="/chat">
                <MessagesSquare className="size-4" />
                {t("lernprofil.emptyCta")}
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
              <div className="space-y-6">
                {/* ── Forces et faiblesses par matière ─────────────────────── */}
                <section aria-labelledby="lernprofil-subjects">
                  <h3 id="lernprofil-subjects" className="label-tech mb-3">
                    {t("lernprofil.bySubject")}
                  </h3>
                  <ul className="space-y-4">
                    {data.subjects.map((s) => (
                      <li key={s.topic} data-testid="lernprofil-subject">
                        <p className="mb-1.5 truncate text-sm font-medium">{s.topic}</p>
                        {/* Le dessin est décoratif : les nombres sont écrits juste dessous. */}
                        <div className="bg-secondary flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
                          {s.strong > 0 && <div className="bg-mastered h-full" style={{ flexGrow: s.strong }} />}
                          {s.building > 0 && <div className="bg-learning h-full" style={{ flexGrow: s.building }} />}
                          {s.weak > 0 && <div className="bg-destructive h-full" style={{ flexGrow: s.weak }} />}
                        </div>
                        <p className="text-muted-foreground mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums">
                          <span className="inline-flex items-center gap-1.5">
                            <span className={cn(dot, "bg-mastered")} aria-hidden="true" />
                            {s.strong} {t("lernprofil.strong")}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <span className={cn(dot, "bg-learning")} aria-hidden="true" />
                            {s.building} {t("lernprofil.building")}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <span className={cn(dot, "bg-destructive")} aria-hidden="true" />
                            {s.weak} {t("lernprofil.weak")}
                          </span>
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* ── Erreurs les plus fréquentes ──────────────────────────── */}
                {data.errorTypes.length > 0 && (
                  <section aria-labelledby="lernprofil-errors">
                    <h3 id="lernprofil-errors" className="label-tech mb-2">
                      {t("lernprofil.errors")}
                    </h3>
                    <ul className="space-y-1 text-sm">
                      {data.errorTypes.slice(0, 3).map((e) => (
                        <li key={e.type} className="flex items-baseline justify-between gap-3" data-testid="lernprofil-error">
                          <span>{t(ERROR_KEY[e.type])}</span>
                          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{e.count}×</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>

              <div className="space-y-6">
                {/* ── Forces ───────────────────────────────────────────────── */}
                <section aria-labelledby="lernprofil-strengths">
                  <h3 id="lernprofil-strengths" className="label-tech mb-2">
                    {t("lernprofil.strengths")}
                  </h3>
                  {data.strengths.length === 0 ? (
                    <p className="text-muted-foreground text-sm">{t("lernprofil.strengthsEmpty")}</p>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {data.strengths.map((c) => (
                        <li key={c.concept} className="border-border inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm" data-testid="lernprofil-strength">
                          <span className={cn(dot, "bg-mastered")} aria-hidden="true" />
                          <span className="truncate">{c.concept}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* ── Faiblesses ───────────────────────────────────────────── */}
                <section aria-labelledby="lernprofil-weaknesses">
                  <h3 id="lernprofil-weaknesses" className="label-tech mb-2">
                    {t("lernprofil.weaknesses")}
                  </h3>
                  {data.weaknesses.length === 0 ? (
                    <p className="text-muted-foreground text-sm">{t("lernprofil.weaknessesEmpty")}</p>
                  ) : (
                    <ul className="space-y-2">
                      {data.weaknesses.map((c) => (
                        <li key={c.concept} className="flex items-start gap-2 text-sm" data-testid="lernprofil-weakness">
                          <span className={cn(dot, "bg-destructive mt-1.5")} aria-hidden="true" />
                          <div className="min-w-0">
                            <p className="font-medium">
                              {c.concept}
                              {c.topic && <span className="text-muted-foreground font-normal"> · {c.topic}</span>}
                            </p>
                            {c.errors[0] && <p className="text-muted-foreground text-xs">{t("lernprofil.typicalError", { error: t(ERROR_KEY[c.errors[0].type]) })}</p>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <p className="text-muted-foreground text-xs">
                  {t("lernprofil.basis", { concepts: data.totals.concepts, attempts: data.totals.attempts })}
                  {data.learningStyle && STYLE_KEY[data.learningStyle] && (
                    <>
                      {" "}
                      {t("lernprofil.style", { style: t(STYLE_KEY[data.learningStyle]!) })}{" "}
                      <Link to="/settings" className="text-foreground underline underline-offset-2">
                        {t("lernprofil.styleChange")}
                      </Link>
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* `key` : un autre compte sur le même appareil repart de SON plan, pas de celui du précédent. */}
            {uid && <StudyPlanBlock key={uid} uid={uid} canPlan={data.weaknesses.length > 0} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Le plan sur 7 jours ──────────────────────────────────────────────── */

type Notice = "error" | "rate" | "nothing" | null;

function StudyPlanBlock({ uid, canPlan }: { uid: string; canPlan: boolean }) {
  const { t } = useT();
  const [, navigate] = useLocation();
  const locale = useLocaleStore((s) => s.locale);
  const [state, setState] = useState<PlanState | null>(() => loadPlan(uid, deviceStorage));
  const [now] = useState(() => Date.now());
  const [notice, setNotice] = useState<Notice>(null);
  const [viewer, setViewer] = useState<{ documentId: string; page: number | null; concept: string } | null>(null);
  const gen = useMutation(orpc.learning.plan.mutationOptions());

  async function generate() {
    setNotice(null);
    try {
      const { plan } = await gen.mutateAsync(undefined);
      if (!plan) {
        setNotice("nothing");
        return;
      }
      const next: PlanState = { plan, done: [] };
      setState(next);
      savePlan(uid, next, deviceStorage);
    } catch (err) {
      setNotice((err as { code?: string } | null)?.code === "TOO_MANY_REQUESTS" ? "rate" : "error");
    }
  }

  // Récompenses d'étude (api/lib/study-rewards.ts) : +0,5 crédit par chapitre, 3 par jour au plus.
  const qc = useQueryClient();
  const showToast = useToastStore((x) => x.show);
  const credits = useQuery({ ...creditsMeOptions(), staleTime: 30_000 });
  const reward = useMutation({
    ...orpc.learning.completeTask.mutationOptions(),
    onSuccess: (res, vars) => {
      if (res.granted) {
        // Mise à jour immédiate du solde affiché, avant la relecture du serveur.
        qc.setQueryData(creditsMeKey(), (old: typeof credits.data) => (old ? { ...old, purchasedCredits: res.balance, rewards: { ...old.rewards, earnedToday: res.earnedToday, leftToday: res.leftToday } } : old));
        showToast(t("rewards.granted", { n: formatCredits(res.amount, locale), concept: vars.concept }));
      } else if (res.reason === "daily_cap") showToast(t("rewards.cap"));
      else if (res.reason === "not_justified") showToast(t("rewards.notJustified"), "error");
      void qc.invalidateQueries({ queryKey: creditsMeKey() });
    },
  });
  const leftToday = credits.data?.rewards.leftToday;

  function toggle(task: PlanTask) {
    if (!state) return;
    const checking = !state.done.includes(task.id);
    const next: PlanState = { ...state, done: toggleDone(state.done, task.id) };
    setState(next);
    savePlan(uid, next, deviceStorage);
    // Cocher (pas décocher) une tâche liée à un concept : demande la récompense d'étude.
    // Le serveur décide (travaillé avec le tuteur ? déjà récompensé ? plafond du jour ?).
    if (checking && task.concept) reward.mutate({ concept: task.concept });
  }

  function discard() {
    clearPlan(uid, deviceStorage);
    setState(null);
  }

  /** La question est POSÉE dans le champ du Hörsaal, jamais envoyée d'office : c'est l'étudiant qui décide. */
  function askTutor(text: string) {
    try {
      sessionStorage.setItem("tred.askDraft", JSON.stringify(text));
    } catch {
      /* navigation privée : le Hörsaal s'ouvre, le champ reste vide */
    }
    navigate("/chat");
  }

  const dayLabel = (day: number) => {
    if (!state) return "";
    try {
      return new Intl.DateTimeFormat(locale, { weekday: "short", day: "2-digit", month: "2-digit" }).format(dateOfDay(state.plan.createdAt, day));
    } catch {
      return "";
    }
  };

  const title = (task: PlanTask) =>
    task.kind === "learn"
      ? t("lernprofil.taskLearn", { concept: task.concept ?? "" })
      : task.kind === "recall"
        ? t("lernprofil.taskRecall", { concept: task.concept ?? "" })
        : task.kind === "apply"
          ? t("lernprofil.taskApply", { concept: task.concept ?? "" })
          : t("lernprofil.taskSelftest");

  const action = (task: PlanTask): { label: string; ask: string } =>
    task.kind === "learn"
      ? { label: t("lernprofil.actLearn"), ask: t("lernprofil.askLearn", { concept: task.concept ?? "" }) }
      : task.kind === "recall"
        ? { label: t("lernprofil.actRecall"), ask: t("lernprofil.askRecall", { concept: task.concept ?? "" }) }
        : task.kind === "apply"
          ? { label: t("lernprofil.actApply"), ask: t("lernprofil.askApply", { concept: task.concept ?? "" }) }
          : { label: t("lernprofil.actSelftest"), ask: t("lernprofil.askSelftest", { concepts: task.concepts.join(", ") }) };

  const expired = state ? planExpired(state.plan.createdAt, now) : false;
  const today = state ? planDay(state.plan.createdAt, now) : 0;
  const progress = state ? planProgress(state.plan, state.done) : null;

  return (
    <section aria-labelledby="lernprofil-plan" className="border-border/60 border-t pt-5" data-testid="lernprofil-plan">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="text-muted-foreground size-4" aria-hidden />
          <h3 id="lernprofil-plan" className="font-display text-base font-semibold">
            {t("lernprofil.planTitle")}
          </h3>
        </div>
        {state && progress && (
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-xs tabular-nums" data-testid="plan-progress">
              {t("lernprofil.planProgress", { done: progress.done, total: progress.total })}
            </span>
            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => void generate()} disabled={gen.isPending || !canPlan} data-testid="plan-regenerate">
              {gen.isPending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              {t("lernprofil.planRegenerate")}
            </Button>
          </div>
        )}
      </div>

      {notice && (
        <output className="text-muted-foreground mb-3 block text-sm" data-testid="plan-notice">
          {t(notice === "rate" ? "lernprofil.planRate" : notice === "nothing" ? "lernprofil.planNothing" : "lernprofil.planError")}
        </output>
      )}

      {!state ? (
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground max-w-2xl text-sm">{canPlan ? t("lernprofil.planIntro") : t("lernprofil.planNothing")}</p>
          <Button
            className="shrink-0 rounded-full bg-[#EAB308] font-semibold text-[#0F172A] hover:bg-[#CA8A04] hover:text-[#0F172A]"
            onClick={() => void generate()}
            disabled={gen.isPending || !canPlan}
            data-testid="plan-generate"
          >
            {gen.isPending && <Loader2 className="size-4 animate-spin" />}
            {t("lernprofil.planGenerate")}
          </Button>
        </div>
      ) : (
        <>
          {expired && (
            <div className="border-border mb-3 flex flex-col items-start gap-2 rounded-xl border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between" data-testid="plan-expired">
              <p className="text-sm">{t("lernprofil.planExpired")}</p>
              <Button variant="outline" size="sm" className="shrink-0 rounded-full" onClick={canPlan ? () => void generate() : discard} disabled={gen.isPending}>
                {t("lernprofil.planGenerate")}
              </Button>
            </div>
          )}
          {typeof leftToday === "number" && (
            <p className="text-muted-foreground mb-3 text-xs" data-testid="rewards-left">
              {leftToday > 0 ? t("rewards.left", { n: formatCredits(leftToday, locale) }) : t("rewards.cap")}
            </p>
          )}
          <ol className="space-y-3">
            {state.plan.days.map((d) => (
              <li key={d.day} className="grid gap-2 sm:grid-cols-[6.5rem_1fr] sm:gap-4" data-testid="plan-day">
                <div className="flex items-baseline gap-2 sm:block">
                  <p className={cn("text-sm font-semibold", !expired && d.day === today && "text-[#CA8A04] dark:text-[#EAB308]")}>
                    {t("lernprofil.planDay", { n: d.day })}
                    {!expired && d.day === today && <span className="font-normal"> · {t("lernprofil.planToday")}</span>}
                  </p>
                  <p className="text-muted-foreground text-xs">{dayLabel(d.day)}</p>
                </div>
                {d.tasks.length === 0 ? (
                  <p className="text-muted-foreground py-1 text-sm">{t("lernprofil.planFree")}</p>
                ) : (
                  <ul className="space-y-2">
                    {d.tasks.map((task) => {
                      const checked = state.done.includes(task.id);
                      const act = action(task);
                      return (
                        <li
                          key={task.id}
                          // Téléphone : le bouton passe SOUS le texte ; à côté, il sortait de la carte.
                          className={cn("border-border grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 rounded-xl border px-3 py-2.5 sm:grid-cols-[auto_minmax(0,1fr)_auto]", checked && "opacity-60")}
                          data-testid="plan-task"
                        >
                          <Checkbox className="mt-0.5" checked={checked} onCheckedChange={() => toggle(task)} aria-label={t("lernprofil.done", { task: title(task) })} />
                          <div className="min-w-0 space-y-1">
                            {/* La tâche MÈNE au travail : son simulateur s'il existe, sinon les exercices du thème ; l'auto-test ouvre la simulation d'examen. */}
                            <Link
                              to={task.kind === "selftest" ? "/exam" : studyTaskHref(task.concept ?? task.topic, task.topic)}
                              className={cn("hover:text-primary inline-flex max-w-full items-center gap-1.5 text-sm font-medium underline-offset-2 hover:underline", checked && "line-through decoration-1")}
                              data-testid="plan-open"
                            >
                              <span className="min-w-0">{title(task)}</span>
                              {task.kind !== "selftest" && simulatorFor(task.concept, task.topic) ? <SlidersHorizontal className="size-3.5 shrink-0" aria-label="Simulator" /> : <ArrowRight className="size-3.5 shrink-0" aria-hidden />}
                            </Link>
                            {task.kind === "selftest" && <p className="text-muted-foreground text-xs">{task.concepts.join(" · ")}</p>}
                            {task.kind === "learn" &&
                              (task.refs.length === 0 ? (
                                <p className="text-muted-foreground text-xs">{t("lernprofil.taskNoPage")}</p>
                              ) : (
                                <p className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
                                  {t("lernprofil.taskRead")}
                                  {task.refs.map((ref) => (
                                    <button
                                      key={`${ref.documentId}-${ref.page ?? "x"}`}
                                      type="button"
                                      onClick={() => setViewer({ documentId: ref.documentId, page: ref.page, concept: task.concept ?? "" })}
                                      className="border-border text-foreground hover:border-signature/60 hover:bg-accent/60 focus-visible:ring-ring/40 inline-flex min-h-7 max-w-full items-center gap-1 rounded-full border px-2 py-0.5 transition-colors outline-none focus-visible:ring-[3px]"
                                      aria-label={ref.page === null ? t("lernprofil.openDoc", { title: ref.title }) : t("lernprofil.openPage", { title: ref.title, n: ref.page })}
                                      data-testid="plan-page"
                                    >
                                      <FileText className="size-3 shrink-0" aria-hidden />
                                      <span className="max-w-[14rem] truncate">{ref.title}</span>
                                      {ref.page !== null && <span className="shrink-0 tabular-nums">· {t("lernprofil.page", { n: ref.page })}</span>}
                                    </button>
                                  ))}
                                </p>
                              ))}
                            {task.kind === "learn" && task.errorType && <p className="text-muted-foreground text-xs">{t("lernprofil.taskWatch", { error: t(ERROR_KEY[task.errorType]) })}</p>}
                          </div>
                          <Button variant="outline" size="sm" className="col-start-2 justify-self-start rounded-full sm:col-start-3 sm:justify-self-end" onClick={() => askTutor(act.ask)} data-testid="plan-ask">
                            {act.label}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ol>
          <p className="text-muted-foreground mt-4 text-xs">{t("lernprofil.planSource")}</p>
        </>
      )}

      <DocumentViewer docId={viewer?.documentId ?? null} page={viewer?.page ?? null} highlight={viewer?.concept ?? null} onClose={() => setViewer(null)} />
    </section>
  );
}
