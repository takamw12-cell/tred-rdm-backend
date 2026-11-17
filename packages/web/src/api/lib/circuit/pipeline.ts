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
import { circuitInputSchema, solveCircuit, type CircuitFailure, type CircuitResult } from "../solvers/solveCircuit";
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
  | (CircuitResult & { netzliste_id?: string; beweis: CircuitProof })
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
  return { ...result, ...(netzliste_id ? { netzliste_id } : {}), beweis };
}
