import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { findLeakedValues, findSecretPatterns, parseEnvFile, serverOnlyValues } from "../scripts/bundle-secrets";

/** Aucun secret dans le bundle du navigateur (2026-11-14). Le contrôle de `dist/` tourne en CI après le build. */
const ROOT = join(import.meta.dir, "..");

describe("formes de clés reconnues", () => {
  // Fausses clés, fabriquées ici : aucune n'ouvre quoi que ce soit.
  const fakes: Array<[string, string]> = [
    ["clé Anthropic", `sk-ant-api03-${"a".repeat(40)}`],
    ["clé Stripe secrète", `sk_live_${"A1".repeat(12)}`],
    ["secret de webhook Stripe", `whsec_${"b".repeat(32)}`],
    ["clé ElevenLabs", `sk_${"0f".repeat(24)}`],
    ["jeton Replicate", `r8_${"c".repeat(37)}`],
    ["jeton GitHub", `ghp_${"d".repeat(36)}`],
    ["clé privée", "-----BEGIN PRIVATE KEY-----"],
    ["jeton JWT", `eyJ${"e".repeat(20)}.eyJ${"f".repeat(20)}.${"g".repeat(30)}`],
    ["adresse de la base Turso", "libsql://tred-prod-xyz.turso.io"],
  ];

  test.each(fakes)("%s", (name, value) => {
    const found = findSecretPatterns(`const x="${value}";`);
    expect(found.map((f) => f.name)).toContain(name);
    // Le rapport ne recopie jamais le secret entier.
    for (const f of found) expect(f.excerpt).not.toContain(value.slice(8));
  });

  test("ce qui est public ne déclenche rien", () => {
    const publicStuff = ['posthog.init("phc_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdef")', 'dsn:"https://abc123@o1.ingest.sentry.io/42"', 'client:"ca-pub-3798289534690178"', "pk_live_51AbCdEfGhIjKlMnOpQrStUv", "risk_level:skip_task_token"];
    for (const s of publicStuff) expect(findSecretPatterns(s)).toEqual([]);
  });
});

describe("valeurs des variables serveur", () => {
  const env = parseEnvFile('ANTHROPIC_API_KEY="valeur-secrete-de-test-0123456789"\nVITE_POSTHOG_KEY=phc_public_public_public_public\nPORT=3000\nNODE_ENV=production\n# commentaire\nDATABASE_AUTH_TOKEN=jeton-de-base-0123456789abcdef\n');

  test("seules les variables secrètes et longues sont comparées, jamais VITE_*", () => {
    expect(serverOnlyValues(env).map((s) => s.key).sort()).toEqual(["ANTHROPIC_API_KEY", "DATABASE_AUTH_TOKEN"]);
  });

  test("une valeur retrouvée dans le bundle est signalée par son NOM", () => {
    const bundle = 'fetch("/x",{headers:{"x-api-key":"valeur-secrete-de-test-0123456789"}})';
    expect(findLeakedValues(bundle, serverOnlyValues(env))).toEqual(["ANTHROPIC_API_KEY"]);
    expect(findLeakedValues("rien à signaler", serverOnlyValues(env))).toEqual([]);
  });
});

describe("le code du navigateur ne lit que des variables publiques", () => {
  const WEB = join(ROOT, "src/web");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
    });
  const sources = walk(WEB).map((f) => [f.slice(WEB.length + 1), readFileSync(f, "utf8")] as const);

  test("import.meta.env : uniquement VITE_* et les drapeaux de Vite", () => {
    const allowed = /^(VITE_[A-Z0-9_]+|MODE|DEV|PROD|SSR|BASE_URL)$/;
    const bad: string[] = [];
    for (const [file, src] of sources) {
      for (const m of src.matchAll(/import\.meta\.env\.([A-Za-z0-9_]+)/g)) if (!allowed.test(m[1]!)) bad.push(`${file} : ${m[1]}`);
    }
    expect(bad).toEqual([]);
  });

  test("aucun process.env de secret dans src/web", () => {
    const bad: string[] = [];
    for (const [file, src] of sources) {
      for (const m of src.matchAll(/process\.env\.([A-Z0-9_]*(?:SECRET|TOKEN|API_KEY|PASSWORD)[A-Z0-9_]*)/g)) bad.push(`${file} : ${m[1]}`);
    }
    expect(bad).toEqual([]);
  });

  test("la CI lance le contrôle du bundle après le build", () => {
    const ci = readFileSync(join(ROOT, "../../.github/workflows/ci.yml"), "utf8");
    expect(ci.indexOf("check-bundle-secrets.ts")).toBeGreaterThan(ci.indexOf("Build de production"));
  });
});
