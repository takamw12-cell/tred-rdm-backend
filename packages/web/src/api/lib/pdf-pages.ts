import { getDocumentProxy } from "unpdf";

/**
 * Le nombre de pages d'un PDF, lu dans le fichier lui-même.
 *
 * Sert au garde-fou des pièces jointes du chat (lib/chat-attachments.ts) :
 * seule la structure du document est ouverte, aucune page n'est rendue ni lue.
 * Lève si le fichier n'est pas un PDF lisible (protégé, abîmé) — à l'appelant
 * de décider quoi en faire.
 */
export async function countPdfPages(bytes: Uint8Array): Promise<number> {
  // unpdf/pdf.js détache le tampon qu'on lui donne : il reçoit une copie.
  const pdf = await getDocumentProxy(bytes.slice());
  try {
    return pdf.numPages;
  } finally {
    // Rend la mémoire du document tout de suite (un PDF joint pèse jusqu'à 20 Mo).
    // Dans cette version de pdf.js, c'est la tâche de chargement qui se détruit.
    const task = (pdf as unknown as { loadingTask?: { destroy?: () => Promise<void> } }).loadingTask;
    await task?.destroy?.().catch(() => {});
  }
}
