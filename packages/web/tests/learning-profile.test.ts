import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { recordMastery, type MasteryDb } from "../src/api/lib/concept-mastery";
import { socraticFlags } from "../src/api/lib/socratic";
import { clearPlan, dateOfDay, loadPlan, planDay, planExpired, planProgress, savePlan, toggleDone } from "../src/web/lib/study-plan";
import {
  MAX_PLAN_CONCEPTS,
  PLAN_DAYS,
  buildStudyPlan,
  conceptPages,
  learnerProfile,
  type PlanConcept,
  type PlanDoc,
} from "../src/api/lib/learning-profile";

/**
 * « Mein Lernprofil » (2026-11-16) : les forces et les faiblesses par matière,
 * et un plan de révision sur 7 jours qui cite les pages des documents de
 * l'étudiant.
 *
 * Deux promesses sont figées ici :
 *   - une page n'est citée que si le concept y est ÉCRIT — jamais de page par
 *     défaut, jamais de page devinée ;
 *   - le plan est calculé, pas rédigé par un modèle : mêmes données, même plan,
 *     et aucun coût.
 */

const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8");

const doc = (id: string, title: string, pages: string[], kind = "vorlesung"): PlanDoc => ({
  id,
  title,
  kind,
  textContent: pages.map((text, i) => `[[SEITE ${i + 1}]]\n${text}`).join("\n"),
});

/* ── Les pages d'un concept ───────────────────────────────────────────── */

describe("les pages citées : seulement là où le concept est écrit", () => {
  const skript = doc("d1", "Thermodynamik Skript", [
    "Inhalt. 1 Grundlagen. 2 Wärmekapazität. 3 Kreisprozesse.",
    "Die Temperatur ist ein Maß für die mittlere kinetische Energie.",
    "Die Wärmekapazität C gibt an, wie viel Wärme ein Körper je Kelvin aufnimmt. Die spezifische Wärmekapazität c bezieht sie auf die Masse. Wärmekapazitäten addieren sich.",
    "Beim Kreisprozess kehrt das System in den Ausgangszustand zurück.",
  ]);

  test("la page où le concept est le plus présent passe d'abord, avec le document", () => {
    const refs = conceptPages([skript], "Wärmekapazität");
    expect(refs[0]).toEqual({ documentId: "d1", title: "Thermodynamik Skript", page: 3, hits: 3 });
    // Le sommaire le nomme une fois : il vient après.
    expect(refs[1]).toEqual({ documentId: "d1", title: "Thermodynamik Skript", page: 1, hits: 1 });
  });

  test("deux pages au plus par concept", () => {
    const many = doc("d2", "Skript", Array.from({ length: 9 }, () => "Die Entropie nimmt zu."));
    expect(conceptPages([many], "Entropie")).toHaveLength(2);
    expect(conceptPages([many], "Entropie", 4)).toHaveLength(4);
  });

  test("casse, trémas et flexions allemandes ne cachent pas la page", () => {
    expect(conceptPages([skript], "wärmekapazität")[0]?.page).toBe(3);
    expect(conceptPages([skript], "Waermekapazitaet")[0]?.page).toBe(3);
    // « Kreisprozess » trouve « Kreisprozesse » (p. 1) et « Kreisprozess » (p. 4).
    expect(conceptPages([skript], "Kreisprozess").map((r) => r.page).sort()).toEqual([1, 4]);
  });

  test("un mot contenu DANS un autre n'est pas une trouvaille (« Arbeit » ≠ « Bearbeitung »)", () => {
    const d = doc("d3", "Hinweise", ["Die Bearbeitung der Aufgabe dauert 90 Minuten."]);
    expect(conceptPages([d], "Arbeit")).toEqual([]);
    const e = doc("d4", "Mechanik", ["Die Arbeit ist Kraft mal Weg. Der Arbeitssatz folgt daraus."]);
    expect(conceptPages([e], "Arbeit")).toEqual([{ documentId: "d4", title: "Mechanik", page: 1, hits: 2 }]);
  });

  test("concept en plusieurs mots : la tournure exacte, sinon tous ses mots sur la même page", () => {
    const d = doc("d5", "Skript TM", [
      "Der erste Hauptsatz der Thermodynamik beschreibt die Energieerhaltung.",
      "Thermodynamik: Der Hauptsatz, den wir als ersten behandeln, lautet dU = δQ + δW.",
      "Der zweite Hauptsatz behandelt die Entropie.",
    ]);
    expect(conceptPages([d], "Erster Hauptsatz der Thermodynamik").map((r) => r.page)).toEqual([1]);
    // Aucune page ne porte la tournure : celles qui portent TOUS les mots.
    expect(conceptPages([d], "Hauptsatz Entropie").map((r) => r.page)).toEqual([3]);
  });

  test("concept absent des documents : aucune page — jamais une page par défaut", () => {
    expect(conceptPages([skript], "Flächenträgheitsmoment")).toEqual([]);
    expect(conceptPages([], "Wärmekapazität")).toEqual([]);
    expect(conceptPages([skript], "")).toEqual([]);
    expect(conceptPages([skript], "ab")).toEqual([]);
  });

  test("document sans marque de page : le document est cité, sans numéro de page", () => {
    const notes: PlanDoc = { id: "n1", title: "Notizen.txt", kind: "other", textContent: "Die Wärmekapazität hängt vom Stoff ab." };
    expect(conceptPages([notes], "Wärmekapazität")).toEqual([{ documentId: "n1", title: "Notizen.txt", page: null, hits: 1 }]);
  });

  test("à présence égale, le cours passe avant l'annale", () => {
    const klausur = doc("k", "Klausur WS25", ["Aufgabe 2: Berechnen Sie die Entropie."], "klausur");
    const vorlesung = doc("v", "Vorlesung 7", ["Die Entropie ist eine Zustandsgröße."], "vorlesung");
    expect(conceptPages([klausur, vorlesung], "Entropie").map((r) => r.documentId)).toEqual(["v", "k"]);
  });

  test("une marque de page abîmée ne fait pas tomber la recherche", () => {
    const broken: PlanDoc = { id: "b", title: "Scan", kind: "other", textContent: "[[SEITE x]] Entropie [[SEITE 2]] Die Entropie wächst. [[SEITE" };
    expect(conceptPages([broken], "Entropie").some((r) => r.page === 2)).toBe(true);
  });
});

/* ── Le plan sur 7 jours ──────────────────────────────────────────────── */

const concept = (name: string, score: number, extra: Partial<PlanConcept> = {}): PlanConcept => ({ concept: name, topic: "Thermodynamik", score, errors: [], refs: [], ...extra });

describe("le plan de révision sur 7 jours", () => {
  const weak = [
    concept("Entropie", 0.2, { errors: [{ type: "einheit", count: 3 }, { type: "formel", count: 1 }], refs: [{ documentId: "d1", title: "Skript", page: 12, hits: 4 }] }),
    concept("Wärmekapazität", 0.35),
    concept("Kreisprozess", 0.45),
    concept("Enthalpie", 0.5),
    concept("Isotherme", 0.55),
  ];

  test("sept jours, numérotés de 1 à 7", () => {
    const plan = buildStudyPlan(weak)!;
    expect(PLAN_DAYS).toBe(7);
    expect(plan.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("aucun concept fragile : pas de plan — on n'en invente pas", () => {
    expect(buildStudyPlan([])).toBeNull();
  });

  test("le concept le plus fragile ouvre la semaine, quel que soit l'ordre reçu", () => {
    const plan = buildStudyPlan([...weak].reverse())!;
    expect(plan.days[0]!.tasks[0]).toMatchObject({ kind: "learn", concept: "Entropie" });
    expect(plan.concepts).toEqual(["Entropie", "Wärmekapazität", "Kreisprozess", "Enthalpie", "Isotherme"]);
  });

  test("révision espacée : apprendre le jour J, se le remémorer à J+2, l'appliquer à J+5", () => {
    const plan = buildStudyPlan(weak)!;
    const daysOf = (name: string, kind: string) => plan.days.filter((d) => d.tasks.some((t) => t.concept === name && t.kind === kind)).map((d) => d.day);
    expect(daysOf("Entropie", "learn")).toEqual([1]);
    expect(daysOf("Entropie", "recall")).toEqual([3]);
    expect(daysOf("Entropie", "apply")).toEqual([6]);
    expect(daysOf("Wärmekapazität", "learn")).toEqual([2]);
    expect(daysOf("Wärmekapazität", "recall")).toEqual([4]);
    // J+5 = jour 7 : c'est l'auto-test qui le couvre.
    expect(daysOf("Wärmekapazität", "apply")).toEqual([]);
  });

  test("le jour 7 est un auto-test sur TOUS les concepts de la semaine", () => {
    const last = buildStudyPlan(weak)!.days[6]!;
    expect(last.tasks).toHaveLength(1);
    expect(last.tasks[0]).toMatchObject({ kind: "selftest", concepts: ["Entropie", "Wärmekapazität", "Kreisprozess", "Enthalpie", "Isotherme"] });
  });

  test("cinq concepts au plus, trois tâches au plus par jour", () => {
    const many = Array.from({ length: 12 }, (_, i) => concept(`Konzept ${i}`, 0.1 + i * 0.03));
    const plan = buildStudyPlan(many)!;
    expect(MAX_PLAN_CONCEPTS).toBe(5);
    expect(plan.concepts).toHaveLength(5);
    for (const d of plan.days) expect(d.tasks.length).toBeLessThanOrEqual(3);
  });

  test("les pages viennent des trouvailles, et seulement d'elles", () => {
    const plan = buildStudyPlan(weak)!;
    const learn = (name: string) => plan.days.flatMap((d) => d.tasks).find((t) => t.kind === "learn" && t.concept === name)!;
    expect(learn("Entropie").refs).toEqual([{ documentId: "d1", title: "Skript", page: 12, hits: 4 }]);
    // Rien trouvé dans les documents : la tâche existe, sans aucune page.
    expect(learn("Wärmekapazität").refs).toEqual([]);
  });

  test("la tâche d'apprentissage vise l'erreur la plus fréquente du concept", () => {
    const plan = buildStudyPlan(weak)!;
    const tasks = plan.days.flatMap((d) => d.tasks);
    expect(tasks.find((t) => t.kind === "learn" && t.concept === "Entropie")!.errorType).toBe("einheit");
    expect(tasks.find((t) => t.kind === "learn" && t.concept === "Wärmekapazität")!.errorType).toBeNull();
  });

  test("un seul concept fragile : quatre rendez-vous, les autres jours restent libres", () => {
    const plan = buildStudyPlan([weak[0]!])!;
    expect(plan.days.map((d) => d.tasks.map((t) => t.kind))).toEqual([["learn"], [], ["recall"], [], [], ["apply"], ["selftest"]]);
  });

  test("mêmes données, même plan : rien n'est tiré au hasard, chaque tâche a un identifiant stable et unique", () => {
    const a = buildStudyPlan(weak)!;
    const b = buildStudyPlan(weak)!;
    expect(a).toEqual(b);
    const ids = a.days.flatMap((d) => d.tasks.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^d[1-7]-(learn|recall|apply|selftest)-\d$/.test(id))).toBe(true);
  });

  test("l'avancement : tâches cochées sur tâches du plan, sans compter une coche inconnue", () => {
    const plan = buildStudyPlan([weak[0]!])!;
    expect(planProgress(plan, [])).toEqual({ done: 0, total: 4 });
    expect(planProgress(plan, ["d1-learn-0", "d3-recall-0", "d9-learn-0"])).toEqual({ done: 2, total: 4 });
  });
});

/* ── Le plan gardé sur l'appareil ─────────────────────────────────────── */

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("le plan gardé sur l'appareil pour la semaine", () => {
  const local = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
  const plan = { ...buildStudyPlan([concept("Entropie", 0.2)])!, createdAt: local(2026, 11, 16, 9) };

  test("le jour du plan suit le calendrier, pas un compte de 24 heures", () => {
    expect(planDay(local(2026, 11, 16, 23, 50), local(2026, 11, 16, 23, 55))).toBe(1);
    expect(planDay(local(2026, 11, 16, 23, 50), local(2026, 11, 17, 0, 10))).toBe(2);
    expect(planDay(local(2026, 11, 16, 9), local(2026, 11, 22, 8))).toBe(7);
  });

  test("après le septième jour, la semaine est finie", () => {
    expect(planExpired(local(2026, 11, 16, 9), local(2026, 11, 22, 23))).toBe(false);
    expect(planExpired(local(2026, 11, 16, 9), local(2026, 11, 23, 0, 5))).toBe(true);
  });

  test("la date de chaque jour : le jour 1 est le jour de création", () => {
    expect(dateOfDay(local(2026, 11, 16, 9), 1).getDate()).toBe(16);
    expect(dateOfDay(local(2026, 11, 16, 9), 7).getDate()).toBe(22);
    // Passage de mois.
    expect(dateOfDay(local(2026, 11, 28, 9), 5).getDate()).toBe(2);
  });

  test("cocher puis décocher une tâche", () => {
    expect(toggleDone([], "d1-learn-0")).toEqual(["d1-learn-0"]);
    expect(toggleDone(["d1-learn-0", "d3-recall-0"], "d1-learn-0")).toEqual(["d3-recall-0"]);
  });

  test("le plan et ses coches reviennent tels quels", () => {
    const storage = memoryStorage();
    savePlan("u1", { plan, done: ["d1-learn-0"] }, storage);
    expect(loadPlan("u1", storage)).toEqual({ plan, done: ["d1-learn-0"] });
    clearPlan("u1", storage);
    expect(loadPlan("u1", storage)).toBeNull();
  });

  test("le plan d'un compte n'est jamais montré à un autre compte du même appareil", () => {
    const storage = memoryStorage();
    savePlan("u1", { plan, done: [] }, storage);
    expect(loadPlan("u2", storage)).toBeNull();
    expect([...storage.data.keys()]).toEqual(["tred.studyPlan.v1:u1"]);
  });

  test("une valeur abîmée ou d'une autre forme est ignorée, sans erreur", () => {
    const storage = memoryStorage();
    for (const raw of ["{", "null", "[]", '{"plan":{"days":"x"},"done":[]}', '{"plan":{"createdAt":"hier","days":[],"concepts":[]},"done":[]}']) {
      storage.setItem("tred.studyPlan.v1:u1", raw);
      expect(loadPlan("u1", storage)).toBeNull();
    }
  });

  test("stockage refusé (navigation privée) : rien ne casse", () => {
    const refusing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadPlan("u1", refusing)).toBeNull();
    expect(() => savePlan("u1", { plan, done: [] }, refusing)).not.toThrow();
    expect(() => clearPlan("u1", refusing)).not.toThrow();
  });
});

/* ── Le profil en base : SQLite réel, en mémoire ──────────────────────── */

async function memoryDb(withTable = true) {
  const libsql = await import("@libsql/client");
  const dz = await import("drizzle-orm/libsql");
  const client = libsql.createClient({ url: ":memory:" });
  if (withTable) {
    const script = read("../../../migre-concept-mastery.mjs");
    const statements = [...script.matchAll(/`(CREATE (?:TABLE|UNIQUE INDEX|INDEX) IF NOT EXISTS[\s\S]*?)`/g)].map((m) => m[1]!);
    for (const s of statements) await client.execute(s);
  }
  return dz.drizzle(client) as unknown as MasteryDb;
}

async function answer(db: MasteryDb, user: string, name: string, topic: string, outcomes: ("richtig" | "teilweise" | "falsch")[], errorType?: "einheit" | "vorzeichen" | "formel") {
  for (const outcome of outcomes) await recordMastery(db, user, { concept: name, topic, outcome, errorType });
}

describe("le profil d'apprentissage d'un compte", () => {
  test("par matière : combien de concepts sûrs, en construction, fragiles", async () => {
    const db = await memoryDb();
    await answer(db, "u1", "Entropie", "Thermodynamik", ["falsch", "falsch"], "einheit");
    await answer(db, "u1", "Enthalpie", "Thermodynamik", ["richtig", "richtig", "richtig"]);
    await answer(db, "u1", "Isotherme", "Thermodynamik", ["richtig"]);
    await answer(db, "u1", "Auflager", "Statik", ["richtig", "richtig"]);

    const profile = await learnerProfile(db, "u1");
    expect(profile.available).toBe(true);
    expect(profile.subjects).toEqual([
      { topic: "Thermodynamik", score: expect.any(Number), concepts: 3, strong: 1, building: 1, weak: 1 },
      { topic: "Statik", score: expect.any(Number), concepts: 1, strong: 1, building: 0, weak: 0 },
    ]);
    expect(profile.totals).toEqual({ concepts: 4, attempts: 8 });
  });

  test("les forces (les plus sûres d'abord) et les faiblesses (les plus fragiles d'abord)", async () => {
    const db = await memoryDb();
    await answer(db, "u1", "Entropie", "Thermodynamik", ["falsch", "falsch"], "einheit");
    await answer(db, "u1", "Kreisprozess", "Thermodynamik", ["falsch"], "formel");
    await answer(db, "u1", "Enthalpie", "Thermodynamik", ["richtig", "richtig", "richtig"]);
    await answer(db, "u1", "Auflager", "Statik", ["richtig", "richtig"]);

    const profile = await learnerProfile(db, "u1");
    expect(profile.strengths.map((c) => c.concept)).toEqual(["Enthalpie", "Auflager"]);
    expect(profile.weaknesses.map((c) => c.concept)).toEqual(["Entropie", "Kreisprozess"]);
    expect(profile.weaknesses[0]!.errors).toEqual([{ type: "einheit", count: 2 }]);
  });

  test("les erreurs typiques : le total par type, sur tous les concepts", async () => {
    const db = await memoryDb();
    await answer(db, "u1", "Entropie", "Thermodynamik", ["falsch", "falsch"], "einheit");
    await answer(db, "u1", "Auflager", "Statik", ["falsch"], "einheit");
    await answer(db, "u1", "Moment", "Statik", ["falsch"], "vorzeichen");
    expect((await learnerProfile(db, "u1")).errorTypes).toEqual([
      { type: "einheit", count: 3 },
      { type: "vorzeichen", count: 1 },
    ]);
  });

  test("jamais les données d'un autre compte", async () => {
    const db = await memoryDb();
    await answer(db, "autre", "Entropie", "Thermodynamik", ["falsch"], "einheit");
    const profile = await learnerProfile(db, "u1");
    expect(profile).toMatchObject({ available: true, subjects: [], strengths: [], weaknesses: [], errorTypes: [], totals: { concepts: 0, attempts: 0 } });
  });

  test("table pas encore migrée : indisponible, sans erreur", async () => {
    const db = await memoryDb(false);
    expect(await learnerProfile(db, "u1")).toMatchObject({ available: false, subjects: [] });
  });
});

/* ── Branchements ─────────────────────────────────────────────────────── */

describe("branchements", () => {
  const ROUTE = read("../src/api/routes/learning.ts");
  const API = read("../src/api/index.ts");
  const SECTION = read("../src/web/components/lernprofil-section.tsx");
  const DASHBOARD = read("../src/web/pages/dashboard.tsx");

  test("la route est dans le routeur, derrière la session", () => {
    expect(API).toMatch(/import \{ learning \} from "\.\/routes\/learning";/);
    expect(API).toMatch(/\n {2}learning,\n/);
    expect(ROUTE).toContain("profile: authed");
    expect(ROUTE).toContain("plan: authed");
  });

  test("les documents fouillés sont ceux du compte de la session, et de lui seul", () => {
    expect(ROUTE).toContain("eq(document.userId, uid)");
    expect(ROUTE).not.toMatch(/input\.userId|input\?\.userId/);
  });

  test("le plan ne coûte rien : aucun appel de modèle dans la route", () => {
    expect(ROUTE).not.toMatch(/anthropic|openai|generateText|streamText|ai-models/i);
  });

  test("la création du plan est limitée par compte", () => {
    expect(ROUTE).toContain("USER_LIMITS.studyPlan()");
  });

  test("le tableau de bord affiche la section, et « Mein Fortschritt » reste en place", () => {
    expect(DASHBOARD).toContain("<LernprofilSection />");
    expect(DASHBOARD).toContain("<ProgressSection />");
    expect(SECTION).toContain("orpc.learning.profile.queryOptions()");
    expect(SECTION).toContain('data-testid="lernprofil-section"');
  });

  test("une page citée ouvre le document de l'étudiant à cette page, concept surligné", () => {
    expect(SECTION).toMatch(/<DocumentViewer docId=\{viewer\?\.documentId \?\? null\} page=\{viewer\?\.page \?\? null\} highlight=\{viewer\?\.concept \?\? null\}/);
  });

  test("« Mit dem Tutor üben » pose la question dans le champ du Hörsaal, sans l'envoyer", () => {
    expect(SECTION).toContain('sessionStorage.setItem("tred.askDraft"');
    expect(SECTION).not.toMatch(/\/api\/agent\/messages/);
  });

  test("le mode socratique reste un choix de l'étudiant, jamais le réglage par défaut (décision du fondateur, 16 nov. 2026)", () => {
    expect(socraticFlags(undefined).on).toBe(false);
    expect(socraticFlags({}).on).toBe(false);
    expect(socraticFlags({ socratic: "true" }).on).toBe(false);
    expect(socraticFlags({ socratic: true }).on).toBe(true);
  });
});
