import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Plateforme visuelle (2026-11-15) : mini-jeu, cartes du Dashboard, transitions — le branchement. */
const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8");
const APP = read("../src/web/app.tsx");
const GAME = read("../src/web/components/MiniGame.tsx");
const GAME_PAGE = read("../src/web/pages/minigame.tsx");
const DASH = read("../src/web/pages/dashboard.tsx");
const DECK = read("../src/web/components/flip-deck.tsx");
const TRANSITION = read("../src/web/components/page-transition.tsx");
const BUTTON = read("../src/web/components/ui/button.tsx");
const CSS = read("../src/web/styles.css");

describe("mini-jeu", () => {
  test("une page /minigame chargée à la demande ; Phaser (1,4 Mo) n'entre jamais dans le démarrage", () => {
    expect(APP).toContain('<Route path="/minigame" component={MiniGamePage} />');
    expect(APP).toContain('lazyPage(() => import("./pages/minigame"))');
    expect(GAME).toContain('import("phaser")');
    expect(GAME).toMatch(/^import type PhaserNS from "phaser";$/m);
    expect(GAME_PAGE).toContain('safeLazy(() => import("@/components/MiniGame"))');
    expect(GAME_PAGE + APP + DASH).not.toMatch(/^import (?!type).* from "phaser"/m);
  });

  test("Phaser dessine et dit où l'on touche ; les règles et les textes restent hors de lui", () => {
    expect(GAME).toContain("zoneAt(p.worldX, p.worldY)");
    expect(GAME).not.toMatch(/pointsFor|medalFor|buildRounds/);
    expect(GAME_PAGE).toContain("answer(s, correct, Date.now() - askedAt.current)");
  });

  test("jouable sans la souris : touches 1–6, Entrée, et un bouton par zone", () => {
    expect(GAME_PAGE).toContain('window.addEventListener("keydown", onKey)');
    expect(GAME_PAGE).toContain("data-testid={`zone-${z.n}`}");
    expect(GAME_PAGE).toContain('aria-live="assertive"');
  });

  test("le jeu est détruit en quittant la page (pas de boucle de rendu qui continue)", () => {
    expect(GAME).toContain("game?.destroy(true)");
  });

  test("lancé depuis le Dashboard, et depuis l'Explorateur", () => {
    expect(DASH).toContain('{ to: "/minigame", icon: Gamepad2, key: "nav.minigame" }');
    expect(DASH).toContain('{ to: "/explorer", icon: Box, key: "nav.explorer" }');
    expect(read("../src/web/pages/explorer.tsx")).toContain('to="/minigame"');
  });

  test("textes : complets en de/en/fr/es, libellé de navigation dans les douze langues", () => {
    const keys = (lang: string) => {
      const src = read(`../src/web/i18n/messages/${lang}.ts`);
      const start = src.indexOf("\n  minigame: {");
      return [...src.slice(start, src.indexOf("\n  },", start)).matchAll(/\n {4,6}(\w+): ["{]/g)].map((m) => m[1]);
    };
    const de = keys("de");
    expect(de).toContain("gold");
    for (const lang of ["en", "fr", "es"]) expect(keys(lang)).toEqual(de);
    for (const lang of ["ar", "bn", "de", "en", "es", "fr", "hi", "it", "ja", "pt", "ru", "zh"]) expect(read(`../src/web/i18n/messages/${lang}.ts`)).toMatch(/\n {4}minigame: ".+",\n/);
  });
});

describe("cartes qui se retournent, sur le Dashboard", () => {
  test("la section est sur le Dashboard", () => {
    expect(DASH).toContain("<FlipDeck />");
  });

  test("retournement en 3D : perspective, rotation en Y, verso caché", () => {
    expect(DECK).toContain("[perspective:1200px]");
    expect(DECK).toContain("animate={{ rotateY: flipped ? 180 : 0 }}");
    expect(DECK).toContain("[transform-style:preserve-3d]");
    expect(DECK).toContain("[backface-visibility:hidden]");
  });

  test("un vrai bouton (clavier), qui dit son état ; mouvement réduit : pas d'animation", () => {
    expect(DECK).toContain("aria-pressed={flipped}");
    expect(DECK).toContain("reduced ? { duration: 0 }");
  });

  test("les cartes de l'étudiant restent à un clic", () => {
    expect(DECK).toContain('to="/flashcards"');
  });
});

describe("transitions et ressorts", () => {
  test("chaque page arrive en fondu-glissé sur un ressort — sauf le Hörsaal, et jamais en mouvement réduit", () => {
    expect(APP).toContain("<PageTransition location={location}>");
    expect(TRANSITION).toContain('type: "spring"');
    expect(TRANSITION).toContain('if (reduced || location.startsWith("/chat")) return <>{children}</>;');
    expect(TRANSITION).toContain("key={location}");
  });

  test("entrée seulement : aucune animation de sortie ne retarde la navigation", () => {
    expect(TRANSITION).not.toMatch(/exit=|AnimatePresence/);
  });

  test("tous les boutons : un appui qui s'enfonce et revient sur une courbe de ressort, si le mouvement est permis", () => {
    expect(BUTTON).toContain("motion-safe:active:scale-[0.96]");
    expect(BUTTON).toContain("motion-safe:[transition-timing-function:var(--ease-spring)]");
    expect(CSS).toMatch(/--ease-spring: linear\(/);
  });
});
