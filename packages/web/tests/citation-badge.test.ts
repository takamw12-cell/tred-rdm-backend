import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { extractCitations, parseCitationAttrs } from "../src/web/lib/citations";

/**
 * Citations dans la Tafel, côté navigateur (2026-11-14) : le marqueur du
 * tuteur devient un badge « Titel, S. 12 » ; la page citée n'est plus ignorée ;
 * un clic ouvre l'original à cette page dans le lecteur PDF de l'app.
 */

const ROOT = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("lecture du marqueur [[QUELLE doc=… seite=…]]", () => {
  test("document, page et phrase", () => {
    const { clean, citations } = extractCitations('Die Wärmekapazität hängt vom Stoff ab.\n[[QUELLE doc="Thermo_Kapitel_3" seite=12]]Die Wärmekapazität ist definiert als …[[/QUELLE]]');
    expect(clean).toBe("Die Wärmekapazität hängt vom Stoff ab.");
    expect(citations).toEqual([{ excerpt: "Die Wärmekapazität ist definiert als …", docTitle: "Thermo_Kapitel_3", page: 12, closed: true }]);
  });

  test("plusieurs citations dans un bloc, dans l'ordre", () => {
    const { citations } = extractCitations('A [[QUELLE doc="Skript" seite=3]]eins[[/QUELLE]] B [[QUELLE doc="Klausur WS 2025" seite=7]]zwei[[/QUELLE]]');
    expect(citations.map((c) => [c.docTitle, c.page, c.excerpt])).toEqual([
      ["Skript", 3, "eins"],
      ["Klausur WS 2025", 7, "zwei"],
    ]);
  });

  test("tolérant : casse, espaces, guillemets typographiques, page entre guillemets, attributs absents", () => {
    expect(parseCitationAttrs(' DOC = "Thermo" SEITE = 12 ')).toEqual({ docTitle: "Thermo", page: 12 });
    expect(parseCitationAttrs(' doc=„Thermo“ seite="4"')).toEqual({ docTitle: "Thermo", page: 4 });
    expect(parseCitationAttrs("")).toEqual({ docTitle: null, page: null });
    expect(parseCitationAttrs(' doc="Thermo" seite=0')).toEqual({ docTitle: "Thermo", page: null });
    // Un « Seite=3 » DANS le titre n'est pas la page.
    expect(parseCitationAttrs(' doc="Skript Seite=3 Entwurf"')).toEqual({ docTitle: "Skript Seite=3 Entwurf", page: null });
    expect(extractCitations("[[ quelle ]]ohne Attribute[[ / QUELLE ]]").citations).toEqual([{ excerpt: "ohne Attribute", docTitle: null, page: null, closed: true }]);
  });

  test("une réponse en cours d'écriture : la citation n'est pas encore complète, donc pas encore vérifiée", () => {
    const { clean, citations } = extractCitations('Text [[QUELLE doc="Thermo" seite=12]]Die Wärmekapazität ist defin');
    expect(clean).toBe("Text");
    expect(citations).toEqual([{ excerpt: "Die Wärmekapazität ist defin", docTitle: "Thermo", page: 12, closed: false }]);
    expect(read("src/web/lib/citations.ts")).toContain(".filter((x) => x.c.closed)");
  });

  test("le marqueur n'apparaît jamais dans le texte affiché", () => {
    const { clean } = extractCitations('Vorher [[QUELLE doc="A" seite=1]]zitiert[[/QUELLE]] nachher', (s) => s.replace(/\s+/g, " "));
    expect(clean).toBe("Vorher nachher");
    expect(clean).not.toContain("QUELLE");
  });
});

describe("branchement : du badge au PDF, à la bonne page", () => {
  const ANSWER = read("src/web/components/ai-answer.tsx");
  const CHAT = read("src/web/pages/chat.tsx");
  const VIEWER = read("src/web/components/document-viewer.tsx");
  const PDF = read("src/web/components/pdf-viewer.tsx");
  const BADGE = read("src/web/components/citation-badge.tsx");

  test("la Tafel et le chat rendent les citations par le même badge, vérifié par le serveur", () => {
    expect(ANSWER).toContain("useCitationChecks(cite ? citations : [], cite?.scope)");
    expect(ANSWER).toContain("<CitationBadge");
    // La Tafel passe par la même carte de source que le chat.
    expect(read("src/web/components/tafel-board.tsx")).toContain("<SourceCard variant={seg.kind} text={seg.text} />");
    expect(CHAT).toContain("<CitationContext.Provider value={citationContext}>");
  });

  test("le badge ouvre le document et la page CONFIRMÉS par le serveur", () => {
    expect(ANSWER).toContain("cite.open({ documentId, page: verdict?.page ?? null, excerpt: c.excerpt })");
    expect(CHAT).toContain("setSourceView({ docId: documentId, highlight: excerpt, page })");
    expect(CHAT).toContain("page={sourceView?.page ?? null}");
    // Document inconnu : rien de cliquable.
    expect(BADGE).toContain("if (unknown || !onOpen) {");
    expect(BADGE).toContain('data-testid="citation-badge"');
  });

  test("plus jamais « le premier document de la liste » quand le titre ne correspond à rien", () => {
    expect(CHAT).not.toContain("if (!id && scopeDocs.length > 0) id = scopeDocs[0].id;");
  });

  test("la visionneuse lit l'original par la route réservée au propriétaire, à la page citée", () => {
    expect(VIEWER).toContain("documentUrl={`/api/documents/${encodeURIComponent(docId)}/stream`}");
    expect(VIEWER).toContain("initialPage={page ?? (matchPage >= 0 ? (pages[matchPage]?.n ?? 1) : 1)}");
    expect(VIEWER).toContain('setTab(highlight && !page ? "text" : "pdf");');
    // Le lecteur ne reçoit jamais l'adresse signée du stockage.
    expect(VIEWER).not.toMatch(/<PDFViewer[\s\S]{0,200}documentUrl=\{(pdfUrl|fileUrl)\}/);
  });

  test("le lecteur : PDF.js déjà installé, page initiale, zoom, navigation, plages d'octets", () => {
    expect(PDF).toContain('import("pdfjs-dist")');
    expect(PDF).toContain("initialPage = 1,");
    expect(PDF).toContain("setPage((current) => (pdf ? clampPage(initialPage, pdf.numPages) : initialPage) || current);");
    // Par plages, demandées par le lecteur lui-même (le serveur n'annonce pas la taille d'un flux).
    expect(PDF).toContain("new lib.PDFDataRangeTransport(total, head)");
    expect(PDF).toContain("headers: { Range: `bytes=${begin}-${end - 1}` }");
    expect(PDF).toContain("disableAutoFetch: true");
    expect(PDF).toContain('credentials: "same-origin"');
    for (const key of ["viewer.prevPage", "viewer.nextPage", "viewer.zoomIn", "viewer.zoomOut", "viewer.fitWidth"]) expect(PDF).toContain(`t("${key}")`);
    // Pas de second moteur PDF dans l'app.
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["pdfjs-dist"]).toBeDefined();
    expect(pkg.dependencies["react-pdf"]).toBeUndefined();
  });

  test("les fichiers annexes de PDF.js sont copiés au build (polices standard, décodeurs de scans)", () => {
    expect(read("vite.config.ts")).toContain("pdfjsAssetsPlugin()");
    const plugin = read("vite/pdfjs-assets-plugin.ts");
    for (const folder of ["cmaps", "standard_fonts", "wasm", "iccs"]) expect(plugin).toContain(`"${folder}"`);
    expect(existsSync(join(ROOT, "../../node_modules/pdfjs-dist/standard_fonts"))).toBe(true);
  });

  test("libellés du badge et du lecteur dans les quatre langues", () => {
    for (const lang of ["de", "en", "fr", "es"]) {
      const m = read(`src/web/i18n/messages/${lang}.ts`);
      for (const key of ["pageShort", "citeVerified", "citeCorrected", "citeUnverified", "citeUnknown", "prevPage", "nextPage", "zoomIn", "zoomOut", "fitWidth", "pageOf", "pdfError"]) expect(m).toMatch(new RegExp(`\\n {4}${key}: ".+",\\n`));
    }
    expect(read("src/web/i18n/messages/de.ts")).toContain('pageShort: "S. {page}"');
  });
});
