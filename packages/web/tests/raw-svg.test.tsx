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
