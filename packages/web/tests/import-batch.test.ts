import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractDocument, fileExtension, isSupported } from "../src/api/lib/extract";
import { BATCH_MAX_BYTES, BATCH_MAX_FILES, checkBatch, declaredBatchTooLarge, runBatch, titleFromFilename, type BatchDeps, type BatchFile, type BatchJob } from "../src/api/lib/import-batch";
import { IMPORT_ERRORS, extractionRefusal, importErrorCode } from "../src/api/lib/queue";
import { checkSelection, initialQueue, runImportBatch, summarize, type BatchTransport, type QueueItem } from "../src/web/lib/import-batch";

/**
 * Import par lot (2026-11-14). La promesse : plusieurs fichiers déposés d'un
 * coup sont autant d'imports INDÉPENDANTS. Un PDF abîmé, verrouillé ou refusé
 * échoue seul, avec un message clair ; les autres sont importés normalement.
 */

const ROOT = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/* ── De vrais PDF, fabriqués ici ──────────────────────────────────────── */

function pdf(objects: string[], trailerExtra = ""): Uint8Array {
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${trailerExtra} >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
const page = (sentence: string) => {
  const stream = `BT /F1 12 Tf 72 720 Td (${sentence}) Tj ET`;
  return [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
};
const hex = (n: number) => Array.from({ length: n }, (_, i) => ((i * 37 + 11) % 256).toString(16).padStart(2, "0")).join("");

const VALID = pdf(page("Die Waermekapazitaet ist definiert als die Waermemenge pro Kelvin."));
const OTHER = pdf(page("Der erste Hauptsatz beschreibt die Erhaltung der Energie in einem System."));
/** Chiffré avec un mot de passe que personne n'a : pdf.js demande le mot de passe. */
const LOCKED = pdf([...page("Geheim."), `<< /Filter /Standard /V 1 /R 2 /O <${hex(32)}> /U <${hex(32)}> /P -44 >>`], `/Encrypt 6 0 R /ID [<${hex(16)}> <${hex(16)}>]`);
/** Coupé au milieu : l'en-tête dit « PDF », la structure n'y est plus. */
const BROKEN = VALID.slice(0, 180);
/** Un exécutable Windows renommé en .pdf. */
const FAKE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00]);

/* ── Serveur : le lot ─────────────────────────────────────────────────── */

const file = (name: string, bytes: Uint8Array, kind?: string): BatchFile => ({ name, size: bytes.byteLength, kind, bytes: async () => bytes });

/** Un stockage et une file de test, qui notent tout et tombent en panne sur demande. */
function harness(over: Partial<BatchDeps> = {}) {
  const stored: string[] = [];
  const discarded: string[] = [];
  const jobs: { job: BatchJob; jobId: string }[] = [];
  let allowed = 0;
  let n = 0;
  const deps: BatchDeps = {
    isSupported,
    extension: fileExtension,
    allow: async () => {
      allowed += 1;
      return true;
    },
    store: async (key) => {
      stored.push(key);
    },
    enqueue: async (job, jobId) => {
      jobs.push({ job, jobId });
    },
    discard: async (key) => {
      discarded.push(key);
    },
    newDocumentId: () => `doc-${++n}`,
    newJobId: () => `imp_${String(n).padStart(24, "0")}`,
    ...over,
  };
  return { deps, stored, discarded, jobs, allowed: () => allowed };
}
const SCOPE = { semesterId: "sem-1", subjectId: null };

describe("le lot entier : cinq fichiers et 100 Mo au plus", () => {
  test("limites", () => {
    expect(BATCH_MAX_FILES).toBe(5);
    expect(BATCH_MAX_BYTES).toBe(100 * 1024 * 1024);
    expect(checkBatch([])).toBe("no_files");
    expect(checkBatch(Array.from({ length: 5 }, () => ({ size: 1000 })))).toBeNull();
    expect(checkBatch(Array.from({ length: 6 }, () => ({ size: 1000 })))).toBe("too_many_files");
    // Trois fichiers de 40 Mo : chacun passe seul (50 Mo), pas le lot (120 Mo).
    expect(checkBatch(Array.from({ length: 3 }, () => ({ size: 40 * 1024 * 1024 })))).toBe("batch_too_large");
    expect(checkBatch([{ size: 50 * 1024 * 1024 }, { size: 50 * 1024 * 1024 }])).toBeNull();
  });

  test("un envoi annoncé trop gros est refusé avant d'être lu", () => {
    expect(declaredBatchTooLarge(String(BATCH_MAX_BYTES))).toBe(false);
    expect(declaredBatchTooLarge(String(BATCH_MAX_BYTES + 2 * 1024 * 1024))).toBe(true);
    expect(declaredBatchTooLarge(null)).toBe(false);
  });
});

describe("serveur : un fichier qui échoue n'empêche pas les autres", () => {
  test("un faux PDF au milieu : refusé seul, les deux autres partent dans la file", async () => {
    const h = harness();
    const results = await runBatch("user-1", [file("Thermo_Kapitel_3.pdf", VALID, "vorlesung"), file("virus.pdf", FAKE), file("TM2_Uebung.pdf", OTHER, "uebung")], SCOPE, h.deps);

    expect(results.map((r) => r.error)).toEqual([null, "unsupported_format", null]);
    expect(results.map((r) => r.name)).toEqual(["Thermo_Kapitel_3.pdf", "virus.pdf", "TM2_Uebung.pdf"]);
    expect(results[1]).toMatchObject({ jobId: null, documentId: null });
    // Deux originaux stockés, deux travaux — pas trois.
    expect(h.stored).toHaveLength(2);
    expect(h.jobs).toHaveLength(2);
    // Le fichier refusé n'a pas consommé la limite d'imports du compte.
    expect(h.allowed()).toBe(2);
  });

  test("chaque document a SON travail : identifiant, clé de stockage, compte, titre", async () => {
    const h = harness();
    const results = await runBatch("user-1", [file("Thermo_Kapitel_3.pdf", VALID, "vorlesung"), file("TM2_Uebung.pdf", OTHER, "uebung")], SCOPE, h.deps);
    const [a, b] = h.jobs.map((j) => j.job);

    expect(a).toMatchObject({ userId: "user-1", title: "Thermo_Kapitel_3", filename: "Thermo_Kapitel_3.pdf", kind: "vorlesung", semesterId: "sem-1", subjectId: null });
    expect(b).toMatchObject({ userId: "user-1", title: "TM2_Uebung", filename: "TM2_Uebung.pdf", kind: "uebung" });
    // Rien n'est partagé entre deux documents du lot.
    expect(a!.documentId).not.toBe(b!.documentId);
    expect(a!.fileKey).toBe(`documents/user-1/${a!.documentId}.pdf`);
    expect(b!.fileKey).toBe(`documents/user-1/${b!.documentId}.pdf`);
    expect(new Set(h.jobs.map((j) => j.jobId)).size).toBe(2);
    // La réponse donne, dans l'ordre du dépôt, le travail de chaque fichier.
    expect(results.map((r) => r.jobId)).toEqual(h.jobs.map((j) => j.jobId));
    expect(results.map((r) => r.documentId)).toEqual([a!.documentId, b!.documentId]);
  });

  test("le stockage refuse le deuxième fichier : lui seul échoue", async () => {
    let call = 0;
    const h = harness({
      store: async () => {
        call += 1;
        if (call === 2) throw new Error("R2 503");
      },
    });
    const results = await runBatch("user-1", [file("a.pdf", VALID), file("b.pdf", OTHER), file("c.pdf", VALID)], SCOPE, h.deps);
    expect(results.map((r) => r.error)).toEqual([null, "storage_unavailable", null]);
    expect(h.jobs.map((j) => j.job.filename)).toEqual(["a.pdf", "c.pdf"]);
  });

  test("la file refuse un travail : son original est retiré, les autres passent", async () => {
    let call = 0;
    const base = harness();
    const h = harness({
      enqueue: async (job, jobId) => {
        call += 1;
        if (call === 1) throw new Error("Redis ECONNRESET");
        base.jobs.push({ job, jobId });
      },
    });
    const results = await runBatch("user-1", [file("a.pdf", VALID), file("b.pdf", OTHER)], SCOPE, h.deps);
    expect(results.map((r) => r.error)).toEqual(["queue_unavailable", null]);
    expect(h.discarded).toEqual([h.stored[0]!]);
    expect(base.jobs.map((j) => j.job.filename)).toEqual(["b.pdf"]);
  });

  test("limite d'imports atteinte au troisième : les deux premiers sont acceptés", async () => {
    let n = 0;
    const h = harness({ allow: async () => ++n <= 2 });
    const results = await runBatch("user-1", [file("a.pdf", VALID), file("b.pdf", OTHER), file("c.pdf", VALID)], SCOPE, h.deps);
    expect(results.map((r) => r.error)).toEqual([null, null, "RATE_LIMITED"]);
    expect(h.stored).toHaveLength(2);
  });

  test("fichier vide, trop gros, illisible : chacun son erreur, sans casser le lot", async () => {
    const h = harness();
    const huge: BatchFile = { name: "gros.pdf", size: 60 * 1024 * 1024, bytes: async () => VALID };
    const unreadable: BatchFile = {
      name: "panne.pdf",
      size: 10,
      bytes: async () => {
        throw new Error("lecture interrompue");
      },
    };
    const results = await runBatch("user-1", [file("vide.pdf", new Uint8Array()), huge, unreadable, file("cours.exe", FAKE), file("ok.pdf", VALID)], SCOPE, h.deps);
    expect(results.map((r) => r.error)).toEqual(["empty_file", "file_too_large", "upload_failed", "unsupported_format", null]);
    expect(h.jobs).toHaveLength(1);
  });

  test("le titre vient du nom du fichier", () => {
    expect(titleFromFilename("Thermo_Kapitel_3.pdf")).toBe("Thermo_Kapitel_3");
    expect(titleFromFilename(".pdf")).toBe("Dokument");
  });
});

describe("PDF verrouillé ou abîmé : un refus clair, définitif, pour ce document seulement", () => {
  test("pdf.js dit pourquoi, et on le traduit en code", async () => {
    const locked = await extractDocument(LOCKED, "geheim.pdf").then(
      () => null,
      (e: unknown) => e,
    );
    const broken = await extractDocument(BROKEN, "kaputt.pdf").then(
      () => null,
      (e: unknown) => e,
    );
    expect(extractionRefusal(locked)).toBe("password_protected");
    expect(extractionRefusal(broken)).toBe("corrupted_file");
    // Le bon PDF, lui, se lit — avec sa marque de page.
    const ok = await extractDocument(VALID, "Thermo_Kapitel_3.pdf");
    expect(ok.pageCount).toBe(1);
    expect(ok.text).toContain("[[SEITE 1]]");
    expect(ok.text).toContain("Waermekapazitaet");
  });

  test("une erreur revenue d'un autre fil n'a plus de classe : son nom suffit", () => {
    expect(extractionRefusal({ name: "PasswordException", message: "No password given" })).toBe("password_protected");
    expect(extractionRefusal({ name: "InvalidPDFException", message: "Invalid PDF structure." })).toBe("corrupted_file");
    expect(extractionRefusal(new Error("connect ECONNREFUSED 10.0.0.1:443"))).toBeNull();
    expect(extractionRefusal(undefined)).toBeNull();
  });

  test("les deux codes sont connus du navigateur et ne sont pas rejoués par la file", () => {
    expect(IMPORT_ERRORS).toContain("password_protected");
    expect(IMPORT_ERRORS).toContain("corrupted_file");
    expect(importErrorCode("password_protected")).toBe("password_protected");
    const job = read("src/api/lib/queue/import-job.ts");
    expect(job).toContain("const refusal = extractionRefusal(err);");
    expect(job).toContain("if (refusal) throw new UnrecoverableError(refusal);");
    // Sans file (extraction dans la requête) : le même message.
    expect(read("src/api/index.ts")).toContain("if (refusal) return c.json({ error: refusal }, 422);");
  });
});

/* ── Navigateur : la file que voit l'étudiant ─────────────────────────── */

const accepted = (name: string) => /\.(pdf|docx|pptx|txt|png|jpg)$/i.test(name);
const browserFile = (name: string, size = 1000) => new File([new Uint8Array(size)], name);

/** Note chaque état de la file : `trace[n]` = les statuts après le n-ième changement. */
function tracker() {
  const trace: string[] = [];
  let last: QueueItem[] = [];
  return {
    onChange: (items: QueueItem[]) => {
      last = items;
      trace.push(items.map((i) => i.status).join(","));
    },
    trace,
    last: () => last,
  };
}

describe("navigateur : la sélection", () => {
  test("cinq fichiers et 100 Mo au plus, refusés avant tout envoi", () => {
    expect(checkSelection(Array.from({ length: 5 }, () => ({ size: 10 })))).toBeNull();
    expect(checkSelection(Array.from({ length: 6 }, () => ({ size: 10 })))).toBe("too_many_files");
    expect(checkSelection([{ size: 60 * 1024 * 1024 }, { size: 45 * 1024 * 1024 }])).toBe("batch_too_large");
  });

  test("un format refusé est en erreur dès le dépôt, les autres attendent", () => {
    const q = initialQueue([{ name: "a.pdf", size: 10 }, { name: "b.exe", size: 10 }, { name: "c.pdf", size: 60 * 1024 * 1024 }, { name: "d.pdf", size: 0 }], accepted);
    expect(q.map((i) => [i.status, i.error])).toEqual([
      ["waiting", undefined],
      ["error", "unsupported_format"],
      ["error", "file_too_large"],
      ["error", "empty_file"],
    ]);
    expect(summarize(q)).toMatchObject({ total: 4, done: 0, failed: 3, finished: false });
  });
});

describe("navigateur : un fichier qui échoue n'arrête pas les autres", () => {
  test("serveur sans file — un par un : le PDF abîmé échoue, le premier et le troisième sont importés", async () => {
    const sent: string[] = [];
    const imported: string[] = [];
    const transport: BatchTransport = {
      uploadBatch: async () => {
        throw new Error("ne doit pas être appelé sans file");
      },
      uploadOne: async (f) => {
        sent.push(f.name);
        return f.name === "kaputt.pdf" ? { ok: false, error: "corrupted_file" } : { ok: true, documentId: `doc-${f.name}` };
      },
      follow: async () => ({ ok: false, error: "inattendu" }),
    };
    const t = tracker();
    const final = await runImportBatch([browserFile("Thermo.pdf"), browserFile("kaputt.pdf"), browserFile("TM2.pdf")], {
      queue: false,
      accepted,
      transport,
      onChange: t.onChange,
      onImported: (item) => imported.push(item.name),
    });

    expect(final.map((i) => i.status)).toEqual(["done", "error", "done"]);
    expect(final[1]).toMatchObject({ error: "corrupted_file" });
    expect(final.map((i) => i.documentId)).toEqual(["doc-Thermo.pdf", undefined, "doc-TM2.pdf"]);
    // Les trois ont été tentés, dans l'ordre : l'échec du deuxième n'a rien arrêté.
    expect(sent).toEqual(["Thermo.pdf", "kaputt.pdf", "TM2.pdf"]);
    expect(imported).toEqual(["Thermo.pdf", "TM2.pdf"]);
    // Ce que l'étudiant a vu à un instant donné : terminé / en lecture / en attente, puis terminé / erreur / en lecture.
    expect(t.trace).toContain("done,reading,waiting");
    expect(t.trace).toContain("done,error,reading");
    expect(summarize(final)).toMatchObject({ total: 3, done: 2, failed: 1, finished: true, percent: 100 });
  });

  test("serveur avec file — un envoi, un travail par fichier : le PDF verrouillé échoue seul", async () => {
    const followed: string[] = [];
    const transport: BatchTransport = {
      uploadBatch: async (files) => ({
        kind: "accepted",
        results: files.map((f, i) => (f.name === "virus.pdf" ? { name: f.name, jobId: null, documentId: null, error: "unsupported_format" } : { name: f.name, jobId: `imp_${i}`, documentId: `doc-${i}`, error: null })),
      }),
      uploadOne: async () => {
        throw new Error("ne doit pas être appelé");
      },
      follow: async (jobId, onProgress) => {
        followed.push(jobId);
        onProgress({ status: "pending", progress: 8 });
        onProgress({ status: "processing", progress: 40 });
        return jobId === "imp_2" ? { ok: false, error: "password_protected" } : { ok: true, documentId: `doc-${jobId}` };
      },
    };
    const t = tracker();
    const final = await runImportBatch([browserFile("Thermo.pdf"), browserFile("virus.pdf"), browserFile("geheim.pdf"), browserFile("TM2.pdf")], { queue: true, accepted, transport, onChange: t.onChange });

    expect(final.map((i) => [i.status, i.error])).toEqual([
      ["done", undefined],
      ["error", "unsupported_format"],
      ["error", "password_protected"],
      ["done", undefined],
    ]);
    expect(followed.sort()).toEqual(["imp_0", "imp_2", "imp_3"]);
    // Les quatre statuts ont existé : envoi, attente, lecture, puis terminé ou erreur.
    expect(t.trace[1]).toBe("uploading,waiting,waiting,waiting");
    expect(t.trace.some((s) => s.includes("reading"))).toBe(true);
    expect(t.trace.at(-1)).toBe("done,error,error,done");
  });

  test("la file a disparu (503) : rien n'est perdu, les fichiers partent un par un", async () => {
    const sent: string[] = [];
    const transport: BatchTransport = {
      uploadBatch: async () => ({ kind: "no_queue" }),
      uploadOne: async (f) => {
        sent.push(f.name);
        return { ok: true, documentId: `doc-${f.name}` };
      },
      follow: async () => ({ ok: false, error: "inattendu" }),
    };
    const final = await runImportBatch([browserFile("a.pdf"), browserFile("b.pdf")], { queue: true, accepted, transport, onChange: () => {} });
    expect(final.map((i) => i.status)).toEqual(["done", "done"]);
    expect(sent).toEqual(["a.pdf", "b.pdf"]);
  });

  test("un fichier que le stockage a refusé dans le lot est rattrapé par l'import classique", async () => {
    const transport: BatchTransport = {
      uploadBatch: async (files) => ({ kind: "accepted", results: files.map((f, i) => (i === 0 ? { name: f.name, jobId: null, documentId: null, error: "storage_unavailable" } : { name: f.name, jobId: "imp_1", documentId: "doc-1", error: null })) }),
      uploadOne: async () => ({ ok: true, documentId: "doc-rattrapé" }),
      follow: async () => ({ ok: true, documentId: "doc-1" }),
    };
    const final = await runImportBatch([browserFile("a.pdf"), browserFile("b.pdf")], { queue: true, accepted, transport, onChange: () => {} });
    expect(final.map((i) => [i.status, i.documentId])).toEqual([
      ["done", "doc-rattrapé"],
      ["done", "doc-1"],
    ]);
  });

  test("limite de documents du tarif : on n'insiste pas avec les fichiers suivants", async () => {
    const sent: string[] = [];
    const transport: BatchTransport = {
      uploadBatch: async () => ({ kind: "no_queue" }),
      uploadOne: async (f) => {
        sent.push(f.name);
        return sent.length === 1 ? { ok: true, documentId: "doc-a" } : { ok: false, error: "document_limit", stop: true };
      },
      follow: async () => ({ ok: false, error: "inattendu" }),
    };
    const final = await runImportBatch([browserFile("a.pdf"), browserFile("b.pdf"), browserFile("c.pdf")], { queue: false, accepted, transport, onChange: () => {} });
    expect(final.map((i) => [i.status, i.error])).toEqual([
      ["done", undefined],
      ["error", "document_limit"],
      ["error", "document_limit"],
    ]);
    expect(sent).toEqual(["a.pdf", "b.pdf"]);
  });

  test("une coupure réseau sur un fichier, ou sur l'envoi du lot, devient une erreur de ligne — jamais une exception", async () => {
    const one: BatchTransport = {
      uploadBatch: async () => ({ kind: "no_queue" }),
      uploadOne: async (f) => {
        if (f.name === "b.pdf") throw new TypeError("Failed to fetch");
        return { ok: true, documentId: "doc" };
      },
      follow: async () => ({ ok: false, error: "inattendu" }),
    };
    const a = await runImportBatch([browserFile("a.pdf"), browserFile("b.pdf"), browserFile("c.pdf")], { queue: false, accepted, transport: one, onChange: () => {} });
    expect(a.map((i) => [i.status, i.error])).toEqual([
      ["done", undefined],
      ["error", "network"],
      ["done", undefined],
    ]);

    const all: BatchTransport = {
      ...one,
      uploadBatch: async () => {
        throw new TypeError("Failed to fetch");
      },
    };
    const b = await runImportBatch([browserFile("a.pdf"), browserFile("c.pdf")], { queue: true, accepted, transport: all, onChange: () => {} });
    expect(b.map((i) => [i.status, i.error])).toEqual([
      ["error", "network"],
      ["error", "network"],
    ]);
  });
});

/* ── Le branchement ───────────────────────────────────────────────────── */

describe("branchement", () => {
  const INDEX = read("src/api/index.ts");
  const route = INDEX.slice(INDEX.indexOf('app.post("/api/documents/upload-batch"'));

  test("la route refuse sans session, puis sans file, AVANT de lire le corps", () => {
    const session = route.indexOf('return c.json({ error: "UNAUTHORIZED" }, 401)');
    const noQueue = route.indexOf('if (!queueReady()) return c.json({ error: "queue_unavailable" }, 503)');
    const tooLarge = route.indexOf("declaredBatchTooLarge(");
    const body = route.indexOf("c.req.formData()");
    expect(session).toBeGreaterThan(0);
    expect(noQueue).toBeGreaterThan(session);
    expect(tooLarge).toBeGreaterThan(noQueue);
    expect(body).toBeGreaterThan(tooLarge);
  });

  test("un travail par fichier, avec le compte de la SESSION (jamais un identifiant envoyé par le navigateur)", () => {
    expect(route).toContain("const userId = session.user.id;");
    expect(route).toContain("await runBatch(");
    expect(route).toContain('importQueue().add("import-pdf", job, { jobId })');
    expect(route).not.toContain('form.get("userId")');
    expect(route).toContain("jobIds: results.flatMap((r) => (r.jobId ? [r.jobId] : []))");
  });

  test("le worker lit un document à la fois par défaut", () => {
    expect(read("src/worker.ts")).toContain('concurrency: num("WORKER_IMPORT_CONCURRENCY", 1),');
  });

  test("le champ de fichier accepte la sélection multiple, et le panneau le glisser-déposer", () => {
    const lib = read("src/web/components/document-library.tsx");
    expect(lib).toMatch(/type="file"[\s\S]{0,200}\n\s+multiple\n/);
    expect(lib).toContain("onDrop={(e) => {");
    expect(lib).toContain("if (files.length > 1) return importBatch(files);");
    expect(lib).toContain("queue: features.importQueue,");
  });

  test("les statuts et les messages existent dans les quatre langues de l'import", () => {
    for (const lang of ["de", "en", "fr", "es"]) {
      const m = read(`src/web/i18n/messages/${lang}.ts`);
      for (const key of ["waiting", "uploading", "reading", "done", "error"]) expect(m).toMatch(new RegExp(`\\n {6}${key}: ".+",\\n`));
      for (const key of ["passwordProtected", "corrupted", "tooManyFiles", "batchTooLarge", "dropHere"]) expect(m).toMatch(new RegExp(`\\n {4}${key}: ".+",\\n`));
    }
    const de = read("src/web/i18n/messages/de.ts");
    expect(de).toContain('waiting: "Wartet"');
    expect(de).toContain('reading: "Wird gelesen …"');
    expect(de).toContain('done: "Fertig"');
    expect(de).toContain('error: "Fehler"');
  });
});
