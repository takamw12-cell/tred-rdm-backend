import { describe, expect, test } from "bun:test";
import {
  caesarCipher,
  caesarDecipher,
  calculateSubnet,
  generateKarnaughMap,
  generateRSAKeys,
  hashText,
  minimizeTruthTable,
  rsaDecrypt,
  rsaEncrypt,
  simplifyBoolean,
  solveCyber,
  splitSubnet,
  truthTableOf,
  vigenereCipher,
  vigenereDecipher,
} from "../../src/api/lib/solvers/cyber-solver";

/** Fiabilité : au moins trois cas de référence par fonction. */

describe("Caesar", () => {
  test.each([
    ["ABC", 3, "DEF"],
    ["Hallo Welt!", 3, "Kdoor Zhow!"],
    ["xyz", 3, "abc"],
    ["Kryptographie", 13, "Xelcgbtencuvr"], // ROT13
    ["Übung 1", 1, "Ücvoh 1"], // Umlaute und Ziffern bleiben
  ])("caesarCipher(%p, %p) = %p", (text, k, expected) => {
    expect(caesarCipher(text, k)).toBe(expected);
    expect(caesarDecipher(expected, k)).toBe(text);
  });

  test("Verschiebung negativ oder > 26 : modulo 26", () => {
    expect(caesarCipher("DEF", -3)).toBe("ABC");
    expect(caesarCipher("ABC", 29)).toBe("DEF");
    expect(caesarDecipher("ABC", 26)).toBe("ABC");
  });
});

describe("Vigenère", () => {
  test.each([
    ["ATTACKATDAWN", "LEMON", "LXFOPVEFRNHR"], // Lehrbuchbeispiel
    ["HELLO", "KEY", "RIJVS"],
    ["Geheime Nachricht", "ABC", "Gfjejoe Occitidjt"], // Schlüssel rückt nur bei Buchstaben weiter
  ])("vigenereCipher(%p, %p) = %p", (text, key, expected) => {
    expect(vigenereCipher(text, key)).toBe(expected);
    expect(vigenereDecipher(expected, key)).toBe(text);
  });

  test("Schlüssel ohne Buchstaben : Fehler", () => {
    expect(() => vigenereCipher("abc", "123")).toThrow("Buchstaben");
  });
});

describe("RSA (Lehrbuch)", () => {
  test.each([
    [3, 11, 7, 33n, 20n, 3n],
    [61, 53, 17, 3233n, 3120n, 2753n], // Standardbeispiel
    [5, 11, 3, 55n, 40n, 27n],
  ])("generateRSAKeys(%p, %p, %p) → n, φ, d", (p, q, e, n, phi, d) => {
    const k = generateRSAKeys(p, q, e);
    expect([k.n, k.phi, k.d]).toEqual([n, phi, d]);
    expect((k.e * k.d) % k.phi).toBe(1n);
  });

  test.each([
    [2n, 7n, 3n, 33n, 29n],
    [65n, 17n, 2753n, 3233n, 2790n],
    [8n, 3n, 27n, 55n, 17n],
  ])("rsaEncrypt(%p, e=%p) und zurück mit d=%p (n=%p) → %p", (m, e, d, n, c) => {
    expect(rsaEncrypt(m, e, n)).toBe(c);
    expect(rsaDecrypt(c, d, n)).toBe(m);
  });

  test("ohne e : kleinstes gültiges e ; Fehlerfälle", () => {
    expect(generateRSAKeys(3, 11).e).toBe(3n); // ggT(3, 20) = 1
    expect(() => generateRSAKeys(4, 11, 3)).toThrow("keine Primzahl");
    expect(() => generateRSAKeys(3, 11, 5)).toThrow("teilerfremd"); // ggT(5, 20) = 5
    expect(() => rsaEncrypt(40, 7, 33)).toThrow("0 ≤ m < n");
  });
});

describe("Hash", () => {
  test.each([
    ["abc", "sha256", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    ["", "md5", "d41d8cd98f00b204e9800998ecf8427e"],
    ["abc", "sha1", "a9993e364706816aba3e25717850c26c9cd0d89d"],
  ] as const)("hashText(%p, %p)", (text, algo, hex) => {
    expect(hashText(text, algo)).toBe(hex);
  });
});

describe("Boolesche Algebra", () => {
  test.each([
    ["A·B + A·¬B", "A"],
    ["A·B + ¬A·B + A·¬B", "A + B"],
    ["AB + A'B", "B"],
    ["(a | b) & !a", "¬a·b"],
    ["A ^ B", "A·¬B + ¬A·B"],
    ["A·B + A·C + B·C + A·B·C", "A·B + A·C + B·C"], // Mehrheitsfunktion
    ["A + ¬A", "1"],
    ["A UND NICHT A", "0"],
  ])("simplifyBoolean(%p) = %p", (expr, dnf) => {
    const r = simplifyBoolean(expr);
    expect(r.dnf).toBe(dnf);
    // die Minimalform hat dieselbe Wahrheitstabelle
    if (dnf !== "0" && dnf !== "1") expect(truthTableOf(dnf, r.variables).values).toEqual(r.wahrheitstabelle);
  });

  test("KNF und LaTeX", () => {
    const r = simplifyBoolean("A·B + A·¬B + ¬A·B");
    expect(r.knf).toBe("(A + B)");
    expect(simplifyBoolean("¬A·B").dnf_latex).toBe("\\overline{A} B");
    expect(simplifyBoolean("A·B").knf).toBe("A · B");
  });

  test("Don't cares aus der Wahrheitstabelle", () => {
    expect(minimizeTruthTable(["A", "B"], [0, 1, "x", 1]).dnf).toBe("B");
    expect(minimizeTruthTable(["A", "B"], [1, "x", 0, 0]).dnf).toBe("¬A");
    expect(minimizeTruthTable(["A", "B", "C"], [0, 0, 0, 1, 0, 1, 1, 1]).dnf).toBe("A·B + A·C + B·C");
  });

  test("Fehler ehrlich", () => {
    expect(() => simplifyBoolean("A + ")).toThrow();
    expect(() => simplifyBoolean("(A + B")).toThrow("Klammer");
    expect(() => minimizeTruthTable(["A", "B"], [0, 1, 1])).toThrow("2^2");
  });
});

describe("KV-Diagramm", () => {
  test("2 Variablen : A·B", () => {
    const k = generateKarnaughMap(["A", "B"], [0, 0, 0, 1]);
    expect(k.zellen).toEqual([[0, 0], [0, 1]]);
    expect(k.bloecke).toEqual([{ term: "A·B", minterme: [3] }]);
  });

  test("3 Variablen : Gray-Code-Spalten, Mehrheitsfunktion", () => {
    const k = generateKarnaughMap(["A", "B", "C"], [0, 0, 0, 1, 0, 1, 1, 1]);
    expect(k.spalten_labels).toEqual(["00", "01", "11", "10"]);
    expect(k.minterm).toEqual([[0, 1, 3, 2], [4, 5, 7, 6]]);
    expect(k.zellen).toEqual([[0, 0, 1, 0], [0, 1, 1, 1]]);
    expect(k.dnf).toBe("A·B + A·C + B·C");
    expect(k.tabelle_markdown.split("\n")[0]).toBe("| A \\ BC | 00 | 01 | 11 | 10 |");
  });

  test("4 Variablen : die vier Ecken = ¬B·¬D", () => {
    const table = Array.from({ length: 16 }, (_, i) => ((i & 0b0100) === 0 && (i & 0b0001) === 0 ? 1 : 0)) as (0 | 1)[];
    const k = generateKarnaughMap(["A", "B", "C", "D"], table);
    expect(k.dnf).toBe("¬B·¬D");
    expect(k.bloecke[0].minterme).toEqual([0, 2, 8, 10]);
    expect(k.minterm[2][2]).toBe(15); // Zeile AB = 11, Spalte CD = 11
  });
});

describe("IPv4-Subnetze", () => {
  test("/24", () => {
    const r = calculateSubnet("192.168.1.130", 24);
    expect(r).toMatchObject({
      maske: "255.255.255.0",
      netzadresse: "192.168.1.0",
      broadcast: "192.168.1.255",
      erster_host: "192.168.1.1",
      letzter_host: "192.168.1.254",
      anzahl_hosts: 254,
      privat: true,
    });
  });

  test("/26, /20, /8", () => {
    expect(calculateSubnet("192.168.1.130/26")).toMatchObject({ netzadresse: "192.168.1.128", broadcast: "192.168.1.191", anzahl_hosts: 62, maske: "255.255.255.192" });
    expect(calculateSubnet("172.16.5.4", 20)).toMatchObject({ maske: "255.255.240.0", netzadresse: "172.16.0.0", broadcast: "172.16.15.255", anzahl_hosts: 4094, wildcard: "0.0.15.255" });
    expect(calculateSubnet("10.0.0.5", 8)).toMatchObject({ netzadresse: "10.0.0.0", broadcast: "10.255.255.255", anzahl_hosts: 16777214 });
  });

  test("Grenzfälle /31, /32, öffentliche Adresse, Fehler", () => {
    expect(calculateSubnet("10.0.0.0/31").anzahl_hosts).toBe(2);
    expect(calculateSubnet("8.8.8.8/32")).toMatchObject({ anzahl_hosts: 1, privat: false });
    expect(calculateSubnet("192.168.1.130/24").ip_binaer).toBe("11000000.10101000.00000001.10000010");
    expect(() => calculateSubnet("192.168.1.300", 24)).toThrow("IPv4");
    expect(() => calculateSubnet("192.168.1.1", 33)).toThrow("CIDR");
  });

  test("Aufteilung /24 → 4 × /26", () => {
    const s = splitSubnet("192.168.1.0", 24, 26);
    expect(s.anzahl).toBe(4);
    expect(s.teilnetze.map((t) => t.netzadresse)).toEqual(["192.168.1.0", "192.168.1.64", "192.168.1.128", "192.168.1.192"]);
  });
});

describe("solve_cyber (Werkzeug)", () => {
  test("Ergebnisse und ehrliche Fehler", () => {
    expect(solveCyber({ aufgabe: "caesar", text: "ABC", verschiebung: 3 })).toMatchObject({ ok: true, ergebnis: "DEF" });
    expect(solveCyber({ aufgabe: "vigenere", text: "LXFOPVEFRNHR", schluessel: "lemon", richtung: "entschluesseln" })).toMatchObject({ ok: true, ergebnis: "ATTACKATDAWN" });
    expect(solveCyber({ aufgabe: "rsa_schluessel", p: 3, q: 11, e: 7 })).toMatchObject({ ok: true, n: 33, phi: 20, d: 3 });
    expect(solveCyber({ aufgabe: "rsa_verschluesseln", nachricht: [2, 5], e: 7, d: 3, n: 33 })).toMatchObject({
      ok: true,
      ergebnisse: [{ ein: "2", aus: 29 }, { ein: "5", aus: 14 }],
    });
    expect(solveCyber({ aufgabe: "kv_diagramm", ausdruck: "A·B + ¬A·B" })).toMatchObject({ ok: true, dnf: "B" });
    expect(solveCyber({ aufgabe: "subnetz", ip: "192.168.1.0/24", neue_cidr: 26 })).toMatchObject({ ok: true, teilnetze_anzahl: 4 });
    expect(solveCyber({ aufgabe: "hash", text: "abc", algorithmus: "md5" })).toMatchObject({ ok: true, warnung: expect.stringContaining("gebrochen") });
    expect(solveCyber({ aufgabe: "rsa_schluessel", p: 4, q: 11 })).toMatchObject({ ok: false });
    expect(solveCyber({ aufgabe: "rsa_verschluesseln", nachricht: 2, e: 7, d: 5, n: 33 })).toMatchObject({ ok: false });
  });
});
