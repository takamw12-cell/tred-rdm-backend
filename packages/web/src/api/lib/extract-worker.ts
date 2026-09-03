/**
 * Le fil d'exécution où se fait l'extraction.
 *
 * ── Pourquoi un worker ────────────────────────────────────────────────────
 *
 * Mesuré sur un PDF de 200 pages :
 *
 *   · extraction de texte  — 2,3 s, aucun gel notable : pdf.js rend la main.
 *   · rendu d'une page en image (le chemin OCR d'un scan) — 629 ms par page,
 *     dont **2,29 s de gel du fil en un seul bloc**, et 82 % du temps passé
 *     sans rendre la main.
 *
 * Le second chiffre est le problème. Pendant qu'un étudiant téléverse un
 * Skript scanné, le serveur cesse de répondre à tous les autres par à-coups de
 * deux secondes, pendant une vingtaine de secondes. JavaScript n'a qu'un fil :
 * mettre ce travail « en arrière-plan » avec une promesse n'y change rien —
 * c'est le même fil.
 *
 * Ici, c'en est un autre. Le fil principal reste libre de répondre.
 *
 * ── Ce que ce fichier fait, et rien d'autre ───────────────────────────────
 *
 * Il reçoit des octets, rend du texte. Il ne touche pas à la base : l'écriture
 * reste sur le fil principal, à un seul endroit. Un worker qui écrirait aussi
 * en base doublerait les chemins d'accès aux données pour n'économiser qu'un
 * aller-retour de message.
 */

import { extractDocument, UnsupportedFormatError } from "./extract";

export interface ExtractRequest {
  jobId: string;
  bytes: Uint8Array;
  filename: string;
}

export type ExtractResponse =
  | {
      jobId: string;
      ok: true;
      text: string;
      pageCount: number;
      ocr: boolean;
    }
  | {
      jobId: string;
      ok: false;
      /** `unsupported` mérite un 415, le reste un 422. */
      kind: "unsupported" | "failed";
      message: string;
    };

declare const self: Worker;

self.onmessage = async (event: MessageEvent<ExtractRequest>) => {
  const { jobId, bytes, filename } = event.data;

  try {
    const result = await extractDocument(bytes, filename);
    const response: ExtractResponse = {
      jobId,
      ok: true,
      text: result.text,
      pageCount: result.pageCount,
      ocr: result.ocr,
    };
    self.postMessage(response);
  } catch (error) {
    // L'erreur elle-même ne traverse pas la frontière du worker de façon
    // fiable — on ne transmet que ce dont l'appelant a besoin pour choisir
    // son code de statut et son message.
    const response: ExtractResponse = {
      jobId,
      ok: false,
      kind: error instanceof UnsupportedFormatError ? "unsupported" : "failed",
      message: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};
