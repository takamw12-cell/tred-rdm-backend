import { describe, expect, test } from "bun:test";
import {
  REWARD,
  rewardDay,
  rewardedEnabled,
  rewardTransactionId,
  signRewardToken,
  verifyRewardToken,
} from "../src/api/lib/ad-reward";

const SECRET = "s3cret";
const T0 = Date.UTC(2026, 10, 6, 12, 0, 0);

describe("jeton de vidéo récompensée", () => {
  const tok = signRewardToken("user-1", T0, SECRET, "nonce-1");

  test("valide après 15 s, pour le bon compte", () => {
    expect(verifyRewardToken(tok, "user-1", T0 + 15_000, SECRET)).toEqual({ ok: true, nonce: "nonce-1", issuedAt: T0 });
  });

  test("trop tôt : on n'a pas regardé la vidéo", () => {
    expect(verifyRewardToken(tok, "user-1", T0 + 5_000, SECRET)).toEqual({ ok: false, reason: "too_early" });
  });

  test("expiré après 10 min", () => {
    expect(verifyRewardToken(tok, "user-1", T0 + REWARD.ttlMs + 1, SECRET)).toEqual({ ok: false, reason: "expired" });
  });

  test("le jeton d'un autre compte ne paie pas", () => {
    expect(verifyRewardToken(tok, "user-2", T0 + 20_000, SECRET)).toEqual({ ok: false, reason: "wrong_user" });
  });

  test("falsifié ou signé avec un autre secret : refusé", () => {
    const [body] = tok.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "user-1", n: "x", t: T0 - 60_000 })).toString("base64url");
    expect(verifyRewardToken(`${forged}.${tok.split(".")[1]}`, "user-1", T0 + 20_000, SECRET).ok).toBe(false);
    expect(verifyRewardToken(signRewardToken("user-1", T0, "autre"), "user-1", T0 + 20_000, SECRET)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyRewardToken(body, "user-1", T0 + 20_000, SECRET)).toEqual({ ok: false, reason: "malformed" });
  });

  test("identifiant de transaction = jour + nonce (idempotence et plafond)", () => {
    expect(rewardDay(T0)).toBe("2026-11-06");
    expect(rewardTransactionId(rewardDay(T0), "nonce-1")).toBe("ad:2026-11-06:nonce-1");
  });

  test("inerte sans variable", () => {
    expect(rewardedEnabled({})).toBe(false);
    expect(rewardedEnabled({ ADS_REWARDED_ENABLED: "true" })).toBe(true);
    expect(rewardedEnabled({ ADS_TEST_MODE: "true" })).toBe(true);
  });
});
