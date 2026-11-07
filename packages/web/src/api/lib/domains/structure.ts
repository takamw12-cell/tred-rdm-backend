/**
 * Moteur d'évaluation logique — matières où la MÉTHODE se juge à la structure :
 * droit, médecine, économie, biologie, psychologie (empirique et SORKC),
 * philosophie, langues (rédaction), histoire (analyse de source).
 *
 * L'IA n'y « invente » pas la solution : elle vérifie que la réponse de
 * l'étudiant suit la MÉTHODE de la discipline, étape par étape et dans
 * l'ordre. Ce module est déterministe (motifs de/fr/en) : il dit quelles
 * étapes sont présentes, où, lesquelles manquent, si l'ordre est respecté,
 * et retire des points en conséquence. Le modèle explique ensuite.
 *
 * Ce qu'il ne fait PAS : juger le fond (la bonne norme, le bon diagnostic).
 * Le résultat le dit toujours, pour que personne ne prenne 100/100 pour
 * « juridiquement juste ».
 */

export type StructureDomain =
  | "recht"
  | "medizin"
  | "wirtschaft"
  | "biologie"
  | "psychologie"
  | "verhaltensanalyse"
  | "philosophie"
  | "sprachen"
  | "geschichte";

export interface StructureStep {
  id: string;
  /** Nom de l'étape, en allemand comme dans les cours. */
  label: string;
  /** Ce qui est attendu, en une phrase (pour le retour à l'étudiant). */
  expected: string;
  /** Marqueurs (insensibles à la casse). Le premier trouvé situe l'étape. */
  markers: RegExp[];
}

export interface StructureSchema {
  domain: StructureDomain;
  name: string;
  steps: StructureStep[];
  /** Zusätzlicher Rat, wenn eine bestimmte Etappe fehlt (Schlüssel: id der Etappe). */
  ifMissing?: Record<string, string>;
}

/** Points : 100 répartis sur les étapes ; −10 par inversion d'ordre. */
export const ORDER_PENALTY = 10;

// \b ne connaît que l'ASCII : ces bornes reconnaissent aussi « Ergebnis: »
// après un umlaut, « anamnèse » etc.
const W = (src: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${src})(?![\\p{L}\\p{N}])`, "iu");

export const SCHEMAS: Record<StructureDomain, StructureSchema> = {
  recht: {
    domain: "recht",
    name: "Gutachtenstil (juristische Methode)",
    steps: [
      {
        id: "sachverhalt",
        label: "Sachverhalt",
        expected: "Den relevanten Sachverhalt bzw. die Fallfrage erfassen: wer will was von wem?",
        markers: [W("sachverhalt|fallfrage|laut sachverhalt|im vorliegenden sachverhalt|les faits|faits de l'espèce|facts"), W("(?:will|verlangt|fordert|begehrt)\\s+(?:von|die|den|das)")],
      },
      {
        id: "anspruchsgrundlage",
        label: "Anspruchsgrundlage",
        expected: "Obersatz mit der Anspruchsgrundlage: „A könnte gegen B einen Anspruch auf … aus § … haben.“",
        markers: [W("anspruchsgrundlage|obersatz|base légale|fondement juridique|legal basis"), W("könnte\\s+[^.]{0,80}?anspruch"), /§\s*\d+|\bart\.\s*\d+|\barticle\s+\d+/iu],
      },
      {
        id: "subsumtion",
        label: "Subsumtion",
        expected: "Voraussetzungen definieren und den Sachverhalt darunter fassen: „Voraussetzung ist … Hier hat …, also …“",
        markers: [
          W("subsumtion|subsumieren|voraussetzung\\w*|tatbestandsmerkmal\\w*|definition|versteht man|ist zu verstehen|liegt vor,? wenn|vorliegend|im vorliegenden fall|en l'espèce|in casu|in the present case"),
          W("(?:ist|sind|wäre|wären)\\s+(?:somit|damit|also|hier)?\\s*(?:erfüllt|gegeben|nicht erfüllt|nicht gegeben)"),
        ],
      },
      {
        id: "ergebnis",
        label: "Ergebnis",
        expected: "Das Ergebnis als Antwort auf den Obersatz: „A hat gegen B einen (keinen) Anspruch …“",
        markers: [W("ergebnis|im ergebnis|folglich|somit hat|also hat|damit hat|en conclusion|conclusion|par conséquent|therefore|in conclusion"), W("(?:hat|haben)\\s+[^.]{0,60}?(?:einen|keinen)\\s+anspruch")],
      },
    ],
  },
  medizin: {
    domain: "medizin",
    name: "Klinisches Vorgehen",
    steps: [
      {
        id: "anamnese",
        label: "Anamnese",
        expected: "Beschwerden, Vorgeschichte, Medikation, Risikofaktoren erheben.",
        markers: [W("anamnese|vorgeschichte|beschwerden|leitsymptom|klagt über|berichtet über|anamnèse|antécédents|history of present illness|history")],
      },
      {
        id: "verdachtsdiagnose",
        label: "Verdachtsdiagnose",
        expected: "Die wahrscheinlichste Diagnose begründet benennen.",
        markers: [W("verdachtsdiagnose|verdacht auf|v\\.\\s?a\\.|arbeitsdiagnose|diagnostic de présomption|diagnostic présomptif|hypothèse diagnostique|suspected diagnosis|working diagnosis")],
      },
      {
        id: "differenzialdiagnose",
        label: "Differenzialdiagnose",
        expected: "Wichtige Alternativen nennen und abgrenzen (was spricht dafür, was dagegen?).",
        markers: [W("differenzialdiagnose\\w*|differentialdiagnose\\w*|ddx|dd|abzugrenzen|diagnostics? différentiels?|diagnostic différentiel|differential diagnos[ie]s")],
      },
      {
        id: "therapie",
        label: "Therapie",
        expected: "Therapie bzw. weiteres Vorgehen ableiten (nach Leitlinie, mit Begründung).",
        markers: [W("therapie\\w*|behandlung|therapeutisch\\w*|medikation|leitlinie|traitement|thérapie|prise en charge|treatment|management")],
      },
    ],
  },
  wirtschaft: {
    domain: "wirtschaft",
    name: "Ökonomische Argumentation",
    steps: [
      {
        id: "hypothese",
        label: "Hypothese",
        expected: "Die zu prüfende Behauptung bzw. Annahme klar formulieren.",
        markers: [W("hypothese\\w*|annahme\\w*|wir nehmen an|unterstellt|hypothèse\\w*|supposons|assumption\\w*|hypothesis")],
      },
      {
        id: "daten",
        label: "Daten",
        expected: "Welche Daten belegen bzw. testen die Hypothese (Quelle, Zeitraum, Größe)?",
        markers: [W("daten\\w*|statistik\\w*|quelle|zeitreihe|erhebung|tabelle|données|statistiques|data|dataset")],
      },
      {
        id: "modell",
        label: "Modell",
        expected: "Das Modell bzw. die Methode, mit der die Daten ausgewertet werden (z. B. Angebot-Nachfrage, Regression, Kapitalwert).",
        markers: [W("modell\\w*|regression|angebot\\w*\\s+und\\s+nachfrage|elastizität|kapitalwert|gleichgewicht|modèle|méthode|model|framework")],
      },
      {
        id: "schlussfolgerung",
        label: "Schlussfolgerung",
        expected: "Was folgt — und was folgt NICHT (Grenzen des Modells)?",
        markers: [W("schlussfolgerung|fazit|folglich|somit|ergebnis|conclusion|en conclusion|par conséquent|therefore|in conclusion")],
      },
    ],
  },
  biologie: {
    domain: "biologie",
    name: "Naturwissenschaftliches Erkenntnisverfahren (Biologie)",
    steps: [
      {
        id: "fragestellung",
        label: "Fragestellung",
        expected: "Die Frage, die der Versuch beantworten soll (Beobachtung → Problem).",
        markers: [W("fragestellung|forschungsfrage|problemfrage|leitfrage|untersucht werden soll|es soll untersucht werden|wir untersuchen|question de recherche|problématique|research question|we investigate|the aim")],
      },
      {
        id: "hypothese",
        label: "Hypothese",
        expected: "Eine prüfbare Vermutung VOR dem Versuch („Wenn …, dann …“).",
        markers: [W("hypothese\\w*|vermutung|wir vermuten|ich vermute|erwartet wird|hypothèse\\w*|hypothes[ie]s|we hypothesi[sz]e|we expect|wenn [^.]{1,80}, dann")],
      },
      {
        id: "durchfuehrung",
        label: "Durchführung",
        expected: "Material und Methode mit Kontrollansatz: was wurde wie (und womit verglichen) gemacht?",
        markers: [W("durchführung|versuchsaufbau|versuchsdurchführung|material(?:ien)? und methode\\w*|methode\\w*|kontrollansatz|kontrollgruppe|kontrollversuch|versuchsansatz|protocole|matériel et méthodes?|mode opératoire|methods?|procedure|experimental setup|control group")],
      },
      {
        id: "beobachtung",
        label: "Beobachtung",
        expected: "Die Ergebnisse, beschrieben ohne Deutung (Messwerte, Tabelle, Diagramm).",
        markers: [W("beobachtung\\w*|ergebnis\\w*|messwert\\w*|messergebnis\\w*|man beobachtet|es zeigt sich|zeigte sich|résultats?|observations?|results?|we observed|observed")],
      },
      {
        id: "deutung",
        label: "Deutung",
        expected: "Deutung: wird die Hypothese bestätigt oder widerlegt — und warum (Fehlerquellen)?",
        markers: [W("deutung|auswertung|interpretation|schlussfolgerung|fazit|folglich|bestätigt|widerlegt|interprétation|en conclusion|conclusion|confirm\\w*|refut\\w*|therefore|in conclusion")],
      },
    ],
    ifMissing: {
      hypothese: "Ohne Hypothese vor dem Versuch lässt sich nichts bestätigen oder widerlegen — formuliere sie als „Wenn …, dann …“.",
      durchfuehrung: "Nenne den Kontrollansatz: erst der Vergleich macht ein Ergebnis aussagekräftig.",
    },
  },
  psychologie: {
    domain: "psychologie",
    name: "Empirische Arbeit (Psychologie, APA-Aufbau)",
    steps: [
      {
        id: "theorie",
        label: "Theorie",
        expected: "Theoretischer Hintergrund: welches Modell bzw. welcher Effekt (mit Quelle)?",
        markers: [W("theorie\\w*|theoretische[rn]? hintergrund|modell\\w*|nach (?:kahneman|tversky|festinger|piaget|skinner|pavlov|bandura)|théorie|cadre théorique|theory|theoretical|background|literature")],
      },
      {
        id: "hypothese",
        label: "Hypothese",
        expected: "Gerichtete, prüfbare Hypothese (H1, ggf. H0).",
        markers: [W("hypothese\\w*|h1|h0|vermutung|wir erwarten|erwartet wird|hypothèse\\w*|hypothes[ie]s|we expect|we predict|predict\\w*")],
      },
      {
        id: "methode",
        label: "Methode",
        expected: "Stichprobe, Design, UV und AV, Operationalisierung, Material.",
        markers: [W("methode\\w*|stichprobe|probanden|versuchspersonen|teilnehmende|teilnehmer\\w*|design|fragebogen|unabhängige variable|abhängige variable|operationalisier\\w*|échantillon|participants?|sample|questionnaire|méthode|method\\w*|between-subjects|within-subjects")],
      },
      {
        id: "ergebnisse",
        label: "Ergebnisse",
        expected: "Deskriptive und inferenzstatistische Ergebnisse (Kennwerte, Test, p, Effektstärke).",
        markers: [W("ergebnis\\w*|signifikant\\w*|p\\s*[<=>]\\s*0?[.,]\\d+|mittelwert\\w*|korrelation\\w*|effektstärke|résultats?|results?|significant\\w*|correlation\\w*")],
      },
      {
        id: "diskussion",
        label: "Diskussion",
        expected: "Deutung im Licht der Theorie, Grenzen der Studie, Alternativerklärungen.",
        markers: [W("diskussion|limitation\\w*|einschränkung\\w*|grenzen der studie|alternativerklärung\\w*|fazit|discussion|limites|conclusion|limitations?|in conclusion")],
      },
    ],
    ifMissing: {
      diskussion: "Ohne Diskussion der Grenzen (Stichprobe, Störvariablen, Alternativerklärungen) bleibt das Ergebnis unbewertet.",
    },
  },
  verhaltensanalyse: {
    domain: "verhaltensanalyse",
    name: "Verhaltensanalyse nach dem SORKC-Modell",
    steps: [
      {
        id: "situation",
        label: "Situation (S)",
        expected: "Die auslösende Situation bzw. der Reiz, konkret beschrieben.",
        markers: [W("situation|stimulus|auslöser|auslösende[rn]? reiz|reiz|s\\s*[:=]|déclencheur|trigger")],
      },
      {
        id: "organismus",
        label: "Organismus (O)",
        expected: "Personenvariablen: Lerngeschichte, Grundannahmen, körperlicher Zustand.",
        markers: [W("organismus|o-variable\\w*|biologische[rn]? (?:faktoren|voraussetzungen)|lerngeschichte|schemata|grundannahme\\w*|o\\s*[:=]|organisme|organism")],
      },
      {
        id: "reaktion",
        label: "Reaktion (R)",
        expected: "Die Reaktion auf vier Ebenen: kognitiv, emotional, physiologisch, motorisch.",
        markers: [W("reaktion\\w*|verhalten\\w*|r\\s*[:=]|réaction|comportement|response|behaviou?r")],
      },
      {
        id: "kontingenz",
        label: "Kontingenz (K)",
        expected: "Wie regelmäßig folgt die Konsequenz (kontinuierlich, intermittierend)?",
        markers: [W("kontingenz\\w*|immer wenn|jedes mal|intermittierend\\w*|verstärkungsplan|k\\s*[:=]|contingence|contingency|schedule of reinforcement")],
      },
      {
        id: "konsequenz",
        label: "Konsequenz (C)",
        expected: "Kurz- und langfristige Folgen: positive/negative Verstärkung, Bestrafung, Löschung.",
        markers: [W("konsequenz\\w*|verstärkung|verstärker|bestrafung|löschung|c\\s*[:=]|conséquence\\w*|renforcement|punition|consequence\\w*|reinforcement|punishment")],
      },
    ],
  },
  philosophie: {
    domain: "philosophie",
    name: "Philosophische Argumentation",
    steps: [
      {
        id: "these",
        label: "These",
        expected: "Die These klar und früh: was genau wird behauptet?",
        // „these“ allein ist im Englischen ein Demonstrativ : nur mit Artikel oder Doppelpunkt.
        markers: [W("(?:meine|die|eine|folgende|zentrale) these|these\\s*:|hauptthese|behauptung|ich behaupte|ich vertrete|ich werde zeigen|zu zeigen ist|thèse|je soutiens|je défends|thesis|i argue|i claim|i will argue")],
      },
      {
        id: "argument",
        label: "Argument",
        expected: "Begründung in Prämissen (P1, P2 … ⇒ K): warum gilt die These?",
        markers: [W("prämisse\\w*|p1|begründung|argument\\w*|denn|weil|erstens|premise\\w*|prémisse\\w*|because|car|parce que|puisque")],
      },
      {
        id: "einwand",
        label: "Einwand",
        expected: "Das stärkste Gegenargument — und deine Antwort darauf.",
        markers: [W("einwand|einwände|gegenargument\\w*|man könnte einwenden|kritiker\\w*|dagegen (?:spricht|lässt|kann|könnte)|objection\\w*|on pourrait objecter|contre-argument\\w*|counter-?argument\\w*|critics|one might object")],
      },
      {
        id: "fazit",
        label: "Fazit",
        expected: "Konklusion: was folgt — und was folgt nicht?",
        markers: [W("fazit|folglich|daraus folgt|konklusion|schlussfolgerung|zusammenfassend|abschließend|en conclusion|conclusion|par conséquent|therefore|hence|in conclusion")],
      },
    ],
    ifMissing: {
      einwand: "Ein Essay ohne Einwand bleibt Behauptung: prüfe das stärkste Gegenargument und antworte darauf.",
    },
  },
  sprachen: {
    domain: "sprachen",
    name: "Aufbau eines Aufsatzes / Essays / einer Erörterung",
    steps: [
      {
        id: "einleitung",
        label: "Einleitung",
        expected: "Hinführung zum Thema und Fragestellung bzw. These.",
        markers: [W("einleitung|zunächst|zu beginn|in diesem aufsatz|in diesem text|in dieser erörterung|introduction|tout d'abord|d'abord|dans cet essai|dans ce texte|firstly|first of all|in this essay|to begin with")],
      },
      {
        id: "argumente",
        label: "Argumente",
        expected: "Hauptteil: Argumente, verbunden mit Konnektoren (erstens, außerdem, einerseits …).",
        markers: [W("erstens|zweitens|außerdem|darüber hinaus|zudem|ferner|ein weiteres argument|einerseits|andererseits|premièrement|deuxièmement|de plus|en outre|par ailleurs|d'une part|d'autre part|secondly|furthermore|moreover|in addition|on the one hand|on the other hand")],
      },
      {
        id: "beispiele",
        label: "Beispiele",
        expected: "Belege und Beispiele zu den Argumenten.",
        markers: [W("zum beispiel|beispielsweise|z\\.\\s?b\\.|par exemple|notamment|for example|for instance|such as|e\\.g\\.")],
      },
      {
        id: "schluss",
        label: "Schluss",
        expected: "Fazit bzw. eigene Stellungnahme, Rückbezug auf die Einleitung.",
        markers: [W("schluss|fazit|zusammenfassend|abschließend|alles in allem|pour conclure|en conclusion|conclusion|en somme|in conclusion|to sum up|to conclude|all in all")],
      },
    ],
  },
  geschichte: {
    domain: "geschichte",
    name: "Quelleninterpretation (Geschichte)",
    steps: [
      {
        id: "quelle",
        label: "Quelle",
        expected: "Quellenangabe: Autor/Verfasser, Gattung (Rede, Brief, Gesetz, Karikatur …), Adressat.",
        markers: [W("quelle\\w*|quellengattung|autor\\w*|verfasser\\w*|verfasst|rede|brief|flugblatt|zeitungsartikel|urkunde|gesetzestext|tagebuch\\w*|plakat|karikatur|source|auteur|author|discours|lettre|speech|letter|document")],
      },
      {
        id: "datierung",
        label: "Datierung",
        expected: "Wann (und wo) ist die Quelle entstanden?",
        markers: [
          W("(?:1\\d{3}|20[0-2]\\d)(?:\\s*(?:v\\.\\s?chr\\.|n\\.\\s?chr\\.|av\\.\\s?j\\.-c\\.|bc|ad))?"),
          W("\\d{1,2}\\.\\s?(?:januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)"),
          W("jahrhundert\\w*|datiert\\w*|datierung|siècle\\w*|daté\\w*|century|dated"),
        ],
      },
      {
        id: "inhalt",
        label: "Inhalt",
        expected: "Was steht in der Quelle (Thema, Kernaussagen, Forderungen)?",
        markers: [W("inhalt\\w*|thematisiert|behandelt|beschreibt|schildert|fordert|kritisiert|zusammenfassung|in der quelle|résumé|contenu|le document (?:présente|décrit|montre|évoque)|the (?:source|text|document) (?:describes|shows|argues)|content")],
      },
      {
        id: "kontext",
        label: "Kontext",
        expected: "Historische Einordnung: was geschah damals, warum entstand die Quelle?",
        markers: [W("kontext|historische[rn]? (?:hintergrund|einordnung|zusammenhang|kontext)|einordnung|einordnen|vor dem hintergrund|zu dieser zeit|damals|zeitgenössisch\\w*|contexte|context|background|à cette époque|at that time")],
      },
      {
        id: "urteil",
        label: "Urteil",
        expected: "Beurteilung: Intention, Perspektive, Glaubwürdigkeit, Aussagewert der Quelle.",
        markers: [W("urteil|beurteilung|bewertung|beurteilen|bewerten|quellenkritik|glaubwürdig\\w*|einseitig\\w*|intention|absicht|perspektive|propaganda|jugement|critique|crédibilité|fiabilité|assessment|evaluation|reliab\\w*|biased|bias")],
      },
    ],
    ifMissing: {
      quelle: "Nenne zu Beginn IMMER die Quelle: wer hat sie verfasst, für wen, in welcher Gattung?",
      datierung: "Datiere die Quelle (Jahr, möglichst Tag und Ort): ohne Datum ist keine historische Einordnung möglich.",
    },
  },
};

export interface StepFinding {
  id: string;
  label: string;
  found: boolean;
  /** Position du premier marqueur dans le texte (caractère). */
  position: number | null;
  /** Le passage trouvé, ≤ 80 caractères — pour que l'étudiant voie où. */
  evidence: string | null;
  expected: string;
}

export interface StructureResult {
  domain: StructureDomain;
  method: string;
  steps: StepFinding[];
  missing: string[];
  /** Paires d'étapes dans le mauvais ordre, ex. « Ergebnis vor Subsumtion ». */
  orderIssues: string[];
  orderOk: boolean;
  /** 0–100. */
  score: number;
  feedback: string[];
  limit: string;
}

function locate(text: string, step: StructureStep): { position: number; evidence: string } | null {
  let best: { position: number; evidence: string } | null = null;
  for (const re of step.markers) {
    const m = re.exec(text);
    if (m && (best === null || m.index < best.position)) {
      const from = Math.max(0, m.index - 20);
      best = { position: m.index, evidence: text.slice(from, from + 80).replace(/\s+/g, " ").trim() };
    }
  }
  return best;
}

export function evaluateStructure(domain: StructureDomain, text: string): StructureResult {
  const schema = SCHEMAS[domain];
  const body = String(text ?? "");
  const steps: StepFinding[] = schema.steps.map((s) => {
    const hit = locate(body, s);
    return { id: s.id, label: s.label, found: hit !== null, position: hit?.position ?? null, evidence: hit?.evidence ?? null, expected: s.expected };
  });

  const present = steps.filter((s) => s.found);
  const orderIssues: string[] = [];
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      if ((present[j].position ?? 0) < (present[i].position ?? 0)) orderIssues.push(`${present[j].label} vor ${present[i].label}`);
    }
  }

  const perStep = 100 / schema.steps.length;
  const raw = present.length * perStep - orderIssues.length * ORDER_PENALTY;
  const score = Math.max(0, Math.round(raw));
  const missing = steps.filter((s) => !s.found).map((s) => s.label);

  const feedback: string[] = [];
  for (const s of steps) {
    if (!s.found) {
      feedback.push(`Es fehlt: ${s.label} (−${Math.round(perStep)} Punkte). Erwartet: ${s.expected}`);
      const advice = schema.ifMissing?.[s.id];
      if (advice) feedback.push(advice);
    }
  }
  for (const o of orderIssues) feedback.push(`Reihenfolge: ${o} (−${ORDER_PENALTY} Punkte). Die Methode verlangt ${schema.steps.map((s) => s.label).join(" → ")}.`);
  if (domain === "recht" && orderIssues.some((o) => o.startsWith("Ergebnis vor"))) {
    feedback.push("Das Ergebnis steht vorn: das ist Urteilsstil. In der Klausur wird meist der Gutachtenstil verlangt (Ergebnis am Schluss).");
  }
  if (feedback.length === 0) feedback.push(`Alle Schritte vorhanden und in der richtigen Reihenfolge: ${schema.steps.map((s) => s.label).join(" → ")}.`);

  return {
    domain,
    method: schema.name,
    steps,
    missing,
    orderIssues,
    orderOk: orderIssues.length === 0,
    score,
    feedback,
    limit:
      "Geprüft wird der AUFBAU (Schritte und Reihenfolge), nicht die inhaltliche Richtigkeit — " +
      "ob die richtige Norm, Diagnose, Theorie, Deutung oder Grammatik gewählt wurde, beurteilst du im Text.",
  };
}
