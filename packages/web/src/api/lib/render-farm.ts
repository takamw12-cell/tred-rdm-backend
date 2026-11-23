/**
 * La ferme de rendu : les vidéos « Auto-Explain » sont rendues par GitHub
 * Actions (.github/workflows/render-video.yml), pas par le serveur Railway.
 * Ce module déclenche le workflow et lit l'état des derniers rendus.
 *
 * Variables : GITHUB_TOKEN (jeton à portée fine : Actions lecture + écriture
 * sur CE dépôt, rien d'autre) et GITHUB_RENDER_REPO (« propriétaire/dépôt »).
 * Sans jeton : rien ne part, la route répond « non configuré ».
 *
 * Un déclenchement coûte des appels payants (modèle, ElevenLabs, HeyGen) :
 * la route qui appelle ce module est réservée à l'administration.
 *
 * `fetch` s'injecte pour les tests. Aucun effet de bord au chargement.
 */
export const RENDER_WORKFLOW = "render-video.yml";
const BRIEF = /^[a-z0-9][a-z0-9_-]{0,40}$/;
const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;

export interface RenderFarmEnv {
  [name: string]: string | undefined;
  GITHUB_TOKEN?: string;
  GITHUB_RENDER_REPO?: string;
  GITHUB_RENDER_REF?: string;
}

export interface RenderRequest {
  brief: string;
  avatar?: "heygen" | "placeholder";
  layout?: "bubble" | "standing";
}

export type DispatchResult = { ok: true } | { ok: false; reason: "not_configured" | "bad_request" | "github_error"; status?: number };

export const renderFarmConfigured = (env: RenderFarmEnv = process.env): boolean => Boolean(env.GITHUB_TOKEN?.trim()) && REPO.test(env.GITHUB_RENDER_REPO?.trim() ?? "");

const headers = (token: string) => ({ authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "tred-render-farm" });

/** Lance un rendu. GitHub répond 204 sans corps : l'identifiant du rendu se lit ensuite dans `listRenders`. */
export async function dispatchRender(request: RenderRequest, env: RenderFarmEnv = process.env, doFetch: typeof fetch = fetch): Promise<DispatchResult> {
  if (!BRIEF.test(request.brief)) return { ok: false, reason: "bad_request" };
  if (!renderFarmConfigured(env)) return { ok: false, reason: "not_configured" };
  const res = await doFetch(`https://api.github.com/repos/${env.GITHUB_RENDER_REPO!.trim()}/actions/workflows/${RENDER_WORKFLOW}/dispatches`, {
    method: "POST",
    headers: { ...headers(env.GITHUB_TOKEN!.trim()), "content-type": "application/json" },
    // `ref` : la branche qui porte le FICHIER du workflow. Les entrées sont des chaînes (règle de GitHub).
    body: JSON.stringify({ ref: env.GITHUB_RENDER_REF?.trim() || "master", inputs: { brief: request.brief, avatar: request.avatar ?? "heygen", layout: request.layout ?? "bubble" } }),
    signal: AbortSignal.timeout(20_000),
  });
  return res.status === 204 ? { ok: true } : { ok: false, reason: "github_error", status: res.status };
}

export interface RenderRun {
  id: number;
  /** queued | in_progress | completed */
  status: string;
  /** success | failure | cancelled | null tant que le rendu tourne */
  conclusion: string | null;
  title: string;
  createdAt: string;
  url: string;
}

/** Les derniers rendus, du plus récent au plus ancien. Liste vide si rien n'est configuré ou si GitHub refuse. */
export async function listRenders(env: RenderFarmEnv = process.env, doFetch: typeof fetch = fetch, limit = 10): Promise<RenderRun[]> {
  if (!renderFarmConfigured(env)) return [];
  const res = await doFetch(`https://api.github.com/repos/${env.GITHUB_RENDER_REPO!.trim()}/actions/workflows/${RENDER_WORKFLOW}/runs?per_page=${Math.min(30, Math.max(1, limit))}`, { headers: headers(env.GITHUB_TOKEN!.trim()), signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return [];
  const body = (await res.json().catch(() => null)) as { workflow_runs?: Array<Record<string, unknown>> } | null;
  return (body?.workflow_runs ?? []).flatMap((r) => (typeof r.id === "number" ? [{ id: r.id, status: String(r.status ?? ""), conclusion: typeof r.conclusion === "string" ? r.conclusion : null, title: String(r.display_title ?? r.name ?? "").slice(0, 120), createdAt: String(r.created_at ?? ""), url: String(r.html_url ?? "") }] : []));
}
