import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildTutorAgent } from "../src/api/agent/index";
import { DEFAULT_PROFESSOR, LAUNCH_PROFESSOR_IDS, PROFESSOR_IDS, PROFESSORS, isProfessorId, professorText } from "../src/api/lib/professors";

const prompt = (professor?: (typeof PROFESSOR_IDS)[number]) =>
  JSON.stringify(buildTutorAgent({ sources: [], locale: "de", professor }));

describe("vestiaire des professeurs — NIVEAU 2b", () => {
  for (const id of PROFESSOR_IDS) {
    test(`${id} : sa personnalité est injectée, et elle seule`, () => {
      const p = prompt(id);
      expect(p).toContain(PROFESSORS[id].persona[0]!);
      for (const other of PROFESSOR_IDS.filter((o) => o !== id)) {
        expect(p).not.toContain(PROFESSORS[other].persona[0]!);
      }
    });
  }

  test("sans choix → le Jeune Génie", () => {
    expect(DEFAULT_PROFESSOR).toBe("genius");
    expect(prompt()).toContain(PROFESSORS.genius.persona[0]!);
  });

  test("le rôle ne prime jamais sur l'exactitude", () => {
    expect(prompt("maverick")).toContain("Die Rolle bestimmt den TON, nie den Inhalt");
  });

  test("validation des identifiants", () => {
    expect(isProfessorId("sensei")).toBe(true);
    expect(isProfessorId("gojo")).toBe(false);
    expect(isProfessorId(undefined)).toBe(false);
  });

  test("les avatars générés pointent vers public/avatars en WebP", () => {
    expect(PROFESSORS.genius.image).toBe("/avatars/kenta.webp");
    expect(PROFESSORS.sensei.image).toBe("/avatars/haruto.webp");
    expect(PROFESSORS.maverick.image).toBe("/avatars/ren.webp");
    expect(PROFESSORS.examiner.image).toBe("/avatars/aiko.webp");
  });
});

/**
 * Cinq professeurs de plus (2026-11-15) : le stratège, le farceur,
 * l'observateur, la médecin, l'analyste. Des archétypes à nous — chacun avec
 * son ton, sa méthode et son avatar.
 */
describe("neuf professeurs, neuf voix distinctes", () => {
  const all = PROFESSOR_IDS.map((id) => PROFESSORS[id]);

  test("les cinq nouveaux sont au vestiaire, après les quatre du lancement", () => {
    expect([...PROFESSOR_IDS]).toEqual(["genius", "sensei", "maverick", "examiner", "strategist", "trickster", "observer", "medic", "analyst"]);
    expect([...LAUNCH_PROFESSOR_IDS]).toEqual(["genius", "sensei", "maverick", "examiner"]);
  });

  test("chaque professeur a un prompt système DISTINCT : aucune ligne de personnalité en commun", () => {
    const personas = all.map((p) => p.persona.join("\n"));
    expect(new Set(personas).size).toBe(all.length);
    const lines = all.flatMap((p) => p.persona.map((l) => l.trim()));
    expect(new Set(lines).size).toBe(lines.length);
    // Et le prompt complet du tuteur diffère d'un professeur à l'autre.
    expect(new Set(PROFESSOR_IDS.map((id) => prompt(id))).size).toBe(PROFESSOR_IDS.length);
  });

  test("chacun se présente par son nom, et a au moins trois règles de méthode", () => {
    for (const p of all) {
      expect(p.persona[0]).toContain(`Du bist ${p.name}`);
      expect(p.persona.filter((l) => l.startsWith("- ")).length).toBeGreaterThanOrEqual(3);
    }
  });

  test("le ton demandé : stratège en étapes, farceur drôle, observateur qui questionne, médecin précise, analyste direct", () => {
    const text = (id: (typeof PROFESSOR_IDS)[number]) => PROFESSORS[id].persona.join(" ");
    expect(text("strategist")).toMatch(/Lagebild/);
    expect(text("strategist")).toMatch(/Etappen/);
    expect(text("trickster")).toMatch(/lustigen Analogien/);
    expect(text("observer")).toMatch(/gezielten Frage/);
    expect(text("medic")).toMatch(/präzise/);
    expect(text("analyst")).toMatch(/Direkt zur Sache/);
  });

  test("garde-fous : l'humour ne vise jamais la personne, la médecin ne donne aucun avis médical personnel", () => {
    expect(PROFESSORS.trickster.persona.join(" ")).toContain("nie auf Kosten der Person");
    expect(PROFESSORS.medic.persona.join(" ")).toMatch(/keine Diagnose[\s\S]*keinen\s+persönlichen medizinischen Rat/);
    expect(PROFESSORS.observer.persona.join(" ")).toContain("Verlangt die Person ausdrücklich die Lösung, bekommt sie sie.");
    expect(PROFESSORS.strategist.persona.join(" ")).toContain("nie kriegerisch");
  });

  test("noms, titres et descriptions : uniques, dans les trois langues", () => {
    expect(new Set(all.map((p) => p.name)).size).toBe(all.length);
    for (const locale of ["de", "en", "fr"]) {
      expect(new Set(all.map((p) => professorText(p.title, locale))).size).toBe(all.length);
      for (const p of all) expect(professorText(p.description, locale).length).toBeGreaterThan(40);
    }
  });

  test("chaque avatar existe : le .webp servi et le .png source", () => {
    const AVATARS = join(import.meta.dir, "../public/avatars");
    expect(new Set(all.map((p) => p.image)).size).toBe(all.length);
    for (const p of all) {
      expect(p.image).toMatch(/^\/avatars\/[a-z]+\.webp$/);
      const file = p.image!.replace("/avatars/", "");
      expect(existsSync(join(AVATARS, file))).toBe(true);
      expect(existsSync(join(AVATARS, file.replace(".webp", ".png")))).toBe(true);
    }
  });

  test("des personnages à nous : aucun nom de personnage ou d'œuvre existante dans le vestiaire ni dans les crédits", () => {
    const sources = [readFileSync(join(import.meta.dir, "../src/api/lib/professors.ts"), "utf8"), readFileSync(join(import.meta.dir, "../public/avatars/CREDITS.md"), "utf8")].join("\n");
    // Fragments, pour que ce test ne contienne pas lui-même les noms entiers.
    const forbidden = ["Erw" + "in", "Koro", "Nagi" + "sa", "Tsun" + "ade", "Ayano", "Kiyo" + "taka", "Naru" + "to", "Titan", "Goj" + "o", "Classroom of"];
    for (const name of forbidden) expect(sources).not.toContain(name);
  });

  test("le sélecteur affiche tout le vestiaire, et le choix est accepté par le serveur pour chaque identifiant", () => {
    const picker = readFileSync(join(import.meta.dir, "../src/web/components/professor-picker.tsx"), "utf8");
    expect(picker).toContain("{PROFESSOR_IDS.map((id) => {");
    const account = readFileSync(join(import.meta.dir, "../src/api/routes/account.ts"), "utf8");
    expect(account).toContain("z.object({ professorId: z.enum(PROFESSOR_IDS) })");
    for (const id of PROFESSOR_IDS) expect(isProfessorId(id)).toBe(true);
  });
});
