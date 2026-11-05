/**
 * Ressources partenaires — recommandations adaptées à la filière.
 *
 * Choix délibérés :
 *  - Des LIENS DE RECHERCHE Amazon (« ?k=… »), pas des fiches produit : aucun
 *    numéro d'article inventé qui mènerait vers un mauvais produit ou une
 *    page morte. Les titres sont des classiques réels des cursus allemands.
 *  - Le tag partenaire vient de VITE_AMAZON_PARTNER_TAG. Sans tag, les liens
 *    restent de simples recommandations, rien n'est monétisé.
 *  - Droit allemand (§ 5a Abs. 4 UWG, § 6 DDG) : la publicité est marquée
 *    « Anzeige » et les liens portent rel="sponsored". Le texte d'Amazon
 *    (« Als Amazon-Partner verdienen wir… ») s'affiche dès qu'un tag existe.
 *  - Aucun tracking tiers : pas de script, pas de pixel. Le clic n'est
 *    compté (PostHog) que si l'étudiant a consenti à l'analyse.
 *
 * Module pur, testé dans tests/partner-resources.test.ts.
 */
import type { BackgroundCategory } from "./background-sets";

export interface PartnerResource {
  id: string;
  title: string;
  /** Pourquoi c'est utile, en une ligne (allemand, comme le cursus). */
  why: string;
  query: string;
  icon: "calculator" | "book" | "tool";
}

const R = {
  casio: {
    id: "casio-fx991",
    title: "Casio FX-991DE CW",
    why: "Beliebter Taschenrechner fürs Studium — Zulassung für deine Klausur bitte prüfen.",
    query: "Casio FX-991DE CW",
    icon: "calculator",
  },
  papula: {
    id: "papula",
    title: "Papula: Mathematik für Ingenieure",
    why: "Der Klassiker für Analysis, DGL und lineare Algebra im Grundstudium.",
    query: "Papula Mathematik für Ingenieure und Naturwissenschaftler",
    icon: "book",
  },
  gross: {
    id: "gross-tm",
    title: "Gross/Hauger: Technische Mechanik",
    why: "Statik, Elastostatik, Kinetik — mit vielen gelösten Aufgaben.",
    query: "Gross Hauger Schröder Wall Technische Mechanik",
    icon: "book",
  },
  roloff: {
    id: "roloff-matek",
    title: "Roloff/Matek Maschinenelemente",
    why: "Tabellenbuch und Formelsammlung für Konstruktion und Auslegung.",
    query: "Roloff Matek Maschinenelemente",
    icon: "book",
  },
  dubbel: {
    id: "dubbel",
    title: "Dubbel — Taschenbuch für den Maschinenbau",
    why: "Das Nachschlagewerk für fast jedes Fach im Maschinenbau.",
    query: "Dubbel Taschenbuch für den Maschinenbau",
    icon: "book",
  },
  hagmann: {
    id: "hagmann",
    title: "Hagmann: Grundlagen der Elektrotechnik",
    why: "Gleich- und Wechselstrom, Felder — klar erklärt, mit Aufgaben.",
    query: "Hagmann Grundlagen der Elektrotechnik",
    icon: "book",
  },
  tietze: {
    id: "tietze-schenk",
    title: "Tietze/Schenk: Halbleiter-Schaltungstechnik",
    why: "Für Elektronik, OPV und Schaltungsentwurf in höheren Semestern.",
    query: "Tietze Schenk Halbleiter-Schaltungstechnik",
    icon: "book",
  },
  multimeter: {
    id: "multimeter",
    title: "Digitalmultimeter fürs Labor",
    why: "Für Praktika und eigene Schaltungen zu Hause.",
    query: "Digitalmultimeter True RMS Elektronik",
    icon: "tool",
  },
  arduino: {
    id: "arduino-kit",
    title: "Arduino-Starterkit",
    why: "Sensoren, Motoren, Regelung — Mechatronik zum Anfassen.",
    query: "Arduino Starter Kit",
    icon: "tool",
  },
  aero: {
    id: "aerodynamik",
    title: "Aerodynamik des Flugzeugs",
    why: "Profile, Auftrieb, Widerstand — die Grundlagen für LRT.",
    query: "Aerodynamik des Flugzeugs Lehrbuch",
    icon: "book",
  },
  schneider: {
    id: "schneider-bautabellen",
    title: "Schneider: Bautabellen für Ingenieure",
    why: "Das Standard-Tabellenwerk im Bauingenieurwesen.",
    query: "Schneider Bautabellen für Ingenieure",
    icon: "book",
  },
  cleanCode: {
    id: "clean-code",
    title: "Clean Code (Robert C. Martin)",
    why: "Lesbarer Code — in jedem Programmierpraktikum Gold wert.",
    query: "Clean Code Robert Martin deutsch",
    icon: "book",
  },
  tipler: {
    id: "tipler",
    title: "Tipler: Physik für Studierende",
    why: "Mechanik bis Quantenphysik, mit vielen Beispielen.",
    query: "Tipler Mosca Physik für Studierende",
    icon: "book",
  },
} satisfies Record<string, PartnerResource>;

export const RESOURCES_BY_CATEGORY: Record<BackgroundCategory, PartnerResource[]> = {
  general: [R.casio, R.papula, R.gross],
  aerospace: [R.casio, R.gross, R.aero],
  mechanical: [R.casio, R.roloff, R.dubbel],
  mechatronics: [R.arduino, R.roloff, R.hagmann],
  electrical: [R.hagmann, R.tietze, R.multimeter],
  civil: [R.schneider, R.gross, R.casio],
  informatics: [R.cleanCode, R.papula, R.casio],
  physics: [R.tipler, R.papula, R.casio],
};

export function resourcesFor(category: BackgroundCategory): PartnerResource[] {
  return RESOURCES_BY_CATEGORY[category] ?? RESOURCES_BY_CATEGORY.general;
}

/** Lien de recherche Amazon.de, avec le tag partenaire s'il est configuré. */
export function partnerUrl(r: PartnerResource, tag?: string | null): string {
  const u = new URL("https://www.amazon.de/s");
  u.searchParams.set("k", r.query);
  const clean = tag?.trim();
  if (clean && /^[\w-]{1,64}$/.test(clean)) u.searchParams.set("tag", clean);
  return u.toString();
}
