import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  R_MOLAR,
  processCurve,
  pvDiagram,
  solveAdiabatic,
  solveCarnotEfficiency,
  solveFirstLaw,
  solveIdealGas,
  solveIsobaric,
  solveIsochoric,
  solveIsothermal,
} from "../src/api/lib/thermo-solver";
import { solveThermo } from "../src/api/lib/solvers/solveThermo";
import {
  G_STANDARD,
  projectileChart,
  solveKinematics,
  solveNewton,
  solvePhysics,
  solveProjectile,
} from "../src/api/lib/physics-solver";
import { detectDomain, domainHint } from "../src/api/lib/solvers/domain";
import { domainPack } from "../src/api/prompts";
import { solverChartBlockFromPart } from "../src/web/lib/solver-charts";

const close = (a: number, b: number, rel = 1e-9) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(b)));

describe("Thermo — Grundformeln", () => {
  test("Carnot : exakt 1 − Tc/Th (Referenz)", () => {
    for (const [Th, Tc] of [[600, 300], [873.15, 293.15], [500, 499], [1e4, 1]]) {
      expect(solveCarnotEfficiency(Th, Tc)).toBe(1 - Tc / Th);
    }
    expect(solveCarnotEfficiency(600, 300)).toBe(0.5);
    expect(() => solveCarnotEfficiency(300, 600)).toThrow("T_warm > T_kalt");
    expect(() => solveCarnotEfficiency(100, -20)).toThrow("Kelvin");
  });

  test("Carnot : der Prozess-Löser liefert denselben Wert", () => {
    const r = solveThermo({ modus: "carnot", T_warm: "600 K", T_kalt: "27 °C" }) as { ok: true; eta_carnot: number };
    expect(r.ok).toBe(true);
    close(r.eta_carnot, 1 - 300.15 / 600, 1e-8);
  });

  test("ideales Gas : 1 mol bei 0 °C und 1 atm ≈ 22,4 L (Referenz)", () => {
    const r = solveIdealGas(101325, undefined, 273.15, 1);
    expect(r.gesucht).toBe("V");
    close(r.V, 0.0224139, 1e-5);
    // jede Größe ist zurückrechenbar
    close(solveIdealGas(undefined, r.V, 273.15, 1).p, 101325);
    close(solveIdealGas(101325, r.V, undefined, 1).T, 273.15);
    close(solveIdealGas(101325, r.V, 273.15, null).n, 1);
    expect(() => solveIdealGas(1, 2, 3, 4)).toThrow("genau eine");
    expect(() => solveIdealGas(undefined, undefined, 300, 1)).toThrow("genau EINE");
    expect(() => solveIdealGas(-1, undefined, 300, 1)).toThrow("positiv");
  });

  test("1. Hauptsatz : beide Konventionen", () => {
    // 500 J Wärme zu, 200 J Arbeit vom Gas abgegeben → ΔU = 300 J
    expect(solveFirstLaw(500, -200, undefined).dU).toBe(300);
    expect(solveFirstLaw(500, 200, undefined, "abgegeben_positiv").dU).toBe(300);
    expect(solveFirstLaw(undefined, -200, 300).Q).toBe(500);
    expect(solveFirstLaw(500, undefined, 300).W).toBe(-200);
    expect(solveFirstLaw(500, undefined, 300, "abgegeben_positiv").W).toBe(200);
    expect(() => solveFirstLaw(1, 2, 3)).toThrow();
  });

  test("isotherm : W = −nRT·ln(V2/V1), ΔU = 0", () => {
    const r = solveIsothermal({ n: 1, T: 300, V1: 0.01, V2: 0.02 });
    close(r.W, -R_MOLAR * 300 * Math.log(2));
    close(r.Q, -r.W);
    expect(r.dU).toBe(0);
    close(r.p1 * r.V1, r.p2 * r.V2);
  });

  test("adiabat : p·V^κ = const, Q = 0, W = ΔU", () => {
    const r = solveAdiabatic({ n: 1, T1: 300, V1: 0.02, V2: 0.01, kappa: 1.4 });
    close(r.p1 * r.V1 ** 1.4, r.p2 * r.V2 ** 1.4);
    close(r.T2, 300 * 2 ** 0.4);
    expect(r.Q).toBe(0);
    close(r.W, r.dU);
    expect(r.W).toBeGreaterThan(0); // Verdichtung: Arbeit zugeführt
  });

  test("isobar / isochor : 1. Hauptsatz geht auf", () => {
    const b = solveIsobaric({ n: 2, p: 1e5, V1: 0.03, V2: 0.06 });
    close(b.Q + b.W, b.dU);
    close(b.T2 / b.T1, 2);
    const c = solveIsochoric({ n: 1, V: 0.01, T1: 300, T2: 600 });
    expect(c.W).toBe(0);
    close(c.Q, c.dU);
    close(c.p2 / c.p1, 2);
  });

  test("p-V-Verlauf : jeder Punkt liegt auf der Polytropen der Endpunkte", () => {
    const a = { p: 1e5, V: 1e-3 };
    const b = { p: 1e5 * 10 ** 1.4, V: 1e-4 }; // isentrop, ε = 10
    const pts = processCurve(a, b);
    for (const pt of pts) close(pt.p * pt.V ** 1.4, a.p * a.V ** 1.4, 1e-9);
    expect(processCurve({ p: 1e5, V: 1 }, { p: 3e5, V: 1 })).toHaveLength(2); // isochor : senkrecht
    const chart = pvDiagram([a, b, { p: 1e5, V: 1e-3 }], ["isentrop", "isochor"], { geschlossen: true });
    expect(chart.series.map((s) => s.label)).toEqual(["1→2 isentrop", "2→1 isochor"]);
    expect(chart.yLabel).toBe("p [bar]");
  });
});

describe("thermo_berechnen — neue Modi und Diagramm", () => {
  test("ideales_gas mit Stoffmenge und mit Masse", () => {
    const r = solveThermo({ modus: "ideales_gas", start: { p: "1 atm", T: "0 °C" }, stoffmenge: "1 mol" }) as Record<string, number>;
    expect(r.ok).toBe(true as never);
    close(r.V_liter, 22.4139, 1e-5);
    // 1 kg Luft bei 1 bar, 300 K → V = m·R_s·T/p = 0,861 m³
    const m = solveThermo({ modus: "ideales_gas", gas: "luft", masse: "1 kg", start: { p: "1 bar", T: "300 K" } }) as Record<string, number>;
    close(m.V, (1 * 287 * 300) / 1e5, 1e-8);
    close(m.masse_kg, 1, 1e-8);
  });

  test("erster_hauptsatz und Fehler ehrlich", () => {
    const r = solveThermo({ modus: "erster_hauptsatz", Q: "2 kJ", W: "-500 J" }) as Record<string, number>;
    expect(r.dU).toBe(1500);
    const bad = solveThermo({ modus: "erster_hauptsatz", Q: "2 kJ" });
    expect(bad.ok).toBe(false);
  });

  test("Kreisprozess (Otto mit Q_zu = 800 kJ) : Probe trotz Rundung, p-V-Diagramm je Schritt", () => {
    const r = solveThermo({
      modus: "kreisprozess",
      gas: "luft",
      masse: "1 kg",
      start: { p: "1 bar", T: "300 K" },
      schritte: [
        { prozess: "isentrop", ziel: { V_verhaeltnis: 0.1 } },
        { prozess: "isochor", ziel: { Q: "800 kJ" } },
        { prozess: "isentrop", ziel: { V_verhaeltnis: 10 } },
        { prozess: "isochor", ziel: { zurueck_zum_start: true } },
      ],
    }) as { ok: true; diagramme: { series: { label: string; data: { x: number; y: number }[] }[] }[] };
    expect(r.ok).toBe(true);
    const d = r.diagramme[0];
    expect(d.series).toHaveLength(4);
    expect(d.series[3].label).toBe("4→1 isochor");
    // Der Kreis schließt sich : letzter Punkt = erster Punkt
    const first = d.series[0].data[0];
    const last = d.series[3].data.at(-1)!;
    expect(last.x).toBe(first.x);
    expect(last.y).toBeCloseTo(first.y, 3);
  });
});

describe("Physik — Kinematik, Wurf, Newton", () => {
  test("Kinematik : v = v0 + a·t, s = v0·t + ½a·t²", () => {
    const r = solveKinematics(0, 2, 5);
    expect(r.v).toBe(10);
    expect(r.s).toBe(25);
    // Bremsen von 72 km/h mit −5 m/s² bis zum Stand : t = 4 s, s = 40 m
    const brake = solvePhysics({ aufgabe: "kinematik", v0: "72 km/h", a: "-5 m/s²", v: 0 }) as Record<string, number>;
    close(brake.t, 4);
    close(brake.weg, 40);
    // aus dem Weg : kleinste positive Zeit
    close(solveKinematics(20, -2, undefined, { s: 50 }).t, (20 - Math.sqrt(200)) / 2);
    expect(() => solveKinematics(20, -2, undefined, { s: 500 })).toThrow("nie erreicht");
    expect(() => solveKinematics(1, 1, 1, { v: 2 })).toThrow("genau EINE");
  });

  test("Wurf : Referenzwerte (45°, ebener Boden)", () => {
    const r = solveProjectile(20, 45);
    close(r.wurfweite, (20 * 20) / G_STANDARD, 1e-12); // R = v0²·sin(2α)/g
    close(r.h_max, (20 * 20 * 0.5) / (2 * G_STANDARD), 1e-12);
    close(r.t_flug, 2 * r.t_steig, 1e-12);
    close(r.v_aufprall, 20, 1e-12);
    close(r.aufprallwinkel_grad, 45, 1e-9);
  });

  test("Wurf : waagerecht aus 20 m Höhe", () => {
    const r = solveProjectile(10, 0, 20);
    close(r.t_flug, Math.sqrt((2 * 20) / G_STANDARD));
    close(r.wurfweite, 10 * r.t_flug);
    close(r.v_aufprall, Math.sqrt(100 + 2 * G_STANDARD * 20));
    const chart = projectileChart(r);
    expect(chart.series[0].data[0]).toEqual({ x: 0, y: 20 });
    expect(chart.series[0].data.at(-1)!.y).toBe(0);
  });

  test("Newton : F = m·a, Resultierende", () => {
    expect(solveNewton(undefined, 1200, 2).F).toBe(2400);
    expect(solveNewton(2400, 1200, undefined).a).toBe(2);
    expect(solveNewton(2400, undefined, 2).m).toBe(1200);
    expect(() => solveNewton(10, undefined, -2)).toThrow("negativ");
    const r = solvePhysics({ aufgabe: "newton", m: "2 kg", kraefte: [{ F: "3 N", winkel: 0 }, { F: "4 N", winkel: 90 }] }) as {
      ok: true;
      a: number;
      resultierende: { F: number; winkel_grad: number };
    };
    close(r.resultierende.F, 5);
    close(r.a, 2.5);
    close(r.resultierende.winkel_grad, (Math.atan2(4, 3) * 180) / Math.PI, 1e-7);
  });

  test("Fehler werden ehrlich gemeldet, nie geraten", () => {
    const r = solvePhysics({ aufgabe: "wurf", v0: "10 m/s" });
    expect(r).toMatchObject({ ok: false });
    expect(solvePhysics({ aufgabe: "kinematik", v0: "10 Liter", a: 1, t: 1 })).toMatchObject({ ok: false });
  });
});

describe("Routage Domain-Based Agent", () => {
  const cases: [string, string][] = [
    ["Ein Ball wird mit 20 m/s unter 45° schräg nach oben geworfen. Wie groß ist die Wurfweite?", "physik"],
    ["Ein Auto bremst von 72 km/h gleichmäßig beschleunigt bis zum Stillstand. Bremsweg?", "physik"],
    ["Chute libre d'une pierre depuis 20 m : vitesse à l'impact ?", "physik"],
    ["2 mol ideales Gas werden isotherm bei 300 K expandiert, Arbeit?", "thermodynamik"],
    ["Carnot-Wirkungsgrad zwischen 600 K und 300 K", "thermodynamik"],
    ["Ein Balken mit Festlager und Loslager, Einzellast 10 kN bei 2 m", "mechanik"],
  ];
  for (const [text, domain] of cases) {
    test(`${domain} ← « ${text.slice(0, 40)}… »`, () => {
      expect(detectDomain(text).domain).toBe(domain as never);
    });
  }

  test("Hinweis und Fachmodul Physik", () => {
    expect(domainHint(detectDomain("schiefer Wurf mit 30 m/s"))).toContain("physik_berechnen");
    expect(domainPack("physik")?.text).toContain("physik_berechnen");
    expect(domainHint(detectDomain("Carnot-Kreisprozess, Wirkungsgrad"))).toContain("p-V-Diagramm");
  });

  test("Werkzeug im Agenten, Regel im Prompt, Diagramm im Chat", () => {
    const agent = readFileSync(join(import.meta.dir, "../src/api/agent/index.ts"), "utf8");
    expect(agent).toContain("physik_berechnen: tool({");
    expect(agent).toContain('Physik (Kinematik, Wurf, Newton) → "physik_berechnen"');
    expect(agent).toContain("erscheint AUTOMATISCH aus der Rechnung");
    const chat = readFileSync(join(import.meta.dir, "../src/web/pages/chat.tsx"), "utf8");
    expect(chat).toContain("solverChartBlockFromPart(p)");
    expect(chat).toContain('"tool-physik_berechnen"');
  });

  test("Diagramm-Block : nur aus einem gültigen Löserergebnis", () => {
    const out = solvePhysics({ aufgabe: "wurf", v0: 20, winkel: 45 });
    const block = solverChartBlockFromPart({ type: "tool-physik_berechnen", state: "output-available", output: out });
    expect(block).toContain("```chart\n");
    expect(JSON.parse(block!.split("```chart\n")[1].split("\n```")[0]).series[0].label).toBe("Bahn y(x)");
    expect(solverChartBlockFromPart({ type: "tool-physik_berechnen", state: "input-available" })).toBeNull();
    expect(solverChartBlockFromPart({ type: "tool-physik_berechnen", state: "output-available", output: { ok: false } })).toBeNull();
    expect(solverChartBlockFromPart({ type: "tool-rechnen", state: "output-available", output: out })).toBeNull();
  });
});
