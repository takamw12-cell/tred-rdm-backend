import { describe, expect, test } from "bun:test";
import {
  adEventProps,
  adsAllowed,
  canShowInterstitial,
  INTERSTITIAL_RULES,
  isWorkRoute,
  mobileAdConfig,
  pickNetwork,
  SPONSOR_TARGETS,
  targetingFor,
  webAdConfig,
  type AdFormat,
  type AdSurface,
} from "../src/web/lib/ad-mediation";
import { STUDIENGAENGE } from "../src/web/lib/studiengaenge";

describe("règle d'or : jamais de pub pendant le travail", () => {
  const formats: AdFormat[] = ["native", "interstitial", "rewarded"];

  test("Hörsaal, Chat, Examen : interdit, quel que soit le format", () => {
    for (const surface of ["hoersaal", "chat", "exam"] as AdSurface[]) {
      for (const format of formats) expect(adsAllowed({ surface, format, plan: "free" })).toBe(false);
    }
  });

  test("abonnés et plan inconnu : aucune pub", () => {
    for (const plan of ["standard", "premium", "founder", null, undefined, ""]) {
      expect(adsAllowed({ surface: "dashboard", format: "native", plan })).toBe(false);
      expect(adsAllowed({ surface: "paywall", format: "rewarded", plan })).toBe(false);
    }
  });

  test("gratuit : chaque format seulement à sa place", () => {
    expect(adsAllowed({ surface: "dashboard", format: "native", plan: "free" })).toBe(true);
    expect(adsAllowed({ surface: "session_end", format: "interstitial", plan: "free" })).toBe(true);
    expect(adsAllowed({ surface: "paywall", format: "rewarded", plan: "free" })).toBe(true);
    // Un interstitiel sur le Dashboard ou une vidéo hors paywall : non.
    expect(adsAllowed({ surface: "dashboard", format: "interstitial", plan: "free" })).toBe(false);
    expect(adsAllowed({ surface: "session_end", format: "rewarded", plan: "free" })).toBe(false);
  });

  test("routes de travail reconnues", () => {
    for (const p of ["/chat", "/chat?id=3", "/classroom", "/exam"]) expect(isWorkRoute(p)).toBe(true);
    for (const p of ["/dashboard", "/settings", "/chats", "/examples"]) expect(isWorkRoute(p)).toBe(false);
  });
});

describe("choix de la régie", () => {
  test("web sans clé : maison pour natif/interstitiel, RIEN pour la vidéo", () => {
    const cfg = webAdConfig({});
    expect(pickNetwork("web", "native", cfg)).toBe("house");
    expect(pickNetwork("web", "interstitial", cfg)).toBe("house");
    expect(pickNetwork("web", "rewarded", cfg)).toBeNull();
  });

  test("web avec AdSense + Ad Manager", () => {
    const cfg = webAdConfig({
      VITE_ADSENSE_CLIENT_ID: "ca-pub-1",
      VITE_ADSENSE_SLOT_NATIVE: "111",
      VITE_GAM_REWARDED_AD_UNIT: "/1/tred",
    });
    expect(pickNetwork("web", "native", cfg)).toBe("adsense");
    // Pas de bloc interstitiel défini : on reste sur la maison.
    expect(pickNetwork("web", "interstitial", cfg)).toBe("house");
    expect(pickNetwork("web", "rewarded", cfg)).toBe("gam");
  });

  test("web mode test : fausse vidéo", () => {
    expect(pickNetwork("web", "rewarded", webAdConfig({ VITE_ADS_TEST_MODE: "true" }))).toBe("test");
  });

  test("mobile : MAX d'abord, puis AdMob, puis Unity (jamais en natif)", () => {
    const all = mobileAdConfig(
      {
        EXPO_PUBLIC_APPLOVIN_SDK_KEY: "k",
        EXPO_PUBLIC_APPLOVIN_REWARDED_IOS: "max-r",
        EXPO_PUBLIC_ADMOB_APP_ID_IOS: "ca-app",
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS: "gma-i",
        EXPO_PUBLIC_UNITY_GAME_ID_IOS: "u",
        EXPO_PUBLIC_UNITY_NATIVE_IOS: "u-n",
      },
      "ios",
    );
    expect(pickNetwork("ios", "rewarded", all)).toBe("applovin");
    expect(pickNetwork("ios", "interstitial", all)).toBe("admob");
    expect(pickNetwork("ios", "native", all)).toBe("house");
    // Les unités iOS ne valent pas pour Android.
    expect(pickNetwork("android", "rewarded", mobileAdConfig({ EXPO_PUBLIC_APPLOVIN_SDK_KEY: "k", EXPO_PUBLIC_APPLOVIN_REWARDED_IOS: "x" }, "android"))).toBeNull();
  });
});

describe("fréquence des interstitiels", () => {
  const now = 10 * 86_400_000;
  test("premier de la journée : oui ; 10 min après : non ; 31 min après : oui", () => {
    expect(canShowInterstitial([], now)).toBe(true);
    expect(canShowInterstitial([now - 10 * 60_000], now)).toBe(false);
    expect(canShowInterstitial([now - 31 * 60_000], now)).toBe(true);
  });
  test("trois par jour au plus", () => {
    const h = [now - 5 * 3_600_000, now - 4 * 3_600_000, now - 3 * 3_600_000];
    expect(canShowInterstitial(h, now)).toBe(false);
    expect(canShowInterstitial(h, now + 21 * 3_600_000)).toBe(true);
  });
  test("fermeture après 5 s", () => expect(INTERSTITIAL_RULES.closeAfterMs).toBe(5000));
});

describe("ciblage sectoriel", () => {
  test("exemples du cahier des charges", () => {
    expect(targetingFor("Maschinenbau").product).toContain("MATLAB");
    expect(targetingFor("Luft- und Raumfahrttechnik").product).toContain("CATIA");
  });
  test("chaque filière proposée a un sponsor, en https", () => {
    for (const s of STUDIENGAENGE) {
      expect(SPONSOR_TARGETS[s.value]).toBeDefined();
      expect(SPONSOR_TARGETS[s.value].url.startsWith("https://")).toBe(true);
      expect(SPONSOR_TARGETS[s.value].keywords.length).toBeGreaterThan(0);
    }
  });
  test("saisie libre et vide", () => {
    expect(targetingFor("Maschinenbau B.Sc.").id).toBe("matlab");
    expect(targetingFor("Elektrotechnik und Informationstechnik").id).toBe("ltspice");
    expect(targetingFor("").id).toBe("matlab");
    expect(targetingFor(null).id).toBe("matlab");
  });
  test("aucun sponsor n'est déclaré payé sans contrat", () => {
    expect(Object.values(SPONSOR_TARGETS).every((t) => t.paid === false)).toBe(true);
  });
});

test("propriétés PostHog : rien d'identifiant", () => {
  const p = adEventProps({ network: "house", format: "native", surface: "dashboard", platform: "web", sponsor: "matlab" });
  expect(p).toEqual({ ad_network: "house", ad_format: "native", ad_surface: "dashboard", platform: "web", ad_sponsor: "matlab" });
});
