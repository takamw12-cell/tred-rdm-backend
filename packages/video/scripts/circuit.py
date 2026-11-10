"""Schéma du circuit de la vidéo allemande (symboles DIN/EN), avec schemdraw.

    uvx --with schemdraw python -I scripts/circuit.py
Écrit src/assets/circuit-de.svg : U_q = 12 V, R1 = 2 Ω en série avec R2 ∥ R3 (4 Ω).
"""
from pathlib import Path

import schemdraw
import schemdraw.elements as elm

INK = "#1B2A4A"
out = Path(__file__).resolve().parent.parent / "src" / "assets" / "circuit-de.svg"

schemdraw.config(fontsize=15, color=INK, lw=2.2, font="sans-serif", margin=0.35)
with schemdraw.Drawing(show=False) as d:
    d.config(unit=3)
    src = d.add(elm.SourceV().up().label("$U_q$ = 12 V", loc="top", ofst=0.25))
    d.add(elm.Line().right(0.6))
    r1 = d.add(elm.ResistorIEC().right().label("$R_1$ = 2 Ω"))
    d.add(elm.CurrentLabelInline(direction="in").at(r1).label("$I_1$", loc="bottom"))
    top = d.add(elm.Dot())
    d.add(elm.Line().right(1.4))
    d.add(elm.ResistorIEC().down().label("$R_3$ = 4 Ω", loc="bottom"))
    d.add(elm.Line().left(1.4))
    bottom = d.add(elm.Dot())
    d.push()
    d.add(elm.ResistorIEC().up().at(bottom.center).label("$R_2$ = 4 Ω"))
    d.pop()
    d.add(elm.Line().to(src.start))
    d.save(str(out))
print(out.name, out.stat().st_size, "octets")
