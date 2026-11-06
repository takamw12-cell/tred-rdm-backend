import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BUNDESLAENDER,
  findUniversity,
  flagUrl,
  groupByLand,
  searchUniversities,
  UNIVERSITIES,
  type LandCode,
} from "../src/web/lib/universities";

const PUBLIC = join(import.meta.dir, "..", "public");
const LANDS = Object.keys(BUNDESLAENDER) as LandCode[];

describe("drapeaux des 16 Länder", () => {
  test("16 Länder, un SVG local pour chacun", () => {
    expect(LANDS).toHaveLength(16);
    for (const l of LANDS) expect(existsSync(join(PUBLIC, flagUrl(l)))).toBe(true);
  });
  test("SVG sûrs : ni script, ni gestionnaire, ni ressource externe", () => {
    for (const l of LANDS) {
      const svg = readFileSync(join(PUBLIC, flagUrl(l)), "utf8");
      expect(svg).toContain("<svg");
      expect(svg).not.toMatch(/<script|<foreignObject|\son[a-z]+=|href="(https?:|\/\/|data:)/i);
    }
  });
  test("code drapeau ISO 3166-2 : de-nw pour Nordrhein-Westfalen", () => {
    expect(flagUrl("nw")).toBe("/flags/de-nw.svg");
    expect(BUNDESLAENDER.nw).toBe("Nordrhein-Westfalen");
  });
});

describe("Hochschulen", () => {
  test("chaque Land a au moins une Hochschule ; ids et sigles uniques", () => {
    for (const l of LANDS) expect(UNIVERSITIES.some((u) => u.land === l)).toBe(true);
    expect(new Set(UNIVERSITIES.map((u) => u.id)).size).toBe(UNIVERSITIES.length);
    expect(new Set(UNIVERSITIES.map((u) => u.short)).size).toBe(UNIVERSITIES.length);
  });
  test("celles du cahier des charges sont là, au bon Land", () => {
    expect(findUniversity("FH Aachen")?.land).toBe("nw");
    expect(findUniversity("RWTH Aachen")?.land).toBe("nw");
    expect(findUniversity("TU München")?.land).toBe("by");
    expect(findUniversity("TU Berlin")?.land).toBe("be");
    expect(findUniversity("KIT")?.land).toBe("bw");
    expect(findUniversity("TU Darmstadt")?.land).toBe("he");
  });
  test("texte libre du profil : ancienne valeur, casse, accents", () => {
    expect(findUniversity("fhAachen")?.id).toBe("fh-aachen");
    expect(findUniversity("kit karlsruhe")?.id).toBe("kit");
    expect(findUniversity("TU Muenchen")?.id).toBe("tum");
    expect(findUniversity("Hochschule Irgendwo")).toBeNull();
    expect(findUniversity("")).toBeNull();
  });
  test("recherche par ville et par Land ; groupes triés", () => {
    expect(searchUniversities("aachen").map((u) => u.id).sort()).toEqual(["fh-aachen", "rwth"]);
    expect(searchUniversities("Sachsen-Anhalt").every((u) => u.land === "st")).toBe(true);
    const g = groupByLand(UNIVERSITIES);
    expect(g[0].land).toBe("bw");
    expect(g.map((x) => x.land)).toHaveLength(16);
  });
});
