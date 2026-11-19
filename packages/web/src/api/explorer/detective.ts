import { randomBytes, randomInt } from "node:crypto";
import { EXPLORER_MODELS, isModelId, type ExplorerModelId } from "../../web/lib/explorer-models";

/**
 * « 3D Detective » (19 nov. 2026) : dans une scène de l'Explorateur, l'étudiant
 * clique la pièce que décrit la question. Les questions sont les textes
 * `quiz` des repères (lib/explorer-models.ts) : écrits, relus, en 4 langues —
 * aucun appel au modèle d'IA, donc ni coût ni pièce inventée.
 *
 * Le serveur tire les pièces cherchées et corrige : un sans-faute rapporte
 * des crédits, il ne se déclare pas depuis le navigateur.
 */
export const DETECTIVE_ROUNDS = 5;
export const DETECTIVE_MIN_ROUNDS = 3;
export const DETECTIVE_REWARD = 1;
export const DETECTIVE_REWARDS_PER_DAY = 2;
export const DETECTIVE_TTL_MS = 30 * 60_000;

export interface DetectiveSession {
  id: string;
  userId: string;
  modelId: ExplorerModelId;
  targets: string[];
  round: number;
  correct: number;
  createdAt: number;
}

/** Tire jusqu'à 5 pièces différentes du modèle, dans un ordre aléatoire. null : modèle inconnu ou trop peu de pièces. */
export function newDetective(userId: string, modelId: unknown, rand: (n: number) => number = randomInt, now = Date.now()): DetectiveSession | null {
  if (!isModelId(modelId)) return null;
  const ids = EXPLORER_MODELS[modelId].hotspots.map((h) => h.id);
  if (ids.length < DETECTIVE_MIN_ROUNDS) return null;
  for (let i = ids.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  return { id: randomBytes(16).toString("base64url"), userId, modelId, targets: ids.slice(0, DETECTIVE_ROUNDS), round: 0, correct: 0, createdAt: now };
}

export function guess(s: DetectiveSession, hotspotId: unknown): { ok: false } | { ok: true; right: boolean; target: string; session: DetectiveSession; finished: boolean } {
  if (s.round >= s.targets.length || typeof hotspotId !== "string") return { ok: false };
  const target = s.targets[s.round]!;
  const right = hotspotId === target;
  const session = { ...s, round: s.round + 1, correct: s.correct + (right ? 1 : 0) };
  return { ok: true, right, target, session, finished: session.round >= session.targets.length };
}

export const detectivePerfect = (s: DetectiveSession) => s.round >= s.targets.length && s.targets.length >= DETECTIVE_MIN_ROUNDS && s.correct === s.targets.length;
