/**
 * `schaltung_berechnen` mit Sperre und exakter Probe:
 *
 *   Netzliste bestätigt? (netlist.ts) → solveCircuit (Gleitkomma, MNA)
 *   → proveCircuit (Bruchrechnung, unabhängig) → Ergebnis.
 *
 * Besteht die exakte Probe nicht, verlässt KEIN Zahlenwert dieses Modul:
 * das Modell bekommt ok:false und muss die Netzliste prüfen und neu erfassen.
 */
import { z } from "zod";
import { circuitInputSchema, parseSi, solveCircuit, type CircuitFailure, type CircuitResult } from "../solvers/solveCircuit";
import { checkGate, type NetlistGate } from "./netlist";
import { proveCircuit, type CircuitProof } from "./proof";

export const schaltungBerechnenSchema = circuitInputSchema.extend({
  netzliste_id: z
    .string()
    .regex(/^n-[0-9a-f]{8}$/)
    .optional()
    .describe("Kennung der von der Person BESTÄTIGTEN Netzliste (aus schaltplan_erfassen). Pflicht, wenn ein Schaltplan als Bild/PDF vorliegt."),
});

export type SchaltungBerechnenInput = z.infer<typeof schaltungBerechnenSchema>;

export type CircuitPipelineResult =
  | (CircuitResult & { netzliste_id?: string; beweis: CircuitProof; freie_werte?: FreeValueReport })
  | CircuitFailure
  | { ok: false; fehler: string; anweisung: string };

export function runCircuitPipeline(raw: SchaltungBerechnenInput, gate?: NetlistGate): CircuitPipelineResult {
  const parsed = schaltungBerechnenSchema.safeParse(raw);
  if (!parsed.success) {
    const r = solveCircuit(raw);
    // Même message d'erreur que le solveur ; un succès ici ne peut venir que
    // d'une kennung mal formée : on la refuse.
    return r.ok ? { ok: false, fehler: "netzliste_id_ungueltig", anweisung: "netzliste_id hat die Form n-xxxxxxxx (aus schaltplan_erfassen)." } : r;
  }
  const { netzliste_id, ...input } = parsed.data;

  const decision = checkGate(gate, { ...input, netzliste_id });
  if (!decision.ok) return decision;

  const result = solveCircuit(input);
  if (!result.ok) return result;

  const beweis = proveCircuit(input, result);
  if (beweis.exakt && !beweis.bestanden) {
    return {
      ok: false,
      fehler: "exakte_probe_gescheitert",
      anweisung:
        "Die exakte Nachrechnung (Bruchrechnung) bestätigt das Ergebnis NICHT. Nenne keine Zahl. Prüfe die Netzliste " +
        "(Einheiten, Größenordnungen der Werte, Knoten) und erfasse sie neu; sag der Person ehrlich, dass du nachprüfst.",
    };
  }
  // Composants sans valeur dans l'énoncé : comptent-ils pour ce qui est demandé ?
  const frei = (netzliste_id ? gate?.confirmed.get(netzliste_id)?.frei : undefined) ?? [];
  const freie_werte = frei.length ? freeValueInfluence(input, result, frei) : null;
  return { ...result, ...(netzliste_id ? { netzliste_id } : {}), beweis, ...(freie_werte ? { freie_werte } : {}) };
}

export interface FreeValueReport {
  /** Bauteile ohne Wert in der Aufgabe. */
  namen: string[];
  /** Spannung und Strom dieser Bauteile hängen NICHT von den freien Werten ab. */
  unabhaengig: string[];
  /** Diese hängen davon ab: ihre Zahlen oben sind NICHT gültig. */
  abhaengig: string[];
  anweisung: string;
}

const near = (x: number, y: number) => Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));

/**
 * Zweite Rechnung mit anderen Werten für die freien Bauteile: was sich nicht
 * ändert, hängt nachweislich nicht von ihnen ab (z. B. ein Widerstand in Reihe
 * mit einer idealen Stromquelle). So muss niemand nach einem Wert gefragt
 * werden, den die Aufgabe absichtlich weglässt — und kein angenommener Wert
 * gelangt als Ergebnis nach außen.
 */
export function freeValueInfluence(input: z.infer<typeof circuitInputSchema>, first: CircuitResult, frei: string[]): FreeValueReport | null {
  const names = frei.filter((n) => input.elemente.some((e) => e.name === n && "wert" in e));
  if (!names.length) return null;
  const varied = {
    ...input,
    elemente: input.elemente.map((e, i) => (names.includes(e.name) && "wert" in e ? { ...e, wert: parseSi(e.wert) * (7 + i) + 3 } : e)),
  };
  const second = solveCircuit(varied);
  if (!second.ok) return null;
  const unabhaengig: string[] = [];
  const abhaengig: string[] = [];
  for (const el of first.elemente) {
    const other = second.elemente.find((o) => o.name === el.name);
    const same = !!other && near(el.spannung.re, other.spannung.re) && near(el.spannung.im, other.spannung.im) && near(el.strom.re, other.strom.re) && near(el.strom.im, other.strom.im);
    (same ? unabhaengig : abhaengig).push(el.name);
  }
  const list = names.join(", ");
  return {
    namen: names,
    unabhaengig,
    abhaengig,
    anweisung:
      `Die Aufgabe gibt keinen Wert für ${list}. Der Code hat mit zwei verschiedenen Werten gerechnet. ` +
      `Spannung und Strom von ${unabhaengig.join(", ") || "keinem Bauteil"} bleiben gleich: diese Zahlen gelten, nenne sie und ERKLÄRE, warum ${list} hier keine Rolle spielt ` +
      "(z. B. Reihenschaltung mit idealer Stromquelle: der Strom ist eingeprägt; oder kein Strom durch den Zweig). " +
      (abhaengig.length
        ? `Von ${list} abhängig sind: ${abhaengig.join(", ")}. Nenne für diese KEINE Zahl aus dieser Rechnung; gib sie als Formel mit ${list} an und sag offen, dass die Aufgabe dafür den Wert bräuchte. `
        : `Nichts hängt von ${list} ab. `) +
      `Frag die Person nicht nach ${list}.`,
  };
}
