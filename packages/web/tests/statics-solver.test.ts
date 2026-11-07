import { describe, expect, test } from "bun:test";
import { solveStatics, type StaticsInput } from "../src/api/lib/solvers/statics-solver";

/** Valeurs attendues calculées à la main (méthode des nœuds, Ritter, Coulomb). */
type Any = any;
const ok = (input: StaticsInput): Any => {
  const r = solveStatics(input);
  if (!r.ok) throw new Error(`Solveur en erreur : ${(r as Any).fehler}`);
  return r;
};
const close = (a: number, b: number, tol = 1e-3) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const s2 = Math.SQRT2;

// Zweifeldriges Fachwerk : unten A(0,0) B(2,0) C(4,0), oben D(1,1) E(3,1), 10 kN in B.
const truss = {
  knoten: [
    { name: "A", x: 0, y: 0 },
    { name: "B", x: 2, y: 0 },
    { name: "C", x: 4, y: 0 },
    { name: "D", x: 1, y: 1 },
    { name: "E", x: 3, y: 1 },
  ],
  staebe: [
    { name: "1", von: "A", nach: "B" },
    { name: "2", von: "B", nach: "C" },
    { name: "3", von: "A", nach: "D" },
    { name: "4", von: "D", nach: "B" },
    { name: "5", von: "B", nach: "E" },
    { name: "6", von: "E", nach: "C" },
    { name: "7", von: "D", nach: "E" },
  ],
  lager: [
    { knoten: "A", art: "fest" as const },
    { knoten: "C", art: "los" as const },
  ],
  lasten: [{ knoten: "B", fy: -10 }],
};

describe("S1 — Fachwerk, Knotenpunktverfahren", () => {
  const r = ok({ aufgabe: "fachwerk", einheiten: { kraft: "kN" }, fachwerk: truss });
  const S = (n: string) => r.staebe.find((s: Any) => s.stab === n).kraft;
  test("Lagerkräfte A = C = 5 kN, Ax = 0", () => {
    const L = Object.fromEntries(r.lagerkraefte.map((l: Any) => [l.name, l.wert]));
    close(L.Ax, 0);
    close(L.Ay, 5);
    close(L.Cy, 5);
  });
  test("Stabkräfte : Untergurt Zug, Obergurt Druck, Diagonalen ±5√2", () => {
    close(S("1"), 5);
    close(S("2"), 5);
    close(S("3"), -5 * s2);
    close(S("4"), 5 * s2);
    close(S("7"), -10);
    expect(r.staebe.find((s: Any) => s.stab === "7").art).toBe("Druck");
  });
  test("abzählkriterium, Probe und Knotenreihenfolge", () => {
    expect(r.abzaehlkriterium).toContain("statisch bestimmt");
    expect(r.probe.erfuellt).toBe(true);
    expect(r.knoten_reihenfolge.length).toBeGreaterThan(0);
    for (const step of r.knoten_reihenfolge) expect(step.unbekannte_staebe.length).toBeLessThanOrEqual(2);
  });
});

describe("S2 — Ritterschnitt", () => {
  const r = ok({ aufgabe: "fachwerk", fachwerk: { ...truss, ritterschnitt: { staebe: ["7", "4", "1"], seite: ["A", "D"] } } });
  test("Obergurt über Ritterpunkt B : S7 = −10, stimmt mit Knotenverfahren", () => {
    const s7 = r.ritterschnitt.find((x: Any) => x.stab === "7");
    expect(s7.ritterpunkt).toEqual({ x: 2, y: 0 });
    close(s7.kraft, -10);
    for (const x of r.ritterschnitt) expect(x.stimmt_mit_knotenverfahren).toBe(true);
  });
  test("ungültiger Schnitt wird erkannt", () => {
    const bad = solveStatics({ aufgabe: "fachwerk", fachwerk: { ...truss, ritterschnitt: { staebe: ["7", "4", "2"], seite: ["A", "D"] } } });
    expect(bad.ok).toBe(false);
  });
});

describe("S3 — Bestimmtheit", () => {
  test("beweglich und unbestimmt werden benannt", () => {
    const loose = solveStatics({ aufgabe: "fachwerk", fachwerk: { ...truss, staebe: truss.staebe.slice(0, 6) } });
    expect(loose.ok).toBe(false);
    expect((loose as Any).fehler).toContain("beweglich");
    const over = solveStatics({ aufgabe: "fachwerk", fachwerk: { ...truss, lager: [{ knoten: "A", art: "fest" }, { knoten: "C", art: "fest" }] } });
    expect((over as Any).fehler).toContain("statisch unbestimmt");
  });
});

describe("S4 — Reibung auf der schiefen Ebene", () => {
  // m = 10 kg, α = 30°, μ0 = 0,5, μ = 0,4 : tan 30° = 0,577 > 0,5 → rutscht.
  const r = ok({ aufgabe: "reibung", reibung: { masse_kg: 10, winkel_grad: 30, mu_haft: 0.5, mu_gleit: 0.4 } });
  test("Normalkraft, Haftbedingung verletzt, Beschleunigung", () => {
    close(r.normalkraft_N, 98.1 * Math.cos(Math.PI / 6));
    expect(r.haftet).toBe(false);
    expect(r.selbsthemmung_ohne_kraft).toBe(false);
    close(r.haftgrenzwinkel_rho0_grad, 26.5651);
    expect(r.gleiten.bewegung).toBe("hangabwärts");
    close(r.gleiten.beschleunigung_m_s2, -(9.81 * (0.5 - 0.4 * Math.cos(Math.PI / 6))));
  });
  test("Haltebereich einer hangparallelen Kraft", () => {
    close(r.haltebereich_kraft.F_min, 98.1 * (0.5 - 0.5 * Math.cos(Math.PI / 6)));
    close(r.haltebereich_kraft.F_max, 98.1 * (0.5 + 0.5 * Math.cos(Math.PI / 6)));
  });
  test("mit Haltekraft im Bereich : haftet", () => {
    const h = ok({ aufgabe: "reibung", reibung: { masse_kg: 10, winkel_grad: 30, mu_haft: 0.5, kraft: { betrag: 30, richtung: "parallel_hoch" } } });
    expect(h.haftet).toBe(true);
    close(h.noetige_haftkraft_H, 49.05 - 30);
  });
});

describe("S5 — Kraftsystem und Gleichgewicht", () => {
  test("Lagerkräfte eines Trägers : F = 10 bei x = 1, Stützweite 4", () => {
    const r = ok({
      aufgabe: "kraeftesystem",
      kraeftesystem: {
        kraefte: [{ name: "F", betrag: 10, winkel_grad: 270, x: 1, y: 0 }],
        unbekannte: [
          { name: "Ax", x: 0, y: 0, winkel_grad: 0 },
          { name: "Ay", x: 0, y: 0, winkel_grad: 90 },
          { name: "By", x: 4, y: 0, winkel_grad: 90 },
        ],
      },
    });
    const U = Object.fromEntries(r.unbekannte.map((u: Any) => [u.name, u.wert]));
    close(U.Ax, 0);
    close(U.Ay, 7.5);
    close(U.By, 2.5);
    expect(r.probe.erfuellt).toBe(true);
  });
  test("Resultierende zweier Kräfte und Wirkungslinie", () => {
    const r = ok({
      aufgabe: "kraeftesystem",
      kraeftesystem: {
        kraefte: [
          { name: "F1", fx: 0, fy: -3, x: 0, y: 2 },
          { name: "F2", fx: 0, fy: -1, x: 4, y: 2 },
        ],
      },
    });
    close(r.resultierende.betrag, 4);
    close(r.resultierende.winkel_grad, -90);
    close(r.wirkungslinie.schnitt_x_achse, 1);
  });
});

describe("S6 — Werkzeug und Prompt", () => {
  test("statik_berechnen ist registriert, Freikörperbild-Regel steht im Prompt", async () => {
    const { buildTutorAgent } = await import("../src/api/agent/index");
    const flat = JSON.stringify(buildTutorAgent({ sources: [], locale: "de" }));
    expect(flat).toContain("statik_berechnen");
    expect(flat).toContain("FREIKÖRPERBILD");
    expect(flat).toContain("kraft-fkb");
  });
  test("Fachwerk- und Reibungsfragen landen bei Technischer Mechanik", async () => {
    const { detectDomain, domainHint } = await import("../src/api/lib/solvers/domain");
    const g = detectDomain("Bestimme alle Stabkräfte im Fachwerk mit dem Ritterschnitt");
    expect(g.domain).toBe("mechanik");
    expect(domainHint(g)).toContain("statik_berechnen");
    expect(detectDomain("Klotz auf schiefer Ebene, Haftreibung μ0 = 0,3").domain).toBe("mechanik");
  });
});
