import { describe, expect, test } from "bun:test";
import { splitTasks } from "../src/web/lib/exam-sheet";

const KLAUSUR = `Hilfsmittel: Taschenrechner, eine handgeschriebene Formelsammlung.

## Aufgabe 1 (20 Punkte)
Ein einfach gestützter Balken …

**Aufgabe 2 — Fachwerk (30 Punkte)**
Bestimmen Sie die Stabkräfte …

### Aufgabe 3: Spannung [50 Pkt]
Ein Stab mit $A = 200\\,\\mathrm{mm^2}$ …`;

describe("Klausur générée → tâches du Prüfungsmodus", () => {
  test("découpe aux en-têtes « Aufgabe N » et lit les points", () => {
    const t = splitTasks(KLAUSUR, 100);
    expect(t.map((x) => x.points)).toEqual([20, 30, 50]);
    expect(t[1]!.title).toBe("Aufgabe 2 — Fachwerk");
    expect(t[2]!.prompt).toContain("Ein Stab mit");
  });

  test("les consignes avant la 1re Aufgabe restent dans la 1re tâche", () => {
    expect(splitTasks(KLAUSUR, 100)[0]!.prompt).toContain("Hilfsmittel");
  });

  test("points absents : le reste du total est réparti", () => {
    const t = splitTasks("Aufgabe 1 (40 Punkte)\nA\n\nAufgabe 2\nB\n\nAufgabe 3\nC", 100);
    expect(t.map((x) => x.points)).toEqual([40, 30, 30]);
  });

  test("pas d'en-têtes : une seule tâche, rien n'est perdu", () => {
    const t = splitTasks("Berechnen Sie die Auflagerkräfte.", 25);
    expect(t).toHaveLength(1);
    expect(t[0]!.points).toBe(25);
    expect(t[0]!.prompt).toBe("Berechnen Sie die Auflagerkräfte.");
  });
});
