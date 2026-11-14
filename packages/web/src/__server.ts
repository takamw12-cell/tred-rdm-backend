import app from "./api";
import { adminPageDenial } from "./api/lib/admin-guard";
import { TRUSTED_ORIGINS } from "./api/auth";
import { buildCsp, CSP_BASELINE, cspHeaders, inlineScriptHashes, judgeOrigin, withoutCors } from "./api/lib/security-headers";

const port = Number(process.env.PORT ?? 3000);
const distDir = `${import.meta.dir}/../dist`;
const indexPath = `${distDir}/index.html`;

/**
 * Content-Security-Policy (api/lib/security-headers.ts). Le seul script inline
 * de l'app (le thème, dans index.html) est autorisé par son empreinte, relue
 * du build au démarrage. Politique complète en « Report-Only » tant que
 * CSP_ENFORCE n'est pas « true » ; le socle, lui, est toujours appliqué.
 */
const htmlPages = [indexPath, ...(await Array.fromAsync(new Bun.Glob("prerendered/*.html").scan({ cwd: distDir, absolute: true })).catch(() => []))];
const builtHtml = (await Promise.all(htmlPages.map((p) => Bun.file(p).text().catch(() => "")))).join("\n");
const CSP = cspHeaders(
  buildCsp({ scriptHashes: inlineScriptHashes(builtHtml), storageEndpoint: process.env.S3_ENDPOINT, posthogHost: process.env.VITE_POSTHOG_HOST }),
  process.env.CSP_ENFORCE === "true",
);

/** En-têtes de sécurité, posés sur TOUTES les réponses (API et fichiers). */
const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(self), payment=(self)",
};

/**
 * Pages et fichiers statiques : la politique complète (un worker hérite de la
 * politique de SON fichier .js, d'où les fichiers aussi). Réponses de l'API :
 * le socle seulement — du JSON n'a rien à charger, et 1,5 Ko d'en-tête par
 * appel serait du poids pour rien.
 */
const PAGE_HEADERS: Record<string, string> = { ...SECURITY_HEADERS, ...CSP };
const API_HEADERS: Record<string, string> = { ...SECURITY_HEADERS, "Content-Security-Policy": CSP_BASELINE };

function withSecurityHeaders(response: Response, api: boolean): Response {
  const wanted = api ? API_HEADERS : PAGE_HEADERS;
  // Certaines réponses (fetch proxifié) ont des en-têtes immuables : copie.
  let res = response;
  try {
    for (const [k, v] of Object.entries(wanted)) {
      if (!res.headers.has(k)) res.headers.set(k, v);
    }
  } catch {
    res = new Response(response.body, response);
    for (const [k, v] of Object.entries(wanted)) res.headers.set(k, v);
  }
  return res;
}

const server = Bun.serve({
  port,
  // Bun ferme par défaut une connexion silencieuse depuis 10 s. Le chat est un
  // flux : pendant qu'il réfléchit à un circuit complexe, le modèle peut se
  // taire plus longtemps — la connexion tombait (« Verbindung unterbrochen »,
  // 5 novembre 2026). 255 s est le maximum accepté par Bun ; le battement de
  // la route du chat (api/index.ts) empêche de l'atteindre.
  idleTimeout: 255,
  async fetch(request) {
    return withSecurityHeaders(await handle(request), new URL(request.url).pathname.startsWith("/api"));
  },
});

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api")) {
    // CORS restreint aux origines de confiance (le site, l'app mobile, le
    // développement local). Une écriture venue d'ailleurs s'arrête ici ; une
    // lecture est servie sans en-têtes CORS, donc illisible pour le site appelant.
    const verdict = judgeOrigin(request.method, request.headers.get("origin"), TRUSTED_ORIGINS);
    if (verdict === "deny") {
      return new Response(JSON.stringify({ error: "ORIGIN_NOT_ALLOWED" }), { status: 403, headers: { "Content-Type": "application/json", Vary: "Origin" } });
    }
    const response = await app.fetch(request);
    return verdict === "strip" ? withoutCors(response) : response;
  }

  // /admin et /admin/* : vérifié ICI, avant de servir le moindre octet. Un
  // visiteur ou un étudiant reçoit un 404, comme si la page n'existait pas
  // (lib/admin-guard.ts : e-mail dans ADMIN_EMAILS ET rôle admin).
  const denied = await adminPageDenial(request);
  if (denied) return denied;

  // Pages publiques pré-rendues (scripts/prerender.mjs) : le HTML complet,
  // lisible par les robots (Google, AdSense) sans exécuter JavaScript.
  // Nom strict (lettres, chiffres, tirets) : aucune remontée de dossier.
  const prerendered = getPrerenderedPath(url.pathname);
  if (prerendered) {
    const page = Bun.file(prerendered);
    if (await page.exists()) {
      return serveFile(request, prerendered, page, false, "text/html; charset=utf-8");
    }
  }

  // `/` : la landing pré-rendue pour qui n'a pas de session (robots, AdSense,
  // visiteurs) ; le shell vide pour un étudiant connecté — sinon la landing
  // clignoterait avant son Dashboard. La réponse dépend du cookie : Vary.
  if (url.pathname === "/") {
    const rootPage = `${distDir}/prerendered/index.html`;
    const page = Bun.file(rootPage);
    const res =
      !hasSessionCookie(request) && (await page.exists())
        ? await serveFile(request, rootPage, page, false, "text/html; charset=utf-8")
        : await serveFile(request, indexPath, Bun.file(indexPath), false, "text/html; charset=utf-8");
    res.headers.append("Vary", "Cookie");
    return res;
  }

  const filePath = getStaticFilePath(url.pathname);
  const file = Bun.file(filePath);

  if (await file.exists()) {
    return serveFile(request, filePath, file, isImmutablePath(url.pathname));
  }

  const index = Bun.file(indexPath);
  if (await index.exists()) {
    return serveFile(request, indexPath, index, false, "text/html; charset=utf-8");
  }

  return new Response("Build output not found. Run `bun run build` first.", {
    status: 500,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

console.log(`Web server listening on http://localhost:${server.port}`);

/**
 * Performance (audit du 5 nov. 2026) : Bun ne compresse rien de lui-même et
 * Railway non plus. Mesuré en 4G (9 Mb/s) : 1,8 s sans compression, 0,8 s
 * avec gzip. Les fichiers compressés sont gardés en mémoire (le build ne
 * change pas pendant la vie du processus). Les /assets/ ont un nom haché :
 * cache navigateur d'un an. index.html est revalidé à chaque visite pour
 * qu'un déploiement soit vu tout de suite.
 */
const COMPRESSIBLE = /\.(js|mjs|css|html|svg|json|txt|map|wasm|xml)$/;
const gzCache = new Map<string, Uint8Array>();

async function serveFile(
  request: Request,
  filePath: string,
  file: ReturnType<typeof Bun.file>,
  immutable: boolean,
  contentType?: string,
): Promise<Response> {
  const headers = new Headers({
    "Content-Type": contentType ?? file.type,
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    Vary: "Accept-Encoding",
  });
  // Vidéos : Safari (iOS surtout) ne lit un <video> que si le serveur répond
  // aux demandes de plage d'octets (Range → 206).
  headers.set("Accept-Ranges", "bytes");
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && (range[1] || range[2]) && !COMPRESSIBLE.test(filePath)) {
    const size = file.size;
    // « bytes=-500 » : les 500 derniers octets.
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(file.slice(start, end + 1), { status: 206, headers });
  }
  const acceptsGzip = /\bgzip\b/.test(request.headers.get("accept-encoding") ?? "");
  if (acceptsGzip && file.size > 1024 && COMPRESSIBLE.test(filePath)) {
    let gz = gzCache.get(filePath);
    if (!gz) {
      gz = Bun.gzipSync(new Uint8Array(await file.arrayBuffer()));
      gzCache.set(filePath, gz);
    }
    headers.set("Content-Encoding", "gzip");
    return new Response(gz, { headers });
  }
  return new Response(file, { headers });
}

/**
 * Cache navigateur d'un an (`immutable`) : les /assets/ (nom haché par Vite)
 * et les fonds d'écran /backgrounds/ — un fond n'est JAMAIS réécrit sous le
 * même nom (packages/web/scripts/generate-universal-backgrounds.mjs) : changer une image =
 * lui donner un nouveau nom. Sans ce cache, la rotation de 10 s
 * revaliderait chaque image à chaque passage.
 */
function isImmutablePath(pathname: string): boolean {
  return (
    pathname.startsWith("/assets/") ||
    /^\/backgrounds\/[a-z]+\/[a-z0-9-]+\.webp$/.test(pathname) ||
    // Films de l'interface : la version est dans le nom (import-wait-v1.mp4).
    /^\/videos\/[a-z0-9-]+-v\d+\.(mp4|webp)$/.test(pathname)
  );
}

function getPrerenderedPath(pathname: string): string | null {
  const name = pathname.replace(/\/+$/, "").slice(1);
  return /^[a-z0-9-]+$/.test(name) ? `${distDir}/prerendered/${name}.html` : null;
}

/**
 * Cookie de session Better Auth (préfixe « __Secure- » en HTTPS). Sa validité
 * n'est pas vérifiée ici : un cookie périmé reçoit le shell, puis la landing
 * côté client — rien de privé n'en dépend.
 */
function hasSessionCookie(request: Request): boolean {
  return /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=/.test(request.headers.get("cookie") ?? "");
}

function getStaticFilePath(pathname: string) {
  const cleanPath = decodeURIComponent(pathname)
    .replace(/^\/+/, "")
    .replaceAll("..", "");

  return cleanPath ? `${distDir}/${cleanPath}` : indexPath;
}
