import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { excerptItemRange, markBoxes, type PdfTextItem } from "../src/web/lib/pdf-highlight";

/**
 * Surlignage de la phrase citée DANS le PDF (sprint du 2026-11-15, chantier 5).
 * L'onglet « texte extrait » la surlignait déjà ; le lecteur PDF ouvrait la
 * bonne page sans dire où regarder.
 *
 * pdf.js rend le texte d'une page en « éléments » (un bout de ligne chacun,
 * avec sa position). On cherche lesquels couvrent la phrase, puis on en tire
 * des rectangles à poser sur la page.
 */

const item = (str: string, x = 72, y = 700, width = 300, height = 12): PdfTextItem => ({ str, transform: [height, 0, 0, height, x, y], width, height });

const PAGE = [
  item("Kapitel 3 — Kalorische Zustandsgrößen", 72, 740),
  item("Der erste Hauptsatz beschreibt die Erhaltung der Energie.", 72, 720),
  item("Die Wärmekapazität ist definiert als die Wärme-", 72, 700),
  item("menge, die ein Körper pro Kelvin Temperaturänderung", 72, 686),
  item("aufnimmt. Es gilt Q = C · ΔT.", 72, 672),
  item("Für ideale Gase gilt p V = n R T.", 72, 652),
];

describe("trouver la phrase dans la page", () => {
  test("une phrase sur une seule ligne", () => {
    expect(excerptItemRange(PAGE, "Der erste Hauptsatz beschreibt die Erhaltung der Energie.")).toMatchObject({ from: 1, to: 1 });
  });

  test("une phrase sur trois lignes, coupée par une césure", () => {
    const range = excerptItemRange(PAGE, "Die Wärmekapazität ist definiert als die Wärmemenge, die ein Körper pro Kelvin Temperaturänderung aufnimmt.");
    expect(range).toMatchObject({ from: 2, to: 4 });
  });

  test("la casse, la ponctuation et les espaces ne comptent pas", () => {
    expect(excerptItemRange(PAGE, "der  erste hauptsatz BESCHREIBT die erhaltung der energie")).toMatchObject({ from: 1, to: 1 });
  });

  test("la phrase commence et finit au milieu d'une ligne : on sait où", () => {
    const range = excerptItemRange(PAGE, "die ein Körper pro Kelvin Temperaturänderung aufnimmt")!;
    expect(range.from).toBe(3);
    expect(range.to).toBe(4);
    // « menge, » précède la phrase sur la ligne 3 : le surlignage ne part pas du bord gauche.
    expect(range.fromFraction).toBeGreaterThan(0.05);
    expect(range.fromFraction).toBeLessThan(0.25);
    // « Es gilt Q = C · ΔT. » suit la phrase sur la ligne 4 : il s'arrête avant la fin.
    expect(range.toFraction).toBeLessThan(0.6);
  });

  test("une formule recopiée autrement par le tuteur : le début et la fin de la phrase suffisent", () => {
    const range = excerptItemRange(PAGE, "Die Wärmekapazität ist definiert als die Wärmemenge, die ein Körper pro Kelvin Temperaturänderung aufnimmt. Es gilt $Q = C \\cdot \\Delta T$.");
    expect(range).toMatchObject({ from: 2 });
    expect(range!.to).toBeGreaterThanOrEqual(3);
  });

  test("phrase absente de la page : rien à surligner", () => {
    expect(excerptItemRange(PAGE, "Die Übertragungsfunktion beschreibt das Verhalten eines linearen Systems.")).toBeNull();
  });

  test("trois mots ne suffisent pas : on ne surligne pas un bout de phrase au hasard", () => {
    expect(excerptItemRange(PAGE, "Es gilt")).toBeNull();
    expect(excerptItemRange(PAGE, "")).toBeNull();
  });

  test("page sans texte (scan) : rien, sans erreur", () => {
    expect(excerptItemRange([], "Die Wärmekapazität ist definiert als die Wärmemenge")).toBeNull();
    expect(excerptItemRange([item(""), item("   ")], "Die Wärmekapazität ist definiert als die Wärmemenge")).toBeNull();
  });
});

describe("les rectangles posés sur la page", () => {
  // Une page de 612 × 792 points affichée à l'échelle 2 : l'axe y du PDF monte, celui de l'écran descend.
  const toViewport = ([x1, y1, x2, y2]: number[]) => [x1! * 2, (792 - y1!) * 2, x2! * 2, (792 - y2!) * 2];

  test("un rectangle par ligne, à l'échelle de l'affichage, autour de la ligne de base", () => {
    const boxes = markBoxes(PAGE, { from: 1, to: 1, fromFraction: 0, toFraction: 1 }, toViewport);
    expect(boxes).toHaveLength(1);
    const [box] = boxes;
    expect(box!.left).toBeCloseTo(144, 0);
    expect(box!.width).toBeCloseTo(600, 0);
    // La ligne de base est à y = 720 → 144 px du haut ; le rectangle l'encadre.
    expect(box!.top).toBeLessThan((792 - 720) * 2);
    expect(box!.top + box!.height).toBeGreaterThan((792 - 720) * 2);
    expect(box!.height).toBeGreaterThan(20);
    expect(box!.height).toBeLessThan(36);
  });

  test("trois lignes : trois rectangles, la première et la dernière rognées à la phrase", () => {
    const range = excerptItemRange(PAGE, "die ein Körper pro Kelvin Temperaturänderung aufnimmt")!;
    const boxes = markBoxes(PAGE, range, toViewport);
    expect(boxes).toHaveLength(2);
    expect(boxes[0]!.left).toBeGreaterThan(144);
    expect(boxes[1]!.width).toBeLessThan(600 * 0.6);
  });

  test("les éléments vides ou sans largeur ne donnent pas de rectangle", () => {
    const items = [item("Die Wärmekapazität ist definiert", 72, 700), item(" ", 372, 700, 0), item("als die Wärmemenge eines Körpers.", 72, 686)];
    expect(markBoxes(items, { from: 0, to: 2, fromFraction: 0, toFraction: 1 }, toViewport)).toHaveLength(2);
  });

  test("rien de négatif ni de démesuré, même avec des valeurs abîmées", () => {
    const boxes = markBoxes([{ str: "Die Wärmekapazität ist definiert", transform: [Number.NaN, 0, 0, 0, 72, 700], width: 300, height: 0 }], { from: 0, to: 0, fromFraction: 0, toFraction: 1 }, toViewport);
    for (const b of boxes) {
      expect(b.width).toBeGreaterThan(0);
      expect(b.height).toBeGreaterThan(0);
      expect(Number.isFinite(b.top + b.left)).toBe(true);
    }
  });
});

describe("branchement", () => {
  const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8");
  const VIEWER = read("../src/web/components/pdf-viewer.tsx");
  const DOCUMENT = read("../src/web/components/document-viewer.tsx");

  test("la visionneuse remet la phrase citée au lecteur PDF", () => {
    expect(DOCUMENT).toContain("highlight={highlight}");
  });

  test("le lecteur lit le texte de la page affichée et pose les rectangles sur elle", () => {
    expect(VIEWER).toContain("getTextContent()");
    expect(VIEWER).toContain("excerptItemRange(");
    expect(VIEWER).toContain('data-testid="pdf-mark"');
    // Jaune, sans masquer le texte, et sans gêner la souris.
    expect(VIEWER).toMatch(/mix-blend-multiply/);
    expect(VIEWER).toMatch(/pointer-events-none/);
  });
});
