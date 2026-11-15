import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { answerChallenge, CHALLENGE_MODES, CHALLENGE_START, challengeErrorOf, progressOf } from "../src/web/lib/doc-challenge";
import { CHALLENGE_MODES as SERVER_MODES } from "../src/api/lib/doc-challenge";
import { SOUNDS } from "../src/web/lib/game-sounds";

/** « Fall-Check » dans l'app : règles de la partie, branchement, textes. */
const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8");
const PAGE = read("../src/web/pages/fall-check.tsx");
const API = read("../src/api/index.ts");

describe("la partie", () => {
  test("100 points par bonne réponse, +50 dès la deuxième d'affilée ; une erreur remet la série à zéro", () => {
    let s = answerChallenge(CHALLENGE_START, true);
    expect(s).toEqual({ index: 1, correct: 1, streak: 1, score: 100 });
    s = answerChallenge(s, true);
    expect(s.score).toBe(250);
    s = answerChallenge(s, false);
    expect(s).toEqual({ index: 3, correct: 2, streak: 0, score: 250 });
    expect(answerChallenge(s, true).score).toBe(350);
  });

  test("la barre avance avec les questions répondues", () => {
    expect(progressOf(CHALLENGE_START, 4)).toBe(0);
    expect(progressOf({ ...CHALLENGE_START, index: 2 }, 4)).toBe(0.5);
    expect(progressOf({ ...CHALLENGE_START, index: 9 }, 4)).toBe(1);
    expect(progressOf(CHALLENGE_START, 0)).toBe(0);
  });

  test("les erreurs du serveur ont chacune leur message ; l'inconnu devient « failed »", () => {
    expect(challengeErrorOf(422, "no_grounded_question")).toBe("no_grounded_question");
    expect(challengeErrorOf(402, "whatever")).toBe("quota");
    expect(challengeErrorOf(500, "boom")).toBe("failed");
  });

  test("mêmes modes côté navigateur et côté serveur", () => {
    expect([...CHALLENGE_MODES]).toEqual([...SERVER_MODES]);
  });

  test("deux sons, fabriqués sur place : aucun fichier", () => {
    expect(Object.keys(SOUNDS)).toEqual(["success", "error"]);
    expect(read("../src/web/lib/game-sounds.ts")).not.toMatch(/\.mp3|\.ogg|\.wav|https?:\/\//);
  });
});

describe("branchement", () => {
  test("une page /fall-check chargée à la demande, reliée depuis le mini-jeu", () => {
    const APP = read("../src/web/app.tsx");
    expect(APP).toContain('<Route path="/fall-check" component={FallCheckPage} />');
    expect(APP).toContain('lazyPage(() => import("./pages/fall-check"))');
    expect(read("../src/web/pages/minigame.tsx")).toContain('to="/fall-check"');
  });

  test("la réponse est toujours montrée avec la phrase du document et sa page", () => {
    expect(PAGE).toContain('data-testid="fallcheck-quote"');
    expect(PAGE).toContain('t("fallcheck.source", { doc: challenge.title, page: current.page })');
  });

  test("barre de progression accessible, sons coupables, clavier", () => {
    expect(PAGE).toContain('<progress className="sr-only" value={state.index} max={total}');
    expect(PAGE).toContain("setSoundMuted(!muted)");
    expect(PAGE).toContain('window.addEventListener("keydown", onKey)');
    expect(PAGE).toContain("useReducedMotion");
  });

  test("serveur : session, document du compte seulement, preuve vérifiée dans le document entier", () => {
    const start = API.indexOf('app.post("/api/agent/doc-challenge"');
    const route = API.slice(start, API.indexOf("\n});", start));
    expect(route).toContain('if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);');
    expect(route).toContain("and(eq(document.id, parsed.data.documentId), eq(document.userId, uid))");
    expect(route).toContain("groundChallenge(object, doc.textContent)");
    expect(route).toContain('return c.json({ error: "no_grounded_question" }, 422);');
    expect(route).toContain("withinTokenCap(uid)");
    // Le journal ne contient ni le texte du document ni les questions.
    expect(route).not.toMatch(/console\.log\([^)]*(textContent|title|frage)/);
  });
});

describe("textes : complets en de/en/fr/es", () => {
  const keys = (lang: string) => {
    const src = read(`../src/web/i18n/messages/${lang}.ts`);
    const start = src.indexOf("\n  fallcheck: {");
    return [...src.slice(start, src.indexOf("\n  },", start)).matchAll(/\n {4,6}(\w+): ["{]/g)].map((m) => m[1]);
  };
  test("mêmes clés partout, et toutes celles que la page demande", () => {
    const de = keys("de");
    expect(de.length).toBeGreaterThan(30);
    for (const lang of ["en", "fr", "es"]) expect(keys(lang)).toEqual(de);
    for (const m of PAGE.matchAll(/t\("fallcheck\.(\w+)"/g)) expect(de).toContain(m[1]);
    for (const e of ["no_grounded_question", "too_short", "rate_limited", "not_configured", "not_found", "quota", "failed"]) expect(de).toContain(e);
  });
});
