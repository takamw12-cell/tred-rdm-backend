import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PATIENCE_MS, patienceKey } from "../src/web/lib/patience";

/**
 * Dix secondes sans un mot au tableau (2026-11-15).
 *
 * La pastille du haut nomme déjà l'étape (« TRED analysiert deine Frage … »,
 * « Ich suche in deinen Dokumenten … »). Mais une question avec pièce jointe
 * ou un calcul peut attendre 15, 30, 50 secondes avant sa première ligne
 * (journaux [perf] de production) : à dix secondes, l'étudiant d'un
 * téléphone a déjà fermé l'onglet — c'est ce qu'on a vu le 15 novembre.
 * Le tableau lui dit alors, à la place de la réponse, que le tuteur lit.
 */

describe("quelle phrase : ce que le tuteur est VRAIMENT en train de lire", () => {
  test("le délai : dix secondes", () => {
    expect(PATIENCE_MS).toBe(10_000);
  });

  test("un fichier joint à la question → « Je lis ta pièce jointe »", () => {
    expect(patienceKey({ attachment: true, documents: true })).toBe("chat.patienceAttachment");
    expect(patienceKey({ attachment: true, documents: false })).toBe("chat.patienceAttachment");
  });

  test("des documents dans la portée (document, module ou semestre) → « Je lis ton cours »", () => {
    expect(patienceKey({ attachment: false, documents: true })).toBe("chat.patienceReading");
  });

  test("aucun document : pas de « je lis ton cours » à quelqu'un qui n'en a pas", () => {
    expect(patienceKey({ attachment: false, documents: false })).toBe("chat.patienceGeneric");
  });
});

describe("branchement", () => {
  const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8");
  const BOARD = read("../src/web/components/tafel-board.tsx");
  const PAGE = read("../src/web/pages/chat.tsx");

  test("le compte part avec la place de la réponse et s'arrête avec elle (premier mot, ou départ)", () => {
    expect(BOARD).toContain("setTimeout(() => setLate(true), PATIENCE_MS)");
    expect(BOARD).toContain("return () => clearTimeout(timer)");
    expect(BOARD).toContain("{writing && blocks.length === 0 && <WritingPlaceholder patience={patience} />}");
  });

  test("la phrase est annoncée aux lecteurs d'écran (<output>) et repérable", () => {
    expect(BOARD).toMatch(/<output[^>]*data-testid="board-patience"/);
  });

  test("la page choisit la phrase d'après la question en cours", () => {
    expect(PAGE).toContain("patience={t(patienceKey({ attachment: questionHasFiles, documents: scopeHasDocs }))}");
  });

  test("les trois phrases existent dans les douze langues", () => {
    for (const lang of ["ar", "bn", "de", "en", "es", "fr", "hi", "it", "ja", "pt", "ru", "zh"]) {
      const src = read(`../src/web/i18n/messages/${lang}.ts`);
      for (const key of ["patienceReading", "patienceAttachment", "patienceGeneric"]) expect(src).toContain(`    ${key}: "`);
    }
  });

  test("le texte demandé, en français et en allemand", () => {
    expect(read("../src/web/i18n/messages/fr.ts")).toContain('patienceReading: "Je lis ton cours, encore un instant …"');
    expect(read("../src/web/i18n/messages/de.ts")).toContain('patienceReading: "Ich lese dein Skript, noch einen Moment …"');
  });
});
