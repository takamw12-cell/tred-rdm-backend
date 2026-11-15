import { describe, expect, test } from "bun:test";
import {
  askPrompt,
  cameraDistance,
  cameraStart,
  CONTENT_LOCALES,
  EXPLORER_MODELS,
  GEAR,
  gearCentreDistance,
  gearCentres,
  gearPitchPoint,
  gearRatio,
  hotspotOf,
  isModelId,
  MODEL_IDS,
  pick,
  type LocalText,
} from "../src/web/lib/explorer-models";

/**
 * L'Explorateur 3D (2026-11-15) : les modèles, leurs points cliquables, leurs
 * textes. Ce que l'étudiant lit sur une pièce de moteur doit être juste, exister
 * dans sa langue, et le repère doit être posé SUR le modèle.
 */

const models = MODEL_IDS.map((id) => EXPLORER_MODELS[id]);
const texts = (t: LocalText) => CONTENT_LOCALES.map((l) => t[l]);

describe("deux modèles, construits dans le navigateur", () => {
  test("turboréacteur double flux et engrenage droit", () => {
    expect(MODEL_IDS).toEqual(["turbofan", "gearbox"]);
    expect(isModelId("turbofan")).toBe(true);
    expect(isModelId("sketchfab")).toBe(false);
  });

  test("six points sur le turboréacteur, quatre sur l'engrenage, sans doublon", () => {
    expect(EXPLORER_MODELS.turbofan.hotspots.map((h) => h.id)).toEqual(["fan", "compressor", "combustor", "turbine", "nozzle", "bypass"]);
    expect(EXPLORER_MODELS.gearbox.hotspots.map((h) => h.id)).toEqual(["pinion", "wheel", "mesh", "shaft"]);
    for (const m of models) expect(new Set(m.hotspots.map((h) => h.id)).size).toBe(m.hotspots.length);
  });

  test("chaque repère est posé à l'intérieur de la boîte du modèle", () => {
    for (const m of models) {
      for (const h of m.hotspots) {
        h.position.forEach((v, axis) => {
          expect(v).toBeGreaterThanOrEqual(m.bounds.min[axis]);
          expect(v).toBeLessThanOrEqual(m.bounds.max[axis]);
        });
      }
    }
  });

  test("la caméra de départ est HORS de la boîte, elle regarde le modèle de l'extérieur", () => {
    for (const m of models) expect(m.camera.some((v, axis) => v < m.bounds.min[axis] || v > m.bounds.max[axis])).toBe(true);
  });
});

describe("les textes : complets en allemand, anglais, français et espagnol", () => {
  test("nom, introduction, et pour chaque point : titre, explication, ordre de grandeur, question", () => {
    for (const m of models) {
      for (const t of [m.name, m.intro]) for (const s of texts(t)) expect(s.trim().length).toBeGreaterThan(5);
      for (const h of m.hotspots) {
        for (const s of texts(h.title)) expect(s.trim().length).toBeGreaterThan(2);
        // Deux ou trois phrases : assez pour comprendre, assez court pour un téléphone.
        for (const s of texts(h.text)) {
          expect(s.length).toBeGreaterThan(60);
          expect(s.length).toBeLessThan(330);
        }
        for (const s of texts(h.fact)) expect(s.trim().length).toBeGreaterThan(10);
        for (const s of texts(h.quiz)) expect(s.trim().endsWith("?")).toBe(true);
      }
    }
  });

  test("aucun texte n'est resté dans la langue d'une autre colonne (les quatre versions diffèrent)", () => {
    for (const m of models) for (const h of m.hotspots) expect(new Set(texts(h.text)).size).toBe(4);
  });

  test("la question du jeu ne donne pas la réponse : le nom de la pièce n'y figure pas", () => {
    for (const h of EXPLORER_MODELS.turbofan.hotspots) {
      for (const l of CONTENT_LOCALES) {
        const name = h.title[l].split(/[ (]/)[0].toLowerCase();
        expect(h.quiz[l].toLowerCase().includes(name)).toBe(false);
      }
    }
  });

  test("pick : la langue de l'étudiant, sa variante régionale, sinon l'allemand", () => {
    const t = EXPLORER_MODELS.turbofan.name;
    expect(pick(t, "fr")).toBe("Turboréacteur double flux");
    expect(pick(t, "fr-CH")).toBe("Turboréacteur double flux");
    expect(pick(t, "en")).toBe("Turbofan engine");
    expect(pick(t, "ja")).toBe("Turbofan-Triebwerk");
    expect(pick(t, "")).toBe("Turbofan-Triebwerk");
  });
});

describe("les ordres de grandeur du turboréacteur", () => {
  const h = (id: string) => hotspotOf(EXPLORER_MODELS.turbofan, id)!;

  test("taux de dilution ≈ 10, taux de compression 40 à 50, entrée de turbine ≈ 1 700 °C, deux arbres", () => {
    expect(h("bypass").fact.de).toContain("10 : 1");
    expect(h("compressor").fact.de).toMatch(/40 : 1 bis 50 : 1/);
    expect(h("combustor").fact.de).toContain("1 700 °C");
    expect(h("turbine").fact.de).toMatch(/N1.*N2/);
  });

  test("la poussée se construit en quatre pas, du théorème de la quantité de mouvement au rendement propulsif", () => {
    const steps = h("nozzle").steps!;
    expect(steps).toHaveLength(4);
    expect(steps[0].tex).toBe("F = \\dot m \\,(c_e - c_0)");
    expect(steps[3].tex).toBe("\\eta_V = \\dfrac{2}{1 + c_e / c_0}");
    for (const s of steps) for (const l of CONTENT_LOCALES) expect(s.note[l].length).toBeGreaterThan(10);
  });

  test("un point inconnu, ou aucun : null", () => {
    expect(hotspotOf(EXPLORER_MODELS.turbofan, "helice")).toBeNull();
    expect(hotspotOf(EXPLORER_MODELS.turbofan, null)).toBeNull();
  });
});

describe("la géométrie de l'engrenage est celle que disent ses textes", () => {
  test("z₁ = 16, z₂ = 40 : i = 2,5 ; entraxe a = m·(z₁ + z₂)/2 = 2,8", () => {
    expect(gearRatio).toBe(2.5);
    expect(gearCentreDistance).toBeCloseTo(2.8, 10);
    expect(gearCentres.wheel[0] - gearCentres.pinion[0]).toBeCloseTo(gearCentreDistance, 10);
  });

  test("les deux cercles primitifs se touchent au point primitif (r = m·z/2)", () => {
    const r1 = (GEAR.module * GEAR.z1) / 2;
    const r2 = (GEAR.module * GEAR.z2) / 2;
    expect(gearPitchPoint[0] - gearCentres.pinion[0]).toBeCloseTo(r1, 10);
    expect(gearCentres.wheel[0] - gearPitchPoint[0]).toBeCloseTo(r2, 10);
  });

  test("l'ensemble est centré : il dépasse autant à gauche qu'à droite", () => {
    const head = GEAR.module; // saillie d'une dent = 1 module
    const left = gearCentres.pinion[0] - (GEAR.module * GEAR.z1) / 2 - head;
    const right = gearCentres.wheel[0] + (GEAR.module * GEAR.z2) / 2 + head;
    expect(left).toBeCloseTo(-right, 10);
  });

  test("les textes disent les mêmes nombres", () => {
    const g = EXPLORER_MODELS.gearbox;
    expect(hotspotOf(g, "pinion")!.fact.de).toContain(`z₁ = ${GEAR.z1}`);
    expect(hotspotOf(g, "wheel")!.fact.de).toContain(`z₂ = ${GEAR.z2}`);
    expect(hotspotOf(g, "wheel")!.fact.de).toContain("2,5");
    expect(hotspotOf(g, "wheel")!.steps![1].tex).toContain("\\dfrac{40}{16}");
    expect(hotspotOf(g, "mesh")!.position[0]).toBe(gearPitchPoint[0]);
  });
});

describe("« Im Hörsaal fragen » : la question remise au tuteur", () => {
  const model = EXPLORER_MODELS.turbofan;
  const part = hotspotOf(model, "combustor")!;

  test("elle nomme le modèle et la pièce, dans la langue de l'étudiant", () => {
    expect(askPrompt(model, part, "de")).toBe("Erkläre mir am Beispiel „Turbofan-Triebwerk“ das Bauteil „Brennkammer“: Aufgabe, Funktionsprinzip und die wichtigste Formel.");
    expect(askPrompt(model, part, "fr")).toContain("« Chambre de combustion »");
    expect(askPrompt(model, part, "ja")).toContain("Brennkammer");
  });

  test("aucun jeton de remplacement ne reste dans la phrase", () => {
    for (const l of [...CONTENT_LOCALES, "zh"]) expect(askPrompt(model, part, l)).not.toMatch(/\{(model|part)\}/);
  });
});

describe("le cadrage : le modèle entier tient dans l'écran, téléphone debout compris", () => {
  const model = EXPLORER_MODELS.turbofan;
  const FOV = 35;
  /** Largeur visible à cette distance, pour ce cadre. */
  const visibleWidth = (d: number, aspect: number) => 2 * d * Math.tan(Math.atan(Math.tan((FOV * Math.PI) / 360) * aspect));

  test("écran large : la distance de départ suffit, la caméra ne recule pas", () => {
    expect(cameraDistance(model, 16 / 9, FOV)).toBeCloseTo(Math.hypot(...model.camera), 6);
    expect(cameraStart(model, 16 / 9, FOV)).toEqual(model.camera);
  });

  test("téléphone debout (cadre 4:5) : la caméra recule jusqu'à voir les 6,2 de long du moteur", () => {
    const d = cameraDistance(model, 0.8, FOV);
    expect(d).toBeGreaterThan(Math.hypot(...model.camera));
    expect(visibleWidth(d, 0.8)).toBeGreaterThanOrEqual(6.2);
  });

  test("elle recule dans SA direction : même angle de vue, plus loin", () => {
    const far = cameraStart(model, 0.6, FOV);
    const k = far[0] / model.camera[0];
    expect(k).toBeGreaterThan(1);
    expect(far[1] / model.camera[1]).toBeCloseTo(k, 10);
    expect(far[2] / model.camera[2]).toBeCloseTo(k, 10);
  });

  test("un cadre dégénéré (largeur nulle pendant la mise en page) ne donne pas l'infini", () => {
    expect(Number.isFinite(cameraDistance(model, 0, FOV))).toBe(true);
  });
});
