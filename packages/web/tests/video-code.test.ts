import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { codeInSource, codeLanguage, videoSceneSchema } from "../src/api/lib/video-script";
import { CUE_VISUAL, resolveVisual, VISUALS } from "../src/api/lib/video-visuals";

const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");
const SOURCE = "Beispiel 3.2: Vorwärtsdifferenz in Python\n  def ableitung(f, x, h=1e-6):\n      return (f(x + h) - f(x)) / h\nDer Fehler ist von der Ordnung h.";

describe("vidéo : le visuel « code »", () => {
  test("dans la bibliothèque, avec son ordre write_code", () => {
    expect(VISUALS).toContain("code");
    expect(CUE_VISUAL.write_code).toBe("code");
    expect(resolveVisual({ visual_cues: ["write_code"], code: "print(1)" }, { beam: false }).visual).toBe("code");
    expect(resolveVisual({ visual_cues: ["write_code"], code: "  " }, { beam: false }).visual).toBe("text");
  });

  test("le code doit être recopié du cours, ligne par ligne (indentation libre)", () => {
    expect(codeInSource("def ableitung(f, x, h=1e-6):\n    return (f(x + h) - f(x)) / h", SOURCE)).toBe(true);
    expect(codeInSource("def ableitung(f, x, h=1e-9):", SOURCE)).toBe(false); // une valeur changée
    expect(codeInSource("import os\nos.system('rm -rf /')", SOURCE)).toBe(false); // inventé
    expect(codeInSource("", SOURCE)).toBe(false);
    expect(codeInSource(Array.from({ length: 13 }, () => "def ableitung(f, x, h=1e-6):").join("\n"), SOURCE)).toBe(false); // 12 lignes au plus
  });

  test("langages colorés ; un inconnu devient du texte brut", () => {
    expect(codeLanguage("Python")).toBe("python");
    expect(codeLanguage("c++")).toBe("cpp");
    expect(codeLanguage("js")).toBe("javascript");
    expect(codeLanguage("brainfuck")).toBe("plaintext");
  });

  test("le schéma du script accepte une scène sans code (champs par défaut)", () => {
    const scene = videoSceneSchema.parse({ kind: "explanation", heading: "H", bullets: [], formula: "", sourceIndex: 1, quote: "q", voiceover: "v", steps: [], keywords: [], chart: "", image: "" });
    expect(scene.code).toBe("");
    expect(scene.code_language).toBe("");
  });

  test("validation : un code qui n'est pas dans la source redevient du texte ; une analogie n'a jamais de code", () => {
    const src = read("src/api/lib/video-script.ts");
    expect(src).toContain('const codeOk = shown.visual === "code" && !computed && codeInSource(scene.code, src.content);');
    expect(src).toContain('formula: "", code: "", code_language: "", quote: "",');
  });

  test("composition : frappe colorée par highlight.js (déjà dans l'app), transitions à ressort", () => {
    const comp = read("src/web/video/dynamic-explanation.tsx");
    expect(comp).toContain("function CodeTyping(");
    expect(comp).toContain('import hljs from "highlight.js/lib/core";');
    expect(comp).toContain("spring({ frame: local, fps, config: { damping: 15, stiffness: 120, mass: 0.7 } })");
    // La formule continue de s'écrire caractère par caractère.
    expect(comp).toContain("function Formula({ tex, reveal, color }");
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.dependencies["react-syntax-highlighter"]).toBeUndefined();
  });
});
