import { describe, expect, test } from "bun:test";
// @ts-expect-error — script Node à la racine du dépôt, sans déclaration de types
import { ajouterColonneModule, lireArguments, rangerDocuments } from "../../../migre-documents-contexte.mjs";
import { saveConversation, sessionForScope } from "../src/api/lib/chat-sessions";

/**
 * migre-documents-contexte.mjs (2026-11-15), rejoué sur une vraie base SQLite
 * en mémoire.
 *
 *   étape 1  ajoute `chat_conversation.subject_id` — la colonne que le code
 *            lit pour donner SA session à chaque module ;
 *   étape 2  range dans un module les documents d'UN compte qui n'en ont pas.
 *
 * L'étape 2 écrit dans les documents d'un étudiant : elle ne devine rien.
 * Sans adresse e-mail elle refuse ; sans `--appliquer` elle montre seulement.
 */

type Row = Record<string, unknown>;

async function base() {
  const libsql = await import("@libsql/client");
  const dz = await import("drizzle-orm/libsql");
  const client = libsql.createClient({ url: ":memory:" });
  for (const sql of [
    "CREATE TABLE user (id TEXT PRIMARY KEY, email TEXT NOT NULL)",
    "CREATE TABLE semester (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL)",
    "CREATE TABLE subject (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, semester_id TEXT NOT NULL, name TEXT NOT NULL)",
    "CREATE TABLE document (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, semester_id TEXT, subject_id TEXT, title TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT 0)",
    "CREATE TABLE chat_conversation (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT 'Neue Unterhaltung', semester_id TEXT, document_id TEXT, document_title TEXT, lang TEXT NOT NULL DEFAULT 'de', deleted_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
    "CREATE TABLE chat_message (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL)",
    "INSERT INTO user (id, email) VALUES ('fondateur', 'Fondateur@Exemple.de'), ('etudiante', 'lena@exemple.de')",
    "INSERT INTO semester (id, user_id, name) VALUES ('s1', 'fondateur', 'Semestre 1'), ('s2', 'fondateur', 'Semestre 2'), ('l1', 'etudiante', 'WS 26/27')",
    "INSERT INTO subject (id, user_id, semester_id, name) VALUES ('tz', 'fondateur', 's1', 'TZ'), ('elt', 'fondateur', 's1', 'ELT'), ('elt-lena', 'etudiante', 'l1', 'ELT')",
    // Le fondateur : trois documents sans module dans le Semestre 1, un déjà rangé en TZ, un dans le Semestre 2, un sans semestre.
    `INSERT INTO document (id, user_id, semester_id, subject_id, title, created_at) VALUES
      ('d1', 'fondateur', 's1', NULL, 'Elektrotechnik 1 – Skript', 1),
      ('d2', 'fondateur', 's1', NULL, 'Elektrotechnik – Übung 3', 2),
      ('d3', 'fondateur', 's1', NULL, 'ELT Klausur 2025', 3),
      ('d4', 'fondateur', 's1', 'tz', 'Technisches Zeichnen – Normen', 4),
      ('d5', 'fondateur', 's2', NULL, 'Mathe 2 – Skript', 5),
      ('d6', 'fondateur', NULL, NULL, 'Sans semestre', 6),
      ('l1', 'etudiante', 'l1', NULL, 'Document de Lena', 7)`,
  ]) {
    await client.execute(sql);
  }
  /** Le même contrat que l'appel HTTP à Turso du script : une requête, ses paramètres → lignes et nombre de lignes modifiées. */
  const run = async (sql: string, args: unknown[] = []) => {
    const r = await client.execute({ sql, args: args as never });
    return { rows: r.rows as unknown as Row[], changes: r.rowsAffected };
  };
  const modules = async () => Object.fromEntries((await client.execute("SELECT id, subject_id, semester_id FROM document ORDER BY id")).rows.map((r) => [r.id, `${r.subject_id ?? "∅"}@${r.semester_id ?? "∅"}`]));
  const lines: string[] = [];
  // biome-ignore lint/suspicious/noExplicitAny: base de test réduite aux colonnes lues
  return { client, run, modules, lines, log: (s: string) => lines.push(s), db: dz.drizzle(client) as any };
}

const AVANT = { d1: "∅@s1", d2: "∅@s1", d3: "∅@s1", d4: "tz@s1", d5: "∅@s2", d6: "∅@∅", l1: "∅@l1" };

describe("étape 1 — la colonne du module sur les conversations", () => {
  test("ajoutée une fois ; relancer le script ne fait rien", async () => {
    const b = await base();
    expect(await ajouterColonneModule(b.run, b.log)).toBe("ajoutee");
    expect(await ajouterColonneModule(b.run, b.log)).toBe("deja_la");
    const cols = (await b.client.execute("SELECT name FROM pragma_table_info('chat_conversation')")).rows.map((r) => r.name);
    expect(cols.filter((c) => c === "subject_id")).toHaveLength(1);
  });

  test("c'est bien la colonne que le code lit : après le script, chaque module a sa session", async () => {
    const b = await base();
    // Avant : un module n'a pas de session (tableau vide), rien ne tombe.
    await saveConversation(b.db, "fondateur", { id: "avant", semesterId: "s1", subjectId: "tz", messages: [{ role: "user", content: "avant la migration" }] });
    expect((await sessionForScope(b.db, "fondateur", { documentId: null, semesterId: "s1", subjectId: "tz" })).conversation).toBeNull();

    await ajouterColonneModule(b.run, b.log);
    await saveConversation(b.db, "fondateur", { id: "tz-1", semesterId: "s1", subjectId: "tz", messages: [{ role: "user", content: "TZ" }] });
    await saveConversation(b.db, "fondateur", { id: "elt-1", semesterId: "s1", subjectId: "elt", messages: [{ role: "user", content: "ELT" }] });
    expect((await sessionForScope(b.db, "fondateur", { documentId: null, semesterId: "s1", subjectId: "tz" })).conversation?.id).toBe("tz-1");
    expect((await sessionForScope(b.db, "fondateur", { documentId: null, semesterId: "s1", subjectId: "elt" })).conversation?.id).toBe("elt-1");
    // La conversation d'avant la migration reste dans « Ganzes Semester ».
    expect((await sessionForScope(b.db, "fondateur", { documentId: null, semesterId: "s1", subjectId: null })).conversation?.id).toBe("avant");
  });
});

describe("étape 2 — ranger les documents sans module d'UN compte dans un module", () => {
  test("sans adresse e-mail : refus, rien n'est lu ni écrit (on ne devine pas le compte)", async () => {
    const b = await base();
    const out = await rangerDocuments(b.run, { module: "ELT", appliquer: true }, b.log);
    expect(out.statut).toBe("email_requis");
    expect(await b.modules()).toEqual(AVANT);
    // Aucun titre de document n'a été affiché.
    expect(b.lines.join("\n")).not.toContain("Elektrotechnik");
    expect(b.lines.join("\n")).not.toContain("Lena");
  });

  test("sans --appliquer : l'aperçu seulement — les trois documents concernés, rien d'écrit", async () => {
    const b = await base();
    const out = await rangerDocuments(b.run, { module: "ELT", email: "fondateur@exemple.de" }, b.log);
    expect(out).toMatchObject({ statut: "apercu", documents: 3 });
    expect(await b.modules()).toEqual(AVANT);
    const text = b.lines.join("\n");
    for (const title of ["Elektrotechnik 1 – Skript", "Elektrotechnik – Übung 3", "ELT Klausur 2025"]) expect(text).toContain(title);
    expect(text).not.toContain("Technisches Zeichnen"); // déjà rangé en TZ
    expect(text).not.toContain("Document de Lena");
  });

  test("avec --appliquer : seuls SES documents sans module de CE semestre passent dans le module", async () => {
    const b = await base();
    const out = await rangerDocuments(b.run, { module: "elt", email: "FONDATEUR@exemple.de", appliquer: true }, b.log);
    expect(out).toMatchObject({ statut: "fait", documents: 3 });
    expect(await b.modules()).toEqual({
      d1: "elt@s1",
      d2: "elt@s1",
      d3: "elt@s1",
      d4: "tz@s1", // déjà rangé ailleurs : pas touché
      d5: "∅@s2", // autre semestre : pas touché
      d6: "∅@∅", // sans semestre : pas touché sans l'option
      l1: "∅@l1", // autre compte, même nom de module : pas touché
    });
  });

  test("relancer ne change plus rien", async () => {
    const b = await base();
    await rangerDocuments(b.run, { module: "ELT", email: "fondateur@exemple.de", appliquer: true }, b.log);
    const again = await rangerDocuments(b.run, { module: "ELT", email: "fondateur@exemple.de", appliquer: true }, b.log);
    expect(again).toMatchObject({ statut: "fait", documents: 0 });
  });

  test("--sans-semestre : les documents sans semestre suivent aussi, et prennent le semestre du module", async () => {
    const b = await base();
    const out = await rangerDocuments(b.run, { module: "ELT", email: "fondateur@exemple.de", sansSemestre: true, appliquer: true }, b.log);
    expect(out.documents).toBe(4);
    expect((await b.modules()).d6).toBe("elt@s1");
    expect((await b.modules()).d5).toBe("∅@s2");
  });

  test("module introuvable pour ce compte : rien d'écrit, et la liste de SES modules pour corriger le nom", async () => {
    const b = await base();
    const out = await rangerDocuments(b.run, { module: "Elektro", email: "fondateur@exemple.de", appliquer: true }, b.log);
    expect(out.statut).toBe("module_introuvable");
    expect(await b.modules()).toEqual(AVANT);
    expect(b.lines.join("\n")).toContain("TZ");
    expect(b.lines.join("\n")).toContain("ELT");
  });

  test("le même nom de module dans deux semestres du compte : il faut dire lequel", async () => {
    const b = await base();
    await b.client.execute("INSERT INTO subject (id, user_id, semester_id, name) VALUES ('elt2', 'fondateur', 's2', 'ELT')");
    expect((await rangerDocuments(b.run, { module: "ELT", email: "fondateur@exemple.de", appliquer: true }, b.log)).statut).toBe("ambigu");
    expect(await b.modules()).toEqual(AVANT);
    const out = await rangerDocuments(b.run, { module: "ELT", semestre: "semestre 2", email: "fondateur@exemple.de", appliquer: true }, b.log);
    expect(out).toMatchObject({ statut: "fait", documents: 1 });
    expect((await b.modules()).d5).toBe("elt2@s2");
  });

  test("adresse inconnue : rien", async () => {
    const b = await base();
    expect((await rangerDocuments(b.run, { module: "ELT", email: "personne@exemple.de", appliquer: true }, b.log)).statut).toBe("compte_introuvable");
    expect(await b.modules()).toEqual(AVANT);
  });
});

describe("les arguments de la ligne de commande", () => {
  test("rien : l'étape 1 seule", () => {
    expect(lireArguments([])).toEqual({ module: null, semestre: null, email: null, sansSemestre: false, appliquer: false });
  });

  test("--module, --semestre (avec espaces), --email, --sans-semestre, --appliquer", () => {
    expect(lireArguments(["--module=ELT", "--semestre=Semestre 1", "--email=toi@exemple.de", "--sans-semestre", "--appliquer"])).toEqual({
      module: "ELT",
      semestre: "Semestre 1",
      email: "toi@exemple.de",
      sansSemestre: true,
      appliquer: true,
    });
  });
});
