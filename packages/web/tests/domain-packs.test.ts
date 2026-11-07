import { describe, expect, test } from "bun:test";
import { detectDomain } from "../src/api/lib/solvers/domain";
import { curriculumFor, domainPack, domainPackText } from "../src/api/prompts";

describe("Domain-Based Agent : Fachmodule", () => {
  test("jedes abgedeckte Fach hat ein deutsches Fachmodul", () => {
    for (const d of ["mechanik", "elektrotechnik", "thermodynamik", "mathematik", "regelungstechnik", "technisches_zeichnen"] as const) {
      expect(domainPack(d)?.text.length).toBeGreaterThan(100);
    }
  });
  test("die erkannte Frage lädt ihr Modul", () => {
    const g = detectDomain("Wie bestimme ich die Stabkräfte im Fachwerk mit dem Knotenpunktverfahren?");
    const text = domainPackText(g)!;
    expect(text).toContain("FACHMODUL TECHNISCHE MECHANIK");
    expect(text).toContain("Nullstab");
  });
  test("Technisches Zeichnen und Datenverarbeitung werden erkannt", () => {
    expect(detectDomain("Was bedeutet Ø30 H7 im Schriftfeld meiner Zeichnung?").domain).toBe("technisches_zeichnen");
    expect(detectDomain("Erstelle ein Struktogramm für diese while-Schleife in Python").domain).toBe("datenverarbeitung");
  });
  test("ohne Fach kein Modul", () => {
    expect(domainPackText(detectDomain("Hallo, wie geht's?"))).toBeNull();
  });
  test("Lehrplan : Deutschland Standard, international und Schule fallen auf Deutschland zurück", () => {
    expect(curriculumFor(null)).toBe("germany");
    expect(curriculumFor({ country: "GB" })).toBe("international");
    expect(curriculumFor({ level: "school" })).toBe("highschool");
    expect(domainPack("mechanik", "international")?.domain).toBe("mechanik");
    expect(domainPack("mechanik", "highschool")?.domain).toBe("mechanik");
  });
});
