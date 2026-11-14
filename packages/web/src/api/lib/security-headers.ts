import { createHash } from "node:crypto";

/**
 * CORS restreint et Content-Security-Policy. Module pur (aucun accès réseau ni
 * base), branché dans `__server.ts` et testé à part.
 */

/* ── Origines ────────────────────────────────────────────────────────────── */

/**
 * Cette origine fait-elle partie de la liste de confiance ?
 * Les entrées « tred:// » et « exp:// » (app mobile) sont des préfixes ; les
 * origines web doivent correspondre exactement.
 */
export function originAllowed(origin: string, trusted: readonly string[]): boolean {
  // « https://x.app/ » → « https://x.app » ; « tred:// » reste intact.
  const o = origin.trim().replace(/^(https?:\/\/[^/]+)\/$/, "$1");
  return trusted.some((t) => (/^https?:\/\//.test(t) ? t === o : o.startsWith(t)));
}

const SAFE_METHODS = new Set(["GET", "HEAD"]);

export type OriginVerdict =
  /** Pas d'en-tête Origin (app mobile, webhook Stripe, curl) ou origine de confiance. */
  | "allow"
  /** Lecture depuis une origine inconnue : servie, mais sans en-têtes CORS — le navigateur ne la livre pas au site appelant. */
  | "strip"
  /** Écriture ou pré-vol depuis une origine inconnue : refusée avant toute route. */
  | "deny";

/**
 * Le modèle `__core/app.ts` renvoie l'origine de l'appelant, quelle qu'elle
 * soit, avec `Access-Control-Allow-Credentials: true` : n'importe quel site
 * pouvait donc appeler l'API avec le cookie de l'étudiant. On tranche ici,
 * devant l'application, sans toucher au fichier du modèle.
 */
export function judgeOrigin(method: string, origin: string | null, trusted: readonly string[]): OriginVerdict {
  if (!origin) return "allow";
  if (originAllowed(origin, trusted)) return "allow";
  return SAFE_METHODS.has(method.toUpperCase()) ? "strip" : "deny";
}

const CORS_HEADERS = ["Access-Control-Allow-Origin", "Access-Control-Allow-Credentials", "Access-Control-Expose-Headers", "Access-Control-Allow-Headers", "Access-Control-Allow-Methods"];

/** Retire les en-têtes CORS d'une réponse (verdict « strip »). */
export function withoutCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const h of CORS_HEADERS) headers.delete(h);
  if (!/\borigin\b/i.test(headers.get("Vary") ?? "")) headers.append("Vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/* ── Content-Security-Policy ─────────────────────────────────────────────── */

/** Empreintes des scripts inline d'une page HTML (le script de thème d'index.html). */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g)) {
    if (m[1]?.trim()) hashes.push(`'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`);
  }
  return [...new Set(hashes)];
}

/** `https://<compte>.r2.cloudflarestorage.com/…` → son origine ; rien si l'URL est invalide. */
function originOf(url: string | undefined): string[] {
  try {
    return url ? [new URL(url).origin] : [];
  } catch {
    return [];
  }
}

// Régies publicitaires (AdSense, Ad Manager) : elles chargent scripts, cadres
// et pixels depuis toute cette famille de domaines.
const ADS = ["https://*.googlesyndication.com", "https://*.doubleclick.net", "https://*.google.com", "https://*.gstatic.com", "https://*.googletagservices.com", "https://*.adtrafficquality.google"];

export interface CspInput {
  /** Empreintes des scripts inline autorisés (voir `inlineScriptHashes`). */
  scriptHashes?: readonly string[];
  /** S3_ENDPOINT : les originaux des PDF sont lus par URL signée. */
  storageEndpoint?: string;
  /** VITE_POSTHOG_HOST, si différent de l'hôte européen par défaut. */
  posthogHost?: string;
}

/**
 * La politique complète. Chaque source a une raison :
 *   · cdn.jsdelivr.net — Pyodide (Python dans le navigateur) et Tesseract ;
 *   · 'wasm-unsafe-eval' — WebAssembly (Pyodide, pdf.js), sans autoriser eval ;
 *   · style 'unsafe-inline' — KaTeX et les animations posent des styles inline ;
 *   · youtube — vidéos recommandées ; posthog / sentry — mesure et erreurs ;
 *   · livekit / heygen — le professeur virtuel ; régies — la publicité.
 */
export function buildCsp(input: CspInput = {}): string {
  const storage = [...originOf(input.storageEndpoint), "https://*.r2.cloudflarestorage.com"];
  const posthog = [...new Set(["https://eu.i.posthog.com", "https://eu-assets.i.posthog.com", ...originOf(input.posthogHost)])];
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'wasm-unsafe-eval'", ...(input.scriptHashes ?? []), "https://cdn.jsdelivr.net", "https://www.youtube.com", ...posthog, ...ADS],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "media-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com", "https://cdn.tldraw.com"],
    "connect-src": ["'self'", "https://cdn.jsdelivr.net", "https://tessdata.projectnaptha.com", "https://cdn.tldraw.com", "https://*.sentry.io", "https://*.livekit.cloud", "wss://*.livekit.cloud", "https://*.heygen.com", "wss://*.heygen.com", ...posthog, ...storage, ...ADS],
    "frame-src": ["'self'", "blob:", "https://www.youtube.com", "https://www.youtube-nocookie.com", ...storage, ...ADS],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "frame-ancestors": ["'none'"],
    "report-uri": ["/api/csp-report"],
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}

/**
 * Le socle, appliqué TOUJOURS : il ne peut casser aucune page (pas de plugin,
 * pas de <base> étranger, pas d'affichage dans un cadre tiers).
 */
export const CSP_BASELINE = "object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

/**
 * Les en-têtes CSP d'une réponse.
 *
 * Par défaut, la politique complète part en « Report-Only » : le navigateur
 * signale ce qu'elle bloquerait (journal `[csp]`) sans rien bloquer. Une
 * politique fausse d'une seule source éteint la publicité ou le professeur
 * virtuel pour tout le monde ; on l'observe donc d'abord en production, puis
 * `CSP_ENFORCE=true` la rend bloquante.
 */
export function cspHeaders(policy: string, enforce: boolean): Record<string, string> {
  return enforce ? { "Content-Security-Policy": policy } : { "Content-Security-Policy": CSP_BASELINE, "Content-Security-Policy-Report-Only": policy };
}
