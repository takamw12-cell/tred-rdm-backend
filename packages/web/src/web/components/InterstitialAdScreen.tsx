import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { CheckCircle2, X } from "lucide-react";
import { useUserStore } from "@/stores/user";
import { useAdStore, type InterstitialReason } from "@/stores/ads";
import { adsAllowed, INTERSTITIAL_RULES, isWorkRoute, targetingFor } from "@/lib/ad-mediation";
import { AD_CONFIG, trackAd, webNetwork } from "@/lib/ad-runtime";
import { useAdCopy, useAdImpression, useAdPlan } from "@/lib/use-ads";
import { AdSenseUnit } from "@/components/adsense-unit";
import { SponsorTile } from "@/components/NativeAdSlot";

/**
 * « Fin de session » — l'écran plein qui suit un examen rendu ou une longue
 * conversation QUITTÉE. Jamais pendant le travail : il ne s'ouvre que sur une
 * page qui n'est pas une surface de travail (voir InterstitialHost).
 * Bouton Fermer après 5 s ; Échap aussi, mais seulement à partir de là.
 */
export function InterstitialAdScreen({ reason, onClose }: { reason: InterstitialReason; onClose: () => void }) {
  const c = useAdCopy();
  const program = useUserStore((s) => s.profile.degree);
  const sponsor = targetingFor(program);
  const [left, setLeft] = useState(Math.ceil(INTERSTITIAL_RULES.closeAfterMs / 1000));
  const [adsenseFailed, setAdsenseFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const network = webNetwork("interstitial") === "adsense" && !adsenseFailed ? "adsense" : "house";
  useAdImpression(boxRef, { network, format: "interstitial", surface: "session_end", sponsor: network === "house" ? sponsor.id : undefined });
  const onAdsenseError = useCallback(() => setAdsenseFailed(true), []);
  const canClose = left <= 0;

  useEffect(() => {
    if (canClose) {
      closeRef.current?.focus();
      return;
    }
    const t = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [left, canClose]);

  // <dialog> modal natif : focus piégé, reste de la page inerte. Le corps
  // ne défile pas derrière.
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
    // showModal() donnerait le focus au premier lien… celui de la pub. Le
    // focus va au titre : aucun clic publicitaire par accident (Entrée).
    titleRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
      d?.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="session-end-title"
      // Échap : seulement une fois le bouton Fermer disponible.
      onCancel={(e) => {
        e.preventDefault();
        if (canClose) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-3xl border border-[#F1E7CF]/40 bg-[#0F172A]/95 p-0 text-white shadow-2xl backdrop:bg-[#0F172A]/85 backdrop:backdrop-blur-md"
    >
      <div className="relative p-6 sm:p-8">
        <div className="mb-5 flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-7 shrink-0 text-[#EAB308]" aria-hidden />
          <div>
            <h2 ref={titleRef} tabIndex={-1} id="session-end-title" className="font-display text-xl font-bold outline-none sm:text-2xl">
              {c.sessionDone[reason]}
            </h2>
            <p className="mt-1 text-sm text-white/75">{c.sessionSub}</p>
          </div>
        </div>

        <div ref={boxRef} className="rounded-2xl border border-white/10 bg-white/[0.05] p-3">
          {network === "adsense" && AD_CONFIG.adsenseSlotInterstitial ? (
            <>
            <p className="mb-2 text-[10px] font-semibold tracking-wide text-[#F1E7CF] uppercase">{c.ad}</p>
            <AdSenseUnit slot={AD_CONFIG.adsenseSlotInterstitial} onError={onAdsenseError} className="min-h-[250px]" />
            </>
          ) : (
            // La tuile maison porte son propre libellé (« Anzeige » si payé, sinon « Empfehlung »).
            <SponsorTile
              large
              s={sponsor}
              label={sponsor.paid ? c.ad : c.recommendation}
              onClick={() => trackAd("ad_click", { network: "house", format: "interstitial", surface: "session_end", sponsor: sponsor.id })}
            />
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <Link href="/pricing" onClick={onClose} className="text-sm text-[#F1E7CF] underline-offset-4 hover:underline">
            {c.goAdFree} →
          </Link>
          <button
            ref={closeRef}
            type="button"
            disabled={!canClose}
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#EAB308] px-4 py-2 text-sm font-semibold text-[#0F172A] transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {canClose ? (
              <>
                <X className="size-4" aria-hidden /> {c.close}
              </>
            ) : (
              <span aria-live="polite">{c.closeIn(left)}</span>
            )}
          </button>
        </div>
        <p className="mt-3 text-[11px] text-white/55">{c.adFunds}</p>
      </div>
    </dialog>
  );
}

/**
 * Affiche l'interstitiel demandé (stores/ads.ts) dès qu'on est sur une page
 * qui n'est pas une surface de travail, si la fréquence le permet. Sinon la
 * demande est abandonnée : on ne la garde pas pour plus tard.
 *
 * `working` force l'interdiction (ex. la page d'examen tant que l'examen
 * court) ; par défaut, la route décide.
 */
export function InterstitialHost({ working }: { working?: boolean }) {
  const [location] = useLocation();
  const plan = useAdPlan();
  const pending = useAdStore((s) => s.pending);
  const showing = useAdStore((s) => s.showing);
  const promote = useAdStore((s) => s.promote);
  const dismiss = useAdStore((s) => s.dismiss);

  const onWork = working ?? isWorkRoute(location);

  useEffect(() => {
    if (!pending || onWork || showing) return;
    if (plan === null) return; // tarif pas encore connu : on attend
    promote(adsAllowed({ surface: "session_end", format: "interstitial", plan }));
  }, [pending, onWork, plan, showing, promote]);

  if (!showing) return null;
  return <InterstitialAdScreen reason={showing} onClose={dismiss} />;
}
