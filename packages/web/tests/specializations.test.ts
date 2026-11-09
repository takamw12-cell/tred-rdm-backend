import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  domainContext,
  detectSpecialization,
  SPECIALIZATIONS,
  SPECIALIZATION_THRESHOLD,
  SUBDOMAINS,
  type SpecializationId,
} from "../src/api/lib/domains";

/**
 * Taxonomie avancée (famille → sous-domaine → spécialisation), testée sur le
 * MÊME chemin que le tuteur : domainContext(), appelé par api/index.ts pour
 * chaque question. Pas de modèle ici : on vérifie que la bonne méthode est
 * chargée dans le message système — c'est elle qui guide la réponse.
 */
const DOMAINS_DIR = join(import.meta.dir, "../src/api/lib/domains");
const AGENT = readFileSync(join(import.meta.dir, "../src/api/agent/index.ts"), "utf8");
const API = readFileSync(join(import.meta.dir, "../src/api/index.ts"), "utf8");

describe("spécialisations — détection sur des questions réelles", () => {
  test.each([
    ["Haftet der Geschäftsführer einer GmbH nach § 43 GmbHG persönlich, wenn er das Stammkapital zurückzahlt?", "corporate_law"],
    ["Prüfe die Strafbarkeit des A wegen Betrugs nach § 263 StGB.", "criminal_law"],
    ["Darf ein Staat sich nach Art. 51 der UN-Charta auf das Selbstverteidigungsrecht berufen?", "international_law"],
    ["Berechne den Druck hinter einem senkrechten Verdichtungsstoß bei Ma = 2.", "compressible_flow"],
    ["Wie berechne ich den Auftriebsbeiwert eines NACA 2412 Profils bei 4° Anstellwinkel?", "aerodynamics"],
    ["Wie stelle ich die Steifigkeitsmatrix für ein Stabelement in der FEM auf?", "finite_elements"],
    ["Bemessung eines Stahlbeton-Balkens: Biegebemessung nach Eurocode 2", "reinforced_concrete"],
    ["Tiefsetzsteller im lückenden Betrieb: Tastgrad berechnen", "power_electronics"],
    ["Diagnostik bei NSTEMI: welche Rolle spielt Troponin?", "cardiology"],
    ["Pathophysiologie des ischämischen Schlaganfalls und Zeitfenster der Thrombolyse?", "neurology"],
    ["Indikation zur Cholezystektomie, laparoskopisch oder offen?", "surgery"],
    ["Quelle est la différence entre une SARL et une société anonyme en droit des sociétés ?", "corporate_law"],
    ["Explain the shock wave in a de Laval nozzle at supersonic speed.", "compressible_flow"],
  ] as const)("%s → %s", (question, expected) => {
    expect(domainContext(question).specialization?.specialization.id).toBe(expected);
  });

  test.each([
    "Was ist ein Vertrag?",
    "Was ist 2 + 2?",
    "Erkläre mir das Ohmsche Gesetz.",
    "Was ist Mord?",
    "Hallo!",
  ])("question de base, pas de mode Master : %s", (question) => {
    expect(domainContext(question).specialization).toBeNull();
  });

  test("au lycée : jamais de spécialisation (le mode Vorlesung est un niveau Master)", () => {
    expect(domainContext("Abitur: Wie berechne ich den Auftrieb eines Flugzeugs? Aerodynamik").specialization).toBeNull();
    expect(domainContext("Aerodynamik: Auftriebsbeiwert eines NACA 0012", { level: "school" }).specialization).toBeNull();
  });

  test("la famille reconnue prime : un cas de droit pénal sur une opération reste du droit", () => {
    const r = domainContext("Ein Arzt operiert ohne Einwilligung — strafbar nach § 223 StGB (Körperverletzung)?");
    expect(r.family?.id).toBe("law");
    expect(r.specialization?.specialization.id).toBe("criminal_law");
  });

  test("« Haftung » en mécanique reste de la mécanique", () => {
    const r = domainContext("Ein Klotz liegt auf der schiefen Ebene, Haftung mit μ0 = 0,3: rutscht er?");
    expect(r.family?.id).toBe("stem");
    expect(r.guess.domain).toBe("mechanik");
    expect(r.specialization).toBeNull();
  });

  test("un mot répété ne gonfle pas le score", () => {
    const once = detectSpecialization("Aerodynamik")?.score ?? 0;
    const many = detectSpecialization("Aerodynamik Aerodynamik Aerodynamik Aerodynamik")?.score ?? 0;
    expect(many).toBe(once);
    expect(once).toBeGreaterThanOrEqual(SPECIALIZATION_THRESHOLD);
  });
});

describe("spécialisations — la bonne méthode est chargée (intégration)", () => {
  test("droit des sociétés : Gutachtenstil + méthode Gesellschaftsrecht + Vorlesung + Skripte d'abord", () => {
    const r = domainContext("Haftung des GmbH-Geschäftsführers nach § 43 GmbHG bei verbotener Auszahlung des Stammkapitals");
    const hint = r.hints.join("\n\n");
    expect(r.family?.id).toBe("law");
    expect(r.specialization?.subdomain.id).toBe("corporate");
    // « Haftung » marque aussi en mécanique (adhérence) : la matière est recalée
    // sur le droit, aucun indice de solveur de mécanique ne s'y mêle.
    expect(r.guess.domain).toBe("recht");
    expect(hint).toContain("Gutachtenstil"); // méthode de la famille Recht
    expect(hint).toContain("METHODE GESELLSCHAFTSRECHT");
    expect(hint).toContain("GmbHG, AktG");
    expect(hint).toContain("VORLESUNGS-MODUS");
    expect(hint).toContain("Master-Vorlesung");
    expect(hint).toMatch(/ZUERST suche_in_unterlagen/);
    expect(hint).toContain("In deinen Unterlagen finde ich dazu nichts");
    expect(hint).toContain("KEINE Allgemeinplätze");
    // Ordre : la famille (générale) d'abord, la spécialisation (précise) ensuite.
    expect(hint.indexOf("Gutachtenstil")).toBeLessThan(hint.indexOf("SPEZIALISIERUNG ERKANNT"));
  });

  test("ingénierie : les solveurs sont cités pour les équations", () => {
    const hint = domainContext("Verdichtungsstoß bei Ma = 2: Druckverhältnis?").hints.join("\n");
    expect(hint).toContain("Kompressible Strömungen");
    expect(hint).toMatch(/rechne mit den Lösern \(.*thermo_berechnen/);
  });

  test("médecine reconnue par la seule spécialisation : la méthode médicale et ses garde-fous suivent", () => {
    const r = domainContext("Diagnostik bei NSTEMI: welche Rolle spielt Troponin?");
    expect(r.family?.id).toBe("medicine");
    const hint = r.hints.join("\n");
    expect(hint).toContain("METHODE MEDIZIN");
    expect(hint).toContain("KEINE Diagnose");
    expect(hint).toContain("METHODE KARDIOLOGIE");
  });

  test("le tuteur suit ce chemin : api/index.ts appelle domainContext pour chaque question", () => {
    expect(API).toContain("domainContext(lastUserText, { contextLabel, level })");
    expect(API).toContain("...routing.hints");
  });

  test("entrées hostiles : vide, énorme, binaire — aucune exception, réponse rapide", () => {
    const huge = "Verdichtungsstoß ".repeat(100_000) + "\u0000￿😀";
    const t0 = performance.now();
    for (const q of ["", "   ", huge, "\u0000".repeat(1000), "<script>alert(1)</script>"]) {
      expect(() => domainContext(q)).not.toThrow();
    }
    expect(domainContext(null).specialization).toBeNull();
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});

describe("spécialisations — architecture et typage strict", () => {
  const specDir = join(DOMAINS_DIR, "specializations");
  const files = readdirSync(specDir).filter((f) => f.endsWith(".ts") && !["index.ts", "types.ts"].includes(f));

  test("un fichier par spécialisation, enregistré, et inversement", () => {
    const ids = Object.keys(SPECIALIZATIONS).sort();
    expect(files.map((f) => f.replace(/\.ts$/, "")).sort()).toEqual(ids);
    for (const [id, spec] of Object.entries(SPECIALIZATIONS)) {
      expect(spec.id).toBe(id as SpecializationId);
      expect(Array.isArray(spec.rules)).toBe(true); // point d'extension prévu
      expect(spec.keywords.length).toBeGreaterThan(0);
      for (const [re, w] of spec.keywords) {
        expect(re.flags).toContain("u");
        expect(w).toBeGreaterThan(0);
      }
    }
  });

  test("chaque sous-domaine demandé existe et a au moins une spécialisation", () => {
    const expected = {
      stem: ["aerospace", "mechanical", "electrical", "civil", "fluid_dynamics"],
      law: ["corporate", "criminal", "international"],
      medicine: ["cardiology", "neurology", "surgery"],
    };
    for (const [family, subs] of Object.entries(expected)) {
      for (const sub of subs) {
        expect(SUBDOMAINS[sub as keyof typeof SUBDOMAINS].family).toBe(family as "stem" | "law" | "medicine");
        expect(Object.values(SPECIALIZATIONS).some((s) => s.subdomain === sub)).toBe(true);
      }
    }
  });

  test("chaque outil cité par un sous-domaine existe vraiment dans le tuteur", () => {
    for (const sub of Object.values(SUBDOMAINS)) {
      for (const tool of sub.tools) expect(AGENT).toMatch(new RegExp(`\\b${tool}: tool\\(`));
    }
  });

  test("aucun `any` dans lib/domains", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : [],
      );
    for (const file of walk(DOMAINS_DIR)) {
      const src = readFileSync(file, "utf8");
      expect({ file, hit: /:\s*any\b|<any>|\bas any\b|\bany\[\]/.exec(src)?.[0] ?? null }).toEqual({ file, hit: null });
    }
  });
});
