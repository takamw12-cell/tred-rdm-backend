import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error — script .mjs du build, sans déclaration de types
import { assemble } from "../scripts/prerender.mjs";
// @ts-expect-error — idem
import { ROUTES, fileNameFor } from "../scripts/seo-routes.mjs";

const ROOT = join(import.meta.dir, "..");
const shell = readFileSync(join(ROOT, "index.html"), "utf8");
type Route = { path: string; lang: string; title: string; description: string };

describe("pré-rendu : assemblage du HTML", () => {
  const route: Route = ROUTES.find((r: Route) => r.path === "/security");
  const html: string = assemble(shell, route, "<main><h1>Sicherheit</h1><p>Text & mehr</p></main>");

  test("garde les <script> d'origine (l'app redevient interactive)", () => {
    const scripts = (s: string) => s.match(/<script[^>]*>/g) ?? [];
    expect(scripts(html)).toEqual(scripts(shell));
  });
  test("contenu dans #root, marqué", () => {
    expect(html).toContain('<div id="root" data-prerendered="/security"><main><h1>Sicherheit</h1>');
  });
  test("titre, description, canonical, langue propres à la page (échappés)", () => {
    expect(html).toContain("<title>Sicherheit &amp; Datenschutz — TRED</title>");
    expect(html).toContain(`content="${route.description}"`);
    expect(html).toContain('<link rel="canonical" href="https://www.tred-tutor.de/security" />');
    expect(html).toContain('<html lang="de"');
    expect(html.match(/name="description"/g)).toHaveLength(1);
  });
});

describe("routes pré-rendues", () => {
  test("uniquement des pages publiques, noms de fichiers sûrs", () => {
    for (const r of ROUTES as Route[]) {
      expect(["/dashboard", "/chat", "/exercises", "/settings"]).not.toContain(r.path);
      expect(fileNameFor(r.path)).toMatch(/^[a-z0-9-]+$/);
      expect(r.description.length).toBeGreaterThan(50);
      expect(r.description.length).toBeLessThanOrEqual(200);
    }
  });
});

describe("page d'accueil `/`", () => {
  const root: Route = ROUTES.find((r: Route) => r.path === "/");
  const landing: Route & { canonical?: string; sitemap?: boolean } = ROUTES.find((r: Route) => r.path === "/landing");

  test("pré-rendue dans prerendered/index.html, jamais dans dist/index.html", () => {
    expect(fileNameFor("/")).toBe("index");
    // Allemand : le public visé d'abord, et la langue par défaut de l'interface.
    expect(root.lang).toBe("de");
  });
  test("canonical sur la racine du site", () => {
    const html: string = assemble(shell, root, "<main><h1>TRED</h1></main>");
    expect(html).toContain('<link rel="canonical" href="https://www.tred-tutor.de/" />');
    expect(html).toContain('data-prerendered="/"');
  });
  test("/landing : même page, canonical vers `/`, hors du sitemap", () => {
    expect(landing.canonical).toBe("/");
    expect(landing.sitemap).toBe(false);
    const html: string = assemble(shell, landing, "<main><h1>TRED</h1></main>");
    expect(html).toContain('<link rel="canonical" href="https://www.tred-tutor.de/" />');
  });
});

describe("fichiers pour les robots", () => {
  test("ads.txt : format IAB de Google", () => {
    const ads = readFileSync(join(ROOT, "public", "ads.txt"), "utf8").trim();
    expect(ads).toMatch(/^google\.com, pub-[0-9X]{16}, DIRECT, f08c47fec0942fa0$/);
  });
  test("robots.txt : Googlebot et Mediapartners-Google autorisés, sitemap déclaré", () => {
    const robots = readFileSync(join(ROOT, "public", "robots.txt"), "utf8");
    expect(robots).toMatch(/User-agent: Googlebot\nAllow: \//);
    expect(robots).toMatch(/User-agent: Mediapartners-Google\nAllow: \//);
    expect(robots).toContain("Sitemap: https://www.tred-tutor.de/sitemap.xml");
  });
  test("le shell a un <noscript> lisible et un titre explicite", () => {
    expect(shell).toContain("<noscript>");
    expect(shell).toContain("<title>TRED — KI-Tutor für das Ingenieurstudium</title>");
  });
});
