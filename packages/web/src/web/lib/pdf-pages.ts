// eslint-disable-next-line import/default -- import « ?url » de Vite : l'ADRESSE du fichier, pas le module
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/**
 * Le nombre de pages d'un PDF que l'étudiant joint à une question.
 *
 * Compté dans le navigateur, AVANT l'envoi : un Skript de 120 pages ne quitte
 * pas le téléphone pour être refusé à l'arrivée (api/lib/chat-attachments.ts).
 * Même moteur que le lecteur de documents (PDF.js, chargé à la demande) ; seule
 * la structure du fichier est lue, aucune page n'est dessinée.
 *
 * `null` : fichier illisible ici (protégé par mot de passe, abîmé). L'appelant
 * le laisse passer comme avant — le serveur recompte de toute façon.
 */
export async function countPdfPages(file: Blob): Promise<number | null> {
  try {
    const lib = await import("pdfjs-dist");
    lib.GlobalWorkerOptions.workerSrc = workerUrl;
    const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    try {
      return (await task.promise).numPages;
    } finally {
      void task.destroy();
    }
  } catch {
    return null;
  }
}
