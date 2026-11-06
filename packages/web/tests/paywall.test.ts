import { afterEach, describe, expect, test } from "bun:test";

// plan.ts ouvre la base au chargement : une base en mémoire suffit ici.
process.env.DATABASE_URL ??= "file::memory:";
const { quotaError } = await import("../src/api/lib/plan");
const { readChatFailure } = await import("../src/web/lib/chat-error");

const keep = { a: process.env.ADS_REWARDED_ENABLED, t: process.env.ADS_TEST_MODE };
afterEach(() => {
  process.env.ADS_REWARDED_ENABLED = keep.a;
  process.env.ADS_TEST_MODE = keep.t;
});

const freeChat = { ok: false, plan: "free" as const, used: 20, limit: 20, source: "quota" as const };

describe("paywall intelligent : le 402 propose la vidéo… quand c'est honnête", () => {
  test("gratuit, régie activée : vidéo de 15 s contre 1 crédit", () => {
    process.env.ADS_REWARDED_ENABLED = "true";
    expect(quotaError(freeChat).rewardedAd).toEqual({ seconds: 15, credits: 1 });
  });

  test("régie non activée : pas de vidéo (brique inerte)", () => {
    delete process.env.ADS_REWARDED_ENABLED;
    delete process.env.ADS_TEST_MODE;
    expect(quotaError(freeChat).rewardedAd).toBeNull();
  });

  test("abonné : jamais de pub, même récompensée", () => {
    process.env.ADS_REWARDED_ENABLED = "true";
    expect(quotaError({ ...freeChat, plan: "standard" }).rewardedAd).toBeNull();
  });

  test("limite de documents : un crédit ne la lève pas, donc pas de vidéo", () => {
    process.env.ADS_REWARDED_ENABLED = "true";
    expect(quotaError({ ok: false, plan: "free", used: 10, limit: 10 }).rewardedAd).toBeNull();
  });

  test("le client lit l'offre telle quelle (et ignore un champ abîmé)", () => {
    process.env.ADS_TEST_MODE = "true";
    const body = quotaError(freeChat);
    const f = readChatFailure(new Error(JSON.stringify(body)));
    expect(f.kind).toBe("quota");
    if (f.kind === "quota") expect(f.rewardedAd).toEqual({ seconds: 15, credits: 1 });

    const broken = readChatFailure(new Error(JSON.stringify({ ...body, rewardedAd: { seconds: "15" } })));
    if (broken.kind === "quota") expect(broken.rewardedAd).toBeNull();
  });
});
