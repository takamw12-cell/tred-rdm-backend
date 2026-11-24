import { describe, expect, test } from "bun:test";
import { layoutSchematic, GRID } from "../src/web/lib/schematic-layout";
import { netlistBlockFromPart, parseNetlistBlock } from "../src/web/lib/netlist-block";
import { checkNetlist } from "../src/api/lib/circuit/netlist";

/**
 * Le schéma redessiné comme sur la photo (demande du fondateur, 24 nov. 2026 :
 * « il doit reproduire le dessin, pas un graphe »). Aufgabe 13, avec les
 * positions rendues par la lecture.
 */
const el = (typ: string, name: string, a: string, b: string, wert: string) => ({ typ, name, a, b, wert }) as never;
const A13 = {
  masse: "0",
  elemente: [el("V", "U1", "K1", "0", "1"), el("R", "R1", "K1", "K2", "1"), el("R", "R4", "K2", "K3", "1"), el("R", "R3", "K2", "K5", "1"), el("R", "R2", "0", "K4", "1"), el("I", "I1", "K5", "K4", "1"), el("I", "I2", "K3", "K5", "1"), el("I", "I3", "K5", "K3", "1")],
  plan: { U1: [1, 3, 1, 5], R1: [2, 3, 4, 3], R4: [6, 3, 8, 3], R3: [5, 3, 5, 5], R2: [1, 5, 3, 5], I1: [5, 5, 3, 5], I2: [9, 3, 9, 5], I3: [10, 5, 10, 3] } as Record<string, [number, number, number, number]>,
};

describe("schéma redessiné comme sur la photo", () => {
  const d = layoutSchematic(A13)!;
  const sym = (n: string) => d.symbols.find((s) => s.name === n)!;

  test("chaque composant à sa place : U1 à gauche, R1 et R4 en haut, R2 et I1 en bas, I2 et I3 à droite", () => {
    expect(d.symbols).toHaveLength(8);
    expect(sym("U1").horizontal).toBe(false);
    expect(sym("R1").horizontal).toBe(true);
    expect(sym("R1").a.y).toBe(sym("R4").a.y);
    expect(sym("R2").a.y).toBeGreaterThan(sym("R1").a.y);
    expect(sym("I1").a.y).toBe(sym("R2").a.y);
    expect(sym("U1").a.x).toBeLessThan(sym("R3").a.x);
    expect(sym("I3").a.x - sym("I2").a.x).toBe(GRID);
  });

  test("les fils viennent de la netlist : un tracé par nœud à plusieurs bornes, jonctions aux bons endroits", () => {
    // K4 (R2–I1) et 0 (U1–R2) : les deux bornes sont au même point, aucun fil à tracer.
    expect(d.wires.map((w) => w.node).sort()).toEqual(["K1", "K2", "K3", "K5"]);
    // R1–R3–R4 en haut, R3–I1–I2–I3 en bas : des points de jonction.
    expect(d.dots.length).toBeGreaterThanOrEqual(2);
    expect(d.ground).not.toBeNull();
  });

  test("aucun fil ne traverse un composant", () => {
    for (const w of d.wires) {
      const pts = [...w.path.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
      for (const s of d.symbols) {
        const mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
        for (let i = 1; i < pts.length; i++) {
          const [p, q] = [pts[i - 1], pts[i]];
          const through = p.y === q.y ? p.y === mid.y && Math.min(p.x, q.x) < mid.x && mid.x < Math.max(p.x, q.x) && s.horizontal : p.x === q.x && p.x === mid.x && Math.min(p.y, q.y) < mid.y && mid.y < Math.max(p.y, q.y) && !s.horizontal;
          expect({ wire: w.node, symbol: s.name, through }).toEqual({ wire: w.node, symbol: s.name, through: false });
        }
      }
    }
  });

  test("source de tension : flèche du plus vers le moins, à l'écart du texte", () => {
    const u = sym("U1");
    expect(u.arrow!.to.y).toBeGreaterThan(u.arrow!.from.y);
    expect(u.arrow!.from.x).toBeLessThan(u.a.x);
    expect(u.label.x).toBeGreaterThan(u.a.x);
    expect(sym("R1").arrow).toBeNull();
  });

  test("plan absent, incomplet, en biais ou superposé : pas de dessin (la carte garde le graphe)", () => {
    expect(layoutSchematic({ ...A13, plan: undefined })).toBeNull();
    const { R4: _gone, ...partial } = A13.plan;
    expect(layoutSchematic({ ...A13, plan: partial })).toBeNull();
    expect(layoutSchematic({ ...A13, plan: { ...A13.plan, R4: [6, 3, 8, 4] } })).toBeNull();
    expect(layoutSchematic({ ...A13, plan: { ...A13.plan, R4: [2, 3, 4, 3] } })).toBeNull();
  });

  test("la place et les valeurs absentes de l'énoncé suivent la carte jusqu'au navigateur", () => {
    const out = checkNetlist({ quelle: "bild", elemente: A13.elemente, frei: ["R4"], plan: A13.plan });
    const block = netlistBlockFromPart({ type: "tool-schaltplan_erfassen", state: "output-available", output: out })!;
    const view = parseNetlistBlock(block.replace(/^\s*```netzliste\n/, "").replace(/\n```\s*$/, ""))!;
    expect(view.frei).toEqual(["R4"]);
    expect(layoutSchematic(view)).not.toBeNull();
  });
});
