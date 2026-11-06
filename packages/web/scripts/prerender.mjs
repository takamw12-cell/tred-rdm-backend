#!/usr/bin/env bun
/**
 * Pré-rendu des pages publiques — lancé après `vite build` (voir package.json).
 *
 *   1. sert dist/ en local (fichiers + repli SPA ; l'API est simulée : un
 *      visiteur sans compte, sans backend ni base) ;
 *   2. ouvre chaque route publique (scripts/seo-routes.mjs) dans Chromium
 *      (Playwright) et attend que React ait tout rendu ;
 *   3. écrit dist/prerendered/<page>.html : le SHELL d'origine (mêmes balises
 *      <script>, l'app redevient interactive), avec le contenu rendu dans
 *      #root et un <title> / une description propres à la page.
 *   4. écrit dist/sitemap.xml, et dist/ads.txt depuis VITE_ADSENSE_CLIENT_ID
 *      s'il est défini (sinon public/ads.txt reste tel quel).
 *
 * Le serveur (src/__server.ts) sert dist/prerendered/<page>.html pour
 * /<page>. dist/index.html n'est PAS touché : c'est le repli de toutes les
 * routes de l'app.
 *
 * Échec « doux » par défaut : sans Chromium (machine de dev, image sans
 * navigateur), le build continue et le site reste une SPA classique — le
 * message le dit en clair. PRERENDER_STRICT=1 transforme l'échec en erreur.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { ROUTES, SITE, fileNameFor } from "./seo-routes.mjs";

const DIST = resolve(import.meta.dir, "..", "dist");
const OUT = join(DIST, "prerendered");
const STRICT = process.env.PRERENDER_STRICT === "1";
const log = (...a) => console.log("[prerender]", ...a);

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ── Fichiers SEO, indépendants du navigateur ───────────────────────────── */

async function writeSeoFiles() {
  const urls = ROUTES.map(
    (r) => `  <url>\n    <loc>${esc(SITE + r.path)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${r.priority}</priority>\n  </url>`,
  ).join("\n");
  await writeFile(
    join(DIST, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
  );

  // « ca-pub-1234567890123456 » → « pub-1234567890123456 ».
  const client = (process.env.VITE_ADSENSE_CLIENT_ID || process.env.ADSENSE_PUBLISHER_ID || "").trim();
  const pub = client.match(/pub-\d{10,20}/)?.[0];
  if (pub) {
    await writeFile(join(DIST, "ads.txt"), `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`);
    log(`ads.txt écrit pour ${pub}`);
  } else {
    log("ads.txt : VITE_ADSENSE_CLIENT_ID absent — public/ads.txt (modèle) conservé");
  }
  log(`sitemap.xml : ${ROUTES.length} pages (${SITE})`);
}

/* ── Serveur local du build ─────────────────────────────────────────────── */

function startServer() {
  const shell = join(DIST, "index.html");
  // Réponses d'API d'un visiteur SANS compte : le pré-rendu ne doit jamais
  // contenir les données de qui que ce soit.
  const api = (path) => {
    if (path.startsWith("/api/auth/get-session")) return Response.json(null);
    if (path === "/api/config") return Response.json({ publicSignup: true, inviteRequired: false, emailVerification: true });
    return Response.json({ error: "prerender" }, { status: 503 });
  };
  return Bun.serve({
    port: 0,
    async fetch(req) {
      const { pathname } = new URL(req.url);
      if (pathname.startsWith("/api/")) return api(pathname);
      const file = Bun.file(join(DIST, decodeURIComponent(pathname).replace(/^\/+/, "").replaceAll("..", "")));
      if (pathname !== "/" && (await file.exists())) return new Response(file);
      return new Response(Bun.file(shell), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    },
  });
}

/* ── Assemblage : shell d'origine + contenu + métadonnées ───────────────── */

export function assemble(shell, route, rootHtml) {
  const url = SITE + route.path;
  let html = shell
    .replace(/<html lang="[^"]*"/, `<html lang="${route.lang}"`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(route.title)}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${esc(route.description)}$2`)
    .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/, `$1${esc(route.title)}$2`)
    .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/, `$1${esc(route.description)}$2`)
    .replace("</head>", `\t<link rel="canonical" href="${esc(url)}" />\n\t\t<meta property="og:url" content="${esc(url)}" />\n\t</head>`)
    .replace('<div id="root"></div>', `<div id="root" data-prerendered="${esc(route.path)}">${rootHtml}</div>`);
  // Le shell n'a pas de balise description multiligne garantie : on la pose si absente.
  if (!/<meta\s+name="description"/.test(html)) {
    html = html.replace("</head>", `\t<meta name="description" content="${esc(route.description)}" />\n\t</head>`);
  }
  return html;
}

/* ── Rendu ──────────────────────────────────────────────────────────────── */

async function main() {
  if (!existsSync(join(DIST, "index.html"))) throw new Error("dist/index.html absent — lancer `vite build` d'abord");
  await writeSeoFiles();

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return soft("paquet playwright introuvable");
  }

  const shell = await readFile(join(DIST, "index.html"), "utf8");
  if (!shell.includes('<div id="root"></div>')) throw new Error('shell inattendu : <div id="root"></div> introuvable');

  const server = startServer();
  const base = `http://localhost:${server.port}`;
  let browser;
  try {
    // PRERENDER_CHANNEL=msedge : utilise Edge/Chrome déjà installé (poste de dev).
    const channel = process.env.PRERENDER_CHANNEL;
    browser = await chromium.launch(channel ? { channel } : {});
  } catch (e) {
    server.stop(true);
    return soft(`Chromium indisponible (${String(e.message).split("\n")[0]}) — \`bunx playwright install chromium\``);
  }

  await mkdir(OUT, { recursive: true });
  let done = 0;
  try {
    for (const route of ROUTES) {
      const ctx = await browser.newContext({ locale: route.lang === "fr" ? "fr-FR" : "de-DE", viewport: { width: 1280, height: 900 } });
      // Choix d'analyse déjà fait : pas de bannière de consentement figée dans le HTML.
      await ctx.addInitScript(() => {
        try {
          localStorage.setItem("tred-analytics-consent", "denied");
        } catch {
          /* ignore */
        }
      });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(base + route.path, { waitUntil: "networkidle", timeout: 30_000 });
      await page.waitForSelector("#root h1, #root h2", { timeout: 15_000 });
      // Laisse finir les animations d'entrée : sinon le HTML figé garderait
      // des styles « opacity: 0 » posés par framer-motion.
      await page.waitForTimeout(1_500);
      const rootHtml = await page.$eval("#root", (el) => el.innerHTML);
      const text = await page.$eval("#root", (el) => el.innerText.replace(/\s+/g, " ").trim());
      await ctx.close();

      if (text.length < 200) throw new Error(`${route.path} : contenu trop court (${text.length} caractères) — page vide ou écran de connexion ?`);
      if (errors.length) log(`${route.path} : erreurs JS pendant le rendu →`, errors.slice(0, 2));

      await writeFile(join(OUT, `${fileNameFor(route.path)}.html`), assemble(shell, route, rootHtml));
      done++;
      log(`${route.path.padEnd(13)} → prerendered/${fileNameFor(route.path)}.html (${text.length} caractères de texte)`);
    }
  } finally {
    await browser.close();
    server.stop(true);
  }
  log(`${done}/${ROUTES.length} pages pré-rendues`);
}

function soft(reason) {
  const msg = `pré-rendu SAUTÉ : ${reason}. Le site reste une SPA (sitemap et ads.txt sont écrits).`;
  if (STRICT) throw new Error(msg);
  console.warn(`[prerender] ⚠ ${msg}`);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error("[prerender] ÉCHEC :", e.message);
    process.exit(STRICT ? 1 : 0);
  });
}
