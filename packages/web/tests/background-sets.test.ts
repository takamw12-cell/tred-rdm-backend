import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AWAITING_IMAGES,
  CATEGORY_IMAGES,
  GENERAL,
  backgroundsFor,
  categoryForProgram,
  portraitOf,
  shuffled,
} from "../src/web/lib/background-sets";
import UNIVERSAL from "../src/web/data/universal-backgrounds.json";
import { STUDIENGAENGE, studiengangLabel } from "../src/web/lib/studiengaenge";
import { VEILS } from "../src/web/lib/background-veils";

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
    // Hors ingénierie (2026-11-09)
    ["Medizin", "medicine"],
    ["Humanmedizin", "medicine"],
    ["Biomedizinische Technik", "biomedical"],
    ["Medizintechnik", "biomedical"],
    ["Rechtswissenschaften", "law"],
    ["Jura", "law"],
    ["Droit des affaires", "law"],
    ["Wirtschaftswissenschaften", "economics"],
    ["Betriebswirtschaft", "economics"],
    ["BWL", "economics"],
    ["Wirtschaftsingenieurwesen", "industrial"],
    // Refonte du 2026-11-11 : toutes les filières
    ["Biologie", "biology"],
    ["Biochemie", "chemical"],
    ["Psychologie", "psychology"],
    ["Philosophie", "philosophy"],
    ["Geschichtswissenschaft", "history"],
    ["Histoire", "history"],
    ["Germanistik", "languages"],
    ["Übersetzen und Dolmetschen", "languages"],
    ["Langues étrangères appliquées", "languages"],
    ["Theologie", "general"],
    ["", "general"],
  ] as const)("%s → %s", (program, category) => {
    expect(categoryForProgram(program)).toBe(category);
  });

  test("chaque filière du sélecteur a SON fond (jamais le fond général)", () => {
    for (const s of STUDIENGAENGE) expect(categoryForProgram(s.value)).not.toBe("general");
  });

  test("au moins 3 images thématiques par filière (propres, ou voisines en attendant)", () => {
    for (const [cat, own] of Object.entries(CATEGORY_IMAGES)) {
      if (cat === "general" || (AWAITING_IMAGES as readonly string[]).includes(cat)) continue;
      expect(own.length).toBeGreaterThanOrEqual(3);
      expect(own[0]).not.toContain("/general/");
      expect(backgroundsFor(cat as keyof typeof CATEGORY_IMAGES)).toEqual(own);
    }
  });

  test("images en attente : le fond général, jamais vide — et la liste se vide dès qu'elles arrivent", () => {
    for (const cat of AWAITING_IMAGES) {
      if (CATEGORY_IMAGES[cat].length === 0) expect(backgroundsFor(cat)).toEqual(GENERAL);
      // Des images sont arrivées : retirer la filière de AWAITING_IMAGES.
      else expect(CATEGORY_IMAGES[cat].length).toBeLessThan(3);
    }
  });

  test("filière inconnue → fond général", () => {
    expect(backgroundsFor(categoryForProgram("Theologie"))).toEqual(GENERAL);
  });

  test("chaque image et sa variante portrait existent dans public/", () => {
    const all = new Set([...GENERAL, ...Object.values(CATEGORY_IMAGES).flat()]);
    for (const src of all) {
      expect(existsSync(join(PUBLIC, src))).toBe(true);
      expect(existsSync(join(PUBLIC, portraitOf(src)))).toBe(true);
    }
  });
});

describe("fonds universels (10 par filière, ordre aléatoire)", () => {
  const sets = UNIVERSAL as Record<string, string[]>;

  test("une filière qui a ses fonds universels tourne UNIQUEMENT sur eux", () => {
    for (const [cat, list] of Object.entries(sets)) {
      if (list.length < 3) continue;
      expect(CATEGORY_IMAGES[cat as keyof typeof CATEGORY_IMAGES]).toEqual(list);
    }
  });

  test("chaque fond universel et sa variante portrait existent", () => {
    for (const src of Object.values(sets).flat()) {
      expect(src).toMatch(/^\/backgrounds\/[a-z]+\/[a-z]+-u\d\d\.webp$/);
      expect(existsSync(join(PUBLIC, src))).toBe(true);
      expect(existsSync(join(PUBLIC, portraitOf(src)))).toBe(true);
    }
  });

  test("shuffle : toutes les images, chacune une fois", () => {
    const list = Array.from({ length: 10 }, (_, i) => `img-${i}`);
    const out = shuffled(list);
    expect(out).toHaveLength(10);
    expect([...out].sort()).toEqual([...list].sort());
  });

  test("shuffle : la séquence change d'un tour à l'autre", () => {
    const list = Array.from({ length: 10 }, (_, i) => i);
    const seqs = new Set(Array.from({ length: 20 }, () => shuffled(list).join(",")));
    expect(seqs.size).toBeGreaterThan(15);
  });

  test("shuffle : l'image affichée ne revient jamais en tête du tour suivant", () => {
    const list = ["a", "b", "c", "d"];
    for (let k = 0; k < 200; k++) expect(shuffled(list, "a")[0]).not.toBe("a");
    // Même avec un tirage qui la remettrait en tête.
    expect(shuffled(list, "a", () => 0.999)[0]).not.toBe("a");
    expect(shuffled(["a"], "a")).toEqual(["a"]);
    expect(shuffled([])).toEqual([]);
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

  test("en haut (titre, date, sous-titre) : blanc et blanc à 70 % ≥ 4,5:1 même sur une photo blanche", () => {
    const WHITE = [255, 255, 255];
    const { c, a } = stops[0];
    const bg = mix(c, WHITE, a); // voile posé sur le pixel le plus clair
    expect(contrast(WHITE, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(mix(WHITE, bg, 0.7), bg)).toBeGreaterThanOrEqual(4.5);
  });

  test("plus bas (voile allégé) : le blanc reste ≥ 3:1 sur une photo blanche, le halo .on-photo fait le reste", () => {
    const WHITE = [255, 255, 255];
    for (const { c, a } of stops) expect(contrast(WHITE, mix(c, WHITE, a))).toBeGreaterThanOrEqual(3);
  });

  test("le voile laisse vraiment voir la photo (≤ 50 % au milieu)", () => {
    expect(stops[1].a).toBeLessThanOrEqual(0.5);
  });
});

/**
 * Le verre ET le voile ensemble : le texte gris d'une carte reste ≥ 4,5:1
 * dans le pire cas — voile le plus léger, photo la plus défavorable derrière.
 * Les valeurs sont relues dans styles.css et VEILS : baisser une opacité
 * sous son plancher fait échouer ce test.
 */
describe("cartes en verre : contraste AA dans le pire cas", () => {
  const css = readFileSync(join(import.meta.dir, "../src/web/styles.css"), "utf8");
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
  /** Opacité de fond de la première règle CSS qui commence par `selector`. */
  const alphaOf = (selector: string, color: string) => {
    const block = css.slice(css.indexOf(selector));
    const m = new RegExp(`background-color: rgb\\(${color} / ([0-9.]+)\\)`).exec(block.slice(0, block.indexOf("}")));
    if (!m) throw new Error(`opacité introuvable pour ${selector}`);
    return Number(m[1]);
  };
  const calmMin = Math.min(...[...VEILS.calm.matchAll(/background\/(\d+)/g)].map((m) => Number(m[1]) / 100));
  const CREAM = hex("#FDFBF7");
  const NIGHT = hex("#0F172A");
  const BLACK = [0, 0, 0];
  const WHITE = [255, 255, 255];

  test("clair : gris #5C5C5C sur carte en verre, voile le plus léger, photo noire", () => {
    const card = alphaOf('.glass-scope [data-slot="card"]:not(.bg-primary) {', "255 255 255");
    const behind = mix(CREAM, BLACK, calmMin);
    expect(css).toContain("--muted-foreground: #5c5c5c;");
    expect(contrast(hex("#5C5C5C"), mix(WHITE, behind, card))).toBeGreaterThanOrEqual(4.5);
  });

  test("sombre : gris clair #94A3B8 sur carte bleu nuit, voile le plus léger, photo blanche", () => {
    const card = alphaOf('.dark .glass-scope [data-slot="card"]:not(.bg-primary) {', "15 23 42");
    const behind = mix(NIGHT, WHITE, calmMin);
    expect(contrast(hex("#94A3B8"), mix(NIGHT, behind, card))).toBeGreaterThanOrEqual(4.5);
  });

  test("salle sombre (Dashboard) : gris #5C5C5C sur carte claire, photo noire", () => {
    const card = alphaOf('[data-room="dark"] [data-slot="card"]:not(.bg-primary) {', "255 255 255");
    expect(contrast(hex("#5C5C5C"), mix(WHITE, BLACK, card))).toBeGreaterThanOrEqual(4.5);
  });
});
