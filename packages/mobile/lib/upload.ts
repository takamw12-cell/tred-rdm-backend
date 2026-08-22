import * as DocumentPicker from "expo-document-picker";
import { apiFetch } from "@/lib/api";

/** Mêmes extensions que `SUPPORTED_EXTENSIONS` dans api/lib/extract.ts. */
export const SUPPORTED_EXTENSIONS = [
  "pdf", "docx", "pptx", "txt", "md", "csv",
  "png", "jpg", "jpeg", "webp", "heic",
] as const;

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  heic: "image/heic",
};

/** 25 Mo. Au-delà, la requête meurt en route sur un réseau mobile. */
const MAX_BYTES = 25 * 1024 * 1024;

export type UploadError =
  | "cancelled"
  | "unsupported"
  | "too_large"
  | "no_text"
  | "quota"
  | "network"
  | "unknown";

export interface UploadResult {
  ok: boolean;
  error?: UploadError;
  /** Détail technique, pour le journal — jamais montré tel quel. */
  detail?: string;
}

function extensionOf(name: string): string {
  return (name.split(".").pop() ?? "").toLowerCase();
}

/**
 * Choisir un fichier et l'envoyer à `/api/documents/upload`.
 *
 * Route Hono brute et non procédure oRPC : oRPC sérialise en JSON, ce qui
 * forcerait à encoder le PDF en base64 — un tiers de poids en plus, et tout le
 * fichier en mémoire des deux côtés. Un multipart streame.
 *
 * L'extension est vérifiée AVANT l'envoi. Le serveur la revérifie — il ne fait
 * jamais confiance au client — mais refuser ici évite de faire monter 20 Mo
 * pour rien sur le forfait de l'étudiant.
 */
export async function pickAndUploadDocument(opts?: {
  kind?: "script" | "exercise" | "exam" | "other";
  semesterId?: string | null;
  onProgress?: (stage: "picking" | "uploading" | "extracting") => void;
}): Promise<UploadResult> {
  opts?.onProgress?.("picking");

  let picked: DocumentPicker.DocumentPickerResult;
  try {
    picked = await DocumentPicker.getDocumentAsync({
      // On liste les types plutôt que "*/*" : le sélecteur grise alors les
      // fichiers impossibles au lieu de laisser l'étudiant en choisir un et
      // découvrir le refus vingt secondes plus tard.
      type: Object.values(MIME),
      copyToCacheDirectory: true,
      multiple: false,
    });
  } catch (err) {
    return { ok: false, error: "unknown", detail: String(err) };
  }

  if (picked.canceled || !picked.assets?.[0]) return { ok: false, error: "cancelled" };

  const asset = picked.assets[0];
  const name = asset.name || "dokument";
  const ext = extensionOf(name);

  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) {
    return { ok: false, error: "unsupported" };
  }
  if (typeof asset.size === "number" && asset.size > MAX_BYTES) {
    return { ok: false, error: "too_large" };
  }

  const form = new FormData();
  // React Native attend cet objet {uri, name, type} — un Blob ne fonctionne
  // pas ici, contrairement au web.
  form.append("file", {
    uri: asset.uri,
    name,
    type: asset.mimeType || MIME[ext] || "application/octet-stream",
  } as unknown as Blob);
  form.append("title", name.replace(/\.[a-z0-9]{1,5}$/i, ""));
  form.append("kind", opts?.kind ?? "other");
  if (opts?.semesterId) form.append("semesterId", opts.semesterId);

  opts?.onProgress?.("uploading");

  let res: Response;
  try {
    // Pas de Content-Type explicite : il doit contenir la frontière multipart,
    // que seul le moteur réseau connaît. L'écrire à la main casse l'envoi.
    res = await apiFetch("/api/documents/upload", { method: "POST", body: form });
  } catch (err) {
    return { ok: false, error: "network", detail: String(err) };
  }

  if (res.ok) return { ok: true };

  const body = await res.text().catch(() => "");

  if (res.status === 402) return { ok: false, error: "quota", detail: body };
  if (res.status === 415) return { ok: false, error: "unsupported", detail: body };
  if (res.status === 422) {
    // Le serveur distingue « pas de texte exploitable » d'un échec
    // d'extraction. Un scan photographié sans OCR tombe ici : le fichier est
    // valide, il ne contient simplement aucun texte à lire.
    return {
      ok: false,
      error: body.includes("no_text") ? "no_text" : "unknown",
      detail: body,
    };
  }

  return { ok: false, error: "unknown", detail: `${res.status} ${body}`.slice(0, 300) };
}
