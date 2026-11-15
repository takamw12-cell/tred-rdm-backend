import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  addError,
  cleanConcept,
  conceptKey,
  masteryBySubject,
  masteryPromptLines,
  nextScore,
  recordMastery,
  START_SCORE,
  topErrors,
  weakestConcepts,
  type MasteryDb,
} from "../src/api/lib/concept-mastery";

/**
 * Le modèle de l'apprenant (sprint du 2026-11-15, chantier 1) : un score de
 * maîtrise par concept et par étudiant, mis à jour à chaque fois que
 * l'étudiant montre ce qu'il sait — et les trois concepts les plus fragiles
 * remis au tuteur avant chaque réponse (NIVEAU 2b).
 */

describe("le score : de 0 à 1, il suit ce que l'étudiant montre", () => {
  test("un concept jamais vu part du milieu : on ne sait pas encore", () => {
    expect(START_SCORE).toBe(0.5);
  });

  test("une bonne réponse le monte, une mauvaise le descend, « en partie » le ramène vers le milieu", () => {
    expect(nextScore(0.5, "richtig")).toBeCloseTo(0.65, 5);
    expect(nextScore(0.5, "falsch")).toBeCloseTo(0.35, 5);
    expect(nextScore(0.9, "teilweise")).toBeLessThan(0.9);
    expect(nextScore(0.1, "teilweise")).toBeGreaterThan(0.1);
  });

  test("il ne sort jamais de [0, 1], même après cent réponses", () => {
    let up = 0.5;
    let down = 0.5;
    for (let i = 0; i < 100; i++) {
      up = nextScore(up, "richtig");
      down = nextScore(down, "falsch");
    }
    expect(up).toBeLessThanOrEqual(1);
    expect(up).toBeGreaterThan(0.99);
    expect(down).toBeGreaterThanOrEqual(0);
    expect(down).toBeLessThan(0.01);
  });

  test("une étourderie n'efface pas dix réussites : la dernière réponse pèse 30 %", () => {
    let s = 0.5;
    for (let i = 0; i < 10; i++) s = nextScore(s, "richtig");
    expect(nextScore(s, "falsch")).toBeGreaterThan(0.6);
  });

  test("une valeur abîmée en base ne casse pas le calcul", () => {
    expect(nextScore(Number.NaN, "richtig")).toBeCloseTo(0.65, 5);
    expect(nextScore(7, "falsch")).toBeLessThanOrEqual(1);
  });
});

describe("le nom du concept : une ligne par concept, quelle que soit l'écriture", () => {
  test("casse, espaces, tirets et ponctuation ne créent pas de doublon", () => {
    expect(conceptKey("Wärmekapazität")).toBe(conceptKey("  wärmekapazität "));
    expect(conceptKey("Momenten-Gleichgewicht")).toBe(conceptKey("momenten gleichgewicht"));
    expect(conceptKey("1. Hauptsatz")).toBe(conceptKey("1 Hauptsatz"));
    expect(conceptKey("Spannung")).not.toBe(conceptKey("Dehnung"));
  });

  test("le libellé affiché est nettoyé : ni balise, ni saut de ligne, 80 caractères au plus", () => {
    expect(cleanConcept("  Wärme\nkapazität <b>")).toBe("Wärme kapazität b");
    expect(cleanConcept("x".repeat(200))!.length).toBe(80);
    expect(cleanConcept("a")).toBeNull();
    expect(cleanConcept(42)).toBeNull();
    expect(cleanConcept("   ")).toBeNull();
  });
});

describe("les types d'erreur : comptés, bornés aux types connus", () => {
  test("chaque erreur s'ajoute au compteur de son type", () => {
    let json = "{}";
    json = addError(json, "vorzeichen");
    json = addError(json, "vorzeichen");
    json = addError(json, "einheit");
    expect(JSON.parse(json)).toEqual({ vorzeichen: 2, einheit: 1 });
    expect(topErrors(json)).toEqual([
      { type: "vorzeichen", count: 2 },
      { type: "einheit", count: 1 },
    ]);
  });

  test("un type inconnu ou un JSON abîmé ne font rien tomber", () => {
    // @ts-expect-error — valeur hors liste, comme le modèle pourrait en inventer une
    expect(addError("{}", "tippfehler")).toBe("{}");
    expect(addError("pas du json", "einheit")).toBe('{"einheit":1}');
    expect(addError('{"einheit":"<script>","autre":9}', "einheit")).toBe('{"einheit":1}');
    expect(topErrors("[]")).toEqual([]);
  });
});

/* ── En base : SQLite réel, en mémoire ────────────────────────────────── */

async function memoryDb(withTable = true) {
  const libsql = await import("@libsql/client");
  const dz = await import("drizzle-orm/libsql");
  const client = libsql.createClient({ url: ":memory:" });
  if (withTable) {
    // La même instruction que migre-concept-mastery.mjs.
    const script = readFileSync(join(import.meta.dir, "../../../migre-concept-mastery.mjs"), "utf8");
    const statements = [...script.matchAll(/`(CREATE (?:TABLE|UNIQUE INDEX|INDEX) IF NOT EXISTS[\s\S]*?)`/g)].map((m) => m[1]);
    expect(statements.length).toBeGreaterThanOrEqual(2);
    for (const s of statements) await client.execute(s);
  }
  return dz.drizzle(client) as unknown as MasteryDb;
}

const NOW = Date.parse("2026-11-15T10:00:00Z");

describe("enregistrer ce que l'étudiant vient de montrer", () => {
  test("première fois : la ligne est créée à partir du milieu", async () => {
    const db = await memoryDb();
    const r = await recordMastery(db, "lena", { concept: "Wärmekapazität", topic: "Thermodynamik", outcome: "falsch", errorType: "einheit" }, NOW);
    expect(r).toEqual({ saved: true, score: 0.35 });
    const [weak] = await weakestConcepts(db, "lena");
    expect(weak).toEqual({ concept: "Wärmekapazität", topic: "Thermodynamik", score: 0.35, attempts: 1, errors: [{ type: "einheit", count: 1 }] });
  });

  test("la même notion, écrite autrement, met à jour la MÊME ligne", async () => {
    const db = await memoryDb();
    await recordMastery(db, "lena", { concept: "Wärmekapazität", topic: "Thermodynamik", outcome: "falsch", errorType: "einheit" }, NOW);
    await recordMastery(db, "lena", { concept: " wärmekapazität", topic: "Thermo", outcome: "falsch", errorType: "einheit" }, NOW + 1000);
    await recordMastery(db, "lena", { concept: "Wärmekapazität", outcome: "richtig" }, NOW + 2000);
    const all = await weakestConcepts(db, "lena", 10);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ concept: "Wärmekapazität", topic: "Thermodynamik", attempts: 3, errors: [{ type: "einheit", count: 2 }] });
    expect(all[0]!.score).toBeCloseTo(nextScore(nextScore(0.35, "falsch"), "richtig"), 3);
  });

  test("un type d'erreur n'est compté que sur une réponse fausse ou partielle", async () => {
    const db = await memoryDb();
    await recordMastery(db, "lena", { concept: "Hooke", outcome: "richtig", errorType: "vorzeichen" }, NOW);
    expect((await weakestConcepts(db, "lena", 5, 1.1))[0]!.errors).toEqual([]);
  });

  test("les comptes sont étanches : Mara ne voit ni ne modifie rien de Lena", async () => {
    const db = await memoryDb();
    await recordMastery(db, "lena", { concept: "Entropie", outcome: "falsch" }, NOW);
    await recordMastery(db, "mara", { concept: "Entropie", outcome: "richtig" }, NOW);
    expect((await weakestConcepts(db, "lena"))[0]!.score).toBe(0.35);
    expect(await weakestConcepts(db, "mara")).toEqual([]); // 0,65 : pas fragile
    expect(await weakestConcepts(db, "personne")).toEqual([]);
  });

  test("un nom inutilisable n'est pas enregistré", async () => {
    const db = await memoryDb();
    expect(await recordMastery(db, "lena", { concept: " ", outcome: "falsch" }, NOW)).toEqual({ saved: false, reason: "invalid" });
    // @ts-expect-error — résultat hors liste
    expect(await recordMastery(db, "lena", { concept: "Entropie", outcome: "super" }, NOW)).toEqual({ saved: false, reason: "invalid" });
  });

  test("une tentative d'injection dans le nom reste un nom", async () => {
    const db = await memoryDb();
    await recordMastery(db, "lena", { concept: "x'); DROP TABLE concept_mastery;--", outcome: "falsch" }, NOW);
    expect(await weakestConcepts(db, "lena")).toHaveLength(1);
  });

  test("migration pas encore lancée : rien n'est enregistré, rien ne tombe", async () => {
    const db = await memoryDb(false);
    expect(await recordMastery(db, "lena", { concept: "Entropie", outcome: "falsch" }, NOW)).toEqual({ saved: false, reason: "not_migrated" });
    expect(await weakestConcepts(db, "lena")).toEqual([]);
    expect(await masteryBySubject(db, "lena")).toEqual([]);
  });
});

describe("les trois concepts les plus fragiles", () => {
  test("les plus bas d'abord, trois au plus, et seulement ceux qui sont vraiment fragiles", async () => {
    const db = await memoryDb();
    const say = (concept: string, outcomes: ("richtig" | "falsch")[]) => outcomes.reduce((p, outcome, i) => p.then(() => recordMastery(db, "lena", { concept, topic: "TM", outcome }, NOW + i)), Promise.resolve() as Promise<unknown>);
    await say("Schnittgrößen", ["falsch", "falsch", "falsch"]);
    await say("Auflagerreaktionen", ["falsch"]);
    await say("Flächenträgheitsmoment", ["falsch", "falsch"]);
    await say("Biegelinie", ["falsch", "richtig", "falsch"]);
    await say("Einheiten", ["richtig", "richtig"]);
    const weak = await weakestConcepts(db, "lena");
    expect(weak.map((w) => w.concept)).toEqual(["Schnittgrößen", "Flächenträgheitsmoment", "Auflagerreaktionen"]);
    expect(weak.every((w) => w.score < 0.6)).toBe(true);
  });

  test("par matière, pour les barres du Dashboard : moyenne des concepts de la matière", async () => {
    const db = await memoryDb();
    await recordMastery(db, "lena", { concept: "Entropie", topic: "Thermodynamik", outcome: "falsch" }, NOW);
    await recordMastery(db, "lena", { concept: "Enthalpie", topic: "Thermodynamik", outcome: "richtig" }, NOW);
    await recordMastery(db, "lena", { concept: "Biegelinie", topic: "Technische Mechanik", outcome: "richtig" }, NOW);
    expect(await masteryBySubject(db, "lena")).toEqual([
      { topic: "Thermodynamik", score: 0.5, concepts: 2 },
      { topic: "Technische Mechanik", score: 0.65, concepts: 1 },
    ]);
  });
});

describe("ce que le tuteur reçoit (NIVEAU 2b)", () => {
  const weak = [
    { concept: "Wärmekapazität", topic: "Thermodynamik", score: 0.22, attempts: 4, errors: [{ type: "einheit" as const, count: 3 }, { type: "formel" as const, count: 1 }] },
    { concept: "Entropie", topic: "", score: 0.45, attempts: 1, errors: [] },
  ];

  test("les concepts fragiles, avec leurs erreurs typiques en clair", () => {
    const text = masteryPromptLines(weak).join("\n");
    expect(text).toContain("Wärmekapazität (Thermodynamik): sehr unsicher");
    expect(text).toContain("Einheit vergessen oder falsch (3×)");
    expect(text).toContain("Entropie: unsicher");
  });

  test("la consigne d'adaptation : plus lentement, plus d'analogies, viser les erreurs typiques", () => {
    const text = masteryPromptLines(weak).join("\n");
    expect(text).toMatch(/LANGSAMER/);
    expect(text).toMatch(/Analogie/);
    expect(text).toMatch(/typischen Fehler/);
  });

  test("aucun chiffre n'est donné au modèle : il ne peut pas réciter un pourcentage à l'étudiant", () => {
    const text = masteryPromptLines(weak).join("\n");
    expect(text).not.toMatch(/\d+\s?%|0[.,]\d+/);
    expect(text).toMatch(/Nenne nie/);
  });

  test("rien à signaler : seule reste la consigne de signaler, sans liste vide", () => {
    const text = masteryPromptLines([]).join("\n");
    expect(text).toContain("lernstand_melden");
    expect(text).not.toContain("AM UNSICHERSTEN");
  });
});

describe("branchement", () => {
  const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8");
  const AGENT = read("../src/api/agent/index.ts");
  const INDEX = read("../src/api/index.ts");

  test("le tuteur a l'outil lernstand_melden, borné aux résultats et types d'erreur connus", () => {
    expect(AGENT).toContain("lernstand_melden: tool({");
    expect(AGENT).toContain("ergebnis: z.enum(OUTCOMES)");
    expect(AGENT).toContain("fehlerart: z.enum(ERROR_TYPES).optional()");
  });

  test("les concepts fragiles sont lus pour CE compte avant chaque réponse, et remis au NIVEAU 2b", () => {
    expect(INDEX).toContain("weakestConcepts(masteryDb, uid, 3)");
    expect(INDEX).toContain("signal: (input) => recordMastery(masteryDb, uid, input)");
    expect(AGENT).toContain("...masteryPromptLines(mastery.weakest)");
  });

  test("le compte vient de la session : aucun identifiant d'étudiant dans l'outil", () => {
    const tool = AGENT.slice(AGENT.indexOf("lernstand_melden: tool({"), AGENT.indexOf("lernstand_melden: tool({") + 1600);
    expect(tool).not.toMatch(/userId|user_id|nutzer/i);
  });
});
