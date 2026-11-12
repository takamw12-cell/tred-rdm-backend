/**
 * Le profil d'études suit le COMPTE, pas le navigateur.
 * Vraie base SQLite en mémoire (même pilote libSQL qu'en production).
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readStoredProfile, saveStoredProfile, type ProfileDb } from "../src/api/lib/stored-profile-db";
import {
  EMPTY_STUDY,
  pickStudy,
  profileUpdateSchema,
  reconcileProfile,
  type StoredProfile,
  type StudyFields,
} from "../src/api/lib/stored-profile";
import { EMPTY_PROFILE, claimProfile } from "../src/web/stores/user";

/** user_access tel qu'il est AVANT la migration. */
const BEFORE = `CREATE TABLE user_access (user_id text PRIMARY KEY NOT NULL, is_active integer DEFAULT true NOT NULL, role text DEFAULT 'user' NOT NULL,
  invited_with text, note text, locale text DEFAULT 'de' NOT NULL, learning_style text DEFAULT 'interactive' NOT NULL,
  professor_id text DEFAULT 'genius' NOT NULL, updated_at integer NOT NULL)`;

/** Les ALTER TABLE du script de migration, lus dans le script lui-même. */
function migrationStatements(): string[] {
  const src = readFileSync(join(import.meta.dir, "../../../migre-profil-complet.mjs"), "utf8");
  const cols = [...src.matchAll(/\["(\w+)", "([^"]+)"\]/g)].map((m) => `ALTER TABLE user_access ADD COLUMN ${m[1]} ${m[2]}`);
  expect(cols.length).toBe(5);
  return cols;
}

const LENA = "user_lena";
const TOM = "user_tom";
const BIO: StudyFields = { degree: "Biophysik", university: "RWTH Aachen", semester: "5", studyLevel: "master" };
const MB: StudyFields = { degree: "Maschinenbau", university: "TU München", semester: "1", studyLevel: "bachelor" };

let client: Client;
let db: ProfileDb;

async function fresh(migrated: boolean) {
  client = createClient({ url: ":memory:" });
  await client.execute(BEFORE);
  if (migrated) for (const sql of migrationStatements()) await client.execute(sql);
  db = drizzle(client) as unknown as ProfileDb;
}

describe("avant la migration : rien ne casse", () => {
  beforeEach(() => fresh(false));

  test("lecture et écriture répondent « pas migré », sans lever", async () => {
    expect((await readStoredProfile(db, LENA)).migrated).toBe(false);
    expect((await saveStoredProfile(db, LENA, BIO)).migrated).toBe(false);
  });

  test("le navigateur garde alors son profil", () => {
    expect(reconcileProfile(BIO, { migrated: false, saved: false, profile: { ...EMPTY_STUDY, learningStyle: "interactive" }, updatedAt: null })).toEqual({ action: "keep" });
    expect(reconcileProfile(BIO, null)).toEqual({ action: "keep" });
  });
});

describe("après la migration", () => {
  beforeEach(() => fresh(true));

  test("un compte sans profil : migré, rien d'enregistré, valeurs par défaut", async () => {
    const p = await readStoredProfile(db, LENA);
    expect(p).toEqual({ migrated: true, saved: false, profile: { ...EMPTY_STUDY, learningStyle: "interactive" }, updatedAt: null });
  });

  test("le profil complet est enregistré puis relu, filière libre comprise", async () => {
    const saved = await saveStoredProfile(db, LENA, { ...BIO, learningStyle: "visual" }, 1_700_000_000_000);
    expect(saved.saved).toBe(true);
    expect(saved.updatedAt).toBe(1_700_000_000_000);
    expect(saved.profile).toEqual({ ...BIO, learningStyle: "visual" });
    const row = (await client.execute("SELECT studiengang, universitaet, semester, niveau, learning_style FROM user_access WHERE user_id = 'user_lena'")).rows[0]!;
    expect([row.studiengang, row.universitaet, row.semester, row.niveau, row.learning_style]).toEqual(["Biophysik", "RWTH Aachen", "5", "master", "visual"]);
  });

  test("sans style dans la requête, le style enregistré ne bouge pas", async () => {
    await saveStoredProfile(db, LENA, { ...BIO, learningStyle: "auditory" });
    expect((await saveStoredProfile(db, LENA, MB)).profile.learningStyle).toBe("auditory");
  });

  test("le reste de la ligne (rôle, langue, accès) n'est pas touché", async () => {
    await client.execute("INSERT INTO user_access (user_id, role, locale, is_active, updated_at) VALUES ('user_lena', 'admin', 'fr', 1, 1)");
    await saveStoredProfile(db, LENA, BIO);
    const row = (await client.execute("SELECT role, locale, is_active FROM user_access WHERE user_id = 'user_lena'")).rows[0]!;
    expect([row.role, row.locale, row.is_active]).toEqual(["admin", "fr", 1]);
  });

  test("DEUX COMPTES : les profils ne se mélangent pas", async () => {
    await saveStoredProfile(db, LENA, BIO);
    await saveStoredProfile(db, TOM, MB);
    expect(pickStudy((await readStoredProfile(db, LENA)).profile)).toEqual(BIO);
    expect(pickStudy((await readStoredProfile(db, TOM)).profile)).toEqual(MB);
    await saveStoredProfile(db, TOM, { ...MB, degree: "Informatik" });
    expect((await readStoredProfile(db, LENA)).profile.degree).toBe("Biophysik");
    expect((await client.execute("SELECT count(*) AS n FROM user_access")).rows[0]!.n).toBe(2);
  });

  test("une saisie hostile reste une donnée (requête paramétrée)", async () => {
    const evil = "x'; DROP TABLE user_access; --";
    await saveStoredProfile(db, LENA, profileUpdateSchema.parse({ ...BIO, degree: evil }));
    expect((await readStoredProfile(db, LENA)).profile.degree).toBe(evil);
  });
});

describe("validation de l'entrée (Zod)", () => {
  test("nettoie : une ligne, bornée", () => {
    const p = profileUpdateSchema.parse({ degree: "  Bio\n physik ", university: "u".repeat(300), semester: "5", studyLevel: "master" });
    expect(p.degree).toBe("Bio physik");
    expect(p.university.length).toBe(100);
  });

  test("refuse un niveau ou un style inconnu, un champ manquant, un texte énorme", () => {
    const ok = { degree: "A", university: "", semester: "", studyLevel: "" };
    expect(profileUpdateSchema.safeParse(ok).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ ...ok, studyLevel: "genius" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ ...ok, learningStyle: "telepathy" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ degree: "A" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ ...ok, degree: "x".repeat(401) }).success).toBe(false);
  });

  test("l'identifiant du compte ne peut pas venir de la requête", () => {
    const p = profileUpdateSchema.parse({ degree: "A", university: "", semester: "", studyLevel: "", userId: TOM, user_id: TOM });
    expect(Object.keys(p).sort()).toEqual(["degree", "semester", "studyLevel", "university"]);
    const route = readFileSync(join(import.meta.dir, "../src/api/routes/account.ts"), "utf8");
    expect(route).toContain("saveStoredProfile(db as unknown as ProfileDb, context.user.id, input)");
    expect(route).toContain("readStoredProfile(db as unknown as ProfileDb, context.user.id)");
  });
});

describe("règle de synchronisation à la connexion", () => {
  const server = (study: StudyFields | null): StoredProfile => ({
    migrated: true,
    saved: study !== null,
    profile: { ...(study ?? EMPTY_STUDY), learningStyle: "interactive" },
    updatedAt: study ? 1 : null,
  });

  test("le serveur a un profil : il gagne", () => {
    expect(reconcileProfile(MB, server(BIO))).toEqual({ action: "pull", study: BIO });
    expect(reconcileProfile(EMPTY_STUDY, server(BIO))).toEqual({ action: "pull", study: BIO });
    expect(reconcileProfile(BIO, server(BIO))).toEqual({ action: "keep" });
  });

  test("le serveur n'en a pas : le profil du navigateur y monte une fois", () => {
    expect(reconcileProfile(BIO, server(null))).toEqual({ action: "push", study: BIO });
    expect(reconcileProfile(EMPTY_STUDY, server(null))).toEqual({ action: "keep" });
  });

  test("l'ancien profil de démonstration n'est jamais envoyé", () => {
    const demo: StudyFields = { degree: "Luft- und Raumfahrttechnik", university: "fhAachen", semester: "3", studyLevel: "bachelor" };
    expect(reconcileProfile(demo, server(null))).toEqual({ action: "keep" });
    // Une vraie étudiante de la FH Aachen (école choisie dans la liste) est, elle, enregistrée.
    expect(reconcileProfile({ ...demo, university: "FH Aachen" }, server(null)).action).toBe("push");
  });
});

describe("scénarios de bout en bout (navigateurs simulés + vraie base)", () => {
  beforeEach(() => fresh(true));

  /** Un navigateur : son localStorage (profil + propriétaire). */
  type Browser = { ownerId: string | null; onboarded: boolean; plan: "free"; germanMode: boolean; profile: typeof EMPTY_PROFILE };
  const browser = (): Browser => ({ ownerId: null, onboarded: false, plan: "free", germanMode: true, profile: EMPTY_PROFILE });

  /** Connexion : rattachement du profil local, puis synchronisation. */
  async function login(b: Browser, userId: string): Promise<Browser> {
    let state = claimProfile(b, userId, `${userId}@uni.de`) as Browser;
    const decision = reconcileProfile(pickStudy(state.profile), await readStoredProfile(db, userId));
    if (decision.action === "pull") state = { ...state, onboarded: true, profile: { ...state.profile, ...decision.study } };
    if (decision.action === "push") await saveStoredProfile(db, userId, decision.study);
    return state;
  }
  /** Changement dans les réglages : store local + serveur. */
  async function edit(b: Browser, change: Partial<StudyFields>): Promise<Browser> {
    const state = { ...b, onboarded: true, profile: { ...b.profile, ...change } };
    await saveStoredProfile(db, b.ownerId!, profileUpdateSchema.parse(pickStudy(state.profile)));
    return state;
  }

  test("deux comptes sur le MÊME navigateur : chacun retrouve le sien", async () => {
    let chrome = await login(browser(), LENA);
    chrome = await edit(chrome, BIO);
    chrome = await login(chrome, TOM); // Lena se déconnecte, Tom se connecte
    expect(pickStudy(chrome.profile)).toEqual(EMPTY_STUDY); // rien de Lena
    chrome = await edit(chrome, MB);
    chrome = await login(chrome, LENA); // Lena revient
    expect(pickStudy(chrome.profile)).toEqual(BIO);
    chrome = await login(chrome, TOM);
    expect(pickStudy(chrome.profile)).toEqual(MB);
    expect(pickStudy((await readStoredProfile(db, LENA)).profile)).toEqual(BIO);
  });

  test("le même compte sur DEUX navigateurs : le même profil", async () => {
    let laptop = await login(browser(), LENA);
    laptop = await edit(laptop, BIO);
    let phone = await login(browser(), LENA); // appareil neuf, localStorage vide
    expect(pickStudy(phone.profile)).toEqual(BIO);
    expect(phone.onboarded).toBe(true); // pas d'onboarding à refaire
    phone = await edit(phone, { semester: "6" });
    laptop = await login(laptop, LENA); // rechargement sur l'ordinateur
    expect(laptop.profile.semester).toBe("6");
    expect(pickStudy(laptop.profile)).toEqual(pickStudy(phone.profile));
  });

  test("un profil qui n'existait que dans le navigateur est envoyé à la première connexion", async () => {
    const old: Browser = { ...browser(), onboarded: true, profile: { ...EMPTY_PROFILE, ...MB, email: "user_tom@uni.de" } };
    await login(old, TOM);
    expect(pickStudy((await readStoredProfile(db, TOM)).profile)).toEqual(MB);
    expect(pickStudy((await login(browser(), TOM)).profile)).toEqual(MB);
  });
});
