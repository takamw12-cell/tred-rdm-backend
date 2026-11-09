import type { SpecializationFamily, Subdomain, SubdomainId } from "./specializations/types";

/**
 * Les sous-domaines et leur MÉTHODE. Chargés seulement quand une question
 * relève d'une spécialisation avancée (specialization-router.ts) : ils
 * précisent la méthode de la famille (domains/law.ts, medicine.ts…), ils ne
 * la remplacent pas.
 */
export const SUBDOMAINS: Readonly<Record<SubdomainId, Subdomain>> = {
  // ── Ingénierie (famille stem) ──────────────────────────────────────────
  aerospace: {
    id: "aerospace",
    family: "stem",
    label: "Luft- und Raumfahrttechnik",
    method:
      "Strömungsmodell zuerst festlegen (reibungsfrei/reibungsbehaftet, inkompressibel/kompressibel, 2D/3D) und begründen. " +
      "Kennzahlen (Re, Ma, Anstellwinkel) bestimmen, bevor eine Formel benutzt wird; Beiwerte nur aus Skript, Profildaten oder Messung. " +
      "Gültigkeitsgrenzen jeder Näherung nennen (z. B. dünne Profiltheorie nur für kleine Anstellwinkel, kein Strömungsabriss).",
    tools: ["suche_in_unterlagen", "rechnen", "physik_berechnen", "thermo_berechnen", "skizze"],
    rag: "Aerodynamik-, Flugmechanik- und Strömungslehre-Skripte, Profilkataloge (NACA), Formelsammlungen.",
  },
  fluid_dynamics: {
    id: "fluid_dynamics",
    family: "stem",
    label: "Strömungsmechanik",
    method:
      "Kontrollvolumen und Bilanzen (Masse, Impuls, Energie) explizit aufstellen. " +
      "Kompressibel ab Ma ≈ 0,3: Ruhegrößen, Isentropenbeziehungen, Stoßbeziehungen, Fanno/Rayleigh sauber unterscheiden. " +
      "Jede Annahme (adiabat, reibungsfrei, ideales Gas, κ) hinschreiben; Zustandsgrößen mit thermo_berechnen bzw. rechnen.",
    tools: ["suche_in_unterlagen", "rechnen", "thermo_berechnen", "physik_berechnen", "skizze"],
    rag: "Strömungslehre- und Gasdynamik-Skripte, Tabellen der Stoß- und Isentropenbeziehungen.",
  },
  mechanical: {
    id: "mechanical",
    family: "stem",
    label: "Maschinenbau",
    method:
      "Modellbildung vor Rechnung: Randbedingungen, Lasten, Werkstoffgesetz, Vereinfachungen. " +
      "Bei numerischen Verfahren (FEM) Diskretisierung, Elementtyp und Konvergenz diskutieren und Ergebnisse mit einer Handrechnung plausibilisieren. " +
      "Nachweise immer gegen zulässige Werte aus Norm oder Skript führen.",
    tools: ["suche_in_unterlagen", "rechnen", "statik_berechnen", "balkenstatik", "werkstoff_berechnen", "mathe_berechnen", "skizze"],
    rag: "Technische Mechanik, Maschinenelemente, FEM-Skripte, Normen und Tabellenbücher.",
  },
  electrical: {
    id: "electrical",
    family: "stem",
    label: "Elektrotechnik",
    method:
      "Schaltungstopologie und Betriebsart (lückend/nichtlückend, stationär/transient) zuerst festlegen. " +
      "Idealisierungen (ideale Schalter, verlustfreie Bauteile) ausdrücklich nennen und anschließend Verluste getrennt abschätzen. " +
      "Strom- und Spannungsverläufe als Skizze zeigen; Werte mit elektro_berechnen oder schaltung_berechnen prüfen.",
    tools: ["suche_in_unterlagen", "rechnen", "elektro_berechnen", "schaltung_berechnen", "skizze"],
    rag: "Skripte zu Leistungselektronik, elektrischen Maschinen und Netzen, Datenblätter.",
  },
  civil: {
    id: "civil",
    family: "stem",
    label: "Bauingenieurwesen",
    method:
      "Nachweis nach Norm führen (Eurocode, nationaler Anhang): Einwirkungen, Teilsicherheitsbeiwerte, Bemessungswerte, Nachweis Ed ≤ Rd. " +
      "Statisches System und Lastannahmen zuerst skizzieren; Schnittgrößen mit statik_berechnen oder balkenstatik, nie geschätzt. " +
      "Normstellen nur zitieren, wenn sie in den Unterlagen stehen.",
    tools: ["suche_in_unterlagen", "rechnen", "statik_berechnen", "balkenstatik", "werkstoff_berechnen", "skizze"],
    rag: "Massivbau- und Stahlbetonbau-Skripte, Bemessungstabellen, Eurocode-Auszüge.",
  },

  // ── Droit ──────────────────────────────────────────────────────────────
  corporate: {
    id: "corporate",
    family: "law",
    label: "Gesellschaftsrecht",
    method:
      "Zuerst die Rechtsform bestimmen (GbR, OHG, KG, GmbH, AG …) und das einschlägige Gesetz (BGB, HGB, GmbHG, AktG, UmwG). " +
      "Innen- und Außenverhältnis trennen; Haftung (Gesellschaft, Gesellschafter, Organe) im Gutachtenstil prüfen. " +
      "Normen nur mit genauer Fundstelle und nur aus den Unterlagen oder einer belegten Recherche.",
    tools: ["suche_in_unterlagen", "recherche_connaissances_externes", "evaluate_structure"],
    rag: "Gesellschaftsrechts-Skripte, Gesetzestexte (GmbHG, AktG, HGB), Fallsammlungen.",
  },
  criminal: {
    id: "criminal",
    family: "law",
    label: "Strafrecht",
    method:
      "Deliktsaufbau einhalten: Tatbestand (objektiv, subjektiv) → Rechtswidrigkeit → Schuld, ggf. Strafzumessung. " +
      "Beteiligungsform (Täterschaft, Teilnahme) und Versuch/Rücktritt an der richtigen Stelle prüfen. " +
      "Streitstände nur darstellen, wenn sie für das Ergebnis erheblich sind; Normen mit Fundstelle.",
    tools: ["suche_in_unterlagen", "recherche_connaissances_externes", "evaluate_structure"],
    rag: "Strafrechts-Skripte (AT/BT), StGB, Fallsammlungen.",
  },
  international: {
    id: "international",
    family: "law",
    label: "Völkerrecht",
    method:
      "Rechtsquelle bestimmen (Vertrag, Völkergewohnheitsrecht, allgemeine Rechtsgrundsätze, Art. 38 IGH-Statut). " +
      "Völkerrechtssubjekt, Zurechnung und Rechtfertigung getrennt prüfen; Rechtsprechung (IGH) nur belegt zitieren. " +
      "Völkerrecht klar vom Unionsrecht und vom nationalen Recht abgrenzen.",
    tools: ["suche_in_unterlagen", "recherche_connaissances_externes", "evaluate_structure"],
    rag: "Völkerrechts-Skripte, UN-Charta, WVK, Entscheidungssammlungen.",
  },

  // ── Médecine ───────────────────────────────────────────────────────────
  cardiology: {
    id: "cardiology",
    family: "medicine",
    label: "Kardiologie",
    method:
      "Pathophysiologie → Leitsymptome → Diagnostik (EKG, Labor, Bildgebung) → Therapie entlang der Leitlinie. " +
      "Leitlinienempfehlungen und Grenzwerte NUR mit Quelle (Unterlagen oder belegte Recherche) und mit Jahr der Leitlinie. " +
      "Dosierungen mit rechnen prüfen; Lernhilfe, keine Behandlungsempfehlung für reale Personen.",
    tools: ["suche_in_unterlagen", "recherche_connaissances_externes", "evaluate_structure", "rechnen"],
    rag: "Kardiologie- und Innere-Medizin-Skripte, Leitlinien (ESC/DGK), EKG-Atlanten.",
  },
  neurology: {
    id: "neurology",
    family: "medicine",
    label: "Neurologie",
    method:
      "Topische Diagnostik zuerst: Wo liegt die Läsion (Symptome → anatomische Struktur)? Dann Ätiologie und Differenzialdiagnosen. " +
      "Zeitfenster und Leitlinien (z. B. Lyse beim Schlaganfall) nur mit Quelle. " +
      "Lernhilfe, keine Diagnose für reale Personen; bei akuten eigenen Symptomen auf 112 verweisen.",
    tools: ["suche_in_unterlagen", "recherche_connaissances_externes", "evaluate_structure"],
    rag: "Neurologie- und Neuroanatomie-Skripte, Leitlinien (DGN), Bildgebungsatlanten.",
  },
  surgery: {
    id: "surgery",
    family: "medicine",
    label: "Chirurgie",
    method:
      "Indikation → Aufklärung → Verfahrenswahl (offen/laparoskopisch) → Komplikationen → Nachsorge. " +
      "Anatomische Landmarken und Risiken des Eingriffs benennen; Klassifikationen nur aus den Unterlagen. " +
      "Lernhilfe, keine Operationsempfehlung für reale Personen.",
    tools: ["suche_in_unterlagen", "recherche_connaissances_externes", "evaluate_structure"],
    rag: "Chirurgie- und Anatomie-Skripte, OP-Lehre, Leitlinien.",
  },
};

/** Libellé de la famille dans le prompt. */
export const FAMILY_LABEL: Readonly<Record<SpecializationFamily, string>> = {
  stem: "Ingenieurwissenschaften",
  law: "Recht",
  medicine: "Medizin",
};
