import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { checkNetlist } from "../src/api/lib/circuit/netlist";
import { runCircuitPipeline } from "../src/api/lib/circuit/pipeline";
import type { CircuitElement } from "../src/api/lib/solvers/solveCircuit";
import { layoutGraph, netlistBlockFromPart, parseNetlistBlock, proofBlockFromPart } from "../src/web/lib/netlist-block";
import { MarkdownContent } from "../src/web/components/markdown-content";

const FOUR_R: CircuitElement[] = [
  { typ: "V", name: "U0", a: "n1", b: "0", wert: 12 },
  { typ: "R", name: "R1", a: "n1", b: "n2", wert: 100 },
  { typ: "R", name: "R2", a: "n2", b: "0", wert: 300 },
  { typ: "R", name: "R3", a: "n2", b: "n3", wert: 100 },
  { typ: "R", name: "R4", a: "n3", b: "0", wert: 200 },
];

const netlistPart = { type: "tool-schaltplan_erfassen", state: "output-available", output: checkNetlist({ quelle: "bild", elemente: FOUR_R }) };
const proofPart = { type: "tool-schaltung_berechnen", state: "output-available", output: runCircuitPipeline({ elemente: FOUR_R }) };

describe("Tafel : Netzliste → Gleichungen → Probe", () => {
  test("le résultat d'outil devient un bloc, relu tel quel", () => {
    const block = netlistBlockFromPart(netlistPart)!;
    expect(block).toContain("```netzliste");
    const body = block.split("\n").find((l) => l.startsWith("{"))!;
    expect(parseNetlistBlock(body)?.elemente).toHaveLength(5);
    // Un bloc retouché (R3 changé à la main) n'est plus reconnu.
    expect(parseNetlistBlock(body.replace('"R3","a":"n2","b":"n3","wert":100', '"R3","a":"n2","b":"n3","wert":220'))).toBeNull();
    expect(netlistBlockFromPart({ ...netlistPart, state: "input-available" })).toBeNull();
  });

  test("graphe : un nœud par point, une arête par composant, masse en bas", () => {
    const v = checkNetlist({ quelle: "bild", elemente: FOUR_R });
    if (!v.ok) throw new Error("Fixture");
    const g = layoutGraph(v);
    expect(g.nodes).toHaveLength(4);
    expect(g.edges.map((e) => e.name)).toEqual(["U0", "R1", "R2", "R3", "R4"]);
    const ground = g.nodes.find((n) => n.ground)!;
    expect(Math.max(...g.nodes.map((n) => n.y))).toBe(ground.y);
  });

  test("rendu : tableau, graphe, boutons, équations KaTeX cochées", () => {
    const html = renderToStaticMarkup(<MarkdownContent content={`${netlistBlockFromPart(netlistPart)}${proofBlockFromPart(proofPart)}`} />);
    expect(html).toContain('data-slot="netlist-card"');
    for (const r of ["R1", "R2", "R3", "R4"]) expect(html).toContain(`>${r}</td>`);
    expect(html).toContain("<svg");
    expect(html).toContain("Stimmt so");
    expect(html).toContain('data-slot="proof-card"');
    expect((html.match(/class="katex"/g) ?? []).length).toBeGreaterThanOrEqual(9);
    expect(html).toContain("Alle 6 Gleichungen exakt erfüllt");
    // Aucun JSON brut ne reste visible.
    expect(html).not.toContain('"typ":"R"');
  });
});
