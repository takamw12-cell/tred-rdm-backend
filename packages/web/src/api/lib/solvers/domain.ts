/**
 * Erkennung des Fachgebiets — welcher Fachlöser passt zur Frage?
 *
 * Bewusst einfach und erklärbar: gewichtete Schlüsselwörter (de/en/fr) auf
 * der letzten Frage und dem Kursnamen. Das Ergebnis ist ein HINWEIS an das
 * Modell (zweite, nicht gecachte System-Nachricht), keine Sperre: die
 * Werkzeuge bleiben alle verfügbar, und eine Frage, die zwei Fächer berührt
 * (z. B. Wärmeleistung eines Widerstands), darf beide nutzen.
 *
 * Wichtig ist der zweite Teil: Fächer, für die es KEINEN Fachlöser gibt,
 * werden ebenfalls erkannt — damit der Tutor das offen sagt, statt so zu
 * tun, als habe ein geprüfter Löser gerechnet.
 */

export type CoveredDomain = "elektrotechnik" | "thermodynamik" | "mathematik" | "mechanik";
export type UncoveredDomain =
  | "stroemungslehre"
  | "regelungstechnik"
  | "werkstoffkunde"
  | "dampf_kaeltetechnik"
  | "informatik"
  | "chemie";
export type Domain = CoveredDomain | UncoveredDomain | "unbekannt";

/** [Muster, Gewicht]. Muster auf kleingeschriebenem Text, Umlaute erhalten. */
const KEYWORDS: Record<Exclude<Domain, "unbekannt">, [RegExp, number][]> = {
  elektrotechnik: [
    [/\b(kirchhoff|maschen(regel|gleichung|analyse)?|knoten(regel|punkt|potential)|knotenanalyse)\b/, 3],
    [/\b(spannungsteiler|stromteiler|thevenin|norton|ersatz(spannungs|strom)quelle|innenwiderstand)\b/, 3],
    [/\b(widerstand|widerstände|resistor|résistance|ohm|ω|kω|impedanz|impedance|impédance|admittanz)\b/, 2],
    [/\b(kondensator|kapazität|capacitor|condensateur|spule|induktivität|inductor|bobine)\b/, 2],
    [/\b(spannung|voltage|tension|strom(stärke)?|current|courant|wirkleistung|blindleistung)\b/, 1],
    [/\b(schaltung|stromkreis|circuit|netzwerk|wechselstrom|gleichstrom|zeiger|phasor|operationsverstärker|opv|op-amp)\b/, 2],
    [/\b(tiefpass|hochpass|schwingkreis|resonanz|grenzfrequenz)\b/, 2],
    [/\b\d+(?:[.,]\d+)?\s*(v|ma|µa|ua|kω|mω|ω|nf|µf|uf|pf|mh|µh)\b/, 2],
  ],
  thermodynamik: [
    [/\b(thermodynamik|thermodynamique|thermodynamics|hauptsatz|first law|second law|premier principe|second principe)\b/, 3],
    [/\b(isochor|isobar|isotherm|isentrop|adiabat|polytrop|zustandsänderung)\b/, 3],
    [/\b(kreisprozess|carnot|otto(prozess|-prozess)?|diesel(prozess)?|joule-prozess|brayton|clausius-rankine|wärmepumpe|kältemaschine)\b/, 3],
    [/\b(entropie|entropy|enthalpie|enthalpy|innere energie|wärmekapazität|isentropenexponent|kappa|κ)\b/, 2],
    [/\b(ideales gas|gaskonstante|ideal gas|gaz parfait|verdichter|turbine|kompressor|wirkungsgrad)\b/, 2],
    [/\b(wärme|heat|chaleur|temperatur|druck|pressure|pression)\b/, 1],
    [/\b\d+(?:[.,]\d+)?\s*(bar|kpa|mpa|°c|kj|kj\/kg)\b/, 2],
  ],
  mathematik: [
    [/\b(ableitung|ableiten|derivative|dérivée|differenzieren|integral|intégrale|stammfunktion|integrieren)\b/, 3],
    [/\b(differentialgleichung|dgl|ode|équation différentielle|anfangswert(problem)?|charakteristische gleichung)\b/, 3],
    [/\b(matrix|matrizen|matrice|determinante|déterminant|eigenwert|eigenvektor|eigenvalue|inverse|lgs|gleichungssystem)\b/, 3],
    [/\b(nullstelle|nullstellen|root|racine|grenzwert|limit|taylor|reihe)\b/, 2],
    [/\b(mathe|mathematik|mathématiques|analysis|lineare algebra)\b/, 2],
    [/(d\/dx|∫|dy\/dx|y''|y')/, 2],
  ],
  mechanik: [
    [/\b(balken|träger|beam|poutre|auflager|lager(kraft|reaktion)|einspannung|festlager|loslager)\b/, 3],
    [/\b(biegemoment|querkraft|schnittgröße|schnittgrößen|moment(en)?verlauf|streckenlast|einzellast)\b/, 3],
    [/\b(statik|mechanik|mécanique|festigkeitslehre|biegespannung|flächenträgheitsmoment)\b/, 2],
    [/\b(fachwerk|fachwerke|stabkraft|stabkräfte|nullstab|nullstäbe|knotenpunktverfahren|ritterschnitt|ritterpunkt|truss|treillis)\b/, 3],
    [/\b(reibung|haftreibung|gleitreibung|haftung|haftgrenze|schiefe ebene|reibungszahl|reibwert|friction|frottement)\b/, 3],
    [/\b(freikörperbild|freischneiden|kräftegleichgewicht|momentengleichgewicht|resultierende|kräftepaar|lagerreaktion(en)?)\b/, 2],
    [/\b\d+(?:[.,]\d+)?\s*(kn|knm|n\/mm|kn\/m)\b/, 2],
  ],
  stroemungslehre: [
    [/\b(strömungslehre|strömungsmechanik|fluidmechanik|bernoulli|reynolds|rohrströmung|druckverlust|viskosität|navier|kontinuitätsgleichung)\b/, 3],
  ],
  regelungstechnik: [
    [/\b(regelungstechnik|regelkreis|übertragungsfunktion|bode|nyquist|pid|laplace|sprungantwort|regler)\b/, 3],
  ],
  werkstoffkunde: [
    [/\b(werkstoffkunde|werkstofftechnik|gefüge|eisen-kohlenstoff|härteprüfung|zugversuch|legierung|kristallgitter)\b/, 3],
  ],
  dampf_kaeltetechnik: [
    [/\b(wasserdampf|nassdampf|dampftafel|dampfgehalt|sattdampf|überhitzter dampf|kältemittel|h,s-diagramm|log p,h)\b/, 4],
  ],
  informatik: [
    [/\b(programmieren|python-code|java|c\+\+|algorithmus|datenstruktur|sql|informatik)\b/, 3],
  ],
  chemie: [
    [/\b(chemie|stöchiometrie|reaktionsgleichung|mol\/l|ph-wert|redox|titration)\b/, 3],
  ],
};

const COVERED: ReadonlySet<Domain> = new Set<Domain>(["elektrotechnik", "thermodynamik", "mathematik", "mechanik"]);

/**
 * \b de JavaScript ne connaît que [A-Za-z0-9_] : « 10 Ω », « κ », « wärme »
 * n'auraient pas de frontière de mot. On remplace \b par des assertions
 * Unicode (lettre ou chiffre de n'importe quelle écriture).
 */
const B = "(?:(?<![\\p{L}\\p{N}])|(?![\\p{L}\\p{N}]))";
const cache = new Map<RegExp, RegExp>();
function unicodeWords(re: RegExp): RegExp {
  let r = cache.get(re);
  if (!r) {
    r = new RegExp(re.source.split("\\b").join(B), "gu");
    cache.set(re, r);
  }
  r.lastIndex = 0;
  return r;
}

export interface DomainGuess {
  domain: Domain;
  covered: boolean;
  /** Auch erkannte Nebengebiete (Score ≥ 2), absteigend. */
  also: Domain[];
  scores: Partial<Record<Domain, number>>;
}

export function detectDomain(...texts: (string | null | undefined)[]): DomainGuess {
  const text = texts.filter(Boolean).join(" \n ").toLowerCase().slice(0, 4000);
  const scores: Partial<Record<Domain, number>> = {};
  for (const [domain, patterns] of Object.entries(KEYWORDS) as [Domain, [RegExp, number][]][]) {
    let s = 0;
    for (const [re, w] of patterns) {
      const g = unicodeWords(re);
      const hits = text.match(g)?.length ?? 0;
      s += Math.min(hits, 3) * w;
    }
    if (s > 0) scores[domain] = s;
  }
  const ranked = (Object.entries(scores) as [Domain, number][]).sort((a, b) => b[1] - a[1]);
  // Wasserdampf schlägt Thermodynamik: der Gas-Löser darf dort NICHT rechnen.
  if (scores.dampf_kaeltetechnik && scores.dampf_kaeltetechnik >= 4) {
    ranked.sort((a, b) => (a[0] === "dampf_kaeltetechnik" ? -1 : b[0] === "dampf_kaeltetechnik" ? 1 : 0));
  }
  const top = ranked[0];
  const domain: Domain = top && top[1] >= 2 ? top[0] : "unbekannt";
  return {
    domain,
    covered: COVERED.has(domain),
    also: ranked.slice(1).filter(([, s]) => s >= 2).map(([d]) => d),
    scores,
  };
}

const LABEL: Record<Domain, string> = {
  elektrotechnik: "Elektrotechnik",
  thermodynamik: "Thermodynamik",
  mathematik: "Mathematik",
  mechanik: "Technische Mechanik",
  stroemungslehre: "Strömungslehre",
  regelungstechnik: "Regelungstechnik",
  werkstoffkunde: "Werkstoffkunde",
  dampf_kaeltetechnik: "Dampf-/Kältetechnik (Wasserdampf, Kältemittel)",
  informatik: "Informatik",
  chemie: "Chemie",
  unbekannt: "nicht erkannt",
};

const SOLVER: Record<CoveredDomain, string> = {
  elektrotechnik: "schaltung_berechnen",
  thermodynamik: "thermo_berechnen",
  mathematik: "mathe_berechnen",
  mechanik: "balkenstatik (Balken), statik_berechnen (Fachwerk, Reibung, Kraftsystem)",
};

/** Der Hinweis, der als zweite System-Nachricht an das Modell geht. */
export function domainHint(g: DomainGuess): string | null {
  if (g.domain === "unbekannt") return null;
  const also = g.also.filter((d) => COVERED.has(d)).map((d) => `${LABEL[d]} → ${SOLVER[d as CoveredDomain]}`);
  if (g.covered) {
    return [
      `ERKANNTES FACHGEBIET (automatisch): ${LABEL[g.domain]} → Fachlöser ${SOLVER[g.domain as CoveredDomain]}.`,
      also.length ? `Berührt auch: ${also.join("; ")}.` : "",
      "Rechne nichts selbst: stelle den Ansatz auf, lass den Fachlöser rechnen, erkläre mit SEINEN Zahlen.",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    `ERKANNTES FACHGEBIET (automatisch): ${LABEL[g.domain]} — dafür gibt es KEINEN Fachlöser.`,
    "Sag das der/dem Studierenden zu Beginn des Rechenteils offen, in einem Satz",
    '(z. B. „Für Strömungslehre habe ich noch keinen eigenen Fachlöser — ich rechne die',
    'einzelnen Schritte mit dem Rechenwerkzeug nach, prüfe sie aber bitte mit deinem Skript.“).',
    "Einzelne Zahlen trotzdem NUR mit dem Werkzeug rechnen. Erfinde keine Stoffwerte",
    "(z. B. Dampftafelwerte): fehlen sie in den Unterlagen, frage danach.",
    also.length ? `Teilaufgaben aus ${also.join("; ")} darfst du mit dem jeweiligen Fachlöser rechnen.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
