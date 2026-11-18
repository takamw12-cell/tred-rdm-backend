import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import katex from "katex";
import { MATH_PALETTE, formulaToken, insertFormula } from "../src/web/lib/math-input";
import { de } from "../src/web/i18n/messages/de";
import { en } from "../src/web/i18n/messages/en";
import { fr } from "../src/web/i18n/messages/fr";
import { es } from "../src/web/i18n/messages/es";

/** Saisie de formules dans le Hörsaal (bouton « fx », MathLive) — 18 nov. 2026. */
const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");

describe("la formule rejoint la question sous la forme $…$", () => {
  test("\\int_0^1 x^2 dx : posée telle quelle entre deux dollars", () => {
    expect(formulaToken("\\int_0^1 x^2 dx")).toBe("$\\int_0^1 x^2 dx$");
    expect(insertFormula("Berechne", "\\int_0^1 x^2 dx").text).toBe("Berechne $\\int_0^1 x^2 dx$");
  });

  test("ce que l'app affichera : KaTeX rend la formule sans erreur", () => {
    const token = formulaToken("\\int_0^1 x^2 dx");
    const html = katex.renderToString(token.slice(1, -1), { throwOnError: true });
    expect(html).toContain("∫");
    expect(html).not.toContain("katex-error");
  });

  test("au curseur, avec une espace de chaque côté quand il en manque", () => {
    const out = insertFormula("Was istgleich null?", "x^2", 7);
    expect(out.text).toBe("Was ist $x^2$ gleich null?");
    expect(out.text.slice(0, out.cursor)).toBe("Was ist $x^2$");
    expect(insertFormula("", "x^2")).toEqual({ text: "$x^2$", cursor: 5 });
    expect(insertFormula("a ", "x", 2).text).toBe("a $x$");
  });

  test("champ vide : rien n'est inséré", () => {
    for (const empty of ["", "   ", "\\,", "\\ "]) {
      expect(formulaToken(empty)).toBe("");
      expect(insertFormula("Frage", empty)).toEqual({ text: "Frage", cursor: 5 });
    }
  });

  test("pas de dollar parasite, une seule ligne", () => {
    expect(formulaToken("$x^2$")).toBe("$x^2$");
    expect(formulaToken("a\n+ b")).toBe("$a + b$");
  });
});

describe("la palette", () => {
  test("chaque touche insère du LaTeX que KaTeX sait rendre", () => {
    expect(MATH_PALETTE.length).toBeGreaterThanOrEqual(12);
    for (const key of MATH_PALETTE) {
      // #@ (sélection), #? et #0 (cases à remplir) sont des repères de MathLive.
      const latex = key.insert.replace(/#@|#\?|#0/g, "x");
      expect(() => katex.renderToString(latex, { throwOnError: true })).not.toThrow();
      expect(key.name.length).toBeGreaterThan(1);
    }
    expect(new Set(MATH_PALETTE.map((k) => k.name)).size).toBe(MATH_PALETTE.length);
  });
});

describe("branchements", () => {
  test("MathLive : paquet officiel, version exacte, chargé seulement à l'ouverture", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies.mathlive).toMatch(/^\d+\.\d+\.\d+$/);
    const chat = read("src/web/pages/chat.tsx");
    expect(chat).toContain('lazy(() => import("@/components/math-input")');
    expect(chat).not.toMatch(/^import .*from "mathlive"/m);
    const field = read("src/web/components/math-input.tsx");
    expect(field).toContain('import("mathlive")');
    // Polices du paquet servies par notre origine, aucun son, aucun tiers.
    expect(field).toContain("MathfieldElement.fontsDirectory = null");
    expect(field).toContain("MathfieldElement.soundsDirectory = null");
    expect(field).not.toMatch(/https?:\/\//);
  });

  test("le Hörsaal garde son champ de texte ; « fx » ouvre le champ de formule", () => {
    const chat = read("src/web/pages/chat.tsx");
    expect(chat).toContain('data-testid="math-toggle"');
    expect(chat).toContain("<textarea");
    expect(chat).toContain("insertFormula(input, latex");
  });

  test("textes dans les quatre langues complètes", () => {
    for (const pack of [de, en, fr, es] as Array<{ math: Record<string, string> }>) {
      for (const key of ["open", "insert", "close", "fieldLabel", "palette", "loading", "failed"]) expect(pack.math[key]?.length).toBeGreaterThan(2);
    }
  });
});
