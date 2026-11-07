import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { PageContainer, PageHeader } from "@/components/page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { analyticsAvailable } from "@/lib/analytics";

/**
 * Betreiber-Dashboard: Wer kommt, wer bleibt, was wird benutzt?
 *
 * Wie /admin: nur Deutsch, schlicht, Rolle wird vom Server geprüft.
 * Zwei Quellen, im Bild getrennt — die eigene Datenbank (alle Konten) und
 * PostHog (nur Personen, die der Analyse zugestimmt haben).
 */

interface Retention {
  rate: number | null;
  cohort: number;
  returned: number;
}
interface Analytics {
  generatedAt: string;
  core: {
    signupsPerDay: { day: string; count: number }[];
    totals: { users: number; signups7d: number; signups30d: number };
    active: { today: number; last7d: number; last30d: number };
    retention: { d1: Retention; d7: Retention; returning: Retention };
    uploads30d: number;
  };
  posthog:
    | { configured: false; missing?: string[] }
    | {
        configured: true;
        hoersaal: { avgMinutes: number; medianMinutes: number; sessions: number } | { error: string };
        clicks: { label: string; page: string; count: number }[] | { error: string };
        funnel: { opened: number; started: number; completed: number; failed: number } | { error: string };
        heatmapUrl: string;
        replayUrl: string;
      };
}

const pct = (r: Retention) => (r.rate === null ? "—" : `${Math.round(r.rate * 100)} %`);
const isErr = (v: unknown): v is { error: string } => !!v && typeof v === "object" && "error" in v;
const dayFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" });

export default function AdminAnalyticsPage() {
  // Chaque clic sur « Aktualisieren » change la clé : nouvelle requête, et
  // le serveur ignore son cache de 5 min (?refresh=1).
  const [tick, setTick] = useState(0);
  const query = useQuery({
    queryKey: ["admin-analytics", tick],
    queryFn: async (): Promise<{ denied: true } | { denied: false; data: Analytics }> => {
      const res = await fetch(`/api/admin/analytics${tick ? "?refresh=1" : ""}`);
      if (res.status === 401 || res.status === 403) return { denied: true };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { denied: false, data: (await res.json()) as Analytics };
    },
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
  const denied = query.data?.denied === true;
  const data = query.data && !query.data.denied ? query.data.data : null;
  const loading = query.isFetching;
  const load = () => setTick((n) => n + 1);

  if (denied) {
    return (
      <PageContainer>
        <PageHeader title="Kein Zugriff" subtitle="Dieser Bereich ist dem Betreiber vorbehalten." />
      </PageContainer>
    );
  }
  if (!data) {
    return (
      <PageContainer>
        <div className="text-muted-foreground flex items-center gap-2 py-20 text-sm">
          <Loader2 className="size-4 animate-spin" /> Lade Kennzahlen …
        </div>
      </PageContainer>
    );
  }

  const { core, posthog } = data;
  return (
    <PageContainer>
      <PageHeader
        title="Analytics"
        subtitle={`Stand ${new Date(data.generatedAt).toLocaleString("de-DE")} · ${core.totals.users} Konten`}
      />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
          Aktualisieren
        </Button>
        <Link href="/admin" className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-2">
          ← Zugang & Meldungen
        </Link>
      </div>

      {/* ── Eigene Datenbank ─────────────────────────────────────────── */}
      <p className="label-tech mb-3">Alle Konten · eigene Datenbank</p>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Registrierungen (7 T.)" value={core.totals.signups7d} hint={`${core.totals.signups30d} in 30 Tagen`} />
        <Stat label="Aktiv heute" value={core.active.today} hint={`${core.active.last7d} in 7 T. · ${core.active.last30d} in 30 T.`} />
        <Stat
          label="Kommt zurück"
          value={pct(core.retention.returning)}
          hint={`${core.retention.returning.returned}/${core.retention.returning.cohort} an ≥ 2 Tagen aktiv`}
        />
        <Stat label="Uploads (30 T.)" value={core.uploads30d} hint="erfolgreich importierte Dokumente" />
      </div>

      <Card className="mb-4 p-5">
        <p className="mb-1 text-sm font-semibold">Registrierungen pro Tag</p>
        <p className="text-muted-foreground mb-4 text-xs">Letzte 30 Tage</p>
        <SignupBars rows={core.signupsPerDay} />
      </Card>

      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        <Stat
          label="Retention Tag 1"
          value={pct(core.retention.d1)}
          hint={`${core.retention.d1.returned}/${core.retention.d1.cohort} am Folgetag wieder aktiv`}
        />
        <Stat
          label="Retention Woche 2"
          value={pct(core.retention.d7)}
          hint={`${core.retention.d7.returned}/${core.retention.d7.cohort} zwischen Tag 7 und 13 aktiv`}
        />
      </div>

      {/* ── PostHog ──────────────────────────────────────────────────── */}
      <p className="label-tech mb-3">Verhalten · PostHog (nur mit Einwilligung)</p>
      {!posthog.configured ? (
        <Card className="p-5 text-sm leading-relaxed">
          <p className="font-semibold">PostHog-Abfrage nicht eingerichtet.</p>
          <p className="text-muted-foreground mt-1">
            Setze auf Railway <code>VITE_POSTHOG_KEY</code> (Erfassung im Browser) sowie{" "}
            <code>POSTHOG_PERSONAL_API_KEY</code> (Scope <code>query:read</code>) und{" "}
            <code>POSTHOG_PROJECT_ID</code> (Abfragen für dieses Dashboard). Anleitung: GUIDE_FOUNDER.md.
          </p>
          {/* Diagnostic : ce que voit RÉELLEMENT le serveur en cours et ce qui
              est figé dans ce bundle — noms seulement, jamais de valeur. */}
          <ul className="text-muted-foreground mt-3 space-y-0.5 font-mono text-xs">
            {posthog.missing?.map((name) => (
              <li key={name}>✗ {name} — im laufenden Server nicht vorhanden</li>
            ))}
            <li>
              {analyticsAvailable() ? "✓" : "✗"} VITE_POSTHOG_KEY —{" "}
              {analyticsAvailable() ? "im Browser-Bundle enthalten" : "nicht im Browser-Bundle (beim Build gefehlt)"}
            </li>
          </ul>
          <p className="text-muted-foreground mt-2 text-xs">
            Variablen auf Railway wirken erst nach einem NEUEN Deployment (Banner „Deploy“ / „Apply changes“ bestätigen).
          </p>
        </Card>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            {isErr(posthog.hoersaal) ? (
              <ErrorCard what="Zeit im Hörsaal" error={posthog.hoersaal.error} />
            ) : (
              <Stat
                label="Zeit im Hörsaal (pro Person & Tag)"
                value={`${posthog.hoersaal.medianMinutes} min`}
                hint={`Median · Mittel ${posthog.hoersaal.avgMinutes} min · ${posthog.hoersaal.sessions} Personentage`}
              />
            )}
            {isErr(posthog.funnel) ? (
              <ErrorCard what="Import-Trichter" error={posthog.funnel.error} />
            ) : (
              <Funnel f={posthog.funnel} />
            )}
          </div>

          <Card className="mb-4 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Meistgeklickt</p>
                <p className="text-muted-foreground text-xs">Letzte 14 Tage · Chat-Inhalte werden nie erfasst</p>
              </div>
              <div className="flex gap-3 text-sm">
                <a href={posthog.heatmapUrl} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">
                  Heatmaps <ExternalLink className="size-3.5" />
                </a>
                <a href={posthog.replayUrl} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">
                  Aufzeichnungen <ExternalLink className="size-3.5" />
                </a>
              </div>
            </div>
            {isErr(posthog.clicks) ? (
              <p className="text-destructive text-sm">{posthog.clicks.error}</p>
            ) : posthog.clicks.length === 0 ? (
              <p className="text-muted-foreground text-sm">Noch keine Klicks erfasst.</p>
            ) : (
              <RankedBars rows={posthog.clicks.map((c) => ({ label: c.label, sub: c.page, value: c.count }))} />
            )}
          </Card>
        </>
      )}
    </PageContainer>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-display mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}
    </Card>
  );
}

function ErrorCard({ what, error }: { what: string; error: string }) {
  return (
    <Card className="p-4">
      <p className="text-muted-foreground text-xs">{what}</p>
      <p className="text-destructive mt-1 text-sm">Abfrage fehlgeschlagen: {error}</p>
    </Card>
  );
}

/** Ein Balken je Tag; Hover/Fokus zeigt Datum und Anzahl. */
function SignupBars({ rows }: { rows: { day: string; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.count));
  const h = 140;
  return (
    <div>
      <div className="relative" style={{ height: h + 8 }}>
        {/* Gitter: nur die Maximal-Linie, zurückhaltend. */}
        <div className="border-border/70 absolute inset-x-0 top-0 border-t border-dashed" />
        <span className="text-muted-foreground absolute -top-2 right-0 bg-card pl-1 text-[10px] tabular-nums">{max}</span>
        <div className="absolute inset-x-0 bottom-0 flex items-end gap-[2px]" style={{ height: h }}>
          {rows.map((r, i) => (
            <button
              key={r.day}
              type="button"
              className="group relative flex h-full flex-1 items-end focus:outline-none"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${dayFmt.format(new Date(r.day))}: ${r.count} Registrierungen`}
            >
              <span
                className={`bg-primary w-full rounded-t-[4px] transition-opacity ${hover !== null && hover !== i ? "opacity-50" : ""}`}
                style={{ height: r.count ? Math.max(3, (r.count / max) * h) : 0 }}
              />
              {hover === i && (
                <span className="bg-popover text-popover-foreground border-border pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border px-2 py-1 text-xs shadow-md">
                  {dayFmt.format(new Date(r.day))} · <b className="tabular-nums">{r.count}</b>
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      {rows.length > 0 && (
        <div className="border-border text-muted-foreground mt-1 flex justify-between border-t pt-1 text-[10px] tabular-nums">
          <span>{dayFmt.format(new Date(rows[0].day))}</span>
          <span>{dayFmt.format(new Date(rows[rows.length - 1].day))}</span>
        </div>
      )}
    </div>
  );
}

function RankedBars({ rows }: { rows: { label: string; sub?: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={`${r.label}|${r.sub}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 text-sm">
          <div className="min-w-0">
            <p className="truncate">
              {r.label} {r.sub && <span className="text-muted-foreground text-xs">· {r.sub}</span>}
            </p>
            <div className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full">
              <div className="bg-primary h-full rounded-full" style={{ width: `${(r.value / max) * 100}%` }} />
            </div>
          </div>
          <span className="tabular-nums text-sm font-medium">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

function Funnel({ f }: { f: { opened: number; started: number; completed: number; failed: number } }) {
  const steps = [
    { label: "Import geöffnet", value: f.opened },
    { label: "Datei gewählt", value: f.started },
    { label: "Erfolgreich importiert", value: f.completed },
  ];
  const top = Math.max(1, f.opened, f.started);
  const drop = f.started ? Math.round((1 - f.completed / f.started) * 100) : null;
  return (
    <Card className="p-4">
      <p className="text-muted-foreground text-xs">Import-Trichter (Personen, 30 T.)</p>
      <p className="font-display mt-1 text-3xl font-semibold tabular-nums">{drop === null ? "—" : `${drop} %`}</p>
      <p className="text-muted-foreground mb-3 text-xs">Abbruch zwischen „Datei gewählt“ und „importiert“ · {f.failed} mit Fehler</p>
      <ul className="space-y-1.5">
        {steps.map((s) => (
          <li key={s.label} className="text-xs">
            <div className="flex justify-between">
              <span>{s.label}</span>
              <span className="tabular-nums font-medium">{s.value}</span>
            </div>
            <div className="bg-muted mt-0.5 h-1.5 overflow-hidden rounded-full">
              <div className="bg-primary h-full rounded-full" style={{ width: `${(s.value / top) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
