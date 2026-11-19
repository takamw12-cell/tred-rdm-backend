import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isOwnReturnUrl, safeReturnUrl } from "../src/api/lib/return-url";
import { PASSES, PASS_STATUS, isPassKind, passPriceId, passValidUntil, semesterSavingPercent } from "../src/api/lib/passes";
import { paymentFailedMail } from "../src/api/lib/mail";
import { passSavingPercent, pricingCopy } from "../src/web/lib/pricing-copy";
import { de } from "../src/web/i18n/messages/de";
import { en } from "../src/web/i18n/messages/en";
import { fr } from "../src/web/i18n/messages/fr";
import { es } from "../src/web/i18n/messages/es";

/**
 * « Correction des fondations » (18 nov. 2026) : adresse de retour Stripe,
 * Pass à paiement unique, prélèvement échoué, promesses publicitaires, iOS.
 */
const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");
const SITE = "https://www.tred-tutor.de";

describe("adresse de retour après paiement : seulement chez nous", () => {
  test("tred-tutor.de, l'hôte de WEBSITE_URL et localhost passent", () => {
    for (const ok of ["https://www.tred-tutor.de/pricing?checkout=success", "https://tred-tutor.de/credits", "https://app.tred-tutor.de/x", "http://localhost:4200/pricing", "http://127.0.0.1:4587/pricing", "https://localhost/pricing"]) {
      expect(isOwnReturnUrl(ok, SITE)).toBe(true);
    }
    expect(isOwnReturnUrl("https://aerostudy-production-0c66.up.railway.app/pricing", "https://aerostudy-production-0c66.up.railway.app")).toBe(true);
  });

  test("tout le reste est ignoré : autre site, faux sous-domaine, identifiants, http, schéma d'app, texte", () => {
    for (const bad of [
      "https://evil.example/pricing",
      "https://tred-tutor.de.evil.example/pricing",
      "https://eviltred-tutor.de/pricing",
      "https://www.tred-tutor.de@evil.example/pricing",
      "https://user:pw@www.tred-tutor.de/pricing",
      "http://www.tred-tutor.de/pricing",
      "javascript:alert(1)",
      "tred://paywall",
      "//evil.example",
      "/pricing",
      "",
      "pas une adresse",
      `https://www.tred-tutor.de/${"a".repeat(2100)}`,
    ]) {
      expect(isOwnReturnUrl(bad, SITE)).toBe(false);
      expect(safeReturnUrl(bad, `${SITE}/pricing?checkout=success`, SITE)).toBe(`${SITE}/pricing?checkout=success`);
    }
    for (const notText of [null, undefined, 42, {}]) expect(safeReturnUrl(notText, "défaut", SITE)).toBe("défaut");
  });

  test("les trois routes passent par ce garde et n'envoient plus l'adresse du client telle quelle", () => {
    const sub = read("src/api/routes/subscriptions.ts");
    const credits = read("src/api/routes/credits.ts");
    for (const src of [sub, credits]) {
      expect(src).not.toMatch(/success_url: input\.successUrl \?\?/);
      expect(src).not.toMatch(/cancel_url: input\.cancelUrl \?\?/);
      expect(src).toContain("success_url: safeReturnUrl(input.successUrl,");
      expect(src).toContain("cancel_url: safeReturnUrl(input.cancelUrl,");
    }
    expect(sub).toContain("return_url: safeReturnUrl(input?.returnUrl,");
  });
});

describe("Pass : paiement unique, accès pour une durée", () => {
  test("grille : Klausur-Pass 9,99 € / 30 jours, Semester-Pass 39,99 € / 6 mois", () => {
    expect(PASSES.klausur).toMatchObject({ amount: 999, days: 30, months: 0 });
    expect(PASSES.semester).toMatchObject({ amount: 3999, days: 0, months: 6 });
    expect(isPassKind("klausur")).toBe(true);
    expect(isPassKind("gratis")).toBe(false);
    expect(isPassKind(undefined)).toBe(false);
  });

  test("le badge d'économie : 33 %, arrondi vers le bas, jamais plus que la réalité", () => {
    expect(semesterSavingPercent()).toBe(33);
    expect(passSavingPercent(999, 3999, 6)).toBe(33);
    // 59,94 € au détail contre 39,99 € : 33,28 %.
    expect((1 - 3999 / (999 * 6)) * 100).toBeGreaterThanOrEqual(33);
    expect(passSavingPercent(999, 5994, 6)).toBe(0);
    expect(passSavingPercent(999, 7000, 6)).toBe(0);
    expect(passSavingPercent(0, 3999, 6)).toBe(0);
  });

  test("échéance : 30 jours, ou 6 mois de calendrier", () => {
    const now = new Date("2026-11-18T10:00:00Z");
    expect(passValidUntil("klausur", {}, now).toISOString()).toBe("2026-12-18T10:00:00.000Z");
    expect(passValidUntil("semester", {}, now).toISOString()).toBe("2027-05-18T10:00:00.000Z");
    // Un 31 août + 6 mois : février n'a pas de 31, on retombe sur son dernier jour.
    expect(passValidUntil("semester", {}, new Date("2026-08-31T10:00:00Z")).toISOString()).toBe("2027-02-28T10:00:00.000Z");
  });

  test("acheté pendant un accès payé encore valable, le Pass PROLONGE ; sinon il part de maintenant", () => {
    const now = new Date("2026-11-18T10:00:00Z");
    const running = { plan: "premium", validUntil: new Date("2026-12-01T10:00:00Z") };
    expect(passValidUntil("klausur", running, now).toISOString()).toBe("2026-12-31T10:00:00.000Z");
    const expired = { plan: "premium", validUntil: new Date("2026-10-01T10:00:00Z") };
    expect(passValidUntil("klausur", expired, now).toISOString()).toBe("2026-12-18T10:00:00.000Z");
    // Un compte Free avec une vieille date ne « prolonge » rien.
    expect(passValidUntil("klausur", { plan: "free", validUntil: new Date("2027-01-01T00:00:00Z") }, now).toISOString()).toBe("2026-12-18T10:00:00.000Z");
  });

  test("les prix viennent de l'environnement, jamais du code", () => {
    expect(passPriceId("klausur", {})).toBeNull();
    expect(passPriceId("klausur", { STRIPE_PRICE_PASS_KLAUSUR: " price_abc " })).toBe("price_abc");
    expect(passPriceId("semester", { STRIPE_PRICE_PASS_SEMESTER: "price_def" })).toBe("price_def");
    const sub = read("src/api/routes/subscriptions.ts");
    expect(sub).not.toMatch(/price_[A-Za-z0-9]{8,}/);
    // Le client ne choisit que le TYPE de Pass, jamais un identifiant de prix.
    expect(sub).toContain('pass: z.enum(["klausur", "semester"])');
    expect(sub).toContain('mode: "payment"');
    expect(sub).toContain("metadata: { userId: context.user.id, pass: input.pass }");
  });

  test("webhook : le Pass n'est ouvert qu'une fois ENCAISSÉ, une seule fois par session", () => {
    const index = read("src/api/index.ts");
    const hook = index.slice(index.indexOf('app.post("/api/subscriptions/webhook"'), index.indexOf("// ── Öffentliche Konfiguration"));
    expect(hook).toContain('case "checkout.session.async_payment_succeeded":');
    expect(hook).toContain('if (session.mode === "payment" && session.payment_status !== "paid")');
    expect(hook.indexOf('session.payment_status !== "paid"')).toBeLessThan(hook.indexOf("await grantPass("));
    expect(hook.indexOf('session.payment_status !== "paid"')).toBeLessThan(hook.indexOf("await grantCredits("));
    const billing = read("src/api/lib/billing.ts");
    // Le journal sert de verrou (identifiant de session Stripe), comme pour les crédits.
    expect(billing).toContain(".values({ id: sessionId, userId, amount: 0,");
    expect(billing).toContain(".onConflictDoNothing()");
    expect(PASS_STATUS).toBe("pass");
  });
});

describe("prélèvement échoué", () => {
  test("le webhook écoute invoice.payment_failed, note « past_due » et prévient une fois", () => {
    const index = read("src/api/index.ts");
    expect(index).toContain('case "invoice.payment_failed":');
    expect(index).toContain("await markPaymentFailed(event.data.object as Stripe.Invoice);");
    const billing = read("src/api/lib/billing.ts");
    expect(billing).toContain('subscriptionStatus: "past_due"');
    expect(billing).toContain("if ((invoice.attempt_count ?? 1) > 1) return");
  });

  test("l'e-mail dit quoi faire, dans les trois langues, sans montant ni numéro de carte", () => {
    for (const lang of ["de", "fr", "en"] as const) {
      const mail = paymentFailedMail("https://www.tred-tutor.de/pricing", "Lena", lang);
      expect(mail.subject.length).toBeGreaterThan(10);
      expect(mail.html).toContain("https://www.tred-tutor.de/pricing");
      expect(mail.text).toContain("Lena");
      expect(mail.text).not.toMatch(/\d{4}[ -]?\d{4}/);
    }
  });
});

describe("promesses publicitaires (UWG) : rien d'absolu", () => {
  const BANNED = /hallu[cz]in|alucinaci|fehlerfrei|null fehler|zero error|z[ée]ro erreur|100 ?% (richtig|korrekt|correct|juste|fiable)|garantiert richtig|immer richtig|always correct|toujours juste/i;

  // « 100 % gratuit » du bandeau bêta n'est pas visé : c'est un prix, vrai tant que la bêta dure, pas une promesse de qualité.
  test("plus aucun « zéro hallucination » sur le site ni dans l'app mobile", () => {
    for (const pack of [de, en, fr, es]) expect(JSON.stringify(pack)).not.toMatch(BANNED);
    for (const file of ["../mobile/i18n/de.ts", "../mobile/i18n/en.ts", "../mobile/i18n/fr.ts", "src/web/lib/pricing-copy.ts", "index.html"]) {
      expect(read(file)).not.toMatch(BANNED);
    }
    for (const lang of ["de", "en", "fr"]) expect(JSON.stringify(pricingCopy(lang), (_k, v) => (typeof v === "function" ? v(33) : v))).not.toMatch(BANNED);
  });

  test("la promesse qui la remplace est vérifiable : la preuve vient du document de l'étudiant", () => {
    expect((de as { landing: { f2Title: string } }).landing.f2Title).toBe("Beweis aus deinem Dokument");
    expect((fr as { landing: { f2Title: string } }).landing.f2Title).toBe("La preuve par ton document");
    expect((en as { landing: { f2Title: string } }).landing.f2Title).toBe("Proof from your own document");
  });
});

describe("page de tarifs", () => {
  test("Semester-Pass recommandé avec son badge calculé, Klausur-Pass à côté, pas d'abonnement mensuel", () => {
    const page = read("src/web/pages/pricing.tsx");
    expect(page).toContain('data-testid="plan-semester-pass"');
    expect(page).toContain('data-testid="semester-pass-badge"');
    expect(page).toContain("{c.savePercent(saving)}");
    expect(page).toContain("passSavingPercent(klausurPass.amount, semesterPass.amount, semesterPass.months)");
    expect(page).toContain('data-testid="choose-klausur-pass"');
    // Décision du fondateur (19 nov. 2026) : pas d'abonnement mensuel pour l'instant, seulement les deux Pass.
    expect(page).not.toContain('data-testid="monthly-alternative"');
    expect(page).not.toContain('data-testid="choose-monthly"');
    // Aucun montant écrit dans la page : ils viennent du serveur.
    expect(page).not.toMatch(/\d+[,.]\d{2}\s?€/);
    expect(pricingCopy("de").savePercent(33)).toBe("Spare 33 %");
  });
});

describe("app mobile", () => {
  test("iOS et Android : ni bouton d'achat, ni prix, ni lien vers un paiement — et aucune invitation à payer ailleurs", () => {
    const policy = read("../mobile/lib/store-policy.ts");
    // Décision du fondateur (19 nov. 2026) : Google Play aussi, pas seulement l'App Store.
    expect(policy).toContain('return os === "ios" || os === "android";');
    for (const screen of ["../mobile/app/paywall.tsx", "../mobile/app/credits.tsx", "../mobile/app/(tabs)/settings.tsx"]) {
      const src = read(screen);
      expect(src).toContain("purchasesHidden");
      expect(src).toContain('testID="ios-no-purchase"');
    }
    // Verrou serveur : un paiement demandé par l'app (X-TRED-Platform) est refusé.
    const index = read("src/api/index.ts");
    for (const route of ["subscriptions/createCheckout", "subscriptions/createPassCheckout", "subscriptions/portal", "credits/purchase"]) expect(index).toContain(`"/api/rpc/${route}"`);
    expect(index).toContain('c.json({ error: "purchases_not_in_store_app" }, 403)');
    expect(read("../mobile/lib/app-integrity.ts")).toContain('headers["X-TRED-Platform"] = Platform.OS;');
    for (const lang of ["de", "en", "fr"]) {
      const notice = /notInApp: "([^"]+)"/.exec(read(`../mobile/i18n/${lang}.ts`))?.[1] ?? "";
      expect(notice.length).toBeGreaterThan(20);
      // La règle 3.1.1 interdit aussi d'envoyer vers un paiement externe : pas d'adresse, pas de « site ».
      expect(notice).not.toMatch(/tred-tutor|https?:|www\.|website|webseite|site web|€/i);
    }
  });

  test("le paywall mobile vend les mêmes Pass que le site, par la même route", () => {
    const paywall = read("../mobile/app/paywall.tsx");
    expect(paywall).toContain("useCreatePassCheckout()");
    expect(paywall).toContain("mutateAsync({ pass: selected.kind })");
    expect(paywall).not.toMatch(/\d+[,.]\d{2}\s?€/);
  });

  test("nom d'affichage : « TRED Tutor » (« Tred » est déjà pris sur les stores)", () => {
    expect((JSON.parse(read("../mobile/app.json")) as { expo: { name: string } }).expo.name).toBe("TRED Tutor");
    expect((JSON.parse(read("public/manifest.webmanifest")) as { name: string; short_name: string }).name).toBe("TRED Tutor");
  });
});
