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
 *
 * Depuis le 15 nov. 2026, la ligne dit aussi ce qui s'est passé AVANT le modèle :
 *
 *   prep       de l'arrivée de la requête à l'appel du modèle : réception du
 *              corps (un fichier joint sur un réseau de téléphone), lectures en
 *              base, choix des extraits. `first_activity − prep` = le modèle seul.
 *   body       poids du corps de la requête (en-tête Content-Length)
 *   pdf_pages  pages de PDF jointes à la question (absent s'il n'y en a pas)
 */
import type { Route } from "./chat-routing";

export interface StreamMarks {
  firstActivityMs: number | null;
  firstTextMs: number | null;
}

// tool-input-available : le résultat du fast-path (lib/fast-path.ts), visible avant tout token.
const ACTIVITY = /"type":"(reasoning-start|reasoning-delta|text-delta|tool-input-start|tool-input-available)"/;
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
  /** Ce qui précède l'appel du modèle. Absent = ligne d'avant, inchangée. */
  before?: { prepMs: number; bodyBytes: number | null; pdfPages: number };
}): string {
  const ms = (v: number | null) => (v === null ? "-" : `${v}ms`);
  const before = a.before
    ? ` prep=${a.before.prepMs}ms body=${a.before.bodyBytes === null ? "-" : `${Math.round(a.before.bodyBytes / 1024)}kB`}` +
      (a.before.pdfPages > 0 ? ` pdf_pages=${a.before.pdfPages}` : "")
    : "";
  return (
    `[perf] tier=${a.route.tier} model=${a.route.modelId.replace(/^anthropic\//, "")} thinking=${a.route.thinking}` +
    ` reason="${a.route.reason}" first_activity=${ms(a.marks.firstActivityMs)} first_text=${ms(a.marks.firstTextMs)}` +
    ` total=${a.totalMs}ms steps=${a.usage.steps} in=${a.usage.input}tok cache_read=${a.usage.cacheRead}tok` +
    ` cache_write=${a.usage.cacheWrite}tok out=${a.usage.output}tok aborted=${a.aborted ? "yes" : "no"}` +
    before
  );
}
