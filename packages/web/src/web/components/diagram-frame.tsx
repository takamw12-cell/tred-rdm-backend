import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Maximize2, Download, X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

// ── Download helpers ──────────────────────────────────────────────────────
function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadSvg(svg: string, name: string) {
  const withNs = svg.includes("xmlns")
    ? svg
    : svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  const blob = new Blob([withNs], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, `${name}.svg`);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Rasterize an SVG string to a high-resolution PNG on a white background so
// figures stay crisp and printable.
function downloadSvgAsPng(svg: string, name: string, scale = 3) {
  const withNs = svg.includes("xmlns")
    ? svg
    : svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  const img = new Image();
  const blob = new Blob([withNs], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  img.onload = () => {
    const w = img.naturalWidth || 800;
    const h = img.naturalHeight || 600;
    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      triggerDownload(canvas.toDataURL("image/png"), `${name}.png`);
    }
    URL.revokeObjectURL(url);
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

// ── Fullscreen zoom overlay ───────────────────────────────────────────────

/**
 * Bereitet ein gerendertes SVG für die Vollbildansicht auf.
 *
 * mermaid schreibt dem Wurzel-<svg> `width="100%"` und ein inline
 * `style="max-width: 611px"`. Im Chat steht das SVG in einem Container mit
 * fester Breite — dort passt das. Im Vollbild sitzt es in einer Box, die sich
 * nach ihrem Inhalt richtet: 100 % von "so breit wie der Inhalt" ist null. Das
 * Diagramm fiel dadurch auf Breite 0 zusammen, sichtbar blieb nur das weiße
 * Kärtchen. Ohne diese Attribute skaliert der Browser sauber über die viewBox.
 */
function fitSvgForOverlay(svg: string): string {
  const open = /<svg\b[^>]*>/.exec(svg);
  // Ohne viewBox trägt width/height die einzige Größeninformation — dann lieber
  // nichts anfassen.
  if (!open || !/viewBox=/.test(open[0])) return svg;
  const cleaned = open[0]
    .replace(/\sstyle="[^"]*"/g, "")
    .replace(/\swidth="[^"]*"/g, "")
    .replace(/\sheight="[^"]*"/g, "");
  return svg.slice(0, open.index) + cleaned + svg.slice(open.index + open[0].length);
}

function ZoomOverlay({
  open,
  onClose,
  children,
  onDownloadPng,
  onDownloadSvg,
  panel = "white",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  onDownloadPng?: () => void;
  onDownloadSvg?: () => void;
  /**
   * Hintergrund der Vollbild-Karte. Mermaid-Diagramme folgen dem App-Theme und
   * haben im Dunkelmodus helle Schrift — auf Weiß wären sie unsichtbar. TikZ
   * zeichnet dagegen schwarz auf transparent und braucht Weiß.
   */
  panel?: "card" | "white";
}) {
  const { t } = useT();
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragging = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (open) {
      setScale(1);
      setPos({ x: 0, y: 0 });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.min(6, Math.max(0.5, s - e.deltaY * 0.0015 * s)));
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex flex-col bg-black/80 backdrop-blur-sm"
        >
          {/* Toolbar */}
          <div className="flex items-center justify-end gap-1.5 p-3">
            <button
              onClick={() => setScale((s) => Math.max(0.5, s - 0.3))}
              className="grid size-9 place-items-center rounded-lg bg-white/10 text-white transition-colors hover:bg-white/20"
              aria-label={t("diagram.zoomOut")}
            >
              <ZoomOut className="size-4" />
            </button>
            <span className="min-w-14 text-center text-xs font-medium text-white/80 tabular-nums">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => setScale((s) => Math.min(6, s + 0.3))}
              className="grid size-9 place-items-center rounded-lg bg-white/10 text-white transition-colors hover:bg-white/20"
              aria-label={t("diagram.zoomIn")}
            >
              <ZoomIn className="size-4" />
            </button>
            <button
              onClick={() => {
                setScale(1);
                setPos({ x: 0, y: 0 });
              }}
              className="grid size-9 place-items-center rounded-lg bg-white/10 text-white transition-colors hover:bg-white/20"
              aria-label={t("diagram.reset")}
            >
              <RotateCcw className="size-4" />
            </button>
            <div className="mx-1 h-5 w-px bg-white/20" />
            {onDownloadPng && (
              <button
                onClick={onDownloadPng}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-semibold text-white transition-colors hover:bg-white/20"
              >
                <Download className="size-4" /> PNG
              </button>
            )}
            {onDownloadSvg && (
              <button
                onClick={onDownloadSvg}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-semibold text-white transition-colors hover:bg-white/20"
              >
                <Download className="size-4" /> SVG
              </button>
            )}
            <button
              onClick={onClose}
              className="ml-1 grid size-9 place-items-center rounded-lg bg-white/10 text-white transition-colors hover:bg-white/20"
              aria-label={t("common.close")}
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Canvas */}
          <div
            className="flex flex-1 cursor-grab items-center justify-center overflow-hidden p-4 active:cursor-grabbing"
            onWheel={onWheel}
            onPointerDown={(e) => {
              dragging.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!dragging.current) return;
              setPos({ x: e.clientX - dragging.current.x, y: e.clientY - dragging.current.y });
            }}
            onPointerUp={() => (dragging.current = null)}
            onClick={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
          >
            <div
              className={cn(
                "rounded-xl p-6 shadow-2xl",
                "[&_svg]:h-auto [&_svg]:max-w-none",
                panel === "card" ? "bg-card" : "bg-white",
              )}
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
                transition: dragging.current ? "none" : "transform 0.08s ease-out",
              }}
            >
              {children}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ── SVG diagram frame ─────────────────────────────────────────────────────
// Wraps a rendered SVG (Mermaid / TikZ) with a hover toolbar (expand + download)
// and a fullscreen zoom overlay. `svg` is the raw markup used for downloads and
// the enlarged view.
export function SvgDiagramFrame({
  svg,
  name,
  background = "card",
  className,
}: {
  svg: string;
  name: string;
  background?: "card" | "white";
  className?: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        className={cn(
          "border-border group relative my-3 flex justify-center overflow-x-auto rounded-xl border p-4",
          background === "white" ? "bg-white" : "bg-card",
          className,
        )}
      >
        <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={() => downloadSvgAsPng(svg, name)}
            className="bg-background/90 text-muted-foreground hover:text-foreground grid size-8 place-items-center rounded-lg border shadow-sm backdrop-blur"
            aria-label={t("diagram.download")}
            title={t("diagram.download")}
          >
            <Download className="size-3.5" />
          </button>
          <button
            onClick={() => setOpen(true)}
            className="bg-background/90 text-muted-foreground hover:text-foreground grid size-8 place-items-center rounded-lg border shadow-sm backdrop-blur"
            aria-label={t("diagram.fullscreen")}
            title={t("diagram.fullscreen")}
          >
            <Maximize2 className="size-3.5" />
          </button>
        </div>
        <div
          className="w-full cursor-zoom-in [&_svg]:h-auto [&_svg]:w-full [&_svg]:max-w-[560px]"
          onClick={() => setOpen(true)}
          // SVG comes from our own render pipeline (sanitized / no scripts).
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>

      <ZoomOverlay
        open={open}
        onClose={() => setOpen(false)}
        onDownloadPng={() => downloadSvgAsPng(svg, name)}
        onDownloadSvg={() => downloadSvg(svg, name)}
        panel={background}
      >
        <div
          className="[&>svg]:h-auto [&>svg]:w-[min(84vw,1100px)] [&>svg]:max-w-none"
          dangerouslySetInnerHTML={{ __html: fitSvgForOverlay(svg) }}
        />
      </ZoomOverlay>
    </>
  );
}

// ── Generic (canvas-based) diagram frame ──────────────────────────────────
// For charts drawn on <canvas>. Provides expand + PNG download by reading the
// canvas inside the wrapped node.
export function CanvasDiagramFrame({
  name,
  children,
  fullscreenChildren,
  className,
}: {
  name: string;
  children: ReactNode;
  fullscreenChildren: ReactNode;
  className?: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const downloadPng = useCallback(() => {
    const canvas = ref.current?.querySelector("canvas");
    if (canvas) triggerDownload(canvas.toDataURL("image/png"), `${name}.png`);
  }, [name]);

  return (
    <>
      <div
        ref={ref}
        className={cn(
          "border-border bg-card group relative my-3 rounded-xl border p-3",
          className,
        )}
      >
        <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={downloadPng}
            className="bg-background/90 text-muted-foreground hover:text-foreground grid size-8 place-items-center rounded-lg border shadow-sm backdrop-blur"
            aria-label={t("diagram.download")}
            title={t("diagram.download")}
          >
            <Download className="size-3.5" />
          </button>
          <button
            onClick={() => setOpen(true)}
            className="bg-background/90 text-muted-foreground hover:text-foreground grid size-8 place-items-center rounded-lg border shadow-sm backdrop-blur"
            aria-label={t("diagram.fullscreen")}
            title={t("diagram.fullscreen")}
          >
            <Maximize2 className="size-3.5" />
          </button>
        </div>
        {children}
      </div>

      <ZoomOverlay open={open} onClose={() => setOpen(false)} panel="card">
        <div className="h-[70vh] w-[80vw] max-w-[1100px]">{fullscreenChildren}</div>
      </ZoomOverlay>
    </>
  );
}

// ── Image frame ────────────────────────────────────────────────────────────
// Displays a user-uploaded image (photo / scan) with click-to-fullscreen zoom
// and a download button, reusing the same ZoomOverlay as the diagrams.
export function ImageFrame({
  src,
  alt,
  className,
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className={cn("group relative inline-block", className)}>
        <img
          src={src}
          alt={alt ?? ""}
          onClick={() => setOpen(true)}
          className="max-h-56 w-auto max-w-full cursor-zoom-in rounded-xl border border-border object-contain"
        />
        <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={() => triggerDownload(src, "aerostudy-image.png")}
            className="bg-background/90 text-muted-foreground hover:text-foreground grid size-8 place-items-center rounded-lg border shadow-sm backdrop-blur"
            aria-label={t("diagram.download")}
            title={t("diagram.download")}
          >
            <Download className="size-3.5" />
          </button>
          <button
            onClick={() => setOpen(true)}
            className="bg-background/90 text-muted-foreground hover:text-foreground grid size-8 place-items-center rounded-lg border shadow-sm backdrop-blur"
            aria-label={t("diagram.fullscreen")}
            title={t("diagram.fullscreen")}
          >
            <Maximize2 className="size-3.5" />
          </button>
        </div>
      </div>

      <ZoomOverlay
        open={open}
        onClose={() => setOpen(false)}
        onDownloadPng={() => triggerDownload(src, "aerostudy-image.png")}
      >
        <img src={src} alt={alt ?? ""} className="max-h-[80vh] w-auto max-w-none" />
      </ZoomOverlay>
    </>
  );
}
