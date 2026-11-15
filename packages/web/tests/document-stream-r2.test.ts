import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ownedDocumentFile } from "../src/api/lib/document-owner";
import { storedObjectReader, STREAM_BUFFER_MAX } from "../src/api/lib/document-storage";
import { streamDocument, type StreamDeps } from "../src/api/lib/document-stream";
import { createS3Client } from "../src/api/lib/s3";

/**
 * GET /api/documents/:id/stream contre un R2 SIMULÉ (2026-11-15).
 *
 * tests/document-stream.test.ts remplace le stockage par une fonction. Ici,
 * rien n'est remplacé dans NOTRE code : la vraie requête de propriété (SQLite
 * en mémoire), la vraie route (`streamDocument`), le vrai lecteur de stockage
 * (`storedObjectReader`) et le vrai client S3, construit comme en production
 * (`createS3Client` : région « auto », adressage par chemin — ce que Cloudflare
 * R2 exige). Seul R2 est joué par un serveur HTTP local, qui répond comme lui :
 * requêtes signées (SigV4) obligatoires, plages d'octets → 206, erreurs en XML.
 *
 * Ce que ces tests garantissent en production :
 *   - seule la propriétaire fait partir une requête vers R2 ;
 *   - une autre étudiante reçoit 404 et R2 ne voit RIEN passer ;
 *   - la clé demandée à R2 vient de la base, jamais de l'adresse appelée.
 */

const BUCKET = "tred-originaux";
const ACCESS_KEY = "cle-de-test";
const PDF = new TextEncoder().encode(`%PDF-1.4\n${"Seite ".repeat(4000)}\n%%EOF`);
const KEY_LENA = "documents/lena/doc-lena.pdf";
const KEY_MARA = "documents/mara/doc-mara.pdf";
const KEY_PANNE = "documents/lena/panne.pdf";

interface Seen {
  method: string;
  path: string;
  range: string | null;
  authorization: string;
}

const seen: Seen[] = [];
const xml = (code: string, status: number, extra: Record<string, string> = {}) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${code}</Message></Error>`, { status, headers: { "Content-Type": "application/xml", ...extra } });

/** Ce que R2 contient. doc-disparu a une ligne en base mais plus d'objet. */
const OBJECTS: Record<string, Uint8Array> = { [KEY_LENA]: PDF, [KEY_MARA]: new TextEncoder().encode("%PDF-1.4 Altklausur de Mara") };

const r2 = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch(req) {
    const url = new URL(req.url);
    const authorization = req.headers.get("authorization") ?? "";
    const range = req.headers.get("range");
    seen.push({ method: req.method, path: decodeURIComponent(url.pathname), range, authorization });
    // R2 n'est pas public : sans signature, ou avec une clé qu'il ne connaît pas, il refuse.
    if (!authorization.startsWith("AWS4-HMAC-SHA256 ")) return xml("AccessDenied", 403);
    if (!authorization.includes(`Credential=${ACCESS_KEY}/`)) return xml("InvalidAccessKeyId", 403);
    const [, bucket, ...rest] = url.pathname.split("/");
    if (bucket !== BUCKET) return xml("NoSuchBucket", 404);
    const key = decodeURIComponent(rest.join("/"));
    if (key === KEY_PANNE) return xml("InternalError", 500);
    const bytes = OBJECTS[key];
    if (!bytes) return xml("NoSuchKey", 404);
    const base = { "Content-Type": "application/pdf", "Accept-Ranges": "bytes", ETag: '"0123456789abcdef0123456789abcdef"' };
    if (!range) return new Response(bytes, { status: 200, headers: { ...base, "Content-Length": String(bytes.byteLength) } });
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    const start = m?.[1] ? Number(m[1]) : Math.max(0, bytes.byteLength - Number(m?.[2] ?? 0));
    const end = m?.[1] && m[2] ? Math.min(Number(m[2]), bytes.byteLength - 1) : bytes.byteLength - 1;
    if (!m || start >= bytes.byteLength || start > end) return xml("InvalidRange", 416, { "Content-Range": `bytes */${bytes.byteLength}` });
    const part = bytes.slice(start, end + 1);
    return new Response(part, { status: 206, headers: { ...base, "Content-Length": String(part.byteLength), "Content-Range": `bytes ${start}-${end}/${bytes.byteLength}` } });
  },
});
afterAll(() => r2.stop(true));
beforeEach(() => {
  seen.length = 0;
});

/** Le client de production, pointé sur le faux R2. */
const clientFor = (accessKeyId = ACCESS_KEY) =>
  createS3Client({ S3_ENDPOINT: `http://127.0.0.1:${r2.port}`, S3_ACCESS_KEY_ID: accessKeyId, S3_SECRET_ACCESS_KEY: "secret-de-test" });

/* ── La base : deux étudiantes, leurs documents ───────────────────────── */

const libsql = await import("@libsql/client");
const dz = await import("drizzle-orm/libsql");
const sqlite = libsql.createClient({ url: ":memory:" });
await sqlite.execute("CREATE TABLE document (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, file_key TEXT)");
await sqlite.execute(
  `INSERT INTO document (id, user_id, title, file_key) VALUES
     ('doc-lena', 'lena', 'Thermo_Kapitel_3', '${KEY_LENA}'),
     ('doc-mara', 'mara', 'Altklausur WS 2025', '${KEY_MARA}'),
     ('doc-disparu', 'lena', 'Skript ohne Original', 'documents/lena/disparu.pdf'),
     ('doc-panne', 'lena', 'Skript', '${KEY_PANNE}')`,
);
// biome-ignore lint/suspicious/noExplicitAny: la base de test n'a que les colonnes lues par la requête
const db = dz.drizzle(sqlite) as any;

/** Exactement ce que la route branche (api/index.ts), le faux R2 à la place du vrai. */
const deps = (client = clientFor()): StreamDeps => ({
  findOwned: (documentId, userId) => ownedDocumentFile(db, documentId, userId),
  getObject: storedObjectReader(client, BUCKET),
  mime: (ext) => (ext === "pdf" ? "application/pdf" : "application/octet-stream"),
});
const get = (userId: string | null, documentId: string, range: string | null = null, d = deps()) => streamDocument({ userId, documentId, range }, d);

describe("droits d'accès, R2 au bout du fil", () => {
  test("la propriétaire reçoit son PDF, lu dans R2 par UNE requête signée, en adressage par chemin", async () => {
    const res = await get("lena", "doc-lena");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: "GET", path: `/${BUCKET}/${KEY_LENA}`, range: null });
    // Signature AWS v4, région « auto », service s3 : ce que R2 attend.
    expect(seen[0]!.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=cle-de-test\/\d{8}\/auto\/s3\/aws4_request, /);
  });

  test("une autre étudiante connectée reçoit 404 — et R2 ne voit passer AUCUNE requête", async () => {
    const res = await get("mara", "doc-lena");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(seen).toEqual([]);
  });

  test("le refus est le même que pour un identifiant inventé, en-têtes compris : rien ne dit que le document existe", async () => {
    const foreign = await get("mara", "doc-lena");
    const invented = await get("mara", "doc-qui-n-existe-pas");
    expect(foreign.status).toBe(invented.status);
    expect([...foreign.headers]).toEqual([...invented.headers]);
    expect(await foreign.text()).toBe(await invented.text());
    expect(seen).toEqual([]);
  });

  test("sans session : 401, et rien ne part vers R2", async () => {
    const res = await get(null, "doc-lena");
    expect(res.status).toBe(401);
    expect(seen).toEqual([]);
  });

  test("la clé demandée à R2 vient de la BASE : une clé glissée dans l'adresse ne mène nulle part", async () => {
    // Mara connaît (ou devine) la clé de Lena dans le bucket : aucune de ces adresses ne la lui donne.
    for (const id of [KEY_LENA, `../${KEY_LENA}`, `doc-mara/../../${KEY_LENA}`, encodeURIComponent(KEY_LENA), "doc-lena%00", "doc-lena' OR '1'='1"]) {
      const res = await get("mara", id);
      expect(res.status).toBe(404);
    }
    expect(seen).toEqual([]);
    // Et son propre document ne fait lire que SA clé.
    expect((await get("mara", "doc-mara")).status).toBe(200);
    expect(seen.map((s) => s.path)).toEqual([`/${BUCKET}/${KEY_MARA}`]);
  });
});

describe("plages d'octets : ce que pdf.js demande page par page", () => {
  test("Range → 206 : la plage arrive telle quelle à R2, sa réponse revient avec sa taille", async () => {
    const res = await get("lena", "doc-lena", "bytes=0-1023");
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(`bytes 0-1023/${PDF.byteLength}`);
    expect(res.headers.get("Content-Length")).toBe("1024");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF.slice(0, 1024));
    expect(seen).toHaveLength(1);
    expect(seen[0]!.range).toBe("bytes=0-1023");
  });

  test("les 500 derniers octets (la table du PDF, lue en premier par pdf.js)", async () => {
    const res = await get("lena", "doc-lena", "bytes=-500");
    expect(res.status).toBe(206);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF.slice(-500));
  });

  test("une plage au-delà de la fin : R2 répond InvalidRange, la route 416", async () => {
    const res = await get("lena", "doc-lena", `bytes=${PDF.byteLength + 10}-`);
    expect(res.status).toBe(416);
  });

  test("une plage mal formée n'atteint pas R2 comme plage : le fichier entier est servi", async () => {
    const res = await get("lena", "doc-lena", "bytes=0-10,20-30");
    expect(res.status).toBe(200);
    expect(seen[0]!.range).toBeNull();
  });

  test("le seuil au-delà duquel une plage part en flux est borné (4 Mo)", () => {
    expect(STREAM_BUFFER_MAX).toBe(4 * 1024 * 1024);
  });
});

describe("quand R2 ne répond pas comme prévu : jamais une exception, jamais un détail qui fuit", () => {
  test("la ligne existe en base mais l'objet a disparu de R2 (NoSuchKey) : 404 no_original", async () => {
    const res = await get("lena", "doc-disparu");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "no_original" });
  });

  test("R2 en panne (500) : 502 storage_unavailable, sans le message de R2", async () => {
    const res = await get("lena", "doc-panne");
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ error: "storage_unavailable" });
    expect(body).not.toMatch(/InternalError|xml|Credential|127\.0\.0\.1/i);
  });

  test("des identifiants refusés par R2 (clé d'accès inconnue) : 502, et toujours 404 pour qui n'est pas propriétaire", async () => {
    const refused = deps(clientFor("mauvaise-cle"));
    const owner = await get("lena", "doc-lena", null, refused);
    expect(owner.status).toBe(502);
    expect(await owner.text()).not.toMatch(/InvalidAccessKeyId|mauvaise-cle/);
    seen.length = 0;
    expect((await get("mara", "doc-lena", null, refused)).status).toBe(404);
    expect(seen).toEqual([]);
  });
});

describe("la route de production branche bien ce lecteur", () => {
  const INDEX = readFileSync(join(import.meta.dir, "../src/api/index.ts"), "utf8");
  const route = INDEX.slice(INDEX.indexOf('app.get("/api/documents/:id/stream"'), INDEX.indexOf("// ── Citations du tuteur"));

  test("même requête de propriété, même lecteur de stockage, sur le client et le bucket de production", () => {
    expect(route).toContain("findOwned: (documentId, userId) => ownedDocumentFile(db, documentId, userId)");
    expect(route).toContain("getObject: storedObjectReader(s3, S3_BUCKET)");
  });

  test("le client de production est construit par createS3Client (région auto, adressage par chemin)", () => {
    const S3 = readFileSync(join(import.meta.dir, "../src/api/lib/s3.ts"), "utf8");
    expect(S3).toContain("export const s3 = createS3Client();");
  });
});
