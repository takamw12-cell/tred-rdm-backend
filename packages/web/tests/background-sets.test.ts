import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  CATEGORY_IMAGES,
  GENERAL,
  backgroundsFor,
  categoryForProgram,
  portraitOf,
} from "../src/web/lib/background-sets";
import { STUDIENGAENGE, studiengangLabel } from "../src/web/lib/studiengaenge";
import { VEILS } from "../src/web/components/dynamic-background";

const PUBLIC = join(import.meta.dir, "../public");

describe("fonds selon la filière", () => {
  test.each([
    ["Luft- und Raumfahrttechnik", "aerospace"],
    ["Aerospace Engineering", "aerospace"],
    ["Mechatronik", "mechatronics"],
    ["Robotik / Autonome Systeme", "robotics"],
    ["Maschinenbau", "mechanical"],
    ["Elektrotechnik", "electrical"],
    ["Bauingenieurwesen", "civil"],
    ["Architektur", "architecture"],
    ["Wirtschaftsingenieurwesen", "industrial"],
    ["Chemieingenieurwesen / Verfahrenstechnik", "chemical"],
    ["Verfahrenstechnik", "chemical"],
    ["Umwelttechnik", "environmental"],
    ["Biomedizinische Technik", "biomedical"],
    ["Data Science / KI", "datascience"],
    ["Wirtschaftsinformatik", "informatics"],
    ["Informatik", "informatics"],
    ["Informationstechnik", "electrical"],
    ["Mathematik/Physik", "mathematics"],
    ["Technische Physik", "physics"],
    ["Physik", "physics"],
    ["Betriebswirtschaft", "general"],
    ["", "general"],
  ] as const)("%s → %s", (program, category) => {
    expect(categoryForProgram(program)).toBe(category);
  });

  test("chaque filière du sélecteur a SON fond (jamais le fond général)", () => {
    for (const s of STUDIENGAENGE) expect(categoryForProgram(s.value)).not.toBe("general");
  });

  test("au moins 3 images thématiques par filière (propres, ou voisines en attendant)", () => {
    for (const [cat, own] of Object.entries(CATEGORY_IMAGES)) {
      if (cat === "general") continue;
      expect(own.length).toBeGreaterThanOrEqual(3);
      expect(own[0]).not.toContain("/general/");
      expect(backgroundsFor(cat as keyof typeof CATEGORY_IMAGES)).toEqual(own);
    }
  });

  test("filière inconnue → fond général", () => {
    expect(backgroundsFor(categoryForProgram("Betriebswirtschaft"))).toEqual(GENERAL);
  });

  test("chaque image et sa variante portrait existent dans public/", () => {
    const all = new Set([...GENERAL, ...Object.values(CATEGORY_IMAGES).flat()]);
    for (const src of all) {
      expect(existsSync(join(PUBLIC, src))).toBe(true);
      expect(existsSync(join(PUBLIC, portraitOf(src)))).toBe(true);
    }
  });
});

describe("filières : 12 langues", () => {
  test("chaque filière est traduite partout, la valeur reste allemande", () => {
    for (const s of STUDIENGAENGE) {
      for (const l of ["en", "fr", "es", "it", "pt", "ru", "zh", "ja", "ar", "bn", "hi"]) {
        expect(studiengangLabel(s, l).length).toBeGreaterThan(2);
      }
      expect(studiengangLabel(s, "de")).toBe(s.value);
    }
    expect(STUDIENGAENGE).toHaveLength(15);
  });
});

/**
 * Contraste AA (≥ 4,5:1) GARANTI quelle que soit la photo : on suppose le
 * pire pixel (blanc pur sous le voile le plus léger) et on calcule.
 */
describe("voile : contraste AA dans le pire cas", () => {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = ([r, g, b]: number[]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const mix = (fg: number[], bg: number[], a: number) => fg.map((c, i) => c * a + bg[i] * (1 - a));
  const contrast = (a: number[], b: number[]) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  /** Couleurs et opacités du dégradé « vivid » (dashboard). */
  const stops = [...VEILS.vivid.matchAll(/\[(#[0-9A-Fa-f]{6})\]\/(\d+)/g)].map((m) => ({ c: hex(m[1]), a: Number(m[2]) / 100 }));

  test("le dégradé du dashboard est lu correctement", () => {
    expect(stops).toHaveLength(3);
  });

  test("texte blanc et texte blanc à 70 % lisibles même sur une photo blanche", () => {
    const WHITE = [255, 255, 255];
    for (const { c, a } of stops) {
      const bg = mix(c, WHITE, a); // voile posé sur le pixel le plus clair
      expect(contrast(WHITE, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(mix(WHITE, bg, 0.7), bg)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
