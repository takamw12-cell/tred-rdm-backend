// Fabrique une attestation App Attest de TEST (fausse racine, jamais celle d'Apple),
// pour tests/app-integrity.test.ts. À lancer avec node (openssl requis) :
//     node tests/fixtures/app-attest/make-fixture.mjs
// Écrit fixture.json à côté. Les clés sont jetables et n'ouvrent rien.
import { execFileSync } from "node:child_process";
import { createHash, createPrivateKey, createPublicKey } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "attest-"));
const ssl = (...args) => execFileSync("openssl", args, { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
const sha256 = (...parts) => parts.reduce((h, p) => h.update(p), createHash("sha256")).digest();

const APP_ID = "TEAMID1234.de.tred.app";
const CHALLENGE = "tred-test-challenge-0001";

ssl("req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-384", "-nodes", "-keyout", "root.key", "-out", "root.pem", "-subj", "/CN=TRED TEST App Attestation Root CA", "-days", "7300", "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign");
ssl("req", "-new", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-384", "-nodes", "-keyout", "int.key", "-out", "int.csr", "-subj", "/CN=TRED TEST App Attestation CA 1");
writeFileSync(join(dir, "int.ext"), "basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n");
ssl("x509", "-req", "-in", "int.csr", "-CA", "root.pem", "-CAkey", "root.key", "-CAcreateserial", "-out", "int.pem", "-days", "7300", "-extfile", "int.ext");
ssl("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", "leaf.key");
ssl("req", "-new", "-key", "leaf.key", "-out", "leaf.csr", "-subj", "/CN=tred-test-device-key");

const leafKey = createPrivateKey(readFileSync(join(dir, "leaf.key")));
const jwk = createPublicKey(leafKey).export({ format: "jwk" });
const point = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]);
const keyId = sha256(point);

const counter = Buffer.alloc(4);
const credLen = Buffer.alloc(2);
credLen.writeUInt16BE(32);
// La clé COSE n'est pas lue par le serveur (il prend celle du certificat) : quelques octets suffisent.
const cose = Buffer.from([0xa0]);
const authData = (aaguid) => Buffer.concat([sha256(Buffer.from(APP_ID)), Buffer.from([0x41]), counter, aaguid, credLen, keyId, cose]);

function leafFor(aad, name) {
  const nonce = sha256(aad, sha256(Buffer.from(CHALLENGE)));
  writeFileSync(join(dir, `${name}.ext`), `1.2.840.113635.100.8.2=DER:3024A1220420${nonce.toString("hex").toUpperCase()}\n`);
  ssl("x509", "-req", "-in", "leaf.csr", "-CA", "int.pem", "-CAkey", "int.key", "-CAcreateserial", "-out", `${name}.pem`, "-days", "7300", "-extfile", `${name}.ext`);
  return ssl("x509", "-in", `${name}.pem`, "-outform", "DER");
}

// CBOR à la main : { "fmt": "apple-appattest", "attStmt": { "x5c": [leaf, int], "receipt": h'' }, "authData": … }
const bstr = (b) => (b.length < 24 ? Buffer.from([0x40 | b.length]) : b.length < 256 ? Buffer.from([0x58, b.length]) : Buffer.from([0x59, b.length >> 8, b.length & 255]));
const tstr = (s) => Buffer.concat([Buffer.from([0x60 | s.length]), Buffer.from(s)]);
const bytes = (b) => Buffer.concat([bstr(b), b]);
function attestation(aad, leafDer, intDer) {
  return Buffer.concat([Buffer.from([0xa3]), tstr("fmt"), tstr("apple-appattest"), tstr("attStmt"), Buffer.from([0xa2]), tstr("x5c"), Buffer.from([0x82]), bytes(leafDer), bytes(intDer), tstr("receipt"), bytes(Buffer.alloc(0)), tstr("authData"), bytes(aad)]).toString("base64");
}
const intDer = ssl("x509", "-in", "int.pem", "-outform", "DER");
const prodAuth = authData(Buffer.concat([Buffer.from("appattest"), Buffer.alloc(7)]));
const devAuth = authData(Buffer.from("appattestdevelop"));

writeFileSync(
  join(here, "fixture.json"),
  JSON.stringify(
    {
      note: "Attestation App Attest de TEST, fabriquée par make-fixture.mjs avec une fausse racine. Clés jetables.",
      appId: APP_ID,
      challenge: CHALLENGE,
      keyId: keyId.toString("base64"),
      rootPem: readFileSync(join(dir, "root.pem"), "utf8"),
      attestationProduction: attestation(prodAuth, leafFor(prodAuth, "leafprod"), intDer),
      attestationDevelopment: attestation(devAuth, leafFor(devAuth, "leafdev"), intDer),
      devicePrivateKeyPem: leafKey.export({ format: "pem", type: "pkcs8" }),
    },
    null,
    2,
  ) + "\n",
);
console.log("fixture.json écrit");
