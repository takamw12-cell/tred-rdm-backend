import { describe, expect, test } from "bun:test";
import {
  LIMITS,
  boundsOf,
  describePart,
  looksIncomplete,
  parseModel3D,
  planModel,
  toPlane,
  type ExtrudePlan,
  type Model3D,
} from "../src/web/lib/model3d";

/** L'exemple validé par le fondateur. */
const EXEMPLE = `[
  { "type": "cylinder", "radius": 30, "height": 120, "position": [0, 60, 0] },
  { "type": "box", "size": [80, 40, 20], "position": [0, 120, 0] },
  { "type": "hole", "radius": 10, "position": [0, 120, 0] }
]`;

const ok = (src: string): Model3D => {
  const r = parseModel3D(src);
  if (!r.ok) throw new Error(r.error);
  return r.model;
};
const extrusions = (m: Model3D) => planModel(m).filter((p): p is ExtrudePlan => p.kind === "extrude");

describe("3d-json : validation stricte", () => {
  test("l'exemple du fondateur passe", () => {
    const m = ok(EXEMPLE);
    expect(m.parts.map((p) => p.type)).toEqual(["cylinder", "box"]);
    expect(m.holes).toHaveLength(1);
    expect(m.parts[0]).toMatchObject({ axis: "y", material: "steel" });
  });
  test("forme objet { title, parts } acceptée", () => {
    const m = ok(`{"title":"Schraube","parts":[{"type":"hex","across":16,"height":6.4,"position":[0,3.2,0]}]}`);
    expect(m.title).toBe("Schraube");
  });
  test("refuse ce qui n'est pas de la géométrie", () => {
    const bad = [
      "<Mesh />",
      "{}",
      "[]",
      `[{"type":"script","src":"x"}]`,
      `[{"type":"box","size":[1,2],"position":[0,0,0]}]`,
      `[{"type":"box","size":[1,-2,3]}]`,
      `[{"type":"cylinder","radius":"30","height":10}]`,
      `[{"type":"cylinder","radius":5,"height":1e9}]`,
      `[{"type":"cylinder","radius":5,"height":10,"axis":"w"}]`,
      `[{"type":"box","size":[1,1,1],"material":"#ff0000"}]`,
      `[{"type":"hole","radius":3,"position":[0,0,0]}]`,
      JSON.stringify(Array.from({ length: LIMITS.items + 1 }, () => ({ type: "sphere", radius: 1 }))),
    ];
    for (const src of bad) expect(parseModel3D(src).ok).toBe(false);
  });
  test("message d'erreur lisible, avec le numéro de l'élément", () => {
    const r = parseModel3D(`[{"type":"box","size":[1,1,1]},{"type":"pyramid"}]`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Element 2");
  });
  test("label nettoyé et borné", () => {
    const m = ok(`[{"type":"sphere","radius":2,"label":"Kugel\\u0000\\n${"x".repeat(80)}"}]`);
    expect(m.parts[0].label?.length).toBeLessThanOrEqual(LIMITS.label);
    // eslint-disable-next-line no-control-regex
    expect(m.parts[0].label).not.toMatch(/[\u0000-\u001f]/);
  });
  test("bloc en cours d'écriture ≠ bloc invalide", () => {
    expect(looksIncomplete(`[ {"type": "box", "size": [1,`)).toBe(true);
    expect(looksIncomplete(EXEMPLE)).toBe(false);
    expect(looksIncomplete("")).toBe(true);
  });
});

describe("perçages sans CSG", () => {
  test("exemple : Ø20 dans une plaque de 20 mm → percée dans l'épaisseur (axe z), le cylindre intact", () => {
    const plan = planModel(ok(EXEMPLE));
    const e = plan.filter((p): p is ExtrudePlan => p.kind === "extrude");
    const cyl = e.filter((x) => x.partIndex === 0);
    const box = e.filter((x) => x.partIndex === 1);
    expect(cyl.every((x) => x.holes.length === 0)).toBe(true);
    expect(box).toHaveLength(1);
    expect(box[0].axis).toBe("z");
    expect(box[0].holes).toEqual([{ u: 0, v: 120, r: 10 }]);
    expect([box[0].from, box[0].to]).toEqual([-10, 10]);
    expect(plan.some((p) => p.kind === "hole-marker")).toBe(false);
  });
  test("axe explicite respecté même s'il ne perce rien (repère)", () => {
    const m = ok(EXEMPLE.replace('"radius": 10, "position": [0, 120, 0]', '"radius": 10, "position": [0, 120, 0], "axis": "y"'));
    expect(planModel(m).some((p) => p.kind === "hole-marker")).toBe(true);
  });
  test("bride : alésage central + 4 trous, sur toute l'épaisseur", () => {
    const m = ok(`[
      {"type":"cylinder","radius":50,"height":12,"position":[0,6,0]},
      {"type":"hole","radius":15,"position":[0,6,0]},
      {"type":"hole","radius":5.5,"position":[35,6,0]},
      {"type":"hole","radius":5.5,"position":[-35,6,0]},
      {"type":"hole","radius":5.5,"position":[0,6,35]},
      {"type":"hole","radius":5.5,"position":[0,6,-35]}
    ]`);
    const e = extrusions(m);
    expect(e).toHaveLength(1);
    expect(e[0].holes).toHaveLength(5);
    expect(planModel(m).some((p) => p.kind === "hole-marker")).toBe(false);
  });
  test("trou borgne : la pièce est coupée en tronçons, seul le bon est percé", () => {
    const m = ok(`[
      {"type":"box","size":[40,40,40],"position":[0,20,0]},
      {"type":"hole","radius":5,"position":[0,35,0],"depth":10}
    ]`);
    const e = extrusions(m);
    expect(e.map((x) => [x.from, x.to, x.holes.length])).toEqual([
      [0, 30, 0],
      [30, 40, 1],
    ]);
  });
  test("trou transversal dans un box : extrusion selon l'axe du trou", () => {
    const m = ok(`[{"type":"box","size":[100,20,30],"position":[0,0,0]},{"type":"hole","radius":4,"position":[30,0,0],"axis":"z"}]`);
    const e = extrusions(m);
    expect(e[0].axis).toBe("z");
    expect(e[0].holes).toHaveLength(1);
  });
  test("trou qui ne tient dans aucune pièce → repère visible, jamais ignoré", () => {
    const m = ok(`[{"type":"cylinder","radius":10,"height":50,"position":[0,25,0]},{"type":"hole","radius":3,"position":[0,25,0],"axis":"x"}]`);
    const plan = planModel(m);
    expect(plan.filter((p) => p.kind === "hole-marker")).toHaveLength(1);
  });
  test("cône, sphère, tore : primitives", () => {
    const m = ok(`[{"type":"cone","radiusBottom":10,"radiusTop":0,"height":20},{"type":"sphere","radius":5},{"type":"torus","radius":20,"tube":2}]`);
    expect(planModel(m).map((p) => p.kind)).toEqual(["primitive", "primitive", "primitive"]);
  });
});

describe("repères et cadrage", () => {
  test("toPlane : correspondance avec les rotations du rendu", () => {
    expect(toPlane("y", [1, 2, 3])).toEqual({ u: 1, v: -3, w: 2 });
    expect(toPlane("x", [1, 2, 3])).toEqual({ u: -3, v: 2, w: 1 });
    expect(toPlane("z", [1, 2, 3])).toEqual({ u: 1, v: 2, w: 3 });
  });
  test("boîte englobante de l'exemple", () => {
    const b = boundsOf(ok(EXEMPLE));
    expect(b.min).toEqual([-40, 0, -30]);
    expect(b.max).toEqual([40, 140, 30]);
    expect(b.size).toBe(140);
  });
  test("description lisible des pièces", () => {
    const m = ok(EXEMPLE);
    expect(describePart(m.parts[0])).toBe("Zylinder Ø60×120");
    expect(describePart({ ...m.parts[1], label: "Kopf" })).toBe("Kopf (Quader 80×40×20)");
  });
});
