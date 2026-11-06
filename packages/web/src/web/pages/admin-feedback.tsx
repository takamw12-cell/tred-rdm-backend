import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ORPCError } from "@orpc/client";
import { ArrowLeft, Bug, Check, Lightbulb, Loader2, MessageCircle, RotateCcw, Star } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { orpc } from "@/lib/api";
import { PROFESSORS, isProfessorId } from "../../api/lib/professors";
import { cn } from "@/lib/utils";

/**
 * Betreiber: Feedback der Beta-Tester (Fehler, Ideen, Allgemeines).
 *
 * Wie /admin bewusst ohne Übersetzungen — nur der Betreiber sieht diese
 * Seite. Der Server prüft die Admin-Rolle bei jedem Aufruf (feedback.list /
 * feedback.resolve, Middleware `adminOnly`).
 */

type Status = "open" | "resolved" | "all";

const TYPE: Record<string, { label: string; icon: typeof Bug; tone: string }> = {
  bug: { label: "Fehler", icon: Bug, tone: "bg-red-500/10 text-red-700 dark:text-red-300" },
  idea: { label: "Idee", icon: Lightbulb, tone: "bg-[#EAB308]/15 text-[#854D0E] dark:text-[#FDE047]" },
  general: { label: "Allgemein", icon: MessageCircle, tone: "bg-slate-500/10 text-slate-700 dark:text-slate-300" },
};

const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" });

export default function AdminFeedbackPage() {
  const [status, setStatus] = useState<Status>("open");
  const qc = useQueryClient();
  const listOptions = orpc.feedback.list.queryOptions({ input: { status, limit: 200 } });
  const list = useQuery(listOptions);

  const resolve = useMutation({
    ...orpc.feedback.resolve.mutationOptions(),
    onSettled: () => qc.invalidateQueries({ queryKey: orpc.feedback.list.key() }),
  });

  const denied = list.error instanceof ORPCError && (list.error.code === "FORBIDDEN" || list.error.code === "UNAUTHORIZED");
  if (denied) {
    return (
      <PageContainer>
        <PageHeader title="Kein Zugriff" subtitle="Dieser Bereich ist dem Betreiber vorbehalten." />
      </PageContainer>
    );
  }

  const items = list.data?.items ?? [];

  return (
    <PageContainer>
      <Link href="/admin" className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" aria-hidden /> Admin
      </Link>
      <PageHeader title="Feedback" subtitle="Was die Beta-Tester melden — neueste zuerst." />

      <fieldset className="mb-5 flex flex-wrap gap-2">
        <legend className="sr-only">Status</legend>
        {(
          [
            ["open", "Offen"],
            ["resolved", "Erledigt"],
            ["all", "Alle"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              status === value
                ? "border-[#EAB308] bg-[#EAB308] text-[#0F172A]"
                : "border-border hover:bg-accent text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </fieldset>

      {list.isLoading && (
        <div className="text-muted-foreground flex items-center gap-2 py-16 text-sm">
          <Loader2 className="size-4 animate-spin" /> Lade …
        </div>
      )}
      {list.isError && !denied && (
        <Card className="text-destructive p-5 text-sm">
          Konnte nicht geladen werden. Wurde die Migration ausgeführt? (node migre-feedback.mjs)
        </Card>
      )}
      {!list.isLoading && !list.isError && items.length === 0 && (
        <Card className="text-muted-foreground p-8 text-center text-sm">Kein Feedback in dieser Ansicht.</Card>
      )}

      <ul className="space-y-3">
        {items.map((f) => {
          const type = TYPE[f.type] ?? TYPE.general;
          const Icon = type.icon;
          const resolved = f.status === "resolved";
          const prof = isProfessorId(f.professorId) ? PROFESSORS[f.professorId].name : f.professorId;
          return (
            <li key={f.id}>
              <Card className={cn("p-4 sm:p-5", resolved && "opacity-60")}>
                <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold", type.tone)}>
                    <Icon className="size-3.5" aria-hidden /> {type.label}
                  </span>
                  {f.rating ? (
                    <span className="inline-flex items-center gap-0.5" title={`${f.rating} von 5`}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          aria-hidden
                          className={cn("size-3.5", n <= (f.rating ?? 0) ? "fill-[#EAB308] text-[#EAB308]" : "text-muted-foreground/30")}
                        />
                      ))}
                      <span className="sr-only">{f.rating} von 5</span>
                    </span>
                  ) : null}
                  <time className="text-muted-foreground" dateTime={new Date(f.createdAt).toISOString()}>
                    {dateFmt.format(new Date(f.createdAt))}
                  </time>
                  {resolved && (
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                      <Check className="size-3.5" aria-hidden /> Erledigt
                    </span>
                  )}
                </div>

                <p className="text-sm break-words whitespace-pre-wrap">{f.message}</p>

                <dl className="text-muted-foreground mt-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
                  <dt className="font-medium">Nutzer</dt>
                  <dd className="min-w-0 truncate">
                    {f.userName || "—"} {f.userEmail ? <span>· {f.userEmail}</span> : null}
                  </dd>
                  <dt className="font-medium">Seite</dt>
                  <dd className="min-w-0 truncate font-mono">{f.pageUrl || "—"}</dd>
                  <dt className="font-medium">Professor</dt>
                  <dd>{prof || "—"}</dd>
                  <dt className="font-medium">Sprache · Browser</dt>
                  <dd className="min-w-0 truncate" title={f.userAgent}>
                    {f.locale} · {f.userAgent || "—"}
                  </dd>
                </dl>

                <div className="mt-3 flex justify-end">
                  <Button
                    size="sm"
                    variant={resolved ? "outline" : "default"}
                    disabled={resolve.isPending && resolve.variables?.id === f.id}
                    onClick={() => resolve.mutate({ id: f.id, status: resolved ? "open" : "resolved" })}
                    className={resolved ? "" : "bg-[#EAB308] text-[#0F172A] hover:bg-[#CA8A04]"}
                  >
                    {resolved ? (
                      <>
                        <RotateCcw className="size-3.5" aria-hidden /> Wieder öffnen
                      </>
                    ) : (
                      <>
                        <Check className="size-3.5" aria-hidden /> Als erledigt markieren
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </PageContainer>
  );
}
