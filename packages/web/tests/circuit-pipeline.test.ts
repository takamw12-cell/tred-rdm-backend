import { describe, expect, test } from "bun:test";
import { COMPONENT_TYPES, COMPONENTS, lawsFor } from "../src/api/lib/circuit/catalog";
import { checkGate, checkNetlist, netlistGate, netlistId, type SchaltplanInput } from "../src/api/lib/circuit/netlist";
import { runCircuitPipeline } from "../src/api/lib/circuit/pipeline";
import { proveCircuit, Q, fmtQ } from "../src/api/lib/circuit/proof";
import { circuitElementSchema, solveCircuit, type CircuitElement } from "../src/api/lib/solvers/solveCircuit";

/**
 * Der Schaltplan des Tests, wie ihn das Modell aus einem Foto abliest:
 *
 *   n1 ──R1 100 Ω── n2 ──R3 100 Ω── n3
 *   │               │               │
 *   U0 12 V       R2 300 Ω        R4 200 Ω
 *   │               │               │
 *   0 ─────────────────────────────────
 *
 * Von Hand: R3 + R4 = 300 Ω ∥ R2 = 300 Ω → 150 Ω; gesamt 250 Ω →
 * I = 48 mA; φ2 = 12 − 4,8 = 7,2 V; I2 = I3 = 24 mA; φ3 = 4,8 V.
 */
const FOUR_R: CircuitElement[] = [
  { typ: "V", name: "U0", a: "n1", b: "0", wert: 12 },
  { typ: "R", name: "R1", a: "n1", b: "n2", wert: "100" },
  { typ: "R", name: "R2", a: "n2", b: "0", wert: "300 Ω" },
  { typ: "R", name: "R3", a: "n2", b: "n3", wert: 100 },
  { typ: "R", name: "R4", a: "n3", b: "0", wert: "0.2k" },
];
const extraction: SchaltplanInput = { quelle: "bild", elemente: FOUR_R };

const assistantWithNetlist = (output: unknown) => ({
  role: "assistant",
  parts: [{ type: "tool-schaltplan_erfassen", state: "output-available", output }],
});
const userWithImage = { role: "user", parts: [{ type: "file", mediaType: "image/png", url: "data:image/png;base64,AAAA" }, { type: "text", text: "Berechne die Ströme" }] };
const user = (text: string) => ({ role: "user", parts: [{ type: "text", text }] });

describe("1. Schaltplan → Netzliste (4 Widerstände)", () => {
  test("die abgelesene Netzliste ist schlüssig: 5 Bauteile, 4 Knoten, Masse 0", () => {
    const r = checkNetlist(extraction);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.elemente.map((e) => e.name).sort()).toEqual(["R1", "R2", "R3", "R4", "U0"]);
    expect(r.knoten).toEqual(["0", "n1", "n2", "n3"]);
    expect(r.id).toMatch(/^n-[0-9a-f]{8}$/);
    // Jeder Widerstand sitzt zwischen den richtigen Knoten.
    const at = (n: string) => r.elemente.find((e) => e.name === n) as { a: string; b: string };
    expect([at("R1").a, at("R1").b]).toEqual(["n1", "n2"]);
    expect([at("R2").a, at("R2").b]).toEqual(["n2", "0"]);
    expect([at("R3").a, at("R3").b]).toEqual(["n2", "n3"]);
    expect([at("R4").a, at("R4").b]).toEqual(["n3", "0"]);
    expect(r.hinweise).toEqual([]);
  });

  test("die Kennung hängt am Inhalt: Reihenfolge und Schreibweise egal, Verwechslung nicht", () => {
    const id = netlistId({ elemente: FOUR_R });
    expect(netlistId({ elemente: [...FOUR_R].reverse() })).toBe(id);
    expect(netlistId({ elemente: FOUR_R.map((e) => (e.name === "R4" ? { ...e, wert: 200 } : e)) })).toBe(id);
    // R2 und R3 vertauscht (die Verwechslung des Briefs): andere Kennung.
    const swapped = FOUR_R.map((e) => (e.name === "R2" ? { ...e, name: "R3" } : e.name === "R3" ? { ...e, name: "R2" } : e));
    expect(netlistId({ elemente: swapped })).not.toBe(id);
  });

  test("Lesefehler werden gemeldet statt gerechnet", () => {
    const dup = checkNetlist({ quelle: "bild", elemente: FOUR_R.map((e) => (e.name === "R4" ? { ...e, name: "R3" } : e)) });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.probleme.join(" ")).toContain("doppelt: R3");

    const split = checkNetlist({ quelle: "bild", elemente: [...FOUR_R.slice(0, 3), { typ: "R", name: "R3", a: "x", b: "y", wert: 100 }] });
    expect(split.ok).toBe(false);
    if (!split.ok) expect(split.probleme.join(" ")).toContain("getrennte");

    const open = checkNetlist({ quelle: "bild", elemente: FOUR_R.map((e) => (e.name === "R4" ? { ...e, b: "n4" } : e)) });
    expect(open.ok).toBe(true);
    if (open.ok) expect(open.hinweise.join(" ")).toContain('"n4"');
  });

  test("ein erfundenes Bauteil scheitert am Katalog", () => {
    const r = checkNetlist({ quelle: "bild", elemente: [{ typ: "Memristor", name: "M1", a: "n1", b: "0", wert: 1 } as never] });
    expect(r.ok).toBe(false);
  });
});

describe("2. Sperre: kein Rechnen vor der Bestätigung", () => {
  const view = checkNetlist(extraction);
  if (!view.ok) throw new Error("Fixture");
  const input = { elemente: FOUR_R };

  test("mit Bild, ohne Bestätigung: schaltung_berechnen verweigert", () => {
    const gate = netlistGate([userWithImage, assistantWithNetlist(view)]);
    expect(gate.required).toBe(true);
    expect(runCircuitPipeline(input, gate)).toMatchObject({ ok: false, fehler: "netzliste_fehlt" });
    expect(runCircuitPipeline({ ...input, netzliste_id: view.id }, gate)).toMatchObject({ ok: false, fehler: "netzliste_nicht_bestaetigt" });
  });

  test("Knopf „✓ Netzliste … stimmt“ oder ein kurzes „ja“ bestätigen", () => {
    for (const reply of [`✓ Netzliste ${view.id} stimmt — bitte rechnen.`, "ja", "Stimmt so!", "oui c'est bon"]) {
      const gate = netlistGate([userWithImage, assistantWithNetlist(view), user(reply)]);
      expect(gate.confirmed.has(view.id)).toBe(true);
    }
    for (const reply of ["ja, aber R3 hat 220 Ω", "nein", "R2 ist falsch"]) {
      const gate = netlistGate([userWithImage, assistantWithNetlist(view), user(reply)]);
      expect(gate.confirmed.size).toBe(0);
    }
  });

  test("nach der Bestätigung: genau diese Netzliste wird gerechnet, eine veränderte nicht", () => {
    const gate = netlistGate([userWithImage, assistantWithNetlist(view), user("ja")]);
    const ok = runCircuitPipeline({ ...input, netzliste_id: view.id }, gate);
    expect(ok.ok).toBe(true);
    const changed = FOUR_R.map((e) => (e.name === "R3" ? { ...e, wert: 220 } : e));
    expect(runCircuitPipeline({ elemente: changed, netzliste_id: view.id }, gate)).toMatchObject({ ok: false, fehler: "netzliste_veraendert" });
  });

  test("eine Netzliste, deren Inhalt nicht zur Kennung passt, zählt nicht", () => {
    const forged = { ...view, elemente: FOUR_R.map((e) => (e.name === "R1" ? { ...e, wert: 1 } : e)) };
    const gate = netlistGate([userWithImage, assistantWithNetlist(forged), user("ja")]);
    expect(gate.confirmed.size).toBe(0);
  });

  test("Aufgabe nur als Text: keine Sperre, wie bisher", () => {
    const gate = netlistGate([user("R1 = 100 Ω in Reihe mit …")]);
    expect(gate.required).toBe(false);
    expect(checkGate(gate, input).ok).toBe(true);
    expect(runCircuitPipeline(input, gate).ok).toBe(true);
  });
});

describe("3. Löser + exakte Probe", () => {
  test("Ströme und Spannungen der 4 Widerstände, exakt", () => {
    const r = runCircuitPipeline({ elemente: FOUR_R });
    expect(r.ok).toBe(true);
    if (!r.ok || !("beweis" in r)) return;
    const I = (n: string) => r.elemente.find((e) => e.name === n)!.strom.re;
    expect(I("R1")).toBeCloseTo(0.048, 12);
    expect(I("R2")).toBeCloseTo(0.024, 12);
    expect(I("R3")).toBeCloseTo(0.024, 12);
    expect(I("R4")).toBeCloseTo(0.024, 12);
    const phi = (n: string) => r.knoten.find((k) => k.name === n)!.potential.re;
    expect(phi("n2")).toBeCloseTo(7.2, 12);
    expect(phi("n3")).toBeCloseTo(4.8, 12);

    const b = r.beweis;
    expect(b.exakt).toBe(true);
    if (!b.exakt) return;
    expect(b.bestanden).toBe(true);
    // 4 Knoten + 2 unabhängige Maschen (5 Zweige − 4 Knoten + 1).
    expect(b.geprueft).toBe(6);
    expect(b.maschen).toHaveLength(2);
    expect([...b.knoten, ...b.maschen, ...b.ohm].every((e) => e.erfuellt)).toBe(true);
    expect(b.knoten.find((k) => k.ort === "n2")!.latex).toContain(String.raw`48\,\mathrm{mA}`);
    expect(b.ohm.find((o) => o.ort === "R1")!.latex).toContain(String.raw`4.8\,\mathrm{V}`);
    expect(b.abgleich).toBeLessThan(1e-9);
  });

  test("nicht abbrechende Brüche bleiben Brüche", () => {
    expect(fmtQ(new Q(10n, 3n), "V")).toBe(String.raw`\tfrac{10}{3}\,\mathrm{V} \approx 3.333\,\mathrm{V}`);
    expect(Q.from(4.7e3).n).toBe(4700n);
    expect(Q.from(1e-7).d).toBe(10_000_000n);
  });

  test("ein falscher Gleitkomma-Wert fällt in der exakten Probe durch", () => {
    const numeric = solveCircuit({ elemente: FOUR_R });
    if (!numeric.ok) throw new Error("Fixture");
    const wrong = { ...numeric, elemente: numeric.elemente.map((e) => (e.name === "R3" ? { ...e, strom: { ...e.strom, re: 0.025 } } : e)) };
    const b = proveCircuit({ elemente: FOUR_R }, wrong);
    expect(b.exakt && b.bestanden).toBe(false);
  });

  test("Wechselstrom: ehrlich nur numerische Probe", () => {
    const r = runCircuitPipeline({ elemente: [{ typ: "V", name: "U", a: "1", b: "0", wert: 10 }, { typ: "C", name: "C1", a: "1", b: "0", wert: "1u" }], frequenz: 50 });
    expect(r.ok && "beweis" in r && r.beweis.exakt).toBe(false);
  });
});

describe("4. Wissensgraph", () => {
  test("Katalog und Eingabeschema kennen dieselben Bauteile", () => {
    const schemaTypes = circuitElementSchema.options.flatMap((o) => {
      const t = o.shape.typ;
      return "options" in t ? (t.options as string[]) : [t.value as string];
    });
    expect([...schemaTypes].sort()).toEqual([...COMPONENT_TYPES].sort());
  });

  test("die Gesetze kommen nur aus dem Katalog", () => {
    const laws = lawsFor(["R", "V"], "DC").map((l) => l.id);
    expect(laws).toEqual(["knotenregel", "maschenregel", "ohm", "spannungsquelle", "leistungsbilanz"]);
    for (const c of Object.values(COMPONENTS)) expect(c.gesetze.DC.length + c.gesetze.AC.length).toBeGreaterThan(0);
  });
});
