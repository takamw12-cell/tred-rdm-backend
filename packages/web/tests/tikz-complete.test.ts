import { describe, expect, test } from "bun:test";
import { isCompleteTikz } from "../src/web/lib/tikz-complete";

/** Incident « Kirchhoff » : compiler un bloc encore en cours d'écriture. */
describe("isCompleteTikz", () => {
  const full = "\\begin{circuitikz}\n\\draw (0,0) to[R=$R_1$] (2,0);\n\\end{circuitikz}";

  test("bloc complet → on compile", () => {
    expect(isCompleteTikz(full)).toBe(true);
    expect(isCompleteTikz("\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}")).toBe(true);
  });

  test("chaque préfixe en cours de streaming → on attend", () => {
    const end = full.indexOf("\\end{circuitikz}");
    for (let i = 1; i < end + "\\end{circuitikz".length; i += 7) {
      expect(isCompleteTikz(full.slice(0, i))).toBe(false);
    }
  });

  test("environnements imbriqués : il faut tous les \\end", () => {
    const nested = "\\begin{tikzpicture}\\begin{circuitikz}\\end{circuitikz}";
    expect(isCompleteTikz(nested)).toBe(false);
    expect(isCompleteTikz(nested + "\\end{tikzpicture}")).toBe(true);
  });

  test("pas d'environnement du tout → rien à compiler", () => {
    expect(isCompleteTikz("\\draw (0,0) -- (1,0);")).toBe(false);
  });
});
