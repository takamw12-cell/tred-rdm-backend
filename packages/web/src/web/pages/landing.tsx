import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ORPCError } from "@orpc/client";
import { AlertCircle, BookOpenCheck, Clock, Loader2, PenTool, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { LegalFooter } from "@/components/legal-footer";
import { WithdrawalConsent } from "@/components/consent";
import { authClient } from "@/lib/auth";
import { client } from "@/lib/api";
import { subscriptionMeOptions } from "@/queries/subscriptions";

/* -------------------------------------------------------------------------- */
/* ⚠️  EXEMPLE TEMPORAIRE — À REMPLACER AVANT LA MISE EN LIGNE                 */
/* -------------------------------------------------------------------------- */
/*
 * Ce témoignage est INVENTÉ. Le publier tel quel serait un faux avis, interdit
 * dans l'UE (directive Omnibus 2019/2161, annexe I UCPD, § 5b UWG). Remplace
 * `quote`, `author` et `context` par le vrai retour d'un camarade (avec son
 * accord écrit), puis passe `isPlaceholder` à `false`.
 * Tant que `isPlaceholder` vaut `true`, la carte affiche un bandeau « Exemple ».
 */
const PLACEHOLDER_TESTIMONIAL = {
  isPlaceholder: true,
  quote:
    "Texte d'exemple : remplace-moi par le vrai retour d'un étudiant qui a testé TRED avant le partiel de RDM.",
  author: "Prénom N.",
  context: "Early Tester · Maschinenbau, FH Aachen",
} as const;

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
    <div className="min-h-screen bg-[#0f172a] text-slate-100">
      {/* ── En-tête ───────────────────────────────────────────────────── */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <button
          type="button"
          onClick={() => navigate(loggedIn ? "/dashboard" : "/login?redirect=/landing")}
          className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white"
        >
          {loggedIn ? "Ouvrir l'app" : "Se connecter"}
        </button>
      </header>

      <main>
        {/* ── Hero ────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-4xl px-4 pt-12 pb-16 text-center sm:px-6 sm:pt-20">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#3fbfa8]/30 bg-[#3fbfa8]/10 px-3 py-1 text-xs font-medium text-[#3fbfa8]">
            <span className="size-1.5 rounded-full bg-[#ffc93c]" />
            Résistance des matériaux · Technische Mechanik
          </p>

          <h1 className="font-display text-4xl leading-tight font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
            Ne rate plus ton partiel de RDM à cause d'une{" "}
            <span className="bg-[linear-gradient(transparent_60%,#ffc93c66_60%)] px-1">
              erreur de ChatGPT
            </span>
            .
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-300 sm:text-xl">
            Le premier tuteur IA qui lit ton propre polycopié et trace les diagrammes d'efforts
            exacts.
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
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-[#3fbfa8]/40"
              >
                <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-[#3fbfa8]/15 text-[#3fbfa8]">
                  <Icon className="size-5" />
                </div>
                <h2 className="font-display text-lg font-bold text-white">{title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── Témoignage ──────────────────────────────────────────────── */}
        <section className="mx-auto max-w-3xl px-4 pb-24 sm:px-6">
          <figure className="relative rounded-2xl border border-[#ffc93c]/25 bg-[#ffc93c]/[0.04] p-8">
            {PLACEHOLDER_TESTIMONIAL.isPlaceholder && (
              <span className="absolute -top-3 left-6 rounded-md bg-red-500 px-2 py-0.5 text-[11px] font-bold tracking-wide text-white uppercase">
                Exemple — témoignage à remplacer
              </span>
            )}
            <blockquote className="text-lg leading-relaxed text-slate-200">
              « {PLACEHOLDER_TESTIMONIAL.quote} »
            </blockquote>
            <figcaption className="mt-5 flex items-center gap-3 text-sm">
              <span className="font-semibold text-white">{PLACEHOLDER_TESTIMONIAL.author}</span>
              <span className="rounded-full bg-[#3fbfa8]/15 px-2 py-0.5 text-xs font-medium text-[#3fbfa8]">
                {PLACEHOLDER_TESTIMONIAL.context}
              </span>
            </figcaption>
          </figure>
        </section>
      </main>

      <footer className="border-t border-white/10 py-8">
        <LegalFooter className="text-slate-500" />
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
        // `dark` force les tokens sombres du design system, quel que soit le
        // thème choisi dans l'app : la landing est toujours sombre.
        <div className="dark mb-4 text-left">
          <WithdrawalConsent {...consent} />
        </div>
      )}

      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#3fbfa8] px-6 py-4 text-base font-bold text-[#0f172a] shadow-lg shadow-[#3fbfa8]/20 transition hover:bg-[#5fd4bf] focus-visible:ring-4 focus-visible:ring-[#ffc93c]/60 focus-visible:outline-none disabled:cursor-wait disabled:opacity-70"
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        {label}
      </button>

      {error && (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-left text-sm text-red-200"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      {note && (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="size-3.5" />
          {note}
        </p>
      )}
    </div>
  );
}
