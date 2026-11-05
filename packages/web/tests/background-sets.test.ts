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
    ["Wirtschaftsinformatik", "general"],
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

  test("catégorie sans image dédiée → fond général", () => {
    expect(backgroundsFor("electrical")).toEqual(GENERAL);
  });

  test("chaque image référencée existe dans public/", () => {
    const all = new Set([...GENERAL, ...Object.values(CATEGORY_IMAGES).flat()]);
    for (const src of all) expect(existsSync(join(PUBLIC, src))).toBe(true);
  });
});
