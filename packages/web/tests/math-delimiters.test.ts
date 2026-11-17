import { describe, expect, test } from "bun:test";
import {
  MathDelimiterNormalizer,
  escapeCurrencyDollars,
  expandDisplayLines,
  mathDelimiterTransform,
  normalizeMathDelimiters,
  wrapBareLatexLines,
} from "../src/api/lib/math-delimiters";

/**
 * Brief fondateur du 17 nov. 2026 : sur une capture, la formule
 * F_r = m(\ddot{r} - r\dot{\varphi}^2) s'affichait en LaTeX brut.
 * remark-math ne connaît que $…$ et $$…$$ : tout autre délimiteur reste du texte.
 */

describe("délimiteurs \\( \\) et \\[ \\] → $ et $$", () => {
  test("inline \\( … \\) devient $ … $", () => {
    expect(normalizeMathDelimiters(String.raw`Es gilt \(F_r = m\ddot r\) hier.`)).toBe("Es gilt $F_r = m\\ddot r$ hier.");
  });

  test("bloc \\[ … \\] devient $$ … $$", () => {
    expect(normalizeMathDelimiters("Also\n\\[\nF = ma\n\\]\nfertig")).toBe("Also\n$$\nF = ma\n$$\nfertig");
  });

  test("\\\\[4pt] (saut de ligne LaTeX) n'est pas un délimiteur", () => {
    const tex = String.raw`$$\begin{aligned} a &= b \\[4pt] c &= d \end{aligned}$$`;
    expect(normalizeMathDelimiters(tex)).toBe(tex);
  });

  test("le code reste intact", () => {
    const md = "Inline `\\(x\\)` und\n```latex\n\\[ x \\]\n```\n";
    expect(normalizeMathDelimiters(md)).toBe(md);
  });

  test("\\$ échappé et les autres commandes ne bougent pas", () => {
    const md = String.raw`Kosten \$5, $\{a\} \cdot \alpha$`;
    expect(normalizeMathDelimiters(md)).toBe(md);
  });

  test("en flux : un délimiteur coupé entre deux morceaux est quand même converti", () => {
    const n = new MathDelimiterNormalizer();
    const out = ["Es gilt \\", "(x", "^2\\", ") und `co", "de \\(", "` ok \\"].map((c) => n.push(c)).join("") + n.flush();
    expect(out).toBe("Es gilt $x^2$ und `code \\(` ok \\");
  });
});

describe("transformation du flux du modèle (serveur)", () => {
  test("réécrit les text-delta, vide le reste avant text-end, laisse passer le reste", async () => {
    const parts = [
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", text: "A \\" },
      { type: "text-delta", id: "t1", text: "(x\\" },
      { type: "text-delta", id: "t1", text: ")" },
      { type: "tool-call", toolCallId: "c1" },
      { type: "text-delta", id: "t1", text: " \\" },
      { type: "text-end", id: "t1" },
    ];
    const ts = mathDelimiterTransform()({ tools: {}, stopStream: () => {} } as never);
    const writer = ts.writable.getWriter();
    const read = (async () => {
      const got: { type: string; text?: string }[] = [];
      for await (const p of ts.readable as unknown as AsyncIterable<{ type: string; text?: string }>) got.push(p);
      return got;
    })();
    for (const p of parts) await writer.write(p as never);
    await writer.close();
    const got = await read;
    const text = got.filter((p) => p.type === "text-delta").map((p) => p.text).join("");
    expect(text).toBe("A $x$ \\");
    expect(got.map((p) => p.type)).toContain("tool-call");
    expect(got[got.length - 1].type).toBe("text-end");
  });
});

describe("les prix ne sont pas des formules", () => {
  test("$5 und $10 restent du texte", () => {
    expect(escapeCurrencyDollars("Das kostet $5 und $10.")).toBe("Das kostet \\$5 und \\$10.");
  });

  test("« 5 $ » à la française aussi", () => {
    expect(escapeCurrencyDollars("Prix : 5 $ et 10 $.")).toBe("Prix : 5 \\$ et 10 \\$.");
  });

  test("un prix à côté d'une vraie formule : seule la formule reste", () => {
    expect(escapeCurrencyDollars("Preis $5, Fläche $A = 3$")).toBe("Preis \\$5, Fläche $A = 3$");
  });

  test("les formules qui commencent par un chiffre restent des formules", () => {
    for (const md of ["$5$", "$2 \\cdot 3 = 6$ ok", "$5 + x$ und $y$", "$$5 $ x$$"]) {
      expect(escapeCurrencyDollars(md)).toBe(md);
    }
  });

  test("le code n'est pas touché", () => {
    expect(escapeCurrencyDollars("`echo $5 $6`")).toBe("`echo $5 $6`");
  });
});

describe("LaTeX sans délimiteurs", () => {
  test("une ligne qui n'est qu'une formule devient une formule abgesetzt", () => {
    expect(wrapBareLatexLines(String.raw`F_r = m(\ddot{r} - r\dot{\varphi}^2)`)).toBe(String.raw`$$F_r = m(\ddot{r} - r\dot{\varphi}^2)$$`);
  });

  test("après une puce et une étiquette, la formule seule est enveloppée", () => {
    expect(wrapBareLatexLines(String.raw`- **Radial:** F_r = m(\ddot{r} - r\dot{\varphi}^2)`)).toBe(
      String.raw`- **Radial:** $F_r = m(\ddot{r} - r\dot{\varphi}^2)$`,
    );
  });

  test("une phrase allemande avec une commande n'est pas enveloppée (on ne devine pas)", () => {
    const md = String.raw`Hier steht \varphi für den Winkel`;
    expect(wrapBareLatexLines(md)).toBe(md);
  });

  test("rien ne change dans une formule, un bloc $$ ou du code", () => {
    const md = "$$\n\\frac{a}{b}\n$$\n```\n\\frac{a}{b}\n```\nText $\\alpha$";
    expect(wrapBareLatexLines(md)).toBe(md);
  });
});

describe("$$ … $$ seul sur sa ligne = formule en bloc", () => {
  test("remark-math le lirait en ligne : on l'ouvre sur trois lignes", () => {
    expect(expandDisplayLines("Also:\n$$ E = mc^2 $$\nfertig")).toBe("Also:\n$$\nE = mc^2\n$$\nfertig");
  });

  test("garde l'indentation d'une liste, ne touche ni au code ni à une formule dans une phrase", () => {
    expect(expandDisplayLines("- Punkt\n  $$a=b$$")).toBe("- Punkt\n  $$\n  a=b\n  $$");
    const md = "Text $$a$$ Text\n```\n$$a$$\n```\n$$a$$ und $$b$$";
    expect(expandDisplayLines(md)).toBe(md);
  });
});

describe("câblage", () => {
  test("le prompt n'autorise que $ et $$, et interdit \\( \\), \\[ \\] et le LaTeX nu", async () => {
    const { buildTutorAgent } = await import("../src/api/agent/index");
    const agent = buildTutorAgent({ sources: [], locale: "de" }) as unknown as { settings: { instructions: { content: string }[] } };
    const p = agent.settings.instructions[0].content;
    const start = p.indexOf("NIVEAU 6 — FORMELN");
    const niveau6 = p.slice(start, start + 1200);
    expect(niveau6).toContain("NUR diese zwei Begrenzer");
    expect(niveau6).toContain("NIEMALS \\(...\\) oder \\[...\\]");
    expect(niveau6).toMatch(/LaTeX ohne\s+Begrenzer/);
  });

  test("le flux du chat passe par la conversion avant d'atteindre le navigateur", async () => {
    const src = await Bun.file(new URL("../src/api/index.ts", import.meta.url)).text();
    // Les deux essais (verrou solveur) passent par runAgent → createAgentUIStream.
    const call = src.slice(src.indexOf("=> createAgentUIStream({"), src.indexOf("onStepEnd:", src.indexOf("=> createAgentUIStream({")));
    expect(call.length).toBeGreaterThan(0);
    expect(call).toContain("experimental_transform: mathDelimiterTransform()");
  });
});
