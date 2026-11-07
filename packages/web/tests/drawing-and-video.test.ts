import { describe, expect, test } from "bun:test";
import { buildTutorAgent } from "../src/api/agent/index";
import { sanitizeSvg } from "../src/web/lib/svg-sanitize";
import { isEducationalHit, MAX_HITS } from "../src/api/lib/youtube";
import { cleanQuery, condense } from "../src/api/lib/video-query";

/** Le prompt système complet, tel que le modèle le reçoit (textes concaténés). */
function promptText(): string {
  const agent = buildTutorAgent({ sources: [], locale: "de" }) as unknown;
  const parts: string[] = [];
  (function walk(v: unknown) {
    if (typeof v === "string") parts.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  })(agent);
  return parts.join("\n");
}

describe("prompt : dessin technique DIN en SVG", () => {
  const text = promptText();
  const example = (/BEISPIEL — Buchse[\s\S]*?```svg\n([\s\S]*?)```/.exec(text)?.[1] ?? "").trim();

  test("la règle exige vues, hachures, cotes, tolérances et cartouche", () => {
    expect(text).toContain("TECHNISCHE ZEICHNUNG ALS SVG");
    for (const k of ["Vorderansicht", "Draufsicht", "Seitenansicht", "Schraffur", "MASSE (DIN 406)", "SCHRIFTFELD", "ISO 2768-mK", "Projektionsmethode 1"]) {
      expect(text).toContain(k);
    }
    // Plan → SVG 2D ; 3d-json seulement sur demande « 3D ».
    expect(text.replace(/\s+/g, " ")).toContain("svg-Block — kein 3d-json");
  });

  test("l'exemple est un vrai SVG qui survit au nettoyage", () => {
    expect(example).toStartWith("<svg viewBox=");
    expect(example).not.toMatch(/<svg[^>]*\swidth=/);
    const clean = sanitizeSvg(example);
    for (const k of ["<pattern", 'fill="url(#schraffur-buchse)"', "<marker", "Ø50 h6", "Ø30 H7", "ISO 2768-mK", "A–A"]) {
      expect(clean).toContain(k);
    }
    // Balises équilibrées (le modèle recopie l'exemple : il doit être propre).
    for (const tag of ["svg", "defs", "pattern", "marker", "g"]) {
      const open = (example.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
      const close = (example.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
      expect(close).toBe(open);
    }
  });
});

describe("Video dazu finden : requête et filtre", () => {
  test("trois vidéos au plus", () => {
    expect(MAX_HITS).toBe(3);
  });

  test("garde les cours, écarte vlogs, divertissement, Shorts et autres langues", () => {
    const lecture = { title: "Kirchhoffsche Maschenregel – Beispiel", channel: "Uni Kanal", categoryId: "27", language: "de", seconds: 600 };
    expect(isEducationalHit(lecture)).toBe(true);
    expect(isEducationalHit({ ...lecture, language: "en-US" })).toBe(true);
    expect(isEducationalHit({ ...lecture, title: "Mein Ingenieur VLOG #12" })).toBe(false);
    expect(isEducationalHit({ ...lecture, categoryId: "24" })).toBe(false);
    expect(isEducationalHit({ ...lecture, seconds: 35 })).toBe(false);
    expect(isEducationalHit({ ...lecture, language: "hi" })).toBe(false);
    // Langue de l'étudiant acceptée en plus de DE/EN.
    expect(isEducationalHit({ ...lecture, language: "fr" }, "fr")).toBe(true);
    // Chaîne de cours reconnue : toujours gardée.
    expect(isEducationalHit({ ...lecture, channel: "Studyflix", categoryId: "24" })).toBe(true);
  });

  test("la requête du modèle est nettoyée (prénom, opérateurs, guillemets)", () => {
    expect(cleanQuery('"Kirchhoffsche Maschenregel" Beispiel -vlog site:youtube.com Rached', "Rached Edwin")).toBe(
      "Kirchhoffsche Maschenregel Beispiel vlog",
    );
    expect(cleanQuery("a\nb c d e f g h i j k l m").split(" ").length).toBe(10);
  });

  test("le contexte envoyé au modèle sans code ni formules", () => {
    expect(condense("Text ```svg\n<svg/>``` mehr $$x^2$$ Ende", 100)).toBe("Text mehr Ende");
  });
});
