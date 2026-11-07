import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildTutorAgent } from "../src/api/agent/index";
import { resolveFamily } from "../src/api/lib/domains";
import { detectDomain } from "../src/api/lib/solvers/domain";
import { LEVEL_GUIDANCE, studyLevelOf, studyProfileHint } from "../src/api/lib/study-profile";
import { curriculumFor } from "../src/api/prompts";
import { STUDY_LEVELS } from "../src/web/stores/user";
import { de } from "../src/web/i18n/messages/de";
import { en } from "../src/web/i18n/messages/en";
import { fr } from "../src/web/i18n/messages/fr";
import { es } from "../src/web/i18n/messages/es";

describe("Niveau d'études : le prompt s'adapte", () => {
  test("Master : plus compact, bases du Bachelor supposées acquises", () => {
    const h = studyProfileHint({ degree: "Maschinenbau", level: "master" })!;
    expect(h).toContain("Niveau: Master");
    expect(h).toContain("Bachelor-Grundlagen voraussetzen");
    expect(h).toContain("Gültigkeitsgrenzen");
  });

  test("Lycée : langue de l'école, pas de semestre", () => {
    const h = studyProfileHint({ degree: "Physik-LK", semester: "3", level: "school" })!;
    expect(h).toContain("Niveau: Schule (Oberstufe)");
    expect(h).toContain("Schulsprache");
    expect(h).not.toContain("Semester: 3");
  });

  test("Bachelor et Doctorat ; chaque niveau a sa consigne", () => {
    expect(studyProfileHint({ level: "bachelor" })).toContain("JEDEN Zwischenschritt");
    expect(studyProfileHint({ level: "phd" })).toContain("Forschungsstand");
    expect(Object.keys(LEVEL_GUIDANCE).sort()).toEqual([...STUDY_LEVELS].sort());
  });

  test("valeur fermée : rien d'autre n'est accepté", () => {
    for (const bad of ["toString", "__proto__", "<script>", "MASTER", 3, null]) expect(studyLevelOf(bad)).toBeNull();
    expect(studyProfileHint({ level: "toString" })).toBeNull();
    // sans niveau : comportement d'avant
    expect(studyProfileHint({ degree: "Elektrotechnik" })).not.toContain("ERKLÄRTIEFE");
  });

  test("Lycée → famille école et programme « highschool »", () => {
    expect(resolveFamily(detectDomain("Ableitung von x^2"), { level: "school" })?.id).toBe("highschool");
    expect(curriculumFor({ level: "school" })).toBe("highschool");
    expect(curriculumFor({ level: "master" })).toBe("germany");
  });

  test("la consigne de niveau ne touche pas le bloc mis en cache", () => {
    type Instr = { settings: { instructions: { content: string }[] } };
    const a = buildTutorAgent({ sources: [], locale: "de", studyProfile: studyProfileHint({ level: "master" }) }) as unknown as Instr;
    const b = buildTutorAgent({ sources: [], locale: "de", studyProfile: studyProfileHint({ level: "school" }) }) as unknown as Instr;
    expect(a.settings.instructions[0].content).toBe(b.settings.instructions[0].content);
    expect(a.settings.instructions.slice(1).map((i) => i.content).join("\n")).toContain("ERKLÄRTIEFE");
  });
});

describe("Niveau d'études : profil, réglages, inscription", () => {
  test("le chat envoie le niveau avec chaque question", () => {
    const chat = readFileSync(join(import.meta.dir, "../src/web/pages/chat.tsx"), "utf8");
    expect(chat).toContain("level: p.studyLevel || undefined");
  });

  test("réglages et inscription proposent Lycée, Bachelor, Master, Doctorat", () => {
    const settings = readFileSync(join(import.meta.dir, "../src/web/pages/settings.tsx"), "utf8");
    expect(settings).toContain("<StudyLevelPicker />");
    const onboarding = readFileSync(join(import.meta.dir, "../src/web/pages/onboarding.tsx"), "utf8");
    expect(onboarding).toContain('name="studyLevel"');
    expect(fr.studyLevels).toEqual({ school: "Lycée", bachelor: "Licence / Bachelor", master: "Master", phd: "Doctorat" });
    for (const pack of [de, en, fr, es]) {
      for (const l of STUDY_LEVELS) expect(pack.studyLevels[l]).not.toBe("");
      expect(pack.common.studyLevel).not.toBe("");
      expect(pack.settings.studyLevelDesc).not.toBe("");
      expect(pack.onboarding.selectStudyLevel).not.toBe("");
    }
  });
});
