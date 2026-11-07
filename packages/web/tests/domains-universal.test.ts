import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateStructure, FAMILIES, familyHint, resolveFamily, SCHEMAS } from "../src/api/lib/domains";
import { detectDomain, domainHint } from "../src/api/lib/solvers/domain";

/** TRED, tuteur de TOUTES les matières : biologie, psychologie, philosophie, langues, histoire. */

describe("Détection des cinq nouvelles matières", () => {
  test.each([
    ["Erkläre den dominant-rezessiven Erbgang nach Mendel mit Genotyp und Phänotyp", "biologie"],
    ["Was passiert in der Prophase der Mitose?", "biologie"],
    ["Was ist der Bestätigungsfehler und welche kognitiven Verzerrungen gibt es noch?", "psychologie"],
    ["Erkläre die operante Konditionierung nach Skinner", "psychologie"],
    ["Erkläre den kategorischen Imperativ von Kant", "philosophie"],
    ["Utilitarisme ou déontologie : que faire dans le dilemme du tramway ?", "philosophie"],
    ["Konjugiere « aller » au passé composé", "sprachen"],
    ["Correct my grammar: I have went to school yesterday", "sprachen"],
    ["Quellenanalyse: Rede Bismarcks zum Sozialistengesetz", "geschichte"],
    ["Was waren die Ursachen des Ersten Weltkriegs?", "geschichte"],
  ])("%p → %p", (text, domain) => {
    const g = detectDomain(text);
    expect(g.domain).toBe(domain as never);
    expect(domainHint(g)).toBeNull(); // la famille prend le relais, pas « KEINEN Fachlöser »
  });

  test.each([
    ["Wie markiere ich eine Zelle in Excel?", "biologie"],
    ["Konfiguriere den DNS-Server im Netzwerk", "biologie"],
    ["Das Übertragungsverhalten eines PT1-Glieds", "psychologie"],
    ["Wie ist das Verhalten des Schwingkreises bei Resonanz?", "psychologie"],
    ["Wie lösche ich die git history?", "geschichte"],
    ["Erzähl mir eine Geschichte", "geschichte"],
    ["Übersetzung des Getriebes i = 3", "sprachen"],
    ["Explique en français le moment fléchissant", "sprachen"],
    ["Bilde die komplex konjugierte Zahl von 3 + 4i", "sprachen"],
    ["Dominante Strategie im Gefangenendilemma", "biologie"],
  ])("pas de faux positif : %p ≠ %p", (text, notDomain) => {
    expect(detectDomain(text).domain).not.toBe(notDomain as never);
  });
});

describe("Familles et garde-fous", () => {
  test.each([
    ["Mendel und der Genotyp", "biology", "Punnett"],
    ["Bestätigungsfehler", "psychology", "SORKC"],
    ["Kategorischer Imperativ", "philosophy", "Strohmann"],
    ["Konjugiere das Verb im Präteritum", "languages", "falsche Form → richtige Form"],
    ["Quellenkritik einer Rede", "history", "Datierung"],
  ])("%p → famille %p, méthode et evaluate_structure", (text, id, method) => {
    const fam = resolveFamily(detectDomain(text));
    expect(fam?.id).toBe(id as never);
    const h = familyHint(fam)!;
    expect(h).toContain(method);
    expect(h).toContain("evaluate_structure");
    expect(h).toContain("Mische NIE die Methoden");
    expect(fam!.evaluation.kind).toBe("structure");
  });

  test("garde-fous : psychologie sans diagnostic (112, TelefonSeelsorge) ; sources jamais inventées", () => {
    expect(FAMILIES.psychology.prompt).toContain("KEINE Diagnose");
    expect(FAMILIES.psychology.prompt).toContain("0800 111 0 111");
    expect(FAMILIES.history.prompt).toContain("NIE erfinden");
    expect(FAMILIES.philosophy.prompt).toContain("nie ein Zitat erfinden");
    expect(FAMILIES.psychology.prompt).toContain("nie eine Studie erfinden");
    // Les garde-fous déjà en place restent
    expect(FAMILIES.law.prompt).toContain("Keine Rechtsberatung im Einzelfall");
    expect(FAMILIES.medicine.prompt).toContain("im Notfall 112");
    expect(FAMILIES.economics.prompt).toContain("Keine Anlageberatung");
  });

  test("au lycée, une analyse de source reste une analyse de source (+ niveau scolaire)", () => {
    const text = "Klasse 10: Quellenanalyse einer Rede von 1918";
    const fam = resolveFamily(detectDomain(text), { text });
    expect(fam?.id).toBe("history");
    expect(familyHint(fam, { school: true })).toContain("SCHULNIVEAU");
    expect(familyHint(fam)).not.toContain("SCHULNIVEAU");
    // Maths au lycée : toujours la famille « école »
    const math = "Klasse 10: quadratische Gleichung";
    expect(resolveFamily(detectDomain(math), { text: math })?.id).toBe("highschool");
  });
});

describe("evaluate_structure — histoire : source et date", () => {
  const RED =
    "Bei der Quelle handelt es sich um eine Rede von Otto von Bismarck vor dem Reichstag vom 6. Februar 1888. " +
    "Inhaltlich fordert Bismarck eine Stärkung des Heeres. " +
    "Vor dem Hintergrund der Spannungen mit Frankreich und Russland ist die Rede einzuordnen. " +
    "Insgesamt ist die Quelle als einseitig zu beurteilen, da Bismarck die Abgeordneten gewinnen wollte.";

  test("interprétation complète : 100", () => {
    const r = evaluateStructure("geschichte", RED);
    expect(r.missing).toEqual([]);
    expect(r.orderOk).toBe(true);
    expect(r.score).toBe(100);
    expect(r.steps.find((s) => s.id === "datierung")?.evidence).toContain("6. Februar 1888");
  });

  test("date oubliée : −20 et rappel explicite", () => {
    const r = evaluateStructure("geschichte", RED.replace(" vom 6. Februar 1888", ""));
    expect(r.missing).toEqual(["Datierung"]);
    expect(r.score).toBe(80);
    expect(r.feedback.join(" ")).toContain("ohne Datum ist keine historische Einordnung möglich");
  });

  test("source non citée : rappel explicite", () => {
    const r = evaluateStructure("geschichte", "Inhaltlich geht es um das Jahr 1848. Vor dem Hintergrund der Revolution ist das wichtig.");
    expect(r.missing).toContain("Quelle");
    expect(r.feedback.join(" ")).toContain("Nenne zu Beginn IMMER die Quelle");
  });
});

describe("evaluate_structure — biologie, psychologie, philosophie, langues", () => {
  const PROTOKOLL = [
    "Fragestellung: Hängt die Aktivität der Katalase von der Temperatur ab?",
    "Hypothese: Wenn die Temperatur über 40 °C steigt, dann sinkt die Enzymaktivität.",
    "Durchführung: Je 5 mL Wasserstoffperoxid wurden bei 20, 40 und 60 °C mit Kartoffelstücken versetzt; Kontrollansatz ohne Kartoffel.",
    "Beobachtung: Bei 40 °C entstand am meisten Schaum, bei 60 °C kaum.",
    "Deutung: Die Hypothese wird bestätigt; das Enzym denaturiert bei hoher Temperatur.",
  ];

  test("protocole complet : 100 ; hypothèse après l'expérience : −10", () => {
    expect(evaluateStructure("biologie", PROTOKOLL.join(" ")).score).toBe(100);
    const late = [PROTOKOLL[0], PROTOKOLL[2], PROTOKOLL[1], PROTOKOLL[3], PROTOKOLL[4]].join(" ");
    const r = evaluateStructure("biologie", late);
    expect(r.orderIssues).toEqual(["Durchführung vor Hypothese"]);
    expect(r.score).toBe(90);
  });

  test("rapport empirique (APA) complet : 100", () => {
    const apa =
      "Theoretischer Hintergrund: Nach Tversky und Kahneman (1974) verzerrt ein Anker Schätzungen. " +
      "Hypothese: Ein hoher Anker führt zu höheren Schätzungen. " +
      "Methode: 60 Studierende wurden zufällig zwei Gruppen zugeteilt (UV: Ankerhöhe, AV: Schätzwert). " +
      "Ergebnisse: Die Gruppe mit hohem Anker schätzte signifikant höher, p < .01. " +
      "Diskussion: Die Stichprobe bestand nur aus Studierenden, was die Generalisierbarkeit einschränkt.";
    expect(evaluateStructure("psychologie", apa)).toMatchObject({ score: 100, missing: [] });
  });

  test("analyse SORKC complète : 100", () => {
    const sorkc =
      "S: In der Vorlesung soll Lisa ein Referat halten. O: Lerngeschichte mit Auslachen in der Schule. " +
      "R: Herzklopfen, sie meldet sich krank. K: jedes Mal, wenn ein Referat ansteht. " +
      "C: kurzfristig Erleichterung (negative Verstärkung), langfristig wächst die Angst.";
    expect(evaluateStructure("verhaltensanalyse", sorkc)).toMatchObject({ score: 100, missing: [] });
  });

  test("essai philosophique sans objection : −25 et conseil ; avec objection : 100", () => {
    const base = "Ich behaupte, dass Lügen immer falsch ist. Denn nach Kant kann man nicht wollen, dass Lügen ein allgemeines Gesetz wird. ";
    const end = "Daraus folgt, dass auch eine Notlüge unzulässig ist.";
    const r = evaluateStructure("philosophie", base + end);
    expect(r.missing).toEqual(["Einwand"]);
    expect(r.score).toBe(75);
    expect(r.feedback.join(" ")).toContain("Ein Essay ohne Einwand bleibt Behauptung");
    const full = base + "Man könnte einwenden, dass eine Lüge ein Leben retten kann. " + end;
    expect(evaluateStructure("philosophie", full).score).toBe(100);
    // L'anglais « these » n'est pas une thèse
    expect(evaluateStructure("philosophie", "These results are good because they are.").missing).toContain("These");
  });

  test("rédaction en français et en anglais : 100", () => {
    const fr =
      "Introduction : faut-il interdire les voitures en ville ? D'une part, la pollution diminue. De plus, la ville devient plus calme. " +
      "Par exemple, Oslo a réduit le trafic au centre. En conclusion, une interdiction partielle semble raisonnable.";
    const en =
      "In this essay I discuss remote work. On the one hand, employees save time. Furthermore, companies save office costs. " +
      "For example, many firms closed offices. To sum up, remote work has clear benefits.";
    expect(evaluateStructure("sprachen", fr).score).toBe(100);
    expect(evaluateStructure("sprachen", en).score).toBe(100);
  });
});

describe("Outil evaluate_structure", () => {
  test("le schéma de l'outil accepte toutes les structures du moteur", () => {
    const agent = readFileSync(join(import.meta.dir, "../src/api/agent/index.ts"), "utf8");
    const enumLine = agent.split("\n").find((l) => l.includes('domain: z.enum(["recht"'))!;
    for (const d of Object.keys(SCHEMAS)) expect(enumLine).toContain(`"${d}"`);
    expect(agent).toContain("TRED begleitet ALLE Fächer");
  });
});
