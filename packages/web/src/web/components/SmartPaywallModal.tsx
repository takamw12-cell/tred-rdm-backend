import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Coins, Loader2, PlayCircle, Sparkles, X } from "lucide-react";
import { RewardedAdModal, useRewardedAvailable } from "@/components/RewardedAdModal";
import { useAdPlan } from "@/lib/use-ads";
import { adsAllowed } from "@/lib/ad-mediation";
import { track } from "@/lib/analytics";
import { client } from "@/lib/api";
import { formatMoney, pricingCopy, resolvePrices, type PaywallMetric } from "@/lib/pricing-copy";
import { creditsMeKey, creditsMeOptions } from "@/queries/credits";
import { subscriptionMeKey, subscriptionMeOptions } from "@/queries/subscriptions";
import { useLocaleStore } from "@/stores/locale";
import { useToastStore } from "@/stores/toast";

/**
 * La fenêtre de limite — ce que voit l'étudiant quand un compteur est
 * atteint, AU LIEU d'un simple refus. Elle dit QUEL compteur (vidéos, chats,
 * exercices) et propose, dans cet ordre :
 *
 *   A. l'essai de 14 jours illimités, s'il n'a jamais été utilisé (gratuit,
 *      sans carte) — sinon l'abonnement Étudiant (/pricing → Stripe) ;
 *   B. des crédits à l'unité : achat direct du paquet, sans abonnement ;
 *   C. une vidéo publicitaire contre un crédit, quand le serveur la propose.
 *
 * Un abonné dont le mois est épuisé ne voit que les crédits (B).
 * Rien ne s'affiche tant que l'étudiant n'est pas bloqué.
 *
 * Charte : panneau encre/navy, halo jaune, bouton principal jaune #EAB308.
 */
export function SmartPaywallModal({
  open,
  onClose,
  onUnlocked,
  offer,
  metric = "chat",
  used,
  limit,
}: {
  open: boolean;
  onClose: () => void;
  /** Appelé après un déblocage (essai lancé, crédit reçu) : le parent relance l'action. */
  onUnlocked: () => void;
  /** La vidéo publicitaire proposée par le serveur (corps du 402), ou null. */
  offer: { seconds: number; credits: number } | null;
  /** Le compteur atteint. */
  metric?: PaywallMetric;
  used?: number;
  limit?: number;
}) {
  const locale = useLocaleStore((s) => s.locale);
  const c = pricingCopy(locale);
  const qc = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const plan = useAdPlan();
  const { available } = useRewardedAvailable();
  const [watching, setWatching] = useState(false);
  // Crédit reçu : on laisse l'étudiant lire « +1 Credit », l'action repart
  // quand il ferme la confirmation.
  const [earned, setEarned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: sub } = useQuery({ ...subscriptionMeOptions(), enabled: open });
  const { data: credits } = useQuery({ ...creditsMeOptions(), enabled: open });

  useEffect(() => {
    if (open) track("paywall_view", { metric });
  }, [open, metric]);

  const startTrial = useMutation({
    mutationFn: () => client.subscriptions.startTrial(),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: subscriptionMeKey() });
      void qc.invalidateQueries({ queryKey: creditsMeKey() });
      if (res.active) {
        toast(c.trialStarted(res.daysLeft));
        onUnlocked();
      } else {
        setError(c.trialError);
      }
    },
    onError: () => setError(c.trialError),
  });

  const buyPack = useMutation({
    mutationFn: (priceId: string) => client.credits.purchase({ priceId }),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: () => setError(c.checkoutError),
  });

  const isFree = plan === null || plan === "free";
  const trialAvailable = isFree && !!sub?.trial.available;
  const prices = sub ? resolvePrices(sub.pricing, sub.offers) : null;
  const money = (cents: number) => formatMoney(cents, prices?.currency ?? "EUR", locale);
  const student = sub?.limitsByPlan.student;

  // Le paquet de crédits : celui de Stripe s'il est configuré, sinon la grille.
  const pack = credits?.packs?.[0] ?? null;
  const packAmount = pack?.amount ?? sub?.pricing.creditPack.amount ?? 0;
  const packCredits = pack?.credits ?? sub?.pricing.creditPack.credits ?? 0;
  const videoCost = sub?.creditCost.video ?? 10;
  const showVideo = offer !== null && available && adsAllowed({ surface: "paywall", format: "rewarded", plan });
  const busy = startTrial.isPending || buyPack.isPending;

  if (typeof document === "undefined") return null;

  return (
    <>
      {createPortal(
        <AnimatePresence>
          {open && !watching && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              />
              <div className="pointer-events-none fixed inset-0 z-50 grid place-items-end p-0 sm:place-items-center sm:p-4">
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="paywall-title"
                  data-testid="paywall-modal"
                  initial={{ opacity: 0, y: 24, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 24, scale: 0.98 }}
                  transition={{ type: "spring", damping: 26, stiffness: 300 }}
                  className="pointer-events-auto relative max-h-[92dvh] w-full max-w-md overflow-y-auto overflow-x-hidden rounded-t-3xl border border-white/10 bg-[#0F172A] p-6 text-white shadow-2xl sm:rounded-3xl sm:p-7"
                >
                  {/* Halo jaune : la seule décoration, et elle porte la marque. */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -top-28 left-1/2 size-72 -translate-x-1/2 rounded-full bg-[#EAB308]/25 blur-3xl"
                  />
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label={c.wallLater}
                    className="absolute right-4 top-4 grid size-8 place-items-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <X className="size-4" />
                  </button>

                  <div className="relative">
                    {typeof used === "number" && typeof limit === "number" && limit > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EAB308]/40 bg-[#EAB308]/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-[#FACC15] tabular-nums">
                        <Sparkles className="size-3" aria-hidden />
                        {c.wallUsed(Math.min(used, limit), limit, metric)}
                      </span>
                    )}
                    <h2 id="paywall-title" className="font-display mt-3 pr-8 text-2xl font-extrabold leading-tight tracking-tight">
                      {c.wallTitle(metric)}
                    </h2>
                    <p className="mt-2 text-sm text-white/70">{isFree ? c.wallBody : c.wallPaidBody}</p>

                    {/* L'offre mise en avant : le semestriel, ramené au mois. */}
                    {isFree && prices && student && (
                      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold">{c.semester}</span>
                          <span className="rounded-full bg-[#EAB308] px-2 py-0.5 text-[11px] font-extrabold text-[#1A1A1A]">
                            {prices.semester.badge}
                          </span>
                        </div>
                        <div className="mt-2 flex items-baseline gap-1.5">
                          <span className="font-display text-3xl font-extrabold tracking-tight tabular-nums">
                            {money(prices.semester.perMonth)}
                          </span>
                          <span className="text-sm text-white/60">{c.perMonth}</span>
                          <span className="ml-1 text-xs text-white/40 line-through tabular-nums">{money(prices.monthly.amount)}</span>
                        </div>
                        <ul className="mt-3 space-y-1.5 text-[13px] text-white/80">
                          {[c.chats(student.chat), c.videos(student.video), c.exercises(student.exercise)].map((line) => (
                            <li key={line} className="flex items-center gap-2">
                              <Check className="size-3.5 shrink-0 text-[#EAB308]" aria-hidden />
                              {line}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="mt-5 space-y-2.5">
                      {/* A. Essai gratuit s'il existe encore, sinon l'abonnement. */}
                      {trialAvailable && sub ? (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            data-testid="paywall-primary"
                            onClick={() => {
                              setError(null);
                              track("paywall_choice", { choice: "trial", metric });
                              startTrial.mutate();
                            }}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#EAB308] px-4 py-3.5 text-[15px] font-bold text-[#1A1A1A] shadow-[0_8px_30px_-8px_rgba(234,179,8,0.6)] transition-transform hover:brightness-105 active:scale-[0.99] disabled:opacity-70"
                          >
                            {startTrial.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" aria-hidden />}
                            {c.wallTrial(sub.trial.days)}
                          </button>
                          <p className="text-center text-xs text-white/50">{c.wallTrialSub}</p>
                          {prices && (
                            <Link
                              href="/pricing"
                              onClick={() => {
                                track("paywall_choice", { choice: "premium", metric });
                                onClose();
                              }}
                              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                            >
                              {c.wallStudent(money(prices.semester.perMonth))}
                              <ArrowRight className="size-4" aria-hidden />
                            </Link>
                          )}
                        </>
                      ) : (
                        isFree && (
                          <Link
                            href="/pricing"
                            data-testid="paywall-primary"
                            onClick={() => {
                              track("paywall_choice", { choice: "premium", metric });
                              onClose();
                            }}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#EAB308] px-4 py-3.5 text-[15px] font-bold text-[#1A1A1A] shadow-[0_8px_30px_-8px_rgba(234,179,8,0.6)] transition-transform hover:brightness-105 active:scale-[0.99]"
                          >
                            {prices ? c.wallStudent(money(prices.semester.perMonth)) : c.choose}
                            <ArrowRight className="size-4" aria-hidden />
                          </Link>
                        )
                      )}

                      {/* B. Crédits à l'unité. Les documents ne se paient pas en crédits. */}
                      {metric !== "documents" && packAmount > 0 && (
                        <CreditsChoice
                          primary={!isFree}
                          busy={busy}
                          loading={buyPack.isPending}
                          label={c.wallCredits(money(packAmount))}
                          sub={c.wallCreditsSub(Math.floor(packCredits / videoCost), packCredits)}
                          href={pack ? null : "/credits"}
                          onClose={onClose}
                          onBuy={() => {
                            setError(null);
                            track("paywall_choice", { choice: "packs", metric });
                            if (pack) buyPack.mutate(pack.priceId);
                          }}
                        />
                      )}

                      {/* C. Vidéo publicitaire contre un crédit. */}
                      {showVideo && (
                        <button
                          type="button"
                          onClick={() => {
                            track("paywall_choice", { choice: "rewarded", metric });
                            setWatching(true);
                          }}
                          className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
                        >
                          <PlayCircle className="size-4 text-[#EAB308]" aria-hidden />
                          {c.wallWatch(offer?.credits ?? 1)}
                        </button>
                      )}
                    </div>

                    {error && <p className="mt-3 text-center text-sm text-red-300">{error}</p>}
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}

      <RewardedAdModal
        open={open && watching}
        onClose={() => {
          setWatching(false);
          if (earned) {
            setEarned(false);
            onUnlocked();
          }
        }}
        onRewarded={() => setEarned(true)}
      />
    </>
  );
}

/** Le choix « crédits » : bouton d'achat direct, ou lien vers /credits si aucun paquet n'est configuré. */
function CreditsChoice({
  primary,
  busy,
  loading,
  label,
  sub,
  href,
  onBuy,
  onClose,
}: {
  primary: boolean;
  busy: boolean;
  loading: boolean;
  label: string;
  sub: string;
  href: string | null;
  onBuy: () => void;
  onClose: () => void;
}) {
  const cls = primary
    ? "flex w-full items-center gap-3 rounded-xl bg-[#EAB308] px-4 py-3 text-left text-[#1A1A1A] shadow-[0_8px_30px_-8px_rgba(234,179,8,0.6)] transition-transform hover:brightness-105 active:scale-[0.99] disabled:opacity-70"
    : "flex w-full items-center gap-3 rounded-xl border border-white/15 px-4 py-3 text-left text-white transition-colors hover:bg-white/10 disabled:opacity-70";
  const inner = (
    <>
      {loading ? (
        <Loader2 className="size-5 shrink-0 animate-spin" />
      ) : (
        <Coins className={primary ? "size-5 shrink-0" : "size-5 shrink-0 text-[#EAB308]"} aria-hidden />
      )}
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className={primary ? "block text-xs opacity-75" : "block text-xs text-white/55"}>{sub}</span>
      </span>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        onClick={() => {
          onBuy();
          onClose();
        }}
        className={cls}
        data-testid="paywall-credits"
      >
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" disabled={busy} onClick={onBuy} className={cls} data-testid="paywall-credits">
      {inner}
    </button>
  );
}
