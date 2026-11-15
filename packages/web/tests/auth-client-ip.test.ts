import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { getIP } from "better-auth/api";
import { AUTH_IP_ADDRESS, SESSION_WITHOUT_IP } from "../src/api/lib/client-ip";

/**
 * La limite de débit de l'inscription et de la connexion (2026-11-15).
 *
 * Better Auth limite /sign-in, /sign-up, /change-password… à 3 requêtes par
 * 10 secondes ET PAR VISITEUR. Pour reconnaître le visiteur, il lit
 * `x-forwarded-for` — et depuis la 1.7.13 il ne le croit que s'il porte UNE
 * seule adresse. Derrière l'edge de Railway cet en-tête en porte plusieurs :
 * Better Auth ne reconnaissait donc personne, et rangeait TOUS les visiteurs
 * dans le même compteur (journal de production : « Rate limiting could not
 * determine a client IP … single shared per-path bucket »). Trois personnes
 * qui s'inscrivaient dans les mêmes dix secondes bloquaient la quatrième.
 *
 * Remède validé par le fondateur : lire `x-real-ip`, que l'edge de Railway
 * pose lui-même avec l'adresse du client (documentation Railway, « Specs &
 * Limits » ; l'equipe Railway le recommande pour une limite de débit).
 *
 * Et une conséquence qu'on ne veut pas : dès que Better Auth sait lire
 * l'adresse, il la range aussi dans chaque session. Rien n'en a besoin ici :
 * elle sert au compteur, en mémoire, dix secondes — elle n'est pas conservée.
 *
 * Les adresses de ce fichier sont des adresses de documentation (RFC 5737).
 */

const LENA = "203.0.113.10";
const JONAS = "203.0.113.20";
const MARA = "203.0.113.30";

type Options = Parameters<typeof betterAuth>[0];

function build(extra: Partial<Options> = {}) {
  const store = { user: [], session: [], account: [], verification: [] } as Record<string, Record<string, unknown>[]>;
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: "secret-de-test-".padEnd(40, "x"),
    database: memoryAdapter(store),
    emailAndPassword: { enabled: true },
    // En production la limite est allumée d'office ; ici on l'allume à la main.
    rateLimit: { enabled: true },
    ...extra,
  });
  return { auth, store };
}

/** Une requête telle qu'elle arrive de l'edge de Railway : deux adresses dans x-forwarded-for, une dans x-real-ip. */
function fromRailway(path: string, visitor: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:3000/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": `${visitor}, 100.64.0.9`, "x-real-ip": visitor, ...headers },
    body: JSON.stringify(body),
  });
}
const wrongLogin = (auth: ReturnType<typeof build>["auth"], visitor: string, headers?: Record<string, string>) =>
  auth.handler(fromRailway("/sign-in/email", visitor, { email: "niemand@example.de", password: "falsches-passwort" }, headers)).then((r) => r.status);

describe("le défaut : sans réglage, tous les visiteurs partagent un seul compteur", () => {
  test("trois tentatives de Lena bloquent Jonas, qui n'a rien fait", async () => {
    const { auth } = build();
    for (let i = 0; i < 3; i++) expect(await wrongLogin(auth, LENA)).not.toBe(429);
    expect(await wrongLogin(auth, JONAS)).toBe(429);
  });
});

describe("avec x-real-ip : un compteur par visiteur", () => {
  const { auth } = build({ advanced: { ipAddress: AUTH_IP_ADDRESS } });

  test("le réglage : l'en-tête que l'edge de Railway pose lui-même", () => {
    expect(AUTH_IP_ADDRESS).toEqual({ ipAddressHeaders: ["x-real-ip"] });
  });

  test("trois tentatives de Mara ne bloquent pas Jonas", async () => {
    for (let i = 0; i < 3; i++) expect(await wrongLogin(auth, MARA)).not.toBe(429);
    expect(await wrongLogin(auth, JONAS)).not.toBe(429);
  });

  test("la limite existe toujours : la quatrième tentative de Mara en dix secondes est refusée", async () => {
    expect(await wrongLogin(auth, MARA)).toBe(429);
  });

  test("chaque visiteur est reconnu à SON adresse", () => {
    const options = { advanced: { ipAddress: AUTH_IP_ADDRESS } };
    expect(getIP(fromRailway("/sign-in/email", LENA, {}), options)).toBe(LENA);
    expect(getIP(fromRailway("/sign-in/email", JONAS, {}), options)).toBe(JONAS);
  });

  test("un x-forwarded-for forgé par le visiteur ne compte pas : seul x-real-ip est lu", () => {
    const options = { advanced: { ipAddress: AUTH_IP_ADDRESS } };
    const forged = fromRailway("/sign-in/email", LENA, {}, { "x-forwarded-for": "198.51.100.99" });
    expect(getIP(forged, options)).toBe(LENA);
  });

  test("un x-real-ip à plusieurs adresses n'est pas cru (ce n'est pas ce que pose l'edge)", () => {
    const options = { advanced: { ipAddress: AUTH_IP_ADDRESS } };
    const odd = fromRailway("/sign-in/email", LENA, {}, { "x-real-ip": "198.51.100.1, 198.51.100.2" });
    const ip = getIP(odd, options);
    expect(ip).not.toBe("198.51.100.1");
    expect(ip).not.toBe("198.51.100.2");
  });
});

describe("l'adresse sert au compteur, elle n'est pas conservée", () => {
  const signUp = (auth: ReturnType<typeof build>["auth"], visitor: string, email: string) =>
    auth.handler(fromRailway("/sign-up/email", visitor, { name: "Lena Test", email, password: "ein-langes-passwort-42" }));

  test("témoin : sans notre crochet, Better Auth range l'adresse dans la session", async () => {
    const { auth, store } = build({ advanced: { ipAddress: AUTH_IP_ADDRESS } });
    expect((await signUp(auth, "203.0.113.41", "temoin@example.de")).status).toBe(200);
    expect(store.session).toHaveLength(1);
    expect(store.session[0].ipAddress).toBe("203.0.113.41");
  });

  test("avec le crochet de l'app : la session est créée, sans adresse", async () => {
    const { auth, store } = build({
      advanced: { ipAddress: AUTH_IP_ADDRESS },
      databaseHooks: { session: { create: { before: async () => SESSION_WITHOUT_IP } } },
    });
    expect((await signUp(auth, "203.0.113.42", "lena@example.de")).status).toBe(200);
    expect(store.session).toHaveLength(1);
    expect(store.session[0].ipAddress).toBe("");
    expect(JSON.stringify(store)).not.toContain("203.0.113.42");
  });
});

describe("branchement", () => {
  const AUTH = readFileSync(join(import.meta.dir, "../src/api/auth.ts"), "utf8");

  test("la configuration de l'app lit x-real-ip", () => {
    expect(AUTH).toContain("advanced: { ipAddress: AUTH_IP_ADDRESS }");
  });

  test("le crochet de création de session de l'app rend la session sans adresse — après le contrôle du compte bloqué", () => {
    const hook = AUTH.slice(AUTH.indexOf("session: {\n      create: {"), AUTH.indexOf("...(googleEnabled || appleEnabled"));
    expect(hook).toContain("ACCOUNT_DISABLED");
    expect(hook).toContain("return SESSION_WITHOUT_IP;");
    expect(hook.indexOf("ACCOUNT_DISABLED")).toBeLessThan(hook.indexOf("return SESSION_WITHOUT_IP;"));
  });
});
