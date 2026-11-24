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
import { parseSi } from "../solvers/solveCircuit";
import type { SchaltplanInput } from "./netlist";

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
  andere: z.array(z.string().min(1).max(300)).max(20).describe("Bauteile außerhalb von R, L, C, V, I: Schalter, Diode, OPV, Messgerät … mit ihren Knoten"),
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
  "- Kein Schaltplan im Bild: istSchaltplan = false, elemente leer.";

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

export interface ReadingComparison {
  agree: boolean;
  /** Composants lus différemment (présence, type, valeur ou connexions). */
  disputed: string[];
}

/** Deux lectures décrivent-elles le même circuit, au nom des nœuds près ? */
export function compareReadings(a: SchematicReading, b: SchematicReading): ReadingComparison {
  const ca = connections(a.elemente);
  const cb = connections(b.elemente);
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
const extras = (r: SchematicReading) =>
  (r.andere.length ? `\nWeitere Bauteile (nicht im Löser): ${short(r.andere)}` : "") + (r.unklar.length ? `\nUnklar: ${short(r.unklar)}` : "");

/** Message système pour le tuteur ; l'étudiant ne le voit pas. */
export function schematicNote(v: SchematicVerdict): string {
  if (v.kind === "agreed") {
    return (
      "SCHALTPLAN-LESUNG (vom Code vorbereitet): Zwei unabhängige Lesungen des Bildes ergeben DIESELBE Schaltung.\n" +
      "Diese Netzliste steht FEST: ruf sofort schaltplan_erfassen auf (quelle \"bild\") — der Code trägt genau diese Bauteile und Knoten ein, " +
      "auch wenn du andere angibst. Lies das Bild NICHT neu, lass kein Bauteil weg, deute keines um (kein \"R4 ist ein Voltmeter\"). " +
      "Schreib KEINE eigene Verbindungstabelle: verweise auf die Netzliste auf der Tafel. " +
      "Steht bei einem Bauteil \"kein Wert angegeben\": frag die Person NICHT danach und erfinde keinen Wert. " +
      "Der Code prüft beim Rechnen, ob dieser Wert das Gesuchte überhaupt beeinflusst — deine Aufgabe ist, das zu begründen. " +
      "V: a = Pluspol. I: Strom fließt in Knoten a.\n" +
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
  if (cmp.agree) return { kind: "agreed", reading: { ...a, unklar: [...new Set([...a.unklar, ...b.unklar])].slice(0, 10) } };
  return { kind: "disputed", first: a, second: b, disputed: cmp.disputed };
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
}

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
  const unklar = [...free, ...rest.slice(0, 2)].map((t) => t.slice(0, 120)).slice(0, 10);
  const nodes = new Set(elemente.flatMap((e) => ("a" in e ? [e.a, e.b] : [e.plus, e.minus, e.aus])));
  return {
    quelle: "bild",
    masse: nodes.has("0") ? "0" : (model.masse ?? "0"),
    elemente,
    ...(unklar.length ? { unklar } : {}),
    ...(frei.size ? { frei: [...frei] } : {}),
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
      const out = p.output as { ok?: boolean; elemente?: AnyElement[]; frei?: string[]; [LOCK_FLAG]?: boolean } | null;
      // Une carte refusée (valeur manquante) garde quand même la référence.
      if (!out || out[LOCK_FLAG] !== true || !Array.isArray(out.elemente)) continue;
      return { elemente: out.elemente, unklar: [], userText, frei: Array.isArray(out.frei) ? out.frei : [] };
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
