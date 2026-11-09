import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildTutorAgent } from "../src/api/agent/index";
import { SONNET } from "../src/api/lib/chat-routing";

/**
 * Hörsaal sans chat (décision fondateur 2026-11-09) : la règle « toute la
 * réponse au tableau » n'est donnée qu'au Hörsaal web, qui sait l'afficher.
 * L'app mobile n'a pas de Tafel : elle garde l'ancien format.
 */
type Instr = { content: string };
const systemOf = (board: boolean) =>
  (
    buildTutorAgent({ sources: [], locale: "de", board, route: { modelId: SONNET, thinking: "off" } }) as unknown as {
      settings: { instructions: Instr[] };
    }
  ).settings.instructions[0].content;

const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");

describe("NIVEAU 7 — tout au tableau", () => {
  test("Hörsaal web : toute la réponse en [[TAFEL]], questions d'examen et QCM compris", () => {
    const p = systemOf(true);
    expect(p).toContain("Deine GESAMTE Antwort steht in [[TAFEL]]-Blöcken");
    expect(p).toContain("Runde 1 — Netzwerk DC");
    expect(p).toContain("MULTIPLE CHOICE");
    expect(p).toContain("A) …");
    expect(p).not.toContain("ALLES AUSSERHALB des Blocks ist DEINE STIMME");
    // La structure des calculs reste la même.
    expect(p).toContain("@@STEP: Endgleichung");
  });

  test("autres surfaces (mobile) : format d'avant, inchangé", () => {
    const p = systemOf(false);
    expect(p).toContain("ALLES AUSSERHALB des Blocks ist DEINE STIMME");
    expect(p).not.toContain("Deine GESAMTE Antwort steht in [[TAFEL]]-Blöcken");
  });

  test("le Hörsaal web demande ce format, et la barre du bas n'a plus de messages", () => {
    const chat = read("src/web/pages/chat.tsx");
    expect(chat).toContain("hoersaal: true");
    expect(chat).not.toContain("<MessageBubble");
    expect(chat).not.toContain("dock-subtitle");
    expect(read("src/api/index.ts")).toContain("board: hoersaal === true");
  });
});
