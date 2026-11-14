import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UTM_HEADER, cleanUtm, cleanUtmValue, utmFromHeader, utmFromSearch, utmToHeader, utmToSearch } from "../src/api/lib/utm";

/**
 * Suivi des campagnes (2026-11-14) : les paramètres UTM du lien d'arrivée sont
 * rangés sur le compte à l'inscription — quelle vidéo a amené quel compte.
 */
const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");

describe("lecture d'un lien de campagne", () => {
  test("le lien d'une vidéo TikTok", () => {
    expect(utmFromSearch("?utm_source=tiktok&utm_medium=social&utm_campaign=survive-klausur&utm_content=sk1")).toEqual({
      source: "tiktok",
      medium: "social",
      campaign: "survive-klausur",
      content: "sk1",
    });
  });

  test("sans paramètre UTM : rien", () => {
    expect(utmFromSearch("")).toBeNull();
    expect(utmFromSearch("?ref=abc&page=2")).toBeNull();
    expect(utmFromSearch("?utm_source=")).toBeNull();
  });

  test("seules les cinq clés UTM sont gardées", () => {
    expect(cleanUtm({ source: "snapchat", role: "admin", userId: "u_1", content: "sk2" })).toEqual({ source: "snapchat", content: "sk2" });
    expect(cleanUtm(null)).toBeNull();
    expect(cleanUtm("tiktok")).toBeNull();
    expect(cleanUtm({ source: 42, content: ["sk1"] })).toBeNull();
  });
});

describe("une valeur UTM vient de l'URL : elle est nettoyée", () => {
  test("ni balise, ni guillemet, ni point-virgule", () => {
    expect(cleanUtmValue('<script>alert(1)</script>')).toBe("scriptalert1script");
    expect(cleanUtmValue(`sk1"; DROP TABLE user; --`)).toBe("sk1 DROP TABLE user --");
    // Les retours à la ligne disparaissent : rien ne peut ouvrir un second en-tête.
    expect(cleanUtmValue("sk1\r\nSet-Cookie: x=1")).toBe("sk1Set-Cookie x1");
  });

  test("80 caractères au plus, espaces réduits, vide refusé", () => {
    expect(cleanUtmValue("a".repeat(500))).toHaveLength(80);
    expect(cleanUtmValue("  die   klausur  morgen ")).toBe("die klausur morgen");
    expect(cleanUtmValue("   ")).toBeNull();
    expect(cleanUtmValue("<>")).toBeNull();
  });

  test("les lettres accentuées et les noms de campagne usuels passent", () => {
    expect(cleanUtmValue("Klausur_März-2027.v2")).toBe("Klausur_März-2027.v2");
  });
});

describe("aller-retour", () => {
  const utm = { source: "tiktok", campaign: "survive-klausur", content: "sk3" };

  test("en-tête de la requête d'inscription", () => {
    expect(UTM_HEADER).toBe("x-tred-utm");
    expect(utmFromHeader(utmToHeader(utm))).toEqual(utm);
    expect(utmFromHeader(null)).toBeNull();
    expect(utmFromHeader("pas du json")).toBeNull();
    expect(utmFromHeader("x".repeat(5000))).toBeNull();
    // Un en-tête forgé ne fait pas passer autre chose que des UTM propres.
    expect(utmFromHeader(encodeURIComponent(JSON.stringify({ source: "<b>x</b>", admin: true })))).toEqual({ source: "bxb" });
  });

  test("adresse de retour d'une connexion Google / Apple", () => {
    expect(utmToSearch(utm)).toBe("utm_source=tiktok&utm_campaign=survive-klausur&utm_content=sk3");
    expect(utmFromSearch(`?${utmToSearch(utm)}`)).toEqual(utm);
    expect(utmToSearch(null)).toBe("");
  });
});

describe("le navigateur n'écrit rien sur l'appareil sans consentement", () => {
  const client = read("src/web/lib/attribution.ts");

  test("sessionStorage seulement si l'analyse est acceptée, vidé sinon", () => {
    expect(client).toContain('if (consent === "granted" && memory) sessionStorage.setItem(STORE, JSON.stringify(memory));');
    expect(client).toContain('else if (consent !== "granted") sessionStorage.removeItem(STORE);');
    expect(client).toContain("onConsentChange(syncStore);");
    // Ni localStorage ni cookie : au plus la durée de l'onglet.
    expect(client).not.toMatch(/localStorage|document\.cookie/);
  });

  test("premier lien de la visite, lu avant le routeur", () => {
    expect(client).toContain("if (found && !currentUtm()) memory = found;");
    expect(read("src/web/main.tsx")).toContain("captureUtm();");
  });
});

describe("le serveur range l'origine une seule fois", () => {
  const lib = read("src/api/lib/attribution.ts");
  const api = read("src/api/index.ts");

  test("premier contact : jamais réécrit", () => {
    expect(lib).toContain("WHERE id = ${userId} AND utm_at IS NULL");
  });

  test("inerte tant que migre-utm.mjs n'a pas tourné", () => {
    expect(lib).toMatch(/if \(!missingColumn\(error\)\) throw error;\s+warnOnce\(\);\s+return "not_migrated";/);
    const migration = read("../../migre-utm.mjs");
    for (const col of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_at"]) expect(migration).toContain(`["${col}"`);
    expect(migration).toContain("pragma_table_info('user')");
  });

  test("l'inscription n'attend pas l'attribution et n'échoue pas à cause d'elle", () => {
    const signup = api.slice(api.indexOf('app.on(["GET", "POST"], "/api/auth/*"'), api.indexOf('app.post("/api/attribution"'));
    expect(signup).toContain("const res = await auth.handler(c.req.raw);");
    expect(signup).toContain("void res");
    expect(signup).toContain(".catch((error) =>");
    // La réponse d'origine est rendue telle quelle, quoi qu'il arrive à l'attribution.
    expect(signup).toMatch(/return res;\s*\}\);/);
  });

  test("POST /api/attribution : session exigée, compte de moins de 24 h, limite de débit", () => {
    const route = api.slice(api.indexOf('app.post("/api/attribution"'));
    expect(route.slice(0, 400)).toContain('return c.json({ error: "UNAUTHORIZED" }, 401)');
    expect(route.slice(0, 900)).toContain("24 * 60 * 60 * 1000");
    expect(api).toContain('app.use("/api/attribution", rateLimitMiddleware(');
  });

  test("l'export RGPD contient l'origine du compte", () => {
    expect(read("src/api/lib/gdpr.ts")).toContain("herkunft: await readAttribution(");
  });
});
