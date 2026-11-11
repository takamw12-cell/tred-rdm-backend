import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Clapperboard, GraduationCap, MessageSquareText, PenLine, ShieldCheck, Sparkles, Upload } from "lucide-react";
import katex from "katex";
import { Logo } from "@/components/logo";
import { LegalFooter } from "@/components/legal-footer";
import { LanguageSwitcher } from "@/components/language-switcher";
import { PaperNote, SolverStamp } from "@/components/hoersaal";
import { authClient } from "@/lib/auth";
import { useT } from "@/i18n";

/**
 * Page d'accueil des visiteurs (`/` et `/landing`) — refonte du 11 nov. 2026.
 *
 * Décisions du fondateur :
 *  - AUCUN prix ici : TRED est en bêta, l'accès est gratuit. Les tarifs restent
 *    sur /pricing, dans l'app.
 *  - Aucune comparaison avec un autre assistant, et la mécanique s'appelle
 *    « Technische Mechanik » (DE) / « Engineering Mechanics » (EN, FR).
 *  - Quatre arguments : le Hörsaal (tableau), les solveurs déterministes
 *    (zéro hallucination), les vidéos explicatives, toutes les matières.
 *
 * Pas de témoignage ni de chiffre d'usage : rien d'inventé (directive Omnibus,
 * § 5b UWG). L'aperçu du tableau est fait des vrais composants du Hörsaal.
 *
 * Salle sombre, verre dépoli, accent jaune : le langage du Dashboard. Les
 * sections apparaissent en fondu au défilement (framer-motion), sauf pour un
 * visiteur qui a réduit les animations et pour le pré-rendu SEO, qui doit
 * figer une page entièrement visible.
 */

const YELLOW = "#EAB308";

/** Navigateur piloté (pré-rendu, robots) : la page est rendue visible d'emblée. */
const automated = () => typeof navigator !== "undefined" && navigator.webdriver === true;

/** Apparition en fondu quand le bloc entre dans l'écran. */
function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce || automated()) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-70px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

const glass = "rounded-3xl border border-white/12 bg-white/[0.07] shadow-[0_30px_80px_-40px_rgb(0_0_0/0.9)] backdrop-blur-xl";
const primaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-full bg-[#EAB308] font-semibold text-[#0F172A] shadow-[0_14px_36px_-14px_rgb(234_179_8/0.75)] transition hover:bg-[#FACC15] focus-visible:ring-4 focus-visible:ring-[#EAB308]/40 focus-visible:outline-none";
const ghostBtn =
  "inline-flex items-center justify-center gap-2 rounded-full border border-white/25 bg-white/5 font-semibold text-white transition hover:border-white/60 hover:bg-white/10 focus-visible:ring-4 focus-visible:ring-white/30 focus-visible:outline-none";

const FORMULA = katex.renderToString(String.raw`A = B = \frac{q\,l}{2} = 4\,\mathrm{kN}`, { displayMode: true, throwOnError: false });

/** L'aperçu du tableau : une vraie feuille du Hörsaal, avec le tampon du solveur. */
function BoardPreview() {
  const { t } = useT();
  return (
    <div className={`${glass} relative mx-auto w-full max-w-xl p-3 sm:p-4`} aria-hidden>
      <div className="rounded-2xl bg-[linear-gradient(180deg,#F8FAFC,#E9EEF5)] p-4 sm:p-6" style={{ ["--board-ink" as string]: "#1B2A4A", ["--board-muted" as string]: "#64748B", ["--board-stamp" as string]: "#1D4ED8" }}>
        <p className="truncate font-mono text-[10px] tracking-[0.16em] text-[#64748B] uppercase">{t("landing.boardEyebrow")}</p>
        <p className="font-hand mt-1 mb-5 text-3xl leading-none font-bold text-[#1B2A4A] sm:text-4xl">{t("landing.boardTitle")}</p>
        <PaperNote title={t("landing.boardNote")} highlight stamp={<SolverStamp label={t("explainer.solver1")} sublabel={t("explainer.solver2")} />}>
          <p className="font-hand text-xl">{t("landing.boardGiven")}</p>
          <div className="[&_.katex-display]:my-2" dangerouslySetInnerHTML={{ __html: FORMULA }} />
        </PaperNote>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { t } = useT();
  const [location, navigate] = useLocation();
  // Servie sur `/` et sur /landing ; dans les deux cas l'inscription mène au Dashboard.
  const loginPath = location === "/" ? "/login" : "/login?redirect=/dashboard";
  const signupPath = location === "/" ? "/login?mode=signup" : "/login?mode=signup&redirect=/dashboard";
  const { data: session } = authClient.useSession();
  const loggedIn = !!session;

  const start = () => navigate(loggedIn ? "/dashboard" : signupPath);
  const login = () => navigate(loggedIn ? "/dashboard" : loginPath);
  const startLabel = loggedIn ? t("landing.openApp") : t("landing.cta");

  const features = [
    { icon: PenLine, title: t("landing.f1Title"), text: t("landing.f1Text") },
    { icon: ShieldCheck, title: t("landing.f2Title"), text: t("landing.f2Text") },
    { icon: Clapperboard, title: t("landing.f3Title"), text: t("landing.f3Text") },
    { icon: GraduationCap, title: t("landing.f4Title"), text: t("landing.f4Text") },
  ];
  const steps = [
    { icon: Upload, title: t("landing.s1Title"), text: t("landing.s1Text") },
    { icon: MessageSquareText, title: t("landing.s2Title"), text: t("landing.s2Text") },
    { icon: Sparkles, title: t("landing.s3Title"), text: t("landing.s3Text") },
  ];
  const points = [t("landing.p1"), t("landing.p2"), t("landing.p3"), t("landing.p4")];

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[#070B14] text-white">
      {/* La salle : une photo de filière sous un voile sombre, fixe derrière la page. */}
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 hidden bg-[url('/backgrounds/general/bg-01.webp')] bg-cover bg-center sm:block" />
        <div className="absolute inset-0 bg-[url('/backgrounds/general/bg-01-p.webp')] bg-cover bg-center sm:hidden" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(7_11_20/0.86),rgb(7_11_20/0.72)_40%,rgb(7_11_20/0.94))]" />
        <div className="absolute inset-x-0 top-0 h-[70vh] bg-[radial-gradient(ellipse_60%_55%_at_50%_0%,rgb(234_179_8/0.16),transparent_70%)]" />
      </div>

      {/* ── En-tête collant : l'inscription reste toujours à portée ─────── */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070B14]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Logo markClassName="h-8 text-white" className="text-white" />
          <div className="flex items-center gap-2">
            <span className="hidden sm:block [&_select]:border-white/20 [&_select]:bg-white/10 [&_select]:text-white">
              <LanguageSwitcher />
            </span>
            {!loggedIn && (
              <button type="button" onClick={login} className={`${ghostBtn} hidden px-4 py-2 text-sm min-[420px]:inline-flex`}>
                {t("landing.login")}
              </button>
            )}
            <button type="button" onClick={start} className={`${primaryBtn} px-4 py-2 text-sm`}>
              {startLabel}
            </button>
          </div>
        </div>
      </header>

      <main className="relative">
        {/* ── Hero ────────────────────────────────────────────────────── */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-12 pb-16 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:pb-24">
          <Reveal className="text-center lg:text-left">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#EAB308]/40 bg-[#EAB308]/10 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-[#FDE68A]">
              <span className="size-1.5 rounded-full" style={{ background: YELLOW }} />
              {t("landing.beta")}
            </p>
            <h1 className="font-display text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl md:text-6xl">
              {t("landing.title1")}
              <br />
              <span className="bg-[linear-gradient(transparent_62%,rgb(234_179_8/0.55)_62%)] px-1">{t("landing.title2")}</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-200 sm:text-xl lg:mx-0">{t("landing.sub")}</p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <button type="button" onClick={start} className={`${primaryBtn} w-full px-7 py-4 text-base sm:w-auto`}>
                {startLabel}
                <ArrowRight className="size-4" aria-hidden />
              </button>
              {!loggedIn && (
                <button type="button" onClick={login} className={`${ghostBtn} w-full px-7 py-4 text-base sm:w-auto`}>
                  {t("landing.login")}
                </button>
              )}
            </div>
            <p className="mt-4 text-sm text-slate-300">{t("landing.note")}</p>
            <p className="mt-2 text-xs font-medium tracking-wide text-slate-400 uppercase">{t("landing.fields")}</p>
          </Reveal>
          <Reveal delay={0.12}>
            <BoardPreview />
          </Reveal>
        </section>

        {/* ── Ce que TRED fait autrement ──────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <Reveal>
            <h2 className="font-display mb-8 text-center text-3xl font-semibold sm:text-4xl">{t("landing.featuresTitle")}</h2>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, text }, i) => (
              <Reveal key={title} delay={i * 0.07} className="h-full">
                <article className={`${glass} h-full p-6 transition-colors hover:border-[#EAB308]/60`}>
                  <div className="mb-4 grid size-11 place-items-center rounded-2xl bg-[#EAB308] text-[#0F172A]">
                    <Icon className="size-5" aria-hidden />
                  </div>
                  <h3 className="font-display text-xl font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-200">{text}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Comment ça marche ───────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <Reveal>
            <h2 className="font-display mb-8 text-center text-3xl font-semibold sm:text-4xl">{t("landing.howTitle")}</h2>
          </Reveal>
          <ol className="grid gap-4 md:grid-cols-3">
            {steps.map(({ icon: Icon, title, text }, i) => (
              <Reveal key={title} delay={i * 0.09} className="h-full">
                <li className={`${glass} relative h-full p-6`}>
                  <div className="mb-4 flex items-center gap-3">
                    <span className="font-display grid size-10 place-items-center rounded-full border-2 border-[#EAB308] text-lg font-bold text-[#FDE68A]">{i + 1}</span>
                    <Icon className="size-5 text-slate-300" aria-hidden />
                  </div>
                  <h3 className="font-display text-xl font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-200">{text}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* ── Pourquoi maintenant : la bêta ───────────────────────────────
            Pas de témoignage ni de nombre d'utilisateurs : rien d'inventé. */}
        <section className="mx-auto max-w-4xl px-4 pb-24 sm:px-6">
          <Reveal>
            <div className={`${glass} px-6 py-10 text-center sm:px-12 sm:py-12`}>
              <p className="mb-3 text-xs font-semibold tracking-[0.18em] text-[#FDE68A] uppercase">{t("landing.whyKicker")}</p>
              <h2 className="font-display text-3xl font-semibold sm:text-4xl">{t("landing.whyTitle")}</h2>
              <p className="mx-auto mt-4 max-w-xl text-slate-200">{t("landing.whyText")}</p>
              <ul className="mx-auto mt-7 grid max-w-2xl gap-2.5 text-left sm:grid-cols-2">
                {points.map((label) => (
                  <li key={label} className="flex items-start gap-2.5 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium">
                    <Check className="mt-0.5 size-4 shrink-0 text-[#EAB308]" aria-hidden />
                    {label}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={start} className={`${primaryBtn} mt-8 px-7 py-4 text-base`}>
                {startLabel}
                <ArrowRight className="size-4" aria-hidden />
              </button>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="relative border-t border-white/10 py-8">
        <LegalFooter className="text-slate-400" />
      </footer>
    </div>
  );
}
