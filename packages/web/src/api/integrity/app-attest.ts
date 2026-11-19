import { createHash, createPublicKey, verify as verifySignature, X509Certificate, timingSafeEqual } from "node:crypto";
import { decodeCbor, type Cbor } from "./cbor";

/**
 * Apple App Attest — vérification côté serveur (19 nov. 2026).
 *
 * Suivi pas à pas de « Validating apps that connect to your server »
 * (Apple Developer Documentation, DeviceCheck) :
 *
 * ATTESTATION (une fois par installation) :
 *   1. x5c = [certificat de la clé, intermédiaire] remonte à la racine
 *      « Apple App Attestation Root CA » (ci-dessous, téléchargée sur
 *      apple.com le 19 nov. 2026, empreinte SHA-256 1C:B9:82:3B:…:C9:32) ;
 *   2. nonce = SHA256(authData ‖ SHA256(défi)) doit égaler l'extension
 *      1.2.840.113635.100.8.2 du certificat de la clé ;
 *   3. SHA256(clé publique du certificat) = keyId ;
 *   4. rpIdHash de authData = SHA256("<Team ID>.<bundle id>") ;
 *   5. compteur = 0 ;
 *   6. aaguid = « appattest » + 7 zéros (production) — « appattestdevelop »
 *      seulement si l'environnement de développement est permis ;
 *   7. credentialId de authData = keyId.
 * ASSERTION (ensuite, à chaque renouvellement) :
 *   signature ECDSA de SHA256(authenticatorData ‖ SHA256(défi)) par la clé
 *   attestée ; rpIdHash identique ; compteur strictement croissant.
 *
 * Aucune dépendance : node:crypto (X509Certificate, verify) et un CBOR
 * minimal. Les défis sont à usage unique, tenus par routes.ts.
 */

export const APPLE_APP_ATTEST_ROOT_PEM = `-----BEGIN CERTIFICATE-----
MIICITCCAaegAwIBAgIQC/O+DvHN0uD7jG5yH2IXmDAKBggqhkjOPQQDAzBSMSYw
JAYDVQQDDB1BcHBsZSBBcHAgQXR0ZXN0YXRpb24gUm9vdCBDQTETMBEGA1UECgwK
QXBwbGUgSW5jLjETMBEGA1UECAwKQ2FsaWZvcm5pYTAeFw0yMDAzMTgxODMyNTNa
Fw00NTAzMTUwMDAwMDBaMFIxJjAkBgNVBAMMHUFwcGxlIEFwcCBBdHRlc3RhdGlv
biBSb290IENBMRMwEQYDVQQKDApBcHBsZSBJbmMuMRMwEQYDVQQIDApDYWxpZm9y
bmlhMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAERTHhmLW07ATaFQIEVwTtT4dyctdh
NbJhFs/Ii2FdCgAHGbpphY3+d8qjuDngIN3WVhQUBHAoMeQ/cLiP1sOUtgjqK9au
Yen1mMEvRq9Sk3Jm5X8U62H+xTD3FE9TgS41o0IwQDAPBgNVHRMBAf8EBTADAQH/
MB0GA1UdDgQWBBSskRBTM72+aEH/pwyp5frq5eWKoTAOBgNVHQ8BAf8EBAMCAQYw
CgYIKoZIzj0EAwMDaAAwZQIwQgFGnByvsiVbpTKwSga0kP0e8EeDS4+sQmTvb7vn
53O5+FRXgeLhpJ06ysC5PrOyAjEAp5U4xDgEgllF7En3VcE3iexZZtKeYnpqtijV
oyFraWVIyd/dganmrduC1bmTBGwD
-----END CERTIFICATE-----`;

const NONCE_OID = Buffer.from([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x08, 0x02]);
const AAGUID_PRODUCTION = Buffer.concat([Buffer.from("appattest"), Buffer.alloc(7)]);
const AAGUID_DEVELOPMENT = Buffer.from("appattestdevelop");

const sha256 = (...parts: Uint8Array[]) => {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest();
};
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && timingSafeEqual(a, b);

export type AttestRefusal = "malformed" | "chain" | "nonce" | "key_id" | "app_id" | "counter" | "environment" | "credential";

export interface AttestedKey {
  keyId: string;
  /** Clé publique (SPKI DER, base64) à garder pour vérifier les assertions. */
  publicKey: string;
  counter: number;
  environment: "production" | "development";
}

/** Lit l'extension « nonce » d'Apple dans un certificat DER : SEQUENCE { [1] { OCTET STRING } }. */
export function attestationNonce(certDer: Uint8Array): Buffer | null {
  const der = Buffer.from(certDer);
  const at = der.indexOf(NONCE_OID);
  if (at < 0) return null;
  let p = at + NONCE_OID.length;
  // Facultatif : BOOLEAN « critique ».
  if (der[p] === 0x01) p += 2 + der[p + 1]!;
  if (der[p] !== 0x04) return null; // extnValue : OCTET STRING
  const readLen = (i: number): [number, number] => {
    const b = der[i]!;
    if (b < 0x80) return [b, i + 1];
    const n = b & 0x7f;
    let v = 0;
    for (let k = 0; k < n; k++) v = v * 256 + der[i + 1 + k]!;
    return [v, i + 1 + n];
  };
  let [, q] = readLen(p + 1);
  if (der[q] !== 0x30) return null; // SEQUENCE
  [, q] = readLen(q + 1);
  if (der[q] !== 0xa1) return null; // [1] EXPLICIT
  [, q] = readLen(q + 1);
  if (der[q] !== 0x04) return null; // OCTET STRING
  const [len, start] = readLen(q + 1);
  if (len !== 32) return null;
  return der.subarray(start, start + 32);
}

function parseAuthData(authData: Uint8Array) {
  if (authData.length < 37) return null;
  const buf = Buffer.from(authData);
  const parsed = { rpIdHash: buf.subarray(0, 32), flags: buf[32]!, counter: buf.readUInt32BE(33), aaguid: null as Buffer | null, credentialId: null as Buffer | null };
  if (buf.length >= 55) {
    parsed.aaguid = buf.subarray(37, 53);
    const len = buf.readUInt16BE(53);
    if (buf.length >= 55 + len) parsed.credentialId = buf.subarray(55, 55 + len);
  }
  return parsed;
}

/** Raw public key point (65 bytes) of an EC certificate, as App Attest hashes it for the key id. */
function uncompressedPoint(cert: X509Certificate): Buffer | null {
  const jwk = cert.publicKey.export({ format: "jwk" }) as { kty?: string; crv?: string; x?: string; y?: string };
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y) return null;
  return Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]);
}

function chainOk(certs: X509Certificate[], root: X509Certificate, now: Date): boolean {
  const all = [...certs, root];
  for (let i = 0; i < all.length - 1; i++) {
    const child = all[i]!;
    const parent = all[i + 1]!;
    if (!child.checkIssued(parent) || !child.verify(parent.publicKey)) return false;
  }
  return all.every((c) => new Date(c.validFrom) <= now && now <= new Date(c.validTo));
}

export function verifyAttestation(input: {
  attestation: string;
  keyId: string;
  challenge: string;
  appId: string;
  allowDevelopment?: boolean;
  rootPem?: string;
  now?: Date;
}): { ok: true; key: AttestedKey } | { ok: false; reason: AttestRefusal } {
  let obj: Cbor;
  try {
    obj = decodeCbor(Buffer.from(input.attestation, "base64"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!(obj instanceof Map) || obj.get("fmt") !== "apple-appattest") return { ok: false, reason: "malformed" };
  const stmt = obj.get("attStmt");
  const authData = obj.get("authData");
  const x5c = stmt instanceof Map ? stmt.get("x5c") : null;
  if (!(authData instanceof Uint8Array) || !Array.isArray(x5c) || x5c.length < 2 || !x5c.every((c) => c instanceof Uint8Array)) return { ok: false, reason: "malformed" };

  let certs: X509Certificate[];
  let root: X509Certificate;
  try {
    certs = (x5c as Uint8Array[]).map((c) => new X509Certificate(Buffer.from(c)));
    root = new X509Certificate(input.rootPem ?? APPLE_APP_ATTEST_ROOT_PEM);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  // 1. chaîne
  if (!chainOk(certs, root, input.now ?? new Date())) return { ok: false, reason: "chain" };
  // 2. nonce
  const nonce = sha256(authData, sha256(Buffer.from(input.challenge, "utf8")));
  const certNonce = attestationNonce(x5c[0] as Uint8Array);
  if (!certNonce || !same(certNonce, nonce)) return { ok: false, reason: "nonce" };
  // 3. keyId
  const point = uncompressedPoint(certs[0]!);
  const keyId = Buffer.from(input.keyId, "base64");
  if (!point || !same(sha256(point), keyId)) return { ok: false, reason: "key_id" };
  const auth = parseAuthData(authData);
  if (!auth) return { ok: false, reason: "malformed" };
  // 4. application
  if (!same(auth.rpIdHash, sha256(Buffer.from(input.appId, "utf8")))) return { ok: false, reason: "app_id" };
  // 5. compteur
  if (auth.counter !== 0) return { ok: false, reason: "counter" };
  // 6. environnement
  const production = auth.aaguid && same(auth.aaguid, AAGUID_PRODUCTION);
  const development = auth.aaguid && same(auth.aaguid, AAGUID_DEVELOPMENT);
  if (!production && !(development && input.allowDevelopment)) return { ok: false, reason: "environment" };
  // 7. identifiant de la clé
  if (!auth.credentialId || !same(auth.credentialId, keyId)) return { ok: false, reason: "credential" };

  const publicKey = certs[0]!.publicKey.export({ format: "der", type: "spki" }).toString("base64");
  return { ok: true, key: { keyId: input.keyId, publicKey, counter: 0, environment: production ? "production" : "development" } };
}

export type AssertRefusal = "malformed" | "signature" | "app_id" | "counter";

export function verifyAssertion(input: {
  assertion: string;
  challenge: string;
  appId: string;
  publicKey: string;
  previousCounter: number;
}): { ok: true; counter: number } | { ok: false; reason: AssertRefusal } {
  let obj: Cbor;
  try {
    obj = decodeCbor(Buffer.from(input.assertion, "base64"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const signature = obj instanceof Map ? obj.get("signature") : null;
  const authenticatorData = obj instanceof Map ? obj.get("authenticatorData") : null;
  if (!(signature instanceof Uint8Array) || !(authenticatorData instanceof Uint8Array)) return { ok: false, reason: "malformed" };
  const auth = parseAuthData(authenticatorData);
  if (!auth) return { ok: false, reason: "malformed" };

  const nonce = sha256(authenticatorData, sha256(Buffer.from(input.challenge, "utf8")));
  let valid = false;
  try {
    const key = createPublicKey({ key: Buffer.from(input.publicKey, "base64"), format: "der", type: "spki" });
    // L'appareil signe SHA256(nonce) : verify() refait ce hachage.
    valid = verifySignature("sha256", nonce, key, Buffer.from(signature));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: "signature" };
  if (!same(auth.rpIdHash, sha256(Buffer.from(input.appId, "utf8")))) return { ok: false, reason: "app_id" };
  if (auth.counter <= input.previousCounter) return { ok: false, reason: "counter" };
  return { ok: true, counter: auth.counter };
}
