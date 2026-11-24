/**
 * Garde-fou : un raisonnement qui ne conclut pas est coupé, puis la question
 * est relancée sans raisonnement étendu.
 *
 * ── Pourquoi (incident du 24 nov. 2026) ────────────────────────────────────
 *
 * Une photo d'exercice (schéma électrique, tournée de 90°) jointe à « Löse
 * Aufgabe 13 ». Deux essais en production : 840 s puis 899 s de raisonnement,
 * aucun mot, aucun outil, jusqu'à la coupure de Railway à 15 minutes. Rejoué
 * en local avec la même photo : le raisonnement `adaptive` ne s'arrête pas,
 * un effort « low » ou un budget de 4 000 tokens n'y changent rien. Sans
 * raisonnement étendu, le premier mot arrive après 3 s.
 *
 * Le battement SSE (lib/sse-heartbeat.ts) gardait la connexion ouverte : rien
 * ne bornait donc l'attente. Ici, tant que le modèle n'a produit NI texte NI
 * appel d'outil, il a `maxMs` pour le faire. Passé ce délai, le premier essai
 * est arrêté et `fallback` (le même tuteur, raisonnement coupé) prend la suite
 * dans le même flux.
 *
 * Après le premier mot ou le premier outil, le garde-fou se retire : relancer
 * à ce moment-là afficherait la réponse deux fois.
 */

type Chunk = { type: string; id?: string; [k: string]: unknown };

/** Le modèle a produit quelque chose d'utile à l'étudiant. */
const PRODUCTIVE = new Set(["text-delta", "tool-input-start", "tool-input-available", "tool-output-available"]);

/** Délai par défaut ; `CHAT_REASONING_MAX_MS` le remplace sans redéploiement de code. */
export function reasoningMaxMs(env: Record<string, string | undefined> = process.env): number {
  const v = Number(env.CHAT_REASONING_MAX_MS);
  return Number.isFinite(v) && v >= 5_000 ? v : 40_000;
}

export interface ReasoningWatchdogOptions<C> {
  /** Premier essai (avec raisonnement). */
  first: (signal: AbortSignal) => Promise<ReadableStream<C>>;
  /** Relance, sans raisonnement étendu. Construite seulement au besoin. */
  fallback: (signal: AbortSignal) => Promise<ReadableStream<C>>;
  maxMs: number;
  /** Annulation par l'appelant (navigateur fermé, verrou du solveur). */
  signal?: AbortSignal;
  /** Appelé à la coupure (journal). */
  onTimeout?: (info: { ms: number }) => void;
}

const TIMEOUT = Symbol("timeout");

export function reasoningWatchdog<C>(opts: ReasoningWatchdogOptions<C>): ReadableStream<C> {
  const firstAbort = new AbortController();
  const fallbackAbort = new AbortController();
  const stopAll = () => {
    firstAbort.abort();
    fallbackAbort.abort();
  };
  if (opts.signal?.aborted) stopAll();
  opts.signal?.addEventListener("abort", stopAll);

  return new ReadableStream<C>({
    async start(controller) {
      const started = Date.now();
      const emit = (c: Chunk) => controller.enqueue(c as unknown as C);
      const openReasoning = new Set<string>();
      let stepOpen = false;
      let armed = true;
      let timedOut = false;

      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<typeof TIMEOUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMEOUT), opts.maxMs);
      });

      const reader = (await opts.first(firstAbort.signal)).getReader();
      try {
        for (;;) {
          const next = armed ? await Promise.race([reader.read(), deadline]) : await reader.read();
          if (next === TIMEOUT) {
            timedOut = true;
            break;
          }
          if (next.done) break;
          const c = next.value as unknown as Chunk;
          if (PRODUCTIVE.has(c.type)) armed = false;
          if (c.type === "reasoning-start" && c.id) openReasoning.add(c.id);
          if (c.type === "reasoning-end" && c.id) openReasoning.delete(c.id);
          if (c.type === "start-step") stepOpen = true;
          if (c.type === "finish-step") stepOpen = false;
          emit(c);
        }
      } finally {
        clearTimeout(timer);
      }

      if (!timedOut || opts.signal?.aborted) {
        controller.close();
        return;
      }

      // ── Coupure ─────────────────────────────────────────────────────────
      firstAbort.abort();
      reader.cancel().catch(() => {});
      opts.onTimeout?.({ ms: Date.now() - started });
      // Le flux reste bien formé : ce qui est ouvert est refermé avant la relance.
      for (const id of openReasoning) emit({ type: "reasoning-end", id });
      if (stepOpen) emit({ type: "finish-step" });

      const second = (await opts.fallback(fallbackAbort.signal)).getReader();
      for (;;) {
        const { done, value } = await second.read();
        if (done) break;
        // Un seul « start » par message : celui du premier essai.
        if ((value as unknown as Chunk).type === "start") continue;
        controller.enqueue(value);
      }
      controller.close();
    },
    cancel() {
      stopAll();
    },
  });
}
