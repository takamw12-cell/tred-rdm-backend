import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * L'Explorateur 3D dans l'app (2026-11-15) : où il s'ouvre, ce qu'il charge,
 * et ce qu'il ne fait PAS (télécharger Three.js pour tout le monde, appeler un
 * tiers, envoyer une question à la place de l'étudiant).
 */
const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8");
const APP = read("../src/web/app.tsx");
const PAGE = read("../src/web/pages/explorer.tsx");
const SCENE = read("../src/web/components/Explorer3D.tsx");
const STEPS = read("../src/web/components/formula-steps.tsx");
const SIDEBAR = read("../src/web/components/sidebar.tsx");
const CHAT = read("../src/web/pages/chat.tsx");
const PKG = JSON.parse(read("../package.json")) as { dependencies: Record<string, string> };

describe("où il s'ouvre", () => {
  test("une page /explorer, chargée à la demande", () => {
    expect(APP).toContain('const ExplorerPage = lazyPage(() => import("./pages/explorer"));');
    expect(APP).toContain('<Route path="/explorer" component={ExplorerPage} />');
  });

  test("une entrée « 3D-Explorer » dans la barre latérale, traduite dans les douze langues", () => {
    expect(SIDEBAR).toContain('{ to: "/explorer", icon: Box, key: "nav.explorer" }');
    for (const lang of ["ar", "bn", "de", "en", "es", "fr", "hi", "it", "ja", "pt", "ru", "zh"]) expect(read(`../src/web/i18n/messages/${lang}.ts`)).toMatch(/\n {4}explorer: ".+",\n/);
    expect(read("../src/web/i18n/messages/fr.ts")).toContain('    explorer: "Explorateur 3D",');
  });
});

describe("ce qu'il charge", () => {
  test("Three.js n'entre dans aucun fichier chargé au démarrage : la scène est en React.lazy", () => {
    expect(PAGE).toContain('const Explorer3D = safeLazy(() => import("@/components/Explorer3D"));');
    expect(PAGE).not.toMatch(/from "three"|from "@react-three/);
    expect(APP).not.toMatch(/from "three"|from "@react-three/);
    expect(PAGE).toContain("<Suspense");
    expect(PAGE).toContain('data-testid="explorer-loading"');
  });

  test("GSAP n'est téléchargé que pour une formule, et jamais en mouvement réduit", () => {
    expect(STEPS).toContain('import("gsap")');
    expect(STEPS).not.toMatch(/^import .* from "gsap"/m);
    expect(STEPS).toContain("if (!el || reduced) return;");
  });

  test("versions exactes des bibliothèques (règle du dépôt)", () => {
    for (const name of ["three", "@react-three/fiber", "@react-three/drei", "gsap", "phaser"]) expect(PKG.dependencies[name]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(PKG.dependencies.gsap).toBe("3.15.0");
    expect(PKG.dependencies.phaser).toBe("4.2.1");
  });

  test("rien n'est demandé à un tiers : ni fichier de modèle, ni image d'éclairage, ni police", () => {
    expect(SCENE).not.toMatch(/https?:\/\//);
    // Les fichiers .glb viennent de NOTRE dossier public/models/ (tests/explorer-universal.test.ts).
    // L'éclairage de studio est une image HDR servie par TRED (public/hdr/) ; un « preset » de drei la téléchargerait chez un tiers.
    expect(SCENE).not.toMatch(/useTexture|preset=/);
    expect(SCENE).toContain('const STUDIO_HDR = "/hdr/studio-small-03-1k.hdr";');
    expect(SCENE).toContain("<Environment files={STUDIO_HDR}");
    expect(existsSync(join(import.meta.dir, "../public/hdr/studio-small-03-1k.hdr"))).toBe(true);
    expect(SCENE).toContain("<ContactShadows");
    // <Text> et <Html> de drei : l'un télécharge une police, l'autre levait « removeChild ».
    expect(SCENE).not.toMatch(/<Text\b|<Html\b/);
  });
});

describe("la scène", () => {
  test("on tourne autour du modèle ; un doigt tourne, deux doigts zooment, la page ne défile pas dessous", () => {
    expect(SCENE).toContain("<OrbitControls makeDefault");
    expect(SCENE).toContain('style={{ touchAction: "none" }}');
  });

  test("à l'arrêt, la scène n'est redessinée que si la vue change (batterie)", () => {
    expect(SCENE).toContain('frameloop={playing ? "always" : "demand"}');
    expect(PAGE).toContain("const [playing, setPlaying] = useState(!reduced);");
  });

  test("les repères sont de vrais boutons, nommés et marqués quand ils sont choisis", () => {
    expect(SCENE).toMatch(/<button[\s\S]*?data-testid=\{`hotspot-\$\{h\.id\}`\}[\s\S]*?aria-label=\{labels\[h\.id\]\}[\s\S]*?aria-pressed=\{on\}/);
  });

  test("la même sélection existe en liste, pour le clavier et les lecteurs d'écran", () => {
    expect(PAGE).toContain("data-testid={`part-${h.id}`}");
    expect(PAGE).toContain('aria-live="polite"');
  });

  test("sans WebGL : un message, pas une page blanche", () => {
    expect(SCENE).toContain("class WebGLBoundary");
    expect(PAGE).toContain('noWebGL={t("explorer.noWebgl")}');
  });
});

describe("« Den Tutor fragen »", () => {
  test("la question est déposée pour le Hörsaal, puis on y va", () => {
    expect(PAGE).toContain('export const ASK_DRAFT_KEY = "tred.askDraft";');
    expect(PAGE).toContain("sessionStorage.setItem(ASK_DRAFT_KEY, JSON.stringify(askPrompt(model, hotspot, locale)));");
    expect(PAGE).toContain('navigate("/chat");');
  });

  test("le Hörsaal la POSE dans le champ de saisie : il ne l'envoie pas", () => {
    const at = CHAT.indexOf('readOnce("tred.askDraft")');
    expect(at).toBeGreaterThan(0);
    const block = CHAT.slice(at, at + 200);
    expect(block).toContain("setInput(");
    expect(block).not.toMatch(/sendMessage|send\(/);
  });

  test("l'Explorateur n'appelle jamais le modèle d'IA lui-même", () => {
    expect(PAGE + SCENE + STEPS).not.toMatch(/\/api\/agent|fetch\(/);
  });
});

describe("textes de la page : complets dans les quatre langues entières", () => {
  test("mêmes clés partout", () => {
    const keys = (lang: string) => {
      const src = read(`../src/web/i18n/messages/${lang}.ts`);
      const block = src.slice(src.indexOf("\n  explorer: {"), src.indexOf("\n  },", src.indexOf("\n  explorer: {")));
      return [...block.matchAll(/\n {4}(\w+): "/g)].map((m) => m[1]);
    };
    const de = keys("de");
    expect(de.length).toBeGreaterThanOrEqual(20);
    for (const lang of ["en", "fr", "es"]) expect(keys(lang)).toEqual(de);
  });
});
