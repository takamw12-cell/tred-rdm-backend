#!/usr/bin/env python3
"""TRED — le moteur de dessin de « Als Video erklären ».

Entrée : un storyboard JSON (ce qui se dessine, où, quand) et, s'il y en a une,
la voix (MP3). Sortie : un MP4 où chaque trait se trace sous les yeux de
l'étudiant, à l'instant où la voix en parle.

    python -I -B -X utf8 render_video.py --storyboard story.json --out video.mp4
                                         [--audio voix.mp3] [--subtitles st.srt]

Deux styles, un seul format d'entrée :
  · « whiteboard » : tracé à la main (Handanim, Cairo) sur fond crème ;
  · « cinematic »  : traits nets, lueur et flou de mouvement (Buttery, Skia)
                     sur fond nuit.

Par-dessus le tracé, deux couches :
  · des ICÔNES ANIMÉES (kind « icon ») prises dans icons.json — une bibliothèque
    locale tirée de Lucide. L'icône se trace, puis vit : l'engrenage tourne,
    le cerveau bat, la balance oscille. Le mouvement appartient à l'icône,
    jamais au storyboard ;
  · une MUSIQUE de fond (--music) qui s'efface quand la voix parle (« ducking ») :
    −20 dB pendant chaque passage parlé du storyboard (« speech »), −10 dB sinon.

── Ce que ce programme ne fait jamais ──────────────────────────────────────
Le storyboard est écrit par un modèle de langage : il est traité comme une
donnée hostile. Aucun `eval`, aucun chemin de fichier lu dans le JSON, aucune
commande construite à partir de lui. Chaque champ est borné (nombre
d'éléments, coordonnées, longueurs de texte, durées) avant qu'une seule
bibliothèque de dessin ne le voie. Une formule passe par l'analyseur mathtext
de Matplotlib, qui ne lance rien.

── Repère ──────────────────────────────────────────────────────────────────
Toile logique de 1600 × 900, origine en haut à gauche, y vers le bas — quel
que soit le nombre de pixels rendus. Les instants sont en secondes.

La sortie standard porte une ligne JSON par événement ({"progress": 0.4}),
la dernière étant le résultat ({"ok": true, …} ou {"ok": false, "error": …}).
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import subprocess
import sys
import time

os.environ.setdefault("TQDM_DISABLE", "1")
# Matplotlib (formules) : pas d'écran, et un cache hors du dossier personnel.
os.environ.setdefault("MPLBACKEND", "Agg")

LOGICAL_W, LOGICAL_H = 1600.0, 900.0
MARGIN = 60.0  # un point peut dépasser la toile de cette marge, pas davantage
MAX_ELEMENTS = 320
MAX_POINTS = 64
MAX_TEXT = 60
MAX_TEX = 160
MAX_DURATION = 240.0
MIN_DRAW = 0.15
FADE = 0.4

STYLES = ("whiteboard", "cinematic")
KINDS = ("line", "arrow", "polyline", "curve", "circle", "ellipse", "rect", "text", "formula", "icon")
MAX_SPEECH_SPANS = 600
COLORS = ("ink", "accent", "red", "blue", "green", "gray")

# La charte de TRED : crème / encre / jaune le jour, nuit / craie / jaune le soir.
PALETTES = {
    "whiteboard": {"bg": "#FDFBF7", "ink": "#1A1A1A", "accent": "#CA8A04", "red": "#C81E1E", "blue": "#1D4ED8", "green": "#15803D", "gray": "#6B7280", "fill": "#EAB308"},
    "cinematic": {"bg": "#0F172A", "ink": "#F8FAFC", "accent": "#EAB308", "red": "#F87171", "blue": "#60A5FA", "green": "#4ADE80", "gray": "#94A3B8", "fill": "#EAB308"},
}

# Les caractères d'une formule TeX, et eux seuls.
TEX_ONLY = re.compile(r"^[A-Za-z0-9\s\\{}^_+\-*/=()\[\]|.,!<>:;'&]+$")


_ICONS: dict | None = None


def icon_library() -> dict:
    """La bibliothèque locale d'icônes (icons.json, à côté de ce programme)."""
    global _ICONS
    if _ICONS is None:
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons.json"), encoding="utf-8") as fh:
            _ICONS = json.load(fh)["icons"]
    return _ICONS


class StoryboardError(ValueError):
    """Le storyboard n'a pas la forme attendue : rien n'est dessiné."""


# La sortie standard est un protocole (une ligne JSON par événement). Les
# bibliothèques de dessin, elles, y écrivent parfois (« Glyph not found ») :
# tout ce qui n'est pas `emit` part donc sur la sortie d'erreur.
_PROTOCOL = sys.stdout
sys.stdout = sys.stderr


def emit(obj: dict) -> None:
    _PROTOCOL.write(json.dumps(obj, ensure_ascii=True) + "\n")
    _PROTOCOL.flush()


# ────────────────────────────────────────────────────────────── validation


def _num(v, lo: float, hi: float, name: str) -> float:
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        raise StoryboardError(f"{name}: nombre attendu")
    if v < lo or v > hi:
        raise StoryboardError(f"{name}: {v} hors de [{lo}, {hi}]")
    return float(v)


def _point(v, name: str) -> tuple[float, float]:
    if not isinstance(v, (list, tuple)) or len(v) != 2:
        raise StoryboardError(f"{name}: point [x, y] attendu")
    return (_num(v[0], -MARGIN, LOGICAL_W + MARGIN, f"{name}.x"), _num(v[1], -MARGIN, LOGICAL_H + MARGIN, f"{name}.y"))


def _points(v, name: str, least: int) -> list[tuple[float, float]]:
    if not isinstance(v, list) or not (least <= len(v) <= MAX_POINTS):
        raise StoryboardError(f"{name}: entre {least} et {MAX_POINTS} points attendus")
    return [_point(p, f"{name}[{i}]") for i, p in enumerate(v)]


def _text(v, limit: int, name: str) -> str:
    if not isinstance(v, str):
        raise StoryboardError(f"{name}: texte attendu")
    s = " ".join(v.split())
    if not s or len(s) > limit:
        raise StoryboardError(f"{name}: entre 1 et {limit} caractères attendus")
    if any(ord(c) < 32 for c in s):
        raise StoryboardError(f"{name}: caractère de contrôle")
    return s


def validate(data) -> dict:
    """Le storyboard tel qu'il a le droit d'atteindre les bibliothèques de dessin."""
    if not isinstance(data, dict):
        raise StoryboardError("storyboard: objet attendu")
    style = data.get("style", "whiteboard")
    if style not in STYLES:
        raise StoryboardError(f"style: {STYLES} attendu")
    duration = _num(data.get("duration"), 1.0, MAX_DURATION, "duration")
    raw = data.get("elements")
    if not isinstance(raw, list) or not (1 <= len(raw) <= MAX_ELEMENTS):
        raise StoryboardError(f"elements: entre 1 et {MAX_ELEMENTS} éléments attendus")

    elements = []
    for i, el in enumerate(raw):
        name = f"elements[{i}]"
        if not isinstance(el, dict):
            raise StoryboardError(f"{name}: objet attendu")
        kind = el.get("kind")
        if kind not in KINDS:
            raise StoryboardError(f"{name}.kind: {kind!r} inconnu")
        color = el.get("color", "ink")
        if color not in COLORS:
            raise StoryboardError(f"{name}.color: {color!r} inconnue")
        at = _num(el.get("at", 0.0), 0.0, duration, f"{name}.at")
        dur = _num(el.get("dur", 0.8), MIN_DRAW, 20.0, f"{name}.dur")
        until = el.get("until")
        if until is not None:
            until = _num(until, at + dur, MAX_DURATION, f"{name}.until")
        out = {
            "id": f"e{i}",
            "kind": kind,
            "color": color,
            "at": at,
            "dur": dur,
            "until": until,
            "weight": _num(el.get("weight", 1.0), 0.5, 3.0, f"{name}.weight"),
            "fill": bool(el.get("fill", False)),
            # Les éléments d'une même scène : le rendu cinématique ne calcule que la scène à l'écran.
            "group": int(_num(el.get("group", 0), 0, 63, f"{name}.group")),
        }
        if kind in ("line", "arrow"):
            out["points"] = [_point(el.get("from"), f"{name}.from"), _point(el.get("to"), f"{name}.to")]
        elif kind in ("polyline", "curve"):
            out["points"] = _points(el.get("points"), f"{name}.points", 2 if kind == "polyline" else 3)
            out["closed"] = bool(el.get("closed", False))
        elif kind == "circle":
            out["center"] = _point(el.get("center"), f"{name}.center")
            out["rx"] = out["ry"] = _num(el.get("r"), 4.0, 450.0, f"{name}.r")
        elif kind == "ellipse":
            out["center"] = _point(el.get("center"), f"{name}.center")
            out["rx"] = _num(el.get("rx"), 4.0, 800.0, f"{name}.rx")
            out["ry"] = _num(el.get("ry"), 4.0, 450.0, f"{name}.ry")
        elif kind == "rect":
            out["corner"] = _point(el.get("corner"), f"{name}.corner")
            out["w"] = _num(el.get("w"), 4.0, LOGICAL_W, f"{name}.w")
            out["h"] = _num(el.get("h"), 4.0, LOGICAL_H, f"{name}.h")
        elif kind == "text":
            out["text"] = _text(el.get("text"), MAX_TEXT, f"{name}.text")
            out["center"] = _point(el.get("center"), f"{name}.center")
            out["size"] = _num(el.get("size", 44.0), 18.0, 140.0, f"{name}.size")
        elif kind == "formula":
            tex = _text(el.get("tex"), MAX_TEX, f"{name}.tex").strip("$").strip()
            if not tex or not TEX_ONLY.match(tex):
                raise StoryboardError(f"{name}.tex: caractères hors d'une formule")
            out["tex"] = tex
            out["center"] = _point(el.get("center"), f"{name}.center")
            out["size"] = _num(el.get("size", 52.0), 18.0, 140.0, f"{name}.size")
        elif kind == "icon":
            name_ = el.get("name")
            if not isinstance(name_, str) or name_ not in icon_library():
                raise StoryboardError(f"{name}.name: icône inconnue")
            out["name"] = name_
            out["center"] = _point(el.get("center"), f"{name}.center")
            out["size"] = _num(el.get("size", 200.0), 60.0, 420.0, f"{name}.size")
        elements.append(out)

    # Les passages parlés, pour baisser la musique : [début, fin] en secondes.
    speech = []
    raw_speech = data.get("speech", [])
    if not isinstance(raw_speech, list) or len(raw_speech) > MAX_SPEECH_SPANS:
        raise StoryboardError("speech: liste de passages attendue")
    for i, span in enumerate(raw_speech):
        if not isinstance(span, (list, tuple)) or len(span) != 2:
            raise StoryboardError(f"speech[{i}]: [début, fin] attendu")
        a = _num(span[0], 0.0, MAX_DURATION, f"speech[{i}][0]")
        b = _num(span[1], a, MAX_DURATION, f"speech[{i}][1]")
        speech.append((a, b))
    return {"style": style, "duration": duration, "elements": elements, "speech": speech}


# ────────────────────────────────────────────────────────────── géométrie


def hex_rgb(value: str) -> tuple[float, float, float]:
    v = value.lstrip("#")
    return (int(v[0:2], 16) / 255.0, int(v[2:4], 16) / 255.0, int(v[4:6], 16) / 255.0)


def ellipse_points(center, rx: float, ry: float, n: int = 40) -> list[tuple[float, float]]:
    # Le tracé part du haut et tourne dans le sens d'une main droite.
    cx, cy = center
    return [(cx + rx * math.sin(2 * math.pi * k / n), cy - ry * math.cos(2 * math.pi * k / n)) for k in range(n + 1)]


def catmull_rom(points: list[tuple[float, float]], closed: bool, per_segment: int = 10) -> list[tuple[float, float]]:
    """Une courbe lisse qui passe par chaque point (Catmull-Rom uniforme)."""
    pts = list(points)
    if closed:
        ring = [pts[-1]] + pts + [pts[0], pts[1]]
        spans = len(pts)
    else:
        ring = [pts[0]] + pts + [pts[-1]]
        spans = len(pts) - 1
    out: list[tuple[float, float]] = []
    for i in range(spans):
        p0, p1, p2, p3 = ring[i], ring[i + 1], ring[i + 2], ring[i + 3]
        for s in range(per_segment):
            t = s / per_segment
            t2, t3 = t * t, t * t * t
            out.append(
                (
                    0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                    0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
                )
            )
    out.append(ring[spans + 1])
    return out


def arrow_head(a, b, size: float) -> list[list[tuple[float, float]]]:
    """Les deux barbes d'une flèche a → b."""
    ang = math.atan2(b[1] - a[1], b[0] - a[0])
    barbs = []
    for side in (-1, 1):
        th = ang + math.pi + side * math.radians(26)
        barbs.append([b, (b[0] + size * math.cos(th), b[1] + size * math.sin(th))])
    return barbs


def stroke_paths(el: dict) -> list[list[tuple[float, float]]]:
    """Un élément géométrique → la suite des tracés que la « main » parcourt."""
    kind = el["kind"]
    if kind == "line":
        return [el["points"]]
    if kind == "arrow":
        a, b = el["points"]
        return [el["points"], *arrow_head(a, b, 26.0 * el["weight"])]
    if kind == "polyline":
        return [el["points"] + ([el["points"][0]] if el["closed"] else [])]
    if kind == "curve":
        return [catmull_rom(el["points"], el["closed"])]
    if kind in ("circle", "ellipse"):
        return [ellipse_points(el["center"], el["rx"], el["ry"])]
    if kind == "rect":
        x, y = el["corner"]
        w, h = el["w"], el["h"]
        return [[(x, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y)]]
    return []


def path_length(pts) -> float:
    return sum(math.dist(a, b) for a, b in zip(pts[:-1], pts[1:]))


def formula_mask(tex: str, size_px: float):
    """La formule en niveaux de gris (couverture 0–255), ou None si mathtext la refuse."""
    import numpy as np
    from matplotlib.font_manager import FontProperties
    from matplotlib.mathtext import MathTextParser

    try:
        parsed = MathTextParser("agg").parse(f"${tex}$", dpi=72, prop=FontProperties(size=size_px, math_fontfamily="cm"))
    except Exception:
        return None
    mask = np.asarray(parsed.image, dtype=np.uint8)
    return mask if mask.ndim == 2 and mask.size > 0 else None


# Écritures dont les lettres se lient ou se combinent : sans moteur de mise en forme,
# elles sortiraient fausses. Mieux vaut un schéma sans étiquette (la voix et les
# sous-titres, eux, sont dans la langue de l'étudiant).
SHAPED_SCRIPTS = re.compile(r"[\u0590-\u08FF\u0900-\u0DFF\uFB1D-\uFDFF\uFE70-\uFEFF]")

_TYPESET_GLYPHS: set[int] | None = None


def text_mask(text: str, size_px: float):
    """Une étiquette typographiée (DejaVu Sans : latin, grec, cyrillique, signes), ou None si un signe manque."""
    import numpy as np
    from fontTools.ttLib import TTFont
    from matplotlib import font_manager
    from matplotlib.mathtext import MathTextParser

    global _TYPESET_GLYPHS
    if _TYPESET_GLYPHS is None:
        _TYPESET_GLYPHS = set(TTFont(font_manager.findfont("DejaVu Sans")).getBestCmap().keys())
    if SHAPED_SCRIPTS.search(text) or any(c != " " and ord(c) not in _TYPESET_GLYPHS for c in text):
        return None
    try:
        parsed = MathTextParser("agg").parse(text.replace("$", r"\$"), dpi=72, prop=font_manager.FontProperties(family="DejaVu Sans", size=size_px))
    except Exception:
        return None
    mask = np.asarray(parsed.image, dtype=np.uint8)
    return mask if mask.ndim == 2 and mask.size > 0 else None


_ICON_OPS: dict[str, list] = {}


def icon_ops(name: str) -> list:
    """Les tracés d'une icône, prêts pour Cairo : [(longueur, [(op, points…)])], dans le repère 24 × 24 de Lucide."""
    if name in _ICON_OPS:
        return _ICON_OPS[name]
    import cairo
    from svgelements import Close, CubicBezier, Line, Move, Path, QuadraticBezier

    probe = cairo.Context(cairo.ImageSurface(cairo.FORMAT_A8, 1, 1))
    out = []
    for d in icon_library()[name]["paths"]:
        path = Path(d)
        path.approximate_arcs_with_cubics()
        ops = []
        for seg in path:
            if isinstance(seg, Move):
                ops.append(("M", seg.end.x, seg.end.y))
            elif isinstance(seg, Line):
                ops.append(("L", seg.end.x, seg.end.y))
            elif isinstance(seg, CubicBezier):
                ops.append(("C", seg.control1.x, seg.control1.y, seg.control2.x, seg.control2.y, seg.end.x, seg.end.y))
            elif isinstance(seg, QuadraticBezier):
                # Quadratique → cubique (2/3 du chemin vers le point de contrôle).
                x0, y0, qx, qy, x1, y1 = seg.start.x, seg.start.y, seg.control.x, seg.control.y, seg.end.x, seg.end.y
                ops.append(("C", x0 + 2 / 3 * (qx - x0), y0 + 2 / 3 * (qy - y0), x1 + 2 / 3 * (qx - x1), y1 + 2 / 3 * (qy - y1), x1, y1))
            elif isinstance(seg, Close):
                ops.append(("Z",))
        # La longueur du tracé, pour le faire avancer : on le mesure aplati.
        probe.new_path()
        trace_icon(probe, ops)
        length, last, start = 0.0, None, None
        for kind, pts in probe.copy_path_flat():
            if kind == cairo.PATH_MOVE_TO:
                last = start = pts
            elif kind == cairo.PATH_LINE_TO:
                length += math.dist(last, pts)
                last = pts
            elif kind == cairo.PATH_CLOSE_PATH and last is not None and start is not None:
                length += math.dist(last, start)
                last = start
        out.append((max(length, 0.01), ops))
    _ICON_OPS[name] = out
    return out


def trace_icon(ctx, ops: list) -> None:
    for op in ops:
        if op[0] == "M":
            ctx.move_to(op[1], op[2])
        elif op[0] == "L":
            ctx.line_to(op[1], op[2])
        elif op[0] == "C":
            ctx.curve_to(*op[1:])
        else:
            ctx.close_path()


def icon_overlay(el: dict, color_hex: str, width: int, height: int, glow: bool) -> dict:
    """Une icône animée en calque : sa place en pixels, sa couleur, son mouvement."""
    return {
        "icon": el["name"],
        "anim": icon_library()[el["name"]]["anim"],
        "cx": el["center"][0] * width / LOGICAL_W,
        "cy": el["center"][1] * height / LOGICAL_H,
        "size": el["size"] * width / LOGICAL_W,
        "color": hex_rgb(color_hex),
        "weight": el["weight"],
        "glow": glow,
        "at": el["at"],
        "dur": el["dur"],
        "until": el["until"],
    }


def draw_icon(out, ov: dict, t: float, fade: float, width: int, height: int) -> None:
    """Trace l'icône à l'instant t dans l'image (float32) : elle se dessine, puis elle vit."""
    import cairo
    import numpy as np

    size = ov["size"]
    box = int(math.ceil(size * 1.9)) | 1
    x0, y0 = int(round(ov["cx"] - box / 2)), int(round(ov["cy"] - box / 2))
    fx0, fy0, fx1, fy1 = max(x0, 0), max(y0, 0), min(x0 + box, width), min(y0 + box, height)
    if fx1 <= fx0 or fy1 <= fy0:
        return
    progress = min(1.0, (t - ov["at"]) / ov["dur"])
    life = max(0.0, t - ov["at"] - ov["dur"])
    # L'entrée : l'icône grandit un peu en se traçant. Ensuite, son mouvement propre.
    scale, rot, dy, alpha = 0.86 + 0.14 * (1 - (1 - progress) ** 3), 0.0, 0.0, fade
    anim = ov["anim"]
    if anim == "spin":
        rot = life * 2 * math.pi / 5.0
    elif anim == "pulse":
        scale *= 1 + 0.09 * math.sin(2 * math.pi * 1.1 * life)
    elif anim == "sway":
        rot = math.radians(11) * math.sin(2 * math.pi * 0.55 * life)
    elif anim == "bounce":
        dy = -abs(math.sin(math.pi * 1.3 * life)) * 0.13 * size
    elif anim == "float":
        dy = -0.05 * size * math.sin(2 * math.pi * 0.4 * life)
    elif anim == "blink":
        alpha *= 0.55 + 0.45 * (0.5 + 0.5 * math.cos(2 * math.pi * 1.2 * life))

    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, box, box)
    ctx = cairo.Context(surface)
    ctx.translate(box / 2, box / 2 + dy)
    ctx.rotate(rot)
    ctx.scale(size / 24 * scale, size / 24 * scale)
    ctx.translate(-12, -12)
    ctx.set_line_cap(cairo.LINE_CAP_ROUND)
    ctx.set_line_join(cairo.LINE_JOIN_ROUND)
    paths = icon_ops(ov["icon"])
    total = sum(length for length, _ in paths)
    done = progress * total
    r, g, b = ov["color"]
    for length, ops in paths:
        part = min(1.0, done / length) if done > 0 else 0.0
        done -= length
        if part <= 0:
            break
        for line_width, a in ((4.6, 0.16), (1.6, 1.0)) if ov["glow"] else ((1.6, 1.0),):
            ctx.new_path()
            trace_icon(ctx, ops)
            ctx.set_dash([length * part, length * 2] if part < 1 else [])
            ctx.set_source_rgba(r, g, b, a * alpha)
            ctx.set_line_width(line_width * ov["weight"])
            ctx.stroke()
    surface.flush()
    # Cairo range l'image en BGRA prémultiplié (petit-boutiste).
    px = np.frombuffer(surface.get_data(), dtype=np.uint8).reshape(box, surface.get_stride() // 4, 4)[:, :box].astype(np.float32)
    crop = px[fy0 - y0 : fy1 - y0, fx0 - x0 : fx1 - x0]
    a = crop[:, :, 3:4] / 255.0
    out[fy0:fy1, fx0:fx1] = out[fy0:fy1, fx0:fx1] * (1.0 - a) + crop[:, :, 2::-1]
    surface.finish()


def formula_overlay(el: dict, color_hex: str, width: int, height: int):
    """Une formule (ou une étiquette typographiée) en calque : gris de couverture + position en pixels. None si impossible."""
    import numpy as np

    if el["kind"] == "text":
        mask = text_mask(el["text"], el["size"] * width / LOGICAL_W * 1.15)
    else:
        mask = formula_mask(el["tex"], el["size"] * width / LOGICAL_W * 1.25)
    if mask is None:
        return None
    mh, mw = mask.shape
    return {
        "mask": mask.astype(np.float32) / 255.0,
        "x": int(round(el["center"][0] * width / LOGICAL_W - mw / 2)),
        "y": int(round(el["center"][1] * height / LOGICAL_H - mh / 2)),
        "rgb": np.array([c * 255 for c in hex_rgb(color_hex)], dtype=np.float32),
        "at": el["at"],
        "dur": el["dur"],
        "until": el["until"],
    }


def composite(frame, overlays: list[dict], t: float, width: int, height: int):
    """Pose les calques : les formules s'écrivent de gauche à droite (volet au bord adouci), les icônes s'animent."""
    import numpy as np

    live = [ov for ov in overlays if t >= ov["at"] and (ov["until"] is None or t < ov["until"] + FADE)]
    if not live:
        return frame
    out = frame.astype(np.float32)
    for ov in live:
        fade = 1.0 if ov["until"] is None or t <= ov["until"] else max(0.0, 1.0 - (t - ov["until"]) / FADE)
        if "icon" in ov:
            draw_icon(out, ov, t, fade, width, height)
            continue
        mask = ov["mask"]
        mh, mw = mask.shape
        progress = min(1.0, (t - ov["at"]) / ov["dur"])
        edge = np.clip((progress * (mw + 40) - np.arange(mw, dtype=np.float32)) / 40.0, 0.0, 1.0)
        x0, y0 = max(ov["x"], 0), max(ov["y"], 0)
        x1, y1 = min(ov["x"] + mw, width), min(ov["y"] + mh, height)
        if x1 <= x0 or y1 <= y0:
            continue
        a = (mask * edge[None, :] * fade)[y0 - ov["y"] : y1 - ov["y"], x0 - ov["x"] : x1 - ov["x"], None]
        out[y0:y1, x0:x1] = out[y0:y1, x0:x1] * (1.0 - a) + ov["rgb"] * a
    return np.ascontiguousarray(np.rint(out).astype(np.uint8))


# ────────────────────────────────────────────────────────────── tableau blanc (Handanim)


def whiteboard_frames(sb: dict, width: int, height: int, fps: int, dropped: list[str]):
    import random

    import cairo
    import numpy as np
    from fontTools.ttLib import TTFont
    from handanim import Arrow, Curve, Ellipse, FadeOutAnimation, FillStyle, Line, LinearPath, Math, Polygon, Rectangle, Scene, SketchAnimation, SketchStyle, StrokeStyle, Text
    from matplotlib.mathtext import MathTextParser
    from handanim.core.viewport import Viewport
    from handanim.stylings.fonts import get_font_path
    from handanim.utils.geometry import cairo_surface_to_numpy

    # Le tremblé de la main est tiré au sort : la même entrée doit donner la même vidéo.
    np.random.seed(20261122)
    random.seed(20261122)

    pal = PALETTES["whiteboard"]
    scene = Scene(
        width=width,
        height=height,
        fps=fps,
        background_color=hex_rgb(pal["bg"]),
        viewport=Viewport(world_xrange=(0, LOGICAL_W), world_yrange=(0, LOGICAL_H), screen_width=width, screen_height=height, margin=0),
    )
    known_glyphs = set(TTFont(get_font_path("feasibly")).getBestCmap().keys())

    overlays: list[dict] = []

    def handwritten_math(tex: str, pos, size: int, style: dict):
        """La formule en écriture manuscrite — seulement si la police sait tracer CHAQUE signe.

        Handanim saute en silence un signe qu'il ne connaît pas : « a − b »
        deviendrait « a b ». Une formule fausse à l'écran est pire qu'une
        formule moins jolie : sans police complète, on rend None et la formule
        part en calque typographié (mathtext), exacte.
        """
        glyphs = MathTextParser("path").parse(f"${tex}$").glyphs
        # Une seule police manuscrite : les deux autres de Handanim posent le point de
        # multiplication sur la ligne (un point décimal) ou le rendent invisible.
        candidate = Math(f"${tex}$", pos, font_size=size, font_name="feasibly", **style)
        if all(len(candidate.get_glyph_opsset(g[2], 10)[0].opsset) > 0 for g in glyphs if not chr(g[2]).isspace()):
            return candidate
        return None

    def centered(make, center):
        """Texte et formule s'ancrent en haut à gauche : on mesure, puis on recentre."""
        probe = make((0.0, 0.0))
        box = probe.get_bbox()
        cx, cy = box.center
        return make((center[0] - cx, center[1] - cy))

    for el in sb["elements"]:
        kind = el["kind"]
        stroke = StrokeStyle(color=hex_rgb(pal[el["color"]]), width=3.4 * el["weight"])
        sketch = SketchStyle(roughness=1.1, bowing=1)
        fill = FillStyle(color=hex_rgb(pal["fill"]), opacity=0.55, hachure_gap=11, hachure_line_width=2) if el["fill"] else None
        common = {"stroke_style": stroke, "sketch_style": sketch, "fill_style": fill}
        try:
            if kind == "line":
                drawable = Line(el["points"][0], el["points"][1], **common)
            elif kind == "arrow":
                drawable = Arrow(el["points"][0], el["points"][1], arrow_head_size=26.0 * el["weight"], arrow_head_angle=28.0, **common)
            elif kind == "polyline":
                drawable = Polygon(list(el["points"]), **common) if el["closed"] and len(el["points"]) >= 3 else LinearPath(list(el["points"]), close=el["closed"], **common)
            elif kind == "curve":
                drawable = Curve(list(el["points"]) + ([el["points"][0]] if el["closed"] else []), **common)
            elif kind in ("circle", "ellipse"):
                drawable = Ellipse(el["center"], 2 * el["rx"], 2 * el["ry"], **common)
            elif kind == "rect":
                drawable = Rectangle(el["corner"], el["w"], el["h"], **common)
            elif kind == "icon":
                overlays.append(icon_overlay(el, pal[el["color"]], width, height, glow=False))
                continue
            elif kind == "text":
                missing = sorted({c for c in el["text"] if c != " " and ord(c) not in known_glyphs})
                if missing:
                    # La police manuscrite ne connaît pas ces signes (grec, cyrillique, flèches) :
                    # l'étiquette est typographiée ; si même cela échoue, mieux vaut pas d'étiquette qu'un mot troué.
                    overlay = formula_overlay(el, pal[el["color"]], width, height)
                    if overlay is None:
                        dropped.append(f"{el['id']}:glyphs")
                    else:
                        overlays.append(overlay)
                    continue
                text_style = {"stroke_style": StrokeStyle(color=stroke.color, width=2.6 * el["weight"]), "sketch_style": SketchStyle(roughness=0.4)}
                drawable = centered(lambda pos: Text(el["text"], pos, font_size=int(el["size"] * 1.5), font_name="feasibly", **text_style), el["center"])
            else:  # formula
                text_style = {"stroke_style": StrokeStyle(color=stroke.color, width=2.4 * el["weight"]), "sketch_style": SketchStyle(roughness=0.4)}
                if handwritten_math(el["tex"], (0.0, 0.0), int(el["size"]), text_style) is None:
                    overlay = formula_overlay(el, pal[el["color"]], width, height)
                    if overlay is None:
                        dropped.append(f"{el['id']}:formula:parse")
                    else:
                        overlays.append(overlay)
                    continue
                drawable = centered(lambda pos: handwritten_math(el["tex"], pos, int(el["size"]), text_style), el["center"])
            scene.add(SketchAnimation(start_time=el["at"], duration=el["dur"]), drawable)
            if el["until"] is not None:
                scene.add(FadeOutAnimation(start_time=el["until"], duration=FADE), drawable)
        except Exception as exc:  # une formule ou une forme que la bibliothèque refuse : on la saute, on le dit
            dropped.append(f"{el['id']}:{kind}:{type(exc).__name__}")

    total = max(1, round(sb["duration"] * fps))
    if not scene.events and not overlays:
        raise StoryboardError("aucun élément dessinable")
    timeline = scene.create_event_timeline(max_length=sb["duration"]) if scene.events else []
    blank = None
    for i in range(total):
        if not timeline:
            if blank is None:
                blank = np.empty((height, width, 3), dtype=np.uint8)
                blank[:] = [round(c * 255) for c in scene.background_color]
            yield composite(blank, overlays, i / fps, width, height)
            continue
        ops = timeline[min(i, len(timeline) - 1)]
        surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, width, height)
        ctx = cairo.Context(surface)
        ctx.set_source_rgb(*scene.background_color)
        ctx.paint()
        scene.viewport.apply_to_context(ctx)
        ops.render(ctx)
        frame = np.ascontiguousarray(cairo_surface_to_numpy(surface)[:, :, :3], dtype=np.uint8)
        surface.finish()
        yield composite(frame, overlays, i / fps, width, height)


# ────────────────────────────────────────────────────────────── cinématique (Buttery)


def cinematic_frames(sb: dict, width: int, height: int, fps: int, dropped: list[str]):
    import numpy as np
    from buttery import Circle, Line, Rect, Scene, Text, keyframes, tween
    from buttery.render import Rasterizer

    pal = PALETTES["cinematic"]
    unit = 100.0  # 100 points logiques = 1 unité du monde ; origine au centre, y vers le haut

    def wx(x: float) -> float:
        return (x - LOGICAL_W / 2) / unit

    def wy(y: float) -> float:
        return (LOGICAL_H / 2 - y) / unit

    def visible(at: float, until, peak: float = 1.0):
        """Invisible avant `at`, puis présent ; s'efface à `until` s'il y en a un."""
        keys = [(at - 0.002, 0.0), (at, peak)]
        if until is not None:
            keys += [(max(until, at + 0.004), peak), (max(until, at + 0.004) + FADE, 0.0)]
        return keyframes(keys)

    objects: list = []
    overlays: list[dict] = []
    font_probe = Rasterizer(Scene(size=(16, 16), fps=fps, duration=1.0, background=pal["bg"]).compile(), 16, 16)._font(None, 20.0)[0]

    def trace(eid: str, pts, color: str, sw: float, at: float, dur: float, until, glow: bool = True) -> None:
        """Le trait avance segment par segment, à vitesse constante, avec une pointe lumineuse."""
        total = path_length(pts) or 1.0
        t = at
        tip_x, tip_y = [(at, wx(pts[0][0]))], [(at, wy(pts[0][1]))]
        for k, (a, b) in enumerate(zip(pts[:-1], pts[1:])):
            d = max(dur * math.dist(a, b) / total, 1e-3)
            for layer, (width_k, alpha) in enumerate(((3.6, 0.16), (1.0, 1.0)) if glow else ((1.0, 1.0),)):
                objects.append(
                    Line(
                        f"{eid}_{k}_{layer}",
                        x1=wx(a[0]),
                        y1=wy(a[1]),
                        x2=tween(wx(a[0]), wx(b[0]), at=t, dur=d),
                        y2=tween(wy(a[1]), wy(b[1]), at=t, dur=d),
                        stroke=color,
                        stroke_width=sw * width_k,
                        opacity=visible(t, until, alpha),
                    )
                )
            t += d
            tip_x.append((t, wx(b[0])))
            tip_y.append((t, wy(b[1])))
        objects.append(Circle(f"{eid}_tip", x=keyframes(tip_x), y=keyframes(tip_y), r=sw * 1.5, fill="#FFFFFF", opacity=keyframes([(at - 0.002, 0.0), (at, 0.95), (t, 0.95), (t + 0.18, 0.0)])))

    by_group: dict[int, list] = {}
    windows: dict[int, list[float]] = {}
    for el in sb["elements"]:
        kind, eid, at, dur, until = el["kind"], el["id"], el["at"], el["dur"], el["until"]
        objects = by_group.setdefault(el["group"], [])
        win = windows.setdefault(el["group"], [at, 0.0])
        win[0] = min(win[0], at)
        win[1] = max(win[1], sb["duration"] if until is None else until + FADE + 0.1)
        color = pal[el["color"]]
        if kind == "icon":
            overlays.append(icon_overlay(el, color, width, height, glow=True))
            continue
        sw = 0.045 * el["weight"]
        if kind == "text":
            if SHAPED_SCRIPTS.search(el["text"]) or any(c != " " and font_probe.unicharToGlyph(ord(c)) == 0 for c in el["text"]):
                # La police du système n'a pas ces signes : pas d'étiquette plutôt que des carrés vides.
                dropped.append(f"{eid}:glyphs")
                continue
            cx, cy = wx(el["center"][0]), wy(el["center"][1])
            rise = min(dur, 0.6)
            objects.append(
                Text(
                    eid,
                    content=el["text"],
                    x=cx,
                    y=tween(cy - 0.3, cy, at=at, dur=rise, ease="out_cubic"),
                    size=tween(el["size"] / unit * 1.03, el["size"] / unit * 1.2, at=at, dur=rise, ease="out_cubic"),
                    fill=color,
                    opacity=visible(at, until) if rise <= 0.004 else keyframes([(at, 0.0), (at + rise, 1.0)] + ([(max(until, at + rise + 0.004), 1.0), (max(until, at + rise + 0.004) + FADE, 0.0)] if until is not None else [])),
                )
            )
            continue
        if kind == "formula":
            overlay = formula_overlay(el, color, width, height)
            if overlay is None:
                dropped.append(f"{eid}:formula:parse")
            else:
                overlays.append(overlay)
            continue
        paths = stroke_paths(el)
        if el["fill"] and kind in ("rect", "circle", "ellipse"):
            glow_in = keyframes([(at + dur * 0.7, 0.0), (at + dur + 0.3, 0.16)] + ([(max(until, at + dur + 0.31), 0.16), (max(until, at + dur + 0.31) + FADE, 0.0)] if until is not None else []))
            if kind == "rect":
                objects.append(Rect(f"{eid}_fill", x=wx(el["corner"][0] + el["w"] / 2), y=wy(el["corner"][1] + el["h"] / 2), w=el["w"] / unit, h=el["h"] / unit, fill=pal["fill"], opacity=glow_in))
            elif el["rx"] == el["ry"]:
                objects.append(Circle(f"{eid}_fill", x=wx(el["center"][0]), y=wy(el["center"][1]), r=el["rx"] / unit, fill=pal["fill"], opacity=glow_in))
        # La tige d'une flèche prend l'essentiel du temps ; les barbes claquent à la fin.
        shares = [1.0] if len(paths) == 1 else [0.76] + [0.24 / (len(paths) - 1)] * (len(paths) - 1)
        t = at
        for n, (pts, share) in enumerate(zip(paths, shares)):
            trace(f"{eid}_p{n}", pts, color, sw, t, max(dur * share, 0.02), until)
            t += dur * share

    by_group = {g: objs for g, objs in by_group.items() if objs}
    if not by_group and not overlays:
        raise StoryboardError("aucun élément dessinable")

    # Deux groupes dont les fenêtres se recouvrent sont rendus ensemble : rien ne disparaît.
    merged: list[tuple[float, float, list]] = []
    for g in sorted(by_group, key=lambda k: windows[k][0]):
        lo, hi = windows[g]
        if merged and lo <= merged[-1][1]:
            plo, phi, pobjs = merged[-1]
            merged[-1] = (plo, max(phi, hi), pobjs + by_group[g])
        else:
            merged.append((lo, hi, by_group[g]))
    rasters = [(lo - 0.1, hi, Rasterizer(Scene(size=(width, height), fps=fps, duration=sb["duration"], background=pal["bg"], view_width=LOGICAL_W / unit).add(*objs).compile(), width, height)) for lo, hi, objs in merged]
    blank = np.empty((height, width, 3), dtype=np.uint8)
    blank[:] = [round(c * 255) for c in hex_rgb(pal["bg"])]

    def draw(t: float, blur: bool):
        for lo, hi, raster in rasters:
            if lo <= t <= hi:
                return np.ascontiguousarray(raster.frame(t, motion_blur=blur, samples=4, shutter=0.6)[:, :, :3])
        return blank

    # Le flou de mouvement coûte plusieurs rendus par image. Quand rien ne se
    # trace ni ne s'efface, l'image est la même que la précédente : on la garde.
    busy_spans = []
    for el in sb["elements"]:
        busy_spans.append((el["at"] - 0.06, el["at"] + el["dur"] + 0.45))
        if el["until"] is not None:
            busy_spans.append((el["until"] - 0.06, el["until"] + FADE + 0.1))

    total = max(1, round(sb["duration"] * fps))
    still = None
    for i in range(total):
        t = i / fps
        if any(lo <= t <= hi for lo, hi in busy_spans):
            still = None
            base = draw(t, True)
        else:
            if still is None:
                still = draw(t, False)
            base = still
        yield composite(base, overlays, t, width, height)


# ────────────────────────────────────────────────────────────── assemblage (FFmpeg)


def assemble(frames, total: int, out_path: str, width: int, height: int, fps: int, audio: str | None, audio_codec: str = "aac") -> int:
    """Les images partent dans FFmpeg au fil du dessin ; la voix est multiplexée dans la même passe."""
    import imageio_ffmpeg

    writer = imageio_ffmpeg.write_frames(
        out_path,
        (width, height),
        pix_fmt_in="rgb24",
        pix_fmt_out="yuv420p",
        fps=fps,
        codec="libx264",
        quality=None,
        macro_block_size=2,
        ffmpeg_log_level="error",
        output_params=["-crf", "20", "-preset", "veryfast", "-movflags", "+faststart"],
        audio_path=audio,
        audio_codec=audio_codec if audio else None,
    )
    writer.send(None)
    count = 0
    last = -1
    try:
        for frame in frames:
            writer.send(frame.tobytes())
            count += 1
            step = int(20 * count / total)
            if step != last:
                last = step
                emit({"progress": round(count / total, 3)})
    finally:
        writer.close()
    return count


MUSIC_RATE = 44_100
MUSIC_GAIN = 10 ** (-10 / 20)  # la musique seule : −10 dB
DUCK_GAIN = 10 ** (-20 / 20)  # sous la voix : −20 dB
DUCK_ATTACK, DUCK_RELEASE = 0.3, 0.7  # elle baisse vite, elle remonte doucement


def duck_envelope(speech: list[tuple[float, float]], duration: float, rate: int = MUSIC_RATE):
    """Le gain de la musique, échantillon par échantillon : −20 dB pendant la voix, −10 dB sinon."""
    import numpy as np

    n = max(1, int(round(duration * rate)))
    duck = np.zeros(n, dtype=np.float32)
    for a, b in speech:
        lo, hi = max(0, int((a - DUCK_ATTACK) * rate)), min(n, int((b + DUCK_RELEASE) * rate))
        if hi <= lo:
            continue
        t = np.arange(lo, hi, dtype=np.float32) / rate
        shape = np.minimum(np.clip((t - (a - DUCK_ATTACK)) / DUCK_ATTACK, 0.0, 1.0), np.clip((b + DUCK_RELEASE - t) / DUCK_RELEASE, 0.0, 1.0))
        duck[lo:hi] = np.maximum(duck[lo:hi], shape)
    gain = MUSIC_GAIN + (DUCK_GAIN - MUSIC_GAIN) * duck
    # La musique entre et sort en fondu.
    t = np.arange(n, dtype=np.float32) / rate
    return gain * np.clip(t / 0.6, 0.0, 1.0) * np.clip((duration - t) / 1.5, 0.0, 1.0)


def mix_music(voice: str, music: str, speech: list[tuple[float, float]], duration: float, work_dir: str) -> str:
    """La voix + la musique de fond, baissée sous la voix. Rend le chemin du mixage (AAC)."""
    import wave

    import imageio_ffmpeg
    import numpy as np

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    decoded = subprocess.run([ffmpeg, "-loglevel", "error", "-i", music, "-f", "s16le", "-ac", "2", "-ar", str(MUSIC_RATE), "-"], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120, check=False)
    loop = np.frombuffer(decoded.stdout, dtype=np.int16).reshape(-1, 2)
    if decoded.returncode != 0 or len(loop) < MUSIC_RATE:
        raise RuntimeError("ffmpeg (musique) : " + decoded.stderr.decode("utf-8", "replace")[-200:])
    gain = duck_envelope(speech, duration)
    bed = np.resize(loop, (len(gain), 2)).astype(np.float32) * gain[:, None]
    bed_path = os.path.join(work_dir, "bed.wav")
    with wave.open(bed_path, "wb") as fh:
        fh.setnchannels(2)
        fh.setsampwidth(2)
        fh.setframerate(MUSIC_RATE)
        fh.writeframes(np.clip(np.rint(bed), -32768, 32767).astype(np.int16).tobytes())
    out = os.path.join(work_dir, "mix.m4a")
    cmd = [ffmpeg, "-y", "-loglevel", "error", "-i", voice, "-i", bed_path, "-filter_complex", f"[0:a]aresample={MUSIC_RATE},aformat=channel_layouts=stereo[v];[v][1:a]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[a]", "-map", "[a]", "-c:a", "aac", "-b:a", "160k", out]
    done = subprocess.run(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=180, check=False)
    if done.returncode != 0 or not os.path.exists(out):
        raise RuntimeError("ffmpeg (mixage) : " + done.stderr.decode("utf-8", "replace")[-200:])
    return out


def add_subtitles(video: str, srt: str, language: str) -> None:
    """Sous-titres en piste séparée (désactivables dans le lecteur), sans réencoder l'image."""
    import imageio_ffmpeg

    tmp = video + ".subs.mp4"
    cmd = [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-i", video, "-i", srt, "-map", "0", "-map", "1:0", "-c", "copy", "-c:s", "mov_text", "-metadata:s:s:0", f"language={language}", "-movflags", "+faststart", tmp]
    done = subprocess.run(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=120, check=False)
    if done.returncode != 0 or not os.path.exists(tmp):
        raise RuntimeError("ffmpeg (sous-titres) : " + done.stderr.decode("utf-8", "replace")[-300:])
    os.replace(tmp, video)


# ISO 639-1 → 639-2, pour l'étiquette de la piste de sous-titres.
SUBTITLE_LANG = {"de": "deu", "en": "eng", "fr": "fra", "es": "spa", "it": "ita", "pt": "por", "ru": "rus", "ar": "ara", "hi": "hin", "bn": "ben", "ja": "jpn", "zh": "zho"}


def self_test() -> int:
    """Contrôle de l'image Docker : les deux styles, une icône, une formule, la musique — de bout en bout."""
    import tempfile
    import wave

    music = os.path.join(os.path.dirname(os.path.abspath(__file__)), "music", "focus.mp3")
    elements = [
        {"kind": "line", "from": [300, 600], "to": [1300, 600], "at": 0.0, "dur": 0.4},
        {"kind": "circle", "center": [500, 400], "r": 90, "fill": True, "at": 0.1, "dur": 0.4},
        {"kind": "icon", "name": "cog", "center": [1050, 380], "size": 220, "at": 0.2, "dur": 0.4},
        {"kind": "text", "text": "Hebel", "center": [800, 150], "at": 0.3, "dur": 0.3},
        {"kind": "formula", "tex": "F_1 \\cdot a = F_2 \\cdot b", "center": [800, 760], "at": 0.4, "dur": 0.4, "until": 1.0},
    ]
    with tempfile.TemporaryDirectory() as tmp:
        voice = os.path.join(tmp, "voice.wav")
        with wave.open(voice, "wb") as fh:
            fh.setnchannels(1)
            fh.setsampwidth(2)
            fh.setframerate(24_000)
            fh.writeframes(b"\x00\x00" * 24_000)
        report = {}
        for style in STYLES:
            sb = validate({"style": style, "duration": 1.5, "elements": elements, "speech": [[0.2, 0.8]]})
            dropped: list[str] = []
            out = os.path.join(tmp, f"{style}.mp4")
            make = whiteboard_frames if style == "whiteboard" else cinematic_frames
            frames = assemble(make(sb, 640, 360, 24, dropped), 36, out, 640, 360, 24, mix_music(voice, music, sb["speech"], sb["duration"], tmp), "copy")
            if frames != 36 or dropped or os.path.getsize(out) < 2000:
                emit({"ok": False, "error": "self_test", "detail": f"{style}: {frames} images, sautés {dropped}"})
                return 1
            report[style] = os.path.getsize(out)
    emit({"ok": True, "self_test": report, "icons": len(icon_library())})
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="TRED — storyboard JSON → vidéo dessinée (MP4)")
    parser.add_argument("--self-test", action="store_true", help="rend une courte vidéo dans chaque style et vérifie le résultat")
    parser.add_argument("--storyboard")
    parser.add_argument("--out")
    parser.add_argument("--audio")
    parser.add_argument("--subtitles")
    parser.add_argument("--music", help="musique de fond (mise en boucle, baissée sous la voix)")
    parser.add_argument("--language", default="de")
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--height", type=int, default=720)
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--check", action="store_true", help="valide le storyboard sans rien dessiner")
    args = parser.parse_args()

    started = time.time()
    try:
        if args.self_test:
            return self_test()
        if not args.storyboard or not args.out:
            raise StoryboardError("--storyboard et --out sont obligatoires")
        if not (320 <= args.width <= 1920 and 180 <= args.height <= 1080 and args.width % 2 == 0 and args.height % 2 == 0 and 12 <= args.fps <= 60):
            raise StoryboardError("taille ou cadence hors limites")
        with open(args.storyboard, encoding="utf-8") as fh:
            sb = validate(json.load(fh))
        if args.check:
            emit({"ok": True, "checked": len(sb["elements"])})
            return 0
        dropped: list[str] = []
        total = max(1, round(sb["duration"] * args.fps))
        make = whiteboard_frames if sb["style"] == "whiteboard" else cinematic_frames
        audio, codec = args.audio, "aac"
        if args.audio and args.music:
            # Le mixage se fait avant le dessin : une musique illisible échoue tout de suite, pas après dix minutes de rendu.
            audio, codec = mix_music(args.audio, args.music, sb["speech"], sb["duration"], os.path.dirname(os.path.abspath(args.out))), "copy"
        frames = assemble(make(sb, args.width, args.height, args.fps, dropped), total, args.out, args.width, args.height, args.fps, audio, codec)
        if args.subtitles:
            add_subtitles(args.out, args.subtitles, SUBTITLE_LANG.get(args.language, "und"))
        emit({"ok": True, "style": sb["style"], "music": bool(args.audio and args.music), "frames": frames, "duration": round(frames / args.fps, 3), "elements": len(sb["elements"]), "dropped": dropped, "seconds": round(time.time() - started, 2)})
        return 0
    except StoryboardError as exc:
        emit({"ok": False, "error": "invalid_storyboard", "detail": str(exc)[:300]})
        return 2
    except Exception as exc:  # noqa: BLE001 — la dernière ligne doit toujours être un résultat lisible
        emit({"ok": False, "error": "render_failed", "detail": f"{type(exc).__name__}: {exc}"[:300]})
        return 1


if __name__ == "__main__":
    sys.exit(main())
