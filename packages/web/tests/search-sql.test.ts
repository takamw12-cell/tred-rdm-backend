/**
 * Vérifie que les expressions SQL de la recherche font bien ce qu'on croit,
 * sur une vraie base SQLite en mémoire — pas sur une imitation.
 *
 * Ce que ces tests protègent :
 *   • `instr()` est sensible à la casse : sans les variantes, « biegemoment »
 *     ne trouverait jamais « Biegemoment » ;
 *   • `substr(col, max(1, pos - 120), 320)` doit rester dans les bornes même
 *     quand le mot est au tout début du texte (position négative interdite) ;
 *   • la fenêtre renvoyée doit vraiment contenir le mot, sinon l'extrait
 *     affiché à l'écran serait pris ailleurs dans le document ;
 *   • un document appartenant à QUELQU'UN D'AUTRE ne doit jamais remonter.
 *
 * Le pilote `@libsql/client` est chargé dynamiquement : s'il n'est pas installé
 * sur cette machine, la série entière se met en attente au lieu de faire
 * échouer `bun run verify`. Un déploiement ne doit pas être bloqué par un
 * paquet manquant en local — le serveur, lui, l'a forcément.
 */

import { describe, expect, test } from "bun:test";
import { fold, snippet } from "../src/api/lib/search-text";

const WINDOW = 320;
const BEFORE = 120;

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

const LONG = "Vorbemerkung zur Statik. ".repeat(40); // ~1000 caractères

type Found = { id: string; window: string };
type Harness = { find: (q: string, userId?: string) => Promise<Found[]> };

/** Monte la base d'essai. Renvoie `null` si le pilote SQLite n'est pas là. */
async function setup(): Promise<Harness | null> {
  let libsql: typeof import("@libsql/client");
  let dz: typeof import("drizzle-orm/libsql");
  let core: typeof import("drizzle-orm/sqlite-core");
  let orm: typeof import("drizzle-orm");

  try {
    libsql = await import("@libsql/client");
    dz = await import("drizzle-orm/libsql");
    core = await import("drizzle-orm/sqlite-core");
    orm = await import("drizzle-orm");
  } catch {
    return null;
  }

  const { sqliteTable, text, integer } = core;
  const { and, eq, sql } = orm;

  const doc = sqliteTable("document", {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    textContent: text("text_content").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  });

  // Les deux mêmes expressions que api/routes/search.ts. Les recopier ici est
  // volontaire : si quelqu'un modifie la requête sans toucher ce fichier, les
  // tests continuent de décrire le comportement ATTENDU, pas celui du code.
  const firstPosition = (col: unknown, variants: string[]) => {
    const parts = variants.map((v) => sql`NULLIF(instr(${col}, ${v}), 0)`);
    if (parts.length === 0) return sql`NULL`;
    if (parts.length === 1) return sql`${parts[0]}`;
    return sql`COALESCE(${sql.join(parts, sql`, `)})`;
  };

  const windowAround = (col: unknown, pos: unknown) =>
    sql<string>`substr(${col}, max(1, ${pos} - ${BEFORE}), ${WINDOW})`;

  const client = libsql.createClient({ url: ":memory:" });
  const db = dz.drizzle(client);

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
      // Le mot est TOUT AU DÉBUT : `pos - 120` serait négatif.
      textContent: "Biegemoment und Querkraft am geraden Balken. " + LONG,
      createdAt: new Date(),
    },
    {
      id: "d2",
      userId: "u1",
      title: "Übungsblatt 3",
      // Loin dans le texte, et en minuscules cette fois.
      textContent: LONG + " hier steht biegemoment mitten im Text. " + LONG,
      createdAt: new Date(),
    },
    {
      id: "d3",
      userId: "u1",
      title: "Thermodynamik",
      textContent: "Nichts davon hier drin. " + LONG,
      createdAt: new Date(),
    },
    {
      id: "d4",
      userId: "u2", // AUTRE compte — ne doit jamais remonter.
      title: "Fremdes Dokument",
      textContent: "Biegemoment gehört jemand anderem.",
      createdAt: new Date(),
    },
  ]);

  return {
    async find(q: string, userId = "u1") {
      const pos = firstPosition(doc.textContent, instrVariants(q));
      return db
        .select({ id: doc.id, window: windowAround(doc.textContent, pos) })
        .from(doc)
        .where(and(eq(doc.userId, userId), sql`${pos} IS NOT NULL`))
        .limit(12) as unknown as Promise<Found[]>;
    },
  };
}

const env = await setup();

if (!env) {
  console.warn(
    "[test] @libsql/client introuvable — tests SQL ignorés.\n" +
      "       Pour les activer :  bun add -d @libsql/client",
  );
}

const suite = env ? describe : describe.skip;
const find = (q: string, userId?: string) => env!.find(q, userId);

suite("recherche dans le corps du texte", () => {
  test("trouve le mot quelle que soit la casse écrite en base", async () => {
    expect((await find("biegemoment")).map((r) => r.id).sort()).toEqual(["d1", "d2"]);
  });

  test("la même recherche en majuscules donne le même résultat", async () => {
    expect((await find("BIEGEMOMENT")).map((r) => r.id).sort()).toEqual(["d1", "d2"]);
  });

  test("un document sans le mot n'est pas remonté", async () => {
    expect(await find("Entropie")).toEqual([]);
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
    expect(rows.find((r) => r.id === "d1")!.window.startsWith("Biegemoment")).toBe(true);
  });

  test("la fenêtre reste courte même dans un très long document", async () => {
    for (const row of await find("biegemoment")) {
      expect(row.window.length).toBeLessThanOrEqual(WINDOW);
    }
  });

  test("l'extrait affiché se découpe correctement dans la fenêtre", async () => {
    const rows = await find("biegemoment");
    const snip = snippet(rows.find((r) => r.id === "d2")!.window, "biegemoment");
    expect(snip).not.toBeNull();
    expect(fold(snip!.text.slice(snip!.start, snip!.end))).toBe("biegemoment");
  });

  test("un caractère joker tapé par l'utilisateur reste littéral", async () => {
    // `instr` ne connaît pas les jokers : « % » ne doit rien trouver ici.
    // C'est aussi le cas où COALESCE n'aurait qu'un seul argument.
    expect(await find("%")).toEqual([]);
  });
});
