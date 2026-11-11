import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { de } from "../src/web/i18n/messages/de";
import { en } from "../src/web/i18n/messages/en";
import { fr } from "../src/web/i18n/messages/fr";
import { es } from "../src/web/i18n/messages/es";
import { ROUTES } from "../scripts/seo-routes.mjs";

/**
 * Règles du fondateur pour la page d'accueil (11 nov. 2026) : aucun prix,
 * aucune comparaison avec un autre assistant, jamais « RDM ».
 */
const page = readFileSync(join(import.meta.dir, "../src/web/pages/landing.tsx"), "utf8");
// Le code seul : les commentaires expliquent les règles et peuvent nommer ce qui est interdit.
const code = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const packs = { de, en, fr, es } as Record<string, { landing?: Record<string, string> }>;
const seo = (ROUTES as { path: string; title: string; description: string }[]).filter((r) => r.path === "/" || r.path === "/landing");

const texts = [
  code,
  ...Object.values(packs).flatMap((p) => Object.values(p.landing ?? {})),
  ...seo.flatMap((r) => [r.title, r.description]),
];

describe("page d'accueil — vocabulaire", () => {
  test("jamais « RDM »", () => {
    for (const t of texts) expect(t).not.toMatch(/\bRDM\b/);
  });
  test("aucune comparaison avec un autre assistant", () => {
    for (const t of texts) expect(t).not.toMatch(/ChatGPT|GPT-?\d|Gemini|Copilot|Claude|Perplexity/i);
  });
  test("la mécanique s'appelle Technische Mechanik (DE) ou Engineering Mechanics (EN, FR)", () => {
    expect(de.landing.f2Text).toContain("Technische Mechanik");
    expect(en.landing.f2Text).toContain("Engineering Mechanics");
    expect(fr.landing.f2Text).toContain("Engineering Mechanics");
  });
});

describe("page d'accueil — aucun prix", () => {
  test("ni montant, ni devise, ni abonnement", () => {
    for (const t of texts) {
      expect(t).not.toMatch(/\d+[.,]\d{2}\s?€|€\s?\d|\/\s?(mois|Monat|month)\b/i);
      expect(t).not.toMatch(/\bPro\b.*(€|mois|Monat)/i);
    }
  });
  test("plus de paiement ni de tarif Stripe dans la page", () => {
    expect(code).not.toMatch(/createCheckout|subscriptionMeOptions|WithdrawalConsent|FALLBACK_PRICE/);
  });
});

describe("page d'accueil — contenu", () => {
  test("les deux boutons du hero : essai gratuit et connexion", () => {
    expect(de.landing.cta).toBe("Kostenlos testen");
    expect(de.landing.login).toBe("Anmelden");
    expect(code).toContain('t("landing.cta")');
    expect(code).toContain('t("landing.login")');
  });
  test("l'en-tête reste collé en haut, avec le bouton d'inscription", () => {
    expect(code).toMatch(/<header className="sticky top-0/);
  });
  test("les quatre langues complètes ont les mêmes textes", () => {
    const keys = Object.keys(de.landing).sort();
    for (const [lang, pack] of Object.entries(packs)) expect([lang, Object.keys(pack.landing ?? {}).sort()]).toEqual([lang, keys]);
  });
  test("aucun témoignage ni nombre d'utilisateurs inventé", () => {
    for (const t of texts) expect(t).not.toMatch(/\d[\d .]*\s?(Studierende|students|étudiants|estudiantes)|tausende|thousands|milliers/i);
  });
});
