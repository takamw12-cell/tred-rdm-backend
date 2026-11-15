import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DAILY_CARDS, pickDailyCards } from "../src/api/lib/daily-review";
import { reviewCard, newCardSchedule } from "../src/api/lib/flashcards";

/**
 * La mémoire à long terme (sprint du 2026-11-15, chantier 4) : chaque jour, le
 * Dashboard propose 5 cartes à réviser — d'abord celles qui touchent les
 * concepts les plus fragiles de l'étudiant — et montre sa maîtrise par matière.
 */

const day = (n: number) => new Date(Date.parse("2026-11-15T08:00:00Z") + n * 86_400_000);
const card = (id: string, topic: string, front: string, dueInDays: number, lapses = 0) => ({ id, topic, frontContent: front, nextReviewDate: day(dueInDays), lapses });

describe("les 5 cartes du jour", () => {
  test("cinq au plus, même si trente sont dues", () => {
    expect(DAILY_CARDS).toBe(5);
    const due = Array.from({ length: 30 }, (_, i) => card(`c${i}`, "Thermodynamik", `Frage ${i}`, -i));
    expect(pickDailyCards(due, [])).toHaveLength(5);
  });

  test("d'abord les cartes des concepts FRAGILES, le plus fragile en premier", () => {
    const due = [
      card("a", "Statik", "Was ist ein Auflager?", -9),
      card("b", "Thermodynamik", "Wie ist die Wärmekapazität definiert?", -1),
      card("c", "Elektrotechnik", "Was besagt die Knotenregel?", -2),
      card("d", "Thermodynamik", "Was ist Entropie?", -3),
    ];
    const weak = [
      { concept: "Knotenregel", topic: "Elektrotechnik" },
      { concept: "Wärmekapazität", topic: "Thermodynamik" },
    ];
    // c : concept le plus fragile. b puis d : la matière du deuxième (b le nomme, d est plus en retard mais ne le nomme pas).
    expect(pickDailyCards(due, weak).map((c) => c.id)).toEqual(["c", "b", "d", "a"]);
  });

  test("la carte qui NOMME le concept fragile passe avant celle qui n'a que la même matière", () => {
    const due = [card("matiere", "Thermodynamik", "Was ist ein Kreisprozess?", -30), card("concept", "Thermodynamik", "Einheit der Wärmekapazität?", -1)];
    expect(pickDailyCards(due, [{ concept: "Wärmekapazität", topic: "Thermodynamik" }]).map((c) => c.id)).toEqual(["concept", "matiere"]);
  });

  test("à égalité : la plus en retard, puis la plus souvent ratée", () => {
    const due = [card("recente", "x", "q1", -1), card("ancienne", "x", "q2", -10), card("ratee", "x", "q3", -10, 4)];
    expect(pickDailyCards(due, []).map((c) => c.id)).toEqual(["ratee", "ancienne", "recente"]);
  });

  test("sans concept fragile connu : simplement les plus en retard", () => {
    const due = [card("a", "A", "q", -1), card("b", "B", "q", -5), card("c", "C", "q", -3)];
    expect(pickDailyCards(due, []).map((c) => c.id)).toEqual(["b", "c", "a"]);
  });

  test("la casse et les tirets ne font pas rater une correspondance", () => {
    const due = [card("a", "Statik", "x", -1), card("b", "technische mechanik", "MOMENTEN-GLEICHGEWICHT aufstellen", -1)];
    expect(pickDailyCards(due, [{ concept: "Momentengleichgewicht", topic: "" }, { concept: "Momenten Gleichgewicht", topic: "" }])[0]!.id).toBe("b");
  });

  test("la liste reçue n'est pas modifiée, et rien n'est inventé", () => {
    const due = [card("a", "A", "q", -1), card("b", "B", "q", -5)];
    const copy = [...due];
    const picked = pickDailyCards(due, [{ concept: "B", topic: "B" }]);
    expect(due).toEqual(copy);
    expect(picked.every((c) => due.includes(c))).toBe(true);
    expect(pickDailyCards([], [{ concept: "B", topic: "B" }])).toEqual([]);
  });
});

describe("la répétition espacée existante (type SM-2) sert de base", () => {
  test("une carte sue revient plus tard, une carte ratée revient demain", () => {
    const now = day(0);
    const fresh = newCardSchedule(now);
    const known = reviewCard(fresh, true, now);
    const again = reviewCard(known, true, now);
    expect(again.intervalDays).toBeGreaterThan(known.intervalDays);
    const missed = reviewCard(again, false, now);
    expect(missed.intervalDays).toBeLessThanOrEqual(1);
    expect(missed.easeFactor).toBeLessThan(again.easeFactor);
  });
});

describe("branchement", () => {
  const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8");
  const ROUTE = read("../src/api/routes/flashcards.ts");
  const SECTION = read("../src/web/components/progress-section.tsx");
  const DASHBOARD = read("../src/web/pages/dashboard.tsx");

  test("une seule lecture pour la section : maîtrise par matière et cartes du jour, pour le compte de la session", () => {
    const progress = ROUTE.slice(ROUTE.indexOf("progress: authed"), ROUTE.indexOf("due: authed"));
    expect(progress).toContain("masteryBySubject(masteryDb, uid)");
    expect(progress).toContain("weakestConcepts(masteryDb, uid, 10)");
    expect(progress).toContain("pickDailyCards(");
    expect(progress).toContain("eq(flashcard.userId, uid)");
    expect(progress).not.toMatch(/input\(/);
  });

  test("la section « Mein Fortschritt » est sur le Dashboard : barres par matière et cartes du jour", () => {
    expect(DASHBOARD).toContain("<ProgressSection />");
    expect(SECTION).toContain("orpc.flashcards.progress.queryOptions()");
    expect(SECTION).toContain('<progress className="sr-only" max={100} value={percent} aria-label={s.topic} />');
    expect(SECTION).toContain('t("progress.today")');
    expect(SECTION).toContain('to="/flashcards"');
  });

  test("rien à montrer : la section ne s'affiche pas (pas d'encadré vide)", () => {
    expect(SECTION).toMatch(/if \(!data\?\.available \|\| \(data\.subjects\.length === 0 && data\.daily\.length === 0\)\) return null;/);
  });

  test("les textes existent dans les douze langues", () => {
    const dir = join(import.meta.dir, "../src/web/i18n/messages");
    const files = readdirSync(dir).filter((f) => /^[a-z]{2}\.ts$/.test(f));
    expect(files).toHaveLength(12);
    for (const f of files) {
      const text = readFileSync(join(dir, f), "utf8");
      const block = text.slice(text.indexOf("\n  progress: {"));
      expect(`${f} ${text.includes("\n  progress: {")}`).toBe(`${f} true`);
      for (const key of ["title:", "bySubject:", "concepts:", "today:", "todayHint:", "todayEmpty:", "start:", "subjectsEmpty:"]) expect(`${f} ${key} ${block.slice(0, 1400).includes(key)}`).toBe(`${f} ${key} true`);
    }
  });
});
