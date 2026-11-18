import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { streakFrom } from "../src/api/lib/streak";
import { de } from "../src/web/i18n/messages/de";
import { en } from "../src/web/i18n/messages/en";
import { fr } from "../src/web/i18n/messages/fr";
import { es } from "../src/web/i18n/messages/es";

/**
 * La série de jours d'étude (« flamme », 18 nov. 2026) : un jour compte dès
 * que l'étudiant a posé une question au tuteur. Les jours sont ceux de Berlin.
 */
const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");
const TODAY = "2026-11-18";

describe("calcul de la série", () => {
  test("aucun jour : pas de série, rien en danger", () => {
    expect(streakFrom([], TODAY)).toEqual({ current: 0, activeToday: false, atRisk: false, longest: 0 });
  });

  test("étudié aujourd'hui et les deux jours d'avant : 3, à l'abri", () => {
    expect(streakFrom(["2026-11-18", "2026-11-17", "2026-11-16"], TODAY)).toEqual({ current: 3, activeToday: true, atRisk: false, longest: 3 });
  });

  test("étudié hier mais pas encore aujourd'hui : la série vit encore, et elle est en danger", () => {
    expect(streakFrom(["2026-11-17", "2026-11-16"], TODAY)).toEqual({ current: 2, activeToday: false, atRisk: true, longest: 2 });
  });

  test("dernier jour avant-hier : la série est retombée à zéro, plus rien à sauver", () => {
    expect(streakFrom(["2026-11-16", "2026-11-15", "2026-11-14"], TODAY)).toEqual({ current: 0, activeToday: false, atRisk: false, longest: 3 });
  });

  test("un trou coupe la série ; la plus longue est gardée à part", () => {
    const days = ["2026-11-18", "2026-11-17", "2026-11-14", "2026-11-13", "2026-11-12", "2026-11-11"];
    expect(streakFrom(days, TODAY)).toMatchObject({ current: 2, longest: 4 });
  });

  test("ordre quelconque, doublons, valeurs abîmées, jours futurs : ignorés proprement", () => {
    const days = ["2026-11-17", "2026-11-18", "2026-11-18", "n'importe quoi", "", "2026-11-19", "2026-13-40"];
    expect(streakFrom(days, TODAY)).toMatchObject({ current: 2, activeToday: true });
  });

  test("passage de mois et d'année", () => {
    expect(streakFrom(["2027-01-01", "2026-12-31", "2026-12-30"], "2027-01-01").current).toBe(3);
    expect(streakFrom(["2026-03-01", "2026-02-28"], "2026-03-01").current).toBe(2);
  });
});

describe("branchements", () => {
  test("une question au tuteur marque le jour, sans jamais retarder ni faire échouer la réponse", () => {
    const index = read("src/api/index.ts");
    const route = index.slice(index.indexOf('app.post("/api/agent/messages"'), index.indexOf('app.post("/api/agent/translate"'));
    expect(route).toContain("void recordStudyDay(");
    // Après le décompte du quota : une question refusée (402) ne nourrit pas la série.
    expect(route.indexOf('consume(session.user.id, "chat")')).toBeLessThan(route.indexOf("void recordStudyDay("));
  });

  test("la table manquante (migration pas encore lancée) ne casse rien", () => {
    const lib = read("src/api/lib/streak.ts");
    expect(lib).toContain("missingTable(error)");
    expect(read("../../migre-streak.mjs")).toContain("CREATE TABLE IF NOT EXISTS study_day");
  });

  test("la série est une donnée personnelle : exportée et effacée avec le compte", () => {
    const gdpr = read("src/api/lib/gdpr.ts");
    expect(gdpr).toContain('"study_day",');
    expect(gdpr).toContain("db.delete(studyDay).where(eq(studyDay.userId, userId))");
  });

  test("tableau de bord : la flamme et la phrase d'alerte, dans les quatre langues", () => {
    expect(read("src/web/pages/dashboard.tsx")).toContain("<StreakFlame");
    const chip = read("src/web/components/streak-flame.tsx");
    expect(chip).toContain('data-testid="streak-flame"');
    expect(chip).toContain('data-testid="streak-at-risk"');
    for (const pack of [de, en, fr, es] as Array<{ streak: Record<string, string> }>) {
      for (const key of ["days", "none", "atRisk", "label"]) expect(pack.streak[key]?.length).toBeGreaterThan(3);
    }
    expect((de as { streak: Record<string, string> }).streak.atRisk).toBe("Achtung! Deine Serie ist in Gefahr. Stell eine Frage, um sie zu retten.");
  });
});
