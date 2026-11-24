import { describe, expect, test } from "bun:test";
import { LOCK_FLAG, compareReadings, lockFromHistory, lockedNetlistInput, mentions, readSchematic, schematicNote, type SchematicReading } from "../src/api/lib/circuit/vision-read";
import { checkNetlist } from "../src/api/lib/circuit/netlist";
import { runCircuitPipeline } from "../src/api/lib/circuit/pipeline";

/**
 * « Aufgabe 13 » (photo du 24 nov. 2026) : U1, R1…R4, I1 en série avec R2,
 * I2 et I3 en parallèle à droite. Le tuteur l'a lue de travers ; le modèle de
 * vision l'a lue juste. Deux lectures comparées par le code : ce fichier
 * verrouille la comparaison.
 */
const reading = (elemente: [string, string, string, string, string][], more: Partial<SchematicReading> = {}): SchematicReading => ({
  istSchaltplan: true,
  elemente: elemente.map(([typ, name, a, b, wert]) => ({ typ: typ as "R", name, a, b, wert })),
  lage: [],
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
    const none: SchematicReading = { istSchaltplan: false, elemente: [], lage: [], andere: [], unklar: [] };
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
  type El = [string, string, string, string, string];
  const ZERO = reading(A13.elemente.map((e) => [e.typ, e.name, e.a === "B" ? "0" : e.a, e.b === "B" ? "0" : e.b, e.wert] as El));
  const lock = (userText = "") => ({ elemente: ZERO.elemente, unklar: ["Wert von R4 ist im Aufgabentext nicht angegeben", "Pfeilrichtung von I1 schwer lesbar", "x", "y"], userText });
  /** Ce que le tuteur a proposé le 24 nov. : R2 déplacé, R4 ailleurs avec une valeur inventée. */
  const tutor = { quelle: "bild" as const, unklar: ["bitte bestätigen lassen"], elemente: [{ typ: "R" as const, name: "R2", a: "K2", b: "0", wert: 1 }, { typ: "R" as const, name: "R4", a: "X", b: "Y", wert: "1" }, { typ: "R" as const, name: "R9", a: "X", b: "0", wert: 5 }] };

  test("tour de la photo : la netlist garde R4 et la vraie place de R2, rien n'est ajouté", () => {
    const locked = lockedNetlistInput(lock(), tutor);
    expect(locked.elemente.map((e) => e.name)).toEqual(ZERO.elemente.map((e) => e.name));
    expect(locked.elemente.find((e) => e.name === "R2")).toMatchObject({ a: "0", b: "F" });
    expect(locked.elemente.find((e) => e.name === "R4")).toMatchObject({ a: "C", b: "D" });
    expect(checkNetlist(locked).ok).toBe(true);
  });

  test("valeur absente de l'énoncé : ni question ni valeur du tuteur — composant « frei », UNE ligne claire", () => {
    const locked = lockedNetlistInput(lock(), tutor);
    expect(locked.frei).toEqual(["R4"]);
    expect(locked.unklar).toEqual(["R4: kein Wert in der Aufgabe. Beim Rechnen wird geprüft, ob er das Ergebnis beeinflusst.", "Pfeilrichtung von I1 schwer lesbar", "x"]);
    // Même si le tuteur écrit « ? » ou rien : la carte existe.
    const bare = lockedNetlistInput(lock(), { quelle: "bild", elemente: [{ typ: "R", name: "R4", a: "C", b: "D", wert: "?" }] });
    const card = checkNetlist(bare);
    expect(card.ok).toBe(true);
    expect(card.ok && card.frei).toEqual(["R4"]);
  });

  test("Aufgabe 13 : R4 n'a pas de valeur — le calcul prouve qu'elle ne compte pas", () => {
    const card = checkNetlist(lockedNetlistInput(lock(), tutor));
    if (!card.ok) throw new Error("carte refusée");
    const gate = { required: true, confirmed: new Map([[card.id, card]]) };
    const r = runCircuitPipeline({ elemente: card.elemente, netzliste_id: card.id }, gate);
    if (!r.ok || !("freie_werte" in r) || !r.freie_werte) throw new Error("pas de rapport : " + JSON.stringify(r).slice(0, 200));
    expect(r.freie_werte.namen).toEqual(["R4"]);
    // I2 et I3 s'annulent : aucun courant dans R4, rien ne dépend de sa valeur.
    expect(r.freie_werte.abhaengig).toEqual([]);
    expect(r.freie_werte.unabhaengig).toContain("R3");
    expect(r.freie_werte.anweisung).toContain("Frag die Person nicht nach R4");
  });

  test("une valeur libre qui compte : ses dépendants sont nommés, leurs chiffres interdits", () => {
    const card = checkNetlist({ quelle: "bild", frei: ["R2"], elemente: [{ typ: "V", name: "U", a: "1", b: "0", wert: 10 }, { typ: "R", name: "R1", a: "1", b: "2", wert: 1 }, { typ: "R", name: "R2", a: "2", b: "0", wert: 1 }] });
    if (!card.ok) throw new Error("carte refusée");
    const r = runCircuitPipeline({ elemente: card.elemente, netzliste_id: card.id }, { required: true, confirmed: new Map([[card.id, card]]) });
    if (!r.ok || !("freie_werte" in r) || !r.freie_werte) throw new Error("pas de rapport");
    expect(r.freie_werte.abhaengig).toEqual(expect.arrayContaining(["R1", "R2"]));
    expect(r.freie_werte.anweisung).toContain("KEINE Zahl");
  });

  test("message suivant, sans photo : le verrou vient de la dernière carte du fil", () => {
    const card = { ...checkNetlist(lockedNetlistInput(lock(), tutor)), [LOCK_FLAG]: true };
    const thread = [
      { role: "user", parts: [{ type: "text", text: "[Anhang aus einer früheren Nachricht]" }] },
      { role: "assistant", parts: [{ type: "tool-schaltplan_erfassen", state: "output-available", output: card }] },
      { role: "user", parts: [{ type: "text", text: "Corriger la netlist : R4 = 2 Ω" }] },
    ];
    const next = lockFromHistory(thread, "Corriger la netlist : R4 = 2 Ω");
    expect(next?.elemente).toHaveLength(8);

    // Le tuteur redessine tout de mémoire (carte fausse de 14 h 18) : seul R4, nommé, change.
    const redrawn = { quelle: "bild" as const, elemente: [{ typ: "R" as const, name: "R2", a: "K2", b: "0", wert: 1 }, { typ: "R" as const, name: "R4", a: "C", b: "D", wert: "2" }, { typ: "I" as const, name: "I3", a: "K5", b: "0", wert: 1 }] };
    const locked = lockedNetlistInput(next!, redrawn);
    expect(locked.elemente).toHaveLength(8);
    expect(locked.elemente.find((e) => e.name === "R4")).toMatchObject({ wert: "2" });
    // L'étudiant a donné la valeur : R4 n'est plus « frei ».
    expect(next?.frei).toEqual(["R4"]);
    expect(locked.frei).toBeUndefined();
    expect(locked.elemente.find((e) => e.name === "R2")).toMatchObject({ a: "0", b: "F" });
    expect(locked.elemente.find((e) => e.name === "I3")).toMatchObject({ a: "E", b: "D" });
  });

  test("une carte sans la marque (lecture du tuteur seul) ne verrouille rien", () => {
    const card = checkNetlist({ quelle: "bild", elemente: [{ typ: "V", name: "U", a: "1", b: "0", wert: 5 }, { typ: "R", name: "R", a: "1", b: "0", wert: 10 }] });
    expect(lockFromHistory([{ role: "assistant", parts: [{ type: "tool-schaltplan_erfassen", state: "output-available", output: card }] }], "ja")).toBeNull();
  });

  test("« R4 » nommé : R4, R_4, r 4 — mais pas R40 ni un mot qui contient r4", () => {
    for (const t of ["R4 = 2 Ω", "der R_4 fehlt", "r 4 ist falsch", "$R_{4}$"]) expect(mentions(t, "R4")).toBe(true);
    for (const t of ["R40 = 2", "R1 und R3", "Wert4"]) expect(mentions(t, "R4")).toBe(false);
    expect(mentions("C ist zu groß", "C")).toBe(true);
    expect(mentions("Calcule", "C")).toBe(false);
  });
});
