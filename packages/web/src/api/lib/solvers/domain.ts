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

export type CoveredDomain =
  | "elektrotechnik"
  | "thermodynamik"
  | "mathematik"
  | "mechanik"
  | "physik"
  | "informatik"
  | "ki"
  | "datenverarbeitung"
  | "technisches_zeichnen";
export type UncoveredDomain =
  | "stroemungslehre"
  | "regelungstechnik"
  | "werkstoffkunde"
  | "dampf_kaeltetechnik"
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
    // Offene Probleme : solve_open_math
    [/\b(collatz|syracuse|3n\s*\+\s*1|goldbach|primzahllücken?|prime gaps?|écarts? entre (les )?(nombres )?premiers|primzahlzwillinge?|twin primes?|nombres premiers jumeaux|riemannsche vermutung|riemann hypothesis|hypothèse de riemann)\b/, 4],
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
  // Physik für alle Ingenieurstudiengänge : Kinematik, Wurf, Newton.
  physik: [
    [/\b(physik|physique|physics|kinematik|kinematics|cinématique|kinetik|massenpunkt)\b/, 3],
    [/\b(freier fall|free fall|chute libre|senkrechter wurf|waagerechter wurf|schiefer wurf|wurfparabel|wurfweite|wurfhöhe|wurfbahn|steighöhe|projectile|projektil|trajectoire|ballistisch|ballistic|balistique)\b/, 4],
    [/\b(newtonsche[sn]? (gesetz|axiom|grundgesetz)|grundgesetz der dynamik|zweites newton|second law of motion|principe fondamental de la dynamique|f\s*=\s*m\s*[·*⋅]?\s*a)\b/, 4],
    [/\b(gleichmäßig beschleunigt|gleichförmig|anfangsgeschwindigkeit|endgeschwindigkeit|bremsweg|anhalteweg|beschleunigung|acceleration|accélération|geschwindigkeit|velocity|vitesse)\b/, 2],
    [/\b\d+(?:[.,]\d+)?\s*(m\/s²|m\/s\^2|m\/s2|m\/s|km\/h)\b/, 2],
  ],
  // Informatik & IT-Sicherheit : Kryptographie, Schaltalgebra, IP-Netze.
  informatik: [
    [/\b(kryptographie|kryptografie|cryptography|cryptographie|verschlüsselung|verschlüsseln|entschlüsseln|chiffre|chiffrieren|cipher|chiffrement|geheimtext|klartext)\b/, 3],
    [/\b(caesar|cäsar|césar|vigenère|vigenere|rsa|diffie-hellman|öffentliche[rn]? schlüssel|private[rn]? schlüssel|public key|private key)\b/, 4],
    [/\b(hash|hashwert|hashfunktion|sha-?256|sha-?512|sha-?1|md5|prüfsumme)\b/, 3],
    [/\b(boolesche[rn]?|boolean|booléen(ne)?|wahrheitstabelle|truth table|table de vérité|kv-diagramm|karnaugh|disjunktive normalform|konjunktive normalform|dnf|knf|logikgatter|logic gates?|portes? logiques?|nand|nor|xor|schaltalgebra|schaltnetz)\b/, 4],
    [/\b(subnetz|subnetze|subnet|subnets|sous-réseaux?|subnetting|netzmaske|subnetzmaske|netmask|cidr|broadcast(adresse)?|ipv4|ip-adresse|ip address|adresse ip|netzadresse|netzanteil|hostanteil)\b/, 4],
    [/\b(it-sicherheit|cybersicherheit|cybersecurity|cybersécurité|informatik|informatique|computer science)\b/, 2],
    [/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?\b/, 3],
  ],
  // KI & Data Science : Regression, Gradientenabstieg, Perzeptron.
  ki: [
    [/\b(künstliche intelligenz|artificial intelligence|intelligence artificielle|machine learning|maschinelle[sn]? lernen|apprentissage automatique|deep learning|data science)\b/, 3],
    [/\b(neuronale[sn]? netz(e|werk|werke)?|neural networks?|réseaux? de neurones|perzeptron|perceptron|neuronen?)\b/, 4],
    [/\b(sigmoid|sigmoïde|relu|softmax|tanh|aktivierungsfunktion|activation function|fonction d'activation|gradientenabstieg|gradient descent|descente de gradient|lernrate|learning rate|taux d'apprentissage|backpropagation|verlustfunktion|loss function)\b/, 4],
    [/\b(lineare regression|linear regression|régression linéaire|bestimmtheitsmaß|kleinste quadrate|methode der kleinsten quadrate|least squares|moindres carrés)\b/, 4],
    [/\b(ki|ia)\b/, 2],
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
  datenverarbeitung: [
    [/\b(datenverarbeitung|programmieren|programmierung|informatik|algorithmus|datenstruktur|python|matlab|octave|numpy)\b/, 3],
    [/\b(struktogramm|nassi|shneiderman|programmablaufplan|flussdiagramm|ablaufdiagramm|flowchart|pseudocode)\b/, 4],
    [/\b(schleife|for-schleife|while-schleife|verzweigung|rekursion|variablentabelle|datentyp|liste|listen|array|dictionary|string|integer|float|boolean)\b/, 2],
    [/(\bdef \w+\(|\bprint\(|\bfprintf\(|\brange\(|\binput\(|\bdisp\(|\bimport \w+)/, 3],
  ],
  technisches_zeichnen: [
    [/\b(technisches zeichnen|technische zeichnung|fertigungszeichnung|zeichnung|bauteilzeichnung|werkstattzeichnung)\b/, 3],
    [/\b(vorderansicht|draufsicht|seitenansicht|schnittdarstellung|vollschnitt|halbschnitt|schraffur|schriftfeld|bemaßung|maßlinie|projektionsmethode)\b/, 3],
    [/\b(iso 2768|allgemeintoleranz|passung|passungen|toleranzrahmen|form- und lagetoleranz|oberflächenangabe|rauheit|ra \d)/, 3],
    [/\b[øØ]\s?\d+\s?[a-zA-Z]\d{1,2}\b/, 3],
  ],
  chemie: [
    [/\b(chemie|stöchiometrie|reaktionsgleichung|mol\/l|ph-wert|redox|titration)\b/, 3],
  ],
};

const COVERED: ReadonlySet<Domain> = new Set<Domain>([
  "elektrotechnik",
  "thermodynamik",
  "mathematik",
  "mechanik",
  "physik",
  "informatik",
  "ki",
  "datenverarbeitung",
  "technisches_zeichnen",
]);

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
  physik: "Physik (Kinematik, Wurf, Newton)",
  informatik: "Informatik & IT-Sicherheit (Kryptographie, Schaltalgebra, IP-Netze)",
  ki: "KI & Data Science (Regression, Gradientenabstieg, neuronale Netze)",
  stroemungslehre: "Strömungslehre",
  regelungstechnik: "Regelungstechnik",
  werkstoffkunde: "Werkstoffkunde",
  dampf_kaeltetechnik: "Dampf-/Kältetechnik (Wasserdampf, Kältemittel)",
  datenverarbeitung: "Datenverarbeitung (Python/MATLAB)",
  technisches_zeichnen: "Technisches Zeichnen",
  chemie: "Chemie",
  unbekannt: "nicht erkannt",
};

const SOLVER: Record<CoveredDomain, string> = {
  elektrotechnik: "schaltung_berechnen",
  thermodynamik: "thermo_berechnen (auch ideales_gas mit n in mol, erster_hauptsatz) — p-V-Diagramm erscheint automatisch",
  mathematik: "mathe_berechnen; Collatz, Goldbach, Primzahllücken → solve_open_math (Folge NIE selbst rechnen)",
  mechanik: "balkenstatik (Balken), statik_berechnen (Fachwerk, Reibung, Kraftsystem)",
  physik: "physik_berechnen (kinematik, wurf, newton) — Diagramm s(t)/v(t) bzw. Wurfbahn erscheint automatisch",
  informatik:
    "solve_cyber (caesar, vigenere, rsa_schluessel/rsa_verschluesseln/rsa_entschluesseln, hash, boolesch, kv_diagramm, subnetz) — Chiffren, Hashes, Minimalformen und Subnetze NIE selbst rechnen",
  ki: "solve_ai (matrix_produkt, skalarprodukt, regression, gradientenschritt, aktivierung, perzeptron) — Matrizen und Aktivierungen NIE selbst rechnen; Regressionsdiagramm erscheint automatisch",
  datenverarbeitung:
    "echte Ausführung im Browser — Python-Code in einen python-Block, die Studierenden starten „Ausführen“ bzw. „Variablentabelle“; Ausgaben nie im Kopf als Tatsache behaupten",
  technisches_zeichnen: "Zeichnung als svg (NIVEAU 9g), 3D als 3d-json (NIVEAU 9f), Grenzmaße mit rechnen",
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
