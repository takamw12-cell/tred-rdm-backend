/**
 * Pages publiques pré-rendues (scripts/prerender.mjs) et leurs métadonnées.
 *
 * Seules les pages accessibles SANS compte sont ici. /dashboard, /chat,
 * /exercises, /settings affichent l'écran de connexion à tout visiteur — un
 * robot n'y verrait que ce formulaire — et un pré-rendu connecté figerait
 * les données d'un compte dans un fichier public. Elles restent en SPA.
 *
 * `/` montre la landing à un visiteur sans session (le Dashboard sinon). Son
 * pré-rendu va dans dist/prerendered/index.html — PAS dans dist/index.html,
 * le repli de toutes les routes de l'app — et le serveur ne le sert qu'aux
 * requêtes sans cookie de session (robots, visiteurs) : un étudiant connecté
 * reçoit le shell vide, sans landing qui clignote avant son Dashboard.
 *
 * /landing affiche la même page : canonical vers `/`, hors du sitemap
 * (`sitemap: false`), pour que Google n'y voie pas un doublon.
 */
export const SITE = (process.env.VITE_WEBSITE_URL || process.env.SITE_URL || "https://www.tred-tutor.de").replace(/\/+$/, "");

export const ROUTES = [
  {
    path: "/",
    lang: "fr",
    title: "TRED — le tuteur IA des étudiants en ingénierie en Allemagne",
    description:
      "TRED lit ton propre polycopié, cite la page de cours de chaque réponse et trace les diagrammes N, T, M exacts avec un solveur RDM. Conçu pour les étudiants en ingénierie en Allemagne.",
    priority: "1.0",
  },
  {
    path: "/landing",
    lang: "fr",
    title: "TRED — le tuteur IA des étudiants en ingénierie en Allemagne",
    description:
      "TRED lit ton propre polycopié, cite la page de cours de chaque réponse et trace les diagrammes N, T, M exacts avec un solveur RDM. Conçu pour les étudiants en ingénierie en Allemagne.",
    priority: "1.0",
    canonical: "/",
    sitemap: false,
  },
  {
    path: "/security",
    lang: "de",
    title: "Sicherheit & Datenschutz — TRED",
    description:
      "Wie TRED deine Daten schützt: Hosting in der EU, verschlüsselte Übertragung, DSGVO-konforme Verarbeitung — und was wir ausdrücklich nicht versprechen.",
    priority: "0.6",
  },
  {
    path: "/datenschutz",
    lang: "de",
    title: "Datenschutzerklärung — TRED",
    description: "Datenschutzerklärung von TRED, dem KI-Tutor für das Ingenieurstudium: welche Daten wir verarbeiten, wozu, auf welcher Rechtsgrundlage und wie lange.",
    priority: "0.4",
  },
  {
    path: "/impressum",
    lang: "de",
    title: "Impressum — TRED",
    description: "Impressum und Anbieterkennzeichnung von TRED nach § 5 DDG.",
    priority: "0.3",
  },
  {
    path: "/agb",
    lang: "de",
    title: "Allgemeine Geschäftsbedingungen — TRED",
    description: "Allgemeine Geschäftsbedingungen von TRED: Leistungen, Tarife, Laufzeit, Kündigung und Haftung.",
    priority: "0.3",
  },
  {
    path: "/widerruf",
    lang: "de",
    title: "Widerrufsbelehrung — TRED",
    description: "Widerrufsbelehrung und Muster-Widerrufsformular für die Abonnements von TRED.",
    priority: "0.3",
  },
];

/** « /landing » → « landing » : nom du fichier dans dist/prerendered/. */
export const fileNameFor = (path) => (path === "/" ? "index" : path.replace(/^\/+|\/+$/g, ""));
