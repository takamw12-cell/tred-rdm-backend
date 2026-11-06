import { Platform } from "react-native";
import {
  adEventProps,
  adsAllowed,
  mobileAdConfig,
  pickNetwork,
  targetingFor,
  type AdEvent,
  type AdFormat,
  type AdNetwork,
  type AdSurface,
} from "@template/web/ads";

import { client } from "./api";

/**
 * Publicité mobile — wrappers PRÊTS, SDK NON INSTALLÉS.
 *
 * La décision (règle d'or, choix de la régie, ciblage) vient du même module
 * que le web : `@template/web/ads` (packages/web/src/web/lib/ad-mediation.ts).
 *
 * Pourquoi les SDK ne sont pas encore installés : ce sont des modules
 * NATIFS. AdMob, par exemple, fait planter l'app iOS au lancement si son App
 * ID manque dans app.json — l'installer sans compte casserait le build.
 * Activation (GUIDE_FOUNDER.md, « Publicité mobile ») :
 *   1. créer le compte AppLovin MAX (il médie AdMob + Unity Ads) ;
 *   2. `bun add --exact react-native-applovin-max` + plugin dans app.json ;
 *   3. dans app/_layout.tsx :
 *        import AppLovinMAX, { InterstitialAd, RewardedAd } from "react-native-applovin-max";
 *        registerAdAdapter(createAppLovinAdapter({ AppLovinMAX, InterstitialAd, RewardedAd }));
 *   4. build EAS (un module natif ne tourne pas dans Expo Go).
 *
 * Unity Ads n'a pas de SDK React Native officiel : il passe par MAX comme
 * réseau médié (adaptateur côté tableau de bord MAX, aucun code ici).
 */

const PLATFORM = Platform.OS === "ios" ? "ios" : "android";

// Expo n'injecte EXPO_PUBLIC_* que sur un accès STATIQUE : d'où la liste explicite.
const ENV: Record<string, string | undefined> = {
  EXPO_PUBLIC_ADS_TEST_MODE: process.env.EXPO_PUBLIC_ADS_TEST_MODE,
  EXPO_PUBLIC_APPLOVIN_SDK_KEY: process.env.EXPO_PUBLIC_APPLOVIN_SDK_KEY,
  EXPO_PUBLIC_APPLOVIN_INTERSTITIAL_IOS: process.env.EXPO_PUBLIC_APPLOVIN_INTERSTITIAL_IOS,
  EXPO_PUBLIC_APPLOVIN_INTERSTITIAL_ANDROID: process.env.EXPO_PUBLIC_APPLOVIN_INTERSTITIAL_ANDROID,
  EXPO_PUBLIC_APPLOVIN_REWARDED_IOS: process.env.EXPO_PUBLIC_APPLOVIN_REWARDED_IOS,
  EXPO_PUBLIC_APPLOVIN_REWARDED_ANDROID: process.env.EXPO_PUBLIC_APPLOVIN_REWARDED_ANDROID,
  EXPO_PUBLIC_APPLOVIN_NATIVE_IOS: process.env.EXPO_PUBLIC_APPLOVIN_NATIVE_IOS,
  EXPO_PUBLIC_APPLOVIN_NATIVE_ANDROID: process.env.EXPO_PUBLIC_APPLOVIN_NATIVE_ANDROID,
  EXPO_PUBLIC_ADMOB_APP_ID: process.env.EXPO_PUBLIC_ADMOB_APP_ID,
  EXPO_PUBLIC_ADMOB_APP_ID_IOS: process.env.EXPO_PUBLIC_ADMOB_APP_ID_IOS,
  EXPO_PUBLIC_ADMOB_APP_ID_ANDROID: process.env.EXPO_PUBLIC_ADMOB_APP_ID_ANDROID,
  EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS,
  EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID,
  EXPO_PUBLIC_ADMOB_REWARDED_IOS: process.env.EXPO_PUBLIC_ADMOB_REWARDED_IOS,
  EXPO_PUBLIC_ADMOB_REWARDED_ANDROID: process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID,
  EXPO_PUBLIC_ADMOB_NATIVE_IOS: process.env.EXPO_PUBLIC_ADMOB_NATIVE_IOS,
  EXPO_PUBLIC_ADMOB_NATIVE_ANDROID: process.env.EXPO_PUBLIC_ADMOB_NATIVE_ANDROID,
  EXPO_PUBLIC_UNITY_GAME_ID_IOS: process.env.EXPO_PUBLIC_UNITY_GAME_ID_IOS,
  EXPO_PUBLIC_UNITY_GAME_ID_ANDROID: process.env.EXPO_PUBLIC_UNITY_GAME_ID_ANDROID,
  EXPO_PUBLIC_UNITY_INTERSTITIAL_IOS: process.env.EXPO_PUBLIC_UNITY_INTERSTITIAL_IOS,
  EXPO_PUBLIC_UNITY_INTERSTITIAL_ANDROID: process.env.EXPO_PUBLIC_UNITY_INTERSTITIAL_ANDROID,
  EXPO_PUBLIC_UNITY_REWARDED_IOS: process.env.EXPO_PUBLIC_UNITY_REWARDED_IOS,
  EXPO_PUBLIC_UNITY_REWARDED_ANDROID: process.env.EXPO_PUBLIC_UNITY_REWARDED_ANDROID,
};

export const MOBILE_AD_CONFIG = mobileAdConfig(ENV, PLATFORM);

/* ── Adaptateurs ─────────────────────────────────────────────────────────── */

export type RewardedOutcome = "granted" | "closed" | "no_fill" | "error";

export interface MobileAdAdapter {
  network: Extract<AdNetwork, "applovin" | "admob" | "unity">;
  initialize(): Promise<void>;
  showInterstitial(unitId: string): Promise<"shown" | "no_fill">;
  showRewarded(unitId: string, keywords: string[]): Promise<RewardedOutcome>;
}

const adapters = new Map<MobileAdAdapter["network"], MobileAdAdapter>();
const ready = new Map<MobileAdAdapter["network"], Promise<void>>();

/** À appeler une fois au démarrage, après l'installation du SDK. */
export function registerAdAdapter(a: MobileAdAdapter) {
  adapters.set(a.network, a);
}

function adapterFor(format: AdFormat): { adapter: MobileAdAdapter; unit: string } | null {
  const network = pickNetwork(PLATFORM, format, MOBILE_AD_CONFIG);
  if (network !== "applovin" && network !== "admob" && network !== "unity") return null;
  const adapter = adapters.get(network);
  const units =
    network === "applovin"
      ? MOBILE_AD_CONFIG.applovinUnits
      : network === "admob"
        ? MOBILE_AD_CONFIG.admobUnits
        : MOBILE_AD_CONFIG.unityPlacements;
  const unit = units?.[format];
  if (!adapter || !unit) return null;
  if (!ready.has(network)) ready.set(network, adapter.initialize());
  return { adapter, unit };
}

/* ── AppLovin MAX (médiateur recommandé) ─────────────────────────────────── */

type Listener = (e?: unknown) => void;
interface MaxFullscreen {
  loadAd(unit: string): void;
  isAdReady(unit: string): Promise<boolean> | boolean;
  showAd(unit: string): void;
  addAdLoadedEventListener(fn: Listener): void;
  addAdLoadFailedEventListener(fn: Listener): void;
  addAdHiddenEventListener(fn: Listener): void;
  removeAdLoadedEventListener?(): void;
  removeAdLoadFailedEventListener?(): void;
  removeAdHiddenEventListener?(): void;
}
interface MaxRewarded extends MaxFullscreen {
  addAdReceivedRewardEventListener(fn: Listener): void;
  removeAdReceivedRewardEventListener?(): void;
}
/** La surface de `react-native-applovin-max` dont on se sert — à revérifier à l'installation. */
export interface AppLovinMaxLike {
  AppLovinMAX: { initialize(sdkKey: string): Promise<unknown>; setUserId?(id: string): void };
  InterstitialAd: MaxFullscreen;
  RewardedAd: MaxRewarded;
}

function loadThenShow(ad: MaxFullscreen, unit: string, onShown: () => void): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 8_000);
    ad.addAdLoadedEventListener(() => {
      clearTimeout(timeout);
      onShown();
      ad.showAd(unit);
      resolve(true);
    });
    ad.addAdLoadFailedEventListener(() => {
      clearTimeout(timeout);
      resolve(false);
    });
    ad.loadAd(unit);
  });
}

export function createAppLovinAdapter(sdk: AppLovinMaxLike): MobileAdAdapter {
  return {
    network: "applovin",
    initialize: async () => {
      if (MOBILE_AD_CONFIG.applovinSdkKey) await sdk.AppLovinMAX.initialize(MOBILE_AD_CONFIG.applovinSdkKey);
    },
    showInterstitial: async (unit) => ((await loadThenShow(sdk.InterstitialAd, unit, () => {})) ? "shown" : "no_fill"),
    showRewarded: (unit) =>
      new Promise<RewardedOutcome>((resolve) => {
        let granted = false;
        sdk.RewardedAd.addAdReceivedRewardEventListener(() => {
          granted = true;
        });
        sdk.RewardedAd.addAdHiddenEventListener(() => resolve(granted ? "granted" : "closed"));
        void loadThenShow(sdk.RewardedAd, unit, () => {}).then((ok) => {
          if (!ok) resolve("no_fill");
        });
      }),
  };
}

/* ── AdMob seul (repli si MAX n'est pas configuré) ───────────────────────── */

interface GmaAd {
  addAdEventListener(type: string, fn: Listener): () => void;
  load(): void;
  show(): Promise<void> | void;
}
/** La surface de `react-native-google-mobile-ads` dont on se sert. */
export interface GoogleMobileAdsLike {
  mobileAds: () => { initialize(): Promise<unknown> };
  InterstitialAd: { createForAdRequest(unit: string, opts?: { keywords?: string[] }): GmaAd };
  RewardedAd: { createForAdRequest(unit: string, opts?: { keywords?: string[] }): GmaAd };
  AdEventType: { LOADED: string; CLOSED: string; ERROR: string };
  RewardedAdEventType: { LOADED: string; EARNED_REWARD: string };
}

export function createAdMobAdapter(sdk: GoogleMobileAdsLike): MobileAdAdapter {
  return {
    network: "admob",
    initialize: async () => {
      await sdk.mobileAds().initialize();
    },
    showInterstitial: (unit) =>
      new Promise((resolve) => {
        const ad = sdk.InterstitialAd.createForAdRequest(unit);
        ad.addAdEventListener(sdk.AdEventType.LOADED, () => {
          void ad.show();
          resolve("shown");
        });
        ad.addAdEventListener(sdk.AdEventType.ERROR, () => resolve("no_fill"));
        ad.load();
      }),
    showRewarded: (unit, keywords) =>
      new Promise((resolve) => {
        let granted = false;
        const ad = sdk.RewardedAd.createForAdRequest(unit, { keywords });
        ad.addAdEventListener(sdk.RewardedAdEventType.LOADED, () => void ad.show());
        ad.addAdEventListener(sdk.RewardedAdEventType.EARNED_REWARD, () => {
          granted = true;
        });
        ad.addAdEventListener(sdk.AdEventType.CLOSED, () => resolve(granted ? "granted" : "closed"));
        ad.addAdEventListener(sdk.AdEventType.ERROR, () => resolve("no_fill"));
        ad.load();
      }),
  };
}

/* ── Mesure ──────────────────────────────────────────────────────────────── */

type Sink = (event: AdEvent, props: Record<string, string>) => void;
let sink: Sink = () => {};
/** Brancher PostHog mobile ici quand il sera installé : setAdEventSink((e, p) => posthog.capture(e, p)). */
export function setAdEventSink(fn: Sink) {
  sink = fn;
}
function emit(event: AdEvent, network: AdNetwork, format: AdFormat, surface: AdSurface) {
  sink(event, adEventProps({ network, format, surface, platform: PLATFORM }));
}

/* ── API pour les écrans ─────────────────────────────────────────────────── */

/** La vidéo récompensée peut-elle être proposée ? (régie installée + serveur activé) */
export function rewardedAvailable(plan: string | null | undefined): boolean {
  return adsAllowed({ surface: "paywall", format: "rewarded", plan }) && adapterFor("rewarded") !== null;
}

/**
 * Vidéo récompensée complète : jeton serveur → vidéo → réclamation.
 * Résout avec le nouveau solde de crédits, ou null si rien n'a été crédité.
 */
export async function watchRewardedForCredit(program?: string | null): Promise<{ balance: number } | null> {
  const picked = adapterFor("rewarded");
  if (!picked) return null;
  await ready.get(picked.adapter.network);

  const { token } = await client.ads.start();
  const outcome = await picked.adapter.showRewarded(picked.unit, targetingFor(program).keywords);
  if (outcome !== "granted") return null;
  emit("rewarded_ad_completed", picked.adapter.network, "rewarded", "paywall");
  const res = await client.ads.claim({ token });
  return res.granted ? { balance: res.balance } : null;
}

/** Interstitiel de fin de session (fin d'examen, longue conversation terminée). */
export async function showSessionEndInterstitial(plan: string | null | undefined): Promise<boolean> {
  if (!adsAllowed({ surface: "session_end", format: "interstitial", plan })) return false;
  const picked = adapterFor("interstitial");
  if (!picked) return false;
  await ready.get(picked.adapter.network);
  const r = await picked.adapter.showInterstitial(picked.unit);
  if (r === "shown") emit("ad_impression", picked.adapter.network, "interstitial", "session_end");
  return r === "shown";
}
