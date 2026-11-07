import { describe, expect, test } from "bun:test";
import { buildTutorAgent } from "../../src/api/agent/index";
import { FAMILIES, familyHint, resolveFamily } from "../../src/api/lib/domains";
import { solveElectrical } from "../../src/api/lib/solvers/electrical-solver";
import { detectDomain, domainHint } from "../../src/api/lib/solvers/domain";
import { solveFinance } from "../../src/api/lib/solvers/finance-solver";
import { solveSchoolMath } from "../../src/api/lib/solvers/highschool-solver";
import { chatPhase } from "../../src/web/lib/chat-phase";
import { solverChartBlockFromPart } from "../../src/web/lib/solver-charts";

const NEW_TOOLS = ["elektro_berechnen", "werkstoff_berechnen", "chemie_berechnen", "wirtschaft_berechnen", "schule_berechnen"];

describe("Intégration des cinq nouveaux solveurs", () => {
  const agent = buildTutorAgent({ sources: [], locale: "de", search: () => [] }) as unknown as {
    tools: Record<string, { description?: string }>;
    settings: { instructions: { content: string }[] };
  };
  const prompt = agent.settings.instructions[0].content;

  test("chaque outil est déclaré, cité dans SOLVER-PFLICHT et dans le tableau", () => {
    for (const t of NEW_TOOLS) {
      expect(Object.keys(agent.tools)).toContain(t);
      expect(prompt).toContain(`"${t}"`);
      expect(prompt).toMatch(new RegExp(`\\| ${t}\\s+\\|`));
    }
    expect(agent.tools.rechnen.description).toContain("schule_berechnen");
  });

  test.each([
    ["Ein Stahlstab mit E-Modul 210 GPa wird nach dem Hookeschen Gesetz gedehnt", "werkstoffkunde", "werkstoff_berechnen"],
    ["Wärmeausdehnung einer Stahlschiene, Ausdehnungskoeffizient 12e-6 1/K", "werkstoffkunde", "werkstoff_berechnen"],
    ["Berechne den pH-Wert einer Essigsäure mit c = 0,1 mol/L", "chemie", "chemie_berechnen"],
    ["Stöchiometrie: wie viel g CO2 entstehen aus 16 g CH4?", "chemie", "chemie_berechnen"],
    ["Reihenschwingkreis mit R = 10 Ω, L = 10 mH und C = 1 µF: Resonanzfrequenz?", "elektrotechnik", "elektro_berechnen"],
    ["Löse die quadratische Gleichung mit der p-q-Formel", "mathematik", "schule_berechnen"],
  ])("%p → %p, indice avec %p", (text, domain, tool) => {
    const g = detectDomain(text);
    expect(g.domain).toBe(domain as never);
    expect(g.covered).toBe(true);
    expect(domainHint(g)).toContain(tool);
    expect(domainHint(g)).not.toContain("KEINEN Fachlöser");
  });

  test("économie : la famille cite wirtschaft_berechnen", () => {
    const fam = resolveFamily(detectDomain("Berechne den Kapitalwert und den internen Zinsfuß der Investition"));
    expect(fam?.id).toBe("economics");
    expect(familyHint(fam)).toContain("wirtschaft_berechnen");
    expect(FAMILIES.highschool.allowedTools).toContain("schule_berechnen");
  });

  test("pas de faux positifs : tampon informatique, base légale", () => {
    expect(detectDomain("Implementiere einen Ringpuffer in C mit einem Array").domain).not.toBe("chemie");
    expect(detectDomain("Quelle est la base légale en droit des contrats ? Code civil").domain).toBe("recht");
  });

  test("badge « solveur », étape « je calcule », graphique automatique", () => {
    for (const t of NEW_TOOLS) expect(chatPhase([{ type: `tool-${t}`, state: "input-available" }] as never)).toBe("solve");
    const outputs: [string, unknown][] = [
      ["elektro_berechnen", solveElectrical({ aufgabe: "rc_schaltvorgang", U0: 10, R: "1 kΩ", C: "1 µF" })],
      ["wirtschaft_berechnen", solveFinance({ aufgabe: "irr", zahlungen: [-100, 60, 60] })],
      ["schule_berechnen", solveSchoolMath({ aufgabe: "quadratisch", a: 1, b: -5, c: 6 })],
    ];
    for (const [name, output] of outputs) {
      const block = solverChartBlockFromPart({ type: `tool-${name}`, state: "output-available", output });
      expect(block, name).toContain("```chart");
    }
  });
});
