/**
 * Médiation publicitaire — LE point unique qui décide si une pub s'affiche,
 * où, et par quelle régie. Web et mobile lisent ce même fichier
 * (`@template/web/ads`) : la règle d'or ne peut pas diverger entre les deux.
 *
 * ── Règle d'or (non négociable) ──────────────────────────────────────────
 * Aucune publicité pendant qu'un étudiant travaille : Hörsaal, Chat, Mode
 * Examen en cours. Trois emplacements seulement :
 *   • le Dashboard (encart natif « Ressource partenaire »),
 *   • l'écran de FIN de session (interstitiel, fermable après 5 s),
 *   • la vidéo récompensée, toujours VOLONTAIRE (quota épuisé → +1 crédit).
 * Les abonnés payants ne voient jamais de publicité.
 *
 * ── Régies ───────────────────────────────────────────────────────────────
 *   Web    : Google AdSense (natif, interstitiel) ; vidéo récompensée via
 *            Google Ad Manager (AdSense ne propose pas de rewarded pour un
 *            site quelconque).
 *   Mobile : AppLovin MAX d'abord — c'est un MÉDIATEUR : AdMob et Unity Ads
 *            s'y branchent comme réseaux (adaptateurs MAX), et MAX met les
 *            trois en concurrence à chaque affichage. AdMob seul ou Unity seul
 *            restent possibles en repli si MAX n'est pas configuré.
 *   Sans clé : « house » — nos ressources partenaires (liens, aucun script
 *            tiers). Une brique sans clé reste inerte, l'app ne change pas.
 *
 * Module PUR (aucun accès DOM, aucun alias « @/ ») : importable côté mobile.
 * Testé dans tests/ad-mediation.test.ts.
 */

export type AdPlatform = "web" | "ios" | "android";
export type AdFormat = "native" | "interstitial" | "rewarded";
export type AdNetwork = "adsense" | "gam" | "applovin" | "admob" | "unity" | "house" | "test";
export type AdSurface =
  | "dashboard"
  | "session_end"
  | "paywall"
  // Surfaces de TRAVAIL — jamais de publicité, quel que soit le format.
  | "hoersaal"
  | "chat"
  | "exam";

/** Surfaces où l'étudiant travaille : la pub y est interdite. */
export const WORK_SURFACES: readonly AdSurface[] = ["hoersaal", "chat", "exam"];

/** Tarifs payants : zéro publicité. */
const PAID_PLANS = new Set(["standard", "premium", "founder"]);

/** Quel format a le droit de vivre sur quelle surface. */
const FORMAT_FOR_SURFACE: Record<AdSurface, AdFormat | null> = {
  dashboard: "native",
  session_end: "interstitial",
  paywall: "rewarded",
  hoersaal: null,
  chat: null,
  exam: null,
};

/**
 * La règle d'or, en une fonction. `plan` inconnu (profil pas encore chargé)
 * = pas de pub : mieux vaut rater une impression que montrer une pub à un
 * abonné qui paie pour ne pas en voir.
 */
export function adsAllowed(opts: { surface: AdSurface; format: AdFormat; plan: string | null | undefined }): boolean {
  if (!opts.plan || PAID_PLANS.has(opts.plan)) return false;
  if (WORK_SURFACES.includes(opts.surface)) return false;
  return FORMAT_FOR_SURFACE[opts.surface] === opts.format;
}

/** Les routes web qui sont des surfaces de travail. */
export function isWorkRoute(path: string): boolean {
  return /^\/(chat|classroom|exam)(\/|$|\?)/.test(path);
}

/* ── Configuration ───────────────────────────────────────────────────────── */

export interface AdConfig {
  testMode?: boolean;
  // Web
  adsenseClient?: string;
  adsenseSlotNative?: string;
  adsenseSlotInterstitial?: string;
  gamRewardedUnit?: string;
  // Mobile
  applovinSdkKey?: string;
  applovinUnits?: Partial<Record<AdFormat, string>>;
  admobAppId?: string;
  admobUnits?: Partial<Record<AdFormat, string>>;
  unityGameId?: string;
  unityPlacements?: Partial<Record<AdFormat, string>>;
}

type Env = Record<string, string | undefined>;
const v = (s: string | undefined) => (s && s.trim() ? s.trim() : undefined);

/** Web : lit les variables VITE_* (publiques par nature — un ID d'éditeur n'est pas un secret). */
export function webAdConfig(env: Env): AdConfig {
  return {
    testMode: env.VITE_ADS_TEST_MODE === "true",
    adsenseClient: v(env.VITE_ADSENSE_CLIENT_ID),
    adsenseSlotNative: v(env.VITE_ADSENSE_SLOT_NATIVE),
    adsenseSlotInterstitial: v(env.VITE_ADSENSE_SLOT_INTERSTITIAL),
    gamRewardedUnit: v(env.VITE_GAM_REWARDED_AD_UNIT),
  };
}

/** Mobile : lit les variables EXPO_PUBLIC_* (suffixe _IOS / _ANDROID pour les unités). */
export function mobileAdConfig(env: Env, platform: "ios" | "android"): AdConfig {
  const P = platform === "ios" ? "IOS" : "ANDROID";
  const units = (prefix: string) => ({
    native: v(env[`${prefix}_NATIVE_${P}`]),
    interstitial: v(env[`${prefix}_INTERSTITIAL_${P}`]),
    rewarded: v(env[`${prefix}_REWARDED_${P}`]),
  });
  return {
    testMode: env.EXPO_PUBLIC_ADS_TEST_MODE === "true",
    applovinSdkKey: v(env.EXPO_PUBLIC_APPLOVIN_SDK_KEY),
    applovinUnits: units("EXPO_PUBLIC_APPLOVIN"),
    admobAppId: v(env[`EXPO_PUBLIC_ADMOB_APP_ID_${P}`]) ?? v(env.EXPO_PUBLIC_ADMOB_APP_ID),
    admobUnits: units("EXPO_PUBLIC_ADMOB"),
    unityGameId: v(env[`EXPO_PUBLIC_UNITY_GAME_ID_${P}`]),
    unityPlacements: units("EXPO_PUBLIC_UNITY"),
  };
}

/**
 * La meilleure régie disponible pour ce format sur cette plateforme.
 * `null` = rien ne peut être montré (l'option doit alors DISPARAÎTRE de
 * l'interface, pas s'afficher en panne).
 *
 * Le natif et l'interstitiel retombent sur « house » (nos ressources
 * partenaires) ; la vidéo récompensée, non : promettre un crédit contre une
 * vidéo qui n'existe pas serait mentir.
 */
export function pickNetwork(platform: AdPlatform, format: AdFormat, cfg: AdConfig): AdNetwork | null {
  if (platform === "web") {
    if (format === "rewarded") {
      if (cfg.gamRewardedUnit) return "gam";
      return cfg.testMode ? "test" : null;
    }
    const slot = format === "native" ? cfg.adsenseSlotNative : cfg.adsenseSlotInterstitial;
    return cfg.adsenseClient && slot ? "adsense" : "house";
  }

  if (cfg.applovinSdkKey && cfg.applovinUnits?.[format]) return "applovin";
  if (cfg.admobAppId && cfg.admobUnits?.[format]) return "admob";
  // Unity Ads n'a pas de format natif.
  if (format !== "native" && cfg.unityGameId && cfg.unityPlacements?.[format]) return "unity";
  if (format === "rewarded") return cfg.testMode ? "test" : null;
  return "house";
}

/* ── Fréquence ───────────────────────────────────────────────────────────── */

export const INTERSTITIAL_RULES = {
  /** Au moins 30 min entre deux interstitiels. */
  minGapMs: 30 * 60_000,
  /** Trois par jour au plus. */
  maxPerDay: 3,
  /** « Longue conversation » : à partir de 12 réponses du tuteur. */
  longChatAnswers: 12,
  /** Le bouton Fermer apparaît après 5 s. */
  closeAfterMs: 5_000,
} as const;

/** `history` = horodatages (ms) des interstitiels déjà montrés. */
export function canShowInterstitial(history: readonly number[], now: number): boolean {
  const recent = history.filter((t) => now - t < 86_400_000);
  if (recent.length >= INTERSTITIAL_RULES.maxPerDay) return false;
  const last = Math.max(0, ...recent);
  return now - last >= INTERSTITIAL_RULES.minGapMs;
}

/** Vidéo récompensée : 15 s, +1 crédit, 3 fois par jour (contrôlé côté serveur). */
export const REWARDED_RULES = { seconds: 15, credits: 1, dailyCap: 3 } as const;

/* ── Ciblage sectoriel ───────────────────────────────────────────────────── */

export interface SponsorTarget {
  /** Identifiant stable (analytics, contrats). */
  id: string;
  sponsor: string;
  product: string;
  /** Une ligne, en allemand comme le cursus. */
  pitch: string;
  url: string;
  /**
   * `true` seulement quand un contrat de sponsoring existe : l'encart dit
   * alors « Anzeige » et le lien porte rel="sponsored" (§ 5a Abs. 4 UWG).
   * Tant que c'est `false`, c'est une recommandation et l'encart le dit.
   */
  paid: boolean;
  /** Mots-clés transmis aux régies qui les acceptent (AdMob, MAX, Ad Manager). */
  keywords: string[];
}

const T = (t: SponsorTarget) => t;

const MATLAB = T({
  id: "matlab",
  sponsor: "MathWorks",
  product: "MATLAB & Simulink Student",
  pitch: "Rechnen, Simulieren, Regeln — das Standardwerkzeug in Technischer Mechanik und Regelungstechnik.",
  url: "https://www.mathworks.com/products/matlab-student.html",
  paid: false,
  keywords: ["matlab", "simulink", "engineering software", "maschinenbau"],
});

/**
 * Filière → sponsor ciblé. Clé = la VALEUR enregistrée dans le profil
 * (lib/studiengaenge.ts). Préparation commerciale : chaque ligne est un
 * emplacement à vendre à l'éditeur correspondant.
 */
export const SPONSOR_TARGETS: Record<string, SponsorTarget> = {
  "Luft- und Raumfahrttechnik": T({
    id: "catia",
    sponsor: "Dassault Systèmes",
    product: "CATIA Student Edition",
    pitch: "Das CAD-System von Airbus & Co. — für Konstruktion und Strukturentwurf im Flugzeugbau.",
    url: "https://edu.3ds.com/en/software/catia-v5-student-edition",
    paid: false,
    keywords: ["catia", "cad", "aerospace", "luftfahrt"],
  }),
  Maschinenbau: MATLAB,
  Mechatronik: { ...MATLAB, keywords: ["matlab", "simulink", "mechatronik", "regelungstechnik"] },
  "Robotik / Autonome Systeme": { ...MATLAB, keywords: ["matlab", "robotics", "ros", "robotik"] },
  Elektrotechnik: T({
    id: "ltspice",
    sponsor: "Analog Devices",
    product: "LTspice",
    pitch: "Schaltungen simulieren, bevor du sie lötest — kostenlos und in der Industrie verbreitet.",
    url: "https://www.analog.com/en/resources/design-tools-and-calculators/ltspice-simulator.html",
    paid: false,
    keywords: ["ltspice", "spice", "schaltung", "elektrotechnik"],
  }),
  Bauingenieurwesen: T({
    id: "dlubal",
    sponsor: "Dlubal Software",
    product: "RFEM & RSTAB (Studentenlizenz)",
    pitch: "FEM-Statik für Tragwerke — mit kostenloser Lizenz für Studierende.",
    url: "https://www.dlubal.com",
    paid: false,
    keywords: ["fem", "statik", "tragwerk", "bauingenieur"],
  }),
  Architektur: T({
    id: "revit",
    sponsor: "Autodesk",
    product: "Revit & AutoCAD (Education)",
    pitch: "BIM und CAD für Entwurf und Werkplanung — kostenlos für Studierende.",
    url: "https://www.autodesk.com/education/edu-software/overview",
    paid: false,
    keywords: ["revit", "autocad", "bim", "architektur"],
  }),
  Wirtschaftsingenieurwesen: T({
    id: "m365",
    sponsor: "Microsoft",
    product: "Microsoft 365 Education",
    pitch: "Excel für Kostenrechnung, Planung und Statistik — oft über deine Hochschule kostenlos.",
    url: "https://www.microsoft.com/education/products/office",
    paid: false,
    keywords: ["excel", "controlling", "wirtschaftsingenieur"],
  }),
  "Chemieingenieurwesen / Verfahrenstechnik": T({
    id: "aspen",
    sponsor: "AspenTech",
    product: "Aspen Plus",
    pitch: "Prozesssimulation für Stoff- und Energiebilanzen — der Industriestandard.",
    url: "https://www.aspentech.com",
    paid: false,
    keywords: ["aspen", "prozesssimulation", "verfahrenstechnik"],
  }),
  Umwelttechnik: T({
    id: "arcgis",
    sponsor: "Esri",
    product: "ArcGIS",
    pitch: "Geodaten auswerten — Emissionen, Wasser, Flächen — mit Studierendenlizenz.",
    url: "https://www.esri.com",
    paid: false,
    keywords: ["gis", "umwelt", "geodaten"],
  }),
  "Biomedizinische Technik": T({
    id: "comsol",
    sponsor: "COMSOL",
    product: "COMSOL Multiphysics",
    pitch: "Multiphysik-Simulation — Strömung im Gefäß, Wärme im Gewebe, Implantate.",
    url: "https://www.comsol.com",
    paid: false,
    keywords: ["comsol", "simulation", "biomedizin"],
  }),
  Informatik: T({
    id: "jetbrains",
    sponsor: "JetBrains",
    product: "JetBrains IDEs für Studierende",
    pitch: "IntelliJ, PyCharm, CLion — kostenlos mit deiner Hochschuladresse.",
    url: "https://www.jetbrains.com/community/education/",
    paid: false,
    keywords: ["ide", "programmieren", "informatik"],
  }),
  "Data Science / KI": T({
    id: "github-pack",
    sponsor: "GitHub",
    product: "GitHub Student Developer Pack",
    pitch: "Rechenzeit, Copilot und Cloud-Guthaben für deine ML-Projekte.",
    url: "https://education.github.com/pack",
    paid: false,
    keywords: ["machine learning", "python", "data science"],
  }),
  "Mathematik/Physik": T({
    id: "mathematica",
    sponsor: "Wolfram",
    product: "Mathematica Student",
    pitch: "Symbolisch rechnen, plotten, prüfen — von Analysis bis Quantenmechanik.",
    url: "https://www.wolfram.com/mathematica/",
    paid: false,
    keywords: ["mathematica", "mathematik", "physik"],
  }),
};
SPONSOR_TARGETS.Physik = SPONSOR_TARGETS["Mathematik/Physik"];

/** Le sponsor ciblé pour une filière — MATLAB quand la filière est inconnue ou vide. */
export function targetingFor(program: string | null | undefined): SponsorTarget {
  const p = (program ?? "").trim();
  if (SPONSOR_TARGETS[p]) return SPONSOR_TARGETS[p];
  // Saisie libre (« Luft- & Raumfahrt », « Maschinenbau B.Sc. ») : premier mot-clé reconnu.
  const loose = Object.keys(SPONSOR_TARGETS).find((k) => {
    const head = k.split(/[\s/-]/)[0].toLowerCase();
    return head.length >= 4 && p.toLowerCase().includes(head);
  });
  return loose ? SPONSOR_TARGETS[loose] : MATLAB;
}

/* ── Mesure ──────────────────────────────────────────────────────────────── */

export type AdEvent = "ad_impression" | "ad_click" | "rewarded_ad_completed";

/** Les propriétés envoyées à PostHog — jamais d'identifiant publicitaire ni d'e-mail. */
export function adEventProps(p: {
  network: AdNetwork;
  format: AdFormat;
  surface: AdSurface;
  platform: AdPlatform;
  sponsor?: string;
}): Record<string, string> {
  const out: Record<string, string> = {
    ad_network: p.network,
    ad_format: p.format,
    ad_surface: p.surface,
    platform: p.platform,
  };
  if (p.sponsor) out.ad_sponsor = p.sponsor;
  return out;
}
