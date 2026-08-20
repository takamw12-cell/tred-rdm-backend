import { useMemo } from "react";
import katex from "katex";
import { cn } from "@/lib/utils";

// Kurze Texte, die Formeln enthalten können (Schritt-Titel, Beschriftungen).
// Für ganze Antworten bleibt MarkdownContent zuständig — hier wäre ein voller
// Markdown-Parser Overkill und würde eine Überschrift in einen Block umbrechen.
const MATH_RE = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;

type Part =
  | { type: "text"; value: string }
  | { type: "math"; value: string; display: boolean };

export function splitMath(text: string): Part[] {
  const parts: Part[] = [];
  let last = 0;
  for (const m of text.matchAll(MATH_RE)) {
    const at = m.index ?? 0;
    if (at > last) parts.push({ type: "text", value: text.slice(last, at) });
    const block = m[1];
    parts.push({
      type: "math",
      value: (block ?? m[2] ?? "").trim(),
      display: block !== undefined,
    });
    last = at + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}

/**
 * Rendert einen kurzen Text, in dem `$…$` und `$$…$$` als echte Formeln
 * erscheinen sollen. Fehlerhafte Formeln werfen nicht, sondern werden als
 * Rohtext gezeigt — eine kaputte Zeile ist besser als eine leere Antwort.
 */
export function MathText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const parts = useMemo(() => splitMath(text), [text]);

  if (parts.length === 1 && parts[0]?.type === "text") {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={cn("inline", className)}>
      {parts.map((part, i) => {
        if (part.type === "text") return <span key={i}>{part.value}</span>;
        let html: string;
        try {
          html = katex.renderToString(part.value, {
            // Auch abgesetzte Formeln werden hier inline gesetzt: in einer
            // Titelzeile würde displayMode die Zeile sprengen.
            displayMode: false,
            throwOnError: false,
            strict: false,
          });
        } catch {
          return <span key={i}>{part.value}</span>;
        }
        return (
          <span
            key={i}
            className="katex-inline"
            // KaTeX liefert bereinigtes HTML; throwOnError ist aus, damit ein
            // Tippfehler des Modells nicht die ganze Antwort abschießt.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </span>
  );
}
