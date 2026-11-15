import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  attachedPdfPages,
  dataUrlBytes,
  MAX_ATTACHED_PDF_PAGES,
  MAX_FILES_PER_MESSAGE,
  pdfPagesExceeded,
  pruneHistoryFiles,
  uploadBytes,
} from "../src/api/lib/chat-attachments";
import { countPdfPages } from "../src/api/lib/pdf-pages";
import { readChatFailure } from "../src/web/lib/chat-error";

/**
 * Les pièces jointes d'une question (2026-11-15).
 *
 * Mesuré en production le 15 nov. à 06:58 UTC : une question avec un PDF joint
 * a envoyé 292 547 tokens au modèle en UN appel — 54 000 de règles et d'outils,
 * moins de 10 000 d'extraits du cours, et tout le reste était le PDF joint,
 * envoyé page par page (texte + image). Premier signe de vie après 29 s,
 * premier mot après 36 s. Les deux questions suivantes ont renvoyé ce même
 * fichier dans le corps de la requête : le navigateur réexpédiait tout
 * l'historique, pièces jointes comprises, alors que le serveur les jette.
 *
 * Deux règles :
 *   1. une question porte au plus 20 pages de PDF — un Skript va dans
 *      « Meine Kurse », où il est découpé, cherché et cité page par page ;
 *   2. une pièce jointe ne voyage qu'avec SA question.
 */

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const pdfUrl = (pages: number) => `data:application/pdf;base64,${b64(pdfWithPages(pages))}`;
const IMAGE = `data:image/jpeg;base64,${"A".repeat(400)}`;
const pdfPart = (pages: number, filename = "blatt.pdf") => ({ type: "file", mediaType: "application/pdf", url: pdfUrl(pages), filename });
const imagePart = () => ({ type: "file", mediaType: "image/jpeg", url: IMAGE, filename: "foto.jpg" });
const user = (id: string, ...parts: unknown[]) => ({ id, role: "user", parts });
const tutor = (id: string, text: string) => ({ id, role: "assistant", parts: [{ type: "text", text }] });

/** Un vrai PDF de `n` pages (pdf.js le relit), écrit à la main. */
function pdfWithPages(n: number): Uint8Array {
  const kids = Array.from({ length: n }, (_, i) => `${3 + i} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`,
    ...Array.from({ length: n }, () => "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>"),
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

describe("compter les pages d'un PDF joint (serveur, vrai fichier)", () => {
  test("3 pages, 21 pages, 120 pages : le compte du fichier", async () => {
    expect(await countPdfPages(pdfWithPages(3))).toBe(3);
    expect(await countPdfPages(pdfWithPages(21))).toBe(21);
    expect(await countPdfPages(pdfWithPages(120))).toBe(120);
  });

  test("un fichier qui n'est pas un PDF : l'erreur remonte, l'appelant décide", async () => {
    await expect(countPdfPages(new TextEncoder().encode("ceci n'est pas un PDF"))).rejects.toBeDefined();
  });
});

describe("la limite : 20 pages de PDF par question, tous fichiers confondus", () => {
  test("le plafond", () => {
    expect(MAX_ATTACHED_PDF_PAGES).toBe(20);
    expect(pdfPagesExceeded(20)).toBe(false);
    expect(pdfPagesExceeded(21)).toBe(true);
  });

  test("une feuille d'exercices de 4 pages passe", async () => {
    const got = await attachedPdfPages([user("u1", { type: "text", text: "Aufgabe 2?" }, pdfPart(4))], countPdfPages);
    expect(got).toEqual({ pages: 4, files: 1, unreadable: 0 });
    expect(pdfPagesExceeded(got.pages)).toBe(false);
  });

  test("un Skript de 120 pages est compté tel quel : c'est lui qui faisait 230 000 tokens", async () => {
    const got = await attachedPdfPages([user("u1", { type: "text", text: "Erklär mir das" }, pdfPart(120, "skript.pdf"))], countPdfPages);
    expect(got.pages).toBe(120);
    expect(pdfPagesExceeded(got.pages)).toBe(true);
  });

  test("plusieurs PDF : les pages s'additionnent (12 + 12 = 24, refusé)", async () => {
    const got = await attachedPdfPages([user("u1", pdfPart(12), pdfPart(12))], countPdfPages);
    expect(got).toEqual({ pages: 24, files: 2, unreadable: 0 });
    expect(pdfPagesExceeded(got.pages)).toBe(true);
  });

  test("seule la DERNIÈRE question compte : un PDF d'une question passée ne part plus au modèle", async () => {
    const msgs = [user("u1", pdfPart(120)), tutor("a1", "…"), user("u2", { type: "text", text: "Und jetzt?" }, pdfPart(2))];
    expect((await attachedPdfPages(msgs, countPdfPages)).pages).toBe(2);
  });

  test("les images ne comptent pas, et seuls les 4 premiers fichiers partent", async () => {
    const msgs = [user("u1", imagePart(), pdfPart(5), imagePart(), pdfPart(6), pdfPart(30))];
    // 4 fichiers gardés : image, PDF 5 p., image, PDF 6 p. — le PDF de 30 pages est le cinquième, il ne part pas.
    expect(MAX_FILES_PER_MESSAGE).toBe(4);
    expect(await attachedPdfPages(msgs, countPdfPages)).toEqual({ pages: 11, files: 2, unreadable: 0 });
  });

  test("un PDF illisible (protégé, abîmé) ne bloque pas la question : compté à part", async () => {
    const broken = { type: "file", mediaType: "application/pdf", url: `data:application/pdf;base64,${b64(new TextEncoder().encode("pas un pdf ".repeat(40)))}`, filename: "x.pdf" };
    const got = await attachedPdfPages([user("u1", broken, pdfPart(3))], countPdfPages);
    expect(got).toEqual({ pages: 3, files: 2, unreadable: 1 });
  });

  test("aucune pièce jointe : rien n'est décodé", async () => {
    let calls = 0;
    const got = await attachedPdfPages([user("u1", { type: "text", text: "Hallo" })], async () => {
      calls += 1;
      return 1;
    });
    expect(got).toEqual({ pages: 0, files: 0, unreadable: 0 });
    expect(calls).toBe(0);
  });

  test("dataUrlBytes : seulement une vraie data URL en base64", () => {
    expect(dataUrlBytes("data:application/pdf;base64,JVBERg==")).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    expect(dataUrlBytes("https://exemple.de/x.pdf")).toBeNull();
    expect(dataUrlBytes("data:application/pdf,brut")).toBeNull();
  });
});

describe("une pièce jointe ne voyage qu'avec SA question", () => {
  const history = [
    user("u1", { type: "text", text: "Was steht in der Klausur?" }, pdfPart(8, "klausur.pdf"), imagePart()),
    tutor("a1", "Aufgabe 1 fragt nach …"),
    user("u2", { type: "text", text: "Und Aufgabe 2?" }),
  ];

  test("question suivante : les anciens fichiers deviennent une ligne de texte, la question en cours garde les siens", () => {
    const out = pruneHistoryFiles(history) as { parts: { type: string; text?: string; url?: string }[] }[];
    expect(out[0].parts).toEqual([
      { type: "text", text: "Was steht in der Klausur?" },
      { type: "text", text: "[Anhang aus einer früheren Nachricht]" },
      { type: "text", text: "[Anhang aus einer früheren Nachricht]" },
    ]);
    const current = pruneHistoryFiles([user("u1", { type: "text", text: "?" }, pdfPart(8))]) as typeof out;
    expect(current[0].parts[1].type).toBe("file");
  });

  test("le corps de la requête ne porte plus le fichier d'avant : de plusieurs Mo à quelques octets", () => {
    const big = `data:application/pdf;base64,${"A".repeat(6_000_000)}`;
    const msgs = [user("u1", { type: "file", mediaType: "application/pdf", url: big, filename: "skript.pdf" }), tutor("a1", "…"), user("u2", { type: "text", text: "Weiter" })];
    expect(uploadBytes(msgs)).toBeGreaterThan(6_000_000);
    expect(uploadBytes(pruneHistoryFiles(msgs))).toBeLessThan(600);
  });

  test("rien n'est modifié sur place, et l'opération est idempotente (navigateur puis serveur)", () => {
    const before = JSON.stringify(history);
    const once = pruneHistoryFiles(history);
    expect(JSON.stringify(history)).toBe(before);
    expect(pruneHistoryFiles(once)).toEqual(once);
  });

  test("une pièce jointe sans données lisibles est retirée au lieu de faire échouer la requête", () => {
    const out = pruneHistoryFiles([user("u1", { type: "file", mediaType: "image/png", url: "data:image/png;base64,AAA" })]) as { parts: unknown[] }[];
    expect(out[0].parts).toEqual([{ type: "text", text: "[Anhang konnte nicht gelesen werden]" }]);
  });
});

describe("le refus du serveur est lu comme tel, jamais comme une coupure", () => {
  test("ATTACHMENT_TOO_LONG → message à l'étudiant, avec les pages et le plafond", () => {
    const failure = readChatFailure(new Error(JSON.stringify({ error: "ATTACHMENT_TOO_LONG", message: "…", pages: 120, max: 20 })));
    expect(failure).toEqual({ kind: "attachment", pages: 120, max: 20 });
  });

  test("corps incomplet : le plafond connu sert de repli", () => {
    expect(readChatFailure(new Error(JSON.stringify({ error: "ATTACHMENT_TOO_LONG" })))).toEqual({ kind: "attachment", pages: null, max: MAX_ATTACHED_PDF_PAGES });
  });
});

describe("branchement", () => {
  const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8");
  const API = read("../src/api/index.ts");
  const PAGE = read("../src/web/pages/chat.tsx");
  const route = API.slice(API.indexOf('app.post("/api/agent/messages"'), API.indexOf("// Translate an existing conversation"));

  test("serveur : le contrôle des pièces jointes passe AVANT le décompte du quota (un refus ne coûte pas une question)", () => {
    const guard = route.indexOf("attachedPdfPages(");
    const quota = route.indexOf('consume(session.user.id, "chat")');
    expect(guard).toBeGreaterThan(0);
    expect(quota).toBeGreaterThan(guard);
    expect(route).toContain('error: "ATTACHMENT_TOO_LONG"');
    expect(route).toContain("413");
  });

  test("serveur : une seule définition de l'élagage, celle de la bibliothèque", () => {
    expect(API).not.toContain("function pruneHistoryFiles");
    expect(route).toContain("uiMessages: pruneHistoryFiles(messages)");
  });

  test("navigateur : l'historique est élagué AVANT l'envoi", () => {
    expect(PAGE).toContain("prepareSendMessagesRequest");
    expect(PAGE).toContain("messages: pruneHistoryFiles(messages)");
  });

  test("navigateur : les pages d'un PDF sont comptées à l'ajout, et le refus nomme le fichier", () => {
    expect(PAGE).toContain("countPdfPages(");
    expect(PAGE).toContain('t("chat.pdfTooLong"');
  });

  test("navigateur : un refus pour pièce jointe n'est pas relancé tout seul", () => {
    expect(PAGE).toContain('echec.kind === "quota" || echec.kind === "attachment"');
  });

  test("le texte existe dans les douze langues, avec le nombre de pages et le plafond", () => {
    for (const lang of ["ar", "bn", "de", "en", "es", "fr", "hi", "it", "ja", "pt", "ru", "zh"]) {
      const line = read(`../src/web/i18n/messages/${lang}.ts`).split("\n").find((l) => l.includes("    pdfTooLong: "));
      expect(line).toBeDefined();
      expect(line).toContain("{pages}");
      expect(line).toContain("{max}");
      expect(line).toContain("{name}");
    }
  });
});
