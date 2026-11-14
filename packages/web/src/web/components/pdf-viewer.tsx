import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
// eslint-disable-next-line import/default -- import « ?url » de Vite : l'ADRESSE du fichier, pas le module
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Lecteur PDF de l'app (2026-11-14) : l'original d'un document, ouvert
 * DIRECTEMENT à la page citée par le tuteur.
 *
 * Moteur : PDF.js de Mozilla (`pdfjs-dist`, Apache-2.0, déjà dans le projet).
 * Pas de `react-pdf` : il enveloppe ce même moteur mais embarque sa propre
 * copie, dans une autre version. Le visionneur natif du navigateur (l'ancien
 * <iframe>) ne sait ni ouvrir une page précise sur téléphone, ni même afficher
 * un PDF dans un cadre sur Android.
 *
 * Le fichier est lu sur NOTRE origine (`documentUrl`, la route
 * /api/documents/:id/stream, réservée au propriétaire), par plages d'octets :
 * pour un Skript de 300 pages, seules les pages affichées sont téléchargées.
 *
 * Une page à la fois, nette sur écran haute densité : flèches, saisie du
 * numéro, zoom, ajustement à la largeur, clavier (← → + −).
 */

type PdfJs = typeof import("pdfjs-dist");
let engine: Promise<PdfJs> | null = null;
/** PDF.js n'est chargé qu'à la première ouverture d'un document (≈ 400 Ko), jamais avec la page. */
function loadEngine(): Promise<PdfJs> {
  engine ??= import("pdfjs-dist").then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = workerUrl;
    return lib;
  });
  return engine;
}

/** Fichiers annexes de PDF.js, copiés dans le build par vite/pdfjs-assets-plugin.ts. */
const ASSETS = "/pdfjs";
/** Taille d'une plage demandée au serveur : assez pour une page de texte, peu pour un téléphone. */
const CHUNK = 256 * 1024;

/**
 * Ouvre le document PAR PLAGES D'OCTETS, en les demandant nous-mêmes.
 *
 * PDF.js sait le faire seul, à condition que le serveur annonce la taille du
 * fichier (`Content-Length`) sur une première réponse complète. Le nôtre envoie
 * les gros fichiers en flux, donc sans taille — et PDF.js téléchargeait alors
 * le document entier. Ici la première requête demande les 256 premiers Ko ; la
 * réponse dit la taille totale (`Content-Range`), et PDF.js réclame ensuite
 * seulement les morceaux dont la page affichée a besoin.
 */
async function openByRanges(lib: PdfJs, url: string, signal: AbortSignal, onRangeError: () => void) {
  const common = {
    cMapUrl: `${ASSETS}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${ASSETS}/standard_fonts/`,
    wasmUrl: `${ASSETS}/wasm/`,
    iccUrl: `${ASSETS}/iccs/`,
  };
  const first = await fetch(url, { headers: { Range: `bytes=0-${CHUNK - 1}` }, credentials: "same-origin", signal });
  if (!first.ok) throw new Error(`original ${first.status}`);
  const head = new Uint8Array(await first.arrayBuffer());
  const total = first.status === 206 ? Number(/\/(\d+)\s*$/.exec(first.headers.get("Content-Range") ?? "")?.[1]) : Number.NaN;
  // Petit fichier (ou serveur sans plages) : tout est déjà là.
  if (!Number.isFinite(total) || total <= head.byteLength) return lib.getDocument({ data: head, ...common });

  const transport = new lib.PDFDataRangeTransport(total, head);
  transport.requestDataRange = (begin: number, end: number) => {
    void fetch(url, { headers: { Range: `bytes=${begin}-${end - 1}` }, credentials: "same-origin", signal })
      .then((res) => {
        if (res.status !== 206) throw new Error(`plage ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buffer) => transport.onDataRange(begin, new Uint8Array(buffer)))
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name !== "AbortError") onRangeError();
      });
  };
  return lib.getDocument({ range: transport, rangeChunkSize: CHUNK, disableAutoFetch: true, disableStream: true, ...common });
}
const ZOOMS = [0.6, 0.8, 1, 1.25, 1.5, 2, 2.5] as const;
const clampPage = (n: number, total: number) => Math.min(Math.max(1, Math.round(n) || 1), Math.max(1, total));

export function PDFViewer({
  documentUrl,
  initialPage = 1,
  onError,
  className,
}: {
  /** Adresse SÉCURISÉE de l'original (même origine, session requise). */
  documentUrl: string;
  /** La page à ouvrir d'emblée : celle de la citation. */
  initialPage?: number;
  /** Le fichier n'a pas pu être affiché (l'appelant propose alors le texte extrait). */
  onError?: () => void;
  className?: string;
}) {
  const { t } = useT();
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(initialPage);
  const [typed, setTyped] = useState<string | null>(null);
  /** `null` : ajusté à la largeur du cadre. */
  const [zoom, setZoom] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const [drawing, setDrawing] = useState(true);

  // ── Chargement ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<PdfJs["getDocument"]> | null = null;
    const network = new AbortController();
    const fail = (err?: unknown) => {
      if (cancelled) return;
      console.error("[pdf] document illisible", (err as Error | undefined)?.message ?? "plage non servie");
      setFailed(true);
      onError?.();
    };
    setPdf(null);
    setFailed(false);
    setDrawing(true);
    void loadEngine()
      .then((lib) => (cancelled ? null : openByRanges(lib, documentUrl, network.signal, () => fail())))
      .then((opened) => {
        if (!opened) return null;
        task = opened;
        return opened.promise;
      })
      .then((doc) => {
        if (!doc) return;
        if (cancelled) {
          void doc.loadingTask.destroy();
          return;
        }
        setPdf(doc);
        setPage((p) => clampPage(p, doc.numPages));
      })
      .catch(fail);
    return () => {
      cancelled = true;
      network.abort();
      void task?.destroy();
    };
    // `onError` est un rappel de l'appelant : le recharger à chaque rendu rouvrirait le fichier.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentUrl]);

  // Une nouvelle citation dans le même document : on saute à sa page.
  useEffect(() => {
    setPage((current) => (pdf ? clampPage(initialPage, pdf.numPages) : initialPage) || current);
  }, [initialPage, pdf]);

  // ── Largeur du cadre (ajustement à la largeur) ──────────────────────────
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Dessin de la page ───────────────────────────────────────────────────
  useEffect(() => {
    if (!pdf || !canvas.current || width === 0) return;
    let cancelled = false;
    let render: RenderTask | null = null;
    setDrawing(true);
    void pdf
      .getPage(clampPage(page, pdf.numPages))
      .then((p) => {
        if (cancelled || !canvas.current) return;
        const natural = p.getViewport({ scale: 1 });
        const fit = Math.max(0.2, (width - 24) / natural.width);
        const viewport = p.getViewport({ scale: zoom === null ? fit : fit * zoom });
        // Net sur Retina, sans dépasser ce qu'un téléphone peut allouer.
        const density = Math.min(window.devicePixelRatio || 1, 2.5);
        const el = canvas.current;
        el.width = Math.floor(viewport.width * density);
        el.height = Math.floor(viewport.height * density);
        el.style.width = `${Math.floor(viewport.width)}px`;
        el.style.height = `${Math.floor(viewport.height)}px`;
        render = p.render({ canvas: el, viewport, transform: density === 1 ? undefined : [density, 0, 0, density, 0, 0] });
        return render.promise;
      })
      .then(() => {
        if (!cancelled) setDrawing(false);
      })
      .catch((err: unknown) => {
        // Une page remplacée par la suivante avant la fin de son dessin : rien à signaler.
        if (cancelled || (err as { name?: string })?.name === "RenderingCancelledException") return;
        console.error("[pdf] page illisible", (err as Error)?.message);
        setDrawing(false);
      });
    return () => {
      cancelled = true;
      render?.cancel();
    };
  }, [pdf, page, zoom, width]);

  const total = pdf?.numPages ?? 0;
  const go = useCallback(
    (n: number) => {
      setTyped(null);
      setPage(clampPage(n, total || n));
      frame.current?.scrollTo({ top: 0 });
    },
    [total],
  );
  const zoomBy = (direction: 1 | -1) => {
    const current = zoom ?? 1;
    const next = direction > 0 ? ZOOMS.find((z) => z > current + 0.001) : [...ZOOMS].reverse().find((z) => z < current - 0.001);
    if (next !== undefined) setZoom(next);
  };

  // Clavier, tant que le lecteur est ouvert : ← → (ou Page ↑ ↓) tournent les
  // pages, + et − règlent le zoom. Rien pendant une saisie (numéro de page).
  const keys = useRef({ go, zoomBy, page });
  useEffect(() => {
    keys.current = { go, zoomBy, page };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
      const k = keys.current;
      if (e.key === "ArrowRight" || e.key === "PageDown") k.go(k.page + 1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") k.go(k.page - 1);
      else if (e.key === "+" || e.key === "=") k.zoomBy(1);
      else if (e.key === "-") k.zoomBy(-1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tool = "text-muted-foreground hover:bg-accent hover:text-foreground grid size-8 place-items-center rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-35";

  if (failed) {
    return (
      <div className={cn("text-muted-foreground mx-auto flex h-full max-w-md flex-col items-center justify-center gap-3 p-6 text-center text-sm", className)} data-testid="pdf-viewer-error">
        <AlertTriangle className="size-6" />
        {t("viewer.pdfError")}
      </div>
    );
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)} data-testid="pdf-viewer" data-page={page} data-pages={total} data-ready={pdf && !drawing ? "true" : "false"}>
      <div className="border-border flex items-center justify-between gap-2 border-b px-2 py-1.5">
        <div className="flex items-center gap-1">
          <button type="button" className={tool} onClick={() => go(page - 1)} disabled={!pdf || page <= 1} aria-label={t("viewer.prevPage")} title={t("viewer.prevPage")}>
            <ChevronLeft className="size-4" />
          </button>
          <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <span className="sr-only">{t("viewer.pageOf", { page, total })}</span>
            <input
              inputMode="numeric"
              value={typed ?? String(page)}
              onChange={(e) => setTyped(e.target.value.replace(/\D/g, "").slice(0, 5))}
              onBlur={() => typed !== null && go(Number(typed) || page)}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="border-border bg-background text-foreground focus:border-signature w-12 rounded-md border px-1.5 py-1 text-center text-xs font-semibold tabular-nums outline-none"
              aria-label={t("viewer.pageOf", { page, total })}
              data-testid="pdf-viewer-page"
            />
            <span className="tabular-nums" aria-hidden="true">
              / {total || "…"}
            </span>
          </label>
          <button type="button" className={tool} onClick={() => go(page + 1)} disabled={!pdf || page >= total} aria-label={t("viewer.nextPage")} title={t("viewer.nextPage")}>
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className={tool} onClick={() => zoomBy(-1)} disabled={!pdf || (zoom ?? 1) <= ZOOMS[0]} aria-label={t("viewer.zoomOut")} title={t("viewer.zoomOut")}>
            <ZoomOut className="size-4" />
          </button>
          <span className="text-muted-foreground w-11 text-center text-xs tabular-nums" aria-hidden="true">
            {Math.round((zoom ?? 1) * 100)} %
          </span>
          <button type="button" className={tool} onClick={() => zoomBy(1)} disabled={!pdf || (zoom ?? 1) >= ZOOMS[ZOOMS.length - 1]!} aria-label={t("viewer.zoomIn")} title={t("viewer.zoomIn")}>
            <ZoomIn className="size-4" />
          </button>
          <button type="button" className={cn(tool, zoom === null && "bg-accent text-foreground")} onClick={() => setZoom(null)} disabled={!pdf} aria-label={t("viewer.fitWidth")} title={t("viewer.fitWidth")}>
            <Maximize2 className="size-4" />
          </button>
        </div>
      </div>

      <div ref={frame} className="relative min-h-0 flex-1 overflow-auto bg-neutral-100 dark:bg-neutral-900">
        {(!pdf || drawing) && (
          <div className="text-muted-foreground pointer-events-none absolute inset-x-0 top-6 z-10 flex items-center justify-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> {t("viewer.loading")}
          </div>
        )}
        <div className="flex min-w-full justify-center p-3" style={{ width: "max-content" }}>
          {/* Le texte de repli nomme la page pour un lecteur d'écran ; le contenu lisible est dans l'onglet « Extrahierter Text ». */}
          <canvas ref={canvas} className={cn("bg-white shadow-md transition-opacity", drawing ? "opacity-60" : "opacity-100")}>
            {t("viewer.pageOf", { page, total })}
          </canvas>
        </div>
      </div>
    </div>
  );
}
