import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, RotateCcw, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

/**
 * Full-screen camera capture modal.
 *
 * Uses `navigator.mediaDevices.getUserMedia` so the permission prompt is
 * explicit and the same experience works on desktop webcams and mobile
 * cameras (`facingMode: "environment"` prefers the rear camera on phones).
 * The student captures a still, then either retakes it or confirms — the
 * confirmed frame is returned as a JPEG data URL.
 */
export function CameraCapture({
  open,
  onClose,
  onCapture,
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string, name: string) => void | Promise<void>;
}) {
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Acquire the camera stream when the modal opens; always release it on close
  // (or unmount) so the camera light turns off and the device is freed.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPhoto(null);
    setError(null);
    setReady(false);

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch {
        if (!cancelled) setError(t("chat.cameraError"));
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    };
  }, [open, t]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setPhoto(canvas.toDataURL("image/jpeg", 0.9));
  }

  function confirm() {
    if (!photo) return;
    void onCapture(photo, `foto-${Date.now()}.jpg`);
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex flex-col bg-black"
        >
          {/* Top bar */}
          <div className="flex h-14 shrink-0 items-center justify-between px-4 text-white">
            <span className="text-sm font-semibold">{t("chat.cameraTitle")}</span>
            <button
              onClick={onClose}
              className="grid size-9 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
              aria-label={t("chat.cameraCancel")}
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Viewport */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
            {error ? (
              <div className="max-w-sm px-6 text-center text-sm text-white/80">
                {error}
              </div>
            ) : photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo}
                alt={t("chat.imageAlt")}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="max-h-full max-w-full object-contain"
                />
                {!ready && (
                  <div className="absolute inset-0 grid place-items-center text-sm text-white/70">
                    {t("chat.cameraLoading")}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Controls */}
          <div className="flex h-28 shrink-0 items-center justify-center gap-6 px-6 pb-4">
            {error ? (
              <Button variant="secondary" onClick={onClose}>
                {t("chat.cameraCancel")}
              </Button>
            ) : photo ? (
              <>
                <Button
                  variant="secondary"
                  className="gap-2"
                  onClick={() => setPhoto(null)}
                >
                  <RotateCcw className="size-4" />
                  {t("chat.cameraRetake")}
                </Button>
                <Button className="brand-gradient gap-2 text-white" onClick={confirm}>
                  <Check className="size-4" />
                  {t("chat.cameraUse")}
                </Button>
              </>
            ) : (
              <button
                onClick={capture}
                disabled={!ready}
                aria-label={t("chat.cameraCapture")}
                className="grid size-16 place-items-center rounded-full border-4 border-white/80 bg-white/10 transition-transform active:scale-95 disabled:opacity-40"
              >
                <Camera className="size-7 text-white" />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
