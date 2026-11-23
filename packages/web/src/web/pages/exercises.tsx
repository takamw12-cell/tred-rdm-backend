import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Loader2,
  FileDown,
  Copy,
  Check,
  RefreshCw,
  Eye,
  EyeOff,
  FileText,
  PenSquare,
  ClipboardList,
  Radar,
  Bookmark,
  Trash2,
  FileCheck,
} from "lucide-react";
import { PageContainer, PageHeader, Reveal } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { MarkdownContent } from "@/components/markdown-content";
import { DocumentViewer } from "@/components/document-viewer";
import { ExamPredictionTab } from "@/components/exam-prediction-tab";
import { documentsListOptions } from "@/queries/documents";
import {
  savedExercisesListOptions,
  savedExercisesListKey,
  savedExerciseRemoveOptions,
} from "@/queries/saved-exercises";
import { client } from "@/lib/api";
import { generateExercise, type GeneratedExercise } from "@/lib/exercise-api";
import { useReconciledSemester } from "@/hooks/use-reconciled-semester";
import { printElement } from "@/lib/pdf-print";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/** Sans document, TRED n'invente pas d'exercice générique : il le dit, et montre où déposer ses feuilles. */
const NO_DOCUMENTS = {
  de: "Noch keine Unterlagen: Lade zuerst deine Übungsblätter oder Altklausuren unter „Meine Kurse“ hoch. TRED erstellt Aufgaben nur aus deinen eigenen Dokumenten.",
  en: "No documents yet: first upload your exercise sheets or past exams under “My courses”. TRED only builds exercises from your own documents.",
  fr: "Aucun document : dépose d'abord tes feuilles d'exercices ou tes anciens examens dans « Mes cours ». TRED ne crée des exercices qu'à partir de tes propres documents.",
} as const;
const SOURCES_LABEL = { de: "Im Dokument öffnen", en: "Open in the document", fr: "Ouvrir dans le document" } as const;

function GenerationError({ kind }: { kind: "error" | "no_documents" }) {
  const { t, locale } = useT();
  if (kind === "error") return <p className="text-destructive text-sm">{t("exercises.error")}</p>;
  return (
    <p className="border-border bg-secondary/50 rounded-xl border p-3 text-sm" data-testid="exercise-no-documents">
      {NO_DOCUMENTS[locale as keyof typeof NO_DOCUMENTS] ?? NO_DOCUMENTS.en}{" "}
      <a href="/dashboard" className="text-primary font-semibold underline underline-offset-2">
        →
      </a>
    </p>
  );
}

type Difficulty = "easy" | "medium" | "hard";
type ExType = "application" | "proof" | "analysis";

/** Génération partagée avec le Prüfungsmodus (lib/exercise-api.ts). */
const generate = generateExercise;

export default function ExercisesPage() {
  const { t, locale } = useT();
  const [tab, setTab] = useState<"generator" | "klausuren" | "predictions" | "saved">("generator");
  const semesterId = useReconciledSemester();
  const { data: docs = [] } = useQuery(documentsListOptions());
  const klausuren = useMemo(() => docs.filter((d) => d.kind === "klausur"), [docs]);

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title={t("exercises.title")} subtitle={t("exercises.subtitle")} />

      {/* Tabs */}
      {/* Mobile : quatre onglets en 2 × 2 (tiennent dans 390 px) ; bureau : largeur naturelle. */}
      <div className="bg-secondary mb-6 grid w-full grid-cols-2 gap-0.5 rounded-xl p-0.5 sm:flex sm:w-fit">
        <button
          onClick={() => setTab("generator")}
          className={cn(
            "flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-center text-xs font-medium transition-colors sm:px-3 sm:text-sm",
            tab === "generator" ? "bg-background shadow-sm" : "text-muted-foreground",
          )}
        >
          <PenSquare className="size-4" />
          {t("exercises.tabGenerator")}
        </button>
        <button
          onClick={() => setTab("klausuren")}
          className={cn(
            "flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-center text-xs font-medium transition-colors sm:px-3 sm:text-sm",
            tab === "klausuren" ? "bg-background shadow-sm" : "text-muted-foreground",
          )}
        >
          <ClipboardList className="size-4" />
          {t("exercises.tabKlausuren")}
        </button>
        <button
          onClick={() => setTab("predictions")}
          className={cn(
            "flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-center text-xs font-medium transition-colors sm:px-3 sm:text-sm",
            tab === "predictions" ? "bg-background shadow-sm" : "text-muted-foreground",
          )}
        >
          <Radar className="size-4" />
          {t("exercises.tabPredictions")}
        </button>
        <button
          onClick={() => setTab("saved")}
          className={cn(
            "flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-center text-xs font-medium transition-colors sm:px-3 sm:text-sm",
            tab === "saved" ? "bg-background shadow-sm" : "text-muted-foreground",
          )}
        >
          <Bookmark className="size-4" />
          {t("exercises.tabSaved")}
        </button>
      </div>

      {tab === "generator" ? (
        <GeneratorTab semesterId={semesterId} locale={locale} />
      ) : tab === "klausuren" ? (
        <KlausurenTab klausuren={klausuren} semesterId={semesterId} locale={locale} />
      ) : tab === "predictions" ? (
        <ExamPredictionTab />
      ) : (
        <SavedTab semesterId={semesterId} />
      )}
    </PageContainer>
  );
}

function GeneratorTab({
  semesterId,
  locale,
}: {
  semesterId: string | null;
  locale: string;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  // Une tâche du plan d'étude ou l'Atelier arrive avec son thème : /exercises?subject=…&chapter=…
  const fromUrl = useMemo(() => new URLSearchParams(window.location.search), []);
  const [subject, setSubject] = useState(() => fromUrl.get("subject")?.slice(0, 120) ?? "");
  const [chapter, setChapter] = useState(() => fromUrl.get("chapter")?.slice(0, 120) ?? "");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [type, setType] = useState<ExType>("application");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<false | "error" | "no_documents">(false);
  const [result, setResult] = useState<GeneratedExercise | null>(null);

  async function run() {
    setLoading(true);
    setError(false);
    try {
      const r = await generate({
        mode: "exercise",
        subject,
        chapter,
        difficulty,
        type,
        semesterId,
        locale,
      });
      setResult(r);
      // Auto-saved server-side — refresh the history list so it shows up.
      void queryClient.invalidateQueries({ queryKey: savedExercisesListKey() });
    } catch (err) {
      setError((err as Error)?.message === "no_documents" ? "no_documents" : "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Reveal>
        <Card>
          <CardContent className="space-y-4 pt-0">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("exercises.subject")}>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="border-input bg-background focus:border-primary/60 w-full rounded-lg border px-3 py-2 text-sm outline-none"
                />
              </Field>
              <Field label={t("exercises.chapter")}>
                <input
                  value={chapter}
                  onChange={(e) => setChapter(e.target.value)}
                  placeholder={t("exercises.chapterPlaceholder")}
                  className="border-input bg-background focus:border-primary/60 w-full rounded-lg border px-3 py-2 text-sm outline-none"
                />
              </Field>
              <Field label={t("exercises.difficulty")}>
                <Select value={difficulty} onValueChange={(v) => setDifficulty(v as Difficulty)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">{t("exercises.easy")}</SelectItem>
                    <SelectItem value="medium">{t("exercises.medium")}</SelectItem>
                    <SelectItem value="hard">{t("exercises.hard")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("exercises.type")}>
                <Select value={type} onValueChange={(v) => setType(v as ExType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="application">{t("exercises.typeApplication")}</SelectItem>
                    <SelectItem value="proof">{t("exercises.typeProof")}</SelectItem>
                    <SelectItem value="analysis">{t("exercises.typeAnalysis")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Button onClick={run} disabled={loading} className="rounded-full">
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("exercises.generating")}
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  {t("exercises.generate")}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </Reveal>

      {error && <GenerationError kind={error} />}

      {result ? (
        <ExerciseResult
          result={result}
          heading={t("exercises.generatedExercise")}
          onRegenerate={run}
          regenerating={loading}
        />
      ) : (
        !loading && (
          <p className="on-photo text-muted-foreground text-sm">{t("exercises.emptyGenerated")}</p>
        )
      )}
    </div>
  );
}

function KlausurenTab({
  klausuren,
  semesterId,
  locale,
}: {
  klausuren: { id: string; title: string; pageCount: number }[];
  semesterId: string | null;
  locale: string;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<false | "error" | "no_documents">(false);
  const [result, setResult] = useState<GeneratedExercise | null>(null);
  const [basedOn, setBasedOn] = useState<string>("");

  async function run(basedOnId: string, title: string) {
    setLoadingId(basedOnId);
    setError(false);
    setBasedOn(title);
    try {
      const r = await generate({ mode: "klausur", basedOnId, semesterId, locale });
      setResult(r);
      void queryClient.invalidateQueries({ queryKey: savedExercisesListKey() });
    } catch (err) {
      setError((err as Error)?.message === "no_documents" ? "no_documents" : "error");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">{t("exercises.klausurenIntro")}</p>

      {klausuren.length === 0 ? (
        <Card>
          <CardContent className="pt-0">
            <p className="text-muted-foreground text-sm">{t("exercises.noKlausuren")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {klausuren.map((k) => (
            <Card key={k.id}>
              <CardContent className="flex items-center justify-between gap-3 pt-0">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="text-primary size-4 shrink-0" />
                  <span className="truncate text-sm font-medium">{k.title}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loadingId !== null}
                  onClick={() => run(k.id, k.title)}
                >
                  {loadingId === k.id ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {t("exercises.generatingKlausur")}
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" />
                      {t("exercises.generateKlausur")}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {error && <GenerationError kind={error} />}

      {result && (
        <ExerciseResult
          result={result}
          heading={t("exercises.generatedKlausur")}
          meta={`${t("exercises.basedOn")}: ${basedOn}`}
        />
      )}
    </div>
  );
}

function SavedTab({ semesterId }: { semesterId: string | null }) {
  const { t, locale } = useT();
  const queryClient = useQueryClient();
  const { data: saved = [], isLoading } = useQuery(savedExercisesListOptions(semesterId));
  const [openId, setOpenId] = useState<string | null>(null);
  const [openResult, setOpenResult] = useState<GeneratedExercise | null>(null);
  const [openMeta, setOpenMeta] = useState<string>("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const remove = useMutation(savedExerciseRemoveOptions());

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }),
    [locale],
  );

  async function open(id: string, title: string) {
    setLoadingId(id);
    try {
      const full = await client.savedExercises.get({ id });
      if (full) {
        setOpenResult({
          title: full.title,
          points: full.points,
          statement: full.statement,
          solution: full.solution,
          scale: full.scale,
        });
        setOpenMeta(title);
        setOpenId(id);
      }
    } finally {
      setLoadingId(null);
    }
  }

  async function del(id: string) {
    await remove.mutateAsync({ id });
    if (openId === id) {
      setOpenId(null);
      setOpenResult(null);
    }
    void queryClient.invalidateQueries({ queryKey: savedExercisesListKey() });
  }

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">{t("exercises.savedIntro")}</p>

      {isLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          {t("exercises.loading")}
        </div>
      ) : saved.length === 0 ? (
        <Card>
          <CardContent className="pt-0">
            <p className="text-muted-foreground text-sm">{t("exercises.noSaved")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {saved.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={s.mode === "klausur" ? "default" : "secondary"}>
                      {s.mode === "klausur"
                        ? t("exercises.tabKlausuren")
                        : t("exercises.tabGenerator")}
                    </Badge>
                    <h3 className="truncate text-sm font-semibold">
                      {s.title || s.subject || t("exercises.generatedExercise")}
                    </h3>
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {[s.subject, s.chapter].filter(Boolean).join(" · ")}
                    {s.subject || s.chapter ? " — " : ""}
                    {dateFmt.format(new Date(s.createdAt))}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => open(s.id, s.title || s.subject || "")}
                    disabled={loadingId === s.id}
                  >
                    {loadingId === s.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                    {t("exercises.reopen")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => del(s.id)}
                    disabled={remove.isPending}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {openResult && (
        <ExerciseResult
          result={openResult}
          heading={t("exercises.savedItem")}
          meta={openMeta}
        />
      )}
    </div>
  );
}

function ExerciseResult({
  result,
  heading,
  meta,
  onRegenerate,
  regenerating,
}: {
  result: GeneratedExercise;
  heading: string;
  meta?: string;
  onRegenerate?: () => void;
  regenerating?: boolean;
}) {
  const { t, locale } = useT();
  const [viewer, setViewer] = useState<{ documentId: string; page: number | null; quote: string } | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const [copied, setCopied] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  function copyStatement() {
    void navigator.clipboard.writeText(result.statement).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function exportPdf() {
    printElement(printRef.current, { title: result.title || heading, meta });
  }

  return (
    <Reveal>
      <Card className="paper-sheet">
        <CardContent className="space-y-4 pt-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                {heading}
              </p>
              <h2 className="font-hand text-3xl leading-tight font-bold text-[#1B2A4A]">
                {result.title}
              </h2>
              {meta && <p className="text-muted-foreground text-xs">{meta}</p>}
              {/* « Typiquement comme le prof » : l'origine du style, dite
                  franchement — y compris quand il n'y avait rien. */}
              {result.styleSource !== undefined && (
                <StyleBadge source={result.styleSource} />
              )}
            </div>
            {result.points > 0 && (
              <Badge variant="secondary">
                {result.points} {t("exercises.points")}
              </Badge>
            )}
          </div>

          <MarkdownContent content={result.statement} />

          {/* Answer space */}
          <div className="border-border rounded-xl border border-dashed p-4">
            <p className="text-muted-foreground text-xs font-medium">
              {t("exercises.answerSpace")}
            </p>
            <div className="h-32" />
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={copyStatement}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? t("exercises.copied") : t("exercises.copyStatement")}
            </Button>
            <Button size="sm" variant="outline" onClick={exportPdf}>
              <FileDown className="size-4" />
              {t("exercises.exportPdf")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowSolution((v) => !v)}>
              {showSolution ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              {showSolution ? t("exercises.hideSolution") : t("exercises.showSolution")}
            </Button>
            {onRegenerate && (
              <Button size="sm" variant="ghost" onClick={onRegenerate} disabled={regenerating}>
                <RefreshCw className={cn("size-4", regenerating && "animate-spin")} />
                {t("exercises.regenerate")}
              </Button>
            )}
          </div>

          {/* Solution */}
          {showSolution && (
            <div className="border-border bg-secondary/40 rounded-xl border p-4">
              <p className="text-primary mb-2 text-sm font-semibold">
                {t("exercises.solution")}
              </p>
              <MarkdownContent content={result.solution} />
              {/* Les sources vérifiées par le serveur : un clic ouvre le PDF de l'étudiant à la page citée. */}
              {result.citations && result.citations.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs" data-testid="exercise-citations">
                  <span className="text-muted-foreground">{SOURCES_LABEL[locale as keyof typeof SOURCES_LABEL] ?? SOURCES_LABEL.en}:</span>
                  {result.citations.map((ct) => (
                    <button
                      key={`${ct.documentId}-${ct.page ?? "x"}-${ct.quote.slice(0, 12)}`}
                      type="button"
                      onClick={() => setViewer({ documentId: ct.documentId, page: ct.page, quote: ct.quote })}
                      className="border-border hover:bg-accent/60 inline-flex min-h-7 max-w-full items-center gap-1 rounded-full border px-2 py-0.5"
                      title={ct.quote}
                    >
                      <FileCheck className="size-3 shrink-0" aria-hidden />
                      <span className="max-w-[14rem] truncate">{ct.title}</span>
                      {ct.page !== null && <span className="shrink-0 tabular-nums">· S. {ct.page}</span>}
                    </button>
                  ))}
                </div>
              )}
              {result.scale && (
                <>
                  <p className="text-muted-foreground mt-4 mb-1 text-xs font-semibold uppercase">
                    {t("exercises.scale")}
                  </p>
                  <MarkdownContent content={result.scale} />
                </>
              )}
            </div>
          )}

          {/* Hidden render for PDF export (statement + answer space). */}
          <div className="pointer-events-none absolute -left-[9999px] top-0 w-[720px]" aria-hidden>
            <div ref={printRef}>
              <MarkdownContent content={result.statement} />
              <p style={{ marginTop: 24, color: "#666", fontSize: "10pt" }}>
                {t("exercises.answerSpace")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    <DocumentViewer docId={viewer?.documentId ?? null} page={viewer?.page ?? null} highlight={viewer?.quote ?? null} onClose={() => setViewer(null)} />
    </Reveal>
  );
}

function StyleBadge({ source }: { source: GeneratedExercise["styleSource"] }) {
  const { t } = useT();
  if (!source) {
    return (
      <p className="text-muted-foreground mt-1.5 text-xs">{t("exercises.styleStandard")}</p>
    );
  }
  // Un tampon encreur, comme « Berechnet mit dem Löser » au Hörsaal : le
  // style vient d'un vrai document du prof, et ça se voit.
  return (
    <span
      title={source.title}
      className="mt-2 inline-flex max-w-full rotate-[-2deg] items-center gap-1.5 rounded-md border-[3px] border-double border-[#1D4ED8]/80 px-2.5 py-1 font-mono text-[11px] font-bold tracking-wide text-[#1D4ED8]/85 uppercase [mask-image:radial-gradient(circle_at_30%_40%,#000_55%,rgb(0_0_0/0.78)_75%,#000_100%)]"
    >
      <FileCheck className="size-3.5 shrink-0" />
      <span className="truncate">
        {t(source.kind === "klausur" ? "exercises.styleFromKlausur" : "exercises.styleFromUebung")}
        {" · "}
        <span className="normal-case">{source.title}</span>
      </span>
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
