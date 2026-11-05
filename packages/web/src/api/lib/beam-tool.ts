import { solveRdmSafe, type BeamProblem, type Point, type SolveError, type SupportKind } from "./rdm-solver";
import { toSI } from "./units";

/**
 * Logique de l'outil `balkenstatik`, sortie de `agent/index.ts` pour être
 * testable sans le modèle.
 *
 * Deux sorties, deux destinataires :
 *
 *   • `kritischePunkte` → pour le MODÈLE. Il en a besoin pour expliquer
 *     (« Q springt bei x = 1 m von 75 N auf −25 N »), pas pour dessiner.
 *     Chaque saut y figure avec SES DEUX valeurs. L'ancien `thin()` gardait un
 *     point sur quatre et tombait sur l'un des deux : le saut vertical sous une
 *     force devenait une pente. C'est le bug que ce fichier corrige.
 *
 *   • `diagramm` → pour le NAVIGATEUR. L'énoncé normalisé en SI, que le chat
 *     transforme en bloc ```balkendiagramm et que <BeamDiagram /> résout à
 *     nouveau avec le même solveur. Le modèle ne recopie aucun chiffre.
 */

export type LengthUnit = "m" | "cm" | "mm";
export type ForceUnit = "N" | "kN" | "MN";

export interface BalkenstatikInput {
  laenge: number;
  lager: { x: number; art: "loslager" | "festlager" | "einspannung"; name?: string }[];
  einzellasten?: { x: number; F: number }[];
  streckenlasten?: { von: number; bis: number; q: number }[];
  einzelmomente?: { x: number; M: number }[];
  einheiten?: { laenge?: LengthUnit; kraft?: ForceUnit };
}

/** Ce que le bloc ```balkendiagramm transporte. Tout en SI (m, N, N/m, N·m). */
export interface BeamDiagramPayload {
  v: 1;
  problem: {
    length: number;
    supports: { x: number; kind: SupportKind; name: string }[];
    pointLoads: { x: number; F: number }[];
    distributedLoads: { from: number; to: number; q: number }[];
    pointMoments: { x: number; M: number }[];
  };
  /** Unités de l'énoncé, pour AFFICHER dans les unités de l'étudiant. */
  units: { length: LengthUnit; force: ForceUnit };
}

/* -------------------------------------------------------------------------- */
/* Points critiques                                                           */
/* -------------------------------------------------------------------------- */

const round = (v: number, digits = 6) => {
  const f = 10 ** digits;
  const r = Math.round(v * f) / f;
  return Object.is(r, -0) ? 0 : r;
};

/**
 * Abscisses où un diagramme change de nature : bords, appuis, charges,
 * début et fin des charges réparties.
 */
export function eventPositions(p: BeamDiagramPayload["problem"]): number[] {
  const xs = [
    0,
    p.length,
    ...p.supports.map((s) => s.x),
    ...p.pointLoads.map((f) => f.x),
    ...p.pointMoments.map((m) => m.x),
    ...p.distributedLoads.flatMap((d) => [d.from, d.to]),
  ];
  return [...new Set(xs.map((x) => round(x)))].sort((a, b) => a - b);
}

/**
 * Garde, dans une courbe du solveur, tous les points qui portent une
 * information : bords, positions d'événements et LES DEUX CÔTÉS DE CHAQUE
 * SAUT. Le solveur représente un saut par deux points de même abscisse (à
 * 1e-6 près) ; on les reconnaît à ça, pas à l'amplitude.
 *
 * Les points intermédiaires d'une droite ou d'une parabole n'apprennent rien
 * au modèle — il a déjà les extrema à part.
 */
export function criticalPoints(curve: Point[], events: number[], length: number): Point[] {
  const tol = Math.max(1e-9, length * 1e-5);
  const near = (a: number, b: number) => Math.abs(a - b) <= tol;
  const kept: Point[] = [];

  curve.forEach((pt, i) => {
    const isEdge = i === 0 || i === curve.length - 1;
    const isJump =
      (i > 0 && near(curve[i - 1].x, pt.x)) ||
      (i < curve.length - 1 && near(curve[i + 1].x, pt.x));
    const isEvent = events.some((e) => near(e, pt.x));
    if (!isEdge && !isJump && !isEvent) return;

    const next = { x: round(pt.x), y: round(pt.y) };
    const prev = kept[kept.length - 1];
    // Doublon exact (même x, même y) : inutile. Même x, y différent : c'est
    // un saut, on garde les deux.
    if (prev && near(prev.x, next.x) && Math.abs(prev.y - next.y) < 1e-9) return;
    kept.push(next);
  });

  return kept;
}

/* -------------------------------------------------------------------------- */
/* Outil                                                                      */
/* -------------------------------------------------------------------------- */

export function toPayload(a: BalkenstatikInput): BeamDiagramPayload {
  const uL = a.einheiten?.laenge ?? "m";
  const uF = a.einheiten?.kraft ?? "N";
  // Conversion dans l'outil, jamais dans le modèle : un facteur 1000 oublié
  // donne une solution cohérente et fausse, que personne ne remarque.
  const len = (v: number) => toSI(v, "length", uL);
  const force = (v: number) => toSI(v, "force", uF);
  const lineLoad = (v: number) => force(v) / len(1);
  const moment = (v: number) => force(v) * len(1);

  const names = "ABCDEFGH";
  return {
    v: 1,
    problem: {
      length: len(a.laenge),
      supports: a.lager.map((s, i) => ({
        x: len(s.x),
        kind: s.art,
        name: s.name?.trim() || names[i] || `L${i + 1}`,
      })),
      pointLoads: (a.einzellasten ?? []).map((p) => ({ x: len(p.x), F: force(p.F) })),
      distributedLoads: (a.streckenlasten ?? []).map((d) => ({
        from: len(d.von),
        to: len(d.bis),
        q: lineLoad(d.q),
      })),
      pointMoments: (a.einzelmomente ?? []).map((m) => ({ x: len(m.x), M: moment(m.M) })),
    },
    units: { length: uL, force: uF },
  };
}

/** Le problème au format du solveur. Partagé avec le navigateur. */
export function payloadToProblem(p: BeamDiagramPayload["problem"]): BeamProblem {
  return {
    length: p.length,
    supports: p.supports,
    pointLoads: p.pointLoads,
    distributedLoads: p.distributedLoads,
    pointMoments: p.pointMoments,
  };
}

export function runBalkenstatik(a: BalkenstatikInput) {
  let payload: BeamDiagramPayload;
  try {
    payload = toPayload(a);
  } catch (error) {
    return {
      ok: false,
      code: "INVALID_UNIT",
      error: error instanceof Error ? error.message : String(error),
    } satisfies SolveError;
  }

  const r = solveRdmSafe(payloadToProblem(payload.problem));
  if (!r.ok) return r;

  const events = eventPositions(payload.problem);

  return {
    ok: true as const,
    statischBestimmt: r.degreeOfIndeterminacy === 0,
    gradDerUnbestimmtheit: r.degreeOfIndeterminacy,
    auflagerkraefte: r.reactions,
    extremwerte: r.extremes,
    // Un saut = deux points de même x. Cite les deux valeurs.
    kritischePunkte: {
      querkraft: criticalPoints(r.shear, events, r.length),
      moment: criticalPoints(r.moment, events, r.length),
    },
    // Selbstkontrolle des Lösers: beide Summen müssen ≈ 0 sein.
    // Nenne sie dem Studierenden NICHT — sie belegen nur, dass die
    // Zahlen stimmen.
    gleichgewichtskontrolle: r.equilibrium,
    hinweise: r.warnings,
    einheiten: { kraft: "N", laenge: "m", moment: "N*m" },
    // Wird automatisch als Skizze + Q(x) + M(x) unter deiner Antwort
    // gezeichnet. NICHT abschreiben, NICHT selbst zeichnen.
    diagramm: payload,
  };
}
