import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, AlertCircle, ShieldCheck, Sparkles } from "lucide-react";
import { PageContainer, PageHeader, Reveal } from "@/components/page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useT } from "@/i18n";
import { useUserStore, type PlanId } from "@/stores/user";
import { client } from "@/lib/api";
import { subscriptionMeOptions, subscriptionMeKey } from "@/queries/subscriptions";
import { cn } from "@/lib/utils";

type Interval = "monthly" | "semester";

/** Verbrauchszähler, die der Server führt (siehe api/lib/plan.ts). */
const METRICS = [
  { key: "chat", label: "KI-Chat" },
  { key: "exercise", label: "Übungen" },
  { key: "video", label: "Videos" },
  { key: "formulas", label: "Formelsammlungen" },
] as const;

const PRO_FEATURES = [
  "500 KI-Chats pro Monat",
  "100 Übungen & Klausuren pro Monat",
  "Engineering DNA",
  "Prüfungsmodus",
  "Dokumenten-Import",
  "Technisches Wörterbuch",
  "Prioritäts-Support",
];

const FREE_FEATURES = [
  "20 KI-Chats pro Monat",
  "5 Übungen pro Monat",
  "10 Dokumente",
  "Technisches Wörterbuch",
];

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export default function PricingPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const setPlan = useUserStore((s) => s.setPlan);
  const [error, setError] = useState<string | null>(null);
  const [interval, setInterval] = useState<Interval>("semester");

  const { data: sub, isLoading } = useQuery(subscriptionMeOptions());

  const currentPlan: PlanId = sub?.plan ?? "free";
  const isPaid = currentPlan === "standard" || currentPlan === "premium" || currentPlan === "founder";

  useEffect(() => {
    if (sub?.plan) setPlan(sub.plan as PlanId);
  }, [sub?.plan, setPlan]);

  // Rückkehr von Stripe: der Webhook braucht einen Moment. Statt den Nutzer
  // "kein Abo" sehen zu lassen, fragen wir ein paar Sekunden lang nach.
  const [justPaid, setJustPaid] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return;

    setJustPaid(true);
    window.history.replaceState({}, "", window.location.pathname);

    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      void qc.invalidateQueries({ queryKey: subscriptionMeKey() });
      if (tries >= 6) window.clearInterval(timer);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [qc]);

  const offers = sub?.offers ?? [];
  const monthly = offers.find((o) => o.interval === "monthly");
  const semester = offers.find((o) => o.interval === "semester");
  const selected = interval === "semester" ? (semester ?? monthly) : (monthly ?? semester);

  /** Ersparnis der Halbjahresformel gegenüber sechs Einzelmonaten. */
  const savings = useMemo(() => {
    if (!monthly || !semester) return 0;
    return monthly.amount * semester.months - semester.amount;
  }, [monthly, semester]);

  const trialAvailable = !!sub && sub.trialDays > 0 && !sub.trialUsed;

  const checkoutMut = useMutation({
    mutationFn: (priceId: string) => client.subscriptions.createCheckout({ priceId }),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: () => setError("Der Bezahlvorgang konnte nicht gestartet werden. Bitte später erneut versuchen."),
  });

  const portalMut = useMutation({
    mutationFn: () => client.subscriptions.portal({}),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: () => setError("Das Kundenportal ist gerade nicht erreichbar."),
  });

  const busy = checkoutMut.isPending || portalMut.isPending;

  return (
    <PageContainer>
      <PageHeader title={t("pricing.title")} subtitle={t("pricing.subtitle")} />

      {justPaid && !isPaid && (
        <Card className="mb-5 flex items-center gap-3 p-4">
          <Loader2 className="size-4 animate-spin text-violet-500" />
          <p className="text-sm">Zahlung erhalten. Dein Zugang wird gerade freigeschaltet …</p>
        </Card>
      )}

      {error && (
        <Card className="border-destructive/40 mb-5 flex items-center gap-3 p-4">
          <AlertCircle className="text-destructive size-4 shrink-0" />
          <p className="text-sm">{error}</p>
        </Card>
      )}

      {sub && offers.length === 0 && (
        <Card className="mb-5 flex items-center gap-3 p-4">
          <AlertCircle className="text-muted-foreground size-4 shrink-0" />
          <p className="text-muted-foreground text-sm">
            Keine Preise gefunden. Prüfe <code>STRIPE_PRICE_PRO_MONTHLY</code> und{" "}
            <code>STRIPE_PRICE_PRO_SEMESTER</code>.
          </p>
        </Card>
      )}

      {/* Verbrauch — macht das Limit sichtbar, bevor der Nutzer dagegenläuft. */}
      {sub && (
        <Reveal className="mb-8">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-sm font-bold">Dein Verbrauch diesen Monat</h2>
              {sub.validUntil && (
                <span className="text-muted-foreground text-xs">
                  Aktiv bis {new Date(sub.validUntil).toLocaleDateString("de-DE")}
                </span>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {METRICS.map((m) => {
                const used = sub.usage[m.key] ?? 0;
                const limit = sub.limits[m.key] ?? 0;
                const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
                return (
                  <div key={m.key}>
                    <div className="mb-1.5 flex items-baseline justify-between text-xs">
                      <span className="text-muted-foreground">{m.label}</span>
                      <span className={cn("font-medium", used >= limit && "text-destructive")}>
                        {used} / {limit}
                      </span>
                    </div>
                    <Progress value={pct} />
                  </div>
                );
              })}
            </div>
          </Card>
        </Reveal>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_1.35fr]">
        {/* ── Gratis ─────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <Card className={cn("flex h-full flex-col p-6", !isPaid && "ring-primary/40 ring-2")}>
            <h3 className="font-display text-lg font-extrabold">Gratis</h3>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="font-display text-3xl font-extrabold tracking-tight">0 €</span>
            </div>
            <p className="text-muted-foreground mt-2 text-sm">Zum Ausprobieren der Grundfunktionen.</p>

            <ul className="mt-5 space-y-2.5">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="text-muted-foreground flex items-center gap-2.5 text-sm">
                  <Check className="size-4 shrink-0 opacity-60" />
                  {f}
                </li>
              ))}
            </ul>

            <div className="mt-auto pt-6">
              {isPaid ? (
                <Button
                  variant="ghost"
                  className="text-muted-foreground w-full"
                  disabled={busy || !sub?.manageable}
                  onClick={() => {
                    setError(null);
                    portalMut.mutate();
                  }}
                >
                  Zu Gratis wechseln
                </Button>
              ) : (
                <Button variant="outline" className="w-full" disabled>
                  Aktueller Tarif
                </Button>
              )}
            </div>
          </Card>
        </motion.div>

        {/* ── Premium ────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
        >
          <Card
            className={cn(
              "relative flex h-full flex-col border-violet-500/50 p-6 shadow-lg",
              isPaid && "ring-2 ring-violet-500/50",
            )}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-violet-500" />
              <h3 className="font-display text-lg font-extrabold">Premium</h3>
            </div>
            <p className="text-muted-foreground mt-2 text-sm">
              Genug für ein ganzes Semester Prüfungsvorbereitung.
            </p>

            {/* Intervall-Auswahl */}
            {monthly && semester && (
              <div className="bg-muted/50 mt-5 grid grid-cols-2 gap-1 rounded-xl p-1">
                <IntervalTab
                  active={interval === "monthly"}
                  onClick={() => setInterval("monthly")}
                  label="Monatlich"
                />
                <IntervalTab
                  active={interval === "semester"}
                  onClick={() => setInterval("semester")}
                  label="6 Monate"
                  badge={savings > 0 ? `Spare ${money(savings, semester.currency)}` : undefined}
                />
              </div>
            )}

            {/* Preis */}
            <div className="mt-6">
              {selected ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-4xl font-extrabold tracking-tight">
                      {money(selected.amount, selected.currency)}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {selected.interval === "semester" ? "/ 6 Monate" : "/ Monat"}
                    </span>
                  </div>
                  {selected.interval === "semester" && (
                    <p className="text-muted-foreground mt-1 text-sm">
                      entspricht {money(selected.amountPerMonth, selected.currency)} pro Monat
                    </p>
                  )}
                </>
              ) : (
                <div className="text-muted-foreground text-sm">
                  {isLoading ? "Preise werden geladen …" : "Preis nicht verfügbar"}
                </div>
              )}
            </div>

            <ul className="mt-6 space-y-2.5">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-sm">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-violet-500/15 text-violet-500">
                    <Check className="size-3" />
                  </span>
                  {f}
                </li>
              ))}
            </ul>

            <div className="mt-auto pt-6">
              {isPaid ? (
                <Button
                  className="w-full bg-violet-600 text-white hover:bg-violet-700"
                  disabled={busy || !sub?.manageable}
                  onClick={() => {
                    setError(null);
                    portalMut.mutate();
                  }}
                >
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  Abo verwalten
                </Button>
              ) : (
                <Button
                  className="w-full bg-violet-600 text-white shadow-md hover:bg-violet-700"
                  disabled={busy || isLoading || !selected}
                  onClick={() => {
                    setError(null);
                    if (selected) checkoutMut.mutate(selected.priceId);
                  }}
                >
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  {trialAvailable ? `${sub?.trialDays} Tage kostenlos testen` : "Premium freischalten"}
                </Button>
              )}

              <p className="text-muted-foreground mt-3 flex items-center justify-center gap-1.5 text-center text-xs">
                <ShieldCheck className="size-3.5" />
                {trialAvailable && selected
                  ? `Danach ${money(selected.amount, selected.currency)}. Jederzeit kündbar.`
                  : "Jederzeit kündbar."}
              </p>
            </div>
          </Card>
        </motion.div>
      </div>

      <Reveal className="mt-8 text-center">
        <p className="text-muted-foreground text-xs">
          {t("pricing.paymentMethods")}: Visa · Mastercard · Apple Pay · Klarna · SEPA
        </p>
      </Reveal>
    </PageContainer>
  );
}

function IntervalTab({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        active ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {badge && (
        <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
          {badge}
        </span>
      )}
    </button>
  );
}
