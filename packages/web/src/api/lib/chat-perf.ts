/**
 * Mesure du chat, une ligne par réponse dans les logs Railway :
 *
 *   [perf] tier=concept model=claude-sonnet-4.6 thinking=off reason="question courte sans calcul"
 *          first_activity=1840ms first_text=1840ms total=9120ms steps=1
 *          in=11234tok cache_read=8890tok cache_write=0tok out=612tok
 *
 *   first_activity  premier signe de vie du modèle (raisonnement, outil ou texte)
 *   first_text      premier mot visible — le « Time to First Token » ressenti
 *   cache_read      tokens relus depuis le cache Anthropic (0 = cache manqué)
 *
 * Mesuré côté serveur depuis l'arrivée de la requête : requêtes en base,
 * choix des extraits et modèle compris. Ni texte, ni identité dans la ligne.
 */
import type { Route } from "./chat-routing";

export interface StreamMarks {
  firstActivityMs: number | null;
  firstTextMs: number | null;
}

const ACTIVITY = /"type":"(reasoning-start|reasoning-delta|text-delta|tool-input-start)"/;
const TEXT = /"type":"text-delta"/;

/** Lit les paquets SSE au passage et note les deux premiers instants utiles. */
export function createStreamTimer(startedAt: number, now: () => number = Date.now) {
  let firstActivityMs: number | null = null;
  let firstTextMs: number | null = null;
  return {
    observe(chunk: string) {
      if (firstTextMs !== null) return;
      if (firstActivityMs === null && ACTIVITY.test(chunk)) firstActivityMs = now() - startedAt;
      if (TEXT.test(chunk)) firstTextMs = now() - startedAt;
    },
    marks(): StreamMarks {
      return { firstActivityMs, firstTextMs };
    },
  };
}

/** La dernière question contient-elle une image ou un PDF ? */
export function lastUserHasAttachment(messages: unknown[]): boolean {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i] as { role?: string; parts?: { type?: string }[] };
    if (m?.role !== "user") continue;
    return Array.isArray(m.parts) && m.parts.some((p) => p?.type === "file");
  }
  return false;
}

export function perfLine(a: {
  route: Pick<Route, "tier" | "modelId" | "thinking" | "reason">;
  marks: StreamMarks;
  totalMs: number;
  usage: { steps: number; input: number; cacheRead: number; cacheWrite: number; output: number };
  aborted: boolean;
}): string {
  const ms = (v: number | null) => (v === null ? "-" : `${v}ms`);
  return (
    `[perf] tier=${a.route.tier} model=${a.route.modelId.replace(/^anthropic\//, "")} thinking=${a.route.thinking}` +
    ` reason="${a.route.reason}" first_activity=${ms(a.marks.firstActivityMs)} first_text=${ms(a.marks.firstTextMs)}` +
    ` total=${a.totalMs}ms steps=${a.usage.steps} in=${a.usage.input}tok cache_read=${a.usage.cacheRead}tok` +
    ` cache_write=${a.usage.cacheWrite}tok out=${a.usage.output}tok aborted=${a.aborted ? "yes" : "no"}`
  );
}
