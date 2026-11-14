import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ownedDocumentFile } from "../src/api/lib/document-owner";
import { safeRange, streamDocument, type OwnedFile, type StreamDeps } from "../src/api/lib/document-stream";

/**
 * GET /api/documents/:id/stream (2026-11-14) : l'original d'un document n'est
 * servi qu'à SON propriétaire. Pour tout autre compte, le document n'existe pas.
 */

const PDF = new TextEncoder().encode("%PDF-1.4 … le cours de Lena …");

/** Deux étudiantes, un document chacune. */
const FILES: Record<string, { userId: string; file: OwnedFile }> = {
  "doc-lena": { userId: "lena", file: { fileKey: "documents/lena/doc-lena.pdf", title: "Thermo_Kapitel_3" } },
  "doc-mara": { userId: "mara", file: { fileKey: "documents/mara/doc-mara.pdf", title: "Altklausur WS 2025" } },
  "doc-ancien": { userId: "lena", file: { fileKey: null, title: "Importé avant les originaux" } },
};

function deps(over: Partial<StreamDeps> = {}) {
  const fetched: { key: string; range: string | null }[] = [];
  const d: StreamDeps = {
    // Même sémantique que la vraie requête : identifiant ET compte.
    findOwned: async (documentId, userId) => {
      const row = FILES[documentId];
      return row && row.userId === userId ? row.file : null;
    },
    getObject: async (key, range) => {
      fetched.push({ key, range });
      return range ? { body: PDF.slice(0, 8), contentLength: 8, contentRange: `bytes 0-7/${PDF.byteLength}` } : { body: PDF, contentLength: PDF.byteLength };
    },
    mime: (ext) => (ext === "pdf" ? "application/pdf" : "application/octet-stream"),
    ...over,
  };
  return { d, fetched };
}

describe("accès à l'original : le propriétaire, et lui seul", () => {
  test("la propriétaire reçoit son PDF", async () => {
    const { d, fetched } = deps();
    const res = await streamDocument({ userId: "lena", documentId: "doc-lena", range: null }, d);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF);
    expect(fetched).toEqual([{ key: "documents/lena/doc-lena.pdf", range: null }]);
  });

  test("une autre étudiante connectée est REFUSÉE — et rien n'est lu dans le stockage", async () => {
    const { d, fetched } = deps();
    const res = await streamDocument({ userId: "mara", documentId: "doc-lena", range: null }, d);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(fetched).toEqual([]);
  });

  test("le refus ne dit pas que le document existe : même réponse que pour un identifiant inventé", async () => {
    const { d } = deps();
    const foreign = await streamDocument({ userId: "mara", documentId: "doc-lena", range: null }, d);
    const invented = await streamDocument({ userId: "mara", documentId: "doc-qui-n-existe-pas", range: null }, d);
    expect(foreign.status).toBe(invented.status);
    expect(await foreign.text()).toBe(await invented.text());
  });

  test("sans session : 401, sans même chercher le document", async () => {
    let asked = 0;
    const { d, fetched } = deps({
      findOwned: async () => {
        asked += 1;
        return null;
      },
    });
    const res = await streamDocument({ userId: null, documentId: "doc-lena", range: null }, d);
    expect(res.status).toBe(401);
    expect(asked).toBe(0);
    expect(fetched).toEqual([]);
  });

  test("un document sans original (ancien import) : 404 no_original, pour sa propriétaire", async () => {
    const { d } = deps();
    const res = await streamDocument({ userId: "lena", documentId: "doc-ancien", range: null }, d);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "no_original" });
  });
});

describe("la réponse ne peut pas devenir une page de TRED", () => {
  test("type MIME de l'extension, nosniff, bac à sable, téléchargement, cache privé", async () => {
    const { d } = deps();
    const res = await streamDocument({ userId: "lena", documentId: "doc-lena", range: null }, d);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Security-Policy")).toBe("sandbox; default-src 'none'");
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename\*=UTF-8''Thermo_Kapitel_3\.pdf$/);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=300");
    expect(res.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
  });

  test("un titre piégé ne casse pas l'en-tête", async () => {
    const { d } = deps({ findOwned: async () => ({ fileKey: "documents/lena/x.pdf", title: 'a"\r\nSet-Cookie: x=1; <script>' }) });
    const res = await streamDocument({ userId: "lena", documentId: "x", range: null }, d);
    const disposition = res.headers.get("Content-Disposition") ?? "";
    expect(disposition).not.toMatch(/[\r\n"<>]/);
    expect(disposition.startsWith("attachment; filename*=UTF-8''")).toBe(true);
  });
});

describe("plages d'octets : pdf.js ne télécharge que les pages qu'il affiche", () => {
  test("Range → 206, transmis au stockage", async () => {
    const { d, fetched } = deps();
    const res = await streamDocument({ userId: "lena", documentId: "doc-lena", range: "bytes=0-7" }, d);
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(`bytes 0-7/${PDF.byteLength}`);
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(fetched[0]!.range).toBe("bytes=0-7");
  });

  test("une plage mal formée est ignorée, pas transmise", () => {
    expect(safeRange("bytes=0-65535")).toBe("bytes=0-65535");
    expect(safeRange("bytes=1024-")).toBe("bytes=1024-");
    expect(safeRange("bytes=-500")).toBe("bytes=-500");
    expect(safeRange("bytes=0-1,5-9")).toBeNull();
    expect(safeRange("items=0-5")).toBeNull();
    expect(safeRange("bytes=abc")).toBeNull();
    expect(safeRange(undefined)).toBeNull();
  });

  test("original disparu du stockage : 404 ; stockage en panne : 502 — jamais une exception", async () => {
    const gone = deps({
      getObject: async () => {
        throw Object.assign(new Error("The specified key does not exist."), { name: "NoSuchKey" });
      },
    });
    expect((await streamDocument({ userId: "lena", documentId: "doc-lena", range: null }, gone.d)).status).toBe(404);
    const down = deps({
      getObject: async () => {
        throw new Error("socket hang up");
      },
    });
    expect((await streamDocument({ userId: "lena", documentId: "doc-lena", range: null }, down.d)).status).toBe(502);
  });
});

/* ── La vraie requête, sur une vraie base SQLite en mémoire ───────────── */

async function memoryDb() {
  try {
    const libsql = await import("@libsql/client");
    const dz = await import("drizzle-orm/libsql");
    const client = libsql.createClient({ url: ":memory:" });
    await client.execute("CREATE TABLE document (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, file_key TEXT)");
    await client.execute("INSERT INTO document (id, user_id, title, file_key) VALUES ('doc-lena', 'lena', 'Thermo_Kapitel_3', 'documents/lena/doc-lena.pdf'), ('doc-mara', 'mara', 'Altklausur', 'documents/mara/doc-mara.pdf')");
    return dz.drizzle(client);
  } catch {
    return null; // pilote SQLite absent sur cette machine : la série est sautée, comme search-sql.test.ts
  }
}
const sqlDb = await memoryDb();

describe.skipIf(!sqlDb)("la requête SQL de propriété (base réelle en mémoire)", () => {
  // biome-ignore lint/suspicious/noExplicitAny: la base de test n'a que les colonnes lues par la requête
  const db = sqlDb as any;

  test("la propriétaire retrouve la clé de son fichier", async () => {
    expect(await ownedDocumentFile(db, "doc-lena", "lena")).toEqual({ fileKey: "documents/lena/doc-lena.pdf", title: "Thermo_Kapitel_3" });
  });

  test("un autre compte ne reçoit RIEN pour le même identifiant", async () => {
    expect(await ownedDocumentFile(db, "doc-lena", "mara")).toBeNull();
    expect(await ownedDocumentFile(db, "doc-mara", "lena")).toBeNull();
  });

  test("une tentative d'injection dans l'identifiant ne trouve rien", async () => {
    expect(await ownedDocumentFile(db, "doc-lena' OR '1'='1", "mara")).toBeNull();
    expect(await ownedDocumentFile(db, "doc-lena", "mara' OR '1'='1")).toBeNull();
  });

  test("de bout en bout : la route refuse la non-propriétaire avec la vraie requête", async () => {
    const real: StreamDeps = {
      findOwned: (documentId, userId) => ownedDocumentFile(db, documentId, userId),
      getObject: async () => ({ body: PDF, contentLength: PDF.byteLength }),
      mime: () => "application/pdf",
    };
    expect((await streamDocument({ userId: "lena", documentId: "doc-lena", range: null }, real)).status).toBe(200);
    expect((await streamDocument({ userId: "mara", documentId: "doc-lena", range: null }, real)).status).toBe(404);
    expect((await streamDocument({ userId: null, documentId: "doc-lena", range: null }, real)).status).toBe(401);
  });
});

describe("branchement de la route", () => {
  const INDEX = readFileSync(join(import.meta.dir, "../src/api/index.ts"), "utf8");
  const route = INDEX.slice(INDEX.indexOf('app.get("/api/documents/:id/stream"'), INDEX.indexOf("// ── Citations du tuteur"));

  test("le compte vient de la session, la requête de propriété est celle testée ci-dessus", () => {
    expect(route).toContain("const session = await requestSession(c.req.raw);");
    expect(route).toContain("userId: session?.user.id ?? null");
    expect(route).toContain("findOwned: (documentId, userId) => ownedDocumentFile(db, documentId, userId)");
    // Jamais un compte fourni par le navigateur.
    expect(route).not.toMatch(/c\.req\.(query|header)\(["']user/i);
  });

  test("limitée en débit", () => {
    expect(INDEX).toContain('app.use("/api/documents/:id/stream", rateLimitMiddleware(');
    expect(INDEX).toContain('app.use("/api/documents/citations/*", rateLimitMiddleware(');
  });
});
