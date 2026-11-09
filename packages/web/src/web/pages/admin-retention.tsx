import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ORPCError } from "@orpc/client";
import { ArrowLeft, Eye, Loader2, Pause, Play } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { orpc } from "@/lib/api";
import { cn } from "@/lib/utils";
import { adminTitle, useDocumentTitle } from "@/hooks/use-document-title";

/**
 * Betreiber: das Retention-Agent (lib/retention/) — wer wurde erinnert,
 * welche Benachrichtigungen wurden geöffnet, und der Pause-Schalter.
 *
 * Wie /admin bewusst ohne Übersetzungen. Der Server prüft die Admin-Rolle bei
 * jedem Aufruf (Middleware `adminOnly`). Der Agent startet PAUSIERT: erst die
 * Vorschau ansehen, dann aktivieren.
 */

const KIND: Record<string, string> = {
  send_push_notification: "Erinnerung (inaktiv)",
  create_flashcard: "Karteikarten-Vorschlag",
  send_daily_digest: "Tagesübersicht",
};
const STATUS: Record<string, { label: string; tone: string }> = {
  unread: { label: "ungelesen", tone: "bg-slate-500/10 text-slate-700 dark:text-slate-300" },
  opened: { label: "geöffnet", tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  accepted: { label: "angenommen", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  dismissed: { label: "abgelehnt", tone: "bg-red-500/10 text-red-700 dark:text-red-300" },
};

const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" });
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)} %`);

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="gap-1 p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-display text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
    </Card>
  );
}

export default function AdminRetentionPage() {
  useDocumentTitle(adminTitle("Retention"));
  const qc = useQueryClient();
  const overview = useQuery(orpc.retention.overview.queryOptions());
  const [showPreview, setShowPreview] = useState(false);
  const preview = useQuery({ ...orpc.retention.preview.queryOptions(), enabled: showPreview });
  const toggle = useMutation({
    ...orpc.retention.setPaused.mutationOptions(),
    onSettled: () => qc.invalidateQueries({ queryKey: orpc.retention.overview.key() }),
  });

  const denied = overview.error instanceof ORPCError && (overview.error.code === "FORBIDDEN" || overview.error.code === "UNAUTHORIZED");
  if (denied) {
    return (
      <PageContainer>
        <PageHeader title="Kein Zugriff" subtitle="Dieser Bereich ist dem Betreiber vorbehalten." />
      </PageContainer>
    );
  }

  const o = overview.data;
  const paused = o?.paused ?? true;

  return (
    <PageContainer>
      <Link href="/admin" className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" aria-hidden /> Admin
      </Link>
      <PageHeader
        title="Retention-Agent"
        subtitle="Erinnert inaktive Studierende, schlägt Karteikarten zu Lücken vor, schickt die Tagesübersicht — höchstens eine Benachrichtigung pro Tag und Person, 9–20 Uhr."
      />

      {o && !o.available && (
        <Card className="border-destructive/40 mb-5 block p-4 text-sm">
          Die Tabellen fehlen noch. Einmal ausführen: <code>node C:\dev\tred-rdm\aerostudy-ai\migre-retention.mjs</code>
        </Card>
      )}

      <Card className="mb-5 flex-row flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-semibold">
            Status:{" "}
            <span className={cn(paused || o?.disabledByEnv ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>
              {o?.disabledByEnv ? "abgeschaltet (DISABLE_RETENTION_AGENT)" : paused ? "pausiert" : "aktiv"}
            </span>
          </p>
          <p className="text-muted-foreground text-xs">
            Letzter Zyklus: {o?.lastRunAt ? `${dateFmt.format(new Date(o.lastRunAt))} — ${o.lastRunNote || "—"}` : "noch keiner"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPreview(true)} disabled={!o?.available}>
            <Eye className="size-4" aria-hidden /> Vorschau
          </Button>
          <Button
            size="sm"
            variant={paused ? "default" : "destructive"}
            disabled={!o?.available || toggle.isPending || o?.disabledByEnv}
            onClick={() => toggle.mutate({ paused: !paused })}
          >
            {toggle.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
            {paused ? "Agent aktivieren" : "Pause"}
          </Button>
        </div>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Tile label="Aktionen (30 Tage)" value={String(o?.totals.total ?? 0)} />
        <Tile label="Push zugestellt" value={String(o?.totals.pushSent ?? 0)} hint="übrige: nur Web-Postfach" />
        <Tile label="Öffnungsrate" value={pct(o?.totals.openRate ?? null)} hint={`${o?.totals.opened ?? 0} geöffnet`} />
        <Tile label="Angenommen" value={String(o?.totals.accepted ?? 0)} />
        <Tile label="Abgelehnt" value={String(o?.totals.dismissed ?? 0)} />
      </div>

      {o && Object.keys(o.byKind).length > 0 && (
        <Card className="mb-6 overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-left text-xs">
              <tr>
                <th className="p-3">Aktion</th>
                <th className="p-3 text-right">Anzahl</th>
                <th className="p-3 text-right">Push</th>
                <th className="p-3 text-right">Öffnungsrate</th>
                <th className="p-3 text-right">Angenommen</th>
                <th className="p-3 text-right">Abgelehnt</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(o.byKind).map(([kind, k]) => (
                <tr key={kind} className="border-border border-t">
                  <td className="p-3">{KIND[kind] ?? kind}</td>
                  <td className="p-3 text-right tabular-nums">{k.total}</td>
                  <td className="p-3 text-right tabular-nums">{k.pushSent}</td>
                  <td className="p-3 text-right tabular-nums">{pct(k.total ? k.opened / k.total : null)}</td>
                  <td className="p-3 text-right tabular-nums">{k.accepted}</td>
                  <td className="p-3 text-right tabular-nums">{k.dismissed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {showPreview && (
        <Card className="mb-6 gap-0 p-4">
          <h2 className="mb-1 text-sm font-semibold">Vorschau des nächsten Zyklus — nichts wird gesendet</h2>
          {preview.isLoading && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {preview.error && <p className="text-destructive text-sm">{preview.error.message}</p>}
          {preview.data && (
            <>
              <p className="text-muted-foreground mb-3 text-xs">
                {preview.data.scanned} Konten geprüft · {preview.data.actions.send_push_notification} Erinnerungen ·{" "}
                {preview.data.actions.create_flashcard} Karteikarten-Vorschläge · {preview.data.actions.send_daily_digest} Tagesübersichten ·{" "}
                {preview.data.skipped} ohne Aktion
              </p>
              <ul className="space-y-2">
                {preview.data.items.map((i) => (
                  <li key={i.userId} className="border-border rounded-lg border p-3 text-sm">
                    <p className="font-medium">
                      {i.userName ?? "—"} <span className="text-muted-foreground font-normal">{i.userEmail}</span>
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {KIND[i.action] ?? i.action} · {i.channel === "push" ? "Push + Postfach" : "nur Postfach"} · {i.reason}
                    </p>
                    <p className="mt-1">
                      <strong>{i.title}</strong> {i.body}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      <h2 className="mb-2 text-sm font-semibold">Pro Person (30 Tage)</h2>
      <Card className="mb-6 overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground text-left text-xs">
            <tr>
              <th className="p-3">Person</th>
              <th className="p-3 text-right">Aktionen</th>
              <th className="p-3 text-right">Geöffnet</th>
              <th className="p-3 text-right">Zuletzt</th>
            </tr>
          </thead>
          <tbody>
            {(o?.byUser ?? []).map((u) => (
              <tr key={u.userId} className="border-border border-t">
                <td className="p-3">
                  {u.userName ?? "—"} <span className="text-muted-foreground">{u.userEmail}</span>
                </td>
                <td className="p-3 text-right tabular-nums">{u.total}</td>
                <td className="p-3 text-right tabular-nums">{u.opened}</td>
                <td className="p-3 text-right tabular-nums">{dateFmt.format(new Date(u.last))}</td>
              </tr>
            ))}
            {(o?.byUser ?? []).length === 0 && (
              <tr>
                <td className="text-muted-foreground p-3" colSpan={4}>
                  Noch keine Aktionen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <h2 className="mb-2 text-sm font-semibold">Letzte Aktionen</h2>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground text-left text-xs">
            <tr>
              <th className="p-3">Wann</th>
              <th className="p-3">Person</th>
              <th className="p-3">Aktion</th>
              <th className="p-3">Warum</th>
              <th className="p-3">Kanal</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(o?.recent ?? []).map((r) => (
              <tr key={r.id} className="border-border border-t align-top">
                <td className="p-3 whitespace-nowrap tabular-nums">{dateFmt.format(new Date(r.createdAt))}</td>
                <td className="p-3">
                  {r.userName ?? "—"} <span className="text-muted-foreground block text-xs">{r.userEmail}</span>
                </td>
                <td className="p-3">{KIND[r.kind] ?? r.kind}</td>
                <td className="text-muted-foreground p-3">{r.reason}</td>
                <td className="p-3">{r.channel === "push" ? (r.pushSent > 0 ? "Push ✓" : "Push ✗") : "Postfach"}</td>
                <td className="p-3">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs", STATUS[r.status]?.tone)}>{STATUS[r.status]?.label ?? r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </PageContainer>
  );
}
