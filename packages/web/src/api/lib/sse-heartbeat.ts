/**
 * Battement pour un flux SSE (le chat du tuteur).
 *
 * ── L'incident du 5 novembre 2026 ─────────────────────────────────────────
 *
 * Sur un circuit complexe, le chat affichait « Skizze wird gezeichnet … » puis
 * « Die Verbindung wurde unterbrochen ». Aucune étape de l'agent ne s'était
 * terminée (aucune ligne [agent]) : le modèle réfléchissait encore. Bun ferme
 * une connexion restée muette plus de `idleTimeout` (10 s par défaut), et la
 * réflexion adaptative arrive par paquets espacés.
 *
 * On insère donc, quand rien n'est passé depuis `intervalMs`, un COMMENTAIRE
 * SSE (« : ping ») — ignoré par tout lecteur SSE, dont celui de l'AI SDK. Il
 * n'est écrit qu'entre deux événements complets (après « \n\n »), jamais au
 * milieu d'un « data: … ».
 */

const PING = new TextEncoder().encode(": ping\n\n");

export function withSseHeartbeat(
  response: Response,
  intervalMs = 5000,
  onClose?: (info: { aborted: boolean; ms: number }) => void,
  /** Chaque paquet décodé, pour mesurer (lib/chat-perf.ts). Ne modifie rien. */
  onChunk?: (text: string) => void,
): Response {
  const upstream = response.body;
  if (!upstream) return response;

  const started = Date.now();
  let lastWrite = Date.now();
  let atBoundary = true;
  let timer: ReturnType<typeof setInterval> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const decoder = new TextDecoder();

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      reader = upstream.getReader() as ReadableStreamDefaultReader<Uint8Array>;
      timer = setInterval(() => {
        if (atBoundary && Date.now() - lastWrite >= intervalMs) {
          try {
            controller.enqueue(PING);
            lastWrite = Date.now();
          } catch {
            /* flux déjà fermé */
          }
        }
      }, Math.max(250, Math.floor(intervalMs / 2)));

      void (async () => {
        try {
          for (;;) {
            const { done, value } = await reader!.read();
            if (done) break;
            controller.enqueue(value);
            lastWrite = Date.now();
            // Un événement SSE se termine par une ligne vide.
            const text = decoder.decode(value, { stream: true });
            atBoundary = text.endsWith("\n\n");
            onChunk?.(text);
          }
          controller.close();
          onClose?.({ aborted: false, ms: Date.now() - started });
        } catch (err) {
          controller.error(err);
        } finally {
          if (timer) clearInterval(timer);
        }
      })();
    },
    cancel(reason) {
      // Le navigateur a fermé la connexion (onglet, réseau, proxy).
      if (timer) clearInterval(timer);
      onClose?.({ aborted: true, ms: Date.now() - started });
      return reader?.cancel(reason);
    },
  });

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
