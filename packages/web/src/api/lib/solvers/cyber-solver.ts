/**
 * Informatik & IT-Sicherheit — deterministisch, für die Lehre.
 *
 *   Klassische Kryptographie   caesarCipher / caesarDecipher, vigenereCipher / vigenereDecipher
 *   RSA (Lehrbuchgröße)        generateRSAKeys, rsaEncrypt, rsaDecrypt
 *   Hash                       hashText (MD5, SHA-1, SHA-256, SHA-512)
 *   Boolesche Algebra          simplifyBoolean (Quine-McCluskey + exakte Überdeckung),
 *                              generateKarnaughMap (KV-Diagramm, 2–4 Variablen)
 *   Netze                      calculateSubnet (IPv4, CIDR, Teilnetze)
 *
 * Wie bei den anderen Fachlösern: das Modell stellt auf, dieser Code rechnet
 * und prüft sich selbst (Entschlüsseln des Geheimtexts, Wahrheitstabelle der
 * vereinfachten Form = Wahrheitstabelle der Eingabe). Besteht eine Probe
 * nicht, gibt es KEIN Ergebnis.
 *
 * RSA hier ist Schulbuch-RSA (kleine Primzahlen, kein Padding) — zum
 * Verstehen, nie zum Schützen echter Daten. Das steht auch im Ergebnis.
 */
import { createHash } from "node:crypto";
import { z } from "zod";

export class CyberError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CyberError";
  }
}

/* -------------------------------------------------------------------------- */
/* Caesar & Vigenère                                                          */
/* -------------------------------------------------------------------------- */

const mod = (a: number, m: number) => ((a % m) + m) % m;

/** Verschiebt nur A–Z und a–z; Umlaute, Ziffern, Satzzeichen bleiben stehen. */
function shiftLetter(ch: string, k: number): string {
  const c = ch.charCodeAt(0);
  if (c >= 65 && c <= 90) return String.fromCharCode(65 + mod(c - 65 + k, 26));
  if (c >= 97 && c <= 122) return String.fromCharCode(97 + mod(c - 97 + k, 26));
  return ch;
}

export function caesarCipher(text: string, shift: number): string {
  if (!Number.isInteger(shift)) throw new CyberError("Die Verschiebung muss eine ganze Zahl sein.");
  return [...text].map((ch) => shiftLetter(ch, shift)).join("");
}

export function caesarDecipher(text: string, shift: number): string {
  return caesarCipher(text, -shift);
}

function vigenereShifts(key: string): number[] {
  const shifts = [...key].filter((c) => /[a-z]/i.test(c)).map((c) => c.toUpperCase().charCodeAt(0) - 65);
  if (shifts.length === 0) throw new CyberError("Der Schlüssel braucht mindestens einen Buchstaben A–Z.");
  return shifts;
}

/** Der Schlüssel rückt nur bei Buchstaben weiter (Standard in Lehrbüchern). */
function vigenere(text: string, key: string, dir: 1 | -1): string {
  const shifts = vigenereShifts(key);
  let i = 0;
  return [...text]
    .map((ch) => {
      if (!/[a-z]/i.test(ch)) return ch;
      return shiftLetter(ch, dir * shifts[i++ % shifts.length]);
    })
    .join("");
}

export const vigenereCipher = (text: string, key: string) => vigenere(text, key, 1);
export const vigenereDecipher = (text: string, key: string) => vigenere(text, key, -1);

/* -------------------------------------------------------------------------- */
/* RSA (Lehrbuch)                                                             */
/* -------------------------------------------------------------------------- */

const MAX_PRIME = 1_000_000_000;

export function isPrime(n: number): boolean {
  if (!Number.isInteger(n) || n < 2) return false;
  if (n % 2 === 0) return n === 2;
  for (let d = 3; d * d <= n; d += 2) if (n % d === 0) return false;
  return true;
}

function gcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return a < 0n ? -a : a;
}

export interface EuclidStep {
  a: string;
  b: string;
  q: string;
  r: string;
}

/** Inverses von e modulo m über den erweiterten euklidischen Algorithmus, mit Rechenweg. */
export function modInverse(e: bigint, m: bigint): { d: bigint; schritte: EuclidStep[] } {
  const schritte: EuclidStep[] = [];
  let [oldR, r] = [e, m];
  let [oldS, s] = [1n, 0n];
  while (r !== 0n) {
    const q = oldR / r;
    schritte.push({ a: String(oldR), b: String(r), q: String(q), r: String(oldR - q * r) });
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  if (oldR !== 1n) throw new CyberError(`e und φ(n) sind nicht teilerfremd (ggT = ${oldR}) — kein Inverses.`);
  return { d: ((oldS % m) + m) % m, schritte };
}

export function modPow(base: bigint, exp: bigint, m: bigint): bigint {
  if (m === 1n) return 0n;
  let result = 1n;
  let b = ((base % m) + m) % m;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return result;
}

export interface RSAKeys {
  p: number;
  q: number;
  n: bigint;
  phi: bigint;
  e: bigint;
  d: bigint;
  euklid: EuclidStep[];
}

/** n = p·q, φ(n) = (p−1)(q−1), d = e⁻¹ mod φ(n). Ohne e: kleinstes gültiges e ≥ 3. */
export function generateRSAKeys(p: number, q: number, e?: number): RSAKeys {
  for (const [name, x] of [["p", p], ["q", q]] as const) {
    if (!isPrime(x)) throw new CyberError(`${name} = ${x} ist keine Primzahl.`);
    if (x > MAX_PRIME) throw new CyberError(`${name} ist zu groß für das Lehrbeispiel (höchstens ${MAX_PRIME}).`);
  }
  if (p === q) throw new CyberError("p und q müssen verschieden sein (sonst ist n = p² leicht zu faktorisieren und φ(n) ≠ (p−1)²).");
  const n = BigInt(p) * BigInt(q);
  const phi = BigInt(p - 1) * BigInt(q - 1);
  let E: bigint;
  if (e === undefined) {
    E = 3n;
    while (gcd(E, phi) !== 1n) E += 2n;
  } else {
    if (!Number.isInteger(e) || e <= 1) throw new CyberError("e muss eine ganze Zahl > 1 sein.");
    E = BigInt(e);
    if (E >= phi) throw new CyberError("Es muss 1 < e < φ(n) gelten.");
  }
  const { d, schritte } = modInverse(E, phi);
  if ((E * d) % phi !== 1n) throw new CyberError("Interne Probe e·d ≡ 1 (mod φ(n)) nicht erfüllt.");
  return { p, q, n, phi, e: E, d, euklid: schritte };
}

function toBig(x: number | string | bigint, name: string): bigint {
  try {
    const b = BigInt(typeof x === "number" ? Math.trunc(x) : x);
    if (typeof x === "number" && !Number.isInteger(x)) throw new Error();
    return b;
  } catch {
    throw new CyberError(`${name} muss eine ganze Zahl sein.`);
  }
}

/** c = mᵉ mod n. Die Nachricht ist eine Zahl 0 ≤ m < n (Buchstaben vorher codieren). */
export function rsaEncrypt(message: number | bigint, e: number | bigint, n: number | bigint): bigint {
  const m = toBig(message, "Nachricht");
  const N = toBig(n, "n");
  if (m < 0n || m >= N) throw new CyberError(`Die Nachricht muss 0 ≤ m < n = ${N} erfüllen — sonst ist sie nicht eindeutig.`);
  return modPow(m, toBig(e, "e"), N);
}

/** m = cᵈ mod n. */
export function rsaDecrypt(cipher: number | bigint, d: number | bigint, n: number | bigint): bigint {
  const c = toBig(cipher, "Geheimtext");
  const N = toBig(n, "n");
  if (c < 0n || c >= N) throw new CyberError(`Der Geheimtext muss 0 ≤ c < n = ${N} erfüllen.`);
  return modPow(c, toBig(d, "d"), N);
}

/* -------------------------------------------------------------------------- */
/* Hash                                                                       */
/* -------------------------------------------------------------------------- */

export const HASH_ALGORITHMS = ["md5", "sha1", "sha256", "sha512"] as const;
export type HashAlgorithm = (typeof HASH_ALGORITHMS)[number];

/** Hexadezimaler Hash des UTF-8-Texts. */
export function hashText(text: string, algorithm: HashAlgorithm = "sha256"): string {
  return createHash(algorithm).update(text, "utf8").digest("hex");
}

/* -------------------------------------------------------------------------- */
/* Boolesche Algebra                                                          */
/* -------------------------------------------------------------------------- */

type BoolNode =
  | { k: "var"; name: string }
  | { k: "const"; v: boolean }
  | { k: "not"; a: BoolNode }
  | { k: "and" | "or" | "xor"; a: BoolNode; b: BoolNode }
  | { k: "nand" | "nor"; a: BoolNode; b: BoolNode };

type Tok =
  | { t: "var"; name: string }
  | { t: "const"; v: boolean }
  | { t: "op"; op: "and" | "or" | "xor" | "not" | "nand" | "nor" }
  | { t: "post" }
  | { t: "(" }
  | { t: ")" };

const KEYWORDS: Record<string, "and" | "or" | "xor" | "not" | "nand" | "nor"> = {
  and: "and", und: "and", or: "or", oder: "or", xor: "xor", not: "not", nicht: "not", nand: "nand", nor: "nor",
};

const MAX_VARS = 8;

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const word = /^[A-Za-zÄÖÜäöü]+(?![A-Za-z0-9_])/.exec(src.slice(i))?.[0];
    if (word && KEYWORDS[word.toLowerCase()]) {
      out.push({ t: "op", op: KEYWORDS[word.toLowerCase()] });
      i += word.length;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      // Ein Buchstabe, optional mit Index: A, x1, x_2. "AB" = A·B.
      const m = /^[A-Za-z](?:_?\d+)?/.exec(src.slice(i))![0];
      out.push({ t: "var", name: m });
      i += m.length;
      continue;
    }
    if (ch === "0" || ch === "1") out.push({ t: "const", v: ch === "1" });
    else if ("·*&∧⋅".includes(ch)) out.push({ t: "op", op: "and" });
    else if ("+|∨".includes(ch)) out.push({ t: "op", op: "or" });
    else if ("^⊕".includes(ch)) out.push({ t: "op", op: "xor" });
    else if ("!¬~".includes(ch)) out.push({ t: "op", op: "not" });
    else if (ch === "'") out.push({ t: "post" });
    else if (ch === "(" || ch === "[") out.push({ t: "(" });
    else if (ch === ")" || ch === "]") out.push({ t: ")" });
    else throw new CyberError(`Unbekanntes Zeichen "${ch}" im Ausdruck.`);
    // && und || als ein Operator
    if ((ch === "&" || ch === "|") && src[i + 1] === ch) i++;
    i++;
  }
  return out;
}

/** Vorrang: NICHT > UND (auch Nebeneinanderschreiben) > XOR > ODER, NAND/NOR wie UND/ODER. */
export function parseBoolean(src: string): BoolNode {
  if (src.length > 300) throw new CyberError("Ausdruck zu lang.");
  const toks = tokenize(src);
  let pos = 0;
  const peek = () => toks[pos];
  const isOp = (op: string) => {
    const t = peek();
    return t?.t === "op" && t.op === op;
  };

  const parseOr = (): BoolNode => {
    let left = parseXor();
    while (isOp("or") || isOp("nor")) {
      const op = (toks[pos++] as { op: "or" | "nor" }).op;
      left = { k: op, a: left, b: parseXor() };
    }
    return left;
  };
  const parseXor = (): BoolNode => {
    let left = parseAnd();
    while (isOp("xor")) {
      pos++;
      left = { k: "xor", a: left, b: parseAnd() };
    }
    return left;
  };
  const startsUnary = () => {
    const t = peek();
    return !!t && (t.t === "var" || t.t === "const" || t.t === "(" || (t.t === "op" && t.op === "not"));
  };
  const parseAnd = (): BoolNode => {
    let left = parseUnary();
    for (;;) {
      if (isOp("and") || isOp("nand")) {
        const op = (toks[pos++] as { op: "and" | "nand" }).op;
        left = { k: op, a: left, b: parseUnary() };
      } else if (startsUnary()) {
        left = { k: "and", a: left, b: parseUnary() };
      } else return left;
    }
  };
  const parseUnary = (): BoolNode => {
    if (isOp("not")) {
      pos++;
      return { k: "not", a: parseUnary() };
    }
    let node = parsePrimary();
    while (peek()?.t === "post") {
      pos++;
      node = { k: "not", a: node };
    }
    return node;
  };
  const parsePrimary = (): BoolNode => {
    const t = toks[pos++];
    if (!t) throw new CyberError("Ausdruck endet unerwartet.");
    if (t.t === "var") return { k: "var", name: t.name };
    if (t.t === "const") return { k: "const", v: t.v };
    if (t.t === "(") {
      const inner = parseOr();
      if (toks[pos++]?.t !== ")") throw new CyberError("Schließende Klammer fehlt.");
      return inner;
    }
    throw new CyberError("Operand erwartet (Variable, 0, 1 oder Klammer).");
  };

  if (toks.length === 0) throw new CyberError("Leerer Ausdruck.");
  const tree = parseOr();
  if (pos !== toks.length) throw new CyberError("Ausdruck nicht vollständig lesbar — Operator oder Klammer prüfen.");
  return tree;
}

function collectVars(n: BoolNode, acc = new Set<string>()): Set<string> {
  if (n.k === "var") acc.add(n.name);
  else if (n.k === "not") collectVars(n.a, acc);
  else if (n.k !== "const") {
    collectVars(n.a, acc);
    collectVars(n.b, acc);
  }
  return acc;
}

function evalBool(n: BoolNode, env: Record<string, boolean>): boolean {
  switch (n.k) {
    case "var":
      return env[n.name];
    case "const":
      return n.v;
    case "not":
      return !evalBool(n.a, env);
    case "and":
      return evalBool(n.a, env) && evalBool(n.b, env);
    case "or":
      return evalBool(n.a, env) || evalBool(n.b, env);
    case "xor":
      return evalBool(n.a, env) !== evalBool(n.b, env);
    case "nand":
      return !(evalBool(n.a, env) && evalBool(n.b, env));
    case "nor":
      return !(evalBool(n.a, env) || evalBool(n.b, env));
  }
}

const natural = (a: string, b: string) => a.localeCompare(b, "de", { numeric: true });

/** Wert je Zeile; Zeile i: variables[0] ist das höchstwertige Bit. */
export type TruthValue = 0 | 1 | "x";

export function truthTableOf(expr: string, variables?: string[]): { variables: string[]; values: TruthValue[] } {
  const tree = parseBoolean(expr);
  const found = [...collectVars(tree)].sort(natural);
  const vars = variables?.length ? variables : found;
  const missing = found.filter((v) => !vars.includes(v));
  if (missing.length) throw new CyberError(`Variable(n) ${missing.join(", ")} fehlen in der Variablenliste.`);
  if (vars.length > MAX_VARS) throw new CyberError(`Höchstens ${MAX_VARS} Variablen.`);
  const values: TruthValue[] = [];
  for (let i = 0; i < 1 << vars.length; i++) {
    const env: Record<string, boolean> = {};
    vars.forEach((v, j) => (env[v] = ((i >> (vars.length - 1 - j)) & 1) === 1));
    values.push(evalBool(tree, env) ? 1 : 0);
  }
  return { variables: vars, values };
}

/** Implikant: `bits` an den Stellen, die `mask` NICHT freigibt. */
interface Implicant {
  bits: number;
  mask: number;
}

const popcount = (x: number) => {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
};

function primeImplicants(ones: number[], dcs: number[]): Implicant[] {
  let current = new Map<string, Implicant>();
  for (const m of [...ones, ...dcs]) current.set(`${m}/0`, { bits: m, mask: 0 });
  const primes = new Map<string, Implicant>();
  while (current.size) {
    const next = new Map<string, Implicant>();
    const used = new Set<string>();
    const list = [...current.entries()];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [ka, a] = list[i];
        const [kb, b] = list[j];
        if (a.mask !== b.mask) continue;
        const diff = a.bits ^ b.bits;
        if (popcount(diff) !== 1) continue;
        const c = { bits: a.bits & ~diff, mask: a.mask | diff };
        next.set(`${c.bits}/${c.mask}`, c);
        used.add(ka);
        used.add(kb);
      }
    }
    for (const [k, v] of current) if (!used.has(k)) primes.set(k, v);
    current = next;
  }
  return [...primes.values()];
}

const covers = (imp: Implicant, m: number) => (m & ~imp.mask) === imp.bits;

/** Lesereihenfolge: nach Variablen, je Variable erst positiv, dann negiert, dann fehlend (A + B, A·¬B + ¬A·B). */
function sortTerms(terms: Implicant[], nVars: number): Implicant[] {
  const key = (p: Implicant) =>
    Array.from({ length: nVars }, (_, j) => {
      const bit = 1 << (nVars - 1 - j);
      return p.mask & bit ? "2" : p.bits & bit ? "0" : "1";
    }).join("");
  return [...terms].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

/** Minimale Überdeckung: Kernprimimplikanten, dann kleinste Restauswahl (wenigste Terme, dann Literale). */
function minimalCover(primes: Implicant[], ones: number[], nVars: number): Implicant[] {
  const essential: Implicant[] = [];
  let remaining = [...ones];
  for (const m of ones) {
    const cov = primes.filter((p) => covers(p, m));
    if (cov.length === 1 && !essential.includes(cov[0])) essential.push(cov[0]);
  }
  remaining = remaining.filter((m) => !essential.some((p) => covers(p, m)));
  if (remaining.length === 0) return sortTerms(essential, nVars);
  const candidates = primes.filter((p) => !essential.includes(p) && remaining.some((m) => covers(p, m)));
  const literals = (p: Implicant) => nVars - popcount(p.mask);
  const found: { best: Implicant[] | null } = { best: null };
  const cost = (set: Implicant[]) => set.length * 1000 + set.reduce((s, p) => s + literals(p), 0);
  // Exakte Suche über Teilmengen (≤ 8 Variablen: klein genug), beschnitten
  // sobald eine Auswahl länger ist als die beste bisher.
  const search = (start: number, chosen: Implicant[]) => {
    if (found.best && chosen.length > found.best.length) return;
    if (remaining.every((m) => chosen.some((p) => covers(p, m)))) {
      if (!found.best || cost(chosen) < cost(found.best)) found.best = [...chosen];
      return;
    }
    if (chosen.length >= 12) return;
    for (let i = start; i < candidates.length; i++) search(i + 1, [...chosen, candidates[i]]);
  };
  if (candidates.length > 22) throw new CyberError("Zu viele Primimplikanten für die exakte Minimierung — Ausdruck aufteilen.");
  search(0, []);
  return sortTerms([...essential, ...(found.best ?? [])], nVars);
}

function termText(imp: Implicant, vars: string[], style: "text" | "latex", forProduct: boolean): string {
  const n = vars.length;
  const lits: string[] = [];
  vars.forEach((v, j) => {
    const bit = 1 << (n - 1 - j);
    if (imp.mask & bit) return;
    // Produkt: Bit 1 → A, Bit 0 → ¬A. Summe (aus den Nullstellen): umgekehrt.
    const positive = ((imp.bits & bit) !== 0) === forProduct;
    lits.push(positive ? v : style === "latex" ? `\\overline{${v}}` : `¬${v}`);
  });
  if (forProduct) return lits.length ? lits.join(style === "latex" ? " " : "·") : "1";
  const sum = lits.join(" + ");
  return lits.length > 1 ? `(${sum})` : sum;
}

export interface BooleanResult {
  variables: string[];
  wahrheitstabelle: TruthValue[];
  minterme: number[];
  /** Minimale disjunktive Form (DNF / Summe von Produkten). */
  dnf: string;
  dnf_latex: string;
  /** Minimale konjunktive Form (KNF / Produkt von Summen). */
  knf: string;
  primimplikanten: string[];
}

/** Minimierung aus einer Wahrheitstabelle (mit Don't-cares "x"). */
export function minimizeTruthTable(variables: string[], table: TruthValue[]): BooleanResult {
  const n = variables.length;
  if (n < 1 || n > MAX_VARS) throw new CyberError(`1 bis ${MAX_VARS} Variablen.`);
  if (new Set(variables).size !== n) throw new CyberError("Variablennamen doppelt.");
  if (table.length !== 1 << n) throw new CyberError(`Die Wahrheitstabelle braucht genau 2^${n} = ${1 << n} Zeilen.`);
  const ones = table.flatMap((v, i) => (v === 1 ? [i] : []));
  const zeros = table.flatMap((v, i) => (v === 0 ? [i] : []));
  const dcs = table.flatMap((v, i) => (v === "x" ? [i] : []));

  const sop = (on: number[]) => minimalCover(primeImplicants(on, dcs), on, n);
  let dnf: string, dnfLatex: string, knf: string;
  let primes: Implicant[] = [];
  if (ones.length === 0) {
    dnf = dnfLatex = "0";
  } else if (zeros.length === 0) {
    dnf = dnfLatex = "1";
  } else {
    primes = primeImplicants(ones, dcs);
    const cover = minimalCover(primes, ones, n);
    dnf = cover.map((p) => termText(p, variables, "text", true)).join(" + ");
    dnfLatex = cover.map((p) => termText(p, variables, "latex", true)).join(" + ");
    // Probe: die Minimalform trifft jede 1 und keine 0.
    for (let i = 0; i < table.length; i++) {
      const hit = cover.some((p) => covers(p, i));
      if ((table[i] === 1 && !hit) || (table[i] === 0 && hit)) throw new CyberError("Interne Probe der Minimierung nicht erfüllt.");
    }
  }
  if (zeros.length === 0) knf = "1";
  else if (ones.length === 0) knf = "0";
  else knf = sop(zeros).map((p) => termText(p, variables, "text", false)).join(" · ");

  return {
    variables,
    wahrheitstabelle: table,
    minterme: ones,
    dnf,
    dnf_latex: dnfLatex,
    knf,
    primimplikanten: primes.map((p) => termText(p, variables, "text", true)),
  };
}

/** Vereinfacht einen booleschen Ausdruck: Wahrheitstabelle → minimale DNF/KNF, mit Probe. */
export function simplifyBoolean(expression: string, variables?: string[]): BooleanResult {
  const { variables: vars, values } = truthTableOf(expression, variables);
  const r = minimizeTruthTable(vars, values);
  // Probe: die vereinfachte Form hat dieselbe Wahrheitstabelle wie die Eingabe.
  if (r.dnf !== "0" && r.dnf !== "1") {
    const check = truthTableOf(r.dnf, vars).values;
    if (check.some((v, i) => v !== values[i])) throw new CyberError("Interne Probe: vereinfachte Form ≠ Eingabe.");
  }
  return r;
}

/* -------------------------------------------------------------------------- */
/* KV-Diagramm (Karnaugh-Veitch)                                              */
/* -------------------------------------------------------------------------- */

const GRAY: Record<number, number[]> = { 0: [0], 1: [0, 1], 2: [0, 1, 3, 2] };
const bitsLabel = (v: number, width: number) => (width === 0 ? "" : v.toString(2).padStart(width, "0"));

export interface KarnaughMap {
  zeilen_variablen: string[];
  spalten_variablen: string[];
  zeilen_labels: string[];
  spalten_labels: string[];
  /** zellen[z][s] = Wert; minterm[z][s] = Zeilennummer der Wahrheitstabelle. */
  zellen: TruthValue[][];
  minterm: number[][];
  /** Die Blöcke der Minimalform, je Block die Minterme. */
  bloecke: { term: string; minterme: number[] }[];
  dnf: string;
  dnf_latex: string;
  /** Fertige Markdown-Tabelle zum Übernehmen. */
  tabelle_markdown: string;
}

/**
 * KV-Diagramm für 2–4 Variablen in Gray-Code-Anordnung: Zeilen = erste
 * Variable(n), Spalten = die übrigen. Die Blöcke sind die der Minimalform.
 */
export function generateKarnaughMap(variables: string[], truthTable: TruthValue[]): KarnaughMap {
  const n = variables.length;
  if (n < 2 || n > 4) throw new CyberError("KV-Diagramm hier für 2 bis 4 Variablen.");
  const min = minimizeTruthTable(variables, truthTable);
  const rowBits = Math.floor(n / 2);
  const colBits = n - rowBits;
  const rows = GRAY[rowBits];
  const cols = GRAY[colBits];
  const minterm = rows.map((r) => cols.map((c) => (r << colBits) | c));
  const zellen = minterm.map((row) => row.map((m) => truthTable[m]));

  const ones = truthTable.flatMap((v, i) => (v === 1 ? [i] : []));
  const dcs = truthTable.flatMap((v, i) => (v === "x" ? [i] : []));
  const cover =
    ones.length && truthTable.some((v) => v === 0) ? minimalCover(primeImplicants(ones, dcs), ones, n) : [];
  const bloecke = cover.map((p) => ({
    term: termText(p, variables, "text", true),
    minterme: Array.from({ length: 1 << n }, (_, i) => i).filter((i) => covers(p, i)),
  }));

  const rv = variables.slice(0, rowBits);
  const cv = variables.slice(rowBits);
  const head = `| ${rv.join("")} \\ ${cv.join("")} | ${cols.map((c) => bitsLabel(c, colBits)).join(" | ")} |`;
  const sep = `|${"---|".repeat(cols.length + 1)}`;
  const body = rows.map((r, i) => `| **${bitsLabel(r, rowBits)}** | ${zellen[i].map(String).join(" | ")} |`);
  return {
    zeilen_variablen: rv,
    spalten_variablen: cv,
    zeilen_labels: rows.map((r) => bitsLabel(r, rowBits)),
    spalten_labels: cols.map((c) => bitsLabel(c, colBits)),
    zellen,
    minterm,
    bloecke,
    dnf: min.dnf,
    dnf_latex: min.dnf_latex,
    tabelle_markdown: [head, sep, ...body].join("\n"),
  };
}

/* -------------------------------------------------------------------------- */
/* IPv4-Subnetze                                                              */
/* -------------------------------------------------------------------------- */

export function parseIPv4(ip: string): number {
  const parts = ip.trim().split(".");
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) {
    throw new CyberError(`"${ip}" ist keine gültige IPv4-Adresse (vier Zahlen 0–255).`);
  }
  return parts.reduce((acc, p) => acc * 256 + Number(p), 0);
}

export const ipToString = (x: number) => [24, 16, 8, 0].map((s) => Math.floor(x / 2 ** s) % 256).join(".");
const ipToBinary = (x: number) =>
  [24, 16, 8, 0].map((s) => (Math.floor(x / 2 ** s) % 256).toString(2).padStart(8, "0")).join(".");

export interface SubnetResult {
  ip: string;
  cidr: number;
  maske: string;
  wildcard: string;
  netzadresse: string;
  broadcast: string;
  erster_host: string | null;
  letzter_host: string | null;
  anzahl_adressen: number;
  anzahl_hosts: number;
  ip_binaer: string;
  maske_binaer: string;
  klasse: string;
  privat: boolean;
  hinweis?: string;
}

/** Netz, Broadcast, Hostbereich einer IPv4-Adresse mit Präfixlänge (auch "10.0.0.5/8"). */
export function calculateSubnet(ip: string, cidr?: number): SubnetResult {
  let addr = ip.trim();
  let prefix = cidr;
  if (addr.includes("/")) {
    const [a, c] = addr.split("/");
    addr = a;
    if (prefix === undefined) prefix = Number(c);
  }
  if (prefix === undefined || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    throw new CyberError("CIDR-Präfix zwischen /0 und /32 angeben.");
  }
  const x = parseIPv4(addr);
  const size = 2 ** (32 - prefix);
  const mask = 2 ** 32 - size;
  const network = Math.floor(x / size) * size;
  const broadcast = network + size - 1;
  // /31 (RFC 3021, Punkt-zu-Punkt) und /32 (Einzelhost) haben keine Netz-/Broadcast-Reservierung.
  const hosts = prefix === 32 ? 1 : prefix === 31 ? 2 : size - 2;
  const first = prefix >= 31 ? network : network + 1;
  const last = prefix >= 31 ? broadcast : broadcast - 1;
  const o1 = Math.floor(x / 2 ** 24);
  const o2 = Math.floor(x / 2 ** 16) % 256;
  const klasse = o1 < 128 ? "A" : o1 < 192 ? "B" : o1 < 224 ? "C" : o1 < 240 ? "D (Multicast)" : "E (reserviert)";
  const privat = o1 === 10 || (o1 === 172 && o2 >= 16 && o2 <= 31) || (o1 === 192 && o2 === 168);
  return {
    ip: addr,
    cidr: prefix,
    maske: ipToString(mask),
    wildcard: ipToString(size - 1),
    netzadresse: ipToString(network),
    broadcast: ipToString(broadcast),
    erster_host: ipToString(first),
    letzter_host: ipToString(last),
    anzahl_adressen: size,
    anzahl_hosts: hosts,
    ip_binaer: ipToBinary(x),
    maske_binaer: ipToBinary(mask),
    klasse: `${klasse} (historisch; heute gilt CIDR)`,
    privat,
    ...(prefix === 31 ? { hinweis: "/31: Punkt-zu-Punkt-Verbindung nach RFC 3021, beide Adressen nutzbar." } : {}),
    ...(prefix === 32 ? { hinweis: "/32: eine einzelne Adresse (Host-Route)." } : {}),
  };
}

/** Teilt ein Netz in gleich große Teilnetze mit längerem Präfix (höchstens 64 aufgelistet). */
export function splitSubnet(ip: string, cidr: number, newCidr: number): { anzahl: number; teilnetze: SubnetResult[] } {
  if (!Number.isInteger(newCidr) || newCidr <= cidr || newCidr > 32) {
    throw new CyberError("Das neue Präfix muss länger sein als das alte (z. B. /24 → /26).");
  }
  const base = calculateSubnet(ip, cidr);
  const start = parseIPv4(base.netzadresse);
  const step = 2 ** (32 - newCidr);
  const anzahl = 2 ** (newCidr - cidr);
  const teilnetze = Array.from({ length: Math.min(anzahl, 64) }, (_, i) => calculateSubnet(ipToString(start + i * step), newCidr));
  return { anzahl, teilnetze };
}

/* -------------------------------------------------------------------------- */
/* Werkzeug                                                                   */
/* -------------------------------------------------------------------------- */

const truthCell = z.union([z.literal(0), z.literal(1), z.literal("x"), z.boolean()]);

export const cyberInputSchema = z.object({
  aufgabe: z.enum([
    "caesar",
    "vigenere",
    "rsa_schluessel",
    "rsa_verschluesseln",
    "rsa_entschluesseln",
    "hash",
    "boolesch",
    "kv_diagramm",
    "subnetz",
  ]),
  richtung: z.enum(["verschluesseln", "entschluesseln"]).optional().describe("caesar/vigenere, Standard verschluesseln"),
  text: z.string().max(5000).optional().describe("caesar, vigenere, hash"),
  verschiebung: z.number().int().optional().describe("caesar: Verschiebung (3 = A→D)"),
  schluessel: z.string().max(200).optional().describe("vigenere: Schlüsselwort"),
  p: z.number().int().optional(),
  q: z.number().int().optional(),
  e: z.union([z.number().int(), z.string().regex(/^\d+$/)]).optional().describe("rsa: öffentlicher Exponent"),
  d: z.union([z.number().int(), z.string().regex(/^\d+$/)]).optional().describe("rsa: privater Exponent"),
  n: z.union([z.number().int(), z.string().regex(/^\d+$/)]).optional().describe("rsa: Modul"),
  nachricht: z
    .union([z.number().int(), z.string().regex(/^\d+$/), z.array(z.union([z.number().int(), z.string().regex(/^\d+$/)])).max(200)])
    .optional()
    .describe("rsa: Zahl(en) 0 ≤ m < n — Buchstaben vorher codieren (z. B. A=1 … Z=26)"),
  algorithmus: z.enum(HASH_ALGORITHMS).optional().describe("hash: Standard sha256"),
  ausdruck: z.string().max(300).optional().describe('boolesch/kv_diagramm: z. B. "A·B + ¬A·B + A·¬B", "(a | b) & !c", "A B\' + C"'),
  variablen: z.array(z.string().max(8)).max(8).optional().describe("Reihenfolge der Variablen (erste = höchstwertiges Bit)"),
  wahrheitstabelle: z.array(truthCell).max(256).optional().describe('Ausgabe je Zeile 0…2ⁿ−1, "x" = don\'t care'),
  ip: z.string().max(40).optional().describe('subnetz: "192.168.1.130" oder "192.168.1.130/26"'),
  cidr: z.number().int().min(0).max(32).optional(),
  neue_cidr: z.number().int().min(1).max(32).optional().describe("subnetz: in Teilnetze mit diesem Präfix aufteilen"),
});
export type CyberInput = z.infer<typeof cyberInputSchema>;

const LIMITS =
  "Abgedeckt: Caesar, Vigenère, Lehrbuch-RSA (kleine Primzahlen, ohne Padding), Hashes (MD5/SHA-1/SHA-256/SHA-512), " +
  "boolesche Minimierung (bis 8 Variablen), KV-Diagramm (2–4 Variablen), IPv4-Subnetze. NICHT abgedeckt: AES/DES, " +
  "echtes RSA mit Padding, Kryptoanalyse ohne Schlüssel, IPv6, Routing.";

export type CyberResult = { ok: true; [key: string]: unknown } | { ok: false; fehler: string; hinweis: string };

const need = <T>(v: T | undefined, name: string): T => {
  if (v === undefined || v === null || (typeof v === "string" && v === "")) throw new CyberError(`${name} fehlt.`);
  return v;
};
const s = (b: bigint) => (b <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(b) : b.toString());

function tableFrom(input: CyberInput): { variables: string[]; values: TruthValue[] } {
  if (input.ausdruck) return truthTableOf(input.ausdruck, input.variablen);
  const vars = need(input.variablen, "variablen (oder ausdruck)");
  const raw = need(input.wahrheitstabelle, "wahrheitstabelle (oder ausdruck)");
  return { variables: vars, values: raw.map((v) => (v === true ? 1 : v === false ? 0 : v)) };
}

export function solveCyber(raw: CyberInput): CyberResult {
  try {
    const input = cyberInputSchema.parse(raw);
    switch (input.aufgabe) {
      case "caesar": {
        const text = need(input.text, "text");
        const k = need(input.verschiebung, "verschiebung");
        const dec = input.richtung === "entschluesseln";
        const out = dec ? caesarDecipher(text, k) : caesarCipher(text, k);
        if ((dec ? caesarCipher(out, k) : caesarDecipher(out, k)) !== text) throw new CyberError("Interne Probe nicht erfüllt.");
        return {
          ok: true,
          ergebnis: out,
          verschiebung: k,
          alphabet_klar: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
          alphabet_geheim: caesarCipher("ABCDEFGHIJKLMNOPQRSTUVWXYZ", k),
          hinweis: "Nur A–Z werden verschoben; Umlaute, Ziffern und Satzzeichen bleiben. 26 mögliche Schlüssel: per Brute Force sofort knackbar.",
        };
      }
      case "vigenere": {
        const text = need(input.text, "text");
        const key = need(input.schluessel, "schluessel");
        const dec = input.richtung === "entschluesseln";
        const out = dec ? vigenereDecipher(text, key) : vigenereCipher(text, key);
        if ((dec ? vigenereCipher(out, key) : vigenereDecipher(out, key)) !== text) throw new CyberError("Interne Probe nicht erfüllt.");
        return {
          ok: true,
          ergebnis: out,
          schluessel: key.toUpperCase(),
          verschiebungen: vigenereShifts(key),
          hinweis: "Der Schlüssel rückt nur bei Buchstaben weiter. Schwäche: Wiederholung des Schlüssels (Kasiski-Test, Friedman-Test).",
        };
      }
      case "rsa_schluessel": {
        const k = generateRSAKeys(need(input.p, "p"), need(input.q, "q"), input.e === undefined ? undefined : Number(input.e));
        return {
          ok: true,
          n: s(k.n),
          phi: s(k.phi),
          e: s(k.e),
          d: s(k.d),
          oeffentlicher_schluessel: `(e, n) = (${k.e}, ${k.n})`,
          privater_schluessel: `(d, n) = (${k.d}, ${k.n})`,
          euklid: k.euklid,
          probe: `e·d mod φ(n) = ${(k.e * k.d) % k.phi}`,
          warnung: "Lehrbuch-RSA: kleine Primzahlen und kein Padding — nie für echte Daten.",
        };
      }
      case "rsa_verschluesseln":
      case "rsa_entschluesseln": {
        const n = need(input.n, "n");
        const msgs = [need(input.nachricht, "nachricht")].flat();
        const enc = input.aufgabe === "rsa_verschluesseln";
        const exp = enc ? need(input.e, "e") : need(input.d, "d");
        const results = msgs.map((m) => {
          const out = enc ? rsaEncrypt(BigInt(m), BigInt(exp), BigInt(n)) : rsaDecrypt(BigInt(m), BigInt(exp), BigInt(n));
          return { ein: String(m), aus: s(out), rechnung: `${m}^${exp} mod ${n} = ${out}` };
        });
        // Probe, wenn beide Exponenten bekannt sind.
        if (input.e !== undefined && input.d !== undefined) {
          for (const r of results) {
            const back = enc ? rsaDecrypt(BigInt(r.aus), BigInt(input.d), BigInt(n)) : rsaEncrypt(BigInt(r.aus), BigInt(input.e), BigInt(n));
            if (String(back) !== r.ein) throw new CyberError("Probe: Entschlüsseln liefert nicht die Nachricht — e, d, n passen nicht zusammen.");
          }
        }
        return { ok: true, ergebnisse: results, warnung: "Lehrbuch-RSA ohne Padding — nie für echte Daten." };
      }
      case "hash": {
        const text = need(input.text, "text");
        const algo = input.algorithmus ?? "sha256";
        return {
          ok: true,
          algorithmus: algo,
          hash_hex: hashText(text, algo),
          bits: { md5: 128, sha1: 160, sha256: 256, sha512: 512 }[algo],
          eingabe_bytes: Buffer.byteLength(text, "utf8"),
          ...(algo === "md5" || algo === "sha1"
            ? { warnung: `${algo.toUpperCase()} gilt als gebrochen (Kollisionen) — nicht für Sicherheit verwenden.` }
            : {}),
          hinweis: "Passwörter nie mit einem schnellen Hash speichern: bcrypt, scrypt oder Argon2 mit Salt.",
        };
      }
      case "boolesch": {
        const { variables, values } = tableFrom(input);
        const r = input.ausdruck ? simplifyBoolean(input.ausdruck, variables) : minimizeTruthTable(variables, values);
        return { ok: true, ...r, verfahren: "Quine-McCluskey, exakte Überdeckung; Probe über die Wahrheitstabelle" };
      }
      case "kv_diagramm": {
        const { variables, values } = tableFrom(input);
        return { ok: true, ...generateKarnaughMap(variables, values) };
      }
      case "subnetz": {
        const ip = need(input.ip, "ip");
        const base = calculateSubnet(ip, input.cidr);
        if (input.neue_cidr !== undefined) {
          const split = splitSubnet(base.netzadresse, base.cidr, input.neue_cidr);
          return { ok: true, ...base, teilnetze_anzahl: split.anzahl, teilnetze: split.teilnetze.map((t) => `${t.netzadresse}/${t.cidr} (Hosts ${t.erster_host} – ${t.letzter_host}, Broadcast ${t.broadcast})`) };
        }
        return { ok: true, ...base };
      }
    }
  } catch (err) {
    if (err instanceof CyberError) return { ok: false, fehler: err.message, hinweis: LIMITS };
    if (err instanceof z.ZodError) return { ok: false, fehler: `Eingabe ungültig: ${err.issues[0]?.message ?? "?"}`, hinweis: LIMITS };
    throw err;
  }
}
