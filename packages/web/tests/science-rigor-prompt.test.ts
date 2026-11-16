import { describe, expect, test } from "bun:test";
import { buildTutorAgent } from "../src/api/agent/index";
import { SOLVER_TOOLS } from "../src/api/lib/precision";

/**
 * Brief fondateur du 17 nov. 2026 : le tuteur a confondu r(t) et r(φ).
 * Ces tests verrouillent ce que le prompt DIT et ce que l'agent ENVOIE —
 * pas l'obéissance du modèle (pour elle : lib/precision.ts, detectSolverSkip).
 */

type Agent = {
  settings: { instructions: { content: string }[]; temperature?: number };
  tools: Record<string, unknown>;
};
const agentOf = (opts: Parameters<typeof buildTutorAgent>[0]) => buildTutorAgent(opts) as unknown as Agent;
const fixedPrompt = (opts: Parameters<typeof buildTutorAgent>[0] = { sources: [], locale: "de" }) =>
  agentOf(opts).settings.instructions[0].content;

describe("NIVEAU 1 — droit à l'incertitude", () => {
  const p = fixedPrompt();
  const niveau1 = p.slice(p.indexOf("NIVEAU 1"), p.indexOf("NIVEAU 2 —"));

  test("ne pas deviner : chercher dans les documents, puis demander le passage exact", () => {
    expect(niveau1).toContain("RECHT AUF UNSICHERHEIT");
    expect(niveau1).toMatch(/nicht zu 100 % sicher/);
    expect(niveau1).toContain("suche_in_unterlagen");
    expect(niveau1).toMatch(/Ich bin mir nicht sicher/);
    expect(niveau1).toMatch(/genaue Stelle/);
  });

  test("la notation du document est obligatoire : r(φ) n'est pas r(t)", () => {
    expect(niveau1).toContain("NOTATION DER UNTERLAGEN");
    expect(niveau1).toContain("r(φ)");
    expect(niveau1).toContain("r(t)");
    expect(niveau1).toMatch(/unabhängige Variable/);
  });

  test("vérification cachée avant la réponse : formule du document, unités, solveur", () => {
    expect(niveau1).toContain("STILLE PRÜFUNG VOR DER ANTWORT");
    expect(niveau1).toMatch(/Formel.*Unterlagen/s);
    expect(niveau1).toMatch(/Einheiten/);
    expect(niveau1).toMatch(/Werkzeug/);
    expect(niveau1).toMatch(/korrigierst du/);
    expect(niveau1).toMatch(/nicht in die Antwort|nicht an die Tafel/);
  });
});

describe("photos d'un schéma : décrire avant de calculer", () => {
  test("description d'abord, et arrêt si un élément est illisible", () => {
    const p = fixedPrompt();
    const bilder = p.slice(p.indexOf("BILDER / SCANS"));
    expect(bilder).toMatch(/beschreibst du ZUERST/);
    expect(bilder).toMatch(/erst danach rechnest/i);
    expect(bilder).toMatch(/rechnest du NICHT/);
  });
});

describe("câblage dans l'agent", () => {
  test("la température demandée part avec l'appel sans raisonnement", () => {
    const a = agentOf({ sources: [], locale: "de", route: { modelId: "anthropic/claude-sonnet-4.6", thinking: "off" }, temperature: 0 });
    expect(a.settings.temperature).toBe(0);
  });

  test("jamais de température avec le raisonnement étendu (l'API la refuse)", () => {
    const a = agentOf({ sources: [], locale: "de", route: { modelId: "anthropic/claude-sonnet-4.6", thinking: "adaptive" }, temperature: 0 });
    expect(a.settings.temperature).toBeUndefined();
  });

  test("la consigne du solveur est la dernière consigne système, après le bloc mis en cache", () => {
    const plain = agentOf({ sources: [], locale: "de" });
    const duty = agentOf({ sources: [], locale: "de", solverDuty: "RECHENPFLICHT FÜR DIESE FRAGE: test" });
    const instr = duty.settings.instructions;
    expect(instr[instr.length - 1].content).toContain("RECHENPFLICHT FÜR DIESE FRAGE");
    expect(instr[0].content).toBe(plain.settings.instructions[0].content);
  });

  test("chaque solveur de l'agent est connu du garde après réponse", () => {
    const tools = Object.keys(agentOf({ sources: [], locale: "de" }).tools);
    const solvers = tools.filter((t) => t === "rechnen" || t === "balkenstatik" || /_berechnen$|^solve_/.test(t));
    expect(solvers.length).toBeGreaterThan(10);
    for (const t of solvers) expect(SOLVER_TOOLS.has(t)).toBe(true);
  });
});
