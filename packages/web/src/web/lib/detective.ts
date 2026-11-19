/**
 * « 3D Detective » côté navigateur : les appels au serveur (api/explorer).
 * Le serveur tire les pièces cherchées et corrige ; aucun appel au modèle d'IA.
 */
export interface DetectiveStart {
  sessionId: string;
  total: number;
  target: string;
}
export interface DetectiveGuess {
  right: boolean;
  target: string;
  next: string | null;
  round: number;
  correct: number;
  finished: boolean;
  reward: { granted: boolean; amount: number; reason?: string } | null;
}

async function post<T>(url: string, body: unknown): Promise<T | null> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.ok ? ((await res.json()) as T) : null;
}

export const startDetective = (modelId: string) => post<DetectiveStart>("/api/explorer/detective/start", { modelId });
export const guessDetective = (sessionId: string, hotspotId: string) => post<DetectiveGuess>("/api/explorer/detective/guess", { sessionId, hotspotId });
