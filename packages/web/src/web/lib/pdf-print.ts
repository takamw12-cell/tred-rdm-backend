// Shared "export to PDF" helper used by the scratchpad and the exercises page.
// Rather than pull in a heavy PDF library, we open a print window that reuses
// the app's own stylesheets (so KaTeX formulas and inline SVG diagrams render
// exactly as on screen and stay selectable/vector), apply A4 print CSS, and
// trigger the browser's native "Save as PDF".

function collectHeadStyles(): string {
  const nodes = Array.from(
    document.querySelectorAll('link[rel="stylesheet"], style'),
  );
  return nodes
    .map((n) => {
      if (n.tagName === "LINK") {
        const href = (n as HTMLLinkElement).href;
        return href ? `<link rel="stylesheet" href="${href}">` : "";
      }
      return `<style>${n.innerHTML}</style>`;
    })
    .join("\n");
}

const PRINT_CSS = `
  @page { size: A4; margin: 18mm 16mm; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body {
    background: #fff !important;
    color: #111 !important;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    font-size: 11pt;
    line-height: 1.55;
  }
  .print-root { max-width: 720px; margin: 0 auto; }
  .print-title { font-size: 18pt; font-weight: 800; margin: 0 0 4pt; }
  .print-meta { font-size: 9pt; color: #666; margin: 0 0 16pt; }
  .print-body h1, .print-body h2, .print-body h3 { page-break-after: avoid; }
  .print-body pre, .print-body table, .print-body svg { page-break-inside: avoid; }
  .print-body img, .print-body svg { max-width: 100%; height: auto; }
  .print-body pre {
    background: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 6px;
    padding: 8px 10px; font-size: 9.5pt; overflow: visible; white-space: pre-wrap;
  }
  .print-body table { border-collapse: collapse; width: 100%; }
  .print-body th, .print-body td { border: 1px solid #d4d4d8; padding: 4px 6px; }
`;

/**
 * Open a print window rendering the given HTML as an A4 document and trigger
 * the browser print dialog (where the user can pick "Save as PDF").
 */
export function printHtml(opts: { title: string; meta?: string; bodyHtml: string }) {
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(opts.title)}</title>
${collectHeadStyles()}
<style>${PRINT_CSS}</style>
</head>
<body>
<div class="print-root">
  <div class="print-title">${escapeHtml(opts.title)}</div>
  ${opts.meta ? `<div class="print-meta">${escapeHtml(opts.meta)}</div>` : ""}
  <div class="print-body reading-scalable">${opts.bodyHtml}</div>
</div>
</body>
</html>`;

  // Print via a hidden same-page iframe instead of window.open. Popups are
  // blocked by default on mobile browsers (iOS Safari, Chrome Android), which
  // made "Export PDF" silently do nothing there. An iframe is never blocked and
  // prints only its own document.
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";
  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => iframe.remove(), 1000);
  };

  const go = () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    try {
      win.focus();
      win.print();
    } catch {
      // Fallback: open in a new tab so the user can print/save manually.
      const w = window.open("", "_blank");
      if (w) {
        w.document.open();
        w.document.write(html);
        w.document.close();
      }
    }
    win.addEventListener?.("afterprint", cleanup);
    cleanup();
  };

  const idoc = iframe.contentWindow?.document;
  if (!idoc) {
    iframe.remove();
    return;
  }
  idoc.open();
  idoc.write(html);
  idoc.close();

  // Give stylesheets (and KaTeX fonts) a beat to load before printing.
  if (idoc.readyState === "complete") setTimeout(go, 400);
  else iframe.addEventListener("load", () => setTimeout(go, 400));
}

/** Convenience: print the rendered innerHTML of a live DOM element. */
export function printElement(
  el: HTMLElement | null,
  opts: { title: string; meta?: string },
) {
  if (!el) return;
  printHtml({ title: opts.title, meta: opts.meta, bodyHtml: el.innerHTML });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
