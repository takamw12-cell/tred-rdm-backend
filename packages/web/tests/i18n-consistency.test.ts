import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Cohérence des 12 langues de l'interface.
 *
 * Les paquets PARTIELS sont voulus (types.ts) : une clé absente s'affiche en
 * allemand. Ce test ne les fait donc pas échouer — il imprime la couverture.
 * Il échoue en revanche sur ce qui casse vraiment l'écran :
 *   1. une clé utilisée dans le code qui n'existe pas en allemand → la clé
 *      brute (« chat.why ») s'afficherait ;
 *   2. une clé d'un paquet qui n'existe pas en allemand → faute de frappe,
 *      la traduction n'est jamais lue ;
 *   3. une valeur vide.
 */

const WEB = join(import.meta.dir, "../src/web");
const MSG = join(WEB, "i18n/messages");

type Tree = { [k: string]: string | Tree };
const flat = (o: Tree, p = "", out: Record<string, string> = {}) => {
  for (const [k, v] of Object.entries(o ?? {})) {
    const key = p ? `${p}.${k}` : k;
    if (v && typeof v === "object") flat(v, key, out);
    else out[key] = String(v);
  }
  return out;
};

const locales = readdirSync(MSG)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => f.slice(0, -3));

const bundles: Record<string, Record<string, string>> = {};
for (const l of locales) {
  const mod = (await import(join(MSG, `${l}.ts`))) as Record<string, Tree>;
  bundles[l] = flat(mod[l]);
}
const de = bundles.de;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? sourceFiles(join(dir, e.name))
      : /\.tsx?$/.test(e.name)
        ? [join(dir, e.name)]
        : [],
  );
}

describe("i18n — 12 langues", () => {
  test("les 12 paquets sont présents", () => {
    expect(locales.sort()).toEqual(
      ["ar", "bn", "de", "en", "es", "fr", "hi", "it", "ja", "pt", "ru", "zh"],
    );
  });

  test("toute clé t(\"…\") du code existe en allemand (sinon : clé brute à l'écran)", () => {
    const missing: string[] = [];
    for (const file of sourceFiles(WEB)) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/\bt\(\s*["']([a-zA-Z]\w*(?:\.\w+)+)["']/g)) {
        if (!(m[1] in de)) missing.push(`${m[1]}  (${file.slice(WEB.length + 1)})`);
      }
    }
    expect(missing).toEqual([]);
  });

  for (const l of locales.filter((x) => x !== "de")) {
    test(`${l} : aucune clé inconnue de l'allemand, aucune valeur vide`, () => {
      const keys = Object.keys(bundles[l]);
      expect(keys.filter((k) => !(k in de))).toEqual([]);
      expect(keys.filter((k) => bundles[l][k].trim() === "")).toEqual([]);
    });
  }

  test("couverture (information, n'échoue pas)", () => {
    const total = Object.keys(de).length;
    const lines = locales
      .filter((l) => l !== "de")
      .map((l) => {
        const n = Object.keys(bundles[l]).length;
        return `${l} ${String(Math.round((100 * n) / total)).padStart(3)} %  (${n}/${total})`;
      });
    console.log(`\nCouverture des traductions (le reste s'affiche en allemand) :\n  ${lines.join("\n  ")}`);
    expect(total).toBeGreaterThan(0);
  });
});
