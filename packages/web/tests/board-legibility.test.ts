import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrastRatio } from "../src/web/lib/chart-ink";

/**
 * Lisibilité sur les tableaux vert et sombre (2026-11-15).
 *
 * L'audit de contraste du 15 nov. n'avait tourné qu'avec le tableau blanc, et
 * ne faisait pas défiler le tableau : tout ce qui se trouvait sous sa première
 * hauteur n'était pas mesuré. Relancé sur les tableaux vert et sombre, avec
 * une réponse complète (termes du dictionnaire, code, lien, liste, citation,
 * étapes de calcul, QCM) et le défilement interne : 206 textes mesurés par
 * tableau, une seule famille en défaut — les termes du dictionnaire.
 *
 * Leur bouton portait `text-primary`, la couleur du THÈME de l'app : encre
 * noire en thème clair (2,2:1 sur le vert, 1,2:1 sur le sombre), jaune en
 * thème sombre (3,1:1 dans un choix du tableau vert).
 */

const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8");
const STYLES = read("../src/web/styles.css");
const TERM = read("../src/web/components/dictionary-tooltip.tsx");

// Fonds relevés sur le rendu réel (pixels sous le texte).
const GREEN = { board: "#3A5745", choice: "#52685B", ink: "#F5F1E6" };
const DARK = { board: "#1F2A40", choice: "#2A3142", ink: "#F8FAFC" };

describe("la rangée du haut du tableau vert : badge du document, compteur de pages, état", () => {
  // Fond relevé sous ces pastilles, là où l'ardoise est la plus claire (voile de craie).
  const PILL = "#516B5A";
  const BOARD = read("../src/web/components/tafel-board.tsx");

  test("le défaut mesuré : le gris du tableau vert n'y tient pas (« Kurs: » 3,7:1, « 2 / 2 » 4,1:1)", () => {
    expect(contrastRatio("#C3D1C6", PILL)).toBeLessThan(4.5);
  });

  test("le badge du document s'écrit à la craie : libellé ET titre", () => {
    const badge = BOARD.slice(BOARD.indexOf("export function BoardScope("), BOARD.indexOf("/** Tableau vide"));
    // Plus de gris sur la pastille : la couleur vient de l'encre du tableau.
    expect(badge).not.toContain("text-[color:var(--board-muted)]");
    expect(badge).toMatch(/data-testid="board-scope"[\s\S]*?style=\{\{ color: INK \}\}/);
    expect(contrastRatio(GREEN.ink, PILL)).toBeGreaterThanOrEqual(4.5);
  });

  test("dans cette rangée, le gris du tableau vert est éclairci (compteur de pages, « TRED schreibt … »)", () => {
    const rule = /\[data-board-theme="green"\] \[data-slot="tafel-status"\] \{\s*--board-muted: (#[0-9a-f]{6});/.exec(STYLES);
    expect(rule).not.toBeNull();
    expect(contrastRatio(rule![1]!, PILL)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("termes du dictionnaire sur les tableaux vert et sombre", () => {
  test("le défaut mesuré : la couleur du thème de l'app n'y tient pas", () => {
    expect(contrastRatio("#1A1A1A", GREEN.board)).toBeLessThan(3); // thème clair, tableau vert
    expect(contrastRatio("#1A1A1A", DARK.board)).toBeLessThan(1.5); // thème clair, tableau sombre
    expect(contrastRatio("#EAB308", GREEN.choice)).toBeLessThan(4.5); // thème sombre, choix du tableau vert
  });

  test("la craie du tableau, elle, tient 4,5:1 partout — y compris dans les choix d'un QCM", () => {
    for (const bg of [GREEN.board, GREEN.choice]) expect(contrastRatio(GREEN.ink, bg)).toBeGreaterThanOrEqual(4.5);
    for (const bg of [DARK.board, DARK.choice]) expect(contrastRatio(DARK.ink, bg)).toBeGreaterThanOrEqual(4.5);
  });

  test("ces valeurs sont bien celles de la feuille de style", () => {
    expect(STYLES).toMatch(/\[data-board-theme="green"\] \{[^}]*--board-ink: #f5f1e6;/s);
    expect(STYLES).toMatch(/\[data-board-theme="dark"\] \{[^}]*--board-ink: #f8fafc;/s);
  });

  test("le terme porte un repère, et suit la craie du tableau ; son pointillé prend l'accent", () => {
    expect(TERM).toContain('data-slot="dict-term"');
    const rule = /:is\(\[data-board-theme="green"\], \[data-board-theme="dark"\]\) \[data-slot="tafel-board"\] \[data-slot="dict-term"\] \{([^}]*)\}/.exec(STYLES);
    expect(rule).not.toBeNull();
    expect(rule![1]).toContain("color: var(--board-ink)");
    expect(rule![1]).toContain("text-decoration-color: var(--board-accent)");
  });

  test("sur un post-it (papier clair sur tous les fonds), le terme garde l'encre sombre", () => {
    const postit = /\[data-slot="tafel-board"\] \[data-slot="tafel-postit"\] :is\(([^)]*)\) \{\s*color: #1a1a1a;/.exec(STYLES);
    expect(postit).not.toBeNull();
    expect(postit![1]).toContain('[data-slot="dict-term"]');
    // La règle des post-its vient APRÈS celle du tableau : à égalité de poids, c'est elle qui l'emporte.
    expect(STYLES.indexOf('[data-slot="tafel-postit"] :is(')).toBeGreaterThan(STYLES.indexOf('[data-slot="tafel-board"] [data-slot="dict-term"] {'));
  });

  test("le tableau blanc n'est pas touché : la règle ne vise que le vert et le sombre", () => {
    expect(STYLES).not.toMatch(/^\[data-slot="tafel-board"\] \[data-slot="dict-term"\] \{/m);
    expect(STYLES).not.toMatch(/\[data-board-theme="white"\][^{]*\[data-slot="dict-term"\]/);
  });
});
