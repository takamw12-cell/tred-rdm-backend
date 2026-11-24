import { describe, expect, test } from "bun:test";
import { LOCK_FLAG, beyondNetlist, compareReadings, contextNote, judgeReading, lockFromHistory, lockedNetlistInput, mentions, planOf, readSchematic, schematicNote, solved, switchAnalysis, type SchematicReading } from "../src/api/lib/circuit/vision-read";
import { checkNetlist, netlistGate } from "../src/api/lib/circuit/netlist";
import { layoutSchematic } from "../src/web/lib/schematic-layout";
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
  schalter: [],
  frequency: null,
  source_type: "unbekannt",
  given_values: [],
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

  test("désaccord : une troisième lecture départage, deux sur trois suffisent", async () => {
    const answers = [A13, A13_WRONG, A13_RENAMED];
    const verdict = await readSchematic(img, "image/jpeg", { read: async () => answers.shift()! });
    expect(verdict?.kind).toBe("agreed");
    expect(answers).toHaveLength(0);
    // Trois lectures toutes différentes : toujours pas de calcul.
    const WRONG2 = reading(A13.elemente.map((e) => [e.typ, e.name, e.a, e.name === "R4" ? "A" : e.b, e.wert] as [string, string, string, string, string]));
    const three = [A13, A13_WRONG, WRONG2];
    expect((await readSchematic(img, "image/jpeg", { read: async () => three.shift()! }))?.kind).toBe("disputed");
  });

  test("le juge : deux lectures d'accord sur un circuit impossible ne passent pas", async () => {
    // R1 lue avec ses deux bornes au même nœud ; deux sources de tension en parallèle.
    const SHORT = reading([["V", "U", "A", "0", "10"], ["R", "R1", "A", "A", "50"], ["R", "R2", "A", "0", "100"]]);
    expect(judgeReading(SHORT)[0]).toContain("R1");
    const CLASH = reading([["V", "U1", "A", "0", "10"], ["V", "U2", "A", "0", "5"], ["R", "R", "A", "0", "1"]]);
    expect(judgeReading(CLASH).length).toBeGreaterThan(0);
    expect(judgeReading(A13)).toEqual([]);
    const verdict = await readSchematic(img, "image/jpeg", { read: async () => SHORT });
    expect(verdict?.kind).toBe("disputed");
  });

  test("données de l'énoncé (Aufgabe 18) : fréquence, source alternative, Uc = 5 V arrivent au tuteur", async () => {
    const A18 = (more: Partial<SchematicReading> = {}) =>
      reading([["V", "U0", "K1", "0", ""], ["R", "R1", "K1", "K2", "50"], ["C", "C", "K2", "0", "16u"], ["R", "R2", "K2", "0", "100"]], {
        frequency: 50,
        source_type: "AC",
        given_values: [{ name: "Uc", wert: "5", einheit: "V" }],
        ...more,
      });
    const both = [A18(), A18({ given_values: [{ name: "U_C", wert: "5V", einheit: "V" }, { name: "t1", wert: "5", einheit: "s" }] })];
    const ok = await readSchematic(img, "image/jpeg", { read: async () => both.shift()! });
    expect(ok?.kind).toBe("agreed");
    if (ok?.kind !== "agreed") return;
    // « U_C » et « Uc » sont la même grandeur ; « t1 », vue une seule fois, n'est pas retenue.
    expect(ok.reading.given_values.map((g) => g.name)).toEqual(["Uc"]);
    const note = schematicNote(ok);
    expect(note).toContain("Wechselspannungsquelle");
    expect(note).toContain("frequenz: 50");
    expect(note).toContain("Uc = 5 V");

    // Fréquences différentes : la netlist reste retenue, la fréquence est retirée et signalée.
    const clash = [A18(), A18({ frequency: 60 })];
    const v = await readSchematic(img, "image/jpeg", { read: async () => clash.shift()! });
    expect(v?.kind).toBe("agreed");
    if (v?.kind !== "agreed") return;
    expect(v.reading.frequency).toBeNull();
    expect(v.reading.unklar[0]).toContain("Frequenz");
    expect(contextNote({})).toBe("");
  });

  test("pas un schéma, ou une lecture en échec : rien — le tuteur fait comme avant", async () => {
    const none: SchematicReading = { istSchaltplan: false, elemente: [], lage: [], schalter: [], frequency: null, source_type: "unbekannt", given_values: [], andere: [], unklar: [] };
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

describe("schéma avec interrupteur (Aufgabe 14) : la netlist ne sait pas le porter", () => {
  const A14 = reading(
    [
      ["V", "U", "K1", "0", "10"],
      ["R", "R1", "K3", "K4", "50k"],
      ["R", "R2", "K2", "0", "50k"],
      ["C", "C", "K4", "0", "100u"],
    ],
    {
      schalter: [{ name: "S", gemeinsam: "K3", gx: 4, gy: 1, stellungen: [{ name: "1", kontakt: "K2", x: 3, y: 2 }, { name: "2", kontakt: "K1", x: 3, y: 0 }] }],
      lage: [
        { name: "U", ax: 0, ay: 1, bx: 0, by: 3 },
        { name: "R1", ax: 5, ay: 1, bx: 7, by: 1 },
        { name: "R2", ax: 3, ay: 2, bx: 3, by: 4 },
        { name: "C", ax: 8, ay: 1, bx: 8, by: 3 },
      ],
    },
  );

  test("la carte dessine l'interrupteur ; rien à confirmer, pas de schaltung_berechnen", () => {
    expect(beyondNetlist(A14)).toBe(false);
    const note = schematicNote({ kind: "agreed", reading: A14 });
    expect(note).toContain("Ruf sofort schaltplan_erfassen auf");
    expect(note).toContain("Stellung 1 verbindet K3 mit K2");

    const lock = { elemente: A14.elemente, unklar: [], userText: "", plan: planOf(A14), schalter: A14.schalter };
    const card = checkNetlist(lockedNetlistInput(lock, { quelle: "bild", elemente: [] as never }));
    // Sans l'interrupteur, cette netlist tombait en morceaux et la carte était refusée.
    expect(card.ok).toBe(true);
    if (!card.ok) return;
    expect(card.schalter?.[0]?.name).toBe("S");
    expect(card.hinweise).toEqual([]);
    expect(card.anweisung).toContain("schaltung_berechnen NICHT");
    // Une carte à interrupteur ne se confirme pas : jamais de calcul imposé dessus.
    const history = [
      { role: "user", parts: [{ type: "file", mediaType: "image/jpeg", url: "data:image/jpeg;base64,AA" }] },
      { role: "assistant", parts: [{ type: "tool-schaltplan_erfassen", state: "output-available", output: { ...card, [LOCK_FLAG]: true } }] },
      { role: "user", parts: [{ type: "text", text: "ja" }] },
    ];
    expect(netlistGate(history).justConfirmed ?? null).toBeNull();
    // Tour suivant : le verrou retrouve l'interrupteur, les valeurs par position sont recalculées.
    const again = lockFromHistory(history, "und bei t = 20 s?")!;
    expect(again.schalter?.[0]?.gemeinsam).toBe("K3");
    expect(solved(again)).toContain("= 10 s");
  });

  test("le dessin : levier, deux contacts numérotés, fils jusqu'aux contacts", () => {
    const d = layoutSchematic({ elemente: A14.elemente, masse: "0", plan: planOf(A14), schalter: A14.schalter })!;
    expect(d.switches).toHaveLength(1);
    expect(d.switches[0]!.contacts.map((k) => k.name)).toEqual(["1", "2"]);
    // Le levier part de la borne commune vers le contact 1.
    const { lever, contacts, common } = d.switches[0]!;
    expect(lever.from).toEqual(common);
    expect(Math.sign(lever.to.y - common.y)).toBe(Math.sign(contacts[0]!.at.y - common.y));
    // K1 (source ↔ contact 2), K3 (commun ↔ R1) ont leur fil ; le contact 1 touche R2 directement.
    for (const node of ["K1", "K3", "K4", "0"]) expect(d.wires.some((w) => w.node === node)).toBe(true);
  });

  test("le solveur donne, par position, ce que voit le condensateur", () => {
    const facts = switchAnalysis(A14)!;
    // Position 1 : décharge par R1 + R2 (l'erreur du 24 nov. : τ = R2·C = 5 s).
    expect(facts[0]).toContain("R_i = 100 kΩ");
    expect(facts[0]).toContain("U_C(∞) = 0 V");
    expect(facts[0]).toContain("= 10 s");
    // Position 2 : charge par R1 seule, vers 10 V.
    expect(facts[1]).toContain("R_i = 50 kΩ");
    expect(facts[1]).toContain("U_C(∞) = 10 V");
    expect(facts[1]).toContain("= 5 s");
    expect(schematicNote({ kind: "agreed", reading: A14 })).toContain("VOM LÖSER BERECHNET");
  });

  test("deux lectures qui échangent les positions 1 et 2 ne sont pas d'accord", () => {
    const swapped = { ...A14, schalter: [{ ...A14.schalter[0]!, stellungen: [{ name: "1", kontakt: "K1", x: 3, y: 2 }, { name: "2", kontakt: "K2", x: 3, y: 0 }] }] };
    expect(compareReadings(A14, A14).agree).toBe(true);
    expect(compareReadings(A14, swapped).agree).toBe(false);
  });

  test("cas non couvert (deux condensateurs) : pas de chiffres inventés", () => {
    const two = { ...A14, elemente: [...A14.elemente, { typ: "C" as const, name: "C2", a: "K2", b: "0", wert: "1u" }] };
    expect(switchAnalysis(two)).toBeNull();
  });
});
