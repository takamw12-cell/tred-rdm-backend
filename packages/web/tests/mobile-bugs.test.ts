import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dbErrorReason, isMissingTable } from "../src/api/lib/db-missing-table";
import { renderSettings } from "../src/web/lib/device-tier";

const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");

describe("bug « Konnte nicht gespeichert werden » (19 nov. 2026) : 4 réponses 500 en production", () => {
  test("une table absente se reconnaît même emballée par drizzle (cause, deux niveaux)", () => {
    const libsql = Object.assign(new Error("SQLITE_ERROR: no such table: professor_custom"), { code: "SQLITE_ERROR" });
    const drizzle = Object.assign(new Error('Failed query: insert into "professor_custom" ("user_id") values (?)\nparams: u1'), { cause: libsql });
    expect(isMissingTable(drizzle)).toBe(true);
    expect(isMissingTable(Object.assign(new Error("wrap"), { cause: drizzle }))).toBe(true);
    expect(isMissingTable(new Error("UNIQUE constraint failed"))).toBe(false);
    expect(isMissingTable(null)).toBe(false);
    // Le motif journalisé est le plus profond, sans les paramètres de la requête.
    expect(dbErrorReason(drizzle)).toBe("SQLITE_ERROR: no such table: professor_custom");
  });

  test("le professeur, le consentement e-mail et la campagne utilisent ce détecteur", () => {
    expect(read("src/api/lib/professor-custom.ts")).toContain("if (isMissingTable(error)) {");
    expect(read("src/api/lib/marketing.ts")).toContain("const missingTable = isMissingTable;");
    expect(read("src/api/emails/routes.ts")).toContain("if (isMissingTable(error))");
    expect(read("src/api/lib/concept-mastery.ts")).toContain("export const missingTable = isMissingTable;");
  });
});

describe("bug « modèle 3D invisible sur téléphone »", () => {
  test("téléphone : rendu sûr (matières standard, sans GLSL greffé, lumière ciel/sol)", () => {
    expect(renderSettings("mobile").safe).toBe(true);
    expect(renderSettings("low").safe).toBe(true);
    expect(renderSettings("high").safe).toBe(false);
    const kit = read("src/web/components/explorer-kit.tsx");
    expect(kit).toContain("if (safe) {");
    expect(kit).toContain("metalness={Math.min(metalness, 0.3)}");
    expect(read("src/web/components/explorer-scenes.tsx")).toContain("plain.metalness = Math.min(plain.metalness ?? 0, 0.3);");
    expect(read("src/web/components/Explorer3D.tsx")).toContain('{safe && <hemisphereLight args={["#E2E8F0", "#1E293B", 1.1]} />}');
  });

  test("sablier avec pourcentage pendant le téléchargement du modèle", () => {
    const scene = read("src/web/components/Explorer3D.tsx");
    expect(scene).toContain("const { active, progress } = useProgress();");
    expect(scene).toContain('data-testid="explorer-model-loading"');
  });
});
