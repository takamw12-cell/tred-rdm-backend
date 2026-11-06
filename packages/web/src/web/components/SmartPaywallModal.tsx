import { useState } from "react";
import { Link } from "wouter";
import { Crown, PlayCircle } from "lucide-react";
import { Modal } from "@/components/modal";
import { RewardedAdModal, useRewardedAvailable } from "@/components/RewardedAdModal";
import { useAdCopy, useAdPlan } from "@/lib/use-ads";
import { adsAllowed } from "@/lib/ad-mediation";
import { track } from "@/lib/analytics";

/**
 * Le paywall intelligent — ce que voit l'étudiant quand son quota gratuit est
 * épuisé, AU LIEU d'un simple refus :
 *
 *   A. Premium → /pricing, qui ouvre Stripe Checkout (mensuel ou semestriel).
 *   B. Une vidéo de 15 s → +1 crédit en base (api/routes/ads.ts), puis la
 *      question bloquée repart toute seule (`onUnlocked`).
 *   C. Des crédits à l'unité (/credits).
 *
 * B n'apparaît que si une régie récompensée existe, si le serveur l'a activée,
 * au tarif gratuit et dans la limite de 3 par jour — sinon A et C restent.
 * Ce n'est PAS une pub pendant le travail : rien ne s'affiche tant que
 * l'étudiant n'est pas bloqué, et la vidéo n'est lancée que s'il la choisit.
 */
export function SmartPaywallModal({
  open,
  onClose,
  onUnlocked,
  offer,
}: {
  open: boolean;
  onClose: () => void;
  /** Appelé après le crédit : le parent relance la question. */
  onUnlocked: () => void;
  /** La vidéo proposée par le serveur (corps du 402), ou null. */
  offer: { seconds: number; credits: number } | null;
}) {
  const c = useAdCopy();
  const plan = useAdPlan();
  const { available } = useRewardedAvailable();
  const [watching, setWatching] = useState(false);
  // Crédit reçu : on laisse l'étudiant lire « +1 Credit », la question
  // repart quand il ferme la confirmation.
  const [earned, setEarned] = useState(false);
  const showVideo = offer !== null && available && adsAllowed({ surface: "paywall", format: "rewarded", plan });

  return (
    <>
      <Modal open={open && !watching} onClose={onClose} title={c.paywallTitle}>
        <p className="text-muted-foreground mb-4 text-sm">{c.paywallBody}</p>
        <div className="space-y-2">
          {/* Un abonné dont le mois est épuisé a déjà Premium : crédits seulement. */}
          {(plan === null || plan === "free") && (
          <Link
            href="/pricing"
            onClick={() => track("paywall_choice", { choice: "premium" })}
            className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-3 rounded-xl p-3 transition-colors"
          >
            <Crown className="size-5 shrink-0" aria-hidden />
            <span>
              <span className="block text-sm font-semibold">{c.paywallPremium}</span>
              <span className="block text-xs opacity-85">{c.paywallPremiumSub}</span>
            </span>
          </Link>
          )}

          {showVideo && (
            <button
              type="button"
              onClick={() => {
                track("paywall_choice", { choice: "rewarded" });
                setWatching(true);
              }}
              className="border-border hover:bg-accent flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors"
            >
              <PlayCircle className="size-5 shrink-0 text-[#EAB308]" aria-hidden />
              <span>
                <span className="block text-sm font-semibold">{c.paywallWatch(offer?.credits ?? 1)}</span>
                <span className="text-muted-foreground block text-xs">{c.paywallWatchSub(offer?.seconds ?? 15)}</span>
              </span>
            </button>
          )}

          <Link
            href="/credits"
            onClick={() => track("paywall_choice", { choice: "packs" })}
            className="text-muted-foreground hover:text-foreground block pt-1 text-center text-xs underline-offset-4 hover:underline"
          >
            {c.paywallPacks}
          </Link>
        </div>
      </Modal>

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
