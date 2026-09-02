import Markdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import type { Components } from "react-markdown";
import { cn } from "@/lib/utils";
import { MermaidDiagram, ChartBlock, TikzDiagram, SvgBlock } from "./diagram-blocks";
import { CodeBlock, isHighlightableLang } from "./code-block";
import { Curriculum, parseCurriculum } from "./curriculum";
import { MARK, rehypeEnrich } from "./enrich";
import { DictionaryTooltip } from "./dictionary-tooltip";
import { SourceCitation } from "./source-citation";

// Intercept fenced code blocks: ```mermaid renders a real diagram, ```chart
// renders a plotted graph (Q/M curves, Mohr circle, …). Everything else keeps
// the normal inline / block code styling.
function codeLang(node: unknown): string | undefined {
  const child = (node as { children?: { properties?: { className?: string[] } }[] })
    ?.children?.[0];
  const cls = child?.properties?.className ?? [];
  const hit = cls.find((c) => c.startsWith("language-"));
  return hit?.replace("language-", "");
}

/** Texte brut d'une clôture de code, depuis le nœud hast. */
function rawCode(node: unknown): string {
  const code = (node as { children?: { children?: { value?: string }[] }[] })
    ?.children?.[0];
  return code?.children?.map((c) => c.value ?? "").join("") ?? "";
}

const components: Components = {
  /**
   * `rehypeEnrich` marque les termes techniques et les citations de source
   * avec des `data-tred-*`. C'est ici qu'ils redeviennent des composants.
   *
   * Un `span` porteur de données plutôt qu'une balise inventée : une balise
   * inconnue dépend du bon vouloir de la chaîne de rendu, un `span` non.
   */
  span(props) {
    const { node, children, ...rest } = props as {
      node?: { properties?: Record<string, unknown> };
      children?: React.ReactNode;
    };
    const p = node?.properties ?? {};

    const termId = p[MARK.term];
    if (typeof termId === "string" && termId) {
      return <DictionaryTooltip termId={termId}>{children}</DictionaryTooltip>;
    }

    if (p[MARK.cite]) {
      const page = Number(p[MARK.page]);
      const doc = String(p[MARK.doc] ?? "").trim();
      // Une page illisible vaut mieux affichée en texte que sous forme de
      // « Seite NaN » : on laisse alors passer le rendu normal.
      if (doc && Number.isFinite(page) && page > 0) {
        return <SourceCitation doc={doc} page={page} />;
      }
    }

    return <span {...rest}>{children}</span>;
  },
  code(props) {
    const { className, children } = props as {
      className?: string;
      children?: React.ReactNode;
    };
    const match = /language-(\w+)/.exec(className ?? "");
    const lang = match?.[1];
    const raw = String(children ?? "");
    // Un bloc ```json qui décrit une structure de cours devient le
    // Course Structure Navigator. Tout autre JSON garde l'affichage normal —
    // d'où le `parseCurriculum` qui renvoie null plutôt que de lever.
    if (lang === "json") {
      const curriculum = parseCurriculum(raw);
      if (curriculum) return <Curriculum data={curriculum} />;
    }
    if (lang === "mermaid") return <MermaidDiagram code={raw} />;
    if (lang === "chart") return <ChartBlock code={raw} />;
    if (lang === "svg") return <SvgBlock code={raw} />;
    if (lang === "tikz") return <TikzDiagram code={raw} />;
    // Multiline code fences in a highlightable language -> rich CodeBlock
    // (copy / download / explain). Inline code has no language + no newline.
    if (isHighlightableLang(lang) && raw.includes("\n"))
      return <CodeBlock code={raw.replace(/\n$/, "")} lang={lang as string} />;
    return <code className={className}>{children}</code>;
  },
  // Diagram blocks render their own container — skip the <pre> wrapper so we
  // don't nest block elements inside <pre> (invalid HTML + extra scrollbars).
  pre(props) {
    const { node, children } = props as { node?: unknown; children?: React.ReactNode };
    const lang = codeLang(node);
    if (lang === "mermaid" || lang === "chart" || lang === "svg" || lang === "tikz")
      return <>{children}</>;
    // Même chose pour un curriculum : il rend sa propre <section>, qui n'a
    // rien à faire à l'intérieur d'un <pre>.
    if (lang === "json" && parseCurriculum(rawCode(node)) !== null)
      return <>{children}</>;
    // CodeBlock renders its own <pre>; don't double-wrap it.
    if (isHighlightableLang(lang)) return <>{children}</>;
    return (
      <pre className="bg-secondary my-3 overflow-x-auto rounded-lg p-3 text-xs [&_code]:bg-transparent [&_code]:p-0">
        {children}
      </pre>
    );
  },
};

/**
 * Repariert LaTeX, dem die Mathe-Begrenzer fehlen.
 *
 * Vergisst das Modell das öffnende `$$`, erkennt remark-math die Formel nicht
 * und die Studierenden sehen rohes `\begin{aligned} …` im Text. Statt die
 * Antwort zu verwerfen, setzen wir die fehlenden Begrenzer.
 */
const ENVIRONMENTS =
  "aligned|align|array|cases|matrix|pmatrix|bmatrix|vmatrix|gather|equation";
const ENV_RE = new RegExp(
  String.raw`\\begin\{(?:${ENVIRONMENTS})\*?\}[\s\S]*?\\end\{(?:${ENVIRONMENTS})\*?\}`,
  "g",
);

/**
 * Repariert SVG-Skizzen, deren Code-Zaun kaputt ist.
 *
 * Das Modell fügt das fertige SVG manchmal als "--```svg <svg …" mitten in
 * eine Zeile ein. Markdown erkennt den Zaun dann nicht und die Studierenden
 * sehen seitenweise SVG-Quelltext. Hier wird jedes nackte <svg>…</svg> in
 * einen sauberen Block auf eigener Zeile gesetzt.
 */
const SVG_RE = /<svg[\s\S]*?<\/svg>/g;

export function repairSvgFences(text: string): string {
  if (!text.includes("<svg")) return text;
  const out: string[] = [];
  let last = 0;
  for (const m of text.matchAll(SVG_RE)) {
    const at = m.index ?? 0;
    const original = text.slice(last, at);
    // Zuerst prüfen, ob der Zaun bereits korrekt ist (eigene Zeile).
    if (/(^|\n)```[a-z]*[ \t]*\n$/i.test(original)) {
      out.push(text.slice(last, at + m[0].length));
      last = at + m[0].length;
      continue;
    }
    // Kaputte Zaun-Reste entfernen ("--```svg", "```svg" mitten im Satz).
    const before = original.replace(/-*[ \t]*`{1,3}[ \t]*svg[ \t]*$/i, "");
    const after = text.slice(at + m[0].length);
    const closing = after.match(/^[ \t]*\n?[ \t]*`{1,3}/);
    const skip = closing ? closing[0].length : 0;
    out.push(`${before}\n\n\`\`\`svg\n${m[0]}\n\`\`\`\n\n`);
    last = at + m[0].length + skip;
  }
  out.push(text.slice(last));
  return out.join("");
}

/**
 * Trennt aneinandergeklebte Mathe-Begrenzer.
 *
 * Das Modell schreibt gern "Querschnittsfläche $A$$$A = b \\cdot h …$$" — eine
 * Inline-Formel direkt gefolgt von einer abgesetzten, ohne Trennzeichen. Im Text
 * steht dann `$A$$$A`, also drei Dollarzeichen am Stück. remark-math verlangt,
 * dass öffnender und schließender Zaun gleich viele Dollar haben, findet hier
 * keinen passenden Abschluss und lässt den ganzen Rest als Rohtext stehen — das
 * sind die sichtbaren `\\frac{...}` in der Antwort.
 *
 * Wir laufen deshalb einmal durch den Text, verfolgen den Mathe-Zustand und
 * setzen einen Absatz zwischen ein Ende und den direkt folgenden Anfang.
 */
export function splitGluedMath(text: string): string {
  if (!text.includes("$")) return text;

  // Code-Zäune unangetastet lassen: dort ist ein $ einfach ein $.
  const blocks = text.split(/(```[\s\S]*?```|`[^`\n]*`)/g);

  return blocks
    .map((block, i) => {
      // Ungerade Indizes sind die eingefangenen Code-Abschnitte.
      if (i % 2 === 1) return block;

      let out = "";
      let mode: null | 1 | 2 = null; // offener Zaun: 1 = $…$, 2 = $$…$$
      let i2 = 0;

      while (i2 < block.length) {
        const ch = block[i2];

        // Escaptes \$ ist reiner Text.
        if (ch === "\\" && block[i2 + 1] === "$") {
          out += "\\$";
          i2 += 2;
          continue;
        }
        if (ch !== "$") {
          out += ch;
          i2 += 1;
          continue;
        }

        // Länge der Dollar-Kette bestimmen.
        let run = 0;
        while (block[i2 + run] === "$") run += 1;
        i2 += run;

        let left = run;
        while (left > 0) {
          if (mode === null) {
            const open = left >= 2 ? 2 : 1;
            out += "$".repeat(open);
            mode = open as 1 | 2;
            left -= open;
          } else {
            const close = mode;
            if (left < close) {
              // Unvollständig — unverändert ausgeben, nicht raten.
              out += "$".repeat(left);
              left = 0;
              break;
            }
            out += "$".repeat(close);
            mode = null;
            left -= close;
            // Hier saß das Problem: direkt nach dem Schluss beginnt schon der
            // nächste Zaun. Ein Absatz dazwischen macht beide erkennbar.
            if (left > 0) out += "\n\n";
          }
        }
      }
      return out;
    })
    .join("");
}

/**
 * Trennt aneinanderklebende Mathe-Begrenzer.
 *
 * Das Modell schreibt oft erst den Namen einer Größe inline und direkt danach
 * die Rechnung als abgesetzte Formel — ohne Leerzeichen dazwischen:
 *
 *   Querschnittsfläche $A$$$A = b \cdot h = \boxed{800}$$
 *
 * Aus `$A$` + `$$A = …$$` werden dann drei `$` am Stück. remark-math kann diese
 * Folge nicht eindeutig auflösen und gibt die halbe Zeile als Rohtext aus.
 *
 * Ein kleiner Scanner löst das eindeutig: er merkt sich, ob er gerade in einer
 * Inline- oder in einer abgesetzten Formel steht, und schiebt beim Wechsel eine
 * Leerzeile ein. So bleibt auch der umgekehrte Fall ($$…$$ direkt gefolgt von
 * $x$) korrekt.
 */
export function separateAdjacentMath(text: string): string {
  if (!text.includes("$")) return text;

  let out = "";
  let mode: "none" | "inline" | "display" = "none";
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    // Maskiertes \$ ist Text, kein Begrenzer.
    if (ch === "\\" && i + 1 < text.length) {
      out += text.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (ch !== "$") {
      out += ch;
      i += 1;
      continue;
    }

    const isDouble = text[i + 1] === "$";

    if (mode === "none") {
      out += isDouble ? "$$" : "$";
      mode = isDouble ? "display" : "inline";
      i += isDouble ? 2 : 1;
      continue;
    }

    if (mode === "inline") {
      out += "$";
      mode = "none";
      i += 1;
      if (text[i] === "$") out += "\n\n";
      continue;
    }

    // mode === "display"
    if (isDouble) {
      out += "$$";
      mode = "none";
      i += 2;
      if (text[i] === "$") out += "\n\n";
      continue;
    }
    // Einzelnes $ innerhalb einer abgesetzten Formel bleibt Inhalt.
    out += "$";
    i += 1;
  }

  return out;
}

export function repairMath(text: string): string {
  const matches = [...text.matchAll(ENV_RE)];
  if (matches.length === 0) return text;

  let out = "";
  let last = 0;
  for (const m of matches) {
    const at = m.index ?? 0;
    const before = text.slice(last, at);
    // Steht direkt davor bereits ein Mathe-Begrenzer, ist alles in Ordnung.
    const alreadyMath = /(\$\$|\\\[)\s*$/.test(before);
    if (alreadyMath) {
      out += before + m[0];
    } else {
      // Verwaiste schließende Klammern und ein einzelnes $$ dahinter entfernen.
      const afterRaw = text.slice(at + m[0].length);
      const stray = afterRaw.match(/^\s*\}*\s*\$\$/);
      if (stray) last = at + m[0].length + stray[0].length;
      else last = at + m[0].length;
      out += `${before}\n\n$$\n${m[0]}\n$$\n\n`;
      continue;
    }
    last = at + m[0].length;
  }
  return out + text.slice(last);
}

// Renders Markdown with LaTeX (KaTeX). German technical terms stay bold inline.
export function MarkdownContent({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "reading-scalable text-sm leading-relaxed [&_code]:rounded [&_code]:bg-secondary [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_p]:my-2 [&_strong]:font-semibold [&_strong]:text-primary [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_.katex-display]:my-3 [&_.katex-display]:overflow-x-auto [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:border-border [&_th]:bg-secondary [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:font-semibold",
        className,
      )}
    >
      <Markdown
        remarkPlugins={[remarkMath, remarkGfm]}
        // L'ordre compte : KaTeX construit ses formules d'abord, l'enrichissement
        // passe ensuite et sait alors reconnaître — et éviter — ses sous-arbres.
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }], rehypeEnrich]}
        components={components}
      >
        {repairSvgFences(repairMath(splitGluedMath(content)))}
      </Markdown>
    </div>
  );
}
