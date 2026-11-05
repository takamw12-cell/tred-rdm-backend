import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  CATEGORY_IMAGES,
  GENERAL,
  backgroundsFor,
  categoryForProgram,
} from "../src/web/lib/background-sets";

const PUBLIC = join(import.meta.dir, "../public");

describe("fonds selon la filière", () => {
  test.each([
    ["Luft- und Raumfahrttechnik", "aerospace"],
    ["Aerospace Engineering", "aerospace"],
    ["Mechatronik", "mechatronics"],
    ["Maschinenbau", "mechanical"],
    ["Elektrotechnik", "electrical"],
    ["Bauingenieurwesen", "civil"],
    ["Wirtschaftsinformatik", "informatics"],
    ["Informatik", "informatics"],
    ["Informationstechnik", "electrical"],
    ["Technische Physik", "physics"],
    ["Mathematik", "physics"],
    ["Betriebswirtschaft", "general"],
    ["", "general"],
  ] as const)("%s → %s", (program, category) => {
    expect(categoryForProgram(program)).toBe(category);
  });

  test("images de la filière intercalées avec le général, sans doublon", () => {
    const own = CATEGORY_IMAGES.aerospace;
    const list = backgroundsFor("aerospace");
    expect(list[0]).toBe(own[0]);
    expect(list[2]).toBe(own[1]); // une image de la filière sur deux au début
    expect(list.length).toBe(own.length + GENERAL.length);
    expect(new Set(list).size).toBe(list.length);
  });

  test("filière inconnue → fond général", () => {
    expect(backgroundsFor(categoryForProgram("Betriebswirtschaft"))).toEqual(GENERAL);
  });

  test("chaque filière a au moins une image qui lui est propre en tête", () => {
    for (const [cat, own] of Object.entries(CATEGORY_IMAGES)) {
      if (cat === "general") continue;
      expect(own.length).toBeGreaterThan(0);
      expect(own[0]).not.toContain("/general/");
    }
  });

  test("chaque image référencée existe dans public/", () => {
    const all = new Set([...GENERAL, ...Object.values(CATEGORY_IMAGES).flat()]);
    for (const src of all) expect(existsSync(join(PUBLIC, src))).toBe(true);
  });
});
