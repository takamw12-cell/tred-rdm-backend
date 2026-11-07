import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateStructure, FAMILIES, familyHint, isSchoolContext, resolveFamily } from "../src/api/lib/domains";
import { detectDomain, domainHint } from "../src/api/lib/solvers/domain";
import { buildTutorAgent } from "../src/api/agent/index";
import { chatPhase } from "../src/web/lib/chat-phase";
import { de } from "../src/web/i18n/messages/de";

const GUTACHTEN =
  "Sachverhalt: K will von V die Übergabe des Fahrrads. " +
  "Anspruchsgrundlage: K könnte gegen V einen Anspruch auf Übergabe und Übereignung aus § 433 Abs. 1 S. 1 BGB haben. " +
  "Voraussetzung ist ein wirksamer Kaufvertrag. Ein Kaufvertrag liegt vor, wenn zwei übereinstimmende Willenserklärungen vorliegen. " +
  "Hier haben K und V sich über Fahrrad und Preis geeinigt; die Voraussetzung ist somit erfüllt. " +
  "Ergebnis: K hat gegen V einen Anspruch aus § 433 Abs. 1 S. 1 BGB.";

describe("Détection des nouvelles matières", () => {
  test.each([
    ["Hat K gegen V einen Anspruch aus § 433 Abs. 2 BGB?", "recht"],
    ["Wie prüfe ich im Gutachtenstil die Anspruchsgrundlage im Zivilrecht?", "recht"],
    ["Quelle est la base légale en droit des contrats ? Code civil", "recht"],
    ["Patient mit Thoraxschmerz: Anamnese und Differenzialdiagnose?", "medizin"],
    ["Erkläre die Anatomie des Herzens für die Klinik", "medizin"],
    ["Berechne den Kapitalwert einer Investition mit 5 % Zins", "wirtschaft"],
    ["Was ist Preiselastizität in der Mikroökonomie?", "wirtschaft"],
  ])("%p → %p", (text, domain) => {
    expect(detectDomain(text).domain).toBe(domain as never);
  });

  test("pas de faux positifs en ingénierie", () => {
    expect(detectDomain("Ohm's law: U = R · I mit R = 1 kΩ").domain).toBe("elektrotechnik");
    expect(detectDomain("Balken mit Festlager, Einzellast 10 kN").domain).toBe("mechanik");
    expect(detectDomain("Ich habe einen hohen Anspruch an meine Lösung").domain).toBe("unbekannt");
    expect(detectDomain("Fehlerdiagnose am Getriebe").domain).not.toBe("medizin");
  });

  test("plus de « pas de solveur » pour le droit : la famille prend le relais", () => {
    expect(domainHint(detectDomain("Anspruch aus § 823 BGB?"))).toBeNull();
  });
});

describe("Familles", () => {
  test("résolution : matière → famille ; niveau scolaire en priorité", () => {
    expect(resolveFamily(detectDomain("Anspruch aus § 823 BGB?"))?.id).toBe("law");
    expect(resolveFamily(detectDomain("Verdachtsdiagnose bei Fieber?"))?.id).toBe("medicine");
    expect(resolveFamily(detectDomain("Kapitalwert bei 5 %"))?.id).toBe("economics");
    expect(resolveFamily(detectDomain("Balken mit Festlager"))?.id).toBe("stem");
    const school = "Klasse 10: Löse die quadratische Gleichung x^2 - 5x + 6 = 0";
    expect(resolveFamily(detectDomain(school), { text: school })?.id).toBe("highschool");
    expect(resolveFamily(detectDomain("Ableitung von x^2"), { level: "school" })?.id).toBe("highschool");
    expect(resolveFamily(detectDomain("Guten Morgen"))).toBeNull();
    expect(isSchoolContext("une seconde, s'il te plaît")).toBe(false);
    expect(isSchoolContext("Exercice de terminale")).toBe(true);
  });

  test("indice : méthode, où chercher, outils, ne pas mélanger ; rien de nouveau pour STEM", () => {
    const h = familyHint(FAMILIES.law)!;
    expect(h).toContain("Gutachtenstil");
    expect(h).toContain("evaluate_structure");
    expect(h).toContain("BGB");
    expect(h).toContain("Mische NIE die Methoden");
    expect(h).toContain("Keine Rechtsberatung im Einzelfall");
    expect(familyHint(FAMILIES.medicine)).toContain("im Notfall 112");
    expect(familyHint(FAMILIES.stem)).toBeNull();
    expect(familyHint(null)).toBeNull();
  });

  test("chaque famille ne cite que des outils qui existent vraiment", () => {
    const agent = buildTutorAgent({ sources: [], locale: "de", search: () => [] }) as unknown as { tools: Record<string, unknown> };
    const real = new Set(Object.keys(agent.tools));
    for (const f of Object.values(FAMILIES)) {
      for (const t of f.allowedTools) expect(real.has(t), `${f.id} → ${t}`).toBe(true);
      expect(f.rag.length).toBeGreaterThan(10);
    }
  });
});

describe("evaluate_structure — droit", () => {
  test("Gutachten complet et dans l'ordre : 100", () => {
    const r = evaluateStructure("recht", GUTACHTEN);
    expect(r.missing).toEqual([]);
    expect(r.orderOk).toBe(true);
    expect(r.score).toBe(100);
    expect(r.steps.find((s) => s.id === "anspruchsgrundlage")?.evidence).toContain("Anspruchsgrundlage");
    expect(r.limit).toContain("nicht die inhaltliche Richtigkeit");
  });

  test("Subsumtion oubliée : −25, et on dit ce qui manque", () => {
    const r = evaluateStructure("recht", "K will von V das Fahrrad. K könnte gegen V einen Anspruch aus § 433 BGB haben. Ergebnis: K hat einen Anspruch.");
    expect(r.missing).toEqual(["Subsumtion"]);
    expect(r.score).toBe(75);
    expect(r.feedback[0]).toContain("Es fehlt: Subsumtion (−25 Punkte)");
  });

  test("Urteilsstil (résultat d'abord) : pénalité d'ordre et explication", () => {
    const r = evaluateStructure(
      "recht",
      "K hat gegen V einen Anspruch aus § 433 Abs. 1 BGB. Denn ein Kaufvertrag liegt vor, wenn zwei Willenserklärungen übereinstimmen; das ist hier der Fall.",
    );
    expect(r.missing).toEqual(["Sachverhalt"]);
    expect(r.orderIssues).toEqual(["Ergebnis vor Anspruchsgrundlage", "Ergebnis vor Subsumtion"]);
    expect(r.score).toBe(55);
    expect(r.feedback.join(" ")).toContain("Urteilsstil");
  });

  test("copie en français", () => {
    const r = evaluateStructure(
      "recht",
      "Les faits : A a vendu un vélo à B. Fondement juridique : article 1103 du Code civil. En l'espèce, les conditions sont réunies. En conclusion, B doit payer le prix.",
    );
    expect(r.score).toBe(100);
  });
});

describe("evaluate_structure — médecine et économie", () => {
  const FALL =
    "Anamnese: 58-jähriger Patient klagt über drückende Thoraxschmerzen seit 30 Minuten, Raucher. " +
    "Verdachtsdiagnose: akutes Koronarsyndrom. " +
    "Differenzialdiagnosen: Lungenembolie, Aortendissektion, Pneumothorax. " +
    "Therapie: nach Leitlinie, Monitoring, Herzkatheter.";

  test("cas clinique complet : 100", () => {
    expect(evaluateStructure("medizin", FALL)).toMatchObject({ score: 100, missing: [], orderOk: true });
  });

  test("diagnostic différentiel oublié : −25", () => {
    const r = evaluateStructure("medizin", FALL.replace("Differenzialdiagnosen: Lungenembolie, Aortendissektion, Pneumothorax. ", ""));
    expect(r.missing).toEqual(["Differenzialdiagnose"]);
    expect(r.score).toBe(75);
  });

  test("argumentation économique complète, puis sans modèle", () => {
    const full =
      "Hypothese: Eine Preissenkung um 10 % erhöht den Umsatz. Daten: Verkaufszahlen 2023–2025 aus der Tabelle. " +
      "Modell: Preiselastizität der Nachfrage. Fazit: Bei einer Elastizität über 1 steigt der Umsatz, sonst nicht.";
    expect(evaluateStructure("wirtschaft", full).score).toBe(100);
    const r = evaluateStructure("wirtschaft", "Hypothese: Der Umsatz steigt. Daten: Verkaufszahlen 2024. Fazit: Er steigt.");
    expect(r.missing).toEqual(["Modell"]);
  });
});

describe("Intégration", () => {
  test("outil, règle universelle, indice dans la route, étape « je vérifie »", () => {
    const agent = readFileSync(join(import.meta.dir, "../src/api/agent/index.ts"), "utf8");
    expect(agent).toContain("evaluate_structure: tool({");
    expect(agent).toContain("Erkenne\n          zuerst das FACH der Frage");
    expect(agent).toContain("Mische NIE die Methoden zweier Fächer.");
    const api = readFileSync(join(import.meta.dir, "../src/api/index.ts"), "utf8");
    expect(api).toContain("const family = resolveFamily(fach, { text: lastUserText, level });");
    expect(api).toContain("[familyHint(family, { school }), domainHint(fach), domainPackText(fach, curriculum)]");
    expect(chatPhase([{ type: "tool-evaluate_structure", state: "input-available" }])).toBe("review");
    expect(de.chat.phaseReview).toBe("Ich prüfe den Aufbau deiner Lösung …");
  });
});
