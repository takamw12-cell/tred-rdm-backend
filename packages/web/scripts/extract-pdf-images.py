#!/usr/bin/env python3
"""
Extrait les schémas d'un PDF (circuits, croquis de forces, diagrammes) en PNG,
avec leur page, leur position et la Teilaufgabe à laquelle ils appartiennent.

    uv run --with pymupdf python packages/web/scripts/extract-pdf-images.py COURS.pdf --out figures/

Deux sortes de figures :
  · les images (XObject raster) — la plupart des feuilles d'exercices ;
  · les dessins vectoriels (circuits dessinés dans Word/LaTeX), regroupés par
    PyMuPDF (cluster_drawings) puis rendus en PNG haute résolution.

Ce qui se répète sur la plupart des pages (logo, en-tête, cadre) est ignoré.
Le cadre de chaque figure est élargi aux étiquettes TEXTE posées à côté
(« U0 », « R1 = 100 Ω ») : sans elles, un schéma perd ses valeurs.

Sortie : <out>/figures.json et un PNG par figure. Chaque entrée :
    {"file", "page", "bbox": [x0, y0, x1, y1] (points PDF), "kind": "image"|"vector",
     "aufgabe": "5" | null, "teil": "e" | null, "context": "e) Gegeben ist …"}
"teil" null = figure d'avant les Teilaufgaben (Grundschaltung).

Outil de développement et de contrôle : le serveur, lui, décrit les figures
pendant l'import (src/api/lib/extract.ts, vision) — voir GUIDE_FOUNDER.md.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import pymupdf  # PyMuPDF ≥ 1.24 (cluster_drawings)

TASK_RE = re.compile(r"^\s*(?:Aufgabe|Übung|Uebung|Exercise|Exercice|Problem)\s+(\d+(?:\.\d+)*)\b", re.I)
SUB_RE = re.compile(r"^\s*(?:\(([a-h])\)|([a-h])[).])\s+\S")

MIN_SIDE = 40  # points : en dessous, c'est une icône ou un trait
REPEAT_SHARE = 0.6  # présent sur ≥ 60 % des pages → décor
LABEL_GAP = 18  # points : une étiquette à moins de cette distance fait partie du schéma
LABEL_MAX_CHARS = 40
MIN_SHAPES = 4  # un dessin vectoriel de moins de 4 formes est un cadre ou un trait


def _key(r: pymupdf.Rect) -> tuple[int, int, int, int]:
    return tuple(round(v / 5) for v in (r.x0, r.y0, r.x1, r.y1))  # type: ignore[return-value]


def _candidates(page: pymupdf.Page) -> list[tuple[str, pymupdf.Rect]]:
    out: list[tuple[str, pymupdf.Rect]] = []
    for img in page.get_images(full=True):
        for r in page.get_image_rects(img[0]):
            if r.width >= MIN_SIDE and r.height >= MIN_SIDE:
                out.append(("image", pymupdf.Rect(r)))
    try:
        clusters = page.cluster_drawings()
    except Exception:  # PyMuPDF trop ancien : on se contente des images
        clusters = []
    drawings = page.get_drawings() if clusters else []
    for r in clusters:
        # Un cadre autour d'un encadré de texte (une ou deux formes) n'est pas un schéma.
        if sum(1 for d in drawings if r.contains(d["rect"])) < MIN_SHAPES:
            continue
        if r.width >= MIN_SIDE and r.height >= MIN_SIDE:
            # Un dessin vectoriel entièrement couvert par une image n'est pas une figure à part.
            if not any(k == "image" and pymupdf.Rect(o).contains(r) for k, o in out):
                out.append(("vector", pymupdf.Rect(r)))
    return out


def _with_labels(page: pymupdf.Page, rect: pymupdf.Rect) -> pymupdf.Rect:
    """Élargit le cadre aux courtes étiquettes texte qui le touchent presque."""
    grown = pymupdf.Rect(rect)
    near = pymupdf.Rect(rect.x0 - LABEL_GAP, rect.y0 - LABEL_GAP, rect.x1 + LABEL_GAP, rect.y1 + LABEL_GAP)
    for x0, y0, x1, y1, text, *_ in page.get_text("blocks"):
        b = pymupdf.Rect(x0, y0, x1, y1)
        t = text.strip()
        if not t or len(t) > LABEL_MAX_CHARS or SUB_RE.match(t) or TASK_RE.match(t):
            continue
        if b.intersects(near):
            grown |= b
    return grown & page.rect


def _text_lines(page: pymupdf.Page) -> list[tuple[float, float, str]]:
    """Les lignes de texte de la page (y0, x0, texte), dans l'ordre de lecture."""
    out: list[tuple[float, float, str]] = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            text = "".join(span["text"] for span in line["spans"]).strip()
            if text:
                out.append((line["bbox"][1], line["bbox"][0], text))
    return sorted(out)


def _lines_before(doc: pymupdf.Document, page_no: int, y: float) -> list[str]:
    """Toutes les lignes de texte du document situées avant le point (page, y)."""
    lines: list[str] = []
    for p in range(page_no + 1):
        lines.extend(t for y0, _x0, t in _text_lines(doc[p]) if p < page_no or y0 < y - 2)
    return lines


def _owner(lines: list[str]) -> tuple[str | None, str | None, str]:
    """La dernière Aufgabe et la dernière Teilaufgabe avant la figure (dans cette Aufgabe)."""
    aufgabe = teil = None
    context = ""
    for line in lines:
        t = TASK_RE.match(line)
        if t:
            aufgabe, teil, context = t.group(1), None, line.strip()
            continue
        s = SUB_RE.match(line)
        if s:
            teil, context = (s.group(1) or s.group(2)).lower(), line.strip()
    return aufgabe, teil, context


def extract(pdf: Path, out: Path, dpi: int = 200) -> list[dict]:
    doc = pymupdf.open(pdf)
    out.mkdir(parents=True, exist_ok=True)
    per_page = [_candidates(doc[i]) for i in range(doc.page_count)]

    # Décor : un cadre identique sur la plupart des pages.
    seen: dict[tuple[int, int, int, int], int] = {}
    for cands in per_page:
        for k in {_key(r) for _, r in cands}:
            seen[k] = seen.get(k, 0) + 1
    repeated = {k for k, n in seen.items() if doc.page_count >= 3 and n >= REPEAT_SHARE * doc.page_count}

    figures: list[dict] = []
    for i, cands in enumerate(per_page):
        page = doc[i]
        kept: list[tuple[str, pymupdf.Rect]] = []
        for kind, r in sorted(cands, key=lambda c: (c[1].y0, c[1].x0)):
            if _key(r) in repeated:
                continue
            r = _with_labels(page, r)
            # Deux candidats qui se chevauchent (image + son cadre vectoriel) : une seule figure.
            merged = False
            for j, (k2, r2) in enumerate(kept):
                if r.intersects(r2):
                    kept[j] = ("image" if "image" in (k2, kind) else "vector", r2 | r)
                    merged = True
                    break
            if not merged:
                kept.append((kind, r))
        for n, (kind, r) in enumerate(kept, start=1):
            aufgabe, teil, context = _owner(_lines_before(doc, i, r.y0))
            name = f"seite{i + 1:03d}-abb{n}.png"
            page.get_pixmap(clip=r, dpi=dpi).save(out / name)
            figures.append(
                {
                    "file": name,
                    "page": i + 1,
                    "bbox": [round(v, 1) for v in (r.x0, r.y0, r.x1, r.y1)],
                    "kind": kind,
                    "aufgabe": aufgabe,
                    "teil": teil,
                    "context": context,
                }
            )
    (out / "figures.json").write_text(json.dumps(figures, ensure_ascii=False, indent=2), encoding="utf-8")
    return figures


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--out", type=Path, default=Path("figures"))
    ap.add_argument("--dpi", type=int, default=200)
    a = ap.parse_args()
    figures = extract(a.pdf, a.out, a.dpi)
    for f in figures:
        owner = f"Aufgabe {f['aufgabe']} {f['teil'] + ')' if f['teil'] else '(Grundschaltung)'}" if f["aufgabe"] else "—"
        print(f"S. {f['page']:>3}  {f['kind']:<6}  {owner:<28}  {f['file']}")
    print(f"{len(figures)} Abbildung(en) → {a.out / 'figures.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
