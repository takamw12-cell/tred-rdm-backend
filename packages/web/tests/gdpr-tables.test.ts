import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * La routine RGPD (src/api/lib/gdpr.ts) est une liste tenue à la main : une
 * table personnelle oubliée survit à la suppression du compte. Ce test lit le
 * source (sans base) et vérifie que ces tables sont listées, exportées et
 * effacées. `flashcard` avait été oubliée à sa création.
 */
const source = readFileSync(join(import.meta.dir, "../src/api/lib/gdpr.ts"), "utf8");
const deletion = source.slice(source.indexOf("export async function deleteUserData"));
const exportPart = source.slice(source.indexOf("export async function exportUserData"), source.indexOf("export async function deleteUserData"));

describe("RGPD — tables personnelles", () => {
  for (const [table, symbol] of [
    ["flashcard", "flashcard"],
    ["generated_video", "generatedVideo"],
    ["solver_result", "solverResult"],
  ] as const) {
    test(`${table} est dans la liste de contrôle`, () => {
      expect(source).toContain(`"${table}",`);
    });
    test(`${table} est effacée à la suppression du compte`, () => {
      expect(deletion).toContain(`db.delete(${symbol}).where(eq(${symbol}.userId, userId))`);
    });
    test(`${table} figure dans l'export des données`, () => {
      expect(exportPart).toContain(`from(${symbol}).where(eq(${symbol}.userId, userId))`);
    });
  }
});
