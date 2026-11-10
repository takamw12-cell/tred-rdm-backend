import { describe, expect, test } from "bun:test";
import { aufgabenKontexte, markTaskContexts } from "../src/api/lib/task-context";
import { buildTutorAgent } from "../src/api/agent/index";
import { SONNET } from "../src/api/lib/chat-routing";

/**
 * Non-régression du 10 nov. 2026 — « Uebungsaufgaben Elektrotechnik », Aufgabe 5 :
 * a)–d) portent sur un circuit à deux lampes ; e) et f) commencent par
 * « Gegeben ist (die) folgende Schaltung » avec de NOUVELLES valeurs. Le tuteur
 * avait résolu e) et f) avec le circuit de a)–d).
 *
 * Le texte ci-dessous a la forme exacte de ce que l'import produit pour ces
 * pages : la couche texte du PDF (sans les valeurs, qui sont dans les
 * schémas), puis les lignes « [Abbildung …] » écrites par la vision.
 */
const AUFGABE_5 = `[[SEITE 3]]
Aufgabe 5
Gegeben ist eine Schaltung mit zwei Lampen gemäß der fol-
genden Abbildung:
Werte: U0 = 6V, Typenangaben für Lampe L1: 6V; 2,4W,
Typenangaben für Lampe L2: 2,5V; 0,1A
a) Welcher Strom fließt, wenn Schalter S1 geschlossen ist?
b) Wird die Lampe L2 bei Öffnen des Schalters S1 überlas-
tet?
c) Wie muss die Spannung U0 verändert werden, damit die
Lampe L2 mit ihrer Nennleistung betrieben wird?
d) Wie groß ist dann die Leistungsaufnahme von L2?
e) Gegeben ist folgende Schaltung. Wie groß sind Stromstär-
ken I1, I2 und I, sobald der Schalter S geschlossen wird?
U0

[Abbildung — zu Aufgabe 5 (Grundschaltung) — Schaltplan: U0 = 6 V, L1, L2, S1; Netzliste: U0: K0–K1, S1: K1–K2, L2: K1–K2, L1: K2–K0; Topologie: S1 parallel zu L2, in Reihe mit L1]
[Abbildung — zu Aufgabe 5 e) — Schaltplan: U0, R1 = 20 Ω, R2 = 20 Ω, S; Netzliste: U0: K0–K1, R1: K1–K0, S: K1–K2, R2: K2–K0; Pfeile: I1 = 0,1 A abwärts durch R1]

[[SEITE 4]]
f) Gegeben ist die folgende Schaltung. Wie groß ist I, nach-
dem der Schalter S geöffnet wird?
Aufgabe 6
Eine 12V-Halogenlampe soll mittels Vorwiderstand an 230V
betrieben werden.
a) Berechnen Sie den Wirkungsgrad!

[Abbildung — zu Aufgabe 5 f) — Schaltplan: U0, R1 = 100 Ω, R2 = 400 Ω, S; Netzliste: U0: K0–K1, R1: K1–K0, S: K1–K2, R2: K2–K0; Pfeile: I2 = 25 mA in den Zweig mit S und R2]
`;

describe("Teilaufgaben : un nouveau circuit est un nouveau problème", () => {
  test("Aufgabe 5 : a)–d) un contexte, e) et f) chacun le leur, avec LEURS valeurs", () => {
    const ctx = aufgabenKontexte(AUFGABE_5).filter((c) => c.aufgabe === "5");
    expect(ctx.map((c) => c.teile)).toEqual([["a", "b", "c", "d"], ["e"], ["f"]]);
    expect(ctx.map((c) => c.neu)).toEqual([false, true, true]);

    // a)–d) : le circuit à deux lampes.
    expect(ctx[0].werte.U0).toBe("6 V");
    // e) : R1 = R2 = 20 Ω, I1 = 0,1 A — et RIEN du circuit des lampes.
    expect(ctx[1].werte).toEqual({ R1: "20 Ω", R2: "20 Ω", I1: "0,1 A" });
    // f) : R1 = 100 Ω, R2 = 400 Ω, I2 = 25 mA — pas les 20 Ω de e).
    expect(ctx[2].werte).toEqual({ R1: "100 Ω", R2: "400 Ω", I2: "25 mA" });
  });

  test("le texte que lit le tuteur porte un ⟪NEUER KONTEXT⟫ avant e) et avant f)", () => {
    const marked = markTaskContexts(AUFGABE_5);
    const lines = marked.split("\n");
    const e = lines.findIndex((l) => l.startsWith("e) Gegeben ist folgende Schaltung"));
    const f = lines.findIndex((l) => l.startsWith("f) Gegeben ist die folgende Schaltung"));
    expect(lines[e - 1]).toBe(
      "⟪NEUER KONTEXT ab Aufgabe 5 e): eigene Schaltung bzw. eigene Angaben (R1 = 20 Ω, R2 = 20 Ω, I1 = 0,1 A). Werte und Schaltung aus a)–d) gelten hier NICHT.⟫",
    );
    expect(lines[f - 1]).toBe(
      "⟪NEUER KONTEXT ab Aufgabe 5 f): eigene Schaltung bzw. eigene Angaben (R1 = 100 Ω, R2 = 400 Ω, I2 = 25 mA). Werte und Schaltung aus a)–e) gelten hier NICHT.⟫",
    );
    // a)–d) restent un seul problème : pas de marque avant b), c), d).
    expect(marked.match(/⟪NEUER KONTEXT/g)).toHaveLength(2);
    // Rien d'autre ne change.
    expect(marked.replace(/^⟪NEUER KONTEXT.*⟫\n/gm, "")).toBe(AUFGABE_5);
  });

  test("les autres formulations ouvrent aussi un nouveau contexte", () => {
    for (const phrase of [
      "Nun gilt: R = 50 Ω.",
      "Für die folgende Aufgabe sei U = 12 V.",
      "Gegeben sei: I = 100 mA, U2 = 10 V.",
      "Betrachten Sie nun die Brückenschaltung.",
    ]) {
      const text = `Aufgabe 1\na) Berechne R mit U = 5 V.\nb) ${phrase}`;
      const ctx = aufgabenKontexte(text);
      expect(ctx.map((c) => [c.teile, c.neu])).toEqual([
        [["a"], false],
        [["b"], true],
      ]);
      expect(markTaskContexts(text)).toContain("⟪NEUER KONTEXT ab Aufgabe 1 b)");
    }
  });

  test("une suite de questions sur le même circuit reste un seul contexte", () => {
    const text = "Aufgabe 3\nGegeben ist folgende Schaltung: R = 10 Ω.\na) Berechne I.\nb) Berechne P.\nc) Wie ändert sich P?";
    expect(aufgabenKontexte(text).map((c) => c.teile)).toEqual([["a", "b", "c"]]);
    expect(markTaskContexts(text)).toBe(text);
  });

  test("texte sans Teilaufgaben ni déclencheur : inchangé", () => {
    const text = "Das Ohmsche Gesetz lautet U = R · I.\nDer Strom ist proportional zur Spannung.";
    expect(markTaskContexts(text)).toBe(text);
    expect(markTaskContexts("")).toBe("");
  });
});

describe("le tuteur reçoit les marques et les règles", () => {
  type Instr = { content: string };
  const agent = buildTutorAgent({
    sources: [{ title: "Uebungsaufgaben Elektrotechnik V3", kind: "pdf", content: AUFGABE_5 }],
    locale: "de",
    board: true,
    route: { modelId: SONNET, thinking: "off" },
  }) as unknown as { settings: { instructions: Instr[] } };
  const all = agent.settings.instructions.map((i) => i.content).join("\n");
  const system = agent.settings.instructions[0].content;

  test("les extraits arrivent marqués", () => {
    expect(all).toContain("⟪NEUER KONTEXT ab Aufgabe 5 e)");
    expect(all).toContain("⟪NEUER KONTEXT ab Aufgabe 5 f)");
  });

  test("NIVEAU 4 : Kontextwechsel, Selbstprüfung, Original statt Nachzeichnung", () => {
    expect(system).toContain("TEILAUFGABEN — KONTEXTWECHSEL (PFLICHT)");
    expect(system).toContain('Sätze wie "Gegeben ist folgende');
    expect(system).toContain("der vorherigen Teilaufgaben übernimmst du NIE stillschweigend");
    expect(system).toContain("SELBSTPRÜFUNG VOR DEM RECHNEN (PFLICHT)");
    expect(system).toContain('[[TAFEL schritt="Gegeben"]]');
    expect(system).toContain("Stimmen diese Angaben? Sonst korrigier mich.");
    expect(system).toContain("ABBILDUNGEN AUS DEN UNTERLAGEN — NIE NACHZEICHNEN");
    expect(system).toContain("FRAGST du nach");
    expect(system).toContain("erfindest KEINE Werte");
  });
});
