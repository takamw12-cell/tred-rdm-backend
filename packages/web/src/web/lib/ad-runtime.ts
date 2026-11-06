/**
 * Côté navigateur de la médiation (lib/ad-mediation.ts décide, ce fichier
 * exécute) : chargement des scripts Google, vidéo récompensée, mesure.
 *
 * Aucun script tiers n'est chargé tant que :
 *   • la variable de la régie n'est pas posée (brique inerte), ET
 *   • l'étudiant n'est pas sur une surface publicitaire, gratuit, hors travail.
 * Le consentement RGPD/TDDDG aux pubs est recueilli par la CMP certifiée de
 * Google (AdSense → « Confidentialité et messages ») : elle s'affiche au
 * premier chargement du script et transmet le signal TCF aux enchères.
 */
import {
  adEventProps,
  pickNetwork,
  webAdConfig,
  type AdEvent,
  type AdFormat,
  type AdNetwork,
  type AdSurface,
} from "./ad-mediation";
import { track } from "./analytics";

export const AD_CONFIG = webAdConfig(import.meta.env as unknown as Record<string, string | undefined>);

export const webNetwork = (format: AdFormat): AdNetwork | null => pickNetwork("web", format, AD_CONFIG);

/** PostHog : ad_impression, ad_click, rewarded_ad_completed (no-op sans consentement analytique). */
export function trackAd(
  event: AdEvent,
  p: { network: AdNetwork; format: AdFormat; surface: AdSurface; sponsor?: string },
) {
  track(event, adEventProps({ ...p, platform: "web" }));
}

/* ── Chargement de script, une seule fois ────────────────────────────────── */

const loading = new Map<string, Promise<void>>();

function loadScript(src: string, attrs: Record<string, string> = {}): Promise<void> {
  const cached = loading.get(src);
  if (cached) return cached;
  const p = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.async = true;
    s.src = src;
    for (const [k, val] of Object.entries(attrs)) s.setAttribute(k, val);
    s.onload = () => resolve();
    s.onerror = () => {
      loading.delete(src);
      reject(new Error(`ad script blocked: ${src}`));
    };
    document.head.appendChild(s);
  });
  loading.set(src, p);
  return p;
}

/* ── AdSense ─────────────────────────────────────────────────────────────── */

declare global {
  interface Window {
    adsbygoogle?: unknown[];
    googletag?: GoogleTag;
  }
}

export function loadAdSense(): Promise<void> {
  const client = AD_CONFIG.adsenseClient;
  if (!client) return Promise.reject(new Error("not_configured"));
  return loadScript(`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`, {
    crossorigin: "anonymous",
  });
}

/** Demande le remplissage d'un <ins class="adsbygoogle"> déjà monté. */
export function fillAdSenseSlot() {
  (window.adsbygoogle = window.adsbygoogle || []).push({});
}

/* ── Vidéo récompensée — Google Ad Manager (GPT) ─────────────────────────── */

interface RewardedEvent {
  slot: unknown;
  makeRewardedVisible?: () => void;
}
interface GoogleTag {
  cmd: Array<() => void>;
  enums: { OutOfPageFormat: { REWARDED: unknown } };
  defineOutOfPageSlot: (unit: string, format: unknown) => GoogleSlot | null;
  pubads: () => {
    addEventListener: (name: string, fn: (e: RewardedEvent) => void) => void;
    removeEventListener?: (name: string, fn: (e: RewardedEvent) => void) => void;
    setTargeting: (k: string, val: string | string[]) => void;
  };
  enableServices: () => void;
  display: (slot: GoogleSlot) => void;
  destroySlots: (slots: GoogleSlot[]) => void;
}
interface GoogleSlot {
  addService: (s: unknown) => GoogleSlot;
}

export type RewardedOutcome = "granted" | "closed" | "no_fill" | "error";

/**
 * Affiche une pub récompensée Ad Manager et résout quand elle se termine.
 * « granted » = Google confirme que la récompense est méritée.
 */
export async function showGamRewarded(keywords: string[]): Promise<RewardedOutcome> {
  const unit = AD_CONFIG.gamRewardedUnit;
  if (!unit) return "error";
  try {
    await loadScript("https://securepubads.g.doubleclick.net/tag/js/gpt.js");
  } catch {
    return "error"; // bloqueur de pub, réseau
  }
  const gt = window.googletag;
  if (!gt) return "error";

  return new Promise<RewardedOutcome>((resolve) => {
    gt.cmd.push(() => {
      const slot = gt.defineOutOfPageSlot(unit, gt.enums.OutOfPageFormat.REWARDED);
      // null : format non pris en charge sur cette page / cet appareil.
      if (!slot) return resolve("no_fill");
      slot.addService(gt.pubads());
      gt.pubads().setTargeting("tred_kw", keywords);

      let granted = false;
      const timeout = window.setTimeout(() => finish("no_fill"), 8_000);
      const finish = (o: RewardedOutcome) => {
        window.clearTimeout(timeout);
        gt.destroySlots([slot]);
        resolve(o);
      };
      gt.pubads().addEventListener("rewardedSlotReady", (e) => {
        window.clearTimeout(timeout);
        e.makeRewardedVisible?.();
      });
      gt.pubads().addEventListener("rewardedSlotGranted", () => {
        granted = true;
      });
      gt.pubads().addEventListener("rewardedSlotClosed", () => finish(granted ? "granted" : "closed"));
      gt.pubads().addEventListener("slotRenderEnded", (e) => {
        if ((e as RewardedEvent & { isEmpty?: boolean }).isEmpty) finish("no_fill");
      });
      gt.enableServices();
      gt.display(slot);
    });
  });
}
