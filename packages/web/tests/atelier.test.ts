import { describe, expect, test } from "bun:test";
import { exercisesHref, simulatorFor, studyTaskHref } from "../src/web/lib/atelier";

describe("Atelier — du plan d'étude au simulateur et aux exercices", () => {
  test("un thème d'électrotechnique trouve le diviseur de tension", () => {
    expect(simulatorFor("Spannungsteiler")?.id).toBe("spannungsteiler");
    expect(simulatorFor("Kapitel 3", "Grundlagen der Elektrotechnik")?.id).toBe("spannungsteiler");
    expect(simulatorFor("Ohmsches Gesetz")?.id).toBe("spannungsteiler");
    expect(simulatorFor("Résistance équivalente")?.id).toBe("spannungsteiler");
  });

  test("un autre thème n'en trouve pas (pas de faux ami : « Wohnung » ne contient pas « ohm »)", () => {
    expect(simulatorFor("Biegemoment", "Technische Mechanik")).toBeNull();
    expect(simulatorFor("Wohnungsmarkt")).toBeNull();
    expect(simulatorFor("", null, undefined)).toBeNull();
  });

  test("la tâche mène au simulateur avec son thème, sinon aux exercices préremplis", () => {
    expect(studyTaskHref("Spannungsteiler", "Elektrotechnik")).toBe("/explorer?atelier=spannungsteiler&topic=Spannungsteiler&subject=Elektrotechnik");
    expect(studyTaskHref("Biegemoment", "Technische Mechanik")).toBe("/exercises?subject=Technische+Mechanik&chapter=Biegemoment");
    expect(exercisesHref("")).toBe("/exercises");
  });
});
