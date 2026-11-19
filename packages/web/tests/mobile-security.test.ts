import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CDN_FILES, scriptSafeJson, WEBVIEW_CSP } from "../../mobile/lib/webview-safety";

/** Audit OWASP MASVS de l'app mobile (19 nov. 2026) : ce qui a été corrigé reste corrigé. */
const read = (p: string) => readFileSync(join(import.meta.dir, "../../mobile", p), "utf8");

describe("MASVS-PLATFORM : la WebView des formules", () => {
  test("une réponse contenant </script> ne ferme plus le script, et le texte reste identique", () => {
    const evil = 'Lösung: x = 1 </script><script>alert(1)</script> \\frac{a}{b} & <b>   fin';
    const json = scriptSafeJson(evil);
    expect(json).not.toContain("</script");
    expect(json).not.toContain("<");
    expect(json).not.toContain(" ");
    expect(JSON.parse(json)).toBe(evil);
  });

  test("scripts et feuille du CDN avec empreinte SRI, politique de contenu stricte", () => {
    for (const f of Object.values(CDN_FILES)) {
      expect(f.src.startsWith("https://cdn.jsdelivr.net/npm/")).toBe(true);
      expect(f.integrity).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/);
    }
    expect(WEBVIEW_CSP).toContain("connect-src 'none'");
    expect(WEBVIEW_CSP).toContain("default-src 'none'");
    const rich = read("components/chat/RichText.tsx");
    expect(rich).toContain("const payload = scriptSafeJson(markdown);");
    expect(rich).toContain("s.integrity = integrity; s.crossOrigin = 'anonymous';");
    expect(rich).toContain('<meta http-equiv="Content-Security-Policy" content="${WEBVIEW_CSP}">');
    expect(rich).toContain('onShouldStartLoadWithRequest={(r) => r.url === "about:blank"}');
    expect(rich).not.toContain("JSON.stringify(markdown)");
  });
});

describe("MASVS-AUTH / STORAGE / NETWORK", () => {
  test("le client typé (oRPC) joint le cookie de session et les en-têtes d'intégrité", () => {
    const api = read("lib/api.ts");
    expect(api).toContain("const cookie = await authClient.getCookie();");
    expect(api).toContain("headers: async () => {");
    expect(api).toContain("await integrityHeaders()");
    expect(read("app/chat/[id].tsx")).toContain("await integrityHeaders()");
    expect(read("lib/auth-client.ts")).toContain("onRequest: async (context) => {");
  });

  test("session dans le trousseau / Keystore, pas de sauvegarde Android, API en HTTPS", () => {
    expect(read("lib/auth-client.ts")).toContain("getItemAsync: (key) => SecureStore.getItemAsync(key)");
    const app = JSON.parse(read("app.json")).expo;
    expect(app.android.allowBackup).toBe(false);
    expect(app.extra.apiUrl.startsWith("https://")).toBe(true);
    expect(read("eas.json")).not.toMatch(/http:\/\//);
  });

  test("intégrité : module officiel Expo à version exacte, entitlement App Attest en production", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.dependencies["@expo/app-integrity"]).toBe("0.1.10");
    const app = JSON.parse(read("app.json")).expo;
    expect(app.ios.entitlements["com.apple.developer.devicecheck.appattest-environment"]).toBe("production");
    const client = read("lib/app-integrity.ts");
    // Jamais bloquant : toute panne rend « pas de jeton ».
    expect(client).toContain("} catch {\n      failedAt = Date.now();\n      return null;");
  });
});
