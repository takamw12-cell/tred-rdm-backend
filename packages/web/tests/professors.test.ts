import { describe, expect, test } from "bun:test";
import { buildTutorAgent } from "../src/api/agent/index";
import { DEFAULT_PROFESSOR, PROFESSOR_IDS, PROFESSORS, isProfessorId } from "../src/api/lib/professors";

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
  });
});
