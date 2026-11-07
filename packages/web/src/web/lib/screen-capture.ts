/**
 * Partage d'écran / caméra pour le co-pilote vision (V2 — Pilier 3, FONDATIONS).
 *
 * API natives du navigateur, aucun paquet : getDisplayMedia (écran) et
 * getUserMedia (caméra). On n'enregistre pas de vidéo : on échantillonne
 * une image JPEG de temps en temps et on l'envoie à /api/vision/frame.
 *
 * Le navigateur demande toujours l'autorisation et affiche son propre
 * indicateur de partage ; `stopCapture` coupe toutes les pistes.
 */

export type CaptureMode = "screen" | "camera";

export interface CaptureSession {
  mode: CaptureMode;
  stream: MediaStream;
  video: HTMLVideoElement;
}

export function captureSupported(mode: CaptureMode): boolean {
  const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  return Boolean(mode === "screen" ? md?.getDisplayMedia : md?.getUserMedia);
}

export async function startCapture(mode: CaptureMode): Promise<CaptureSession> {
  const stream =
    mode === "screen"
      ? await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false })
      : await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false });
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  return { mode, stream, video };
}

/** Une image JPEG de la session, redimensionnée (≤ maxWidth px). */
export function grabFrame(session: CaptureSession, maxWidth = 1600, quality = 0.75): string | null {
  const { video } = session;
  if (!video.videoWidth || !video.videoHeight) return null;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

export function stopCapture(session: CaptureSession | null): void {
  session?.stream.getTracks().forEach((t) => t.stop());
  if (session) session.video.srcObject = null;
}

/** Envoie une image au serveur. Statut 501 tant que l'analyse n'est pas branchée. */
export async function sendFrame(image: string, mode: CaptureMode, question?: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch("/api/vision/frame", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image, mode, question }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}
