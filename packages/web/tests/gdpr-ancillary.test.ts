import { beforeEach, describe, expect, test } from "bun:test";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "../src/api/database/schema";
import { ANONYMOUS_USER_ID, ancillaryErasureSteps, exportAncillaryData } from "../src/api/lib/gdpr-ancillary";

/**
 * Les requêtes RGPD des six tables secondaires, exécutées sur une vraie base
 * SQLite en mémoire (même pilote libSQL qu'en production) : deux étudiants,
 * on supprime Lena, et on vérifie ce qui reste.
 */
const DDL = [
  `CREATE TABLE feedback (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, type text NOT NULL, rating integer, message text NOT NULL,
     page_url text DEFAULT '' NOT NULL, professor_id text, locale text DEFAULT 'de' NOT NULL, user_agent text DEFAULT '' NOT NULL,
     status text DEFAULT 'open' NOT NULL, created_at integer NOT NULL, resolved_at integer)`,
  `CREATE TABLE course_member (course_id text NOT NULL, user_id text NOT NULL, joined_at integer NOT NULL, PRIMARY KEY (course_id, user_id))`,
  `CREATE TABLE avatar_usage (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, duration_sec integer NOT NULL, tts_chars integer DEFAULT 0 NOT NULL,
     cost_cents integer NOT NULL, created_at integer NOT NULL)`,
  `CREATE TABLE shared_knowledge (id text PRIMARY KEY NOT NULL, course_id text NOT NULL, topic text DEFAULT '' NOT NULL, question text NOT NULL,
     answer text NOT NULL, upvotes integer DEFAULT 0 NOT NULL, status text DEFAULT 'pending' NOT NULL, contributor_id text, created_at integer NOT NULL)`,
  `CREATE TABLE shared_knowledge_vote (knowledge_id text NOT NULL, user_id text NOT NULL, created_at integer NOT NULL, PRIMARY KEY (knowledge_id, user_id))`,
  `CREATE TABLE user_notifications (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, kind text NOT NULL, title text NOT NULL, body text NOT NULL,
     data text DEFAULT '{}' NOT NULL, gap_id text, reason text DEFAULT '' NOT NULL, day_key text NOT NULL, channel text DEFAULT 'inbox' NOT NULL,
     push_sent integer DEFAULT 0 NOT NULL, status text DEFAULT 'unread' NOT NULL, created_at integer NOT NULL, opened_at integer, responded_at integer)`,
];

const LENA = "user_lena";
const TOM = "user_tom";

let client: Client;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(async () => {
  client = createClient({ url: ":memory:" });
  for (const sql of DDL) await client.execute(sql);
  db = drizzle(client, { schema });
  for (const u of [LENA, TOM]) {
    await db.insert(schema.feedback).values({ id: `fb_${u}`, userId: u, type: "bug", rating: 4, message: `Rückmeldung von ${u}`, userAgent: "Mozilla/5.0 (Pixel 9)" });
    await db.insert(schema.courseMember).values({ courseId: "tm2", userId: u });
    await db.insert(schema.avatarUsage).values({ id: `av_${u}`, userId: u, durationSec: 30, costCents: 12 });
    await db.insert(schema.sharedKnowledge).values({ id: `sk_${u}`, courseId: "tm2", question: "Warum A = B?", answer: `Erklärung von ${u}`, upvotes: 2, status: "published", contributorId: u });
    await db.insert(schema.sharedKnowledgeVote).values({ knowledgeId: "sk_user_tom", userId: u });
    await db.insert(schema.userNotification).values({ id: `no_${u}`, userId: u, kind: "review", title: "Heute zu wiederholen", body: "3 Karten", dayKey: "2026-11-11" });
  }
});

const erase = async (userId: string) => {
  const counts: Record<string, number> = {};
  for (const [label, run] of ancillaryErasureSteps(db as never, userId)) {
    counts[label] = ((await run()) as { rowsAffected: number }).rowsAffected;
  }
  return counts;
};

describe("RGPD — anonymisation (le contenu reste, le lien disparaît)", () => {
  test("feedback : le retour est gardé, sans identifiant ni appareil", async () => {
    await erase(LENA);
    const [row] = await db.select().from(schema.feedback).where(eq(schema.feedback.id, `fb_${LENA}`));
    expect(row).toMatchObject({ userId: ANONYMOUS_USER_ID, userAgent: "", message: `Rückmeldung von ${LENA}`, rating: 4, type: "bug" });
    expect(await db.select().from(schema.feedback).where(eq(schema.feedback.userId, LENA))).toHaveLength(0);
  });

  test("shared_knowledge : l'explication reste publiée, sans auteur", async () => {
    await erase(LENA);
    const [row] = await db.select().from(schema.sharedKnowledge).where(eq(schema.sharedKnowledge.id, `sk_${LENA}`));
    expect(row).toMatchObject({ contributorId: null, answer: `Erklärung von ${LENA}`, status: "published", upvotes: 2 });
    expect(await db.select().from(schema.sharedKnowledge).where(eq(schema.sharedKnowledge.contributorId, LENA))).toHaveLength(0);
  });
});

describe("RGPD — suppression définitive", () => {
  test("course_member, avatar_usage, shared_knowledge_vote, user_notification : plus aucune ligne", async () => {
    await erase(LENA);
    expect(await db.select().from(schema.courseMember).where(eq(schema.courseMember.userId, LENA))).toHaveLength(0);
    expect(await db.select().from(schema.avatarUsage).where(eq(schema.avatarUsage.userId, LENA))).toHaveLength(0);
    expect(await db.select().from(schema.sharedKnowledgeVote).where(eq(schema.sharedKnowledgeVote.userId, LENA))).toHaveLength(0);
    expect(await db.select().from(schema.userNotification).where(eq(schema.userNotification.userId, LENA))).toHaveLength(0);
  });

  test("le rapport compte une ligne par table", async () => {
    expect(await erase(LENA)).toEqual({
      "feedback (anonymisé)": 1,
      "shared_knowledge (anonymisé)": 1,
      course_member: 1,
      avatar_usage: 1,
      shared_knowledge_vote: 1,
      user_notifications: 1,
    });
  });

  test("aucune trace de l'identifiant ne subsiste dans les six tables", async () => {
    await erase(LENA);
    for (const table of ["feedback", "course_member", "avatar_usage", "shared_knowledge", "shared_knowledge_vote", "user_notifications"]) {
      const { rows } = await client.execute(`SELECT * FROM ${table}`);
      const ids = rows.flatMap((r) => [r.user_id, r.contributor_id]);
      expect(ids).not.toContain(LENA);
    }
  });
});

describe("RGPD — les autres étudiants ne sont pas touchés", () => {
  test("les données de Tom sont intactes après la suppression de Lena", async () => {
    await erase(LENA);
    expect((await db.select().from(schema.feedback).where(eq(schema.feedback.userId, TOM)))[0]?.userAgent).toBe("Mozilla/5.0 (Pixel 9)");
    expect(await db.select().from(schema.courseMember).where(eq(schema.courseMember.userId, TOM))).toHaveLength(1);
    expect(await db.select().from(schema.avatarUsage).where(eq(schema.avatarUsage.userId, TOM))).toHaveLength(1);
    expect((await db.select().from(schema.sharedKnowledge).where(eq(schema.sharedKnowledge.id, `sk_${TOM}`)))[0]?.contributorId).toBe(TOM);
    expect(await db.select().from(schema.sharedKnowledgeVote).where(eq(schema.sharedKnowledgeVote.userId, TOM))).toHaveLength(1);
    expect(await db.select().from(schema.userNotification).where(eq(schema.userNotification.userId, TOM))).toHaveLength(1);
  });

  test("supprimer deux fois le même compte ne change plus rien", async () => {
    await erase(LENA);
    expect(Object.values(await erase(LENA)).every((n) => n === 0)).toBe(true);
  });
});

describe("RGPD — export (art. 15)", () => {
  test("contient les six tables de l'étudiant, sans son identifiant interne", async () => {
    const out = await exportAncillaryData(db as never, LENA);
    expect(out.feedback).toHaveLength(1);
    expect(out.geteiltesWissen[0]).toMatchObject({ answer: `Erklärung von ${LENA}` });
    expect(out.kursMitgliedschaften).toEqual([expect.objectContaining({ courseId: "tm2" })]);
    expect(out.avatarNutzung[0]).toMatchObject({ durationSec: 30, costCents: 12 });
    expect(out.wissenStimmen).toHaveLength(1);
    expect(out.benachrichtigungen[0]).toMatchObject({ title: "Heute zu wiederholen" });
    // L'identifiant interne du compte n'est répété sur aucune ligne.
    for (const rows of Object.values(out)) for (const row of rows) expect(Object.keys(row)).not.toContain("userId");
    expect(Object.keys(out.geteiltesWissen[0]!)).not.toContain("contributorId");
  });

  test("ne contient rien d'un autre étudiant", async () => {
    const out = await exportAncillaryData(db as never, LENA);
    expect(JSON.stringify(out)).not.toContain(`Rückmeldung von ${TOM}`);
    expect(JSON.stringify(out)).not.toContain(`Erklärung von ${TOM}`);
  });

  test("après la suppression, l'export de ces tables est vide", async () => {
    await erase(LENA);
    const out = await exportAncillaryData(db as never, LENA);
    expect(Object.values(out).every((rows) => rows.length === 0)).toBe(true);
  });

  test("une table absente ne fait pas échouer l'export", async () => {
    await client.execute("DROP TABLE user_notifications");
    const out = await exportAncillaryData(db as never, LENA);
    expect(out.benachrichtigungen).toEqual([]);
    expect(out.feedback).toHaveLength(1);
  });
});
