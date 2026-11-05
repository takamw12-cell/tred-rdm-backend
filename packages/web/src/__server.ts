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

  const filePath = getStaticFilePath(url.pathname);
  const file = Bun.file(filePath);

  if (await file.exists()) {
    return new Response(file);
  }

  const index = Bun.file(indexPath);
  if (await index.exists()) {
    return new Response(index, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new Response("Build output not found. Run `bun run build` first.", {
    status: 500,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

console.log(`Web server listening on http://localhost:${server.port}`);

function getStaticFilePath(pathname: string) {
  const cleanPath = decodeURIComponent(pathname)
    .replace(/^\/+/, "")
    .replaceAll("..", "");

  return cleanPath ? `${distDir}/${cleanPath}` : indexPath;
}
