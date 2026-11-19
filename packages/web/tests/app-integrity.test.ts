import { describe, expect, test } from "bun:test";
import { createHash, createPrivateKey, generateKeyPairSync, sign as signData, X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodeCbor, encodeCbor } from "../src/api/integrity/cbor";
import { APPLE_APP_ATTEST_ROOT_PEM, attestationNonce, verifyAssertion, verifyAttestation } from "../src/api/integrity/app-attest";
import { decodePlayToken, evaluatePlayVerdict, parseServiceAccount, type PlayVerdictPayload } from "../src/api/integrity/play-integrity";

process.env.BETTER_AUTH_SECRET ??= "test-secret-for-app-integrity-0123456789";
const { issueIntegrityToken, readIntegrityToken, issueKeyTicket, readKeyTicket } = await import("../src/api/integrity/token");
const { classifyRequest, consumeChallenge, newChallenge } = await import("../src/api/integrity/routes");

/** Attestation de TEST (fausse racine) : tests/fixtures/app-attest/make-fixture.mjs. */
const fx = JSON.parse(readFileSync(join(import.meta.dir, "fixtures/app-attest/fixture.json"), "utf8")) as {
  appId: string; challenge: string; keyId: string; rootPem: string; attestationProduction: string; attestationDevelopment: string; devicePrivateKeyPem: string;
};
const sha256 = (...p: Uint8Array[]) => p.reduce((h, x) => h.update(x), createHash("sha256")).digest();
const base = { keyId: fx.keyId, challenge: fx.challenge, appId: fx.appId, rootPem: fx.rootPem };

describe("CBOR minimal", () => {
  test("aller-retour, et refus de ce qui n'est pas attendu", () => {
    const v = new Map<unknown, unknown>([["fmt", "apple-appattest"], ["n", -7], ["b", new Uint8Array([1, 2, 3])], ["a", [1, "x", true, null]]]);
    expect(decodeCbor(encodeCbor(v as never))).toEqual(v as never);
    expect(() => decodeCbor(new Uint8Array([0x5f]))).toThrow(); // longueur indéfinie
    expect(() => decodeCbor(new Uint8Array([0xc0, 0x00]))).toThrow(); // étiquette
    expect(() => decodeCbor(new Uint8Array([0x01, 0x02]))).toThrow(); // octets en trop
    expect(() => decodeCbor(new Uint8Array([0x58, 0x10, 0x01]))).toThrow(); // tronqué
  });
});

describe("App Attest : attestation", () => {
  test("la racine embarquée est bien « Apple App Attestation Root CA », auto-signée, valable jusqu'en 2045", () => {
    const root = new X509Certificate(APPLE_APP_ATTEST_ROOT_PEM);
    expect(root.subject).toContain("CN=Apple App Attestation Root CA");
    expect(root.verify(root.publicKey)).toBe(true);
    expect(root.fingerprint256).toBe("1C:B9:82:3B:A2:8B:A6:AD:2D:33:A0:06:94:1D:E2:AE:4F:51:3E:F1:D4:E8:31:B9:F7:E0:FA:7B:62:42:C9:32");
    expect(new Date(root.validTo).getUTCFullYear()).toBe(2045);
  });

  test("une attestation de production valide est acceptée, la clé publique est rendue", () => {
    const r = verifyAttestation({ ...base, attestation: fx.attestationProduction });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.key).toMatchObject({ keyId: fx.keyId, counter: 0, environment: "production" });
  });

  test("chaque contrôle d'Apple a son refus", () => {
    const refuse = (over: Partial<typeof base> & { attestation?: string; allowDevelopment?: boolean }) => {
      const r = verifyAttestation({ ...base, attestation: fx.attestationProduction, ...over });
      return r.ok ? "ok" : r.reason;
    };
    expect(refuse({ rootPem: APPLE_APP_ATTEST_ROOT_PEM })).toBe("chain"); // signée par une autre racine
    expect(refuse({ challenge: "un-autre-defi" })).toBe("nonce");
    expect(refuse({ keyId: Buffer.alloc(32, 7).toString("base64") })).toBe("key_id");
    expect(refuse({ appId: "TEAMID1234.com.copie.app" })).toBe("app_id");
    expect(refuse({ attestation: fx.attestationDevelopment })).toBe("environment");
    expect(refuse({ attestation: fx.attestationDevelopment, allowDevelopment: true })).toBe("ok");
    expect(refuse({ attestation: "pas du cbor" })).toBe("malformed");
    expect(refuse({ attestation: Buffer.from(encodeCbor(new Map([["fmt", "packed"]]))).toString("base64") })).toBe("malformed");
  });

  test("l'extension « nonce » se lit dans le certificat", () => {
    const att = decodeCbor(Buffer.from(fx.attestationProduction, "base64")) as Map<string, unknown>;
    const leaf = ((att.get("attStmt") as Map<string, unknown>).get("x5c") as Uint8Array[])[0]!;
    const nonce = sha256(att.get("authData") as Uint8Array, sha256(Buffer.from(fx.challenge)));
    expect(attestationNonce(leaf)?.equals(nonce)).toBe(true);
    expect(attestationNonce(new Uint8Array([0x30, 0x00]))).toBeNull();
  });
});

describe("App Attest : assertions", () => {
  const attested = verifyAttestation({ ...base, attestation: fx.attestationProduction });
  if (!attested.ok) throw new Error("fixture invalide");
  const device = createPrivateKey(fx.devicePrivateKeyPem);
  const assertion = (challenge: string, counter: number, appId = fx.appId, key = device) => {
    const c = Buffer.alloc(4);
    c.writeUInt32BE(counter);
    const authenticatorData = Buffer.concat([sha256(Buffer.from(appId)), Buffer.from([0x01]), c]);
    const nonce = sha256(authenticatorData, sha256(Buffer.from(challenge)));
    const signature = signData("sha256", nonce, key);
    return Buffer.from(encodeCbor(new Map([["signature", signature], ["authenticatorData", authenticatorData]]) as never)).toString("base64");
  };
  const check = (a: string, challenge = "defi-2", previousCounter = 0) => {
    const r = verifyAssertion({ assertion: a, challenge, appId: fx.appId, publicKey: attested.key.publicKey, previousCounter });
    return r.ok ? r.counter : r.reason;
  };

  test("signée par la clé attestée, compteur croissant : acceptée", () => {
    expect(check(assertion("defi-2", 1))).toBe(1);
    expect(check(assertion("defi-3", 5), "defi-3", 1)).toBe(5);
  });

  test("autre défi, autre clé, autre app, compteur rejoué : refusée", () => {
    expect(check(assertion("defi-2", 1), "defi-x")).toBe("signature");
    const other = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey;
    expect(check(assertion("defi-2", 1, fx.appId, other))).toBe("signature");
    expect(check(assertion("defi-2", 1, "TEAMID1234.com.copie.app"))).toBe("app_id");
    expect(check(assertion("defi-2", 3), "defi-2", 3)).toBe("counter");
    expect(check("AAAA")).toBe("malformed");
  });
});

describe("Play Integrity", () => {
  const now = Date.parse("2026-11-19T10:00:00Z");
  const good: PlayVerdictPayload = {
    requestDetails: { requestPackageName: "de.tred.app", requestHash: "defi-1", timestampMillis: String(now - 2000) },
    appIntegrity: { appRecognitionVerdict: "PLAY_RECOGNIZED", packageName: "de.tred.app", versionCode: "7" },
    deviceIntegrity: { deviceRecognitionVerdict: ["MEETS_DEVICE_INTEGRITY"] },
    accountDetails: { appLicensingVerdict: "LICENSED" },
  };
  const evaluate = (p: PlayVerdictPayload) => {
    const r = evaluatePlayVerdict(p, { packageName: "de.tred.app", requestHash: "defi-1", now });
    return r.ok ? r.level : r.reason;
  };

  test("binaire Play, appareil certifié : niveau « device » ; appareil de base : « basic »", () => {
    expect(evaluate(good)).toBe("device");
    expect(evaluate({ ...good, deviceIntegrity: { deviceRecognitionVerdict: ["MEETS_BASIC_INTEGRITY"] } })).toBe("basic");
  });

  test("app modifiée, autre package, autre défi, jeton ancien, appareil inconnu : refusé", () => {
    expect(evaluate({ ...good, appIntegrity: { appRecognitionVerdict: "UNRECOGNIZED_VERSION" } })).toBe("app_not_recognized");
    expect(evaluate({ ...good, requestDetails: { ...good.requestDetails, requestPackageName: "com.copie" } })).toBe("package");
    expect(evaluate({ ...good, requestDetails: { ...good.requestDetails, requestHash: "autre" } })).toBe("request_hash");
    expect(evaluate({ ...good, requestDetails: { ...good.requestDetails, timestampMillis: String(now - 10 * 60_000) } })).toBe("stale");
    expect(evaluate({ ...good, deviceIntegrity: { deviceRecognitionVerdict: [] } })).toBe("device");
  });

  test("le compte de service se lit en JSON ou en base64 ; le décodage passe par Google avec un jeton OAuth signé", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const sa = { client_email: "integrity@tred-test.iam.gserviceaccount.com", private_key: privateKey.export({ format: "pem", type: "pkcs8" }).toString() };
    expect(parseServiceAccount(JSON.stringify(sa))?.client_email).toBe(sa.client_email);
    expect(parseServiceAccount(Buffer.from(JSON.stringify(sa)).toString("base64"))?.client_email).toBe(sa.client_email);
    expect(parseServiceAccount("n'importe quoi")).toBeNull();
    const calls: string[] = [];
    const fake = async (url: string, init: { body: string; headers: Record<string, string> }) => {
      calls.push(url);
      if (url.includes("oauth2")) {
        const jwt = new URLSearchParams(init.body).get("assertion")!;
        const claims = JSON.parse(Buffer.from(jwt.split(".")[1]!, "base64url").toString());
        expect(claims.scope).toBe("https://www.googleapis.com/auth/playintegrity");
        return { ok: true, status: 200, json: async () => ({ access_token: "ya29.test", expires_in: 3600 }) };
      }
      expect(init.headers.Authorization).toBe("Bearer ya29.test");
      expect(JSON.parse(init.body)).toEqual({ integrity_token: "jeton-play" });
      return { ok: true, status: 200, json: async () => ({ tokenPayloadExternal: good }) };
    };
    expect(await decodePlayToken("jeton-play", "de.tred.app", sa, fake as never)).toEqual(good);
    expect(calls[1]).toBe("https://playintegrity.googleapis.com/v1/de.tred.app:decodeIntegrityToken");
  });
});

describe("jetons du serveur, défis, contrôle des requêtes", () => {
  test("jeton d'intégrité : signé, limité dans le temps, falsification refusée", () => {
    const { token, expiresAt } = issueIntegrityToken("ios", "device", 1000);
    expect(readIntegrityToken(token, 2000)).toMatchObject({ p: "ios", l: "device" });
    expect(readIntegrityToken(token, expiresAt + 1)).toBeNull();
    const [body] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ p: "android", l: "device", e: expiresAt, u: "integrity" })).toString("base64url");
    expect(readIntegrityToken(`${forged}.${token.split(".")[1]}`, 2000)).toBeNull();
    expect(readIntegrityToken(`${body}.AAAA`, 2000)).toBeNull();
    // Un ticket de clé n'est pas un jeton d'intégrité, et inversement.
    const ticket = issueKeyTicket({ k: "id", pk: "pk", c: 3 });
    expect(readIntegrityToken(ticket, 2000)).toBeNull();
    expect(readKeyTicket(token)).toBeNull();
    expect(readKeyTicket(ticket)).toEqual({ k: "id", pk: "pk", c: 3, u: "key" } as never);
  });

  test("un défi ne sert qu'une fois et expire", () => {
    const c = newChallenge(0);
    expect(consumeChallenge(c, 1000)).toBe(true);
    expect(consumeChallenge(c, 1000)).toBe(false);
    const late = newChallenge(0);
    expect(consumeChallenge(late, 6 * 60_000)).toBe(false);
    expect(consumeChallenge("inconnu")).toBe(false);
  });

  test("le site web n'est jamais concerné ; l'app est classée", () => {
    const { token } = issueIntegrityToken("android", "basic");
    expect(classifyRequest(undefined, undefined)).toBe("web");
    expect(classifyRequest("android", undefined)).toBe("missing");
    expect(classifyRequest("android", token)).toBe("valid");
    expect(classifyRequest("ios", token)).toBe("invalid"); // jeton Android présenté par « iOS »
    expect(classifyRequest("ios", "abc.def")).toBe("invalid");
  });

  test("mode « report » par défaut : rien n'est bloqué tant que le fondateur n'a pas choisi « enforce »", () => {
    const routes = readFileSync(join(import.meta.dir, "../src/api/integrity/routes.ts"), "utf8");
    expect(routes).toContain('(process.env.APP_INTEGRITY_MODE ?? "report")');
    expect(routes).toContain('if (mode === "enforce" && verdict !== "valid") return c.json({ error: "app_integrity_required" }, 403);');
  });
});
