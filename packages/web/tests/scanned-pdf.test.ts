import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assessPageText,
  extractPdf,
  ocrImageText,
  pagesToOcr,
  recoverPdfPages,
  ScannedPdfUnreadableError,
} from "../src/api/lib/extract";

/**
 * PDF scannés : une couche texte vide OU en charabia part à l'OCR (Mathpix,
 * puis vision). Aucun appel réseau ici : Mathpix est simulé par fetch, la
 * vision par une fonction injectée.
 */

const INFOMAIL =
  "Liebe Studierende, die Anreise zum Campus West (TG West) erfolgt über die Haltestelle " +
  "Uniklinik. Bitte beachten Sie: Die Einführungsveranstaltung beginnt um 9:00 Uhr im Hörsaal " +
  "W1. Parkplätze sind begrenzt; nutzen Sie öffentliche Verkehrsmittel (ASEAG-Linien 3A, 33).";

// Ce que rend une police sans table ToUnicode : contrôles, zone privée, U+FFFD, symboles.
const GARBLED =
  "\u0003\u0011\u0007�\u0014\u0002 ■●░▒\u0010�" +
  "\u0001\u0012 ▓◆\u0015\u0013�\u0005 e\u0006\u0016■▒\u0017" +
  "\u0018\u0019�\u001A\u001B●\u0004\u0008\u000E\u000F░\u001C\u001D";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.MATHPIX_APP_ID;
  delete process.env.MATHPIX_APP_KEY;
});

describe("Détection du scan", () => {
  test("texte administratif allemand : lisible", () => {
    expect(assessPageText(INFOMAIL).verdict).toBe("ok");
  });

  test("umlauts, grec, formules, guillemets : pas du charabia", () => {
    const formula = "Gegeben: σ = F/A = 12 kN / 300 mm² → σ ≈ 40 N/mm². Prüfe τ ≤ τ_zul, „Sicherheit“ S ≥ 1,5 · 20 °C.";
    expect(assessPageText(formula).verdict).toBe("ok");
    expect(assessPageText("Größenänderung über Übergänge — Maßstäbe für Füße und Schöße. ".repeat(2)).verdict).toBe("ok");
  });

  test("autre écriture (chinois, arabe) : pas un scan", () => {
    expect(assessPageText("工程力学是研究物体机械运动和受力的学科，包括静力学、运动学和动力学。材料力学研究构件的强度、刚度和稳定性。").verdict).toBe("ok");
    expect(assessPageText("الميكانيكا الهندسية هي فرع من فروع الهندسة يدرس حركة الأجسام والقوى المؤثرة عليها بدقة").verdict).toBe("ok");
  });

  test("caractères corrompus (> 30 % suspects) : charabia", () => {
    const q = assessPageText(GARBLED);
    expect(q.verdict).toBe("zeichensalat");
    expect(q.suspiciousRatio).toBeGreaterThan(0.3);
  });

  test("soupe de symboles ASCII (police à encodage propre) : charabia", () => {
    expect(assessPageText("!\"#$%&'()*+,-./0123:;<=>?@[\\]^_`{|}~!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~ 4 5 6 7 8").verdict).toBe("zeichensalat");
  });

  test("moins de 50 caractères sur la page : trop peu de texte", () => {
    expect(assessPageText("Seite 3").verdict).toBe("zu_wenig_text");
    expect(assessPageText("").verdict).toBe("zu_wenig_text");
    // court mais corrompu : charabia quand même
    expect(assessPageText("\uE01A\uFFFD\u0003\u0011 ab \uE0F2\u0014\u0002\u25A0\u25CF").verdict).toBe("zeichensalat");
  });

  test("plan d'OCR : charabia toujours, page courte seulement si le PDF est surtout scanné", () => {
    // Skript numérique avec une page de titre courte : rien à transcrire
    expect(pagesToOcr([INFOMAIL, "Kapitel 2", INFOMAIL, INFOMAIL])).toEqual([]);
    // Une page en charabia au milieu : elle seule
    expect(pagesToOcr([INFOMAIL, GARBLED, INFOMAIL])).toEqual([{ index: 1, verdict: "zeichensalat" }]);
    // PDF entièrement scanné : toutes les pages
    expect(pagesToOcr(["", "", "x"]).map((p) => p.index)).toEqual([0, 1, 2]);
  });
});

describe("Repli OCR", () => {
  test("la page en charabia est relue, le charabia n'entre jamais dans le document", async () => {
    const asked: number[] = [];
    const r = await recoverPdfPages([INFOMAIL, GARBLED], async (i) => {
      asked.push(i);
      return "Anreise: Bus 33 bis Uniklinik, dann 5 Minuten zu Fuß zum Gebäude TG West, Eingang Süd.";
    });
    expect(asked).toEqual([1]);
    expect(r.ocr).toBe(true);
    expect(r.text).toContain("[[SEITE 2]]\nAnreise: Bus 33");
    expect(r.text).not.toContain("�");
    expect(r.text).not.toContain("");
  });

  test("OCR impossible sur une page : marquée illisible, le reste est gardé", async () => {
    const r = await recoverPdfPages([INFOMAIL, GARBLED], async () => null);
    expect(r.unreadablePages).toEqual([2]);
    expect(r.text).toContain("[Seite konnte nicht gelesen werden]");
    expect(r.text).toContain("Campus West");
  });

  test("rien de lisible même après OCR → ScannedPdfUnreadableError", async () => {
    await expect(recoverPdfPages([GARBLED, ""], async () => null)).rejects.toBeInstanceOf(ScannedPdfUnreadableError);
    // un OCR qui ne rend lui-même que du charabia ne compte pas
    await expect(recoverPdfPages([GARBLED], async () => GARBLED)).rejects.toBeInstanceOf(ScannedPdfUnreadableError);
  });

  test("Mathpix d'abord quand ses clés sont posées, vision ensuite", async () => {
    process.env.MATHPIX_APP_ID = "test-id";
    process.env.MATHPIX_APP_KEY = "test-key";
    let mathpixCalls = 0;
    globalThis.fetch = (async () => {
      mathpixCalls++;
      return new Response(JSON.stringify({ text: INFOMAIL, confidence: 0.97 }), { status: 200 });
    }) as unknown as typeof fetch;
    let visionCalls = 0;
    const vision = async () => {
      visionCalls++;
      return "vision";
    };
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(await ocrImageText(png, "image/png", vision)).toBe(INFOMAIL);
    expect([mathpixCalls, visionCalls]).toEqual([1, 0]);

    // Mathpix en panne → la vision prend le relais
    globalThis.fetch = (async () => new Response("down", { status: 503 })) as unknown as typeof fetch;
    expect(await ocrImageText(png, "image/png", vision)).toBe("vision");
    expect(visionCalls).toBe(1);
  });

  test("sans Mathpix ni IA : null, jamais d'exception", async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    expect(await ocrImageText(png, "image/png", async () => Promise.reject(new Error("no key")))).toBeNull();
  });
});

/** Un vrai PDF d'une page dont la couche texte n'est que du bruit. */
function garbledPdf(): Uint8Array {
  const bytes = Array.from({ length: 160 }, (_, i) => (i * 37 + 1) % 32 || 1); // octets de contrôle
  const payload = bytes.map((b) => "\\" + b.toString(8).padStart(3, "0")).join("");
  const stream = `BT /F1 12 Tf 40 760 Td (${payload}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
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

describe("extractPdf de bout en bout (vrai PDF, OCR simulé)", () => {
  test("couche texte corrompue → l'OCR est déclenché et remplace le bruit", async () => {
    const asked: number[] = [];
    const doc = await extractPdf(garbledPdf(), async (i) => {
      asked.push(i);
      return INFOMAIL;
    });
    expect(asked).toEqual([0]);
    expect(doc.ocr).toBe(true);
    expect(doc.pageCount).toBe(1);
    expect(doc.text).toBe(`[[SEITE 1]]\n${INFOMAIL}`);
  });

  test("et si l'OCR échoue aussi → erreur dédiée (message clair côté client)", async () => {
    await expect(extractPdf(garbledPdf(), async () => null)).rejects.toBeInstanceOf(ScannedPdfUnreadableError);
  });

  test("câblage : code d'erreur, worker, message dans 4 langues", () => {
    const root = join(import.meta.dir, "..");
    const read = (p: string) => readFileSync(join(root, p), "utf8");
    expect(read("src/api/index.ts")).toContain('{ error: "scan_unreadable" }, 422');
    expect(read("src/api/lib/extract-worker.ts")).toContain('"scan_unreadable"');
    expect(read("src/api/lib/extract-queue.ts")).toContain('"ScannedPdfUnreadableError"');
    // Le message vit avec les autres codes d'import (un fichier ou un lot) ; la bibliothèque passe par là.
    expect(read("src/web/components/import-queue.tsx")).toMatch(/case "scan_unreadable":\s+return t\("library\.scanUnreadable"\);/);
    expect(read("src/web/components/document-library.tsx")).toContain("setUploadError(importErrorText(t, code ?? fallback));");
    const de = read("src/web/i18n/messages/de.ts");
    expect(de).toContain("Dieses PDF scheint ein Scan zu sein und konnte nicht automatisch gelesen werden.");
    for (const l of ["en", "fr", "es"]) expect(read(`src/web/i18n/messages/${l}.ts`)).toContain("scanUnreadable:");
  });
});
