/**
 * Moteur d'évaluation logique — matières sans calcul (droit, médecine, éco).
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

export type StructureDomain = "recht" | "medizin" | "wirtschaft";

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
    if (!s.found) feedback.push(`Es fehlt: ${s.label} (−${Math.round(perStep)} Punkte). Erwartet: ${s.expected}`);
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
      "ob die richtige Norm, Diagnose oder Theorie gewählt wurde, beurteilst du im Text.",
  };
}
