import { describe, expect, test } from "bun:test";
import { pickStyleReference } from "../src/api/lib/style-reference";

const body = (topic: string) => `${topic} `.repeat(80);
const doc = (id: string, kind: string, title: string, text: string, createdAt = 0) => ({
  id,
  kind,
  title,
  textContent: text,
  createdAt,
});

describe("Stilvorlage — « typiquement comme le prof »", () => {
  test("une Altklausur passe avant un Übungsblatt", () => {
    const r = pickStyleReference(
      [
        doc("u", "uebung", "Übungsblatt 3 Biegung", body("Biegemoment Querkraft")),
        doc("k", "klausur", "Klausur WS 23/24", body("Thermodynamik Wärme")),
      ],
      "Biegemoment",
    );
    expect(r?.id).toBe("k");
  });

  test("entre deux Altklausuren, celle qui parle du sujet demandé", () => {
    const r = pickStyleReference(
      [
        doc("thermo", "klausur", "Klausur Thermodynamik", body("Wärme Entropie"), 2),
        doc("tm", "klausur", "Klausur TM 2", body("Biegemoment Querkraft Balken"), 1),
      ],
      "Technische Mechanik Biegemoment",
    );
    expect(r?.id).toBe("tm");
  });

  test("à égalité, la plus récente", () => {
    const r = pickStyleReference(
      [
        doc("old", "klausur", "Klausur SS 21", body("Balken"), 1),
        doc("new", "klausur", "Klausur WS 24", body("Balken"), 9),
      ],
      "Balken",
    );
    expect(r?.id).toBe("new");
  });

  test("ni Altklausur ni Übungsblatt (ou texte vide) → null", () => {
    expect(pickStyleReference([doc("v", "vorlesung", "Skript", body("Balken"))], "Balken")).toBeNull();
    expect(pickStyleReference([doc("k", "klausur", "Scan sans texte", "  ")], "Balken")).toBeNull();
    expect(pickStyleReference([], "Balken")).toBeNull();
  });
});
