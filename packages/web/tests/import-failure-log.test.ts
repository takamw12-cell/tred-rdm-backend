import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImportWriteError, importFailureLog, logImportFailure, saveImportedDocument } from "../src/api/lib/queue/import-failure";
import { importErrorCode } from "../src/api/lib/queue";

/**
 * Fuite trouvée par le test de charge du 18 nov. 2026 : quand l'enregistrement
 * d'un document échouait, le worker écrivait le message de la base dans son
 * journal — et ce message contient les paramètres de la requête, donc le
 * TEXTE ENTIER du cours de l'étudiant (26 500 lignes pour 18 échecs). Le même
 * message partait dans Redis (`failedReason`) et dans Sentry.
 */
const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");

const SECRET_TEXT = "[[SEITE 1]] Die Entropie eines abgeschlossenen Systems nimmt niemals ab. Vertrauliche Klausurloesung von Lena.";
const BINARY = "%PDF-1.4\u0000\u0001\u0002\ufffdstream\u0003\u0004endstream";
const JOB = {
  id: "imp_0123456789abcdef01234567",
  attemptsMade: 1,
  opts: { attempts: 3 },
  data: { userId: "user_42", documentId: "doc_42", fileKey: "documents/user_42/doc_42.pdf", filename: "Thermo.pdf", title: "Thermo", kind: "other" as const, semesterId: null, subjectId: null },
};

/** L'erreur exacte de Drizzle sur un INSERT refusé : requête + paramètres (dont le texte) dans le message. */
function failedInsert() {
  const cause = Object.assign(new Error("SQLITE_BUSY: database is locked"), { code: "SQLITE_BUSY", name: "LibsqlError" });
  return Object.assign(
    new Error(`Failed query: insert into "document" ("id", "user_id", "text_content") values (?, ?, ?)\nparams: doc_42,user_42,${SECRET_TEXT},${BINARY},documents/user_42/doc_42.pdf,40,103142`),
    { cause },
  );
}

const noWait = { sleep: async () => {}, random: () => 0.5 };

describe("échec d'enregistrement d'un document : rien du contenu dans le journal", () => {
  test("l'erreur levée par l'enregistrement ne porte qu'un code et des mesures", async () => {
    let calls = 0;
    const save = saveImportedDocument(
      async () => {
        calls += 1;
        throw failedInsert();
      },
      { pageCount: 40, byteSize: 103_142 },
      noWait,
    );
    const err = await save.then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ImportWriteError);
    const failure = err as ImportWriteError;
    // Trois essais avant d'abandonner (lib/db-retry.ts).
    expect(calls).toBe(3);
    expect(failure.message).toBe("db_write_failed");
    expect(failure.errorCode).toBe("SQLITE_BUSY");
    expect(failure.pageCount).toBe(40);
    expect(failure.byteSize).toBe(103_142);
    // Ni le message, ni la pile, ni une cause : BullMQ range `message` et `stack` dans Redis.
    const everything = `${failure.message}\n${failure.stack}\n${JSON.stringify(failure)}\n${String((failure as { cause?: unknown }).cause ?? "")}`;
    expect(everything).not.toContain("Entropie");
    expect(everything).not.toContain("Vertrauliche");
    expect(everything).not.toContain("%PDF");
    expect(everything).not.toContain("params");
  });

  test("ce que le worker écrit : identifiants, code, pages, octets — jamais le texte ni le binaire", async () => {
    const failure = await saveImportedDocument(
      async () => {
        throw failedInsert();
      },
      { pageCount: 40, byteSize: 103_142 },
      noWait,
    ).catch((e: unknown) => e);

    const lines: string[] = [];
    logImportFailure(JOB, failure, false, (...args) => lines.push(args.map(String).join(" ")));
    const output = lines.join("\n");

    expect(output).not.toContain("Entropie");
    expect(output).not.toContain("Vertrauliche");
    expect(output).not.toContain("Klausurloesung");
    expect(output).not.toContain("%PDF");
    expect(output).not.toContain("stream");
    expect(output).not.toContain("params");
    expect(output).not.toContain("Failed query");
    // Aucun caractère de contrôle ni octet illisible.
    const unreadable = [...output].some((ch) => ch === "\ufffd" || (ch.charCodeAt(0) < 32 && ch !== "\n" && ch !== "\t"));
    expect(unreadable).toBe(false);
    expect(output.length).toBeLessThan(400);

    const logged = JSON.parse(output.slice(output.indexOf("{"))) as Record<string, unknown>;
    expect(logged).toEqual({
      jobId: JOB.id,
      documentId: "doc_42",
      userId: "user_42",
      errorCode: "db_write_failed:SQLITE_BUSY",
      pageCount: 40,
      byteSize: 103_142,
      attempt: 1,
      final: false,
    });
  });

  test("même une erreur brute de la base, arrivée telle quelle, est réduite à son code", () => {
    const lines: string[] = [];
    logImportFailure(JOB, failedInsert(), true, (...args) => lines.push(args.map(String).join(" ")));
    const output = lines.join("\n");
    expect(output).not.toContain("Entropie");
    expect(output).not.toContain("%PDF");
    expect(output).not.toContain("params");
    expect(importFailureLog(JOB, failedInsert(), true)).toMatchObject({ errorCode: "db_error:SQLITE_BUSY", pageCount: null, byteSize: null, final: true });
  });

  test("les refus connus gardent leur code lisible", () => {
    expect(importFailureLog(JOB, new Error("password_protected"), true).errorCode).toBe("password_protected");
    expect(importFailureLog(JOB, new Error("extraction_failed"), false).errorCode).toBe("extraction_failed");
    // Un message inconnu n'est jamais recopié : il pourrait citer le document.
    expect(importFailureLog(JOB, new Error(`Unexpected token near "${SECRET_TEXT}"`), false).errorCode).toBe("unknown_error");
    expect(importFailureLog(undefined, new Error("no_text"), true)).toMatchObject({ jobId: null, documentId: null, userId: null, errorCode: "no_text" });
  });

  test("le navigateur reçoit toujours un code d'import connu", () => {
    expect(importErrorCode("db_write_failed")).toBe("extraction_failed");
  });

  test("un enregistrement qui réussit au second essai ne lève rien", async () => {
    let calls = 0;
    await saveImportedDocument(
      async () => {
        calls += 1;
        if (calls === 1) throw failedInsert();
      },
      { pageCount: 2, byteSize: 900 },
      noWait,
    );
    expect(calls).toBe(2);
  });
});

describe("branchements", () => {
  test("le worker n'écrit plus `err.message` et passe par le journal structuré", () => {
    const worker = read("src/worker.ts");
    expect(worker).toContain("logImportFailure(job, err, final)");
    expect(worker).not.toMatch(/import \$\{job\?\.id\} : \$\{err\.message\}/);
  });

  test("l'import enregistre le document par saveImportedDocument", () => {
    expect(read("src/api/lib/queue/import-job.ts")).toContain("saveImportedDocument(");
  });
});
