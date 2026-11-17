import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

// markdown-content importe, par ses blocs riches, le client RPC qui lit window.location.
// Le faux `window` ne sert qu'à l'import : on le retire aussitôt, sinon les
// autres fichiers de test (même processus) croiraient tourner dans un navigateur.
const g = globalThis as { window?: unknown };
const hadWindow = "window" in g;
g.window ??= { location: { origin: "http://localhost" } };
const { MarkdownContent } = await import("../src/web/components/markdown-content");
if (!hadWindow) delete g.window;

const html = (md: string) => renderToStaticMarkup(<MarkdownContent content={md} />);
const katexCount = (h: string) => (h.match(/class="katex"/g) ?? []).length;
/** Le HTML visible : sans l'annotation MathML, qui garde le source LaTeX pour les lecteurs d'écran. */
const visible = (h: string) => h.replace(/<annotation[\s\S]*?<\/annotation>/g, "");

/**
 * Le rendu réel de bout en bout : react-markdown + remark-math +
 * rehype-sanitize + rehype-katex, tel que l'étudiant le voit.
 */
describe("rendu des formules", () => {
  test("$$ E = mc^2 $$ produit un élément .katex, pas du texte brut", () => {
    const h = html("$$ E = mc^2 $$");
    expect(h).toContain('class="katex-display"');
    expect(katexCount(h)).toBe(1);
    expect(h).not.toContain("$$");
  });

  test("un prix comme $5 reste du texte brut", () => {
    const h = html("Das Buch kostet $5 und das Heft $10.");
    expect(katexCount(h)).toBe(0);
    expect(h).toContain("$5");
    expect(h).toContain("$10");
  });

  test("la formule de la capture, en \\( \\), en \\[ \\] et sans délimiteur", () => {
    const f = String.raw`F_r = m(\ddot{r} - r\dot{\varphi}^2)`;
    for (const md of [String.raw`Radial: \(` + f + String.raw`\)`, `Radial:\n\\[\n${f}\n\\]`, f, `$${f}$`]) {
      const h = html(md);
      expect(katexCount(h)).toBe(1);
      expect(visible(h)).not.toContain("\\ddot");
    }
  });

  test("une formule invalide affiche une erreur propre, sans planter", () => {
    const h = html("$$\\frac{1}{$$");
    expect(h).toContain("katex-error");
  });

  test("sécurité : pas de lien javascript:, ni depuis le Markdown ni depuis KaTeX", () => {
    const h = html("[klick](javascript:alert(1)) und $\\href{javascript:alert(2)}{x}$ und <img src=x onerror=alert(3)>");
    // Le source LaTeX reste lisible dans l'annotation MathML (texte échappé) :
    // ce qui compte, c'est qu'aucun attribut ne le porte.
    expect(h).not.toMatch(/(?:href|src)="javascript:/i);
    expect(h).not.toContain("<img");
    expect(h).not.toMatch(/<[^>]+\son\w+=/i);
  });
});
