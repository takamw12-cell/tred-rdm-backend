/**
 * Lecture d'un schéma électrique photographié : deux lectures indépendantes
 * par le modèle de vision, comparées par le code.
 *
 * ── Pourquoi (mesure du 24 nov. 2026) ──────────────────────────────────────
 *
 * Photo d'« Aufgabe 13 » (trois sources de courant, photo tournée de 90°). Le
 * tuteur (modèle principal) a placé R2 et les sources au mauvais endroit, sur
 * la photo d'origine comme sur la photo redressée. Le modèle de vision
 * (VISION_AI_MODEL, lib/ai-models.ts) a rendu la bonne netlist trois fois sur
 * trois, photo tournée comprise.
 *
 * Une lecture juste trois fois n'est pas une lecture juste toujours. D'où :
 *
 *   1. DEUX lectures du même fichier, lancées en parallèle, sans se voir ;
 *   2. `compareReadings` : mêmes composants, mêmes valeurs, mêmes connexions
 *      — au nom des nœuds près, chaque lecture nomme les siens ;
 *   3. d'accord → le tuteur reçoit cette netlist et la reporte telle quelle
 *      dans `schaltplan_erfassen` ; pas d'accord → il reçoit les deux et les
 *      composants en litige, ne calcule rien et fait vérifier ces connexions.
 *
 * La confirmation par l'étudiant (lib/circuit/netlist.ts) reste le dernier
 * contrôle : rien n'est calculé sur une netlist non confirmée.
 *
 * Une lecture en échec (délai, modèle indisponible) ne bloque rien : le
 * tuteur lit l'image lui-même, comme avant.
 */
import { generateObject } from "ai";
import { z } from "zod";
import { gateway } from "../../agent/gateway";
import { VISION_MODEL } from "../ai-models";
import { dataUrlBytes } from "../chat-attachments";
import { parseSi, siFormat, solveCircuit, type CircuitElement } from "../solvers/solveCircuit";
import type { PlanEntry, SchaltplanInput, SwitchEntry } from "./netlist";

const node = z.string().min(1).max(20);

export const schematicReadingSchema = z.object({
  istSchaltplan: z.boolean().describe("true nur, wenn das Bild einen elektrischen Schaltplan zeigt"),
  elemente: z
    .array(
      z.object({
        typ: z.enum(["R", "L", "C", "V", "I"]),
        name: z.string().min(1).max(20).describe("Name wie im Plan: R1, U1, I2, C …"),
        a: node.describe("V: Pluspol. I: Knoten, IN den der Strom fließt (Pfeilspitze). Sonst: erster Anschluss"),
        b: node,
        wert: z.string().max(40).describe('Wert aus der Aufgabe mit Präfix, ohne Einheit: "1", "50k", "100u". Unbekannt: ""'),
      }),
    )
    .max(60),
  lage: z
    .array(z.object({ name: z.string().min(1).max(20), ax: z.number().int(), ay: z.number().int(), bx: z.number().int(), by: z.number().int() }))
    .max(60)
    .describe("Wo jedes Bauteil im aufgerichteten Bild liegt: Rasterpunkte seiner Anschlüsse a und b"),
  schalter: z
    .array(
      z.object({
        name: z.string().min(1).max(20).describe("Name wie im Plan, sonst S"),
        gemeinsam: node.describe("Knoten am beweglichen (gemeinsamen) Anschluss"),
        gx: z.number().int().describe("Rasterpunkt des gemeinsamen Anschlusses (wie lage)"),
        gy: z.number().int(),
        stellungen: z
          .array(
            z.object({
              name: z.string().min(1).max(20).describe('Wie im Plan beschriftet: "1", "2", "a" … Ein-/Ausschalter: "zu"'),
              kontakt: node.describe("Knoten, mit dem der gemeinsame Anschluss in dieser Stellung verbunden ist"),
              x: z.number().int().describe("Rasterpunkt dieses Kontakts (wie lage)"),
              y: z.number().int(),
            }),
          )
          .min(1)
          .max(4),
      }),
    )
    .max(6)
    .describe("Jeder Schalter mit seinen Stellungen. Ein Schalter verbindet NIE von selbst zwei Knoten: seine Kontakte sind getrennte Knoten."),
  andere: z
    .array(z.string().min(1).max(300))
    .max(20)
    .describe(
      "Bauteile außerhalb von R, L, C, V, I und Schalter — Diode, OPV, Messgerät, Transformator — je ein Eintrag MIT Knoten. " +
        "KEIN Bauteil und deshalb NICHT hier: offene Klemmen, Spannungs- und Strompfeile (Ua, Uc, IG), Beschriftungen.",
    ),
  // ── Les données de l'énoncé que la netlist ne porte pas ────────────────
  // Relecture critique du 24 nov. 2026 : « Aufgabe 18 » passait pour juste
  // sans sa fréquence (50 Hz), sans « ~ » (source alternative) et sans la
  // donnée de l'exercice (Uc = 5 V). Sans elles, le calcul est impossible.
  frequency: z.number().nullable().describe("Frequenz in Hz, wenn die Aufgabe eine nennt (50). Sonst null."),
  source_type: z.enum(["DC", "AC", "unbekannt"]).describe('Quellensymbol: "=" oder Batterie → DC; "~" → AC; keine Quelle gezeichnet → unbekannt'),
  given_values: z
    .array(z.object({ name: z.string().min(1).max(20).describe("Formelzeichen wie in der Aufgabe: Uc, n1, cosφ"), wert: z.string().min(1).max(40).describe('Zahl mit Präfix, ohne Einheit: "5", "10m", "300"'), einheit: z.string().max(12).describe('"V", "H", "" …') }))
    .max(20)
    .describe("Zahlenwerte aus dem Aufgabentext, die KEIN Wert eines Bauteils in elemente sind: Uc = 5V, n1 = 300, L1 = 10mH. Keine Frequenz (steht in frequency), keine Zeitpunkte."),
  // Dans le doute, ne pas deviner (demande du fondateur, 24 nov. 2026) : une
  // flèche petite ou floue est nommée ici, et l'étudiant confirme son sens.
  uncertain_directions: z
    .array(z.string().min(1).max(20))
    .max(20)
    .describe("Namen der Quellen (V, I), deren Pfeil- bzw. Polrichtung im Bild NICHT sicher erkennbar ist (klein, unscharf, verdeckt). Sicher erkennbar: leer."),
  // Bornes larges : une remarque trop longue ne doit pas faire rejeter une lecture juste.
  unklar: z.array(z.string().min(1).max(400)).max(20).describe("Was nicht sicher lesbar ist, je ein kurzer Stichpunkt. Lieber nennen als raten."),
});

export type SchematicReading = z.infer<typeof schematicReadingSchema>;
export type ReadElement = SchematicReading["elemente"][number];

export const READ_PROMPT =
  "Lies den Schaltplan im Bild als Netzliste. Das Foto kann gedreht oder schräg sein: richte dich nach der Schrift.\n" +
  "Regeln:\n" +
  "- Ein Knoten = alles, was durch Leitungen direkt verbunden ist. Gib jedem Knoten einen Namen (K1, K2 …); den Minuspol der Hauptquelle nennst du \"0\".\n" +
  "- Verfolge jede Leitung von Anschluss zu Anschluss. Zwei Bauteile hintereinander im selben Zweig haben einen EIGENEN Knoten zwischen sich.\n" +
  "- Spannungsquelle: a = Pluspol. Der Spannungspfeil zeigt von Plus nach Minus.\n" +
  "- Stromquelle: der Strom fließt von b nach a (a = Knoten an der Pfeilspitze).\n" +
  "- Werte aus dem Aufgabentext übernehmen (\"R1 = R2 = 1Ω\" gilt für beide). Kein Wert angegeben: wert = \"\" und in unklar nennen.\n" +
  "- Rate nichts. Was du nicht sicher siehst, steht in unklar: höchstens drei kurze Stichpunkte.\n" +
  "- Offene Klemmen (kleine Kreise) und Zählpfeile (Ua, Uc, IG …) sind KEINE Bauteile: weder in elemente noch in andere. " +
  "Eine Eingangsspannung an offenen Klemmen MIT Wert im Text (\"Ue = 10V\") ist eine Spannungsquelle zwischen diesen Klemmen.\n" +
  "- frequency: die Frequenz in Hz, wenn die Aufgabe eine nennt (\"50Hz\", \"f = 50Hz\"), sonst null. " +
  "source_type: \"~\" im Quellensymbol → AC, \"=\" oder Batterie → DC, keine Quelle gezeichnet → unbekannt.\n" +
  "- given_values: JEDER Zahlenwert aus der Zeile \"Werte:\" und dem Aufgabentext, der nicht schon wert eines Bauteils ist " +
  "(\"Uc = 5V\" → name Uc, wert 5, einheit V; Windungszahlen n1, n2; L1 eines Transformators). Keine Frequenz, keine Zeitpunkte (t0, t1).\n" +
  "- uncertain_directions: Ist bei einer Quelle die Pfeilspitze oder der Pluspol nicht EINDEUTIG zu erkennen (zu klein, unscharf, verdeckt), " +
  "trag ihren Namen hier ein und gib in elemente die wahrscheinlichste Richtung an. Rate nie stillschweigend.\n" +
  "- Kein Schaltplan im Bild: istSchaltplan = false, elemente leer.\n" +
  "- Schalter: nicht in elemente, sondern in schalter. Gemeinsamer Anschluss und jeder Kontakt sind EIGENE Knoten; " +
  "die Stellung heißt wie im Plan beschriftet (1, 2 …). Lies genau ab, welcher Kontakt welche Nummer trägt. " +
  "Gib auch die Rasterpunkte an (selbes Raster wie lage): (gx, gy) für den gemeinsamen Anschluss, (x, y) für jeden Kontakt. " +
  "Jeder Kontakt liegt 1 Rastereinheit vom gemeinsamen Anschluss entfernt, in der Richtung wie im Bild; kein Punkt liegt auf einem Bauteil.\n" +
  "- lage: wo jedes Bauteil im AUFGERICHTETEN Bild liegt (Schrift waagerecht lesbar), auf einem groben Raster. " +
  "x wächst nach rechts, y nach unten, ganze Zahlen 0…12. Für jedes Bauteil die Rasterpunkte seiner beiden Anschlüsse: " +
  "(ax, ay) = Anschluss a, (bx, by) = Anschluss b. Waagerecht gezeichnet: ay = by; senkrecht: ax = bx; Länge 2 Rastereinheiten. " +
  "Bauteile auf derselben Leitung haben dieselbe Zeile bzw. Spalte. Zwei Bauteile liegen nie übereinander.";

/* -------------------------------------------------------------------------- */
/* Comparaison (pure)                                                         */
/* -------------------------------------------------------------------------- */

const POLAR = new Set(["V", "I"]);

function valueKey(v: string): string {
  const raw = v.trim();
  if (!raw) return "";
  try {
    return String(Number(parseSi(raw).toPrecision(9)));
  } catch {
    return raw.toLowerCase();
  }
}

/** Par composant : avec quelles bornes d'autres composants chacune de ses bornes est reliée. */
function connections(elements: ReadElement[]): Map<string, string> {
  const atNode = new Map<string, string[]>();
  const terminal = (el: ReadElement, side: "a" | "b") => (POLAR.has(el.typ) ? `${el.name}.${side === "a" ? "+" : "-"}` : el.name);
  for (const el of elements) {
    for (const side of ["a", "b"] as const) {
      const list = atNode.get(el[side]) ?? [];
      list.push(terminal(el, side));
      atNode.set(el[side], list);
    }
  }
  const out = new Map<string, string>();
  for (const el of elements) {
    const ends = (["a", "b"] as const).map((side) => {
      const own = terminal(el, side);
      const others = [...(atNode.get(el[side]) ?? [])];
      others.splice(others.indexOf(own), 1);
      return others.sort().join(",");
    });
    // Un composant passif n'a pas de sens : ses deux bornes s'échangent.
    out.set(el.name, `${el.typ}|${valueKey(el.wert)}|${(POLAR.has(el.typ) ? ends : ends.sort()).join(" ‖ ")}`);
  }
  return out;
}

/**
 * Chaque position d'interrupteur devient une liaison nommée (« S#1 ») : deux
 * lectures qui échangent les positions 1 et 2 ne sont PAS d'accord.
 */
function withSwitches(r: SchematicReading): ReadElement[] {
  const contacts = (r.schalter ?? []).flatMap((s) => s.stellungen.map((p) => ({ typ: "V" as const, name: `${s.name}#${p.name}`, a: s.gemeinsam, b: p.kontakt, wert: "" })));
  return [...r.elemente, ...contacts];
}

export interface ReadingComparison {
  agree: boolean;
  /** Composants lus différemment (présence, type, valeur ou connexions). */
  disputed: string[];
}

/** Deux lectures décrivent-elles le même circuit, au nom des nœuds près ? */
export function compareReadings(a: SchematicReading, b: SchematicReading): ReadingComparison {
  const ca = connections(withSwitches(a));
  const cb = connections(withSwitches(b));
  const disputed = new Set<string>();
  for (const name of new Set([...ca.keys(), ...cb.keys()])) if (ca.get(name) !== cb.get(name)) disputed.add(name);
  const duplicates = (r: SchematicReading) => r.elemente.length !== new Set(r.elemente.map((e) => e.name)).size;
  const agree = disputed.size === 0 && !duplicates(a) && !duplicates(b) && a.elemente.length > 0;
  return { agree, disputed: [...disputed].sort() };
}

/* -------------------------------------------------------------------------- */
/* La consigne pour le tuteur (pure)                                          */
/* -------------------------------------------------------------------------- */

export type SchematicVerdict =
  | { kind: "agreed"; reading: SchematicReading }
  | { kind: "disputed"; first: SchematicReading; second: SchematicReading; disputed: string[] };

const lines = (r: SchematicReading) => r.elemente.map((e) => `  ${e.typ} ${e.name}: a=${e.a} b=${e.b} wert=${e.wert || "(kein Wert angegeben)"}`).join("\n");
const short = (list: string[]) => list.slice(0, 8).map((t) => t.slice(0, 160)).join("; ");
/** Nom d'une grandeur, sans mise en forme : « U_C », « Uc », « u c » → « uc ». */
export const givenKey = (name: string) => name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\d]/gu, "");

/** Fréquence, nature de la source, grandeurs données : ce que le tuteur doit avoir pour calculer. */
export interface ReadingContext {
  frequency: number | null;
  source_type: "DC" | "AC" | "unbekannt";
  given_values: { name: string; wert: string; einheit: string }[];
}
export const contextOf = (r: Partial<ReadingContext>): ReadingContext => ({ frequency: r.frequency ?? null, source_type: r.source_type ?? "unbekannt", given_values: r.given_values ?? [] });
const hasContext = (c: ReadingContext) => c.frequency !== null || c.source_type !== "unbekannt" || c.given_values.length > 0;

/** Les lignes « données de l'énoncé » de la consigne. */
export function contextNote(raw: Partial<ReadingContext>): string {
  const c = contextOf(raw);
  if (!hasContext(c)) return "";
  const parts = [
    c.source_type === "AC" ? "Wechselspannungsquelle (~)" : c.source_type === "DC" ? "Gleichspannungsquelle (=)" : "",
    c.frequency !== null ? `Frequenz ${c.frequency} Hz — bei schaltung_berechnen frequenz: ${c.frequency} angeben` : "",
    c.given_values.length ? `gegeben: ${c.given_values.map((g) => `${g.name} = ${g.wert}${g.einheit ? ` ${g.einheit}` : ""}`).join(", ")}` : "",
  ].filter(Boolean);
  return `\nAus der Aufgabe gelesen (zweimal, übereinstimmend): ${parts.join("; ")}.`;
}

/**
 * Les données sur lesquelles les deux lectures s'accordent. Un désaccord ici
 * ne bloque pas la netlist (la topologie, elle, concorde) : la donnée en
 * litige est retirée et signalée, le tuteur la fait confirmer.
 */
export function mergeContext(a: Partial<ReadingContext>, b: Partial<ReadingContext>): { context: ReadingContext; unklar: string[] } {
  const [x, y] = [contextOf(a), contextOf(b)];
  const unklar: string[] = [];
  const frequency = x.frequency === y.frequency ? x.frequency : null;
  if (x.frequency !== y.frequency) unklar.push(`Frequenz: die Lesungen sind uneinig (${x.frequency ?? "keine"} / ${y.frequency ?? "keine"} Hz) — bitte bestätigen.`);
  const source_type = x.source_type === y.source_type ? x.source_type : "unbekannt";
  if (x.source_type !== y.source_type) unklar.push("Quellenart (Gleich- oder Wechselspannung): die Lesungen sind uneinig — bitte bestätigen.");
  const other = new Map(y.given_values.map((g) => [givenKey(g.name), g]));
  const given_values: ReadingContext["given_values"] = [];
  for (const g of x.given_values) {
    const twin = other.get(givenKey(g.name));
    if (!twin) continue; // vue par une seule lecture : pas retenue
    if (valueKey(g.wert) === valueKey(twin.wert)) given_values.push(g);
    else unklar.push(`${g.name}: die Lesungen sind uneinig (${g.wert} / ${twin.wert}) — bitte bestätigen.`);
  }
  return { context: { frequency, source_type, given_values }, unklar };
}

const extras = (r: SchematicReading) =>
  contextNote(r) +
  (r.andere.length ? `\nWeitere Bauteile (nicht im Löser): ${short(r.andere)}` : "") + (r.unklar.length ? `\nUnklar: ${short(r.unklar)}` : "");

/**
 * Le schéma contient-il un composant que la netlist ne sait pas porter
 * (interrupteur, diode, transformateur…) ? Alors ni carte ni verrou : la
 * carte montrerait un circuit coupé en morceaux (essai « Aufgabe 14 » du
 * 24 nov. 2026 : un interrupteur à deux positions).
 */
export const beyondNetlist = (r: SchematicReading): boolean => r.andere.length > 0;

/** Un interrupteur : dessiné sur la carte, calculé par position (switchAnalysis). */
export const hasSwitch = (r: SchematicReading): boolean => (r.schalter ?? []).length > 0;

const switchLines = (r: Pick<SchematicReading, "schalter">) =>
  (r.schalter ?? []).map((s) => `  Schalter ${s.name}: gemeinsamer Anschluss an ${s.gemeinsam}; ${s.stellungen.map((p) => `Stellung ${p.name} verbindet ${s.gemeinsam} mit ${p.kontakt}`).join("; ")}`);

/**
 * Un interrupteur, un condensateur (ou une bobine) : pour CHAQUE position, le
 * solveur donne ce que voit le composant — résistance interne, valeur finale,
 * constante de temps.
 *
 * Essais « Aufgabe 14 » du 24 nov. 2026 : avec la bonne netlist sous les yeux,
 * le tuteur a suivi les mailles à la main et s'est trompé deux fois (τ = R2·C,
 * puis source placée dans la maille de décharge). La topologie est un calcul :
 * le code le fait.
 *
 * `null` : cas non couvert (plusieurs interrupteurs, plusieurs C/L, valeur
 * absente) — le tuteur garde alors la consigne générale.
 */
export function switchAnalysis(r: { elemente: (AnyElement | ReadElement)[]; schalter?: Pick<SwitchEntry, "name" | "gemeinsam" | "stellungen">[] }): string[] | null {
  const switches = r.schalter ?? [];
  const twoPoles = r.elemente.filter((e): e is ReadElement => "a" in e && "wert" in e).map((e) => ({ ...e, wert: String(e.wert) }));
  if (twoPoles.length !== r.elemente.length) return null;
  const storage = twoPoles.filter((e) => e.typ === "C" || e.typ === "L");
  if (switches.length !== 1 || storage.length !== 1) return null;
  if (twoPoles.some((e) => !hasValue(e.wert))) return null;
  const sw = switches[0]!;
  const st = storage[0]!;
  const out: string[] = [];
  for (const pos of sw.stellungen) {
    // Contact fermé : les deux nœuds n'en font qu'un.
    const merge = (n: string) => (n === sw.gemeinsam ? pos.kontakt : n);
    const rest = twoPoles.filter((e) => e !== st).map((e) => ({ ...e, a: merge(e.a), b: merge(e.b) })).filter((e) => e.a !== e.b);
    const a = merge(st.a);
    const b = merge(st.b);
    const head = `Stellung ${pos.name} (${sw.gemeinsam} an ${pos.kontakt})`;
    const nodes = new Set(rest.flatMap((e) => [e.a, e.b]));
    if (a === b || !nodes.has(a) || !nodes.has(b)) {
      out.push(`${head}: ${st.name} ist nicht an einen geschlossenen Kreis angeschlossen.`);
      continue;
    }
    const res = solveCircuit({ elemente: rest as CircuitElement[], masse: nodes.has("0") ? "0" : b, thevenin: { a, b } });
    const th = res.ok ? res.thevenin : undefined;
    const ri = th?.innenimpedanz?.re;
    if (!th || ri === undefined || !Number.isFinite(ri) || ri <= 0) {
      out.push(`${head}: vom Löser nicht bestimmbar — leite diese Stellung Knoten für Knoten her und sag der Person, dass du sie von Hand herleitest.`);
      continue;
    }
    const u0 = th.leerlaufspannung.re;
    const value = parseSi(st.wert);
    out.push(
      st.typ === "C"
        ? `${head}: ${st.name} sieht den Innenwiderstand R_i = ${siFormat(ri, "Ω")}; Endwert U_${st.name}(∞) = ${siFormat(u0, "V")} (von ${st.a} nach ${st.b}); τ = R_i·${st.name} = ${siFormat(ri * value, "s")}.`
        : `${head}: ${st.name} sieht den Innenwiderstand R_i = ${siFormat(ri, "Ω")}; Endwert I_${st.name}(∞) = ${siFormat(u0 / ri, "A")} (von ${st.a} nach ${st.b}); τ = ${st.name}/R_i = ${siFormat(value / ri, "s")}.`,
    );
  }
  return out;
}

/** Les positions calculées par le solveur, en tête de consigne. */
export function solved(r: Parameters<typeof switchAnalysis>[0]): string {
  const facts = switchAnalysis(r);
  if (!facts?.length) return "";
  return (
    "VOM LÖSER BERECHNET, je Schalterstellung (übernimm genau diese Werte; leite die Kreise NICHT selbst neu her, schreib kein lautes Nachdenken):\n" +
    `${facts.map((f) => `  ${f}`).join("\n")}\n` +
    "Zeitverlauf in jedem Abschnitt: x(t) = X(∞) + (X_Start − X(∞))·e^(−Δt/τ) mit den Werten DIESER Stellung. " +
    "X_Start = Wert am Ende des vorigen Abschnitts; \"sehr lange\" in einer Stellung heißt X_Start = ihr Endwert X(∞). " +
    "Erkläre der Person R_i in EINEM Satz je Stellung, passend zum berechneten Wert. Passt deine Erklärung nicht zum Wert, gilt der Wert: " +
    "schreib dann nur den Wert hin, ohne \"Nein\", \"Warte\" oder Korrekturen im Text.\n"
  );
}

/** Message système pour le tuteur ; l'étudiant ne le voit pas. */
export function schematicNote(v: SchematicVerdict): string {
  if (v.kind === "agreed" && (beyondNetlist(v.reading) || hasSwitch(v.reading))) {
    return (
      "SCHALTPLAN-LESUNG (vom Code vorbereitet): Zwei unabhängige Lesungen des Bildes ergeben DIESELBE Schaltung. " +
      (beyondNetlist(v.reading)
        ? "Sie enthält Bauteile, die schaltplan_erfassen NICHT darstellen kann — ruf schaltplan_erfassen deshalb NICHT auf.\n"
        : "Sie enthält einen Schalter. Ruf sofort schaltplan_erfassen auf (quelle \"bild\"): der Code zeichnet genau diese Schaltung MIT Schalter auf die Tafel. " +
          "Die Person bestätigt nichts; schaltung_berechnen rufst du NICHT auf.\n") +
      `${[lines(v.reading), ...switchLines(v.reading)].join("\n")}${v.reading.andere.length ? `\nWeitere Bauteile: ${v.reading.andere.slice(0, 8).join("; ")}` : ""}` +
      `${contextNote(v.reading)}${v.reading.unklar.length ? `\nUnklar: ${short(v.reading.unklar)}` : ""}\n` +
      solved(v.reading) +
      "So gehst du vor:\n" +
      "1. Beschreib der Person in zwei, drei Sätzen genau DIESE Schaltung (welches Bauteil hängt woran) und arbeite mit ihr weiter. Lies das Bild nicht neu.\n" +
      "2. Bei einem Schalter: jede Stellung ist eine EIGENE Schaltung. Schreib für jede Stellung auf, welcher Stromkreis geschlossen ist und " +
      "welche Bauteile darin IN REIHE liegen — verfolge den Weg Knoten für Knoten in der Liste oben. Ein Bauteil zwischen Schalter und Kondensator " +
      "liegt in JEDER Stellung im Kreis.\n" +
      "3. Zeitkonstanten erst danach: τ = (Summe der Widerstände im geschlossenen Kreis) · C bzw. L / R. Nenne, welche Widerstände du addierst.\n" +
      "4. Zahlenwerte mit dem Werkzeug rechnen (rechnen / elektro_berechnen), nie im Kopf."
    );
  }
  if (v.kind === "agreed") {
    return (
      "SCHALTPLAN-LESUNG (vom Code vorbereitet): Zwei unabhängige Lesungen des Bildes ergeben DIESELBE Schaltung.\n" +
      "Diese Netzliste steht FEST: ruf sofort schaltplan_erfassen auf (quelle \"bild\") — der Code trägt genau diese Bauteile und Knoten ein, " +
      "auch wenn du andere angibst. Lies das Bild NICHT neu, lass kein Bauteil weg, deute keines um (kein \"R4 ist ein Voltmeter\"). " +
      "Schreib KEINE eigene Verbindungstabelle: verweise auf die Netzliste auf der Tafel. " +
      "Steht bei einem Bauteil \"kein Wert angegeben\": frag die Person NICHT danach und erfinde keinen Wert. " +
      "Der Code prüft beim Rechnen, ob dieser Wert das Gesuchte überhaupt beeinflusst — deine Aufgabe ist, das zu begründen. " +
      "V: a = Pluspol. I: Strom fließt in Knoten a.\n" +
      (v.reading.uncertain_directions?.length
        ? `RICHTUNG UNSICHER bei ${v.reading.uncertain_directions.join(", ")}: frag die Person ausdrücklich und in einem eigenen Satz nach der Richtung ` +
          "(\"Ich sehe die Ströme, bin mir aber bei der Richtung nicht sicher: zeigt … nach … oder nach …?\"), bevor irgendetwas gerechnet wird. " +
          "Nennt sie eine andere Richtung, ruf schaltplan_erfassen mit vertauschten Knoten a und b für GENAU dieses Bauteil erneut auf.\n"
        : "") +
      `${lines(v.reading)}${extras(v.reading)}\n` +
      "Die Person bestätigt die Netzliste wie immer, bevor gerechnet wird."
    );
  }
  return (
    `SCHALTPLAN-LESUNG (vom Code vorbereitet): Zwei unabhängige Lesungen des Bildes WIDERSPRECHEN sich bei: ${v.disputed.join(", ")}.\n` +
    "Rechne nichts. Ruf schaltplan_erfassen mit Lesung A auf und trage die strittigen Bauteile in `unklar` ein. " +
    "Sag der Person offen, welche Verbindungen unsicher sind, und bitte sie, GENAU diese im eigenen Bild zu prüfen.\n" +
    `Lesung A:\n${lines(v.first)}${extras(v.first)}\nLesung B:\n${lines(v.second)}${extras(v.second)}`
  );
}

/* -------------------------------------------------------------------------- */
/* Les deux lectures                                                          */
/* -------------------------------------------------------------------------- */

export type SchematicReader = (image: Uint8Array, mediaType: string, signal: AbortSignal) => Promise<SchematicReading>;

const readOnce: SchematicReader = async (image, mediaType, signal) => {
  const { object } = await generateObject({
    model: gateway(VISION_MODEL),
    schema: schematicReadingSchema,
    abortSignal: signal,
    messages: [{ role: "user", content: [{ type: "file", data: image, mediaType }, { type: "text", text: READ_PROMPT }] }],
  });
  return object;
};

/* -------------------------------------------------------------------------- */
/* Le juge : une lecture physiquement impossible est rejetée                  */
/* -------------------------------------------------------------------------- */

/**
 * Ce que le code peut prouver FAUX dans une lecture, sans voir la photo :
 * composant en court-circuit sur lui-même, circuit en morceaux, système sans
 * solution (deux sources de tension en parallèle, source de courant sans
 * retour…). Une lecture qui passe n'est pas prouvée juste — un composant
 * placé au mauvais nœud donne un circuit tout à fait calculable ; c'est la
 * comparaison des lectures qui couvre ce cas.
 */
export function judgeReading(r: SchematicReading): string[] {
  const problems: string[] = [];
  for (const e of r.elemente) if (e.a === e.b) problems.push(`${e.name}: beide Anschlüsse am selben Knoten`);
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    while (parent.has(x) && parent.get(x) !== x) x = parent.get(x)!;
    return x;
  };
  const join = (a: string, b: string) => {
    for (const n of [a, b]) if (!parent.has(n)) parent.set(n, n);
    parent.set(find(a), find(b));
  };
  for (const e of r.elemente) join(e.a, e.b);
  for (const s of r.schalter ?? []) for (const p of s.stellungen) join(s.gemeinsam, p.kontakt);
  // Un composant hors netlist (transformateur…) relie des parties que la netlist ne voit pas.
  if (!r.andere.length && new Set([...parent.keys()].map(find)).size > 1) problems.push("die Schaltung zerfällt in getrennte Teile");
  // Calculable ? Seulement sans interrupteur ni composant spécial, et avec une source.
  const plain = !r.andere.length && !(r.schalter ?? []).length && r.elemente.some((e) => e.typ === "V" || e.typ === "I");
  if (plain && !problems.length) {
    const nodes = new Set(r.elemente.flatMap((e) => [e.a, e.b]));
    const res = solveCircuit({ elemente: r.elemente.map((e) => ({ ...e, wert: hasValue(e.wert) ? e.wert : FREE_VALUE })) as CircuitElement[], masse: nodes.has("0") ? "0" : r.elemente[0]!.b });
    if (!res.ok) problems.push(`nicht berechenbar (${res.fehler})`);
  }
  return problems;
}

/**
 * La question posée à l'étudiant pour une source au sens incertain. Elle part
 * dans `unklar` : la carte l'affiche, et rien n'est calculé avant la
 * confirmation de la netlist (lib/circuit/netlist.ts).
 */
export function directionQuestion(r: Pick<SchematicReading, "elemente">, name: string): string {
  const e = r.elemente.find((x) => x.name === name);
  if (!e) return `${name}: Richtung nicht sicher lesbar — bitte bestätigen.`;
  return e.typ === "I"
    ? `${name}: Pfeilrichtung nicht sicher lesbar. Gelesen: Strom von ${e.b} nach ${e.a}. Stimmt das, oder andersherum?`
    : `${name}: Polung nicht sicher lesbar. Gelesen: Pluspol an ${e.a}. Stimmt das, oder andersherum?`;
}

/** Délai des deux lectures ; au-delà, le tuteur lit l'image lui-même. */
export const SCHEMATIC_READ_TIMEOUT_MS = 40_000;

/**
 * `null` : pas un schéma, ou lecture impossible — le tuteur fait comme avant.
 * Une seule lecture aboutie ne vaut pas accord : elle est rendue comme litige
 * sans composant nommé serait trompeur, donc `null` aussi.
 */
export async function readSchematic(
  image: Uint8Array,
  mediaType: string,
  opts: { read?: SchematicReader; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<SchematicVerdict | null> {
  const read = opts.read ?? readOnce;
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? SCHEMATIC_READ_TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  const [first, second] = await Promise.allSettled([read(image, mediaType, signal), read(image, mediaType, signal)]);
  if (first.status !== "fulfilled" || second.status !== "fulfilled") {
    // Le nom de l'erreur seulement : son message peut citer le contenu de l'image.
    const why = [first, second].map((r) => (r.status === "rejected" ? (r.reason instanceof Error ? r.reason.name : "erreur") : "ok")).join(",");
    console.warn(`[schaltplan] lecture en échec (${why})`);
    return null;
  }
  const a = first.value;
  const b = second.value;
  if (!a.istSchaltplan && !b.istSchaltplan) return null;
  if (!a.elemente.length || !b.elemente.length) return null;
  const cmp = compareReadings(a, b);
  const merged = (x: SchematicReading, y: SchematicReading): SchematicVerdict => {
    const ctx = mergeContext(x, y);
    // Un sens jugé incertain par UNE des deux lectures suffit : l'étudiant le confirme.
    const names = new Set(x.elemente.map((e) => e.name));
    const uncertain_directions = [...new Set([...(x.uncertain_directions ?? []), ...(y.uncertain_directions ?? [])])].filter((n) => names.has(n));
    const ask = uncertain_directions.map((n) => directionQuestion(x, n));
    return { kind: "agreed", reading: { ...x, ...ctx.context, uncertain_directions, unklar: [...new Set([...ask, ...ctx.unklar, ...x.unklar, ...y.unklar])].slice(0, 10) } };
  };
  const sound = (x: SchematicReading) => judgeReading(x).length === 0;
  if (cmp.agree && sound(a)) return merged(a, b);

  // Désaccord, ou accord sur un circuit impossible : UNE troisième lecture
  // départage. Deux lectures sur trois d'accord ET un circuit possible →
  // retenu. Sinon TRED ne calcule rien et fait vérifier l'étudiant.
  const all = [...new Set([...a.elemente, ...b.elemente].map((e) => e.name))].sort();
  try {
    const c = await read(image, mediaType, signal);
    for (const x of [a, b]) {
      if (c?.elemente?.length && compareReadings(x, c).agree && sound(x)) {
        console.log("[schaltplan] troisième lecture : départage");
        return merged(x, c);
      }
    }
  } catch {
    // La troisième lecture a échoué : on reste sur le désaccord.
  }
  return { kind: "disputed", first: a, second: b, disputed: cmp.disputed.length ? cmp.disputed : all };
}

/** La première image jointe à la DERNIÈRE question (les PDF ne passent pas ici). */
export function firstAttachedImage(messages: unknown[]): { bytes: Uint8Array; mediaType: string } | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i] as { role?: string; parts?: { type?: string; mediaType?: string; url?: unknown }[] };
    if (m?.role !== "user") continue;
    for (const p of Array.isArray(m.parts) ? m.parts : []) {
      if (p?.type !== "file" || !String(p.mediaType ?? "").startsWith("image/") || typeof p.url !== "string") continue;
      const bytes = dataUrlBytes(p.url);
      if (bytes) return { bytes, mediaType: String(p.mediaType) };
    }
    return null;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Le verrou : la netlist lue deux fois ne se réécrit pas                     */
/* -------------------------------------------------------------------------- */

type AnyElement = SchaltplanInput["elemente"][number];

export interface NetlistLock {
  /** La netlist de référence : la double lecture, ou la dernière carte verrouillée du fil. */
  elemente: (AnyElement | ReadElement)[];
  unklar: string[];
  /**
   * La dernière question de l'étudiant. Le tuteur ne peut modifier QUE les
   * composants qu'elle nomme (« R4 = 2 Ω », « I2 zeigt nach unten »).
   * Vide au tour de la photo : rien n'est modifiable.
   */
  userText: string;
  /** Composants dont l'énoncé ne donne pas la valeur (repris de la carte précédente). */
  frei?: string[];
  /** Position des composants sur la photo : le schéma est redessiné tel qu'il y figure. */
  plan?: Record<string, PlanEntry>;
  /** Interrupteurs lus sur la photo : dessinés sur la carte, calculés par position. */
  schalter?: SwitchEntry[];
  /** Fréquence, nature de la source, grandeurs données : redonnées au tuteur à chaque tour. */
  kontext?: ReadingContext;
}

/** Les positions lues, par composant. */
export const planOf = (reading: SchematicReading): Record<string, PlanEntry> =>
  Object.fromEntries((reading.lage ?? []).map((l) => [l.name, [l.ax, l.ay, l.bx, l.by] as PlanEntry]));

/** « R4 », « R_4 », « R 4 », « r4 » : le composant est-il nommé dans la question ? */
export function mentions(text: string, name: string): boolean {
  const m = /^([A-Za-zÀ-ÿ]+)[ _]?(\d+)?$/.exec(name.trim());
  if (!m) return text.toLowerCase().includes(name.toLowerCase());
  const pattern = `(?<![\\p{L}\\d])${m[1]}${m[2] ? `[ _{]*${m[2]}(?!\\d)` : "(?![\\p{L}\\d])"}`;
  return new RegExp(pattern, "iu").test(text);
}

/** Une vraie valeur : « ? », « unbekannt » ou une chaîne vide n'en sont pas. */
function hasValue(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v !== "string" || v.trim() === "") return false;
  try {
    return Number.isFinite(parseSi(v));
  } catch {
    return false;
  }
}

/**
 * Valeur de calcul d'un composant dont l'énoncé ne donne pas la valeur. Elle
 * ne sort jamais comme résultat : lib/circuit/pipeline.ts recalcule avec une
 * autre valeur et ne garde que ce qui n'en dépend pas.
 */
export const FREE_VALUE = "1";

/**
 * L'entrée de `schaltplan_erfassen` sous verrou : composants et nœuds viennent
 * de la référence, pas du tuteur.
 *
 * Essais du 24 nov. 2026 : avec la bonne netlist sous les yeux, le tuteur a
 * retiré R4 et déplacé R2 ; au message suivant (la photo n'y est plus), il a
 * redessiné tout le circuit de mémoire. Une consigne ne suffit pas : le code
 * tranche.
 *
 *   - composant nommé par l'étudiant → la version du tuteur (correction) ;
 *   - valeur absente de l'énoncé → celle du tuteur, signalée comme supposée ;
 *   - tout le reste → la référence, inchangée.
 */
export function lockedNetlistInput(lock: NetlistLock, model: SchaltplanInput): SchaltplanInput {
  const proposed = new Map<string, AnyElement>();
  for (const el of model.elemente ?? []) proposed.set(el.name, el);
  const named = (name: string) => lock.userText.trim() !== "" && mentions(lock.userText, name);

  const frei = new Set<string>();
  const elemente: AnyElement[] = [];
  const known = new Set<string>();
  for (const base of lock.elemente) {
    known.add(base.name);
    const theirs = proposed.get(base.name);
    if (named(base.name)) {
      // Nommé et absent de la proposition : l'étudiant l'a fait retirer.
      if (theirs) elemente.push(theirs);
      continue;
    }
    if ("wert" in base && !hasValue(base.wert)) {
      // Pas de valeur dans l'énoncé : ni question à l'étudiant, ni valeur
      // inventée par le tuteur. Le calcul dira si elle compte.
      frei.add(base.name);
      elemente.push({ ...base, wert: FREE_VALUE } as AnyElement);
      continue;
    }
    if (lock.frei?.includes(base.name)) frei.add(base.name);
    elemente.push(base as AnyElement);
  }
  // Un composant ajouté n'entre que si l'étudiant le nomme.
  for (const el of model.elemente ?? []) if (!known.has(el.name) && named(el.name)) elemente.push(el);

  // Les remarques sur une valeur manquante sont remplacées par une ligne exacte.
  const free = [...frei].map((n) => `${n}: kein Wert in der Aufgabe. Beim Rechnen wird geprüft, ob er das Ergebnis beeinflusst.`);
  const rest = lock.unklar.filter((t) => !/\b(wert|value|valeur)\b/i.test(t));
  // Les questions de sens ne sont jamais coupées : sans elles, un sens deviné passerait pour sûr.
  const directions = rest.filter((t) => /nicht sicher lesbar\. Gelesen:/.test(t));
  const others = rest.filter((t) => !directions.includes(t));
  const unklar = [...directions, ...free, ...others.slice(0, 2)].map((t) => t.slice(0, 120)).slice(0, 10);
  const nodes = new Set(elemente.flatMap((e) => ("a" in e ? [e.a, e.b] : [e.plus, e.minus, e.aus])));
  return {
    quelle: "bild",
    masse: nodes.has("0") ? "0" : (model.masse ?? "0"),
    elemente,
    ...(unklar.length ? { unklar } : {}),
    ...(frei.size ? { frei: [...frei] } : {}),
    // Seuls les composants encore présents gardent leur place.
    ...(lock.plan ? { plan: Object.fromEntries(Object.entries(lock.plan).filter(([n]) => elemente.some((e) => e.name === n))) } : {}),
    ...(lock.schalter?.length ? { schalter: lock.schalter } : {}),
  };
}

/** Marque d'une carte produite sous verrou : le fil la retrouve aux tours suivants. */
export const LOCK_FLAG = "fest";

/**
 * La dernière netlist verrouillée du fil. Aux tours sans photo, elle reste la
 * référence : le tuteur n'a plus l'image et ne doit pas la reconstruire de mémoire.
 */
export function lockFromHistory(messages: unknown[], userText: string): NetlistLock | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i] as { role?: string; parts?: { type?: string; toolName?: string; state?: string; output?: unknown }[] };
    if (m?.role !== "assistant" || !Array.isArray(m.parts)) continue;
    for (let j = m.parts.length - 1; j >= 0; j -= 1) {
      const p = m.parts[j];
      const isCard = (p?.type === "tool-schaltplan_erfassen" || (p?.type === "dynamic-tool" && p.toolName === "schaltplan_erfassen")) && p.state === "output-available";
      if (!isCard) continue;
      const out = p.output as { ok?: boolean; elemente?: AnyElement[]; frei?: string[]; plan?: Record<string, PlanEntry>; schalter?: SwitchEntry[]; kontext?: ReadingContext; [LOCK_FLAG]?: boolean } | null;
      // Une carte refusée (valeur manquante) garde quand même la référence.
      if (!out || out[LOCK_FLAG] !== true || !Array.isArray(out.elemente)) continue;
      return { elemente: out.elemente, unklar: [], userText, frei: Array.isArray(out.frei) ? out.frei : [], ...(out.plan ? { plan: out.plan } : {}), ...(Array.isArray(out.schalter) && out.schalter.length ? { schalter: out.schalter } : {}), ...(out.kontext ? { kontext: contextOf(out.kontext) } : {}) };
    }
  }
  return null;
}

/** Consigne des tours suivants, sans photo. */
export const LOCK_FOLLOWUP_NOTE =
  "SCHALTPLAN STEHT FEST: Die Netzliste dieses Gesprächs wurde zweimal unabhängig aus dem Bild gelesen. " +
  "Du hast das Bild NICHT mehr vor dir: zeichne oder lies die Schaltung nicht neu. " +
  "Ändert die Person etwas (Wert, Richtung, Verbindung), ruf schaltplan_erfassen auf und ändere NUR die Bauteile, die sie nennt — " +
  "alle anderen übernimmt der Code unverändert. Zum Rechnen gilt die bestätigte Netzliste.";
