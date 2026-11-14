import { describe, expect, test } from "bun:test";
import { buildTutorAgent } from "../src/api/agent/index";
import { chercherDansDocuments } from "../src/api/lib/document-search";
import { pagesIn, selectRelevantContext, type SourceDoc } from "../src/api/lib/retrieval";

/**
 * Traçabilité des extraits (2026-11-14) : aucun morceau de cours n'arrive au
 * modèle sans son document NI sa page. Sans cela, il cite la page de l'extrait
 * précédent — une citation fausse, pire que pas de citation.
 */

const filler = (page: number, n: number) => Array.from({ length: n }, (_, i) => `Fuellsatz ${page}.${i} ueber allgemeine Grundlagen ohne besonderen Inhalt.`).join(" ");

/** Un Skript de `pages` pages (≈ 2 600 caractères chacune) ; `facts[p]` est posé au MILIEU de la page p. */
function skript(title: string, pages: number, facts: Record<number, string>, id?: string): SourceDoc {
  const content = Array.from({ length: pages }, (_, i) => {
    const p = i + 1;
    return `[[SEITE ${p}]]\n${filler(p, 22)} ${facts[p] ?? ""} ${filler(p + 1000, 14)}`;
  }).join("\n\n");
  return { ...(id ? { id } : {}), title, kind: "vorlesung", content };
}

const THERMO = skript("Thermo_Kapitel_3", 30, { 17: "Die Waermekapazitaet ist definiert als die Waermemenge pro Kelvin Temperaturaenderung.", 4: "Der Carnotwirkungsgrad haengt nur von den Reservoirtemperaturen ab." }, "doc-thermo");
const MECHANIK = skript("TM2_Skript_Balkenbiegung", 30, { 9: "Das Flaechentraegheitsmoment des Rechteckquerschnitts betraegt b mal h hoch drei durch zwoelf." }, "doc-tm2");
const BUDGET = 6_000;

/** Les marques de page présentes dans un extrait, avec ce qui les suit. */
const segments = (content: string) => content.split(/(?=\[\[SEITE \d+\]\])/).filter((s) => s.trim());

describe("un extrait pris au milieu d'une page garde sa page", () => {
  test("le passage de la page 17 arrive sous la marque [[SEITE 17]]", () => {
    const { sources, truncated } = selectRelevantContext([THERMO], "Waermekapazitaet Waermemenge Kelvin Temperaturaenderung", BUDGET);
    expect(truncated).toBe(true);
    const content = sources[0]!.content;
    const seg = segments(content).find((s) => s.includes("Waermekapazitaet ist definiert"));
    expect(seg).toBeDefined();
    // La marque qui précède le passage est celle de SA page — pas celle d'un extrait voisin.
    expect(seg!.startsWith("[[SEITE 17]]")).toBe(true);
    // Et l'extrait commençait bien au milieu de la page : la page 17 d'origine débute par son remplissage.
    expect(seg).not.toContain("Fuellsatz 17.0 ");
  });

  test("deux passages de pages éloignées : chacun sous sa marque, un « […] » entre eux", () => {
    const { sources } = selectRelevantContext([THERMO], "Carnotwirkungsgrad Reservoirtemperaturen Waermekapazitaet Waermemenge Kelvin", BUDGET);
    const content = sources[0]!.content;
    const carnot = segments(content).find((s) => s.includes("Carnotwirkungsgrad haengt"));
    const cp = segments(content).find((s) => s.includes("Waermekapazitaet ist definiert"));
    expect(carnot!.startsWith("[[SEITE 4]]")).toBe(true);
    expect(cp!.startsWith("[[SEITE 17]]")).toBe(true);
    expect(content.indexOf("[…]")).toBeGreaterThan(content.indexOf("Carnotwirkungsgrad haengt"));
    expect(content.indexOf("[…]")).toBeLessThan(content.indexOf("Waermekapazitaet ist definiert"));
    // Tout ce qui est livré au modèle est sous une marque de page.
    expect(content.trimStart().startsWith("[[SEITE ")).toBe(true);
    for (const part of content.split("[…]")) expect(part.trim().startsWith("[[SEITE ")).toBe(true);
  });

  test("aucune marque coupée en deux par le découpage", () => {
    for (const query of ["Waermekapazitaet", "Carnotwirkungsgrad Reservoirtemperaturen", "Fuellsatz Grundlagen Inhalt", "allgemeine"]) {
      const { sources } = selectRelevantContext([THERMO, MECHANIK], query, BUDGET);
      for (const s of sources) {
        const withoutMarks = s.content.replace(/\[\[SEITE \d+\]\]/g, "");
        expect(withoutMarks).not.toContain("[[");
        expect(withoutMarks).not.toContain("]]");
      }
    }
  });

  test("un petit cours qui tient dans le budget n'est pas touché", () => {
    const small: SourceDoc = { title: "Blatt 1", kind: "uebung", content: "[[SEITE 1]]\nAufgabe 1: Berechne die Auflagerkraefte des Balkens.\n\n[[SEITE 2]]\nAufgabe 2: Zeichne den Momentenverlauf." };
    const { sources, truncated } = selectRelevantContext([small], "Auflagerkraefte", BUDGET);
    expect(truncated).toBe(false);
    expect(sources[0]).toEqual(small);
  });

  test("pagesIn : les pages couvertes par un extrait", () => {
    expect(pagesIn("[[SEITE 4]]\nText\n[…]\n[[SEITE 17]]\nText [[SEITE 18]] Ende")).toEqual([4, 17, 18]);
    expect(pagesIn("ohne Marke")).toEqual([]);
  });
});

describe("deux documents ne se mélangent pas", () => {
  test("chaque extrait reste dans SON document, avec son identifiant", () => {
    const { sources } = selectRelevantContext([THERMO, MECHANIK], "Waermekapazitaet Kelvin Flaechentraegheitsmoment Rechteckquerschnitt", BUDGET);
    const thermo = sources.find((s) => s.title === "Thermo_Kapitel_3")!;
    const tm2 = sources.find((s) => s.title === "TM2_Skript_Balkenbiegung")!;
    expect(thermo.id).toBe("doc-thermo");
    expect(tm2.id).toBe("doc-tm2");
    expect(thermo.content).toContain("Waermekapazitaet ist definiert");
    expect(thermo.content).not.toContain("Flaechentraegheitsmoment");
    expect(tm2.content).toContain("Flaechentraegheitsmoment des Rechteckquerschnitts");
    expect(tm2.content).not.toContain("Waermekapazitaet");
    expect(segments(tm2.content).find((s) => s.includes("Flaechentraegheitsmoment"))!.startsWith("[[SEITE 9]]")).toBe(true);
  });

  test("la recherche du tuteur rend le document ET les pages de chaque trouvaille", () => {
    const found = chercherDansDocuments([THERMO, MECHANIK], "Flaechentraegheitsmoment Rechteckquerschnitt");
    const hit = found.find((p) => p.extrait.includes("Flaechentraegheitsmoment des Rechteckquerschnitts"))!;
    expect(hit.document).toBe("TM2_Skript_Balkenbiegung");
    expect(hit.seiten).toContain(9);
    expect(hit.ausAnderemDokument).toBeUndefined();
  });

  test("limitée à un document : rien ne vient d'ailleurs", () => {
    const found = chercherDansDocuments([THERMO, MECHANIK], "Waermekapazitaet Flaechentraegheitsmoment", "Thermo Kapitel 3");
    expect(found.length).toBeGreaterThan(0);
    expect(new Set(found.map((p) => p.document))).toEqual(new Set(["Thermo_Kapitel_3"]));
    expect(found.every((p) => !p.extrait.includes("Flaechentraegheitsmoment"))).toBe(true);
  });

  test("document demandé introuvable : on cherche partout, mais chaque trouvaille dit d'où elle vient", () => {
    const found = chercherDansDocuments([THERMO, MECHANIK], "Flaechentraegheitsmoment Rechteckquerschnitt", "Altklausur Elektrotechnik");
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((p) => p.ausAnderemDokument === true)).toBe(true);
    expect(found.every((p) => ["Thermo_Kapitel_3", "TM2_Skript_Balkenbiegung"].includes(p.document))).toBe(true);
  });
});

describe("la consigne du tuteur (NIVEAU 4)", () => {
  const withSearch = JSON.stringify(
    buildTutorAgent({
      sources: [{ title: "Thermo_Kapitel_3", kind: "vorlesung", content: "[[SEITE 17]]\nDie Waermekapazitaet ist definiert als …" }],
      inventory: [{ title: "Thermo_Kapitel_3", kind: "vorlesung", pageCount: 30 }],
      locale: "de",
      search: () => [],
    }),
  );
  const withoutSearch = JSON.stringify(buildTutorAgent({ sources: [{ title: "Thermo_Kapitel_3", kind: "vorlesung", content: "[[SEITE 17]]\nText" }], locale: "de" }));

  test("citer TOUJOURS le document et la page, sans jamais deviner", () => {
    for (const prompt of [withSearch, withoutSearch]) {
      expect(prompt).toContain("ZITIERPFLICHT (ABSOLUT)");
      expect(prompt).toContain("DOKUMENT UND SEITE");
      expect(prompt).toContain("Thermo_Kapitel_3, Seite 7");
      expect(prompt).toContain("JEDER\\n");
      expect(prompt).toMatch(/du RÄTST\\n\s*nie eine Seitenzahl/);
    }
    expect(withSearch).toContain("schlägst du mit `suche_in_unterlagen` nach");
    expect(withoutSearch).toContain("sagst du das offen");
  });

  test("ne jamais mélanger deux documents, et signaler une contradiction", () => {
    expect(withSearch).toContain("MEHRERE DOKUMENTE — STRIKT GETRENNT");
    expect(withSearch).toContain("WIDERSPRECHEN sich zwei Dokumente");
    expect(withSearch).toMatch(/statt stillschweigend eine der beiden zu wählen/);
  });

  test("le format de citation cliquable ne change pas : celui que le modèle produit déjà", () => {
    expect(withSearch).toContain('[[QUELLE doc=\\"<exakter Dokumenttitel>\\" seite=<n>]]');
    expect(withSearch).not.toContain("[CITE:");
  });

  test("chaque document reste enfermé dans son enveloppe, avec sa marque de page", () => {
    expect(withSearch).toContain('<dokument titel=\\"Thermo_Kapitel_3\\" typ=\\"vorlesung\\">\\n[[SEITE 17]]');
  });
});
