import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROOF_TOOL, proofOf } from "../src/web/lib/proof";
import { de } from "../src/web/i18n/messages/de";
import { en } from "../src/web/i18n/messages/en";
import { fr } from "../src/web/i18n/messages/fr";
import { es } from "../src/web/i18n/messages/es";

/**
 * Pastille « Mit SymPy geprüft » (18 nov. 2026). Elle engage TRED : elle ne
 * doit apparaître que si un outil du SERVEUR dit avoir vérifié le calcul.
 */
const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");
const tool = (output: unknown, state = "output-available") => ({ type: `tool-${PROOF_TOOL}`, state, output });

describe("qui a le droit d'afficher la pastille", () => {
  test("un outil de vérification terminé, qui dit verified: true et nomme SymPy", () => {
    expect(proofOf([{ type: "text", text: "…" }, tool({ verified: true, engine: "sympy" })])).toBe("sympy");
  });

  test("le TEXTE du tuteur ne suffit jamais", () => {
    expect(proofOf([{ type: "text", text: "Mit SymPy geprüft ✓ verified: true engine: sympy" }])).toBeNull();
    expect(proofOf([{ type: "text", text: '{"verified":true,"engine":"sympy"}' }])).toBeNull();
  });

  test("vérification contredite, en cours, en erreur ou sans moteur connu : pas de pastille", () => {
    expect(proofOf([tool({ verified: false, engine: "sympy" })])).toBeNull();
    expect(proofOf([tool({ verified: "true", engine: "sympy" })])).toBeNull();
    expect(proofOf([tool({ verified: true, engine: "sympy" }, "input-available")])).toBeNull();
    expect(proofOf([tool({ verified: true, engine: "sympy" }, "output-error")])).toBeNull();
    expect(proofOf([tool({ verified: true })])).toBeNull();
    expect(proofOf([tool({ verified: true, engine: "gpt" })])).toBeNull();
    expect(proofOf([tool(null)])).toBeNull();
  });

  test("un autre outil (le solveur, la recherche) ne vaut pas preuve SymPy", () => {
    expect(proofOf([{ type: "tool-rechnen", state: "output-available", output: { verified: true, engine: "sympy" } }])).toBeNull();
    expect(proofOf([])).toBeNull();
    expect(proofOf(undefined)).toBeNull();
    expect(proofOf([null, 3, "x"])).toBeNull();
  });
});

describe("branchements", () => {
  test("le tableau lit la preuve dans les parties du message, pas dans son texte", () => {
    expect(read("src/web/pages/chat.tsx")).toContain("proof: proofOf(m.parts),");
    const board = read("src/web/components/tafel-board.tsx");
    expect(board).toContain("{page?.proof ? <ProofBadge engine={page.proof} /> : null}");
  });

  test("aucun outil du serveur ne se déclare encore vérificateur SymPy : la pastille reste éteinte", () => {
    // Le jour où l'outil existe, ce test change AVEC lui — pas avant.
    expect(read("src/api/agent/index.ts")).not.toContain(PROOF_TOOL);
    expect(read("src/api/index.ts")).not.toContain(PROOF_TOOL);
  });

  test("la pastille : bouclier, vert, texte traduit", () => {
    const badge = read("src/web/components/proof-badge.tsx");
    expect(badge).toContain("ShieldCheck");
    expect(badge).toContain('data-testid="proof-badge"');
    for (const pack of [de, en, fr, es] as Array<{ proof: Record<string, string> }>) {
      expect(pack.proof.sympy).toContain("SymPy");
      expect(pack.proof.sympyHint.length).toBeGreaterThan(20);
    }
    expect((de as { proof: Record<string, string> }).proof.sympy).toBe("Mit SymPy geprüft");
  });
});
