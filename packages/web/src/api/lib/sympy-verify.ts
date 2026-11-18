import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Vérification symbolique d'une égalité par SymPy — le serveur appelle un
 * petit programme Python (api/sympy/verify_math.py) dans un sous-processus.
 *
 * ── Ce que cela prouve ──────────────────────────────────────────────────────
 * Le tuteur soumet UNE égalité en LaTeX (« ∫₀¹ x² dx = 1/3 »). SymPy calcule
 * les deux membres et dit s'ils sont égaux. La pastille « Mit SymPy geprüft »
 * de l'interface ne s'allume que sur `verified: true` (web/lib/proof.ts).
 *
 * ── Sécurité (le texte vient d'un modèle, donc d'un étudiant) ───────────────
 *  1. Entrée bornée (600 caractères) et filtrée : seuls les caractères d'une
 *     formule LaTeX passent. Rien d'autre n'atteint Python.
 *  2. Jamais de shell, jamais d'argument : la formule voyage en JSON sur
 *     l'entrée standard d'un `spawn` à liste d'arguments fixe.
 *  3. Interpréteur isolé (`-I -B`) : ni variables PYTHON*, ni dossier courant
 *     dans les modules, ni fichier .pyc écrit.
 *  4. Environnement vide (aucun secret du serveur), dossier de travail vide.
 *  5. Délai strict : le processus est tué (SIGKILL) après SYMPY_TIMEOUT_MS —
 *     3 s par défaut : ≈ 0,9 s pour charger SymPy, puis 2 s de calcul au plus.
 *  6. Dans le programme lui-même : aucun `eval`, compte « nobody », limites
 *     du noyau, et un crochet d'audit qui refuse fichiers, processus et réseau.
 *  7. Deux vérifications à la fois au plus ; au-delà de huit en attente, la
 *     vérification est abandonnée (réponse sans pastille), jamais empilée.
 *
 * ── Inerte sans Python ──────────────────────────────────────────────────────
 * L'image de production installe SymPy dans /opt/sympy (Dockerfile). Ailleurs
 * (poste de développement), `sympyReady()` répond faux : l'outil n'est pas
 * proposé au tuteur et l'app se comporte exactement comme avant.
 */

export const SYMPY_SCRIPT = fileURLToPath(new URL("../sympy/verify_math.py", import.meta.url));
export const MAX_LATEX = 600;
const MAX_STDOUT = 16 * 1024;
const MAX_RESULT = 400;
const MAX_RUNNING = 2;
const MAX_WAITING = 8;

const envInt = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 500 && n <= 10_000 ? Math.floor(n) : fallback;
};
export const sympyTimeoutMs = () => envInt("SYMPY_TIMEOUT_MS", 3000);

export type SympyReason = "equal" | "not_equal" | "undecided" | "no_claim" | "parse_error" | "too_long" | "error" | "rejected" | "timeout" | "unavailable";

export interface SympyVerdict {
  /** Vrai seulement si SymPy a démontré l'égalité. */
  verified: boolean;
  engine: "sympy";
  /** La valeur que SymPy trouve pour le membre de gauche, en LaTeX (vide si aucune). */
  result: string;
  reason: SympyReason;
}

const refused = (reason: SympyReason): SympyVerdict => ({ verified: false, engine: "sympy", result: "", reason });

/** Les caractères d'une formule LaTeX, et eux seuls. */
const LATEX_ONLY = /^[A-Za-z0-9\s\\{}^_+\-*/=()[\]|.,!<>:;'&]+$/;

/** La formule telle qu'elle a le droit d'atteindre Python, ou null. */
export function cleanLatex(input: unknown): string | null {
  if (typeof input !== "string") return null;
  // Les délimiteurs d'affichage du tuteur ($…$, \( … \)) ne font pas partie de la formule.
  const latex = input.trim().replace(/^\$+|\$+$/g, "").replace(/^\\[([]/, "").replace(/\\[)\]]$/, "").trim();
  if (!latex || latex.length > MAX_LATEX) return null;
  if (!LATEX_ONLY.test(latex)) return null;
  return latex;
}

const REASONS: ReadonlySet<string> = new Set(["equal", "not_equal", "undecided", "no_claim", "parse_error", "too_long", "error"]);

/** La dernière ligne du programme, lue strictement. Tout ce qui n'a pas exactement la forme attendue est rejeté. */
export function parseVerdict(stdout: string): SympyVerdict | null {
  const line = stdout.trim().split(/\r?\n/).pop() ?? "";
  if (!line || line.length > MAX_STDOUT) return null;
  let data: unknown;
  try {
    data = JSON.parse(line);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (d.engine !== "sympy" || typeof d.is_valid !== "boolean" || typeof d.result !== "string" || typeof d.reason !== "string" || !REASONS.has(d.reason)) return null;
  return {
    // Les deux doivent s'accorder : « is_valid » sans « equal » n'allume rien.
    verified: d.is_valid === true && d.reason === "equal",
    engine: "sympy",
    result: d.result.slice(0, MAX_RESULT),
    reason: d.reason as SympyReason,
  };
}

/** L'interpréteur : SYMPY_PYTHON s'il est posé, sinon celui de l'image de production. null : pas de vérification. */
export function sympyInterpreter(env: Record<string, string | undefined> = process.env): string | null {
  const chosen = env.SYMPY_PYTHON?.trim();
  if (chosen) return chosen;
  return existsSync("/opt/sympy/bin/python") ? "/opt/sympy/bin/python" : null;
}

export interface PythonRun {
  stdout: string;
  timedOut: boolean;
}
export type PythonRunner = (latex: string, timeoutMs: number) => Promise<PythonRun>;

let workDir: string | null = null;

/** Le sous-processus réel. Ne lève jamais : un échec de lancement est une sortie vide. */
export const runPython: PythonRunner = (latex, timeoutMs) =>
  new Promise((resolve) => {
    const python = sympyInterpreter();
    if (!python) return resolve({ stdout: "", timedOut: false });
    workDir ??= mkdtempSync(join(tmpdir(), "tred-sympy-"));
    let stdout = "";
    let done = false;
    const finish = (timedOut: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ stdout, timedOut });
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(python, ["-I", "-B", SYMPY_SCRIPT], {
        cwd: workDir,
        // Aucun secret du serveur : seulement de quoi trouver les bibliothèques système.
        env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8", ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}) },
        stdio: ["pipe", "pipe", "ignore"],
        windowsHide: true,
      });
    } catch {
      return resolve({ stdout: "", timedOut: false });
    }
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(true);
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      // Une réponse démesurée n'est pas une réponse.
      if (stdout.length > MAX_STDOUT) {
        child.kill("SIGKILL");
        stdout = "";
        finish(false);
      }
    });
    child.on("error", () => finish(false));
    child.on("close", () => finish(false));
    child.stdin?.on("error", () => {});
    child.stdin?.end(`${JSON.stringify({ latex })}\n`);
  });

let running = 0;
const waiting: Array<() => void> = [];

/** Vérifie une égalité LaTeX. Ne lève jamais ; toute anomalie donne `verified: false`. */
export async function verifyMath(input: unknown, run: PythonRunner = runPython, timeoutMs = sympyTimeoutMs()): Promise<SympyVerdict> {
  const latex = cleanLatex(input);
  if (!latex) return refused("rejected");
  if (running >= MAX_RUNNING) {
    if (waiting.length >= MAX_WAITING) return refused("unavailable");
    await new Promise<void>((go) => waiting.push(go));
  }
  running += 1;
  try {
    const out = await run(latex, timeoutMs);
    if (out.timedOut) return refused("timeout");
    return parseVerdict(out.stdout) ?? refused("unavailable");
  } catch {
    return refused("unavailable");
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

let ready: Promise<boolean> | null = null;
let readyNow = false;

/** Au démarrage : SymPy répond-il vraiment ? Une égalité de contrôle, une fois. */
export function sympyReady(): Promise<boolean> {
  ready ??= (async () => {
    if (!sympyInterpreter()) return false;
    // Le premier lancement charge SymPy depuis le disque : on lui laisse plus de temps qu'à une vérification.
    const check = await verifyMath("\\int_0^1 x^2 dx = \\frac{1}{3}", runPython, 10_000);
    readyNow = check.verified;
    console.log(readyNow ? "[sympy] vérification symbolique active" : `[sympy] indisponible (${check.reason}) : le tuteur n'a pas l'outil de vérification`);
    return readyNow;
  })();
  return ready;
}

/** Réponse immédiate pour une requête en cours : vrai seulement après un contrôle réussi. */
export const sympyIsReady = (): boolean => readyNow;

/** Ce que le tuteur reçoit : le verdict, et quoi en faire. La pastille lit `verified` et `engine`. */
export function verdictForTutor(v: SympyVerdict): { verified: boolean; engine: "sympy"; ergebnis: string; hinweis: string } {
  const hinweis =
    v.reason === "equal"
      ? "SymPy bestätigt die Gleichung."
      : v.reason === "not_equal"
        ? `SymPy widerspricht. Für die linke Seite erhält SymPy: ${v.result || "(kein Wert)"}. Rechne neu und nenne das bestätigte Ergebnis.`
        : v.reason === "undecided"
          ? "SymPy kann die Gleichheit nicht entscheiden. Triff keine Aussage über eine Prüfung."
          : v.reason === "no_claim"
            ? "Das ist keine Gleichung. Übergib „Aufgabe = Ergebnis“."
            : "Die Prüfung war nicht möglich. Triff keine Aussage über eine Prüfung.";
  return { verified: v.verified, engine: "sympy", ergebnis: v.result, hinweis };
}
