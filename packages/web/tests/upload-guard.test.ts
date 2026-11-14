import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { MAX_UPLOAD_BYTES, contentMatchesExtension, declaredTooLarge } from "../src/api/lib/upload-guard";

/** Contrôle du fichier téléversé (2026-11-14) : 50 Mo au plus, type RÉEL lu dans les octets. */
const bytes = (...v: number[]) => new Uint8Array(v);
const text = (s: string) => new TextEncoder().encode(s);
const pad = (head: Uint8Array, size = 64) => {
  const out = new Uint8Array(size);
  out.set(head);
  return out;
};

const PDF = text("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n");
const PNG = pad(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a));
const JPG = pad(bytes(0xff, 0xd8, 0xff, 0xe0));
const WEBP = pad(text("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "));
const HEIC = pad(new Uint8Array([0, 0, 0, 0x18, ...text("ftypheic")]));
const EXE = pad(bytes(0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00), 512);
const DOCX = zipSync({ "[Content_Types].xml": strToU8("<Types/>"), "word/document.xml": strToU8("<w:document/>") });
const PPTX = zipSync({ "[Content_Types].xml": strToU8("<Types/>"), "ppt/slides/slide1.xml": strToU8("<p:sld/>") });
const ZIP = zipSync({ "virus.exe": EXE });

describe("le contenu doit correspondre à l'extension", () => {
  test.each([
    ["pdf", PDF],
    ["docx", DOCX],
    ["pptx", PPTX],
    ["png", PNG],
    ["jpg", JPG],
    ["jpeg", JPG],
    ["webp", WEBP],
    ["heic", HEIC],
    ["txt", text("Kapitel 1: Balkenbiegung.\nDas Biegemoment ist M = F · l.")],
    ["md", text("# Übung 3\n\n- Aufgabe a)\n")],
    ["csv", text("Zeit;Spannung\n0,1;2,5\n")],
  ] as const)("%s authentique accepté", (ext, content) => {
    expect(contentMatchesExtension(ext, content)).toBe(true);
  });

  test("un exécutable renommé est refusé, quelle que soit l'extension", () => {
    for (const ext of ["pdf", "docx", "pptx", "png", "jpg", "webp", "heic", "txt", "md", "csv"]) {
      expect(contentMatchesExtension(ext, EXE)).toBe(false);
    }
  });

  test("un zip quelconque n'est ni un .docx ni un .pptx", () => {
    expect(contentMatchesExtension("docx", ZIP)).toBe(false);
    expect(contentMatchesExtension("pptx", ZIP)).toBe(false);
    expect(contentMatchesExtension("docx", PPTX)).toBe(false);
  });

  test("un type ne passe pas pour un autre", () => {
    expect(contentMatchesExtension("pdf", PNG)).toBe(false);
    expect(contentMatchesExtension("png", JPG)).toBe(false);
    expect(contentMatchesExtension("jpg", PDF)).toBe(false);
    expect(contentMatchesExtension("webp", pad(text("RIFF\u0000\u0000\u0000\u0000WAVEfmt ")))).toBe(false);
  });

  test("PDF de scanner : quelques octets avant « %PDF- » sont tolérés", () => {
    expect(contentMatchesExtension("pdf", text("\n\n  %PDF-1.4\n"))).toBe(true);
  });

  test("extension inconnue ou fichier vide : refus", () => {
    expect(contentMatchesExtension("exe", EXE)).toBe(false);
    expect(contentMatchesExtension("pdf", new Uint8Array(0))).toBe(false);
  });
});

describe("taille", () => {
  test("50 Mo au plus", () => {
    expect(MAX_UPLOAD_BYTES).toBe(50 * 1024 * 1024);
  });

  test("refus sur la taille annoncée, avant de lire le corps", () => {
    expect(declaredTooLarge(String(60 * 1024 * 1024))).toBe(true);
    expect(declaredTooLarge(String(49 * 1024 * 1024))).toBe(false);
    // 50 Mo de fichier + l'enveloppe multipart : accepté ici, tranché ensuite sur file.size.
    expect(declaredTooLarge(String(MAX_UPLOAD_BYTES + 2000))).toBe(false);
    expect(declaredTooLarge(null)).toBe(false);
    expect(declaredTooLarge("abc")).toBe(false);
  });
});

describe("la route applique les trois contrôles, dans l'ordre", () => {
  const api = readFileSync(join(import.meta.dir, "../src/api/index.ts"), "utf8");
  const upload = api.slice(api.indexOf('app.post("/api/documents/upload"'));
  const at = (needle: string) => {
    const i = upload.indexOf(needle);
    expect(i).toBeGreaterThan(-1);
    return i;
  };

  test("taille annoncée → extension → taille réelle → signature → limite par compte → stockage", () => {
    const order = [
      at('declaredTooLarge(c.req.header("content-length"))'),
      at("isSupported(file.name)"),
      at("file.size > MAX_UPLOAD_BYTES"),
      at("contentMatchesExtension(ext, bytes)"),
      at("userRateLimit(c, session.user.id, USER_LIMITS.import())"),
      at("new PutObjectCommand("),
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  test("le navigateur refuse aussi avant l'envoi", () => {
    const lib = readFileSync(join(import.meta.dir, "../src/web/components/document-library.tsx"), "utf8");
    expect(lib).toContain("const MAX_UPLOAD_BYTES = 50 * 1024 * 1024");
    expect(lib).toContain("if (file.size > MAX_UPLOAD_BYTES)");
  });
});
