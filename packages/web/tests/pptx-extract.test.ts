import { describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import { extractDocument } from "../src/api/lib/extract";

/** Un PowerPoint est lu sans bibliothèque de plus : un zip, un fichier XML par diapositive. */
const slide = (...texts: string[]) => strToU8(`<p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree>${texts.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join("")}</p:spTree></p:cSld></p:sld>`);

describe("import d'un fichier .pptx", () => {
  test("le texte de chaque diapositive est extrait, dans l'ordre, une diapositive = une page", async () => {
    const pptx = zipSync({
      "[Content_Types].xml": strToU8("<Types/>"),
      "ppt/slides/slide2.xml": slide("Zweiter Hauptsatz", "Entropie nimmt in abgeschlossenen Systemen nicht ab."),
      "ppt/slides/slide10.xml": slide("Zusammenfassung"),
      "ppt/slides/slide1.xml": slide("Thermodynamik 1", "Wärme &amp; Arbeit"),
    });
    const doc = await extractDocument(pptx, "Vorlesung 3.pptx");
    expect(doc.pageCount).toBe(3);
    expect(doc.text).toMatch(/\[\[SEITE 1\]\]\s+Thermodynamik 1\s+Wärme & Arbeit/);
    expect(doc.text).toMatch(/\[\[SEITE 2\]\]\s+Zweiter Hauptsatz/);
    expect(doc.text.indexOf("Zusammenfassung")).toBeGreaterThan(doc.text.indexOf("Entropie"));
  });
});
