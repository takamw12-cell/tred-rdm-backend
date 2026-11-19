import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { answer, boardName, isPerfect, newSession, pointsFor, publicQuestion, QUESTION_MS, GRACE_MS, PERFECT_REWARD, PERFECT_REWARDS_PER_DAY, weekKey } from "../src/api/arcade/game";
import { timerTone } from "../src/web/lib/doc-challenge";

const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");
const q = (correct: number) => ({ situation: "Fall", question: "Frage?", options: ["A", "B", "C", "D"], correct, explanation: "Weil.", quote: "Beleg aus dem Skript, wörtlich.", page: 3 });
const game = (n = 4) => newSession({ userId: "u1", documentId: "d1", title: "Skript", questions: Array.from({ length: n }, (_, i) => q(i % 4)), showOnBoard: false, now: 0 });
const shown = (s: ReturnType<typeof game>, at: number) => ({ ...s, shownAt: at });

describe("Arcade : le serveur tient la partie", () => {
  test("le navigateur ne reçoit jamais la bonne réponse avec la question", () => {
    const pub = publicQuestion(q(2));
    expect(Object.keys(pub).sort()).toEqual(["options", "question", "situation"]);
  });

  test("pas de réponse à une question qui n'a pas été montrée (le chrono n'a pas démarré)", () => {
    expect(answer(game(), 0, 1000)).toEqual({ ok: false, reason: "not_shown" });
  });

  test("chrono mesuré par le serveur : au-delà de 15 s + marge réseau, c'est faux, même avec la bonne réponse", () => {
    const s = shown(game(), 0);
    const late = answer(s, 0, QUESTION_MS + GRACE_MS + 1);
    expect(late.ok && late.right).toBe(false);
    expect(late.ok && late.timedOut).toBe(true);
    const inTime = answer(s, 0, QUESTION_MS + GRACE_MS - 1);
    expect(inTime.ok && inTime.right).toBe(true);
    const giveUp = answer(s, -1, 1000);
    expect(giveUp.ok && giveUp.timedOut).toBe(true);
  });

  test("points : 100, +50 en série, jusqu'à +50 pour la vitesse ; 0 si faux", () => {
    expect(pointsFor(true, 1, 0)).toBe(150);
    expect(pointsFor(true, 1, QUESTION_MS)).toBe(100);
    expect(pointsFor(true, 2, QUESTION_MS / 2)).toBe(175);
    expect(pointsFor(false, 0, 0)).toBe(0);
  });

  test("une partie se joue question par question et ne se rejoue pas", () => {
    let s = game(4);
    for (let i = 0; i < 4; i++) {
      const r = answer(shown(s, 0), i % 4, 2000);
      expect(r.ok).toBe(true);
      if (r.ok) s = r.session;
    }
    expect(s.finished).toBe(true);
    expect(s.correct).toBe(4);
    expect(isPerfect(s)).toBe(true);
    expect(answer(shown(s, 0), 0, 1)).toEqual({ ok: false, reason: "finished" });
  });

  test("sans-faute : +2 crédits, 3 fois par jour, partie d'au moins 4 questions", () => {
    expect(PERFECT_REWARD).toBe(2);
    expect(PERFECT_REWARDS_PER_DAY).toBe(3);
    let short = game(3);
    for (let i = 0; i < 3; i++) {
      const r = answer(shown(short, 0), i % 4, 1000);
      if (r.ok) short = r.session;
    }
    expect(isPerfect(short)).toBe(false);
    const routes = read("src/api/arcade/routes.ts");
    expect(routes).toContain("transactionId: `arcade:${session.user.id}:${day}:${s.id}`");
    expect(routes).toContain(">= PERFECT_REWARDS_PER_DAY");
    // La partie appartient au compte qui l'a lancée.
    expect(routes).toContain("if (!s || s.userId !== userId");
  });
});

describe("Bestenliste : prénom seul, sur demande", () => {
  test("prénom seul, sans nom ni caractères étranges", () => {
    expect(boardName("Lena Müller")).toBe("Lena");
    expect(boardName("  Jean-Luc   Picard ")).toBe("Jean-Luc");
    expect(boardName("<script>alert(1)</script>")).toBe("scriptalertscript");
    expect(boardName("")).toBe("Anonym");
    expect(boardName("X")).toBe("Anonym");
  });

  test("seulement les comptes qui l'ont demandé ; case décochée par défaut", () => {
    expect(read("src/api/arcade/routes.ts")).toContain("if (res.session.showOnBoard && res.session.score > 0)");
    expect(read("src/api/arcade/routes.ts")).toContain("showOnBoard: body.showOnBoard === true");
    expect(read("src/web/pages/fall-check.tsx")).toContain('return localStorage.getItem(BOARD_PREF) === "1";');
    expect(read("src/api/arcade/leaderboard.ts")).toContain("arcade:speedrun:leaderboard:");
  });

  test("la semaine repart chaque lundi (ISO)", () => {
    expect(weekKey(Date.parse("2026-11-19T12:00:00Z"))).toBe("2026-W47");
    expect(weekKey(Date.parse("2026-11-23T00:30:00Z"))).toBe("2026-W48");
  });
});

describe("chrono affiché", () => {
  test("rouge sous 3 s, orange sous 7 s", () => {
    expect(timerTone(15_000)).toBe("calm");
    expect(timerTone(6_000)).toBe("hurry");
    expect(timerTone(3_000)).toBe("critical");
    expect(timerTone(0)).toBe("critical");
  });
});
