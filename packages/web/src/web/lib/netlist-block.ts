import type { CircuitElement } from "../../api/lib/solvers/solveCircuit";
import { netlistId, type NetlistView } from "../../api/lib/circuit/netlist";
import type { CircuitProof } from "../../api/lib/circuit/proof";

/**
 * Partie PURE des cartes « Netzliste » et « Probe » (aucun React) : du
 * résultat d'outil au bloc de texte, lecture du bloc, placement du graphe.
 * Même chemin que le schéma de poutre (lib/beam-svg.ts) : le bloc vit dans
 * le texte, il survit donc à la sauvegarde, au rechargement et à la
 * traduction. Testé dans tests/netlist-block.test.ts.
 */

/** Sans tiret : `markdown-content` lit la langue avec /language-([\w-]+)/. */
export const NETLIST_LANG = "netzliste";
export const PROOF_LANG = "kirchhoff";

interface ToolPartLike {
  type?: string;
  toolName?: string;
  state?: string;
  output?: unknown;
}

const toolName = (p: ToolPartLike) => (p?.type === "dynamic-tool" ? p.toolName : p?.type?.startsWith("tool-") ? p.type.slice(5) : undefined);

const fence = (lang: string, payload: unknown) => `\n\n\`\`\`${lang}\n${JSON.stringify(payload)}\n\`\`\`\n\n`;

/** `schaltplan_erfassen` réussi → bloc ```netzliste. */
export function netlistBlockFromPart(part: unknown): string | null {
  const p = part as ToolPartLike;
  if (toolName(p) !== "schaltplan_erfassen" || p.state !== "output-available") return null;
  const o = p.output as (NetlistView & { ok?: boolean }) | undefined;
  if (!o?.ok) return null;
  const { id, quelle, masse, elemente, knoten, unklar, hinweise, frei, plan, schalter } = o;
  // `frei` (valeur absente de l'énoncé) et `plan` (place sur la photo) : seulement s'ils existent.
  return fence(NETLIST_LANG, { id, quelle, masse, elemente, knoten, unklar, hinweise, ...(frei?.length ? { frei } : {}), ...(plan ? { plan } : {}), ...(schalter?.length ? { schalter } : {}) });
}

export interface ProofPayload {
  netzliste_id?: string;
  beweis: CircuitProof;
}

/** `schaltung_berechnen` réussi avec sa probe → bloc ```kirchhoff. */
export function proofBlockFromPart(part: unknown): string | null {
  const p = part as ToolPartLike;
  if (toolName(p) !== "schaltung_berechnen" || p.state !== "output-available") return null;
  const o = p.output as { ok?: boolean; beweis?: CircuitProof; netzliste_id?: string } | undefined;
  if (!o?.ok || !o.beweis) return null;
  return fence(PROOF_LANG, { netzliste_id: o.netzliste_id, beweis: o.beweis } satisfies ProofPayload);
}

/* -------------------------------------------------------------------------- */
/* Lecture                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Le bloc vient du texte du message, donc potentiellement d'ailleurs que de
 * l'outil (modèle qui recopie, message modifié) : il n'est accepté que si sa
 * kennung correspond à son contenu.
 */
export function parseNetlistBlock(code: string): NetlistView | null {
  try {
    const v = JSON.parse(code) as NetlistView;
    if (!v || typeof v.id !== "string" || !Array.isArray(v.elemente) || !Array.isArray(v.knoten)) return null;
    if (netlistId({ elemente: v.elemente, masse: v.masse }) !== v.id) return null;
    return { ...v, unklar: Array.isArray(v.unklar) ? v.unklar : [], hinweise: Array.isArray(v.hinweise) ? v.hinweise : [] };
  } catch {
    return null;
  }
}

export function parseProofBlock(code: string): ProofPayload | null {
  try {
    const v = JSON.parse(code) as ProofPayload;
    if (!v?.beweis || typeof v.beweis.exakt !== "boolean" || !Array.isArray(v.beweis.gesetze)) return null;
    return v;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Affichage                                                                  */
/* -------------------------------------------------------------------------- */

export const terminalsOf = (el: CircuitElement): string[] => (el.typ === "OPV" ? [el.plus, el.minus, el.aus] : [el.a, el.b]);

/** « 100 » → « 100 Ω », « 4.7k » → « 4.7 kΩ », « 4,7 kΩ » reste tel quel. */
function withUnit(v: number | string, unit: string): string {
  const s = String(v).trim();
  if (/(ohm|Ω|[a-z]?[VAFHS])$/i.test(s) && !/^[\d.,]+[pnuµμmkKMG]$/.test(s)) return s;
  const m = /^([\d.,eE+-]+)\s*(meg|[pnuµμmkKMG])?$/.exec(s);
  return m ? `${m[1]} ${m[2] === "u" ? "µ" : (m[2] ?? "")}${unit}` : s;
}

export function valueLabel(el: CircuitElement): string {
  switch (el.typ) {
    case "R":
      return withUnit(el.wert, "Ω");
    case "L":
      return withUnit(el.wert, "H");
    case "C":
      return withUnit(el.wert, "F");
    case "Z":
      return `${el.re} ${el.im < 0 ? "−" : "+"} j${Math.abs(el.im)} Ω`;
    case "V":
      return `${withUnit(el.wert, "V")}${el.phase ? ` ∠ ${el.phase}°` : ""}`;
    case "I":
      return `${withUnit(el.wert, "A")}${el.phase ? ` ∠ ${el.phase}°` : ""}`;
    case "OPV":
      return "ideal";
  }
}

export interface GraphLayout {
  width: number;
  height: number;
  nodes: { name: string; x: number; y: number; ground: boolean }[];
  edges: { name: string; label: string; path: string; lx: number; ly: number }[];
}

/**
 * Graphe des nœuds : la masse en bas au centre, les autres nœuds sur un arc
 * au-dessus, dans l'ordre de la netlist. Un composant = une arête nommée.
 * Plusieurs composants entre les deux mêmes nœuds (parallèle) : arêtes
 * courbées de part et d'autre, pour que chacun garde son étiquette.
 */
export function layoutGraph(view: Pick<NetlistView, "knoten" | "masse" | "elemente">): GraphLayout {
  const width = 520;
  const height = 300;
  const others = view.knoten.filter((n) => n !== view.masse);
  const pos = new Map<string, { x: number; y: number }>();
  pos.set(view.masse, { x: width / 2, y: height - 36 });
  const cx = width / 2;
  const cy = height - 36;
  const rx = width / 2 - 60;
  const ry = height - 90;
  others.forEach((n, i) => {
    const t = others.length === 1 ? Math.PI / 2 : Math.PI - (Math.PI * (i + 0.5)) / others.length;
    pos.set(n, { x: cx + rx * Math.cos(t), y: cy - ry * Math.sin(t) });
  });

  const pairCount = new Map<string, number>();
  const pairSeen = new Map<string, number>();
  const pairKey = (a: string, b: string) => [a, b].sort().join("\u0000");
  const spans = view.elemente.map((el) => {
    const t = terminalsOf(el);
    return el.typ === "OPV" ? [t[2], view.masse] : [t[0], t[1]];
  });
  for (const [a, b] of spans) pairCount.set(pairKey(a, b), (pairCount.get(pairKey(a, b)) ?? 0) + 1);

  const edges = view.elemente.map((el, i) => {
    const [a, b] = spans[i];
    const pa = pos.get(a) ?? { x: cx, y: cy };
    const pb = pos.get(b) ?? { x: cx, y: cy };
    const key = pairKey(a, b);
    const count = pairCount.get(key) ?? 1;
    const k = pairSeen.get(key) ?? 0;
    pairSeen.set(key, k + 1);
    const offset = count === 1 ? 0 : (k - (count - 1) / 2) * 46;
    const mx = (pa.x + pb.x) / 2;
    const my = (pa.y + pb.y) / 2;
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const len = Math.hypot(dx, dy) || 1;
    // Normale unitaire, orientée de façon stable (indépendante du sens a→b).
    const sgn = a < b ? 1 : -1;
    const nx = (-dy / len) * sgn;
    const ny = (dx / len) * sgn;
    const qx = mx + nx * offset * 2;
    const qy = my + ny * offset * 2;
    const path = offset === 0 ? `M${pa.x.toFixed(1)},${pa.y.toFixed(1)} L${pb.x.toFixed(1)},${pb.y.toFixed(1)}` : `M${pa.x.toFixed(1)},${pa.y.toFixed(1)} Q${qx.toFixed(1)},${qy.toFixed(1)} ${pb.x.toFixed(1)},${pb.y.toFixed(1)}`;
    // L'étiquette se pose à côté du trait (pas dessus) : aucun fond à peindre,
    // elle se lit sur les trois Tafeln.
    const side = (offset < 0 ? -1 : 1) * 28;
    return { name: el.name, label: valueLabel(el), path, lx: mx + nx * (offset + side), ly: my + ny * (offset + side) };
  });

  return {
    width,
    height,
    nodes: view.knoten.map((n) => ({ name: n, ...(pos.get(n) ?? { x: cx, y: cy }), ground: n === view.masse })),
    edges,
  };
}

/** Le bouton « Stimmt so » envoie ce texte ; netlist.ts le reconnaît (✓ + kennung). */
export const NETLIST_EVENT = "tred:netlist";
export type NetlistEventDetail = { action: "confirm" | "fix"; text: string };
