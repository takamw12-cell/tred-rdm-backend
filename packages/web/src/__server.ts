import app from "./api";

const port = Number(process.env.PORT ?? 3000);
const distDir = `${import.meta.dir}/../dist`;
const indexPath = `${distDir}/index.html`;

/**
 * En-têtes de sécurité, posés sur TOUTES les réponses (API et fichiers).
 * Pas de Content-Security-Policy pour l'instant : KaTeX (styles inline),
 * Stripe et YouTube demandent une politique écrite et testée à part.
 */
const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(self), payment=(self)",
};

function withSecurityHeaders(response: Response): Response {
  // Certaines réponses (fetch proxifié) ont des en-têtes immuables : copie.
  let res = response;
  try {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      if (!res.headers.has(k)) res.headers.set(k, v);
    }
  } catch {
    res = new Response(response.body, response);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
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
    return withSecurityHeaders(await handle(request));
  },
});

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api")) {
    return app.fetch(request);
  }

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

  const filePath = getStaticFilePath(url.pathname);
  const file = Bun.file(filePath);

  if (await file.exists()) {
    return serveFile(request, filePath, file, url.pathname.startsWith("/assets/"));
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

function getPrerenderedPath(pathname: string): string | null {
  const name = pathname.replace(/\/+$/, "").slice(1);
  return /^[a-z0-9-]+$/.test(name) ? `${distDir}/prerendered/${name}.html` : null;
}

function getStaticFilePath(pathname: string) {
  const cleanPath = decodeURIComponent(pathname)
    .replace(/^\/+/, "")
    .replaceAll("..", "");

  return cleanPath ? `${distDir}/${cleanPath}` : indexPath;
}
