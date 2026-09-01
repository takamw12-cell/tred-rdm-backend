/**
 * Vérifie que les expressions SQL de la recherche font bien ce qu'on croit,
 * sur une vraie base SQLite — pas sur une imitation.
 *
 * Ce que ces tests protègent :
 *   • `instr()` est sensible à la casse : sans les variantes, « biegemoment »
 *     ne trouverait jamais « Biegemoment ».
 *   • `substr(col, max(1, pos - 120), 320)` doit rester dans les bornes même
 *     quand le mot est au tout début du texte (position négative interdite).
 *   • la fenêtre renvoyée doit vraiment contenir le mot, sinon l'extrait
 *     affiché à l'écran serait pris ailleurs dans le document.
 */

import { describe, expect, test, beforeAll } from "bun:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { and, eq, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { fold, snippet } from "../src/api/lib/search-text";

const doc = sqliteTable("document", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  textContent: text("text_content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

const WINDOW = 320;
const BEFORE = 120;

function firstPosition(col: SQLWrapper, variants: string[]): SQL<number | null> {
  const parts = variants.map((v) => sql`NULLIF(instr(${col}, ${v}), 0)`);
  // SQLite refuse COALESCE a un seul argument. Le cas arrive des que les
  // quatre orthographes se confondent (un mot deja tout en minuscules, ou un
  // seul caractere) : sans ce garde-fou, la recherche plante en production.
  if (parts.length === 0) return sql<number | null>`NULL`;
  if (parts.length === 1) return sql<number | null>`${parts[0]}`;
  return sql<number | null>`COALESCE(${sql.join(parts, sql`, `)})`;
}

function windowAround(col: SQLWrapper, pos: SQL<number | null>): SQL<string> {
  return sql<string>`substr(${col}, max(1, ${pos} - ${BEFORE}), ${WINDOW})`;
}

function instrVariants(q: string): string[] {
  const base = q.trim();
  return [
    ...new Set([
      base,
      base.toLowerCase(),
      base.toUpperCase(),
      base.charAt(0).toUpperCase() + base.slice(1).toLowerCase(),
    ]),
  ].filter(Boolean);
}

const client = createClient({ url: ":memory:" });
const db = drizzle(client);

const LONG_PREFIX = "Vorbemerkung zur Statik. ".repeat(40); // ~1000 caractères

beforeAll(async () => {
  await client.execute(`CREATE TABLE document (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    text_content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);

  await db.insert(doc).values([
    {
      id: "d1",
      userId: "u1",
      title: "Technische Mechanik 2",
      // Le mot cherché est TOUT AU DÉBUT : pos - 120 serait négatif.
      textContent: "Biegemoment und Querkraft am geraden Balken. " + LONG_PREFIX,
      createdAt: new Date(),
    },
    {
      id: "d2",
      userId: "u1",
      title: "Übungsblatt 3",
      // Le mot est loin dans le texte, en minuscules cette fois.
      textContent: LONG_PREFIX + " hier steht biegemoment mitten im Text. " + LONG_PREFIX,
      createdAt: new Date(),
    },
    {
      id: "d3",
      userId: "u1",
      title: "Thermodynamik",
      textContent: "Nichts davon hier drin. " + LONG_PREFIX,
      createdAt: new Date(),
    },
    {
      id: "d4",
      userId: "u2", // AUTRE utilisateur — ne doit jamais remonter.
      title: "Fremdes Dokument",
      textContent: "Biegemoment gehört jemand anderem.",
      createdAt: new Date(),
    },
  ]);
});

async function find(q: string, userId = "u1") {
  const variants = instrVariants(q);
  const pos = firstPosition(doc.textContent, variants);
  return db
    .select({ id: doc.id, window: windowAround(doc.textContent, pos) })
    .from(doc)
    .where(and(eq(doc.userId, userId), sql`${pos} IS NOT NULL`))
    .limit(12);
}

describe("recherche dans le corps du texte", () => {
  test("trouve le mot quelle que soit la casse écrite en base", async () => {
    const rows = await find("biegemoment");
    const ids = rows.map((r) => r.id).sort();
    expect(ids).toEqual(["d1", "d2"]);
  });

  test("la même recherche en majuscules donne le même résultat", async () => {
    const rows = await find("BIEGEMOMENT");
    expect(rows.map((r) => r.id).sort()).toEqual(["d1", "d2"]);
  });

  test("un document sans le mot n'est pas remonté", async () => {
    const rows = await find("Entropie");
    expect(rows).toEqual([]);
  });

  test("les documents d'un autre compte restent invisibles", async () => {
    const rows = await find("biegemoment", "u1");
    expect(rows.some((r) => r.id === "d4")).toBe(false);
  });

  test("la fenêtre contient réellement le mot cherché", async () => {
    for (const row of await find("biegemoment")) {
      expect(fold(row.window)).toContain("biegemoment");
    }
  });

  test("un mot en début de texte ne casse pas substr", async () => {
    const rows = await find("biegemoment");
    const d1 = rows.find((r) => r.id === "d1")!;
    expect(d1.window.startsWith("Biegemoment")).toBe(true);
  });

  test("la fenêtre reste courte même dans un très long document", async () => {
    for (const row of await find("biegemoment")) {
      expect(row.window.length).toBeLessThanOrEqual(320);
    }
  });

  test("l'extrait affiché se découpe correctement dans la fenêtre", async () => {
    const rows = await find("biegemoment");
    const d2 = rows.find((r) => r.id === "d2")!;
    const snip = snippet(d2.window, "biegemoment");
    expect(snip).not.toBeNull();
    expect(fold(snip!.text.slice(snip!.start, snip!.end))).toBe("biegemoment");
  });

  test("un caractère joker tapé par l'utilisateur reste littéral", async () => {
    // `instr` ne connaît pas les jokers : « % » ne doit rien trouver ici.
    const rows = await find("%");
    expect(rows).toEqual([]);
  });
});
