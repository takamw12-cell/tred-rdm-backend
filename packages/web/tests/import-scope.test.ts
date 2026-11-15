import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ownedImportScope } from "../src/api/lib/import-scope";

/**
 * Un document importé appartient au contexte choisi en haut du Hörsaal
 * (2026-11-15) : le semestre, et le module (Fach) s'il y en a un.
 *
 * La table `document` avait déjà `semester_id` et `subject_id`, et les routes
 * d'import acceptaient déjà les deux champs. Deux manques :
 *   - le panneau « Meine Kurse » n'envoyait que le semestre ;
 *   - le serveur rangeait le module reçu sans vérifier qu'il est à ce compte.
 */

async function memoryDb() {
  const libsql = await import("@libsql/client");
  const dz = await import("drizzle-orm/libsql");
  const client = libsql.createClient({ url: ":memory:" });
  await client.execute("CREATE TABLE subject (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, semester_id TEXT NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT 'slate', position INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT 0)");
  await client.execute("INSERT INTO subject (id, user_id, semester_id, name) VALUES ('tz', 'lena', 's1', 'TZ'), ('elt', 'lena', 's1', 'ELT'), ('mathe2', 'lena', 's2', 'Mathe 2'), ('tz-jonas', 'jonas', 's9', 'TZ')");
  // biome-ignore lint/suspicious/noExplicitAny: base de test réduite aux colonnes lues
  return dz.drizzle(client) as any;
}

describe("la portée d'un import : ce que le navigateur annonce, recoupé avec ce que le compte possède", () => {
  test("mon module : le document y est rangé, dans le semestre de ce module", async () => {
    const db = await memoryDb();
    expect(await ownedImportScope(db, "lena", { semesterId: "s1", subjectId: "tz" })).toEqual({ semesterId: "s1", subjectId: "tz" });
  });

  test("changer de module en haut, puis importer : le document suit le nouveau module", async () => {
    const db = await memoryDb();
    expect((await ownedImportScope(db, "lena", { semesterId: "s1", subjectId: "elt" })).subjectId).toBe("elt");
  });

  test("le semestre du MODULE fait foi : un onglet en retard ne range pas un document à cheval sur deux semestres", async () => {
    const db = await memoryDb();
    expect(await ownedImportScope(db, "lena", { semesterId: "s1", subjectId: "mathe2" })).toEqual({ semesterId: "s2", subjectId: "mathe2" });
    expect(await ownedImportScope(db, "lena", { semesterId: null, subjectId: "tz" })).toEqual({ semesterId: "s1", subjectId: "tz" });
  });

  test("le module d'un autre compte, ou inventé : le document est importé SANS module, pas refusé", async () => {
    const db = await memoryDb();
    expect(await ownedImportScope(db, "lena", { semesterId: "s1", subjectId: "tz-jonas" })).toEqual({ semesterId: "s1", subjectId: null });
    expect(await ownedImportScope(db, "lena", { semesterId: "s1", subjectId: "n-existe-pas" })).toEqual({ semesterId: "s1", subjectId: null });
  });

  test("« Ganzes Semester » (aucun module) : rien ne change", async () => {
    const db = await memoryDb();
    expect(await ownedImportScope(db, "lena", { semesterId: "s1", subjectId: null })).toEqual({ semesterId: "s1", subjectId: null });
    expect(await ownedImportScope(db, "lena", { semesterId: null, subjectId: null })).toEqual({ semesterId: null, subjectId: null });
  });
});

describe("branchement", () => {
  const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8");
  const API = read("../src/api/index.ts");
  const LIBRARY = read("../src/web/components/document-library.tsx");
  const PAGE = read("../src/web/pages/chat.tsx");

  test("les deux routes d'import (un fichier, un lot) passent par ce contrôle", () => {
    expect(API.match(/ownedImportScope\(db, /g)?.length).toBe(2);
  });

  test("le panneau « Meine Kurse » envoie le module choisi avec CHAQUE import : fichier seul, lot, repli fichier par fichier", () => {
    expect(LIBRARY.match(/form\.append\("subjectId", subjectId\)/g)?.length).toBe(3);
  });

  test("le panneau ne liste que les documents du module choisi", () => {
    expect(LIBRARY).toContain("documentsListOptions(semesterId, subjectId)");
    expect(PAGE.match(/subjectId=\{chatSubject\}/g)?.length).toBe(2); // rail du bureau et tiroir du téléphone
  });

  test("module sans document : le panneau le dit et invite à importer", () => {
    expect(LIBRARY).toContain('t("library.emptySubject")');
  });

  test("sous un module, la ligne « tout » du panneau porte le nom du module, pas « Alle Materialien »", () => {
    expect(LIBRARY).toContain('subjectId && subjectName ? subjectName : t("library.allScope")');
    expect(PAGE.match(/subjectName=\{chatSubject \? scopeLabelOfSubject : ""\}/g)?.length).toBe(2);
  });

  test("les textes existent dans les douze langues", () => {
    for (const lang of ["ar", "bn", "de", "en", "es", "fr", "hi", "it", "ja", "pt", "ru", "zh"]) {
      const src = read(`../src/web/i18n/messages/${lang}.ts`);
      for (const key of ["emptySubject", "unassignedHint", "allScopeSubjectSub"]) expect(src).toContain(`    ${key}: "`);
      expect(src).toContain('    boardSubjectLabel: "');
    }
  });
});
