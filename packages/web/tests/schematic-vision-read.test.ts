import { describe, expect, test } from "bun:test";
import { compareReadings, lockedNetlistInput, readSchematic, schematicNote, type SchematicReading } from "../src/api/lib/circuit/vision-read";
import { checkNetlist } from "../src/api/lib/circuit/netlist";

/**
 * « Aufgabe 13 » (photo du 24 nov. 2026) : U1, R1…R4, I1 en série avec R2,
 * I2 et I3 en parallèle à droite. Le tuteur l'a lue de travers ; le modèle de
 * vision l'a lue juste. Deux lectures comparées par le code : ce fichier
 * verrouille la comparaison.
 */
const reading = (elemente: [string, string, string, string, string][], more: Partial<SchematicReading> = {}): SchematicReading => ({
  istSchaltplan: true,
  elemente: elemente.map(([typ, name, a, b, wert]) => ({ typ: typ as "R", name, a, b, wert })),
  andere: [],
  unklar: [],
  ...more,
});

/** La bonne lecture. */
const A13 = reading([
  ["V", "U1", "A", "B", "1"],
  ["R", "R1", "A", "C", "1"],
  ["R", "R2", "B", "F", "1"],
  ["I", "I1", "E", "F", "1"],
  ["R", "R3", "C", "E", "1"],
  ["R", "R4", "C", "D", ""],
  ["I", "I2", "D", "E", "1"],
  ["I", "I3", "E", "D", "1"],
]);

/** La même, autres noms de nœuds, autre ordre, bornes des résistances échangées, « 1Ω » au lieu de « 1 ». */
const A13_RENAMED = reading([
  ["I", "I3", "K4", "K3", "1A"],
  ["I", "I2", "K3", "K4", "1"],
  ["R", "R4", "K3", "K2", ""],
  ["R", "R3", "K4", "K2", "1Ω"],
  ["I", "I1", "K4", "K6", "1"],
  ["R", "R2", "K6", "K5", "1"],
  ["R", "R1", "K2", "K1", "1"],
  ["V", "U1", "K1", "K5", "1V"],
]);

/** La lecture fautive du tuteur : R2 et I1 vers la masse au lieu d'être en série. */
const A13_WRONG = reading([
  ["V", "U1", "A", "B", "1"],
  ["R", "R1", "A", "C", "1"],
  ["R", "R2", "B", "E", "1"],
  ["I", "I1", "E", "C", "1"],
  ["R", "R3", "C", "E", "1"],
  ["R", "R4", "C", "D", ""],
  ["I", "I2", "D", "E", "1"],
  ["I", "I3", "E", "D", "1"],
]);

describe("deux lectures d'un schéma, comparées par le code", () => {
  test("même circuit sous d'autres noms de nœuds : accord", () => {
    expect(compareReadings(A13, A13_RENAMED)).toEqual({ agree: true, disputed: [] });
  });

  test("une connexion différente : désaccord, et les composants en litige sont nommés", () => {
    const cmp = compareReadings(A13, A13_WRONG);
    expect(cmp.agree).toBe(false);
    expect(cmp.disputed).toContain("R2");
    expect(cmp.disputed).toContain("I1");
    // U1 ne touche aucun nœud modifié : il n'est pas en litige.
    expect(cmp.disputed).not.toContain("U1");
  });

  test("source de courant retournée : désaccord", () => {
    const flipped = reading(A13.elemente.map((e) => (e.name === "I2" ? ["I", "I2", e.b, e.a, e.wert] : [e.typ, e.name, e.a, e.b, e.wert]) as [string, string, string, string, string]));
    expect(compareReadings(A13, flipped).disputed).toContain("I2");
  });

  test("valeur différente ou composant manquant : désaccord", () => {
    const other = reading(A13.elemente.map((e) => [e.typ, e.name, e.a, e.b, e.name === "R3" ? "10" : e.wert] as [string, string, string, string, string]));
    expect(compareReadings(A13, other).disputed).toEqual(["R3"]);
    const missing = reading(A13.elemente.filter((e) => e.name !== "R4").map((e) => [e.typ, e.name, e.a, e.b, e.wert] as [string, string, string, string, string]));
    expect(compareReadings(A13, missing).agree).toBe(false);
  });
});

describe("ce que le tuteur reçoit", () => {
  const img = new Uint8Array([1, 2, 3]);

  test("accord : la netlist à reporter telle quelle, confirmation maintenue", async () => {
    const answers = [A13, A13_RENAMED];
    const verdict = await readSchematic(img, "image/jpeg", { read: async () => answers.shift()! });
    expect(verdict?.kind).toBe("agreed");
    const note = schematicNote(verdict!);
    expect(note).toContain("DIESELBE Schaltung");
    expect(note).toContain("R R2: a=B b=F wert=1");
    expect(note).toContain("steht FEST");
    expect(note).toContain("bestätigt");
  });

  test("désaccord : pas de calcul, les composants en litige sont à faire vérifier", async () => {
    const answers = [A13, A13_WRONG];
    const verdict = await readSchematic(img, "image/jpeg", { read: async () => answers.shift()! });
    expect(verdict?.kind).toBe("disputed");
    const note = schematicNote(verdict!);
    expect(note).toContain("WIDERSPRECHEN");
    expect(note).toContain("Rechne nichts");
    expect(note).toMatch(/I1.*R2|R2.*I1/);
  });

  test("pas un schéma, ou une lecture en échec : rien — le tuteur fait comme avant", async () => {
    const none: SchematicReading = { istSchaltplan: false, elemente: [], andere: [], unklar: [] };
    expect(await readSchematic(img, "image/jpeg", { read: async () => none })).toBeNull();
    let n = 0;
    expect(
      await readSchematic(img, "image/jpeg", {
        read: async () => {
          if (n++ === 0) throw new Error("timeout");
          return A13;
        },
      }),
    ).toBeNull();
  });
});

describe("lectures concordantes : la netlist affichée vient du code, pas du tuteur", () => {
  const ZERO = reading(A13.elemente.map((e) => [e.typ, e.name, e.a === "B" ? "0" : e.a, e.b === "B" ? "0" : e.b, e.wert] as [string, string, string, string, string]));

  test("le tuteur retire R4 et déplace R2 (essai du 24 nov.) : la netlist garde R4 et la vraie place de R2", () => {
    const tutor = { quelle: "bild" as const, elemente: [{ typ: "R" as const, name: "R2", a: "K2", b: "0", wert: 1 }, { typ: "R" as const, name: "R4", a: "X", b: "Y", wert: "1k" }] };
    const locked = lockedNetlistInput(ZERO, tutor);
    expect(locked.elemente.map((e) => e.name)).toEqual(ZERO.elemente.map((e) => e.name));
    expect(locked.elemente.find((e) => e.name === "R2")).toMatchObject({ a: "0", b: "F" });
    // Seule la valeur absente de l'énoncé vient du tuteur ; les nœuds, jamais.
    expect(locked.elemente.find((e) => e.name === "R4")).toMatchObject({ a: "C", b: "D", wert: "1k" });
    expect(checkNetlist(locked).ok).toBe(true);
  });

  test("valeur absente partout : la netlist est refusée, le tuteur doit la demander", () => {
    const check = checkNetlist(lockedNetlistInput(ZERO, { quelle: "bild", elemente: [{ typ: "R", name: "R1", a: "a", b: "b", wert: 1 }] }));
    expect(check.ok).toBe(false);
    expect(JSON.stringify(check)).toContain("R4");
  });
});
