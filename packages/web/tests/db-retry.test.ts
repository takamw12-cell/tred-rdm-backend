import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HTTPException } from "hono/http-exception";
import { TransientDbError, dbErrorCode, isTransientDbError, retryDelayMs, retryWriteRefusal, safeErrorMessage, withDbRetry } from "../src/api/lib/db-retry";

/**
 * Nouvelle tentative quand la base refuse une écriture (test de charge du
 * 18 nov. 2026 : une inscription sur dix échouait sèchement sur « database is
 * locked »). Seules les pannes passagères sont rejouées.
 */
const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");
const noWait = { sleep: async () => {}, random: () => 0.5 };

/** L'erreur telle que Drizzle la lève : la requête ET ses paramètres dans le message, la cause en dessous. */
function drizzleError(code: string, causeMessage: string, params = "abc,2026-11,chat") {
  const cause = Object.assign(new Error(causeMessage), { code, name: "LibsqlError" });
  return Object.assign(new Error(`Failed query: insert into "usage_counter" ("user_id") values (?)\nparams: ${params}`), { cause });
}
const locked = () => drizzleError("SQLITE_BUSY", "SQLITE_BUSY: database is locked");

describe("withDbRetry", () => {
  test("succès après UNE nouvelle tentative", async () => {
    let calls = 0;
    const retries: number[] = [];
    const result = await withDbRetry(
      async () => {
        calls += 1;
        if (calls === 1) throw locked();
        return "écrit";
      },
      { maxAttempts: 3, baseDelayMs: 200, ...noWait, onRetry: ({ attempt }) => retries.push(attempt) },
    );
    expect(result).toBe("écrit");
    expect(calls).toBe(2);
    expect(retries).toEqual([1]);
  });

  test("échec après 3 tentatives : la dernière erreur remonte", async () => {
    let calls = 0;
    const waits: number[] = [];
    const run = withDbRetry(
      async () => {
        calls += 1;
        throw locked();
      },
      { maxAttempts: 3, baseDelayMs: 200, random: () => 0.5, sleep: async (ms) => void waits.push(ms) },
    );
    await expect(run).rejects.toThrow("Failed query");
    expect(calls).toBe(3);
    // Deux attentes seulement (pas après le dernier essai), et la seconde est plus longue.
    expect(waits.length).toBe(2);
    expect(waits[1]).toBeGreaterThan(waits[0]!);
  });

  test("pas de nouvelle tentative sur une erreur de validation (400)", async () => {
    let calls = 0;
    const run = withDbRetry(async () => {
      calls += 1;
      throw new HTTPException(400, { message: "invalid body" });
    }, noWait);
    await expect(run).rejects.toThrow("invalid body");
    expect(calls).toBe(1);
  });

  test("pas de nouvelle tentative sur un refus d'accès (401, 403) ni sur une contrainte", async () => {
    for (const error of [
      new HTTPException(401),
      new HTTPException(403),
      Object.assign(new Error("forbidden"), { status: 403 }),
      drizzleError("SQLITE_CONSTRAINT_UNIQUE", "SQLITE_CONSTRAINT: UNIQUE constraint failed: user.email"),
    ]) {
      let calls = 0;
      await withDbRetry(async () => {
        calls += 1;
        throw error;
      }, noWait).catch(() => {});
      expect(calls).toBe(1);
    }
  });

  test("valeurs par défaut : 3 tentatives, 200 ms de base", async () => {
    let calls = 0;
    const waits: number[] = [];
    await withDbRetry(
      async () => {
        calls += 1;
        throw new TransientDbError("x");
      },
      { sleep: async (ms) => void waits.push(ms), random: () => 1 },
    ).catch(() => {});
    expect(calls).toBe(3);
    expect(waits).toEqual([200, 400]);
  });
});

describe("pannes passagères", () => {
  test("verrou, délai dépassé, connexion : rejouées", () => {
    expect(isTransientDbError(locked())).toBe(true);
    expect(isTransientDbError(drizzleError("SQLITE_LOCKED", "database table is locked"))).toBe(true);
    expect(isTransientDbError(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }))).toBe(true);
    expect(isTransientDbError(new Error("fetch failed"))).toBe(true);
    expect(isTransientDbError(new Error("The operation timed out."))).toBe(true);
    expect(isTransientDbError(Object.assign(new Error("HTTP status 503"), { code: "SERVER_ERROR" }))).toBe(true);
    expect(isTransientDbError(new TransientDbError("signup_write_refused"))).toBe(true);
  });

  test("le TEXTE d'un document ne fait pas passer une erreur pour passagère", () => {
    // Le message de Drizzle contient les paramètres, donc le cours de l'étudiant : on ne le lit pas.
    const err = drizzleError("SQLITE_CONSTRAINT", "CHECK constraint failed", "id,user,Bei einem timeout ist die database is locked und die connection reset");
    expect(isTransientDbError(err)).toBe(false);
  });

  test("le délai double à chaque essai, avec une part de hasard", () => {
    expect(retryDelayMs(1, 200, () => 1)).toBe(200);
    expect(retryDelayMs(2, 200, () => 1)).toBe(400);
    expect(retryDelayMs(3, 200, () => 1)).toBe(800);
    expect(retryDelayMs(2, 200, () => 0)).toBe(200);
    for (let i = 0; i < 20; i += 1) {
      const d = retryDelayMs(2, 200);
      expect(d).toBeGreaterThanOrEqual(200);
      expect(d).toBeLessThanOrEqual(400);
    }
  });
});

describe("ce qui part dans un journal", () => {
  test("le code de l'erreur, jamais les paramètres de la requête", () => {
    const err = drizzleError("SQLITE_BUSY", "SQLITE_BUSY: database is locked", "id-1,user-1,Die Entropie eines abgeschlossenen Systems");
    expect(dbErrorCode(err)).toBe("SQLITE_BUSY");
    const message = safeErrorMessage(err);
    expect(message).toContain("SQLITE_BUSY");
    expect(message).not.toContain("Entropie");
    expect(message).not.toContain("params");
    expect(safeErrorMessage(new Error("JSON Parse error: Unexpected EOF"))).toBe("JSON Parse error: Unexpected EOF");
    expect(safeErrorMessage(new Error("x".repeat(900))).length).toBeLessThanOrEqual(300);
  });
});

describe("inscription : la réponse 422 « FAILED_TO_CREATE_USER » de Better Auth est rejouée", () => {
  const refused = () => Response.json({ code: "FAILED_TO_CREATE_USER", message: "Failed to create user" }, { status: 422 });

  test("refus puis succès : l'étudiant reçoit le succès", async () => {
    let calls = 0;
    const res = await retryWriteRefusal(async () => {
      calls += 1;
      return calls === 1 ? refused() : Response.json({ token: "t" });
    }, noWait);
    expect(res.status).toBe(200);
    expect(calls).toBe(2);
  });

  test("trois refus : la réponse de Better Auth est rendue telle quelle", async () => {
    let calls = 0;
    const res = await retryWriteRefusal(async () => {
      calls += 1;
      return refused();
    }, noWait);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code: string }).code).toBe("FAILED_TO_CREATE_USER");
    expect(calls).toBe(3);
  });

  test("adresse déjà prise, mot de passe trop court, limite de débit : jamais rejoués", async () => {
    for (const res of [
      Response.json({ code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" }, { status: 422 }),
      Response.json({ code: "PASSWORD_TOO_SHORT" }, { status: 400 }),
      Response.json({ error: "RATE_LIMITED" }, { status: 429 }),
    ]) {
      let calls = 0;
      const out = await retryWriteRefusal(async () => {
        calls += 1;
        return res.clone();
      }, noWait);
      expect(out.status).toBe(res.status);
      expect(calls).toBe(1);
    }
  });
});

describe("branchements", () => {
  test("l'inscription, le compteur d'usage et l'enregistrement d'un document passent par la reprise", () => {
    const index = read("src/api/index.ts");
    expect(index).toContain("retryWriteRefusal(() => auth.handler(c.req.raw.clone() as Request)");
    expect(index).toMatch(/withDbRetry\(\(\) =>\s*db\s*\.insert\(document\)/);
    expect(read("src/api/lib/plan.ts")).toContain("withDbRetry(");
    // Le worker : saveImportedDocument enveloppe l'INSERT dans withDbRetry (queue/import-failure.ts).
    expect(read("src/api/lib/queue/import-job.ts")).toContain("saveImportedDocument(");
    expect(read("src/api/lib/queue/import-failure.ts")).toContain("await withDbRetry(insert, retry)");
  });

  test("une erreur 500 ne met ni requête ni paramètres dans le journal ou dans Sentry", () => {
    const index = read("src/api/index.ts");
    expect(index).toContain("console.error(`[500] ${action} :`, safeErrorMessage(err))");
    expect(read("src/api/lib/sentry.ts")).toContain("scrubbedError(err)");
  });
});
