import { describe, expect, test } from "bun:test";
import { masteryFor } from "../src/web/lib/mastery";

const gaps = [
  { topic: "Festigkeitslehre", label: "Biegemoment am Kragarm mit falschem Vorzeichen", status: "open" },
  { topic: "Statik", label: "Schwerpunkt zusammengesetzter Flächen", status: "resolved" },
  { topic: "Elektrotechnik", label: "Knotenregel vergessen", status: "open" },
];

describe("Engineering DNA — carte de maîtrise", () => {
  test("lacune ouverte → rouge", () => {
    expect(masteryFor("Biegemoment", gaps).state).toBe("weak");
  });
  test("lacunes toutes résolues → vert, 100 %", () => {
    const m = masteryFor("Schwerpunkt", gaps);
    expect(m.state).toBe("mastered");
    expect(m.mastery).toBe(100);
  });
  test("rien de diagnostiqué → gris", () => {
    expect(masteryFor("Knickung", gaps).state).toBe("untested");
  });
  test("les mots courts ne déclenchent pas de faux positifs", () => {
    expect(masteryFor("Spannung & Dehnung", [{ topic: "x", label: "und so", status: "open" }]).state).toBe("untested");
  });
});
