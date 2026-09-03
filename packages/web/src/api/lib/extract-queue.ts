import type { ExtractRequest, ExtractResponse } from "./extract-worker";
import { extractDocument, type ExtractedDoc } from "./extract";

/**
 * La file d'extraction : côté fil principal.
 *
 * ── Un seul worker, une seule file ────────────────────────────────────────
 *
 * L'extraction est un travail de calcul. En lancer trois en parallèle sur la
 * petite machine de Railway ne les termine pas plus vite : elles se disputent
 * le même processeur, et chacune garde un PDF entier en mémoire pendant ce
 * temps. Une file sérialisée est plus rapide en pratique et borne la mémoire.
 *
 * ── Le worker naît au premier besoin ──────────────────────────────────────
 *
 * La grande majorité des requêtes ne téléverse rien. En démarrer un au
 * lancement coûterait de la mémoire à chaque instance, tout le temps, pour un
 * service utilisé quelques fois par jour.
 *
 * ── Le repli est délibéré ─────────────────────────────────────────────────
 *
 * Si le worker ne démarre pas — environnement inattendu, empaquetage qui
 * n'emporte pas le fichier — on extrait sur le fil principal. C'est le
 * comportement d'avant : plus lent pour les autres, mais l'étudiant récupère
 * son document. Un téléversement qui échoue parce qu'un détail d'exécution a
 * changé serait un mauvais échange.
 */

/** Au-delà, on considère le travail perdu et on repart d'un worker neuf. */
const JOB_TIMEOUT_MS = 4 * 60_000;

interface Pending {
  resolve: (value: ExtractedDoc) => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

let worker: Worker | null = null;
let workerBroken = false;
const pending = new Map<string, Pending>();

/** La file : chaque travail attend que le précédent ait rendu la main. */
let tail: Promise<unknown> = Promise.resolve();

function disposeWorker(reason: string): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    p.reject(new Error(reason));
  }
  pending.clear();
}

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;

  try {
    worker = new Worker(new URL("./extract-worker.ts", import.meta.url).href, {
      type: "module",
    });

    worker.onmessage = (event: MessageEvent<ExtractResponse>) => {
      const data = event.data;
      const p = pending.get(data.jobId);
      if (!p) return;
      pending.delete(data.jobId);
      clearTimeout(p.timer);

      if (data.ok) {
        p.resolve({ text: data.text, pageCount: data.pageCount, ocr: data.ocr });
      } else {
        const error = new Error(data.message);
        error.name = data.kind === "unsupported" ? "UnsupportedFormatError" : "ExtractionError";
        p.reject(error);
      }
    };

    // Un worker qui meurt emporte le travail en cours. On le signale à
    // l'appelant plutôt que de le laisser attendre le délai complet.
    worker.onerror = (event) => {
      console.error("[extract] le worker a échoué", event);
      disposeWorker("worker crashed");
    };

    return worker;
  } catch (error) {
    // Une seule tentative : si le worker ne peut pas naître ici, il ne pourra
    // pas davantage à la requête suivante. On bascule sur le repli une fois
    // pour toutes plutôt que de rejouer l'échec à chaque téléversement.
    console.error("[extract] worker indisponible, extraction sur le fil principal", error);
    workerBroken = true;
    return null;
  }
}

/**
 * Extrait le texte d'un document, hors du fil principal quand c'est possible.
 *
 * L'appelant ne voit aucune différence : même signature, mêmes erreurs.
 */
export function extractInBackground(
  bytes: Uint8Array,
  filename: string,
): Promise<ExtractedDoc> {
  const run = async (): Promise<ExtractedDoc> => {
    const w = getWorker();
    if (!w) return extractDocument(bytes, filename);

    const jobId = crypto.randomUUID();

    return new Promise<ExtractedDoc>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(jobId);
        // Un worker qui n'a pas rendu la main en quatre minutes est perdu, et
        // il tient la file. On le remplace.
        disposeWorker("extraction timed out");
        reject(new Error("extraction timed out"));
      }, JOB_TIMEOUT_MS);

      pending.set(jobId, { resolve, reject, timer });

      const message: ExtractRequest = { jobId, bytes, filename };
      try {
        w.postMessage(message);
      } catch (error) {
        pending.delete(jobId);
        clearTimeout(timer);
        reject(error);
      }
    });
  };

  // On s'accroche à la queue de la file. Le `.catch` vide est nécessaire :
  // sans lui, un travail en échec ferait rejeter tous les suivants.
  const job = tail.then(run, run);
  tail = job.catch(() => {});
  return job;
}

/** Pour les tests et l'arrêt propre. */
export function shutdownExtractQueue(): void {
  disposeWorker("shutdown");
}
