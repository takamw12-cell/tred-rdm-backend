import { describe, expect, test } from "bun:test";

import { detectDomain, domainHint } from "../src/api/lib/solvers/domain";

describe("Fachgebiet-Erkennung", () => {
  const cases: [string, string, boolean][] = [
    ["Berechne den Strom durch R2 mit der Maschenregel, U = 12 V, R1 = 1 kΩ", "elektrotechnik", true],
    ["Calcule la tension aux bornes du condensateur, R = 1 kΩ, C = 100 nF", "elektrotechnik", true],
    ["Luft wird isentrop von 1 bar auf 10 bar verdichtet. Wie groß ist die Arbeit?", "thermodynamik", true],
    ["Bestimme die Ableitung von x^2·sin(x) und das Integral von 0 bis π", "mathematik", true],
    ["Ein Balken mit Festlager und Loslager, Einzellast 10 kN bei 2 m", "mechanik", true],
    ["Wasserdampf mit Dampfgehalt x = 0,9 bei 10 bar — Enthalpie?", "dampf_kaeltetechnik", false],
    ["Druckverlust einer Rohrströmung nach Bernoulli mit Reynolds-Zahl", "stroemungslehre", false],
    ["Hallo, wie geht's dir heute?", "unbekannt", false],
  ];
  for (const [text, domain, covered] of cases) {
    test(`${domain} ← « ${text.slice(0, 40)}… »`, () => {
      const g = detectDomain(text);
      expect(g.domain).toBe(domain as never);
      expect(g.covered).toBe(covered);
    });
  }

  test("Hinweis nennt den Fachlöser bzw. sagt ehrlich, dass keiner existiert", () => {
    expect(domainHint(detectDomain("Thevenin-Ersatzquelle mit Innenwiderstand"))).toContain("schaltung_berechnen");
    expect(domainHint(detectDomain("Bode-Diagramm der Übertragungsfunktion"))).toContain("KEINEN");
    expect(domainHint(detectDomain("Guten Morgen"))).toBeNull();
  });
});
