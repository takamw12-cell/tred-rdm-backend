import { describe, expect, test } from "bun:test";
import {
  TRACE_HARNESS,
  changedInRow,
  parseTrace,
  traceColumns,
  traceToMarkdown,
} from "../src/api/lib/solvers/variable-tracer";
import { domainPack } from "../src/api/prompts";
import { sanitizeSvg } from "../src/web/lib/svg-sanitize";

/** Sortie réelle du harnais (exécuté avec CPython pendant le développement). */
const SAMPLE = JSON.stringify({
  ok: true,
  stdout: "1 1\n",
  rows: [
    { step: 1, line: 1, scope: "<module>", vars: { summe: "0" }, output: "" },
    { step: 2, line: 2, scope: "<module>", vars: { summe: "0", i: "1" }, output: "" },
    { step: 3, line: 3, scope: "<module>", vars: { summe: "1", i: "1" }, output: "1 1\n" },
  ],
});

describe("Variablentabelle", () => {
  test("le harnais Python trace ligne par ligne, avec input() et une limite", () => {
    expect(TRACE_HARNESS).toContain("sys.settrace(tracer)");
    expect(TRACE_HARNESS).toContain('"<student>"');
    expect(TRACE_HARNESS).toContain("builtins.input = fake_input");
    expect(TRACE_HARNESS).toContain("max_steps=400");
  });
  test("lecture, colonnes et changements", () => {
    const t = parseTrace(SAMPLE);
    expect(t.ok).toBe(true);
    expect(traceColumns(t.rows)).toEqual(["summe", "i"]);
    expect([...changedInRow(t.rows, 1)]).toEqual(["i"]);
    expect([...changedInRow(t.rows, 2)]).toEqual(["summe"]);
  });
  test("JSON illisible → erreur propre", () => {
    expect(parseTrace("nope").ok).toBe(false);
  });
  test("Markdown pour le tuteur : vraies valeurs, code de la ligne", () => {
    const md = traceToMarkdown("summe = 0\nfor i in range(1, 2):\n    summe += i; print(i, summe)", parseTrace(SAMPLE));
    expect(md).toContain("| Schritt | Zeile | Code | summe | i | Ausgabe |");
    expect(md).toContain("| 3 | 3 |");
    expect(md).toContain("1 1⏎");
  });
});

describe("Fachmodul Datenverarbeitung", () => {
  const text = domainPack("datenverarbeitung")!.text;
  test("Python im Browser, MATLAB-Modus, DIN 66261 und DIN 66001", () => {
    for (const k of ["Variablentabelle", "MATLAB-MODUS", "fprintf", "Indizes ab 1", "DIN 66261", "DIN 66001"]) expect(text).toContain(k);
  });
  test("les deux exemples SVG sont propres et survivent au nettoyage", () => {
    const svgs = [...text.matchAll(/```svg\n([\s\S]*?)```/g)].map((m) => m[1].trim());
    expect(svgs.length).toBe(2);
    for (const svg of svgs) {
      expect(svg).toStartWith("<svg viewBox=");
      const clean = sanitizeSvg(svg);
      expect(clean.length).toBeGreaterThan(svg.length * 0.9);
      for (const tag of ["svg", "g", "defs", "marker"]) {
        const open = (svg.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
        expect((svg.match(new RegExp(`</${tag}>`, "g")) ?? []).length).toBe(open);
      }
    }
  });
});
