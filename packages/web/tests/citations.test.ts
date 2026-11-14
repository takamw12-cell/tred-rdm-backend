import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { docsByTitle, findQuote, normText, pagesOf, verifyCitation, type CitedDoc } from "../src/api/lib/citations";

/**
 * Vérification des citations du tuteur (2026-11-14) : une référence n'est
 * affichée comme vérifiée que si le document appartient à l'étudiant, que la
 * page existe et que la phrase citée s'y trouve vraiment.
 */

const page = (n: number, text: string) => `[[SEITE ${n}]]\n${text}`;

const THERMO: CitedDoc = {
  id: "doc-thermo",
  title: "Thermo_Kapitel_3",
  pageCount: 14,
  textContent: [
    page(11, "Der erste Hauptsatz beschreibt die Erhaltung der Energie in einem abgeschlossenen System."),
    page(12, "Die Wärmekapazität ist definiert als die Wärmemenge, die ein Körper\npro Kelvin Temperaturänderung aufnimmt. Es gilt Q = C · ΔT."),
    page(13, "Für ideale Gase gilt U = R · I nicht, sondern p V = n R T. Die isentrope Verdichtung endet an der\nnächsten Seite"),
    page(14, "mit einer höheren Temperatur als zu Beginn."),
  ].join("\n\n"),
};
const TM2: CitedDoc = {
  id: "doc-tm2",
  title: "TM2_Skript_Balkenbiegung",
  pageCount: 2,
  textContent: [page(1, "Das Flächenträgheitsmoment des Rechteckquerschnitts beträgt b h³ / 12."), page(2, "Die Biegelinie folgt aus der zweifachen Integration des Momentenverlaufs.")].join("\n\n"),
};
const DOCS = [THERMO, TM2];

describe("la phrase est bien dans le document", () => {
  test("bon document, bonne page : vérifiée", () => {
    const v = verifyCitation({ doc: "Thermo_Kapitel_3", page: 12, excerpt: "Die Wärmekapazität ist definiert als die Wärmemenge, die ein Körper pro Kelvin Temperaturänderung aufnimmt." }, DOCS);
    expect(v).toEqual({ status: "verified", documentId: "doc-thermo", title: "Thermo_Kapitel_3", page: 12, citedPage: 12 });
  });

  test("un retour à la ligne, la casse ou la ponctuation ne changent rien", () => {
    const v = verifyCitation({ doc: "Thermo_Kapitel_3", page: 12, excerpt: "die wärmekapazität ist definiert als die wärmemenge die ein körper pro kelvin temperaturänderung aufnimmt" }, DOCS);
    expect(v.status).toBe("verified");
  });

  test("le tuteur se trompe de page : on donne la VRAIE page", () => {
    const v = verifyCitation({ doc: "Thermo_Kapitel_3", page: 7, excerpt: "Die Wärmekapazität ist definiert als die Wärmemenge, die ein Körper pro Kelvin" }, DOCS);
    expect(v).toMatchObject({ status: "page_corrected", documentId: "doc-thermo", page: 12, citedPage: 7 });
  });

  test("pas de page annoncée : on la trouve", () => {
    const v = verifyCitation({ doc: "Thermo_Kapitel_3", page: null, excerpt: "Der erste Hauptsatz beschreibt die Erhaltung der Energie" }, DOCS);
    expect(v).toMatchObject({ status: "verified", page: 11, citedPage: null });
  });

  test("une formule recopiée en LaTeX reste reconnue", () => {
    expect(normText("$Q = C \\cdot \\Delta T$")).toBe(normText("Q = C · ΔT"));
    const v = verifyCitation({ doc: "Thermo_Kapitel_3", page: 12, excerpt: "Die Wärmekapazität ist definiert als die Wärmemenge, die ein Körper pro Kelvin Temperaturänderung aufnimmt. Es gilt $Q = C \\cdot \\Delta T$." }, DOCS);
    expect(v.status).toBe("verified");
  });

  test("une phrase à cheval sur deux pages est attribuée à la première", () => {
    const v = verifyCitation({ doc: "Thermo_Kapitel_3", page: 13, excerpt: "Die isentrope Verdichtung endet an der nächsten Seite mit einer höheren Temperatur als zu Beginn." }, DOCS);
    expect(v).toMatchObject({ status: "verified", page: 13 });
  });

  test("un titre approximatif désigne quand même le bon document", () => {
    expect(docsByTitle(DOCS, "Thermo_Kapitel_3.pdf").map((d) => d.id)).toEqual(["doc-thermo"]);
    expect(docsByTitle(DOCS, "Skript Balkenbiegung").map((d) => d.id)).toEqual(["doc-tm2"]);
    expect(docsByTitle(DOCS, "TM2 Skript Balkenbiegung").map((d) => d.id)).toEqual(["doc-tm2"]);
    // Rien ne ressemble : liste vide, pas « le premier document venu ».
    expect(docsByTitle(DOCS, "Regelungstechnik Skript")).toEqual([]);
    expect(docsByTitle(DOCS, null)).toEqual([]);
    expect(docsByTitle(DOCS, "thermo kapitel").map((d) => d.id)).toEqual(["doc-thermo"]);
  });
});

describe("le garde-fou : ce qui n'est PAS vérifié", () => {
  test("une phrase reformulée par le tuteur n'est pas une citation", () => {
    const v = verifyCitation({ doc: "Thermo_Kapitel_3", page: 12, excerpt: "Unter Wärmekapazität versteht man, wie viel Energie nötig ist, um einen Stoff zu erwärmen." }, DOCS);
    expect(v).toMatchObject({ status: "quote_not_found", documentId: "doc-thermo", page: 12 });
  });

  test("une page qui n'existe pas n'est jamais reprise", () => {
    const v = verifyCitation({ doc: "Thermo_Kapitel_3", page: 250, excerpt: "Unter Wärmekapazität versteht man etwas ganz anderes als hier steht." }, DOCS);
    expect(v).toMatchObject({ status: "quote_not_found", documentId: "doc-thermo", page: null, citedPage: 250 });
  });

  test("un document que l'étudiant n'a pas : rien à ouvrir", () => {
    const v = verifyCitation({ doc: "Regelungstechnik_Skript", page: 3, excerpt: "Die Übertragungsfunktion beschreibt das Verhalten eines linearen Systems im Bildbereich." }, DOCS);
    expect(v).toEqual({ status: "unknown_document", documentId: null, title: null, page: null, citedPage: 3 });
  });

  test("on ne choisit JAMAIS un document par défaut (l'ancien comportement ouvrait le premier de la liste)", () => {
    const v = verifyCitation({ doc: "Irgendein Titel", page: 1, excerpt: "Ein Satz, der in keinem der Dokumente der Person vorkommt, egal wie man sucht." }, DOCS);
    expect(v.documentId).toBeNull();
  });

  test("mauvais titre, mais la phrase existe mot pour mot dans UN seul document : c'est lui, avec sa vraie page", () => {
    const v = verifyCitation({ doc: "Thermo_Kapitel_3", page: 12, excerpt: "Die Biegelinie folgt aus der zweifachen Integration des Momentenverlaufs." }, DOCS);
    expect(v).toMatchObject({ status: "page_corrected", documentId: "doc-tm2", title: "TM2_Skript_Balkenbiegung", page: 2 });
  });

  test("la même phrase dans deux documents, titre inconnu : on ne tranche pas", () => {
    const twin: CitedDoc = { ...TM2, id: "doc-tm2-bis", title: "TM2_Zusammenfassung" };
    const v = verifyCitation({ doc: "Unbekannt", page: 1, excerpt: "Die Biegelinie folgt aus der zweifachen Integration des Momentenverlaufs." }, [THERMO, TM2, twin]);
    expect(v.status).toBe("unknown_document");
  });

  test("trois mots ne prouvent rien", () => {
    expect(findQuote(pagesOf(THERMO.textContent), "siehe oben")).toBeNull();
    expect(verifyCitation({ doc: "Thermo_Kapitel_3", page: 12, excerpt: "Es gilt" }, DOCS).status).toBe("quote_not_found");
  });

  test("« presque » mot pour mot passe, une vague ressemblance non", () => {
    const pages = pagesOf(THERMO.textContent);
    // Un mot en moins, l'ordre conservé.
    expect(findQuote(pages, "Die Wärmekapazität ist definiert als die Wärmemenge, die ein Körper pro Kelvin aufnimmt.")).toMatchObject({ page: 12 });
    // Les mêmes mots-clés dans un autre ordre : ce n'est pas le texte du Skript.
    expect(findQuote(pages, "Pro Kelvin nimmt ein Körper eine Wärmemenge auf, das nennt man definiert Wärmekapazität Temperaturänderung.")).toBeNull();
  });
});

describe("la route ne regarde que les documents de la session", () => {
  const INDEX = readFileSync(join(import.meta.dir, "../src/api/index.ts"), "utf8");
  const route = INDEX.slice(INDEX.indexOf('app.post("/api/documents/citations/verify"'));

  test("sans session : 401 ; les deux lectures filtrent sur le compte", () => {
    expect(route).toContain('if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);');
    expect(route).toContain("const mine = eq(document.userId, userId);");
    // Liste légère ET lecture du texte : jamais sans le filtre du compte.
    expect(route).toMatch(/\.where\(scope\)/);
    expect(route).toMatch(/\.where\(and\(mine, inArray\(document\.id, ids\)\)\)/);
    expect(route).not.toContain("visibleDocuments(");
  });

  test("bornée : 12 citations par appel, 2 000 caractères par phrase", () => {
    expect(INDEX).toContain(".max(12),");
    expect(INDEX).toContain("excerpt: z.string().min(1).max(2_000),");
  });
});
