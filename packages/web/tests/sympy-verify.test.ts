import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_LATEX, cleanLatex, parseVerdict, sympyInterpreter, verdictForTutor, verifyMath, type PythonRunner } from "../src/api/lib/sympy-verify";
import { PROOF_TOOL, proofOf } from "../src/web/lib/proof";

/**
 * Vérification symbolique par SymPy (18 nov. 2026) : un sous-processus Python,
 * lancé par le serveur sur une égalité LaTeX écrite par le tuteur. Le texte
 * vient d'un modèle, donc d'un étudiant : ces tests fixent ce qui a le droit
 * d'atteindre Python, et ce que le serveur accepte d'en croire.
 */
const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");
const answer = (fields: Record<string, unknown>) => JSON.stringify({ engine: "sympy", is_valid: true, result: "\\frac{1}{3}", reason: "equal", ...fields });
const fake = (stdout: string, timedOut = false): PythonRunner & { calls: string[] } => {
  const calls: string[] = [];
  const run = (async (latex: string) => {
    calls.push(latex);
    return { stdout, timedOut };
  }) as PythonRunner & { calls: string[] };
  run.calls = calls;
  return run;
};

describe("ce qui a le droit d'atteindre Python", () => {
  test("une formule LaTeX passe, sans ses délimiteurs d'affichage", () => {
    expect(cleanLatex("\\int_0^1 x^2 dx = \\frac{1}{3}")).toBe("\\int_0^1 x^2 dx = \\frac{1}{3}");
    expect(cleanLatex("$\\frac{d}{dx} x^2 = 2x$")).toBe("\\frac{d}{dx} x^2 = 2x");
    expect(cleanLatex("\\( (x+1)^2 = x^2 + 2x + 1 \\)")).toBe("(x+1)^2 = x^2 + 2x + 1");
    expect(cleanLatex("\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}")).not.toBeNull();
  });

  test("du code, des guillemets, un autre alphabet, une taille démesurée : refusés", () => {
    for (const bad of [
      '__import__("os").system("id")',
      "open('/etc/passwd').read()".replace(/'/g, '"'),
      "x = `id`",
      "1 = 1 # commentaire",
      "x = 1 $ y = 2",
      "x = 1 % 2",
      "x = 1 @ 2",
      "x = ~1",
      "π = 3",
      "x = 1\u0000",
      "x".repeat(MAX_LATEX + 1),
      "",
      "   ",
    ]) {
      expect(cleanLatex(bad)).toBeNull();
    }
    for (const notText of [null, undefined, 42, { latex: "x=1" }, ["x=1"]]) expect(cleanLatex(notText)).toBeNull();
  });

  test("une entrée refusée ne lance aucun processus", async () => {
    const run = fake(answer({}));
    const verdict = await verifyMath('__import__("os").system("id")', run);
    expect(verdict).toEqual({ verified: false, engine: "sympy", result: "", reason: "rejected" });
    expect(run.calls).toEqual([]);
  });

  test("Python ne reçoit que la formule nettoyée", async () => {
    const run = fake(answer({}));
    await verifyMath("  $\\int_0^1 x^2 dx = \\frac{1}{3}$ ", run);
    expect(run.calls).toEqual(["\\int_0^1 x^2 dx = \\frac{1}{3}"]);
  });
});

describe("ce que le serveur accepte de croire", () => {
  test("égalité démontrée : vérifiée", async () => {
    expect(await verifyMath("x = x", fake(answer({})))).toEqual({ verified: true, engine: "sympy", result: "\\frac{1}{3}", reason: "equal" });
  });

  test("contredite, indécidable, sans égalité : jamais vérifiée", async () => {
    for (const reason of ["not_equal", "undecided", "no_claim", "parse_error", "error"]) {
      const verdict = await verifyMath("x = x", fake(answer({ is_valid: false, reason })));
      expect(verdict.verified).toBe(false);
      expect(verdict.reason).toBe(reason);
    }
    // « is_valid » sans la raison « equal » : incohérent, donc non vérifié.
    expect((await verifyMath("x = x", fake(answer({ is_valid: true, reason: "undecided" })))).verified).toBe(false);
  });

  test("délai dépassé : le processus a été tué, rien n'est vérifié", async () => {
    expect(await verifyMath("9^{9^{9^{9}}} = 1", fake("", true))).toEqual({ verified: false, engine: "sympy", result: "", reason: "timeout" });
    // Même si une sortie était arrivée avant le coup d'arrêt, elle ne compte pas.
    expect((await verifyMath("x = x", fake(answer({}), true))).verified).toBe(false);
  });

  test("sortie vide, bavarde, mal formée ou d'un autre moteur : indisponible", async () => {
    for (const out of ["", "Traceback (most recent call last):", "{", "null", "[]", '"equal"', answer({ engine: "gpt" }), answer({ is_valid: "true" }), answer({ result: 3 }), answer({ reason: "trust me" })]) {
      expect(await verifyMath("x = x", fake(out))).toEqual({ verified: false, engine: "sympy", result: "", reason: "unavailable" });
    }
    expect(parseVerdict(`du bruit\n${answer({})}`)?.verified).toBe(true);
    expect(parseVerdict(answer({ result: "x".repeat(900) }))?.result.length).toBe(400);
  });

  test("un lanceur qui lève ne fait pas tomber la réponse", async () => {
    const broken: PythonRunner = async () => {
      throw new Error("spawn ENOENT");
    };
    expect((await verifyMath("x = x", broken)).reason).toBe("unavailable");
  });

  test("deux vérifications à la fois au plus", async () => {
    let now = 0;
    let peak = 0;
    const slow: PythonRunner = async () => {
      now += 1;
      peak = Math.max(peak, now);
      await new Promise((r) => setTimeout(r, 15));
      now -= 1;
      return { stdout: answer({}), timedOut: false };
    };
    const all = await Promise.all(Array.from({ length: 7 }, () => verifyMath("x = x", slow)));
    expect(peak).toBe(2);
    expect(all.every((v) => v.verified)).toBe(true);
  });
});

describe("du verdict à la pastille", () => {
  test("ce que reçoit le tuteur allume la pastille, et seulement si SymPy a démontré l'égalité", () => {
    const part = (output: unknown) => [{ type: `tool-${PROOF_TOOL}`, state: "output-available", output }];
    const yes = verdictForTutor({ verified: true, engine: "sympy", result: "\\frac{1}{3}", reason: "equal" });
    expect(yes).toMatchObject({ verified: true, engine: "sympy", ergebnis: "\\frac{1}{3}" });
    expect(proofOf(part(yes))).toBe("sympy");
    const no = verdictForTutor({ verified: false, engine: "sympy", result: "\\frac{1}{3}", reason: "not_equal" });
    expect(no.hinweis).toContain("\\frac{1}{3}");
    expect(proofOf(part(no))).toBeNull();
    for (const reason of ["undecided", "timeout", "unavailable", "rejected", "no_claim"] as const) {
      expect(proofOf(part(verdictForTutor({ verified: false, engine: "sympy", result: "", reason })))).toBeNull();
    }
  });
});

describe("branchements et garde-fous écrits dans le code", () => {
  test("l'outil du tuteur porte le nom que lit l'interface, et n'existe que si SymPy répond", () => {
    const agent = read("src/api/agent/index.ts");
    expect(agent).toContain(`${PROOF_TOOL}: tool({`);
    expect(agent).toMatch(/\.\.\.\(opts\.sympy\s*\?\s*\{/);
    const index = read("src/api/index.ts");
    expect(index).toContain("sympy: sympyIsReady() ? async (gleichung) => verdictForTutor(await verifyMath(gleichung)) : undefined,");
    expect(index).toContain("void sympyReady();");
  });

  test("sous-processus : arguments fixes, pas de shell, pas d'environnement du serveur, coup d'arrêt", () => {
    const src = read("src/api/lib/sympy-verify.ts");
    expect(src).toContain('spawn(python, ["-I", "-B", SYMPY_SCRIPT], {');
    expect(src).not.toMatch(/shell:\s*true/);
    expect(src).not.toMatch(/\bexec(Sync|File|FileSync)?\(/);
    expect(src).not.toMatch(/env:\s*\{?\s*\.\.\.process\.env/);
    expect(src).not.toContain("env: process.env");
    expect(src).toContain('child.kill("SIGKILL")');
    expect(src).toContain('stdio: ["pipe", "pipe", "ignore"]');
  });

  test("le programme Python : ni eval, ni exec, ni sympify, et il se ferme avant de calculer", () => {
    const py = read("src/api/sympy/verify_math.py");
    const code = py.replace(/"""[\s\S]*?"""/g, "").replace(/#.*$/gm, "");
    for (const banned of ["eval(", "exec(", "sympify(", "compile(", "pickle", "import subprocess", "os.system("]) expect(code).not.toContain(banned);
    expect(code).toContain("parse_latex(");
    expect(code.indexOf("drop_privileges()")).toBeGreaterThan(-1);
    expect(code.indexOf("install_audit_hook()", code.indexOf("def main"))).toBeLessThan(code.indexOf("sides = split_equalities(latex)"));
    expect(code).toContain("os.setuid(65534)");
    expect(code).toContain("RLIMIT_CPU");
    expect(code).toContain("RLIMIT_AS");
  });

  test("image de production : SymPy aux versions exactes, contrôlé à la construction", () => {
    const docker = read("../../Dockerfile");
    expect(docker).toContain("python3 -m venv /opt/sympy");
    expect(docker).toContain("verify_math.py --self-test");
    const pins = read("src/api/sympy/requirements.txt").split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
    expect(pins.length).toBe(3);
    for (const pin of pins) expect(pin).toMatch(/^[a-z0-9-]+==\d+\.\d+(\.\d+)?$/);
  });
});

// Le vrai SymPy : dans l'image, dans la CI, ou en local avec SYMPY_PYTHON. Sans interpréteur, rien à lancer.
describe.skipIf(!sympyInterpreter())("avec le vrai SymPy", () => {
  const real = (latex: string) => verifyMath(latex, undefined, 15_000);

  test("∫₀¹ x² dx = 1/3 : vérifié ; = 1/2 : contredit, avec la bonne valeur", async () => {
    expect(await real("\\int_0^1 x^2 dx = \\frac{1}{3}")).toMatchObject({ verified: true, reason: "equal", result: "\\frac{1}{3}" });
    expect(await real("\\int_0^1 x^2 dx = \\frac{1}{2}")).toMatchObject({ verified: false, reason: "not_equal", result: "\\frac{1}{3}" });
  }, 40_000);

  test("dérivée, primitive à une constante près, identité, limite", async () => {
    expect((await real("\\frac{d}{dx} x^2 = 2x")).verified).toBe(true);
    expect((await real("\\int x^2 dx = \\frac{x^3}{3} + C")).verified).toBe(true);
    expect((await real("\\int x^2 dx = \\frac{x^3}{2}")).verified).toBe(false);
    expect((await real("\\sin^2(x) + \\cos^2(x) = 1")).verified).toBe(true);
    expect((await real("\\lim_{x \\to 0} \\frac{\\sin(x)}{x} = 1")).verified).toBe(true);
  }, 90_000);

  test("une expression sans « = » n'est pas une preuve", async () => {
    expect(await real("x^2 + 1")).toMatchObject({ verified: false, reason: "no_claim" });
  }, 30_000);

  test("un calcul démesuré est tué au délai, sans réponse", async () => {
    const started = Date.now();
    const verdict = await verifyMath("9^{9^{9^{9}}} = 1", undefined, 3000);
    expect(verdict.verified).toBe(false);
    expect(["timeout", "unavailable"]).toContain(verdict.reason);
    expect(Date.now() - started).toBeLessThan(6000);
  }, 20_000);
});
