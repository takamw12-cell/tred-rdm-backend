import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";

import { renderTikz } from "../src/api/lib/tikz";

/**
 * La chaîne de compilation des schémas, testée de bout en bout.
 *
 * ── Pourquoi ces tests se sautent au lieu d'échouer ───────────────────────
 *
 * Ils ont besoin de pdflatex, circuitikz et mutool. L'image de déploiement les
 * porte (voir le Dockerfile, qui le vérifie à la construction), mais une
 * machine de développement sous Windows, non. Faire échouer la suite entière
 * là-bas rendrait `bun test` inutilisable — et une suite qu'on n'exécute plus
 * ne protège plus rien.
 *
 * Ils s'exécutent donc là où la chaîne existe, c'est-à-dire dans l'image, et
 * se taisent ailleurs.
 */

function disponible(cmd: string): boolean {
  try {
    execFileSync("which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const CHAINE = disponible("pdflatex") && disponible("dvisvgm");

describe.skipIf(!CHAINE)("un vrai schéma électrique", () => {
  test("un diviseur de tension devient du SVG", async () => {
    const r = await renderTikz(String.raw`
      \begin{circuitikz}[scale=1.1, transform shape]
        \draw (0,0) to[V=$U_q$] (0,3)
                 to[R=$R_1$, i>^=$I$] (3,3)
                 to[R=$R_2$, v=$U_2$] (3,0) -- (0,0);
        \draw (3,0) node[ground]{};
      \end{circuitikz}
    `);

    expect("error" in r ? r.error : "").toBe("");
    if ("error" in r) return;
    expect(r.svg).toContain("<svg");
    // Un SVG vide fait quelques centaines d'octets ; un schéma dessiné en fait
    // plusieurs milliers. C'est la différence entre « ça a compilé » et « il y
    // a quelque chose dessus ».
    expect(r.svg.length).toBeGreaterThan(3000);
  }, 60_000);

  test("un amplificateur opérationnel aussi", async () => {
    // Le cas qui justifie tout ce travail : dessiné à la main en SVG par un
    // modèle, un ampli op est de travers. Ici, il est composé.
    const r = await renderTikz(String.raw`
      \begin{circuitikz}
        \draw (0,0) node[op amp] (OA) {}
          (OA.-) -- ++(-1,0) to[R=$R_1$] ++(-2,0)
          (OA.+) -- ++(-0.5,0) node[ground]{};
      \end{circuitikz}
    `);
    expect("error" in r).toBe(false);
  }, 60_000);

  test("le cache renvoie le même SVG sans recompiler", async () => {
    const code = String.raw`\begin{circuitikz} \draw (0,0) to[R=$R$] (2,0); \end{circuitikz}`;
    const a = await renderTikz(code);
    const debut = Date.now();
    const b = await renderTikz(code);
    expect("error" in a).toBe(false);
    expect("error" in b).toBe(false);
    if ("error" in a || "error" in b) return;
    expect(b.svg).toBe(a.svg);
    // Une compilation prend des centaines de millisecondes ; une lecture de
    // cache, quelques-unes. Sans cache, chaque relecture d'une conversation
    // relancerait pdflatex.
    expect(Date.now() - debut).toBeLessThan(200);
  }, 60_000);
});

describe("les garde-fous, qui n'ont besoin d'aucun LaTeX", () => {
  test("un code vide est refusé", async () => {
    const r = await renderTikz("   ");
    expect("error" in r).toBe(true);
  });

  test("une primitive qui touche au système est refusée", async () => {
    // Le code TikZ vient du modèle, qui a lu des documents téléversés par des
    // étudiants. Un document peut contenir une instruction déguisée.
    for (const attaque of [
      String.raw`\write18{rm -rf /}`,
      String.raw`\input{/etc/passwd}`,
      String.raw`\openout1=/tmp/x`,
      String.raw`\directlua{os.execute("id")}`,
    ]) {
      const r = await renderTikz(attaque);
      expect("error" in r ? r.error : "").toBe("forbidden LaTeX primitive");
    }
  });
});
