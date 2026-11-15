import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BATCH_MAX_FILES, checkSelection } from "../src/web/lib/import-batch";

/**
 * Deux retours qui manquaient (2026-11-15).
 *
 * 1. Le bouton d'envoi. Pendant que le tuteur réfléchit il était désactivé,
 *    mais gardait son avion en papier, à moitié transparent : rien ne disait
 *    « c'est parti ». Sur téléphone, on a vu des clics répétés sur /chat
 *    (« rage clicks » de l'analyse). Il tourne maintenant, et le dit aux
 *    lecteurs d'écran avec l'étape en cours.
 *
 * 2. Plus de cinq fichiers d'un coup. Le lot entier est refusé AVANT l'envoi ;
 *    le message disait « 5 fichiers au plus à la fois », sans dire que rien
 *    n'était parti ni quoi faire.
 */

const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8");

describe("le bouton d'envoi pendant que le tuteur travaille", () => {
  const PAGE = read("../src/web/pages/chat.tsx");
  const button = PAGE.slice(PAGE.indexOf('data-testid="send-button"') - 700, PAGE.indexOf('data-testid="send-button"') + 500);

  test("désactivé tant que la réponse est en cours (un second envoi ne part pas)", () => {
    expect(button).toContain("disabled={(!input.trim() && attachments.length === 0) || busy}");
    expect(PAGE).toMatch(/function send\(text: string\) \{\n\s+const q = text\.trim\(\);\n\s+if \(busy\) return;/);
  });

  test("un cercle qui tourne à la place de l'avion en papier", () => {
    expect(button).toContain('{busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}');
  });

  test("annoncé : aria-busy, et le libellé dit l'étape en cours au lieu de « Senden »", () => {
    expect(button).toContain("aria-busy={busy}");
    expect(button).toContain('aria-label={busy ? busyLabel : t("common.send")}');
    expect(PAGE).toContain('const busyLabel = waitingForText ? t(PHASE_KEY[phase]) : t("tafel.writing");');
  });
});

describe("plus de cinq fichiers d'un coup", () => {
  const LIBRARY = read("../src/web/components/document-library.tsx");

  test("la règle : cinq passent, six sont refusés en bloc, avant tout envoi", () => {
    expect(BATCH_MAX_FILES).toBe(5);
    expect(checkSelection(Array.from({ length: 5 }, () => ({ size: 10 })))).toBeNull();
    expect(checkSelection(Array.from({ length: 6 }, () => ({ size: 10 })))).toBe("too_many_files");
  });

  test("le message dit la limite, que rien n'est parti, et quoi faire — dans les douze langues", () => {
    const opening: Record<string, string> = {
      fr: "Maximum 5 fichiers par lot.",
      de: "Maximal 5 Dateien pro Stapel.",
      en: "Maximum 5 files per batch.",
      es: "Máximo 5 archivos por lote.",
    };
    for (const lang of ["ar", "bn", "de", "en", "es", "fr", "hi", "it", "ja", "pt", "ru", "zh"]) {
      const line = read(`../src/web/i18n/messages/${lang}.ts`).split("\n").find((l) => l.startsWith("    tooManyFiles: "));
      expect(line).toBeDefined();
      // Deux phrases au moins : la limite, puis la suite.
      expect(line!.length).toBeGreaterThan(40);
      if (opening[lang]) expect(line).toContain(`tooManyFiles: "${opening[lang]}`);
    }
  });

  test("le refus est annoncé (role=alert) et repérable", () => {
    expect(LIBRARY).toMatch(/<p role="alert" data-testid="upload-error"[^>]*>\{uploadError\}<\/p>/);
  });
});
