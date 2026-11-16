import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

process.env.DATABASE_URL ??= "file::memory:";
const { BETA_DOCUMENTS, documentRoom, LIMITS } = await import("../src/api/lib/plan");
const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8");

/** Limite de documents : personne ne doit la rencontrer pendant la bêta (décision du fondateur, 2026-11-16). */
describe("quota de documents", () => {
  test("bêta, essai et fondateur : 10 000 documents", () => {
    expect(BETA_DOCUMENTS).toBe(10_000);
    for (const plan of ["beta", "trial", "founder"] as const) expect(LIMITS[plan].documents).toBe(10_000);
  });

  test("un compte bêta avec 10 documents peut en importer 5 de plus, sans erreur", () => {
    for (let used = 10; used < 15; used++) expect(documentRoom("beta", used).ok).toBe(true);
  });

  test("l'ancien plafond de 200 ne bloque plus ; le fondateur passe aussi", () => {
    expect(documentRoom("beta", 200).ok).toBe(true);
    expect(documentRoom("founder", 5_000).ok).toBe(true);
    expect(documentRoom("beta", 10_000).ok).toBe(false);
  });

  test("seuls les documents ENREGISTRÉS comptent : un import en erreur n'en crée aucun", () => {
    const plan = read("../src/api/lib/plan.ts");
    // Le compteur est le nombre de lignes de la table des documents du compte…
    expect(plan).toMatch(/count\(\*\)[\s\S]{0,120}\.from\(document\)[\s\S]{0,80}eq\(document\.userId, userId\)/);
    // … et le worker n'insère la ligne qu'APRÈS l'extraction et ses refus (format, sans texte, fichier abîmé).
    const job = read("../src/api/lib/queue/import-job.ts");
    const insert = job.indexOf(".insert(document)");
    expect(insert).toBeGreaterThan(0);
    for (const refusal of ['"extraction_failed"', '"no_text"']) expect(job.indexOf(refusal)).toBeLessThan(insert);
    expect(job.indexOf("canAddDocument(d.userId)")).toBeLessThan(insert);
  });

  test("bêta et fondateur : pas de bouton « Abo » dans la barre latérale", () => {
    expect(read("../src/web/components/sidebar.tsx")).toContain('{plan !== "beta" && plan !== "founder" && (');
  });
});
