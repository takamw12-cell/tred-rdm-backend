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
  Bookmark,
  Trash2,
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
import { documentsListOptions } from "@/queries/documents";
import {
  savedExercisesListOptions,
  savedExercisesListKey,
  savedExerciseRemoveOptions,
} from "@/queries/saved-exercises";
import { client } from "@/lib/api";
import { useSemesterStore } from "@/stores/semester";
import { printElement } from "@/lib/pdf-print";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

interface GeneratedExercise {
  title: string;
  points: number;
  statement: string;
  solution: string;
  scale: string;
}

type Difficulty = "easy" | "medium" | "hard";
type ExType = "application" | "proof" | "analysis";

async function generate(body: Record<string, unknown>): Promise<GeneratedExercise> {
  const res = await fetch("/api/agent/exercise", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error("generation_failed");

  // The server streams NDJSON: repeated {"type":"ping"} heartbeats to keep the
  // connection warm through proxies (a Klausur can take 2-3 min), then a final
  // {"type":"result", ...} or {"type":"error"} line.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let final: GeneratedExercise | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg: { type?: string } & Partial<GeneratedExercise>;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.type === "ping") continue;
      if (msg.type === "error") throw new Error("generation_failed");
      if (msg.type === "result") {
        final = {
          title: String(msg.title ?? ""),
          points: Number(msg.points ?? 0),
          statement: String(msg.statement ?? ""),
          solution: String(msg.solution ?? ""),
          scale: String(msg.scale ?? ""),
        };
      }
    }
  }
  if (!final) throw new Error("generation_failed");
  return final;
}

export default function ExercisesPage() {
  const { t, locale } = useT();
  const [tab, setTab] = useState<"generator" | "klausuren" | "saved">("generator");
  const semesterId = useSemesterStore((s) => s.activeId);
  const { data: docs = [] } = useQuery(documentsListOptions());
  const klausuren = useMemo(() => docs.filter((d) => d.kind === "klausur"), [docs]);

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title={t("exercises.title")} subtitle={t("exercises.subtitle")} />

      {/* Tabs */}
      <div className="bg-secondary mb-6 flex w-fit gap-0.5 rounded-xl p-0.5">
        <button
          onClick={() => setTab("generator")}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            tab === "generator" ? "bg-background shadow-sm" : "text-muted-foreground",
          )}
        >
          <PenSquare className="size-4" />
          {t("exercises.tabGenerator")}
        </button>
        <button
          onClick={() => setTab("klausuren")}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            tab === "klausuren" ? "bg-background shadow-sm" : "text-muted-foreground",
          )}
        >
          <ClipboardList className="size-4" />
          {t("exercises.tabKlausuren")}
        </button>
        <button
          onClick={() => setTab("saved")}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
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
  const [subject, setSubject] = useState("");
  const [chapter, setChapter] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [type, setType] = useState<ExType>("application");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
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
    } catch {
      setError(true);
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
            <Button onClick={run} disabled={loading} className="brand-gradient text-white">
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

      {error && <p className="text-destructive text-sm">{t("exercises.error")}</p>}

      {result ? (
        <ExerciseResult
          result={result}
          heading={t("exercises.generatedExercise")}
          onRegenerate={run}
          regenerating={loading}
        />
      ) : (
        !loading && (
          <p className="text-muted-foreground text-sm">{t("exercises.emptyGenerated")}</p>
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
  const [error, setError] = useState(false);
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
    } catch {
      setError(true);
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

      {error && <p className="text-destructive text-sm">{t("exercises.error")}</p>}

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
  const { t } = useT();
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
      <Card>
        <CardContent className="space-y-4 pt-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                {heading}
              </p>
              <h2 className="font-display text-lg font-bold">{result.title}</h2>
              {meta && <p className="text-muted-foreground text-xs">{meta}</p>}
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
    </Reveal>
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
