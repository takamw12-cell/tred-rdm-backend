import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, PlayCircle } from "lucide-react";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { client, orpc } from "@/lib/api";
import { creditsMeKey } from "@/queries/credits";
import { useUserStore } from "@/stores/user";
import { targetingFor } from "@/lib/ad-mediation";
import { showGamRewarded, trackAd, webNetwork } from "@/lib/ad-runtime";
import { useAdCopy } from "@/lib/use-ads";

/**
 * Vidéo récompensée — TOUJOURS volontaire : on la propose, l'étudiant
 * choisit. Le crédit n'est versé que par le serveur (api/routes/ads.ts), sur
 * un jeton signé au début de la vidéo et réclamé à la fin.
 *
 * Régie : Google Ad Manager si configuré ; en mode test, une fausse vidéo de
 * 15 s clairement marquée « Testanzeige ».
 */
type Phase = "intro" | "loading" | "playing" | "claiming" | "done" | "nofill" | "cap" | "error";

export const adsStatusOptions = () => orpc.ads.status.queryOptions();

/** La vidéo peut-elle être proposée maintenant ? (régie + serveur + plafond du jour) */
export function useRewardedAvailable(): { available: boolean; remainingToday: number } {
  const network = webNetwork("rewarded");
  const { data } = useQuery({ ...adsStatusOptions(), enabled: network !== null, staleTime: 30_000 });
  const remainingToday = data?.remainingToday ?? 0;
  return { available: network !== null && !!data?.eligible && remainingToday > 0, remainingToday };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function RewardedAdModal({
  open,
  onClose,
  onRewarded,
}: {
  open: boolean;
  onClose: () => void;
  onRewarded?: (balance: number) => void;
}) {
  const c = useAdCopy();
  const qc = useQueryClient();
  const program = useUserStore((s) => s.profile.degree);
  const { data: status } = useQuery({ ...adsStatusOptions(), enabled: open });
  const seconds = status?.seconds ?? 15;
  const credits = status?.credits ?? 1;
  const network = webNetwork("rewarded");

  const [phase, setPhase] = useState<Phase>("intro");
  const [left, setLeft] = useState<number>(seconds);
  const [earlyClosed, setEarlyClosed] = useState(false);
  // Annule une lecture en cours si la modale se ferme.
  const run = useRef(0);

  // Fausse vidéo (mode test) : décompte, puis réclamation.
  const tokenRef = useRef<string | null>(null);
  const startedAt = useRef(0);
  useEffect(() => {
    if (phase !== "playing" || network !== "test" || left <= 0) return;
    const id = run.current;
    const t = window.setTimeout(() => {
      setLeft(left - 1);
      if (left - 1 <= 0) void claim(id);
    }, 1000);
    return () => window.clearTimeout(t);
    // claim est stable pour une exécution donnée (run.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, left, network]);

  const fail = (e: unknown) => {
    const msg = (e as { message?: string })?.message ?? "";
    setPhase(msg === "daily_cap" ? "cap" : "error");
  };

  async function claim(id: number) {
    const token = tokenRef.current;
    if (!token || id !== run.current) return;
    setPhase("claiming");
    // Une pub plus courte que 15 s : on attend la différence (le serveur l'exige).
    const wait = seconds * 1000 - (Date.now() - startedAt.current);
    if (wait > 0) await sleep(wait);
    if (id !== run.current) return;
    try {
      const res = await client.ads.claim({ token });
      if (id !== run.current) return;
      tokenRef.current = null;
      trackAd("rewarded_ad_completed", { network: network ?? "test", format: "rewarded", surface: "paywall", sponsor: targetingFor(program).id });
      void qc.invalidateQueries({ queryKey: creditsMeKey() });
      void qc.invalidateQueries({ queryKey: orpc.ads.status.key() });
      setPhase("done");
      onRewarded?.(res.balance);
    } catch (e) {
      fail(e);
    }
  }

  async function start() {
    const id = ++run.current;
    setEarlyClosed(false);
    setPhase("loading");
    try {
      const { token } = await client.ads.start();
      if (id !== run.current) return;
      tokenRef.current = token;
      startedAt.current = Date.now();
    } catch (e) {
      fail(e);
      return;
    }

    if (network === "test") {
      setLeft(seconds);
      setPhase("playing");
      return;
    }
    const outcome = await showGamRewarded(targetingFor(program).keywords);
    if (id !== run.current) return;
    if (outcome === "granted") void claim(id);
    else if (outcome === "closed") {
      setEarlyClosed(true);
      setPhase("intro");
    } else setPhase(outcome === "no_fill" ? "nofill" : "error");
  }

  const close = () => {
    run.current++; // abandonne la lecture : aucun crédit
    tokenRef.current = null;
    setPhase("intro");
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title={c.rewardTitle}>
      {phase === "intro" && (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed">{c.rewardIntro(seconds, credits)}</p>
          {status && <p className="text-muted-foreground text-xs">{c.rewardLeft(status.remainingToday)}</p>}
          {earlyClosed && <p className="text-xs text-amber-600 dark:text-amber-400">{c.rewardEarlyClose}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              {c.cancel}
            </Button>
            <Button onClick={() => void start()} className="gap-1.5">
              <PlayCircle className="size-4" aria-hidden /> {c.rewardStart}
            </Button>
          </div>
        </div>
      )}

      {(phase === "loading" || phase === "claiming") && (
        <p className="text-muted-foreground py-6 text-center text-sm" aria-live="polite">
          {c.rewardLoading}
        </p>
      )}

      {phase === "playing" && (
        <div className="space-y-3">
          <div className="relative grid aspect-video place-items-center overflow-hidden rounded-xl bg-[#0F172A] text-white">
            <p className="px-6 text-center text-sm font-semibold">{c.rewardTestAd}</p>
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/15">
              <div
                className="h-full bg-[#EAB308] transition-[width] duration-1000 ease-linear"
                style={{ width: `${((seconds - left) / seconds) * 100}%` }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span aria-live="polite">{c.rewardWatching(left)}</span>
            <span className="text-muted-foreground">{c.rewardEarlyClose}</span>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto size-10 text-emerald-500" aria-hidden />
          <p className="font-semibold">{c.rewardDone(credits)}</p>
          <Button onClick={close} className="w-full">
            {c.rewardContinue}
          </Button>
        </div>
      )}

      {(phase === "nofill" || phase === "cap" || phase === "error") && (
        <div className="space-y-4">
          <p className="text-sm">{phase === "nofill" ? c.rewardNoFill : phase === "cap" ? c.rewardCap : c.rewardError}</p>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={close}>
              {c.close}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
