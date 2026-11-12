import type { ExplainerScene, ExplainerWord } from "@/video/dynamic-explanation";
import type { BeamDiagramPayload } from "../../api/lib/beam-tool";
import { readPaywallBody } from "@/lib/paywall";
import { usePaywallStore } from "@/stores/paywall";

/**
 * « Als Video erklären » côté navigateur : lancer la génération, suivre son
 * avancement (polling), sauvegarder. Voir api/video/routes.ts.
 */

export interface ExplainerVideo {
  id: string;
  title: string;
  language: string;
  /** Durée de la voix + marge : la durée de la vidéo. */
  durationMs: number;
  saved: boolean;
  audioUrl: string;
  scenes: ExplainerScene[];
  words: ExplainerWord[];
  sceneStartsMs: number[];
  professor: string | null;
  /** La poutre calculée par le solveur, quand la vidéo en montre une. */
  beam?: BeamDiagramPayload | null;
  /** Mot-clé de l'image de contexte (tribunal, bloc opératoire, pont…). */
  backdrop?: string | null;
}

export interface ExplainerRequest {
  question: string;
  answer: string;
  /** Langue de l'interface de l'étudiant. */
  language: string;
  chatId?: string | null;
  messageId?: string | null;
  docId?: string | null;
  semesterId?: string | null;
}

/** Les étapes affichées pendant la préparation. */
export type ExplainerStep = "pending" | "script" | "voice";

export type ExplainerState =
  | { phase: "working"; step: ExplainerStep }
  | { phase: "done"; video: ExplainerVideo }
  /** Ni cours ni calcul : la vidéo est refusée, on invite à déposer le cours. */
  | { phase: "needDocs" }
  | { phase: "error"; code: ExplainerErrorCode }
  /** La fonction n'est pas configurée sur ce serveur : l'ancien diaporama prend le relais. */
  | { phase: "unavailable" };

export type ExplainerErrorCode = "generic" | "grounded" | "limit";

/** Code du serveur → message à afficher. */
export function errorCodeOf(serverCode: string | undefined, httpStatus?: number): ExplainerErrorCode {
  if (serverCode === "not_grounded") return "grounded";
  if (serverCode === "daily_limit" || httpStatus === 402 || httpStatus === 429) return "limit";
  return "generic";
}

const POLL_MS = 1500;
/** Au-delà, on arrête d'attendre : le serveur marque lui-même la vidéo en échec après 5 min. */
const MAX_WAIT_MS = 6 * 60_000;

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(id), resolve()), { once: true });
  });

/**
 * Lance la vidéo et rappelle `onState` à chaque changement, jusqu'à la fin.
 * `signal` arrête le suivi (fermeture de la fenêtre) ; la génération, elle,
 * continue côté serveur.
 */
export async function runExplainerVideo(req: ExplainerRequest, onState: (s: ExplainerState) => void, signal: AbortSignal): Promise<void> {
  onState({ phase: "working", step: "pending" });
  let id: string;
  try {
    const res = await fetch("/api/video/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req), signal });
    const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    if (res.status === 422 && body.error === "no_documents") return onState({ phase: "needDocs" });
    if (res.status === 503 || res.status === 404) return onState({ phase: "unavailable" });
    // Limite du mois atteinte : la fenêtre de limite s'ouvre (essai, offre, crédits).
    if (res.status === 402) usePaywallStore.getState().show(readPaywallBody(body, "video"));
    if (!res.ok || !body.id) return onState({ phase: "error", code: errorCodeOf(body.error, res.status) });
    id = body.id;
  } catch {
    if (!signal.aborted) onState({ phase: "error", code: "generic" });
    return;
  }

  const started = Date.now();
  while (!signal.aborted && Date.now() - started < MAX_WAIT_MS) {
    await wait(POLL_MS, signal);
    if (signal.aborted) return;
    try {
      const res = await fetch(`/api/video/${id}`, { signal });
      if (!res.ok) continue;
      const data = (await res.json()) as { status: string; error?: string } & Partial<ExplainerVideo>;
      if (data.status === "done") return onState({ phase: "done", video: data as ExplainerVideo });
      if (data.status === "failed") return onState({ phase: "error", code: errorCodeOf(data.error) });
      onState({ phase: "working", step: data.status === "voice" ? "voice" : data.status === "script" ? "script" : "pending" });
    } catch {
      /* coupure réseau passagère : on réessaie au prochain tour */
    }
  }
  if (!signal.aborted) onState({ phase: "error", code: "generic" });
}

export async function fetchExplainerVideo(id: string): Promise<ExplainerVideo | null> {
  const res = await fetch(`/api/video/${id}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { status: string } & Partial<ExplainerVideo>;
  return data.status === "done" ? (data as ExplainerVideo) : null;
}

export async function saveExplainerVideo(id: string, saved: boolean): Promise<boolean> {
  const res = await fetch(`/api/video/${id}/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ saved }) });
  return res.ok;
}

export interface SavedExplainerVideo {
  id: string;
  title: string;
  language: string;
  durationMs: number;
  createdAt: string;
}

export async function listSavedExplainerVideos(): Promise<SavedExplainerVideo[]> {
  const res = await fetch("/api/video");
  if (!res.ok) return [];
  return ((await res.json()) as { videos?: SavedExplainerVideo[] }).videos ?? [];
}

/** « 1:24 » */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
