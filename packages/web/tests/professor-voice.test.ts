import { describe, expect, test } from "bun:test";
import { cleanForVoice, professorSpeech } from "../src/web/lib/speech";
import { pageSplit, tafelPage } from "../src/web/lib/tafel";
import { spokenAnswer } from "../src/web/lib/professor-choreography";
import { buildTutorAgent } from "../src/api/agent/index";
import { SONNET } from "../src/api/lib/chat-routing";

/**
 * Décision fondateur (2026-11-11) : le professeur écrit la formule au tableau
 * EN SILENCE, puis se retourne et explique avec ses mots. Il ne récite jamais
 * le tableau. La voix (ElevenLabs) ne reçoit que le bloc [[PROFESSEUR]].
 */
const ANSWER = `[[TAFEL schritt="Gegeben"]]
$$U_0 = 6\\,\\text{V},\\quad R = 2\\,\\Omega$$
[[/TAFEL]]
[[TAFEL schritt="Ergebnis"]]
$$I = \\frac{U_0}{R} = 3\\,\\text{A}$$
[[/TAFEL]]
[[PROFESSEUR]]
Regarde ce résultat. Si on augmente la résistance, le courant va automatiquement baisser, un peu comme si tu bouchais partiellement un tuyau. Est-ce que tu arrives à visualiser pourquoi ?
[[/PROFESSEUR]]`;

const SPOKEN =
  "Regarde ce résultat. Si on augmente la résistance, le courant va automatiquement baisser, un peu comme si tu bouchais partiellement un tuyau. Est-ce que tu arrives à visualiser pourquoi ?";

describe("le tableau et la voix sont séparés", () => {
  test("[[PROFESSEUR]] n'est jamais écrit au tableau", () => {
    const page = tafelPage(ANSWER);
    expect(page.filter((b) => b.kind === "step").map((b) => b.label)).toEqual(["Gegeben", "Ergebnis"]);
    expect(page.filter((b) => b.kind === "voice")).toEqual([]);
    expect(page.filter((b) => b.kind === "spoken")).toEqual([{ kind: "spoken", body: SPOKEN, complete: true }]);
  });

  test("le professeur dit ses paroles, pas les formules du tableau", () => {
    const said = spokenAnswer(pageSplit(tafelPage(ANSWER)), ANSWER);
    expect(said).toBe(SPOKEN);
    expect(said).not.toMatch(/U_0|frac|3 ?A|Omega|=/);
  });

  test("bouton « Écouter » : même règle, sur le texte brut", () => {
    expect(professorSpeech(ANSWER)).toBe(SPOKEN);
  });

  test("pendant le streaming, un [[PROFESSEUR]] ouvert reste hors du tableau", () => {
    const partial = `[[TAFEL schritt="Ergebnis"]]$$I = 3\\,A$$[[/TAFEL]]\n[[PROFESSEUR]]\nStell dir einen Wasser`;
    const page = tafelPage(partial);
    expect(page.map((b) => b.kind)).toEqual(["step", "spoken"]);
    expect(page[1]).toMatchObject({ kind: "spoken", complete: false });
  });

  test("ancien format sans [[PROFESSEUR]] : le texte HORS des blocs, jamais leur contenu", () => {
    const old = `Ich schreibe die Knotenregel an.\n[[REASONING]]\n@@STEP: Physik\n$$\\sum I = 0$$\n[[/REASONING]]\n[[OFFICIAL]]Laut Skript gilt I = U/R.[[/OFFICIAL]]\nSiehst du, warum?`;
    expect(professorSpeech(old)).toBe("Ich schreibe die Knotenregel an. Siehst du, warum?");
  });

  test("tout le Hörsaal au tableau, sans paroles : silence plutôt que lecture", () => {
    expect(professorSpeech('[[TAFEL schritt="Ergebnis"]]$$F = 20\\,N$$[[/TAFEL]]')).toBe("");
  });
});

describe("cleanForVoice — rien que des phrases pour ElevenLabs", () => {
  test("retire formules, équations en clair, balises et symboles", () => {
    expect(cleanForVoice("Hier gilt $$I = U/R$$ und damit fließt mehr Strom.")).toBe("Hier gilt und damit fließt mehr Strom.");
    expect(cleanForVoice("Wenn $R$ steigt, sinkt der Strom.")).toBe("Wenn R steigt, sinkt der Strom.");
    expect(cleanForVoice("Der Strom ist $I = \\frac{U}{R}$, also klein.")).toBe("Der Strom ist, also klein.");
    expect(cleanForVoice("Also I = U/R = 3 A, das ist viel.")).not.toContain("=");
    expect(cleanForVoice("**Gut** gemacht! `code` [[AEROSTUDY]]")).toBe("Gut gemacht!");
    expect(cleanForVoice("```svg\n<svg/>\n```Schau.")).toBe("Schau.");
  });
});

describe("le prompt (NIVEAU 7) impose le bloc [[PROFESSEUR]] au Hörsaal", () => {
  type Instr = { content: string };
  const systemOf = (board: boolean) =>
    (
      buildTutorAgent({ sources: [], locale: "de", board, route: { modelId: SONNET, thinking: "off" } }) as unknown as {
        settings: { instructions: Instr[] };
      }
    ).settings.instructions[0].content;

  test("Hörsaal web", () => {
    const p = systemOf(true);
    expect(p).toContain("TAFEL UND STIMME SIND GETRENNT — [[PROFESSEUR]] (PFLICHT)");
    expect(p).toContain("er liest NIE vor, was an der Tafel");
    expect(p).toContain("VERBOTEN im [[PROFESSEUR]]-Block: Formeln, LaTeX");
    expect(p).toContain("Wassertank vor …");
    expect(p).toContain("Kannst du dir vorstellen, warum?");
  });

  test("mobile : pas de bloc [[PROFESSEUR]], mais la voix n'y lit pas non plus le tableau", () => {
    const p = systemOf(false);
    expect(p).not.toContain("TAFEL UND STIMME SIND GETRENNT");
    expect(p).toContain("Sie liest NIE vor, was an der Tafel");
  });

  test("le style auditif ne demande plus de lire les formules", () => {
    const p = (
      buildTutorAgent({
        sources: [],
        locale: "de",
        board: true,
        learningStyle: "auditory",
        route: { modelId: SONNET, thinking: "off" },
      }) as unknown as { settings: { instructions: Instr[] } }
    ).settings.instructions
      .map((i) => i.content)
      .join("\n");
    expect(p).not.toContain("M ist F mal");
    expect(p).toContain("nie die Formel vorlesen");
  });
});
