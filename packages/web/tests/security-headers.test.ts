import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CSP_BASELINE, buildCsp, cspHeaders, inlineScriptHashes, judgeOrigin, originAllowed, withoutCors } from "../src/api/lib/security-headers";

/** CORS restreint et Content-Security-Policy (2026-11-14). */
const TRUSTED = ["https://www.tred-tutor.de", "https://tred-tutor.de", "tred://", "exp://"];
const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");

describe("origines de confiance", () => {
  test("le site, avec ou sans barre finale", () => {
    expect(originAllowed("https://www.tred-tutor.de", TRUSTED)).toBe(true);
    expect(originAllowed("https://www.tred-tutor.de/", TRUSTED)).toBe(true);
  });

  test("un domaine qui ressemble au nôtre n'est pas le nôtre", () => {
    for (const evil of ["https://www.tred-tutor.de.evil.example", "https://evil.example", "http://www.tred-tutor.de", "https://tred-tutor.de.evil.example", "null"]) {
      expect(originAllowed(evil, TRUSTED)).toBe(false);
    }
  });

  test("l'app mobile (schéma tred://)", () => {
    expect(originAllowed("tred://", TRUSTED)).toBe(true);
    expect(originAllowed("tred://auth/callback", TRUSTED)).toBe(true);
  });
});

describe("verdict par requête", () => {
  test("sans en-tête Origin (app mobile, webhook Stripe) : passe", () => {
    expect(judgeOrigin("POST", null, TRUSTED)).toBe("allow");
  });

  test("origine de confiance : passe", () => {
    expect(judgeOrigin("POST", "https://www.tred-tutor.de", TRUSTED)).toBe("allow");
  });

  test("écriture ou pré-vol depuis un autre site : refus", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) expect(judgeOrigin(m, "https://evil.example", TRUSTED)).toBe("deny");
  });

  test("lecture depuis un autre site : servie sans en-têtes CORS", () => {
    expect(judgeOrigin("GET", "https://evil.example", TRUSTED)).toBe("strip");
    const res = withoutCors(new Response("{}", { status: 200, headers: { "Access-Control-Allow-Origin": "https://evil.example", "Access-Control-Allow-Credentials": "true", "Content-Type": "application/json" } }));
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Vary")).toContain("Origin");
  });

  test("le serveur tranche avant l'application", () => {
    const server = read("src/__server.ts");
    expect(server).toContain('judgeOrigin(request.method, request.headers.get("origin"), TRUSTED_ORIGINS)');
    expect(server.indexOf('if (verdict === "deny")')).toBeLessThan(server.indexOf("await app.fetch(request)"));
  });
});

describe("Content-Security-Policy", () => {
  const csp = buildCsp({ scriptHashes: ["'sha256-abc='"], storageEndpoint: "https://compte.r2.cloudflarestorage.com/bucket" });
  const directive = (name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

  test("ni eval ni script inline libre", () => {
    expect(directive("script-src")).not.toContain("'unsafe-inline'");
    expect(directive("script-src")).not.toMatch(/'unsafe-eval'/);
    expect(directive("script-src")).toContain("'sha256-abc='");
    expect(directive("script-src")).toContain("'wasm-unsafe-eval'");
  });

  test("socle : pas de plugin, pas de <base> étranger, pas de cadre tiers", () => {
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(CSP_BASELINE).toBe("object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  });

  test("le stockage objet est autorisé pour lire les originaux", () => {
    expect(directive("connect-src")).toContain("https://compte.r2.cloudflarestorage.com");
    expect(directive("frame-src")).toContain("https://compte.r2.cloudflarestorage.com");
  });

  test("le film d'attente et les rapports", () => {
    expect(directive("media-src")).toContain("'self'");
    expect(csp).toContain("report-uri /api/csp-report");
  });

  test("le script de thème d'index.html est autorisé par son empreinte", () => {
    const html = read("index.html");
    const hashes = inlineScriptHashes(html);
    expect(hashes).toHaveLength(1);
    const inline = /<script>([\s\S]*?)<\/script>/.exec(html)![1]!;
    expect(hashes[0]).toBe(`'sha256-${createHash("sha256").update(inline).digest("base64")}'`);
    // Un script chargé par `src` ou des données JSON-LD ne comptent pas.
    expect(inlineScriptHashes('<script type="module" src="/a.js"></script><script type="application/ld+json">{"a":1}</script>')).toEqual([]);
  });

  test("en observation par défaut, bloquante avec CSP_ENFORCE=true", () => {
    expect(cspHeaders(csp, false)).toEqual({ "Content-Security-Policy": CSP_BASELINE, "Content-Security-Policy-Report-Only": csp });
    expect(cspHeaders(csp, true)).toEqual({ "Content-Security-Policy": csp });
  });

  test("les en-têtes existants restent en place", () => {
    const server = read("src/__server.ts");
    for (const h of ['"X-Content-Type-Options": "nosniff"', '"X-Frame-Options": "DENY"', '"Strict-Transport-Security"']) expect(server).toContain(h);
    // Pages et fichiers : politique complète. API : le socle.
    expect(server).toContain("const PAGE_HEADERS: Record<string, string> = { ...SECURITY_HEADERS, ...CSP }");
    expect(server).toContain('const API_HEADERS: Record<string, string> = { ...SECURITY_HEADERS, "Content-Security-Policy": CSP_BASELINE }');
  });
});
