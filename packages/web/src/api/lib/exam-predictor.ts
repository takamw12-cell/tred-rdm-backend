/**
 * Klausur-Prognose (V2 — Pilier 2, FONDATIONS).
 *
 * But : croiser les Altklausuren et les chapitres du cours pour dire « 85 %
 * de chances de tomber sur les Struktogramme ».
 *
 * ── Ce qui est en place ───────────────────────────────────────────────────
 *
 *   Les types, et le calcul DÉTERMINISTE de la fréquence (pur, testé) :
 *   pour chaque thème, dans combien d'examens il apparaît, avec un poids
 *   plus fort pour les examens récents. La probabilité est un lissage de
 *   Laplace — (k + 1) / (n + 2) — pour ne jamais dire 0 % ou 100 % avec trois
 *   examens. La confiance dépend du nombre d'examens, pas du modèle.
 *
 * ── Ce qui reste à faire (voir docs/V2_ARCHITECTURE.md) ───────────────────
 *
 *   1. extraire les thèmes des chapitres du cours (IA, une fois par cours,
 *      mis en cache) → `CourseTopic[]` ;
 *   2. étiqueter chaque exercice de chaque Altklausur avec ces thèmes (IA)
 *      → `TaggedExam[]` ;
 *   3. appeler `predictTopics()` et afficher la carte de probabilité.
 *
 * La statistique reste ici, hors du modèle : un chiffre affiché à un
 * étudiant doit être recalculable, pas « ressenti » par une IA.
 */

export interface CourseTopic {
  /** « Struktogramme », « Fachwerke », « Reibung » … */
  topic: string;
  /** Le chapitre du cours où il est traité (titre). */
  chapter?: string;
  /** Mots-clés qui le reconnaissent dans un énoncé (repli sans IA). */
  keywords: string[];
}

export interface TaggedExam {
  documentId: string;
  title: string;
  /** Année de l'examen si connue (pondère la récence). */
  year?: number;
  /** Les thèmes présents dans cet examen. */
  topics: string[];
  /** Points par thème si l'énoncé les donne — poids optionnel. */
  points?: Record<string, number>;
}

export type Confidence = "low" | "medium" | "high";

export interface TopicPrediction {
  topic: string;
  /** 0–1. Probabilité lissée d'apparaître au prochain examen. */
  probability: number;
  /** Dans combien d'examens analysés il est apparu. */
  seenIn: number;
  totalExams: number;
  /** Dernière année où il est tombé. */
  lastSeenYear?: number;
  /** Les examens qui le prouvent (titres), pour que l'étudiant vérifie. */
  evidence: string[];
}

export interface PredictionReport {
  courseLabel: string;
  generatedAt: string;
  examsAnalyzed: number;
  confidence: Confidence;
  predictions: TopicPrediction[];
  /** Ce que la prognose ne sait PAS (à afficher, toujours). */
  caveats: string[];
}

/** Le nombre d'Altklausuren en dessous duquel on ne publie pas de pourcentages. */
export const MIN_EXAMS_FOR_PREDICTION = 3;

export function confidenceFor(examCount: number): Confidence {
  if (examCount >= 8) return "high";
  if (examCount >= 5) return "medium";
  return "low";
}

/**
 * Repli sans IA : un thème est présent si l'un de ses mots-clés apparaît
 * dans le texte (insensible à la casse, mots entiers).
 */
export function tagByKeywords(text: string, topics: CourseTopic[]): string[] {
  const hay = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  return topics
    .filter((t) =>
      t.keywords.some((k) => {
        const needle = k.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
        return needle.length > 1 && hay.includes(` ${needle}`);
      }),
    )
    .map((t) => t.topic);
}

/**
 * La carte de probabilité. Récence : un examen de l'an dernier compte
 * double par rapport à un examen d'il y a quatre ans (demi-vie ≈ 3 ans).
 */
export function predictTopics(exams: TaggedExam[], topics: string[], now = new Date()): TopicPrediction[] {
  const year = now.getUTCFullYear();
  const weightOf = (e: TaggedExam) => (e.year ? Math.pow(0.5, Math.max(0, year - e.year - 1) / 3) : 0.75);
  const totalW = exams.reduce((s, e) => s + weightOf(e), 0);
  return topics
    .map((topic) => {
      const hits = exams.filter((e) => e.topics.includes(topic));
      const hitW = hits.reduce((s, e) => s + weightOf(e), 0);
      const probability = (hitW + 1) / (totalW + 2);
      const years = hits.map((e) => e.year).filter((y): y is number => typeof y === "number");
      return {
        topic,
        probability: Math.round(probability * 100) / 100,
        seenIn: hits.length,
        totalExams: exams.length,
        lastSeenYear: years.length ? Math.max(...years) : undefined,
        evidence: hits.map((e) => e.title).slice(0, 6),
      };
    })
    .sort((a, b) => b.probability - a.probability || b.seenIn - a.seenIn);
}

/** L'année d'un titre « Klausur WS 2023/24 » ou « TM1_2022.pdf ». */
export function guessExamYear(title: string): number | undefined {
  const m = title.match(/(?:^|\D)(20[0-4]\d)(?:\D|$)/);
  return m ? Number(m[1]) : undefined;
}
