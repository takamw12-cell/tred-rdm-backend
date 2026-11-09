import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  BUNDESLAENDER,
  findUniversity,
  groupByLand,
  initialsOf,
  LOGO_DOMAINS,
  searchUniversities,
  UNIVERSITIES,
  type LandCode,
} from "../src/web/lib/universities";

const PUBLIC = join(import.meta.dir, "..", "public");
const LANDS = Object.keys(BUNDESLAENDER) as LandCode[];

describe("logos des établissements (plus de drapeaux des Länder)", () => {
  test("16 Länder, et les drapeaux ont quitté le dépôt", () => {
    expect(LANDS).toHaveLength(16);
    expect(existsSync(join(PUBLIC, "flags"))).toBe(false);
  });
  test("chaque établissement a un domaine officiel, unique et bien formé", () => {
    for (const u of UNIVERSITIES) expect(u.domain).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)*\.(de|edu|berlin)$/);
    expect(LOGO_DOMAINS.size).toBe(UNIVERSITIES.length);
    expect(findUniversity("RWTH Aachen")?.domain).toBe("rwth-aachen.de");
    expect(findUniversity("FH Aachen")?.domain).toBe("fh-aachen.de");
    expect(findUniversity("TU München")?.domain).toBe("tum.de");
  });
  test("monogramme d'un établissement hors liste : ses initiales", () => {
    expect(initialsOf("Sorbonne Université")).toBe("SU");
    expect(initialsOf("Lycée Victor Hugo")).toBe("LVH");
    expect(initialsOf("École des Ponts ParisTech")).toBe("ÉPP");
    expect(initialsOf("RWTH")).toBe("RWTH");
    expect(initialsOf("")).toBe("TRED");
    expect(initialsOf(null)).toBe("TRED");
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
