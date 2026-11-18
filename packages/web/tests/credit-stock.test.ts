import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RedeemInput } from "../src/api/lib/referral";
import { PANIC_ITEMS, cleanLatexForDisplay, groundCheatSheet, panicSystemPrompt } from "../src/api/lib/panic";

// Ces modules ouvrent la base à l'import : on leur donne une base en mémoire d'abord.
process.env.DATABASE_URL ??= "file::memory:";
const { CREDIT_COST, CREDIT_GRANTS, LIMITS, PRICING } = await import("../src/api/lib/plan");
const { HALF, toCredits } = await import("../src/api/lib/credits");
const { DAILY_REWARD_CAP, REWARDS, isoWeek, rewardId, underDailyCap } = await import("../src/api/lib/study-rewards");
const { MAX_REFERRALS, newReferralCode, normalizeReferralCode, redeemRefusal, sameMailbox } = await import("../src/api/lib/referral");

/**
 * Modèle « stock de crédits » (décision du fondateur, 18 nov. 2026) et ce qui
 * s'appuie dessus : récompenses d'étude, parrainage, Panik-Modus.
 */
const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");

describe("le stock de crédits remplace les quotas mensuels", () => {
  test("Free et les Pass n'ont plus de quota mensuel : chaque action se paie en crédits", () => {
    for (const plan of ["free", "standard", "premium"] as const) {
      for (const metric of ["chat", "exercise", "video", "formulas"] as const) expect(LIMITS[plan][metric]).toBe(0);
    }
    expect(LIMITS.free.documents).toBe(10);
    expect(LIMITS.premium.documents).toBe(200);
  });

  test("ce que chaque offre donne : 10 à l'inscription, 50 et 300 pour les Pass, 15 par parrainage", () => {
    expect(CREDIT_GRANTS).toEqual({ welcome: 10, klausurPass: 50, semesterPass: 300, monthlyRenewal: 50, referral: 15 });
    expect(PRICING.creditPacks).toEqual([{ amount: 499, credits: 20 }, { amount: 999, credits: 50 }]);
    expect(CREDIT_COST).toEqual({ chat: 1, exercise: 2, formulas: 2, video: 5 });
  });

  test("les crédits sont écrits une seule fois : l'identifiant du journal porte l'événement", () => {
    const auth = read("src/api/auth.ts");
    expect(auth).toContain("transactionId: `welcome:${user.id}`");
    expect(auth).not.toContain("startTrial(");
    const billing = read("src/api/lib/billing.ts");
    expect(billing).toContain("transactionId: `${sessionId}:credits`");
    expect(billing).toContain("transactionId: `invoice:${invoice.id}`");
    expect(read("src/api/index.ts")).toContain('case "invoice.paid":');
  });

  test("l'essai illimité de 14 jours n'est plus proposé ni démarrable", () => {
    const sub = read("src/api/routes/subscriptions.ts");
    expect(sub).toContain('throw new ORPCError("FORBIDDEN", { message: "trial_retired" })');
    expect(sub).toMatch(/available: false,/);
  });

  test("demi-crédits : arrondis au demi, jamais de poussière décimale", () => {
    expect(HALF).toBe(0.5);
    expect(toCredits(0.5)).toBe(0.5);
    expect(toCredits(0.1 + 0.2)).toBe(0.5);
    expect(toCredits(2.74)).toBe(2.5);
    expect(toCredits(2.76)).toBe(3);
    expect(toCredits(Number.NaN)).toBe(0);
    // Six demi-crédits font exactement trois.
    expect(toCredits([0.5, 0.5, 0.5, 0.5, 0.5, 0.5].reduce((a, b) => a + b, 0))).toBe(3);
    const schema = read("src/api/database/schema.ts");
    expect(schema).toContain('creditsRemaining: real("credits_remaining")');
    expect(schema).toContain('amount: real("amount")');
  });
});

describe("récompenses d'étude", () => {
  test("barème : +0,5 par chapitre ou exercice, +2 pour un examen blanc, 3 par jour au plus", () => {
    expect(REWARDS).toEqual({ chapter_completed: 0.5, exercise_completed: 0.5, mock_exam_passed: 2 });
    expect(DAILY_REWARD_CAP).toBe(3);
  });

  test("plafond du jour : la récompense qui le dépasserait est refusée en entier", () => {
    expect(underDailyCap(0, 0.5)).toBe(true);
    expect(underDailyCap(2.5, 0.5)).toBe(true);
    expect(underDailyCap(3, 0.5)).toBe(false);
    expect(underDailyCap(1.5, 2)).toBe(false);
    expect(underDailyCap(1, 2)).toBe(true);
  });

  test("un jalon = une ligne du journal : même chapitre, même semaine, même identifiant", () => {
    const a = rewardId("u1", "chapter_completed", "Entropie", "2026-11-18");
    expect(rewardId("u1", "chapter_completed", "  entropie ", "2026-11-20")).toBe(a);
    // La semaine suivante, le même chapitre peut de nouveau compter ; un autre compte aussi.
    expect(rewardId("u1", "chapter_completed", "Entropie", "2026-11-23")).not.toBe(a);
    expect(rewardId("u2", "chapter_completed", "Entropie", "2026-11-18")).not.toBe(a);
    expect(a.startsWith("reward:u1:chapter_completed:")).toBe(true);
  });

  test("semaines ISO, y compris autour du Nouvel An", () => {
    expect(isoWeek("2026-11-18")).toBe("2026-W47");
    expect(isoWeek("2026-11-22")).toBe("2026-W47");
    expect(isoWeek("2026-11-23")).toBe("2026-W48");
    expect(isoWeek("2026-12-31")).toBe("2026-W53");
    expect(isoWeek("2027-01-03")).toBe("2026-W53");
    expect(isoWeek("2027-01-04")).toBe("2027-W01");
  });

  test("cocher une case ne suffit pas : le concept doit avoir été travaillé avec le tuteur", () => {
    const lib = read("src/api/lib/study-rewards.ts");
    expect(lib).toContain("workedRecently(db, userId, key, now)");
    expect(lib).toContain("row.attempts > 0");
    expect(lib.indexOf('return refuse("not_justified")')).toBeLessThan(lib.indexOf("await grantCredits("));
    expect(lib.indexOf('return refuse("daily_cap")')).toBeLessThan(lib.indexOf("await grantCredits("));
  });
});

describe("parrainage", () => {
  const base = (over: Partial<RedeemInput> = {}): RedeemInput => ({
    referee: { id: "filleul", email: "lena@uni.example", emailVerified: true, createdAt: new Date("2026-11-18T08:00:00Z") },
    referrer: { id: "parrain", email: "jonas@uni.example" },
    alreadyReferred: false,
    referrerCount: 0,
    now: Date.parse("2026-11-18T10:00:00Z"),
    ...over,
  });

  test("un code se dicte : TRED- et six caractères sans 0, O, 1, I ni L", () => {
    for (let i = 0; i < 200; i += 1) expect(newReferralCode()).toMatch(/^TRED-[A-HJKMNP-Z2-9]{6}$/);
    expect(normalizeReferralCode("  tred-7k2qxm ")).toBe("TRED-7K2QXM");
    for (const bad of ["TRED-RACHED1", "TRED-00000O", "7K2QXM", "", "TRED-7K2QX", null, 42, "TRED-7K2QXM'; DROP TABLE user;--"]) expect(normalizeReferralCode(bad)).toBeNull();
  });

  test("cas normal : accepté", () => {
    expect(redeemRefusal(base())).toBeNull();
  });

  test("refusé : soi-même, même boîte e-mail, adresse non confirmée, compte ancien, déjà parrainé, parrain à 20", () => {
    expect(redeemRefusal(base({ referrer: null }))).toBe("unknown_code");
    expect(redeemRefusal(base({ referrer: { id: "filleul", email: "x@y.example" } }))).toBe("own_code");
    expect(redeemRefusal(base({ referrer: { id: "parrain", email: "Lena+2@uni.example" } }))).toBe("same_email");
    expect(redeemRefusal(base({ referee: { ...base().referee, emailVerified: false } }))).toBe("email_not_verified");
    expect(redeemRefusal(base({ referee: { ...base().referee, createdAt: new Date("2026-11-01T08:00:00Z") } }))).toBe("account_too_old");
    expect(redeemRefusal(base({ alreadyReferred: true }))).toBe("already_referred");
    expect(redeemRefusal(base({ referrerCount: MAX_REFERRALS }))).toBe("referrer_limit");
    expect(redeemRefusal(base({ referrerCount: MAX_REFERRALS - 1 }))).toBeNull();
    expect(MAX_REFERRALS).toBe(20);
  });

  test("même boîte : majuscules, « +étiquette », points de Gmail", () => {
    expect(sameMailbox("a.b.c+x@gmail.com", "ABC@googlemail.com")).toBe(true);
    expect(sameMailbox("lena+tred@uni.example", "lena@uni.example")).toBe(true);
    expect(sameMailbox("l.ena@uni.example", "lena@uni.example")).toBe(false);
    expect(sameMailbox("", "")).toBe(false);
    expect(sameMailbox(null, undefined)).toBe(false);
  });

  test("le filleul est verrouillé AVANT les crédits, et chaque crédit a son identifiant", () => {
    const lib = read("src/api/lib/referral.ts");
    expect(lib.indexOf("db.insert(referral).values({ refereeId: referee.id")).toBeLessThan(lib.indexOf("transactionId: `referral:${referee.id}:referee`"));
    expect(lib).toContain("transactionId: `referral:${referee.id}:referrer`");
    // Pas de colonne dans la table de Better Auth.
    expect(read("src/api/database/auth-schema.ts")).not.toMatch(/referred_by|referral/);
    const gdpr = read("src/api/lib/gdpr.ts");
    expect(gdpr).toContain("db.delete(referral).where(or(eq(referral.refereeId, userId), eq(referral.referrerId, userId)))");
  });
});

describe("Panik-Modus : rien d'inventé", () => {
  const DOC = "[[SEITE 1]] Die Entropie eines abgeschlossenen Systems nimmt niemals ab. Der zweite Hauptsatz verbietet den vollstaendigen Umsatz von Waerme in Arbeit.\n[[SEITE 2]] Fuer den Carnot-Wirkungsgrad gilt eta gleich eins minus T kalt durch T warm bei reversibler Prozessfuehrung.";

  test("ne garde que ce dont la phrase est dans le document, avec sa page", () => {
    const sheet = groundCheatSheet(
      {
        konzepte: [
          { titel: "Entropie", kern: "Sie nimmt in abgeschlossenen Systemen nie ab.", beleg: "Die Entropie eines abgeschlossenen Systems nimmt niemals ab." },
          { titel: "Erfunden", kern: "Steht nirgends im Dokument, klingt aber gut.", beleg: "Die Exergie ist immer groesser als die Anergie in jedem Prozess." },
        ],
        formeln: [
          { name: "Carnot-Wirkungsgrad", latex: "$\\eta = 1 - \\frac{T_k}{T_w}$", bedeutung: "Obergrenze jeder Waermekraftmaschine.", beleg: "Fuer den Carnot-Wirkungsgrad gilt eta gleich eins minus T kalt durch T warm bei reversibler Prozessfuehrung." },
          { name: "Ausgedacht", latex: "E = mc^3", bedeutung: "Kommt im Dokument nicht vor.", beleg: "Die Energie ist Masse mal Lichtgeschwindigkeit hoch drei laut Skript." },
        ],
      },
      DOC,
    );
    expect(sheet.concepts.map((c) => [c.title, c.page])).toEqual([["Entropie", 1]]);
    expect(sheet.formulas.map((f) => [f.name, f.page, f.latex])).toEqual([["Carnot-Wirkungsgrad", 2, "\\eta = 1 - \\frac{T_k}{T_w}"]]);
  });

  test("au plus trois de chaque, jamais deux fois la même phrase", () => {
    const same = { titel: "Entropie", kern: "Sie nimmt in abgeschlossenen Systemen nie ab.", beleg: "Die Entropie eines abgeschlossenen Systems nimmt niemals ab." };
    expect(groundCheatSheet({ konzepte: [same, same, same, same], formeln: [] }, DOC).concepts.length).toBe(1);
    expect(PANIC_ITEMS).toBe(3);
  });

  test("une formule qui sort du mode mathématique n'est pas affichée", () => {
    expect(cleanLatexForDisplay("\\input{/etc/passwd}")).toBeNull();
    expect(cleanLatexForDisplay("\\href{https://evil.example}{x}")).toBeNull();
    expect(cleanLatexForDisplay("  $x^2$ ")).toBe("x^2");
    expect(cleanLatexForDisplay("   ")).toBeNull();
  });

  test("la consigne interdit d'inventer, et la route est bornée à trois feuilles par jour sur le modèle rapide", () => {
    const prompt = panicSystemPrompt("Deutsch");
    expect(prompt).toContain("Verwende NUR, was im Dokument steht");
    expect(prompt).toContain("WÖRTLICH kopiert");
    const index = read("src/api/index.ts");
    const route = index.slice(index.indexOf('app.post("/api/agent/panic"'), index.indexOf("// Compile a ```tikz block"));
    expect(route).toContain("model: gateway(FAST_MODEL)");
    expect(route).toContain("userRateLimit(c, uid, USER_LIMITS.panic())");
    expect(route).toContain("eq(document.userId, uid)");
    expect(route.indexOf("if (!doc) return")).toBeLessThan(route.indexOf("USER_LIMITS.panic()"));
    expect(read("src/api/middleware/rate-limit.ts")).toContain('panic: () => ({ scope: "user-panic", limit: envInt("PANIC_PER_DAY", 3), windowMs: DAY_MS })');
  });
});
