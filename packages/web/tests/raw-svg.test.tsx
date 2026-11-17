import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { fenceRawSvg } from "../src/web/lib/raw-svg";
import { MarkdownContent } from "../src/web/components/markdown-content";

const html = (md: string) => renderToStaticMarkup(<MarkdownContent content={md} />);
/** Le texte VISIBLE : sans balises, avec les entités décodées (« &lt;path » = « <path » à l'écran). */
const visibleText = (h: string) =>
  h
    .replace(/<svg[\s\S]*?<\/svg>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');

const RAW = `Hier die Skizze:
<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L100 50" stroke="black"/><text x="10" y="20">F1</text></svg>
Und weiter im Text.`;

describe("SVG brut du tuteur", () => {
  test("un <svg> complet devient un bloc ```svg", () => {
    const out = fenceRawSvg(RAW);
    expect(out).toContain("```svg\n<svg");
    expect(out).toContain("</svg>\n```");
    expect(out).toContain("Und weiter im Text.");
  });

  test("il est DESSINÉ (SvgBlock), jamais affiché en balises", () => {
    const h = html(RAW);
    expect(h).toContain('data-slot="diagram"');
    const shown = visibleText(h);
    expect(shown).not.toContain("<path");
    expect(shown).not.toContain("<text");
    expect(shown).not.toContain("<svg");
    expect(shown).toContain("Und weiter im Text.");
  });

  test("balises isolées et <svg> pas encore fermé : masqués", () => {
    const loose = 'Kraft <text x="1" y="2">F_A</text> und <path d="M0 0"/> <line x1="0" y1="0" x2="1" y2="1"/> Ende';
    const shown = visibleText(html(loose));
    expect(shown).not.toMatch(/<(?:text|path|line)/);
    expect(shown).not.toContain("F_A");
    expect(shown).toContain("Kraft");
    expect(shown).toContain("Ende");

    const streaming = 'Gleich kommt die Skizze <svg viewBox="0 0 10 10"><path d="M0';
    expect(visibleText(html(streaming))).not.toContain("<svg");
  });

  test("le code reste intact : un exemple de SVG montré exprès", () => {
    const code = "So sieht ein Pfad aus:\n\n```html\n<svg><path d=\"M0 0\"/></svg>\n```\n\nund `<path/>` inline.";
    expect(fenceRawSvg(code)).toBe(code);
  });

  test("le texte sans balise ne change pas (a < b, x > 0)", () => {
    const t = "Für a < b und x > 0 gilt …";
    expect(fenceRawSvg(t)).toBe(t);
  });
});

describe("SVG brut : cas de la capture du 17 nov. (morceaux orphelins)", () => {
  const visible = (h: string) => h.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');

  test('<text x="155" …> et <path d="M 248,195 …"> orphelins disparaissent', () => {
    const md = 'Die Kraft greift hier an: <text x="155" y="80" font-size="14">F_A</text> <path d="M 248,195 L 300,200" stroke="#000"/> und wirkt nach unten.';
    const shown = visible(renderToStaticMarkup(<MarkdownContent content={md} />));
    expect(shown).not.toContain("<text");
    expect(shown).not.toContain("<path");
    expect(shown).not.toContain("248,195");
    expect(shown).toContain("und wirkt nach unten.");
  });

  test("fermeture seule, balise pas finie d'écrire, en-tête XML", () => {
    expect(fenceRawSvg('Ende der Skizze </g></svg> weiter')).toBe("Ende der Skizze  weiter");
    expect(fenceRawSvg('Text <path d="M 10,20 L 30')).toBe("Text ");
    expect(fenceRawSvg('<?xml version="1.0"?>\nHallo')).toBe("\nHallo");
  });

  test("un mot entre chevrons dans une phrase reste (espace réservé, exemple)", () => {
    const t = "Ersetze <text> durch deinen Namen und <title> durch die Überschrift.";
    expect(fenceRawSvg(t)).toBe(t);
  });

  test("Tafel : un <svg> brut avec des lignes vides reste UN bloc dessiné", async () => {
    const { writingChunks } = await import("../src/web/lib/tafel");
    const raw = 'Freikörperbild:\n\n<svg viewBox="0 0 200 100">\n\n<text x="155" y="20">F</text>\n\n<path d="M 248,195 L 10,10"/>\n\n</svg>\n\nDanach rechnen wir.';
    const chunks = writingChunks(raw);
    const svgChunks = chunks.filter((c) => c.includes("<svg"));
    expect(svgChunks).toHaveLength(1);
    expect(svgChunks[0].startsWith("```svg")).toBe(true);
    expect(svgChunks[0]).toContain("</svg>");
    // Aucun autre morceau ne porte de balise.
    expect(chunks.filter((c) => !c.startsWith("```svg")).join("\n")).not.toMatch(/<\/?(?:text|path|svg)/);
  });
});
