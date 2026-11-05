import { describe, expect, test } from "bun:test";
import { stripLoneSurrogateEscapes, wellFormed } from "../src/api/lib/unicode-safe";
import { selectRelevantContext } from "../src/api/lib/retrieval";

/**
 * Incident du 5 novembre 2026 : « lone leading surrogate in hex escape ».
 * Un 𝑥 (U+1D465, deux unités UTF-16) coupé en deux par un .slice() rendait
 * la requête vers Anthropic invalide, et le chat entier tombait.
 */

const X = "\u{1D465}"; // 𝑥 mathématique, tel qu'il sort des PDF
const isWellFormed = (s: string) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);

describe("unicode-safe", () => {
  test("wellFormed remplace une moitié isolée et garde les caractères entiers", () => {
    const cut = `a${X}b`.slice(0, 2); // "a" + moitié haute de 𝑥
    expect(isWellFormed(cut)).toBe(false);
    expect(wellFormed(cut)).toBe("a�");
    expect(wellFormed(`a${X}b 👇`)).toBe(`a${X}b 👇`);
  });

  test("le corps JSON envoyé à Anthropic ne contient plus de moitié isolée", () => {
    const body = JSON.stringify({ system: `Formel ${X}`.slice(0, 8), ok: `${X}👇` });
    expect(body).toMatch(/\\ud835(?!\\ud)/i); // la panne reproduite
    const fixed = stripLoneSurrogateEscapes(body);
    expect(fixed).not.toMatch(/\\ud835(?!\\ud)/i);
    const parsed = JSON.parse(fixed) as { system: string; ok: string };
    expect(parsed.system).toBe("Formel �");
    expect(parsed.ok).toBe(`${X}👇`); // paires intactes
  });

  test("un \\u littéral échappé (texte « \\ud835 ») n'est pas touché", () => {
    const body = JSON.stringify({ t: "\\ud835 bleibt Text" });
    expect(stripLoneSurrogateEscapes(body)).toBe(body);
  });

  // Les morceaux font 1400 unités et commencent tous les 1200 : des positions
  // paires. Un caractère de décalage ("a") met chaque 𝑥 à cheval sur une
  // frontière paire — exactement ce qu'un vrai PDF finit par produire.
  const doc = (content: string) => [{ title: "Skript", kind: "vorlesung", content }];

  test("découpage en morceaux : aucun extrait avec une moitié de caractère", () => {
    const content = "a" + `Kraft Moment ${X}`.repeat(3000); // motif de 15 unités
    const { sources } = selectRelevantContext(doc(content), "Kraft Moment", 6000);
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) expect(isWellFormed(s.content)).toBe(true);
  });

  test("repli (rien ne correspond) : le début du document reste bien formé", () => {
    const content = "a" + X.repeat(20000);
    const { sources } = selectRelevantContext(doc(content), "Querkraft", 5000);
    for (const s of sources) expect(isWellFormed(s.content)).toBe(true);
  });
});
