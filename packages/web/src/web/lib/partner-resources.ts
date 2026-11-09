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
  woehe: {
    id: "woehe-bwl",
    title: "Wöhe: Allgemeine Betriebswirtschaftslehre",
    why: "Die BWL-Grundlage für Wirtschaftsingenieure.",
    query: "Wöhe Einführung in die Allgemeine Betriebswirtschaftslehre",
    icon: "book",
  },
  atkins: {
    id: "atkins",
    title: "Atkins: Physikalische Chemie",
    why: "Thermodynamik, Kinetik, Gleichgewichte — der Standard.",
    query: "Atkins Physikalische Chemie",
    icon: "book",
  },
  baerns: {
    id: "baerns-technische-chemie",
    title: "Baerns: Technische Chemie",
    why: "Reaktionstechnik und Grundoperationen der Verfahrenstechnik.",
    query: "Baerns Technische Chemie",
    icon: "book",
  },
  foerstner: {
    id: "foerstner-umwelt",
    title: "Förstner: Umweltschutztechnik",
    why: "Wasser, Luft, Boden, Abfall — der Überblick fürs Studium.",
    query: "Förstner Umweltschutztechnik",
    icon: "book",
  },
  kramme: {
    id: "kramme-medizintechnik",
    title: "Kramme: Medizintechnik",
    why: "Verfahren, Systeme und Geräte — das Referenzwerk.",
    query: "Kramme Medizintechnik Verfahren Systeme",
    icon: "book",
  },
  weber: {
    id: "weber-industrieroboter",
    title: "Weber: Industrieroboter",
    why: "Kinematik, Steuerung und Programmierung von Robotern.",
    query: "Wolfgang Weber Industrieroboter",
    icon: "book",
  },
  mckinney: {
    id: "mckinney-python",
    title: "Datenanalyse mit Python (McKinney)",
    why: "pandas, NumPy, Visualisierung — vom Autor von pandas.",
    query: "McKinney Datenanalyse mit Python",
    icon: "book",
  },
  geron: {
    id: "geron-ml",
    title: "Praxiseinstieg Machine Learning (Géron)",
    why: "Scikit-Learn und neuronale Netze, Schritt für Schritt.",
    query: "Géron Praxiseinstieg Machine Learning",
    icon: "book",
  },
  arens: {
    id: "arens-mathematik",
    title: "Arens et al.: Mathematik",
    why: "Analysis und lineare Algebra in einem Band, ausführlich erklärt.",
    query: "Arens Hettlich Mathematik",
    icon: "book",
  },
  neufert: {
    id: "neufert",
    title: "Neufert: Bauentwurfslehre",
    why: "Maße, Grundrisse, Normen — das Handbuch jedes Architekturstudiums.",
    query: "Neufert Bauentwurfslehre",
    icon: "book",
  },
  modellbau: {
    id: "architektur-modellbau",
    title: "Modellbau-Set für Architektur",
    why: "Schneidematte, Cutter, Pappe — für Entwurfsmodelle.",
    query: "Architektur Modellbau Set Schneidematte Cutter",
    icon: "tool",
  },
  // Hors ingénierie (2026-11-09) : des classiques réels des cursus allemands.
  sobotta: {
    id: "sobotta",
    title: "Sobotta: Atlas der Anatomie",
    why: "Der Anatomie-Atlas für Präparierkurs und Physikum.",
    query: "Sobotta Atlas der Anatomie",
    icon: "book",
  },
  silbernagl: {
    id: "silbernagl-physiologie",
    title: "Silbernagl: Taschenatlas Physiologie",
    why: "Physiologie kompakt, Bild und Text auf einer Doppelseite.",
    query: "Silbernagl Taschenatlas Physiologie",
    icon: "book",
  },
  herold: {
    id: "herold-innere",
    title: "Herold: Innere Medizin",
    why: "Das Standardwerk für die Innere — jedes Jahr aktualisiert.",
    query: "Herold Innere Medizin",
    icon: "book",
  },
  schoenfelder: {
    id: "schoenfelder",
    title: "Schönfelder: Deutsche Gesetze",
    why: "Die Gesetzessammlung, die in den Klausuren auf dem Tisch liegt.",
    query: "Schönfelder Deutsche Gesetze",
    icon: "book",
  },
  brox: {
    id: "brox-bgb-at",
    title: "Brox/Walker: Allgemeiner Teil des BGB",
    why: "Der Einstieg ins Zivilrecht, mit Fällen zum Üben.",
    query: "Brox Walker Allgemeiner Teil des BGB",
    icon: "book",
  },
  creifelds: {
    id: "creifelds",
    title: "Creifelds: Rechtswörterbuch",
    why: "Jeder Rechtsbegriff kurz und verlässlich erklärt.",
    query: "Creifelds Rechtswörterbuch",
    icon: "book",
  },
  mankiw: {
    id: "mankiw-vwl",
    title: "Mankiw/Taylor: Grundzüge der Volkswirtschaftslehre",
    why: "Die VWL-Einführung mit vielen Beispielen.",
    query: "Mankiw Taylor Grundzüge der Volkswirtschaftslehre",
    icon: "book",
  },
  coenenberg: {
    id: "coenenberg",
    title: "Coenenberg: Jahresabschluss und Jahresabschlussanalyse",
    why: "Rechnungswesen und Bilanzanalyse, Schritt für Schritt.",
    query: "Coenenberg Jahresabschluss und Jahresabschlussanalyse",
    icon: "book",
  },
} satisfies Record<string, PartnerResource>;

export const RESOURCES_BY_CATEGORY: Record<BackgroundCategory, PartnerResource[]> = {
  general: [R.casio, R.papula, R.gross],
  aerospace: [R.casio, R.gross, R.aero],
  mechanical: [R.casio, R.roloff, R.dubbel],
  mechatronics: [R.arduino, R.roloff, R.hagmann],
  robotics: [R.weber, R.arduino, R.papula],
  architecture: [R.neufert, R.modellbau, R.schneider],
  industrial: [R.woehe, R.papula, R.casio],
  chemical: [R.atkins, R.baerns, R.casio],
  environmental: [R.foerstner, R.papula, R.casio],
  biomedical: [R.kramme, R.hagmann, R.casio],
  datascience: [R.mckinney, R.geron, R.papula],
  mathematics: [R.arens, R.papula, R.casio],
  electrical: [R.hagmann, R.tietze, R.multimeter],
  civil: [R.schneider, R.gross, R.casio],
  informatics: [R.cleanCode, R.papula, R.casio],
  physics: [R.tipler, R.papula, R.casio],
  medicine: [R.sobotta, R.silbernagl, R.herold],
  law: [R.schoenfelder, R.brox, R.creifelds],
  economics: [R.woehe, R.mankiw, R.coenenberg],
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
