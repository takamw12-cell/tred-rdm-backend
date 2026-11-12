/**
 * Chantier « monétisation » du 12 nov. 2026 : la grille tarifaire, l'essai de
 * 14 jours et le coût des crédits. Ce sont des règles d'argent : chacune est
 * vérifiée ici, pas seulement à l'écran.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { readFileSync } from "node:fs";
import { join } from "node:path";

process.env.DATABASE_URL ??= "file::memory:";
const { CREDIT_COST, LIMITS, PRICING, TOKEN_CAPS, UNLIMITED_PLANS, betaFree, effectivePlan, quotaError } = await import("../src/api/lib/plan");
const { TRIAL_DAYS, readTrial, startTrial, trialState } = await import("../src/api/lib/trial");
import type { TrialDb } from "../src/api/lib/trial";
import { formatMoney, pricingCopy, resolvePrices } from "../src/web/lib/pricing-copy";
import { readPaywallBody } from "../src/web/lib/paywall";

const DAY = 24 * 60 * 60 * 1000;
const lire = (f: string) => readFileSync(join(import.meta.dir, "..", "src", f), "utf8");

describe("la grille tarifaire décidée", () => {
  test("Free : 50 chats, 5 vidéos, 10 exercices par mois", () => {
    expect(LIMITS.free.chat).toBe(50);
    expect(LIMITS.free.video).toBe(5);
    expect(LIMITS.free.exercise).toBe(10);
  });

  test("Étudiant : 1000 chats, 50 vidéos, 200 exercices par mois", () => {
    for (const plan of ["premium", "standard", "founder"] as const) {
      expect(LIMITS[plan].chat).toBe(1000);
      expect(LIMITS[plan].video).toBe(50);
      expect(LIMITS[plan].exercise).toBe(200);
    }
  });

  test("14,99 € par mois ; 59,99 € pour 6 mois, soit 9,99 € par mois, badge -30%", () => {
    expect(PRICING.monthly).toEqual({ amount: 1499, months: 1 });
    expect(PRICING.semester).toEqual({ amount: 5999, months: 6, badge: "-30%" });
    const p = resolvePrices(PRICING, []);
    expect(p.semester.perMonth).toBe(999);
    expect(formatMoney(p.semester.perMonth, "EUR", "de").replace(/\s/g, " ")).toBe("9,99 €");
    expect(formatMoney(p.monthly.amount, "EUR", "de").replace(/\s/g, " ")).toBe("14,99 €");
    // Le badge ne promet pas plus que la vraie économie (33 %).
    const economie = 1 - PRICING.semester.amount / (PRICING.monthly.amount * 6);
    expect(economie).toBeGreaterThanOrEqual(0.3);
  });

  test("crédits : 5 € = 50 crédits = 50 chats ou 5 vidéos", () => {
    expect(PRICING.creditPack).toEqual({ amount: 500, credits: 50 });
    expect(PRICING.creditPack.credits / CREDIT_COST.chat).toBe(50);
    expect(PRICING.creditPack.credits / CREDIT_COST.video).toBe(5);
  });

  test("les prix Stripe configurés priment sur la grille à l'affichage", () => {
    const p = resolvePrices(PRICING, [
      { interval: "monthly", priceId: "price_m", amount: 1599, currency: "EUR", months: 1 },
      { interval: "semester", priceId: "price_s", amount: 6600, currency: "EUR", months: 6 },
    ]);
    expect(p.monthly).toEqual({ amount: 1599, priceId: "price_m" });
    expect(p.semester.perMonth).toBe(1100);
    expect(p.semester.priceId).toBe("price_s");
  });

  test("aucun montant n'est écrit en dur dans la page ni dans les textes", () => {
    for (const f of ["web/pages/pricing.tsx", "web/lib/pricing-copy.ts", "web/components/SmartPaywallModal.tsx"]) {
      expect(/\d+[,.]\d{2}\s?€|€\s?\d/.test(lire(f))).toBe(false);
    }
  });
});

describe("le tarif effectif (recalculé à chaque requête)", () => {
  const now = Date.UTC(2026, 10, 12);

  test("essai en cours : trial", () => {
    expect(effectivePlan({ trialEndsAt: now + DAY, now })).toBe("trial");
  });

  test("essai terminé : le compte est Free, sans rien écrire en base", () => {
    expect(effectivePlan({ trialEndsAt: now - 1, now })).toBe("free");
    expect(effectivePlan({ trialEndsAt: now, now })).toBe("free");
  });

  test("jamais d'essai : Free", () => {
    expect(effectivePlan({ trialEndsAt: null, now })).toBe("free");
    expect(effectivePlan({ now })).toBe("free");
  });

  test("un abonnement payé gagne sur l'essai", () => {
    expect(effectivePlan({ storedPlan: "premium", validUntil: new Date(now + DAY), trialEndsAt: now + DAY, now })).toBe("premium");
  });

  test("abonnement expiré : retour à l'essai s'il court encore, sinon Free", () => {
    const expire = new Date(now - DAY);
    expect(effectivePlan({ storedPlan: "premium", validUntil: expire, trialEndsAt: now + DAY, now })).toBe("trial");
    expect(effectivePlan({ storedPlan: "premium", validUntil: expire, now })).toBe("free");
  });

  test('"trial" ne peut pas être stocké pour ouvrir des droits', () => {
    expect(effectivePlan({ storedPlan: "trial", now })).toBe("free");
    expect(effectivePlan({ storedPlan: "n'importe quoi", now })).toBe("free");
  });

  test("l'essai est présenté illimité, mais garde un plafond de tokens", () => {
    expect(UNLIMITED_PLANS.has("trial")).toBe(true);
    expect(LIMITS.trial.chat).toBeGreaterThan(LIMITS.premium.chat);
    expect(LIMITS.trial.video).toBeGreaterThan(LIMITS.premium.video);
    expect(TOKEN_CAPS.trial).not.toBeNull();
  });
});

describe("l'essai : 14 jours, une seule fois", () => {
  const now = Date.UTC(2026, 10, 12, 10);

  test("jours restants arrondis vers le haut", () => {
    expect(trialState(now + 14 * DAY, now)).toMatchObject({ active: true, daysLeft: 14, available: false });
    expect(trialState(now + 60_000, now)).toMatchObject({ active: true, daysLeft: 1 });
    expect(trialState(now - 1, now)).toMatchObject({ active: false, daysLeft: 0, available: false });
    expect(trialState(null, now)).toMatchObject({ active: false, available: true });
    expect(trialState(null, now, false)).toMatchObject({ migrated: false, available: false });
  });

  let client: Client;
  let db: TrialDb;
  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    db = drizzle(client) as unknown as TrialDb;
  });

  const table = (avecColonne: boolean) =>
    client.execute(
      `CREATE TABLE user_access (user_id text PRIMARY KEY, is_active integer DEFAULT 1 NOT NULL, role text DEFAULT 'user' NOT NULL,
        locale text DEFAULT 'de' NOT NULL, learning_style text DEFAULT 'interactive' NOT NULL, professor_id text DEFAULT 'genius' NOT NULL,
        updated_at integer NOT NULL${avecColonne ? ", trial_ends_at integer" : ""})`,
    );

  test("premier lancement : 14 jours, même sans ligne user_access", async () => {
    await table(true);
    const r = await startTrial(db, "u-1", now);
    expect(r.started).toBe(true);
    expect(r.active).toBe(true);
    expect(r.endsAt).toBe(now + TRIAL_DAYS * DAY);
    expect(r.daysLeft).toBe(14);
  });

  test("second lancement refusé : pendant l'essai, et un an après", async () => {
    await table(true);
    await startTrial(db, "u-1", now);
    const pendant = await startTrial(db, "u-1", now + DAY);
    expect(pendant.started).toBe(false);
    expect(pendant.endsAt).toBe(now + TRIAL_DAYS * DAY);
    const apres = await startTrial(db, "u-1", now + 365 * DAY);
    expect(apres.started).toBe(false);
    expect(apres.active).toBe(false);
    expect(apres.available).toBe(false);
  });

  test("l'essai d'un compte ne touche pas les autres", async () => {
    await table(true);
    await startTrial(db, "u-1", now);
    expect((await readTrial(db, "u-2", now)).available).toBe(true);
  });

  test("migration pas encore lancée : pas d'essai, et rien ne casse", async () => {
    await table(false);
    expect(await readTrial(db, "u-1", now)).toMatchObject({ migrated: false, active: false, available: false });
    expect(await startTrial(db, "u-1", now)).toMatchObject({ migrated: false, started: false });
  });

  test("un nouveau compte commence son essai à l'inscription", () => {
    const auth = lire("api/auth.ts");
    expect(auth).toContain("startTrial(db as unknown as TrialDb, user.id)");
    // La colonne n'est PAS dans le schéma Drizzle (déploiement avant migration).
    expect(lire("api/database/schema.ts")).not.toContain("trial_ends_at");
  });
});

describe("le 402 dit quel compteur est atteint", () => {
  test("vidéo : compteur, coût en crédits, pas de pub d'un crédit pour une action à 10", () => {
    const body = quotaError({ ok: false, plan: "free", used: 5, limit: 5, source: "quota", creditsRemaining: 3, metric: "video" });
    expect(body.metric).toBe("video");
    expect(body.creditCost).toBe(10);
    expect(body.rewardedAd).toBeNull();
    expect(body.error).toBe("QUOTA_EXCEEDED");
  });

  test("documents : pas payable en crédits", () => {
    const body = quotaError({ ok: false, plan: "free", used: 10, limit: 10 });
    expect(body.metric).toBe("documents");
    expect(body.creditCost).toBeNull();
  });

  test("le client relit ce corps, avec un repli sur la surface appelante", () => {
    const info = readPaywallBody({ metric: "video", plan: "free", used: 5, limit: 5, creditCost: 10, rewardedAd: null }, "chat");
    expect(info).toEqual({ metric: "video", plan: "free", used: 5, limit: 5, creditCost: 10, rewardedAd: null });
    expect(readPaywallBody({ error: "TOKEN_CAP_REACHED" }, "exercise").metric).toBe("exercise");
    expect(readPaywallBody(null, "formulas").metric).toBe("formulas");
  });

  test("chaque surface facturable ouvre la fenêtre de limite", () => {
    expect(lire("web/lib/explainer-video.ts")).toContain('readPaywallBody(body, "video")');
    expect(lire("web/lib/exercise-api.ts")).toContain('paywallFromResponse(res, "exercise")');
    expect(lire("web/pages/formulas.tsx")).toContain('paywallFromResponse(res, "formulas")');
    expect(lire("web/components/document-library.tsx")).toContain('paywallFromResponse(res, "documents")');
    expect(lire("web/components/layout.tsx")).toContain("<PaywallHost />");
    expect(lire("web/components/layout.tsx")).toContain("<TrialBanner />");
  });
});

describe("les textes", () => {
  test("bandeau : « Il te reste X jours d'essai »", () => {
    expect(pricingCopy("fr").trialBanner(9)).toBe("Il te reste 9 jours d'essai");
    expect(pricingCopy("fr").trialBanner(1)).toBe("Il te reste 1 jour d'essai");
    expect(pricingCopy("de").trialBanner(9)).toBe("Dir bleiben noch 9 Testtage");
    expect(pricingCopy("ja").trialBanner(2)).toBe("You have 2 trial days left");
  });

  test("la fenêtre nomme le compteur atteint", () => {
    expect(pricingCopy("fr").wallTitle("video")).toContain("vidéos");
    expect(pricingCopy("de").wallUsed(5, 5, "video")).toBe("5 / 5 Videos");
  });
});

describe("mode bêta : 100 % gratuit, aucun paiement", () => {
  test("par défaut la facturation est coupée ; BILLING_ENABLED=true la rouvre", () => {
    const avant = process.env.BILLING_ENABLED;
    delete process.env.BILLING_ENABLED;
    expect(betaFree()).toBe(true);
    process.env.BILLING_ENABLED = "false";
    expect(betaFree()).toBe(true);
    process.env.BILLING_ENABLED = "true";
    expect(betaFree()).toBe(false);
    if (avant === undefined) delete process.env.BILLING_ENABLED;
    else process.env.BILLING_ENABLED = avant;
  });

  test("en bêta, tout compte non abonné est « beta », essai ou non", () => {
    const now = Date.UTC(2026, 10, 12);
    expect(effectivePlan({ beta: true, now })).toBe("beta");
    expect(effectivePlan({ beta: true, trialEndsAt: now - 1, now })).toBe("beta");
    expect(effectivePlan({ beta: true, trialEndsAt: now + DAY, now })).toBe("beta");
    expect(effectivePlan({ beta: true, storedPlan: "premium", validUntil: new Date(now - DAY), now })).toBe("beta");
    // Un abonné ou un fondateur garde son tarif.
    expect(effectivePlan({ beta: true, storedPlan: "founder", now })).toBe("founder");
  });

  test("les compteurs de la bêta sont illimités en pratique, avec un plafond de sécurité", () => {
    expect(UNLIMITED_PLANS.has("beta")).toBe(true);
    expect(LIMITS.beta.chat).toBeGreaterThanOrEqual(LIMITS.premium.chat);
    expect(LIMITS.beta.video).toBeGreaterThanOrEqual(LIMITS.premium.video);
    expect(LIMITS.beta.exercise).toBeGreaterThanOrEqual(LIMITS.premium.exercise);
    expect(TOKEN_CAPS.beta).not.toBeNull();
  });

  test("aucun paiement ni essai ne peut démarrer, même par appel direct", () => {
    const subs = lire("api/routes/subscriptions.ts");
    expect(subs.match(/if \(betaFree\(\)\) throw new ORPCError\("FORBIDDEN", \{ message: "beta_free" \}\)/g)?.length).toBe(2);
    expect(lire("api/routes/credits.ts")).toContain('if (betaFree()) throw new ORPCError("FORBIDDEN", { message: "beta_free" })');
    // L'essai de 14 jours n'est pas entamé pendant la bêta.
    expect(lire("api/auth.ts")).toContain("if (betaFree()) return;");
  });

  test("le bandeau de /pricing porte le texte décidé, et le bandeau d'essai se tait", () => {
    expect(pricingCopy("fr").betaBanner).toBe("Phase de Bêta : TRED est 100% gratuit pour tous les étudiants. Les abonnements seront disponibles au lancement officiel.");
    expect(lire("web/pages/pricing.tsx")).toContain('data-testid="beta-banner"');
    expect(lire("web/components/trial-banner.tsx")).toContain("data.beta");
    expect(lire("web/components/SmartPaywallModal.tsx")).toContain("c.wallBetaTitle");
  });
});
