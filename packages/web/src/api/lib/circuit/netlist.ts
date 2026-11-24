/**
 * Schaltplan → Netzliste → Bestätigung → Rechnung.
 *
 * Brief des Gründers vom 17. Nov. 2026: der Tutor hat auf einem Schaltplan R1,
 * R2, R3 und R4 verwechselt. Die Rechnung selbst war nie das Problem
 * (`schaltung_berechnen` rechnet exakt), das LESEN des Bildes war es: das
 * Modell hat Bauteile falsch zugeordnet und sofort weitergerechnet.
 *
 * Deshalb drei Schritte, jeder durch Code erzwungen:
 *
 *   1. `schaltplan_erfassen`: das Modell schreibt die Netzliste auf, die es im
 *      Bild liest (Bauteile aus dem Katalog, Knoten, Werte). `checkNetlist`
 *      prüft den Aufbau (doppelte Namen, Bauteil an einem einzigen Knoten,
 *      fehlende Masse, getrennte Teilnetze, offene Enden) und vergibt eine
 *      Kennung `n-xxxxxxxx`, die aus dem INHALT berechnet wird.
 *   2. Die Tafel zeigt diese Netzliste (Tabelle + Knotengraph). Die oder der
 *      Studierende vergleicht mit dem eigenen Bild und bestätigt — per Knopf
 *      („✓ Netzliste n-… stimmt“) oder mit einer kurzen Zusage als nächste
 *      Nachricht („ja“, „stimmt“ …).
 *   3. `schaltung_berechnen` rechnet in einem Gespräch mit Bild oder PDF NUR
 *      eine bestätigte Netzliste: ohne Kennung, mit fremder Kennung oder mit
 *      einer nach der Bestätigung veränderten Liste antwortet es ok:false.
 *
 * Ohne Anhang im Gespräch (Aufgabe als Text) gilt die Sperre nicht: dort gibt
 * es kein Bild, das falsch gelesen werden könnte.
 *
 * Modul rein, ohne Abhängigkeit außer zod: Server und Browser lesen es.
 */
import { z } from "zod";
import { circuitElementSchema, parseSi, type CircuitElement } from "../solvers/solveCircuit";
import { COMPONENTS, isComponentType } from "./catalog";

export const schaltplanInputSchema = z.object({
  quelle: z.enum(["bild", "pdf", "text"]).describe("Woher die Schaltung stammt"),
  elemente: z.array(circuitElementSchema).min(1).max(60),
  masse: z.string().max(20).optional().describe('Bezugsknoten, Standard "0"'),
  unklar: z
    .array(z.string().min(1).max(120))
    .max(10)
    .optional()
    .describe('Was im Bild nicht sicher lesbar war, z. B. "Wert von R3 verdeckt". Lieber nennen als raten.'),
  frei: z
    .array(z.string().min(1).max(20))
    .max(20)
    .optional()
    .describe("Bauteile, deren Wert die Aufgabe NICHT angibt. Beim Rechnen prüft der Code, ob sie das Ergebnis beeinflussen."),
  plan: z
    .record(z.string().max(20), z.tuple([z.number().int(), z.number().int(), z.number().int(), z.number().int()]))
    .optional()
    .describe("Lage im Bild, vom Code gesetzt: Bauteil → [ax, ay, bx, by] auf einem Raster. Nicht selbst ausfüllen."),
});

/** Lage eines Bauteils im Bild: Rasterpunkte seiner Anschlüsse a und b. */
export type PlanEntry = [number, number, number, number];

export type SchaltplanInput = z.infer<typeof schaltplanInputSchema>;

export interface NetlistView {
  id: string;
  quelle: SchaltplanInput["quelle"];
  masse: string;
  elemente: CircuitElement[];
  knoten: string[];
  unklar: string[];
  hinweise: string[];
  /** Bauteile ohne Wert in der Aufgabe (lib/circuit/pipeline.ts prüft ihren Einfluss). */
  frei?: string[];
  /** Lage der Bauteile im Bild: die Tafel zeichnet den Schaltplan so, wie er auf dem Foto steht. */
  plan?: Record<string, PlanEntry>;
}

export type NetlistCheck =
  | ({ ok: true; anweisung: string } & NetlistView)
  | { ok: false; probleme: string[]; anweisung: string };

const terminals = (el: CircuitElement): string[] => (el.typ === "OPV" ? [el.plus, el.minus, el.aus] : [el.a, el.b]);

/** Ein Wert in fester Form: 4700, "4.7k", "4,7 kΩ" ergeben dieselbe Kennung. */
function canonicalValue(v: number | string): number | string {
  try {
    return Number(parseSi(v).toPrecision(12));
  } catch {
    return String(v);
  }
}

function canonicalElement(el: CircuitElement): Record<string, unknown> {
  switch (el.typ) {
    case "R":
    case "L":
    case "C":
      return { typ: el.typ, name: el.name, a: el.a, b: el.b, wert: canonicalValue(el.wert) };
    case "Z":
      return { typ: el.typ, name: el.name, a: el.a, b: el.b, re: el.re, im: el.im };
    case "V":
    case "I":
      return { typ: el.typ, name: el.name, a: el.a, b: el.b, wert: canonicalValue(el.wert), phase: el.phase ?? 0 };
    case "OPV":
      return { typ: el.typ, name: el.name, plus: el.plus, minus: el.minus, aus: el.aus };
  }
}

/** FNV-1a, 32 Bit: kurz, stabil, gleich in Bun und im Browser. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Kennung aus dem Inhalt: Reihenfolge der Elemente egal, Schreibweise der
 * Werte egal — aber jeder vertauschte Knoten, jeder geänderte Wert ergibt
 * eine andere Kennung.
 */
export function netlistId(input: { elemente: CircuitElement[]; masse?: string }): string {
  const els = input.elemente.map(canonicalElement).sort((x, y) => String(x.name).localeCompare(String(y.name)));
  return `n-${fnv1a(JSON.stringify({ masse: input.masse ?? "0", els }))}`;
}

export const NETLIST_ID_RE = /\bn-[0-9a-f]{8}\b/;

export function checkNetlist(raw: SchaltplanInput): NetlistCheck {
  const parsed = schaltplanInputSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      probleme: [`Eingabe ungültig (${issue?.path.join(".") || "?"}): ${issue?.message ?? "?"}. Erlaubte Bauteile: ${Object.keys(COMPONENTS).join(", ")}.`],
      anweisung: ANWEISUNG_FEHLER,
    };
  }
  const input = parsed.data;
  const masse = input.masse ?? "0";
  const probleme: string[] = [];
  const hinweise: string[] = [];

  const names = new Map<string, number>();
  for (const el of input.elemente) {
    if (!isComponentType(el.typ)) probleme.push(`${el.name}: Bauteiltyp "${el.typ}" steht nicht im Katalog.`);
    names.set(el.name, (names.get(el.name) ?? 0) + 1);
    const t = terminals(el);
    if (new Set(t).size < t.length) probleme.push(`${el.name}: zwei Anschlüsse am selben Knoten "${t.find((n, i) => t.indexOf(n) !== i)}".`);
    if ("wert" in el) {
      try {
        parseSi(el.wert);
      } catch {
        probleme.push(`${el.name}: Wert "${el.wert}" nicht lesbar.`);
      }
    }
  }
  for (const [n, count] of names) if (count > 1) probleme.push(`Bauteilname doppelt: ${n} (${count}×). Jedes Bauteil braucht seinen eigenen Namen wie im Schaltplan.`);

  // Knoten: wie oft angeschlossen?
  const degree = new Map<string, number>();
  for (const el of input.elemente) for (const n of terminals(el)) degree.set(n, (degree.get(n) ?? 0) + 1);
  const knoten = [...degree.keys()].sort((a, b) => (a === masse ? -1 : b === masse ? 1 : a.localeCompare(b, "de", { numeric: true })));
  if (!degree.has(masse)) probleme.push(`Kein Bauteil ist an der Masse "${masse}" angeschlossen.`);
  for (const [n, d] of degree) {
    if (d === 1) hinweise.push(`Knoten "${n}" hat nur einen Anschluss: offene Klemme oder fehlt eine Verbindung?`);
  }

  // Zusammenhang: ein Schaltplan ist EIN Netz.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    while (parent.has(x) && parent.get(x) !== x) x = parent.get(x)!;
    return x;
  };
  for (const n of degree.keys()) parent.set(n, n);
  for (const el of input.elemente) {
    const t = terminals(el);
    for (let i = 1; i < t.length; i++) parent.set(find(t[i]), find(t[0]));
  }
  const roots = new Set([...degree.keys()].map(find));
  if (roots.size > 1) probleme.push(`Die Netzliste zerfällt in ${roots.size} getrennte Teile: eine Verbindung fehlt oder ein Knoten ist falsch benannt.`);

  if (probleme.length) return { ok: false, probleme, anweisung: ANWEISUNG_FEHLER };
  const unklar = input.unklar ?? [];
  return {
    ok: true,
    id: netlistId({ elemente: input.elemente, masse }),
    quelle: input.quelle,
    masse,
    elemente: input.elemente,
    knoten,
    unklar,
    hinweise,
    ...(input.frei?.length ? { frei: input.frei.filter((n) => names.has(n)) } : {}),
    ...(input.plan ? { plan: input.plan } : {}),
    anweisung: ANWEISUNG_OK,
  };
}

const ANWEISUNG_OK =
  "Die Netzliste steht jetzt auf der Tafel (Tabelle und Knotengraph, vom Code gezeichnet). Schreib sie NICHT noch einmal ab. " +
  "Bitte die Person in IHRER Sprache, sie mit ihrem Schaltplan zu vergleichen (jedes Bauteil: zwischen welchen Knoten, welcher Wert) " +
  "und zu bestätigen oder zu korrigieren. Nenne die Punkte aus `unklar` und `hinweise` ausdrücklich. RECHNE NOCH NICHTS: keine Ströme, " +
  "keine Spannungen, keine Ersatzwiderstände, bis die Bestätigung da ist. Danach schaltung_berechnen mit genau diesen elementen und netzliste_id.";

const ANWEISUNG_FEHLER =
  "Die Netzliste ist so nicht schlüssig. Schau dir den Schaltplan noch einmal an, korrigiere die genannten Punkte und ruf " +
  "schaltplan_erfassen erneut auf. Ist eine Stelle im Bild nicht lesbar, trag sie in `unklar` ein, statt zu raten.";

/* -------------------------------------------------------------------------- */
/* Sperre: was das Gespräch erlaubt                                           */
/* -------------------------------------------------------------------------- */

interface PartLike {
  type?: string;
  text?: string;
  mediaType?: string;
  state?: string;
  toolName?: string;
  output?: unknown;
}
interface MessageLike {
  role?: string;
  parts?: unknown[];
}

export interface NetlistGate {
  /** Im Gespräch liegt ein Bild oder PDF: rechnen nur mit bestätigter Netzliste. */
  required: boolean;
  /** Bestätigte Netzlisten, nach Kennung. */
  confirmed: Map<string, NetlistView>;
  /** Die LETZTE Nachricht der Person bestätigt genau diese Netzliste: jetzt wird gerechnet. */
  justConfirmed?: NetlistView | null;
}

/** Der Knopf auf der Tafel schickt „✓ Netzliste n-… stimmt …“. */
const CONFIRM_RE = /✓\s*(?:\S+\s+)?(n-[0-9a-f]{8})/;
/**
 * Eine kurze Zusage direkt nach der Netzliste zählt auch (getippt, mobile
 * App): „ja“, „stimmt so“, „passt“, „oui c'est bon“. Sobald ein Einwand
 * darin steckt („ja, aber R3 …“), ist es keine Bestätigung.
 */
const YES_START = /^\s*(?:ja|jo|jep|yes|yep|oui|si|sí|ok|okay|stimmt|passt|korrekt|richtig|genau|correct|exact|exactement|exacto|correcto)(?![\p{L}])/iu;
const OBJECTION = /\b(?:nein|nicht|aber|falsch|fehlt|no|not|but|wrong|non|pas|mais|faux|pero)\b|\d/i;
const isShortYes = (text: string) => text.trim().length <= 60 && YES_START.test(text) && !OBJECTION.test(text);
/** Aus der Bildschirm-Anzeige alter Anhänge (lib/chat-attachments.ts). */
const OLD_ATTACHMENT = "[Anhang aus einer früheren Nachricht]";

const isNetlistPart = (p: PartLike) =>
  (p.type === "tool-schaltplan_erfassen" || (p.type === "dynamic-tool" && p.toolName === "schaltplan_erfassen")) &&
  p.state === "output-available";

function asView(output: unknown): NetlistView | null {
  const o = output as Partial<NetlistView> & { ok?: boolean };
  if (!o || o.ok !== true || typeof o.id !== "string" || !Array.isArray(o.elemente)) return null;
  // Die Kennung wird NEU berechnet: eine Liste, deren Inhalt nicht zu ihrer
  // Kennung passt, wird nicht anerkannt.
  if (netlistId({ elemente: o.elemente, masse: o.masse }) !== o.id) return null;
  return o as NetlistView;
}

const userText = (m: MessageLike) =>
  (m.parts ?? [])
    .map((p) => p as PartLike)
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("\n");

/**
 * Liest aus dem Gesprächsverlauf: liegt ein Anhang vor, welche Netzlisten
 * hat das Modell erfasst, welche davon wurden bestätigt.
 */
export function netlistGate(messages: unknown[]): NetlistGate {
  let required = false;
  const seen = new Map<string, NetlistView>();
  const confirmed = new Map<string, NetlistView>();
  let pending: string | null = null;
  let justConfirmed: NetlistView | null = null;

  for (const raw of messages) {
    const m = raw as MessageLike;
    const parts = (m?.parts ?? []).map((p) => p as PartLike);
    if (m?.role === "user") {
      if (parts.some((p) => p.type === "file" && (String(p.mediaType ?? "").startsWith("image/") || p.mediaType === "application/pdf"))) required = true;
      const text = userText(m);
      if (text.includes(OLD_ATTACHMENT)) required = true;
      const explicit = CONFIRM_RE.exec(text)?.[1];
      justConfirmed = null;
      if (explicit && seen.has(explicit)) justConfirmed = seen.get(explicit)!;
      else if (pending && isShortYes(text)) justConfirmed = seen.get(pending)!;
      if (justConfirmed) confirmed.set(justConfirmed.id, justConfirmed);
      pending = null;
    } else if (m?.role === "assistant") {
      for (const p of parts) {
        if (!isNetlistPart(p)) continue;
        const view = asView(p.output);
        if (view) {
          seen.set(view.id, view);
          pending = view.id;
        }
      }
    }
  }
  return { required, confirmed, justConfirmed };
}

export type GateDecision = { ok: true } | { ok: false; fehler: string; anweisung: string };

const sameElement = (x: CircuitElement, y: CircuitElement) =>
  JSON.stringify(canonicalElement(x)) === JSON.stringify(canonicalElement(y));

/**
 * Darf `schaltung_berechnen` diese Eingabe rechnen?
 * Mit `thevenin` darf die Last fehlen: die Elemente müssen dann eine
 * Teilmenge der bestätigten Liste sein, unverändert.
 */
export function checkGate(
  gate: NetlistGate | undefined,
  input: { elemente: CircuitElement[]; masse?: string; netzliste_id?: string; thevenin?: unknown },
): GateDecision {
  if (!gate?.required) return { ok: true };
  const id = input.netzliste_id;
  if (!id) {
    return {
      ok: false,
      fehler: "netzliste_fehlt",
      anweisung:
        "In diesem Gespräch liegt ein Schaltplan als Bild/PDF. Zuerst schaltplan_erfassen aufrufen, die Bestätigung der Person abwarten, " +
        "dann schaltung_berechnen mit netzliste_id. Bis dahin keine Zahlen nennen.",
    };
  }
  const ok = gate.confirmed.get(id);
  if (!ok) {
    return {
      ok: false,
      fehler: "netzliste_nicht_bestaetigt",
      anweisung:
        `Die Netzliste ${id} ist (noch) nicht bestätigt. Bitte die Person, sie auf der Tafel zu prüfen und zu bestätigen. ` +
        "Rechne nichts, bis die Bestätigung da ist.",
    };
  }
  const exact = netlistId({ elemente: input.elemente, masse: input.masse }) === id;
  const subset =
    input.thevenin !== undefined &&
    (input.masse ?? "0") === ok.masse &&
    input.elemente.every((el) => ok.elemente.some((c) => sameElement(el, c)));
  if (exact || subset) return { ok: true };
  return {
    ok: false,
    fehler: "netzliste_veraendert",
    anweisung:
      `Die Elemente weichen von der bestätigten Netzliste ${id} ab. Rechne GENAU die bestätigte Liste. ` +
      "Hat sich etwas geändert, ruf schaltplan_erfassen mit der neuen Liste auf und lass sie bestätigen.",
  };
}
