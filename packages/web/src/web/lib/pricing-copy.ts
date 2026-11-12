/**
 * Les textes de la page /pricing, du bandeau d'essai et de la fenêtre de
 * limite. Allemand, anglais, français ; les autres langues lisent l'anglais
 * (même règle que lib/ad-copy.ts).
 *
 * AUCUN prix n'est écrit ici : les montants viennent du serveur
 * (`subscriptions.me` : prix Stripe, sinon la grille de api/lib/plan.ts).
 */
export type PaywallMetric = "chat" | "exercise" | "video" | "formulas" | "documents";

export interface PricingCopy {
  title: string;
  subtitle: string;
  perMonth: string;
  every6Months: (price: string) => string;
  insteadOf: (price: string) => string;
  free: string;
  freeDesc: string;
  monthly: string;
  monthlyDesc: string;
  semester: string;
  semesterDesc: string;
  bestValue: string;
  chats: (n: number) => string;
  videos: (n: number) => string;
  exercises: (n: number) => string;
  documents: (n: number) => string;
  noAds: string;
  cancelAnytime: string;
  currentPlan: string;
  choose: string;
  manage: string;
  trialCta: (days: number) => string;
  trialNote: string;
  trialActive: (days: number) => string;
  trialBanner: (days: number) => string;
  trialBannerCta: string;
  trialStarted: (days: number) => string;
  trialError: string;
  creditsTitle: string;
  creditsLine: (price: string, videos: number, chats: number) => string;
  creditsNever: string;
  creditsBuy: string;
  creditsSoon: string;
  usage: string;
  unlimited: string;
  activeUntil: (date: string) => string;
  payments: string;
  checkoutError: string;
  portalError: string;
  paid: string;
  metric: Record<PaywallMetric, string>;
  wallTitle: (metric: PaywallMetric) => string;
  wallUsed: (used: number, limit: number, metric: PaywallMetric) => string;
  wallBody: string;
  wallPaidBody: string;
  wallStudent: (perMonth: string) => string;
  wallStudentSub: (chats: number, videos: number, exercises: number) => string;
  wallTrial: (days: number) => string;
  wallTrialSub: string;
  wallCredits: (price: string) => string;
  wallCreditsSub: (videos: number, chats: number) => string;
  wallWatch: (credits: number) => string;
  wallLater: string;
  /** Mode bêta gratuit. */
  betaBanner: string;
  atLaunch: string;
  wallBetaTitle: string;
  wallBetaBody: string;
  ok: string;
}

const de: PricingCopy = {
  title: "Wähle deinen Tarif",
  subtitle: "Für Studierende gemacht. Jederzeit kündbar.",
  perMonth: "/ Monat",
  every6Months: (p) => `${p} alle 6 Monate`,
  insteadOf: (p) => `statt ${p}`,
  free: "Free",
  freeDesc: "Zum Kennenlernen.",
  monthly: "Student · monatlich",
  monthlyDesc: "Flexibel, Monat für Monat.",
  semester: "Student · Semester",
  semesterDesc: "Ein ganzes Semester Prüfungsvorbereitung.",
  bestValue: "Beliebteste Wahl",
  chats: (n) => `${n} Chats pro Monat`,
  videos: (n) => `${n} Erklärvideos pro Monat`,
  exercises: (n) => `${n} Übungen pro Monat`,
  documents: (n) => `${n} Dokumente`,
  noAds: "Keine Werbung",
  cancelAnytime: "Jederzeit kündbar",
  currentPlan: "Aktueller Tarif",
  choose: "Auswählen",
  manage: "Abo verwalten",
  trialCta: (d) => `${d} Tage unbegrenzt testen`,
  trialNote: "Gratis, ohne Karte, einmalig. Danach automatisch Free.",
  trialActive: (d) => (d === 1 ? "Dein Test läuft noch 1 Tag: alles unbegrenzt." : `Dein Test läuft noch ${d} Tage: alles unbegrenzt.`),
  trialBanner: (d) => (d === 1 ? "Dir bleibt noch 1 Testtag" : `Dir bleiben noch ${d} Testtage`),
  trialBannerCta: "Tarif wählen",
  trialStarted: (d) => `Dein Test läuft: ${d} Tage unbegrenzt.`,
  trialError: "Der Test konnte nicht gestartet werden. Bitte später erneut versuchen.",
  creditsTitle: "Credits einzeln",
  creditsLine: (p, v, c) => `${p} für ${v} Videos oder ${c} Chats`,
  creditsNever: "Einmalzahlung, kein Abo. Credits verfallen nie.",
  creditsBuy: "Credits kaufen",
  creditsSoon: "Bald verfügbar",
  usage: "Dein Verbrauch diesen Monat",
  unlimited: "unbegrenzt",
  activeUntil: (d) => `Aktiv bis ${d}`,
  payments: "Akzeptierte Zahlungsmethoden",
  checkoutError: "Der Bezahlvorgang konnte nicht gestartet werden. Bitte später erneut versuchen.",
  portalError: "Das Kundenportal ist gerade nicht erreichbar.",
  paid: "Zahlung erhalten. Dein Zugang wird gerade freigeschaltet …",
  metric: { chat: "Chats", exercise: "Übungen", video: "Videos", formulas: "Formelsammlungen", documents: "Dokumente" },
  wallTitle: (m) =>
    m === "video" ? "Deine Videos für diesen Monat sind aufgebraucht"
    : m === "exercise" ? "Deine Übungen für diesen Monat sind aufgebraucht"
    : m === "formulas" ? "Deine Formelsammlungen für diesen Monat sind aufgebraucht"
    : m === "documents" ? "Dein Dokumentenspeicher ist voll"
    : "Deine Chats für diesen Monat sind aufgebraucht",
  wallUsed: (u, l, m) => `${u} / ${l} ${de.metric[m]}`,
  wallBody: "Du bist mitten im Lernen. So geht es sofort weiter:",
  wallPaidBody: "Dein Monatskontingent ist aufgebraucht. Mit Credits geht es sofort weiter:",
  wallStudent: (p) => `Student freischalten · ab ${p} / Monat`,
  wallStudentSub: (c, v, e) => `${c} Chats, ${v} Videos, ${e} Übungen pro Monat`,
  wallTrial: (d) => `${d} Tage unbegrenzt testen`,
  wallTrialSub: "Gratis, ohne Karte.",
  wallCredits: (p) => `Credits kaufen · ${p}`,
  wallCreditsSub: (v, c) => `${v} Videos oder ${c} Chats. Verfallen nie.`,
  wallWatch: (c) => `Video ansehen, ${c} Credit erhalten`,
  wallLater: "Später",
  betaBanner: "Beta-Phase: TRED ist für alle Studierenden 100 % kostenlos. Abonnements gibt es zum offiziellen Start.",
  atLaunch: "Zum offiziellen Start",
  wallBetaTitle: "Sicherheitsgrenze der Beta erreicht",
  wallBetaBody: "TRED ist in der Beta kostenlos. Diese Grenze schützt nur vor Missbrauch und wird am 1. des Monats zurückgesetzt. Schreib uns über „Feedback“, wenn du mehr brauchst.",
  ok: "Verstanden",
};

const en: PricingCopy = {
  title: "Choose your plan",
  subtitle: "Built for students. Cancel anytime.",
  perMonth: "/ month",
  every6Months: (p) => `${p} every 6 months`,
  insteadOf: (p) => `instead of ${p}`,
  free: "Free",
  freeDesc: "To get to know TRED.",
  monthly: "Student · monthly",
  monthlyDesc: "Flexible, month by month.",
  semester: "Student · semester",
  semesterDesc: "A whole semester of exam preparation.",
  bestValue: "Most popular",
  chats: (n) => `${n} chats per month`,
  videos: (n) => `${n} explainer videos per month`,
  exercises: (n) => `${n} exercises per month`,
  documents: (n) => `${n} documents`,
  noAds: "No ads",
  cancelAnytime: "Cancel anytime",
  currentPlan: "Current plan",
  choose: "Choose",
  manage: "Manage subscription",
  trialCta: (d) => `Try ${d} days unlimited`,
  trialNote: "Free, no card, once. Then automatically Free.",
  trialActive: (d) => (d === 1 ? "1 day left in your trial: everything unlimited." : `${d} days left in your trial: everything unlimited.`),
  trialBanner: (d) => (d === 1 ? "You have 1 trial day left" : `You have ${d} trial days left`),
  trialBannerCta: "Choose a plan",
  trialStarted: (d) => `Your trial is running: ${d} days unlimited.`,
  trialError: "The trial could not be started. Please try again later.",
  creditsTitle: "Pay-as-you-go credits",
  creditsLine: (p, v, c) => `${p} for ${v} videos or ${c} chats`,
  creditsNever: "One-time payment, no subscription. Credits never expire.",
  creditsBuy: "Buy credits",
  creditsSoon: "Available soon",
  usage: "Your usage this month",
  unlimited: "unlimited",
  activeUntil: (d) => `Active until ${d}`,
  payments: "Accepted payment methods",
  checkoutError: "Checkout could not be started. Please try again later.",
  portalError: "The customer portal is not reachable right now.",
  paid: "Payment received. Your access is being activated …",
  metric: { chat: "chats", exercise: "exercises", video: "videos", formulas: "formula sheets", documents: "documents" },
  wallTitle: (m) =>
    m === "video" ? "You've used your videos for this month"
    : m === "exercise" ? "You've used your exercises for this month"
    : m === "formulas" ? "You've used your formula sheets for this month"
    : m === "documents" ? "Your document storage is full"
    : "You've used your chats for this month",
  wallUsed: (u, l, m) => `${u} / ${l} ${en.metric[m]}`,
  wallBody: "You're in the middle of studying. Here's how to keep going right now:",
  wallPaidBody: "Your monthly allowance is used up. Credits keep you going right now:",
  wallStudent: (p) => `Unlock Student · from ${p} / month`,
  wallStudentSub: (c, v, e) => `${c} chats, ${v} videos, ${e} exercises per month`,
  wallTrial: (d) => `Try ${d} days unlimited`,
  wallTrialSub: "Free, no card.",
  wallCredits: (p) => `Buy credits · ${p}`,
  wallCreditsSub: (v, c) => `${v} videos or ${c} chats. They never expire.`,
  wallWatch: (c) => `Watch a video, get ${c} credit`,
  wallLater: "Later",
  betaBanner: "Beta phase: TRED is 100% free for all students. Subscriptions will be available at the official launch.",
  atLaunch: "At the official launch",
  wallBetaTitle: "Beta safety limit reached",
  wallBetaBody: "TRED is free during the beta. This limit only protects against abuse and resets on the 1st of the month. Tell us through “Feedback” if you need more.",
  ok: "Got it",
};

const fr: PricingCopy = {
  title: "Choisis ton offre",
  subtitle: "Pensé pour les étudiants. Résiliable à tout moment.",
  perMonth: "/ mois",
  every6Months: (p) => `${p} tous les 6 mois`,
  insteadOf: (p) => `au lieu de ${p}`,
  free: "Free",
  freeDesc: "Pour découvrir TRED.",
  monthly: "Étudiant · mensuel",
  monthlyDesc: "Flexible, mois après mois.",
  semester: "Étudiant · semestriel",
  semesterDesc: "Tout un semestre de préparation aux examens.",
  bestValue: "Le plus choisi",
  chats: (n) => `${n} chats par mois`,
  videos: (n) => `${n} vidéos explicatives par mois`,
  exercises: (n) => `${n} exercices par mois`,
  documents: (n) => `${n} documents`,
  noAds: "Sans publicité",
  cancelAnytime: "Résiliable à tout moment",
  currentPlan: "Offre actuelle",
  choose: "Choisir",
  manage: "Gérer mon abonnement",
  trialCta: (d) => `Essayer ${d} jours en illimité`,
  trialNote: "Gratuit, sans carte, une seule fois. Ensuite, retour automatique à Free.",
  trialActive: (d) => (d === 1 ? "Il te reste 1 jour d'essai : tout est illimité." : `Il te reste ${d} jours d'essai : tout est illimité.`),
  trialBanner: (d) => (d === 1 ? "Il te reste 1 jour d'essai" : `Il te reste ${d} jours d'essai`),
  trialBannerCta: "Choisir mon offre",
  trialStarted: (d) => `Ton essai est lancé : ${d} jours en illimité.`,
  trialError: "L'essai n'a pas pu démarrer. Réessaie plus tard.",
  creditsTitle: "Crédits à l'unité",
  creditsLine: (p, v, c) => `${p} pour ${v} vidéos ou ${c} chats`,
  creditsNever: "Paiement unique, sans abonnement. Les crédits n'expirent jamais.",
  creditsBuy: "Acheter des crédits",
  creditsSoon: "Bientôt disponible",
  usage: "Ta consommation ce mois-ci",
  unlimited: "illimité",
  activeUntil: (d) => `Actif jusqu'au ${d}`,
  payments: "Moyens de paiement acceptés",
  checkoutError: "Le paiement n'a pas pu démarrer. Réessaie plus tard.",
  portalError: "Le portail client est momentanément indisponible.",
  paid: "Paiement reçu. Ton accès est en cours d'activation …",
  metric: { chat: "chats", exercise: "exercices", video: "vidéos", formulas: "formulaires", documents: "documents" },
  wallTitle: (m) =>
    m === "video" ? "Tu as utilisé tes vidéos du mois"
    : m === "exercise" ? "Tu as utilisé tes exercices du mois"
    : m === "formulas" ? "Tu as utilisé tes formulaires du mois"
    : m === "documents" ? "Ton espace de documents est plein"
    : "Tu as utilisé tes chats du mois",
  wallUsed: (u, l, m) => `${u} / ${l} ${fr.metric[m]}`,
  wallBody: "Tu es en plein apprentissage. Voici comment continuer tout de suite :",
  wallPaidBody: "Ton forfait du mois est épuisé. Avec des crédits, tu continues tout de suite :",
  wallStudent: (p) => `Passer à Étudiant · dès ${p} / mois`,
  wallStudentSub: (c, v, e) => `${c} chats, ${v} vidéos, ${e} exercices par mois`,
  wallTrial: (d) => `Essayer ${d} jours en illimité`,
  wallTrialSub: "Gratuit, sans carte.",
  wallCredits: (p) => `Acheter des crédits · ${p}`,
  wallCreditsSub: (v, c) => `${v} vidéos ou ${c} chats. Ils n'expirent jamais.`,
  wallWatch: (c) => `Regarder une vidéo, recevoir ${c} crédit`,
  wallLater: "Plus tard",
  betaBanner: "Phase de Bêta : TRED est 100% gratuit pour tous les étudiants. Les abonnements seront disponibles au lancement officiel.",
  atLaunch: "Au lancement officiel",
  wallBetaTitle: "Limite de sécurité de la bêta atteinte",
  wallBetaBody: "TRED est gratuit pendant la bêta. Cette limite protège seulement contre les abus et repart à zéro le 1er du mois. Écris-nous via « Feedback » si tu as besoin de plus.",
  ok: "Compris",
};

export function pricingCopy(locale: string): PricingCopy {
  return locale === "de" ? de : locale === "fr" ? fr : en;
}

/** Un montant en centimes, écrit dans la langue de l'interface. Les centimes ne sont masqués que s'ils sont nuls. */
export function formatMoney(cents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

interface OfferLike {
  interval: "monthly" | "semester";
  priceId: string;
  amount: number;
  currency: string;
  months: number;
}
interface PricingLike {
  currency: string;
  monthly: { amount: number; months: number };
  semester: { amount: number; months: number; badge: string };
  creditPack: { amount: number; credits: number };
}

export interface ResolvedPrices {
  currency: string;
  monthly: { amount: number; priceId: string | null };
  semester: { amount: number; months: number; perMonth: number; badge: string; priceId: string | null };
}

/**
 * Les prix à afficher : ceux de Stripe quand ils sont configurés (ce sont eux
 * qui seront encaissés), sinon la grille de référence du serveur. Pure (testée).
 * Le « par mois » du semestriel est tronqué au centime, jamais arrondi au-dessus.
 */
export function resolvePrices(pricing: PricingLike, offers: OfferLike[]): ResolvedPrices {
  const m = offers.find((o) => o.interval === "monthly");
  const s = offers.find((o) => o.interval === "semester");
  const semAmount = s?.amount ?? pricing.semester.amount;
  const semMonths = s?.months ?? pricing.semester.months;
  return {
    currency: (m ?? s)?.currency ?? pricing.currency,
    monthly: { amount: m?.amount ?? pricing.monthly.amount, priceId: m?.priceId ?? null },
    semester: {
      amount: semAmount,
      months: semMonths,
      perMonth: Math.floor(semAmount / semMonths),
      badge: pricing.semester.badge,
      priceId: s?.priceId ?? null,
    },
  };
}
