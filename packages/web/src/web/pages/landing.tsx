import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ORPCError } from "@orpc/client";
import { AlertCircle, BookOpenCheck, Check, Clock, Loader2, PenTool, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { LegalFooter } from "@/components/legal-footer";
import { WithdrawalConsent } from "@/components/consent";
import { authClient } from "@/lib/auth";
import { client } from "@/lib/api";
import { subscriptionMeOptions } from "@/queries/subscriptions";

/** Affiché aux visiteurs déconnectés. Connecté, le montant vient de Stripe. */
const FALLBACK_PRICE = "9,99 €";

const CONFIG_ERROR =
  "Le système de paiement est en cours de configuration, merci de réessayer plus tard.";
const GENERIC_ERROR = "Le paiement n'a pas pu démarrer. Réessaie dans quelques minutes.";

const BENEFITS = [
  {
    icon: BookOpenCheck,
    title: "Zéro hallucination",
    text: "TRED répond à partir de TON polycopié, pas d'Internet. Chaque réponse cite la page du cours d'où elle vient.",
  },
  {
    icon: PenTool,
    title: "Schéma parfait",
    text: "Diagrammes N, T et M tracés par un solveur RDM, pas dessinés au hasard par un modèle de langage.",
  },
  {
    icon: Clock,
    title: "Gain de temps",
    text: "Fini les deux heures à chercher où ChatGPT s'est trompé de signe. Tu vérifies ta méthode en quelques minutes.",
  },
] as const;

/** Section « Rejoignez les premiers étudiants » : ce qui est vrai dès le jour 1. */
const FEATURE_BADGES = [
  "Zéro hallucination",
  "Schémas parfaits",
  "Gain de temps",
  "Ton propre polycopié",
  "Diagrammes N, T, M exacts",
  "Disponible 24 h/24",
] as const;

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(cents / 100);
}

export default function LandingPage() {
  const [, navigate] = useLocation();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const loggedIn = !!session;

  // Tarif et priceId lus côté serveur (source de vérité Stripe). Seulement si
  // connecté : la procédure est `authed`.
  const { data: sub, isLoading: subLoading } = useQuery({
    ...subscriptionMeOptions(),
    enabled: loggedIn,
  });
  const monthly = sub?.offers.find((o) => o.interval === "monthly");
  const isPaid = !!sub && sub.plan !== "free";
  const trialAvailable = !!sub && sub.trialDays > 0 && !sub.trialUsed;
  const price = monthly ? money(monthly.amount, monthly.currency) : FALLBACK_PRICE;

  const [error, setError] = useState<string | null>(null);
  // § 356 Abs. 5 BGB : deux cases distinctes, jamais précochées (cf. pricing.tsx).
  const [consentStart, setConsentStart] = useState(false);
  const [consentLose, setConsentLose] = useState(false);
  const [consentError, setConsentError] = useState(false);

  const checkout = useMutation({
    mutationFn: (priceId: string) => client.subscriptions.createCheckout({ priceId }),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: (err) => {
      const unavailable = err instanceof ORPCError && err.status === 503;
      setError(unavailable ? CONFIG_ERROR : GENERIC_ERROR);
    },
  });

  const busy = sessionPending || (loggedIn && subLoading) || checkout.isPending;

  function onCta() {
    setError(null);

    if (!loggedIn) {
      navigate("/login?redirect=/landing");
      return;
    }
    if (isPaid) {
      navigate("/dashboard");
      return;
    }
    // Pas de prix lisible chez Stripe (clé ou STRIPE_PRICE_PRO_MONTHLY absente).
    if (!monthly) {
      setError(CONFIG_ERROR);
      return;
    }
    if (!(consentStart && consentLose)) {
      setConsentError(true);
      return;
    }
    checkout.mutate(monthly.priceId);
  }

  const ctaLabel = isPaid
    ? "Tu es déjà Pro, ouvrir TRED"
    : `Débloquer mon accès Pro — ${price}/mois`;

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#1A1A1A]">
      {/* ── En-tête ───────────────────────────────────────────────────── */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <button
          type="button"
          onClick={() => navigate(loggedIn ? "/dashboard" : "/login?redirect=/landing")}
          className="rounded-full border border-[#E7E2D8] bg-white px-4 py-2 text-sm font-medium text-[#1A1A1A] transition-colors hover:border-[#1A1A1A]"
        >
          {loggedIn ? "Ouvrir l'app" : "Se connecter"}
        </button>
      </header>

      <main>
        {/* ── Hero ────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-4xl px-4 pt-12 pb-16 text-center sm:px-6 sm:pt-20">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#E7E2D8] bg-white px-3 py-1 text-xs font-medium text-[#6B6B6B]">
            <span className="size-1.5 rounded-full bg-[#EAB308]" />
            Résistance des matériaux · Technische Mechanik
          </p>

          <h1 className="font-display text-4xl leading-tight font-semibold tracking-tight text-[#1A1A1A] sm:text-5xl md:text-6xl">
            Ne rate plus ton partiel de RDM à cause d'une{" "}
            <span className="bg-[linear-gradient(transparent_58%,#EAB30866_58%)] px-1">
              erreur de ChatGPT
            </span>
            .
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-[#3A3A3A] sm:text-xl">
            Le premier tuteur IA qui lit ton propre polycopié et trace les diagrammes d'efforts
            exacts.
          </p>
          <p className="mt-3 text-sm font-medium text-[#6B6B6B]">
            Conçu pour les étudiants en ingénierie en Allemagne.
          </p>

          <CtaBlock
            label={ctaLabel}
            busy={busy}
            onClick={onCta}
            error={error}
            showConsent={loggedIn && !isPaid && !!monthly}
            consent={{
              start: consentStart,
              lose: consentLose,
              onStart: (v) => {
                setConsentStart(v);
                setConsentError(false);
              },
              onLose: (v) => {
                setConsentLose(v);
                setConsentError(false);
              },
              error: consentError,
            }}
            note={
              isPaid
                ? null
                : trialAvailable
                  ? `${sub?.trialDays} jours d'essai gratuit, puis ${price}/mois. Résiliable à tout moment.`
                  : "Sans engagement. Résiliable à tout moment."
            }
          />
        </section>

        {/* ── Bénéfices ───────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="grid gap-5 md:grid-cols-3">
            {BENEFITS.map(({ icon: Icon, title, text }) => (
              <article
                key={title}
                className="rounded-2xl border border-[#E7E2D8] bg-white p-6 shadow-[0_1px_2px_rgb(26_26_26/0.04),0_8px_24px_-12px_rgb(26_26_26/0.10)] transition-colors hover:border-[#EAB308]"
              >
                <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-[#FBF3D6] text-[#1A1A1A]">
                  <Icon className="size-5" />
                </div>
                <h2 className="font-display text-xl font-semibold text-[#1A1A1A]">{title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#5A5A5A]">{text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── Premiers étudiants ──────────────────────────────────────────
            Pas de témoignage tant qu'aucun vrai retour n'existe : un avis
            inventé est interdit dans l'UE (directive Omnibus, § 5b UWG). */}
        <section className="mx-auto max-w-3xl px-4 pb-24 text-center sm:px-6">
          <div className="rounded-3xl border border-[#E7E2D8] bg-white px-6 py-10 sm:px-10">
            <h2 className="font-display text-3xl font-semibold text-[#1A1A1A] sm:text-4xl">
              Rejoignez les premiers étudiants
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[#5A5A5A]">
              TRED ouvre ses portes avant les partiels. Ce que tu obtiens dès le premier jour :
            </p>
            <ul className="mt-6 flex flex-wrap justify-center gap-2.5">
              {FEATURE_BADGES.map((label) => (
                <li
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E2D8] bg-[#FDFBF7] px-3.5 py-1.5 text-sm font-medium text-[#1A1A1A]"
                >
                  <Check className="size-3.5 text-[#1A1A1A]" aria-hidden />
                  {label}
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <button
                type="button"
                onClick={onCta}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#1A1A1A] px-6 py-3 text-sm font-semibold text-[#FDFBF7] transition hover:bg-[#333] disabled:opacity-70"
              >
                {ctaLabel}
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#E7E2D8] py-8">
        <LegalFooter className="text-[#6B6B6B]" />
      </footer>
    </div>
  );
}

function CtaBlock({
  label,
  busy,
  onClick,
  error,
  showConsent,
  consent,
  note,
}: {
  label: string;
  busy: boolean;
  onClick: () => void;
  error: string | null;
  showConsent: boolean;
  consent: {
    start: boolean;
    lose: boolean;
    onStart: (v: boolean) => void;
    onLose: (v: boolean) => void;
    error: boolean;
  };
  note: string | null;
}) {
  return (
    <div className="mx-auto mt-10 max-w-md">
      {showConsent && (
        <div className="mb-4 text-left">
          <WithdrawalConsent {...consent} />
        </div>
      )}

      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#EAB308] px-6 py-4 text-base font-semibold text-[#1A1A1A] shadow-[0_10px_30px_-12px_rgb(234_179_8/0.6)] transition hover:bg-[#d9a406] focus-visible:ring-4 focus-visible:ring-[#1A1A1A]/40 focus-visible:outline-none disabled:cursor-wait disabled:opacity-70"
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        {label}
      </button>

      {error && (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl border border-[#B3261E]/30 bg-[#B3261E]/5 p-3 text-left text-sm text-[#B3261E]"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      {note && (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-[#6B6B6B]">
          <ShieldCheck className="size-3.5" />
          {note}
        </p>
      )}
    </div>
  );
}
