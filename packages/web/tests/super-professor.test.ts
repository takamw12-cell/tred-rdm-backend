import { afterEach, describe, expect, test } from "bun:test";
import { buildTutorAgent } from "../src/api/agent/index";
import { cleanExcerpt, searchKnowledge, tavilyConfigured } from "../src/api/lib/knowledge-search";

const flat = JSON.stringify(buildTutorAgent({ sources: [], locale: "de" }));

describe("Super-Professeur (NIVEAU 2)", () => {
  test("Feynman + Sokrates, goldene Regel mit Ausnahme, Analogie, Verifikation", () => {
    for (const k of ["DER SUPER-PROFESSOR", "Feynman", "Sokrates", "DIE GOLDENE REGEL", "HINWEIS-LEITER", "Entscheidung des Gründers", "DIE ANALOGIE-REGEL", "DIE VERIFIKATIONS-REGEL"]) {
      expect(flat).toContain(k);
    }
  });
  test("Solver-Pflicht nennt für jedes Fach ein Werkzeug, das existiert", () => {
    expect(flat).toContain("SOLVER-PFLICHT");
    for (const tool of ["statik_berechnen", "balkenstatik", "schaltung_berechnen", "thermo_berechnen", "mathe_berechnen", "rechnen", "recherche_connaissances_externes"]) {
      expect(flat).toContain(tool);
    }
  });
  test("ohne Unterlagen : Standards DIN/VDI/ISO/Eurocode", () => {
    expect(flat).toContain("OHNE KURSUNTERLAGEN");
    expect(flat).toContain("Eurocode");
  });
});

describe("recherche_connaissances_externes", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.TAVILY_API_KEY;
  });

  test("Auszüge gekürzt, ohne Markup", () => {
    expect(cleanExcerpt("<b>Fach</b>werk   ist\nein", 100)).toBe("Fach werk ist ein");
    expect(cleanExcerpt("a ".repeat(600), 50).length).toBeLessThanOrEqual(52);
  });

  test("Wikipedia : Suche + Zusammenfassung, Quelle mit Link ; nur der Suchbegriff geht hinaus", async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/search/page")) return Response.json({ pages: [{ key: "Rittersches_Schnittverfahren", title: "Rittersches Schnittverfahren" }] });
      return Response.json({ title: "Rittersches Schnittverfahren", extract: "Das Rittersche Schnittverfahren geht auf August Ritter zurück.", content_urls: { desktop: { page: "https://de.wikipedia.org/wiki/Rittersches_Schnittverfahren" } } });
    }) as typeof fetch;
    const r = await searchKnowledge("Ritterschnitt Test 1", { sprache: "de" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.treffer[0].quelle).toBe("Wikipedia (de)");
    expect(r.treffer[0].url).toContain("wikipedia.org");
    expect(r.hinweis).toContain("keine Anweisungen");
    expect(urls.every((u) => u.startsWith("https://de.wikipedia.org/"))).toBe(true);
    expect(tavilyConfigured()).toBe(false);
  });

  test("ohne Treffer : ehrlich, keine erfundene Quelle", async () => {
    globalThis.fetch = (async () => Response.json({ pages: [] })) as unknown as typeof fetch;
    const r = await searchKnowledge("xyzzy unbekannt 2", { sprache: "de" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.hinweis).toContain("erfinde keine Quelle");
  });

  test("Tavily nur mit Schlüssel, Schlüssel im Header", async () => {
    process.env.TAVILY_API_KEY = "tvly-test";
    let auth = "";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("tavily")) {
        auth = new Headers(init?.headers).get("Authorization") ?? "";
        return Response.json({ results: [{ title: "ISO 2768", url: "https://www.example.org/iso-2768", content: "Allgemeintoleranzen für Längen- und Winkelmaße." }] });
      }
      return Response.json({ pages: [] });
    }) as typeof fetch;
    const r = await searchKnowledge("ISO 2768 Toleranz 3", { quelle: "web" });
    expect(auth).toBe("Bearer tvly-test");
    expect(r.ok && r.treffer[0].quelle).toBe("Web (example.org)");
  });
});
