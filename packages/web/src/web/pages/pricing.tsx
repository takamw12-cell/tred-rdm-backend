import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, Check, Coins, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { PageContainer, PageHeader, Reveal } from "@/components/page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WithdrawalConsent } from "@/components/consent";
import { Progress } from "@/components/ui/progress";
import { useUserStore, type PlanId } from "@/stores/user";
import { useLocaleStore } from "@/stores/locale";
import { useToastStore } from "@/stores/toast";
import { client } from "@/lib/api";
import { formatMoney, pricingCopy, resolvePrices } from "@/lib/pricing-copy";
import { creditsMeKey, creditsMeOptions } from "@/queries/credits";
import { subscriptionMeOptions, subscriptionMeKey } from "@/queries/subscriptions";
import { cn } from "@/lib/utils";

/**
 * /pricing — la grille tarifaire (décision du 12 nov. 2026).
 *
 *   Free · Étudiant mensuel · Étudiant semestriel (mis en avant, « -30 % »)
 *   + les crédits à l'unité + l'essai de 14 jours illimités.
 *
 * Aucun montant n'est écrit ici : ils viennent de `subscriptions.me` (prix
 * Stripe quand ils sont configurés, sinon la grille de api/lib/plan.ts). La
 * carte ne peut donc pas afficher autre chose que ce que la caisse encaisse.
 *
 * Charte : crème / encre, et pour l'offre mise en avant le panneau navy
 * #0F172A avec le jaune #EAB308.
 */

/** Verbrauchszähler, die der Server führt (siehe api/lib/plan.ts). */
const METRICS = ["chat", "exercise", "video", "formulas"] as const;

const YELLOW_BUTTON =
  "bg-[#EAB308] text-[#1A1A1A] font-bold shadow-[0_8px_30px_-8px_rgba(234,179,8,0.6)] hover:bg-[#EAB308] hover:brightness-105";

export default function PricingPage() {
  const locale = useLocaleStore((s) => s.locale);
  const c = pricingCopy(locale);
  const qc = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const setPlan = useUserStore((s) => s.setPlan);
  const [error, setError] = useState<string | null>(null);

  const { data: sub, isLoading } = useQuery(subscriptionMeOptions());
  const { data: credits } = useQuery(creditsMeOptions());

  const currentPlan: PlanId = (sub?.plan as PlanId | undefined) ?? "free";
  const isPaid = currentPlan === "standard" || currentPlan === "premium" || currentPlan === "founder";
  // Bêta gratuite : les offres sont montrées, mais rien ne peut être acheté.
  const beta = sub?.beta ?? false;

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

  const prices = sub ? resolvePrices(sub.pricing, sub.offers) : null;
  const money = (cents: number) => formatMoney(cents, prices?.currency ?? "EUR", locale);

  const checkoutMut = useMutation({
    mutationFn: (priceId: string) => client.subscriptions.createCheckout({ priceId }),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: () => setError(c.checkoutError),
  });

  const portalMut = useMutation({
    mutationFn: () => client.subscriptions.portal({}),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: () => setError(c.portalError),
  });

  const trialMut = useMutation({
    mutationFn: () => client.subscriptions.startTrial(),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: subscriptionMeKey() });
      void qc.invalidateQueries({ queryKey: creditsMeKey() });
      if (res.active) toast(c.trialStarted(res.daysLeft));
      else setError(c.trialError);
    },
    onError: () => setError(c.trialError),
  });

  const packMut = useMutation({
    mutationFn: (priceId: string) => client.credits.purchase({ priceId }),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: () => setError(c.checkoutError),
  });

  const busy = checkoutMut.isPending || portalMut.isPending || trialMut.isPending || packMut.isPending;

  // § 356 Abs. 5 BGB : deux affirmations DISTINCTES, jamais précochées. Les
  // fusionner en une seule case annulerait l'effet — c'est précisément ce que
  // la jurisprudence allemande sanctionne.
  const [consentStart, setConsentStart] = useState(false);
  const [consentLose, setConsentLose] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const consentOk = consentStart && consentLose;
  const consentRef = useRef<HTMLDivElement>(null);

  /** Lance le paiement d'une formule. Le bouton reste actif exprès : un bouton mort n'explique rien. */
  function subscribe(priceId: string | null) {
    setError(null);
    if (!consentOk) {
      setConsentError(true);
      consentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!priceId) {
      setError(c.checkoutError);
      return;
    }
    checkoutMut.mutate(priceId);
  }

  const manage = () => {
    setError(null);
    portalMut.mutate();
  };

  const free = sub?.limitsByPlan.free;
  const student = sub?.limitsByPlan.student;
  const pack = credits?.packs?.[0] ?? null;
  const packAmount = pack?.amount ?? sub?.pricing.creditPack.amount ?? 0;
  const packCredits = pack?.credits ?? sub?.pricing.creditPack.credits ?? 0;
  const videoCost = sub?.creditCost.video ?? 10;

  return (
    <PageContainer>
      <PageHeader title={c.title} subtitle={c.subtitle} />

      {justPaid && !isPaid && (
        <Card className="mb-5 flex items-center gap-3 p-4">
          <Loader2 className="text-signature size-4 animate-spin" />
          <p className="text-sm">{c.paid}</p>
        </Card>
      )}

      {error && (
        <Card className="border-destructive/40 mb-5 flex items-center gap-3 p-4" role="alert">
          <AlertCircle className="text-destructive size-4 shrink-0" />
          <p className="text-sm">{error}</p>
        </Card>
      )}

      {/* ── Bêta gratuite : le message, avant tout le reste ─────────────── */}
      {beta && (
        <Reveal className="mb-6">
          <div className="relative overflow-hidden rounded-2xl bg-[#0F172A] p-5 text-white sm:p-6" data-testid="beta-banner" role="status">
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-[#EAB308]/25 blur-3xl" />
            <p className="relative flex items-start gap-3 text-base font-semibold leading-snug sm:text-lg">
              <Sparkles className="mt-0.5 size-5 shrink-0 text-[#EAB308]" aria-hidden />
              {c.betaBanner}
            </p>
          </div>
        </Reveal>
      )}

      {/* ── L'essai : en cours, ou à lancer ─────────────────────────────── */}
      {!beta && sub?.trial.active && (
        <Reveal className="mb-6">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[#0F172A] px-5 py-4 text-white" data-testid="trial-active">
            <Sparkles className="size-5 shrink-0 text-[#EAB308]" aria-hidden />
            <p className="text-sm font-medium">{c.trialActive(sub.trial.daysLeft)}</p>
          </div>
        </Reveal>
      )}
      {!beta && sub?.trial.available && (
        <Reveal className="mb-6">
          <div className="relative overflow-hidden rounded-2xl bg-[#0F172A] p-5 text-white sm:p-6" data-testid="trial-offer">
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-[#EAB308]/25 blur-3xl" />
            <div className="relative flex flex-wrap items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-display text-xl font-extrabold tracking-tight">{c.trialCta(sub.trial.days)}</p>
                <p className="mt-1 text-sm text-white/65">{c.trialNote}</p>
              </div>
              <Button
                size="lg"
                className={cn("h-12 gap-2 px-6", YELLOW_BUTTON)}
                disabled={busy}
                onClick={() => {
                  setError(null);
                  trialMut.mutate();
                }}
              >
                {trialMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" aria-hidden />}
                {c.trialCta(sub.trial.days)}
              </Button>
            </div>
          </div>
        </Reveal>
      )}

      {/* ── Les trois offres ────────────────────────────────────────────── */}
      <div className="grid items-stretch gap-5 lg:grid-cols-3">
        {/* Free */}
        <PlanCard index={0} className="order-3 lg:order-1" current={currentPlan === "free"}>
          <h3 className="font-display text-lg font-extrabold">{c.free}</h3>
          <p className="text-muted-foreground mt-1 text-sm">{c.freeDesc}</p>
          <Price big={money(0)} />
          <Features
            items={free ? [c.chats(free.chat), c.videos(free.video), c.exercises(free.exercise), c.documents(free.documents)] : []}
          />
          <div className="mt-auto pt-6">
            <Button variant="outline" className="w-full" disabled>
              {currentPlan === "free" && !beta ? c.currentPlan : c.free}
            </Button>
          </div>
        </PlanCard>

        {/* Étudiant mensuel */}
        <PlanCard index={1} className="order-2" current={false}>
          <h3 className="font-display text-lg font-extrabold">{c.monthly}</h3>
          <p className="text-muted-foreground mt-1 text-sm">{c.monthlyDesc}</p>
          <Price big={prices ? money(prices.monthly.amount) : "…"} unit={c.perMonth} />
          <Features
            items={student ? [c.chats(student.chat), c.videos(student.video), c.exercises(student.exercise), c.documents(student.documents), c.noAds] : []}
          />
          <div className="mt-auto pt-6">
            {isPaid ? (
              <Button variant="outline" className="w-full" disabled={busy || !sub?.manageable} onClick={manage}>
                {c.manage}
              </Button>
            ) : (
              <Button
                variant="outline"
                className="border-foreground/25 w-full font-semibold"
                disabled={busy || isLoading || beta}
                data-testid="choose-monthly"
                onClick={() => subscribe(prices?.monthly.priceId ?? null)}
              >
                {checkoutMut.isPending && <Loader2 className="size-4 animate-spin" />}
                {beta ? c.atLaunch : c.choose}
              </Button>
            )}
            <p className="text-muted-foreground mt-3 flex items-center justify-center gap-1.5 text-xs">
              <ShieldCheck className="size-3.5" aria-hidden />
              {c.cancelAnytime}
            </p>
          </div>
        </PlanCard>

        {/* Étudiant semestriel — l'offre mise en avant */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="order-1 lg:order-3 lg:-my-3"
          data-testid="plan-semester"
        >
          <div className="relative flex h-full flex-col overflow-hidden rounded-2xl bg-[#0F172A] p-6 text-white shadow-2xl ring-2 ring-[#EAB308] lg:py-9">
            <div aria-hidden className="pointer-events-none absolute -right-20 -top-28 size-72 rounded-full bg-[#EAB308]/25 blur-3xl" />
            <div className="relative flex h-full flex-col">
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EAB308]/40 bg-[#EAB308]/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-[#FACC15]">
                  <Sparkles className="size-3" aria-hidden />
                  {c.bestValue}
                </span>
                {prices && (
                  <span
                    className="rounded-full bg-[#EAB308] px-3 py-1 text-sm font-extrabold text-[#1A1A1A] shadow-[0_6px_20px_-6px_rgba(234,179,8,0.8)]"
                    data-testid="semester-badge"
                  >
                    {prices.semester.badge}
                  </span>
                )}
              </div>
              <h3 className="font-display mt-4 text-lg font-extrabold">{c.semester}</h3>
              <p className="mt-1 text-sm text-white/65">{c.semesterDesc}</p>

              <div className="mt-5">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-5xl font-extrabold tracking-tight tabular-nums">
                    {prices ? money(prices.semester.perMonth) : "…"}
                  </span>
                  <span className="text-sm text-white/60">{c.perMonth}</span>
                </div>
                {prices && (
                  <p className="mt-1.5 text-sm text-white/60 tabular-nums">
                    {c.every6Months(money(prices.semester.amount))}
                    <span className="ml-2 text-white/40 line-through">{money(prices.monthly.amount * prices.semester.months)}</span>
                  </p>
                )}
              </div>

              <ul className="mt-6 space-y-2.5">
                {(student ? [c.chats(student.chat), c.videos(student.video), c.exercises(student.exercise), c.documents(student.documents), c.noAds] : []).map(
                  (f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm">
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#EAB308] text-[#1A1A1A]">
                        <Check className="size-3" aria-hidden />
                      </span>
                      {f}
                    </li>
                  ),
                )}
              </ul>

              <div className="mt-auto pt-7">
                {isPaid ? (
                  <Button className={cn("h-12 w-full", YELLOW_BUTTON)} disabled={busy || !sub?.manageable} onClick={manage}>
                    {portalMut.isPending && <Loader2 className="size-4 animate-spin" />}
                    {c.manage}
                  </Button>
                ) : (
                  <Button
                    className={cn("h-12 w-full gap-2 text-base", beta ? "bg-white/15 font-semibold text-white disabled:opacity-100" : YELLOW_BUTTON)}
                    disabled={busy || isLoading || beta}
                    data-testid="choose-semester"
                    onClick={() => subscribe(prices?.semester.priceId ?? null)}
                  >
                    {checkoutMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                    {beta ? c.atLaunch : c.choose}
                    {!beta && <ArrowRight className="size-4" aria-hidden />}
                  </Button>
                )}
                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-white/55">
                  <ShieldCheck className="size-3.5" aria-hidden />
                  {c.cancelAnytime}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Les deux consentements légaux, une fois, sous les offres payantes. */}
      {!isPaid && !beta && (
        <div ref={consentRef} className="mx-auto mt-6 max-w-2xl">
          <WithdrawalConsent
            start={consentStart}
            lose={consentLose}
            onStart={(v) => {
              setConsentStart(v);
              setConsentError(false);
            }}
            onLose={(v) => {
              setConsentLose(v);
              setConsentError(false);
            }}
            error={consentError}
          />
        </div>
      )}

      {/* ── Crédits à l'unité ───────────────────────────────────────────── */}
      {sub && packAmount > 0 && (
        <Reveal className="mt-8">
          <Card className="p-5" data-testid="credits-offer">
            {/* La carte du thème empile son contenu : la rangée est portée par ce conteneur. */}
            <div className="flex flex-wrap items-center gap-4">
            <span className="bg-signature/15 text-signature grid size-11 shrink-0 place-items-center rounded-xl">
              <Coins className="size-5" aria-hidden />
            </span>
            <div className="min-w-[13rem] flex-1">
              <h2 className="font-display text-base font-bold">{c.creditsTitle}</h2>
              <p className="mt-0.5 text-sm font-medium">
                {c.creditsLine(money(packAmount), Math.floor(packCredits / videoCost), packCredits)}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">{c.creditsNever}</p>
            </div>
            {beta ? (
              <Button variant="outline" className="border-foreground/25 font-semibold" disabled>
                {c.atLaunch}
              </Button>
            ) : pack ? (
              <Button
                variant="outline"
                className="border-foreground/25 gap-2 font-semibold"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  packMut.mutate(pack.priceId);
                }}
              >
                {packMut.isPending && <Loader2 className="size-4 animate-spin" />}
                {c.creditsBuy}
              </Button>
            ) : (
              <Link href="/credits">
                <Button variant="outline" className="border-foreground/25 gap-2 font-semibold">
                  {c.creditsBuy}
                </Button>
              </Link>
            )}
            </div>
          </Card>
        </Reveal>
      )}

      {/* Verbrauch — macht das Limit sichtbar, bevor der Nutzer dagegenläuft. */}
      {sub && (
        <Reveal className="mt-8">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-sm font-bold">{c.usage}</h2>
              {sub.validUntil && (
                <span className="text-muted-foreground text-xs">
                  {c.activeUntil(new Date(sub.validUntil).toLocaleDateString(locale))}
                </span>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {METRICS.map((m) => {
                const used = sub.usage[m] ?? 0;
                const limit = sub.limits[m] ?? 0;
                const pct = sub.unlimited ? 0 : limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
                return (
                  <div key={m}>
                    <div className="mb-1.5 flex items-baseline justify-between text-xs">
                      <span className="text-muted-foreground capitalize">{c.metric[m]}</span>
                      <span className={cn("font-medium tabular-nums", !sub.unlimited && used >= limit && "text-destructive")}>
                        {sub.unlimited ? `${used} · ${c.unlimited}` : `${used} / ${limit}`}
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

      <Reveal className="mt-8 text-center">
        <p className="text-muted-foreground text-xs">{c.payments}: Visa · Mastercard · Apple Pay · Klarna · SEPA</p>
      </Reveal>
    </PageContainer>
  );
}

function PlanCard({
  index,
  current,
  className,
  children,
}: {
  index: number;
  current: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      <Card className={cn("flex h-full flex-col p-6", current && "ring-foreground/20 ring-2")}>{children}</Card>
    </motion.div>
  );
}

function Price({ big, unit }: { big: string; unit?: string }) {
  return (
    <div className="mt-5 flex items-baseline gap-2">
      <span className="font-display text-4xl font-extrabold tracking-tight tabular-nums">{big}</span>
      {unit && <span className="text-muted-foreground text-sm">{unit}</span>}
    </div>
  );
}

function Features({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 space-y-2.5">
      {items.map((f) => (
        <li key={f} className="flex items-center gap-2.5 text-sm">
          <Check className="text-signature size-4 shrink-0" aria-hidden />
          {f}
        </li>
      ))}
    </ul>
  );
}
