import type { SchematicDrawing, SchematicSymbol } from "@/lib/schematic-layout";

/**
 * Le schéma redessiné comme sur la photo (lib/schematic-layout.ts place,
 * ce fichier trace). Symboles de la norme allemande des feuilles d'exercices :
 * résistance en rectangle, source de tension en cercle avec sa flèche du plus
 * vers le moins, source de courant en deux arcs avec la flèche du courant.
 * Encre de la Tafel : currentColor partout.
 */

const INK = { stroke: "currentColor", strokeWidth: 2, fill: "none" } as const;

function Arrow({ from, to }: { from: { x: number; y: number }; to: { x: number; y: number } }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const head = 7;
  const bx = to.x - ux * head;
  const by = to.y - uy * head;
  return (
    <g>
      <line x1={from.x} y1={from.y} x2={bx} y2={by} stroke="currentColor" strokeWidth={1.6} />
      <path d={`M${to.x},${to.y} L${bx - uy * 3.5},${by + ux * 3.5} L${bx + uy * 3.5},${by - ux * 3.5} Z`} fill="currentColor" />
    </g>
  );
}

function Body({ s }: { s: SchematicSymbol }) {
  const mx = (s.bodyA.x + s.bodyB.x) / 2;
  const my = (s.bodyA.y + s.bodyB.y) / 2;
  const len = Math.hypot(s.bodyB.x - s.bodyA.x, s.bodyB.y - s.bodyA.y);
  // Axe du composant (a → b) et sa normale.
  const ux = (s.b.x - s.a.x) / (Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) || 1);
  const uy = (s.b.y - s.a.y) / (Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) || 1);
  const nx = -uy;
  const ny = ux;
  const w = 16;

  if (s.typ === "R" || s.typ === "Z" || s.typ === "L") {
    const x = s.horizontal ? mx - len / 2 : mx - w / 2;
    const y = s.horizontal ? my - w / 2 : my - len / 2;
    return <rect x={x} y={y} width={s.horizontal ? len : w} height={s.horizontal ? w : len} {...INK} fill={s.typ === "L" ? "currentColor" : "none"} />;
  }
  if (s.typ === "C") {
    const gap = 5;
    const plate = (k: number) => (
      <line
        x1={mx + ux * k * gap + nx * 13}
        y1={my + uy * k * gap + ny * 13}
        x2={mx + ux * k * gap - nx * 13}
        y2={my + uy * k * gap - ny * 13}
        stroke="currentColor"
        strokeWidth={2.4}
      />
    );
    return (
      <g>
        <line x1={s.bodyA.x} y1={s.bodyA.y} x2={mx - ux * gap} y2={my - uy * gap} {...INK} />
        <line x1={mx + ux * gap} y1={my + uy * gap} x2={s.bodyB.x} y2={s.bodyB.y} {...INK} />
        {plate(-1)}
        {plate(1)}
      </g>
    );
  }
  const r = Math.min(15, len / 2);
  if (s.typ === "I") {
    // Stromquelle wie auf dem Aufgabenblatt : deux arcs face à face, et la
    // flèche du courant entre eux, pointée vers la borne a (le courant y entre).
    const span = (50 * Math.PI) / 180;
    const arc = (k: 1 | -1) => {
      // Arc centré sur l'axe, du côté k (−1 : vers a, +1 : vers b). (u, n) est
      // une base directe : t croissant tourne toujours dans le sens « sweep 1 ».
      const p = (t: number) => ({ x: mx + k * (ux * Math.cos(t) + nx * Math.sin(t)) * r, y: my + k * (uy * Math.cos(t) + ny * Math.sin(t)) * r });
      const [p1, p2] = [p(-span), p(span)];
      return <path d={`M${p1.x},${p1.y} A${r},${r} 0 0 1 ${p2.x},${p2.y}`} {...INK} />;
    };
    return (
      <g>
        <line x1={s.bodyA.x} y1={s.bodyA.y} x2={mx - ux * r} y2={my - uy * r} {...INK} />
        <line x1={mx + ux * r} y1={my + uy * r} x2={s.bodyB.x} y2={s.bodyB.y} {...INK} />
        {arc(-1)}
        {arc(1)}
        <Arrow from={{ x: mx + ux * (r - 4), y: my + uy * (r - 4) }} to={{ x: mx - ux * (r - 3), y: my - uy * (r - 3) }} />
      </g>
    );
  }
  // Spannungsquelle : cercle avec un trait dans l'axe, flèche de tension à côté.
  return (
    <g>
      <line x1={s.bodyA.x} y1={s.bodyA.y} x2={mx - ux * r} y2={my - uy * r} {...INK} />
      <line x1={mx + ux * r} y1={my + uy * r} x2={s.bodyB.x} y2={s.bodyB.y} {...INK} />
      <circle cx={mx} cy={my} r={r} {...INK} />
      <line x1={mx - ux * r} y1={my - uy * r} x2={mx + ux * r} y2={my + uy * r} stroke="currentColor" strokeWidth={2} />
      {s.arrow && <Arrow from={s.arrow.from} to={s.arrow.to} />}
    </g>
  );
}

export function SchematicSvg({ drawing, label, valueOf }: { drawing: SchematicDrawing; label: string; valueOf: (name: string) => string }) {
  return (
    <svg aria-label={label} data-slot="schematic-drawing" viewBox={`0 0 ${drawing.width} ${drawing.height}`} className="mx-auto my-3 block h-auto w-full" style={{ maxWidth: Math.max(360, drawing.width) }}>
      <title>{label}</title>
      {drawing.wires.map((w) => (
        <path key={w.node} d={w.path} {...INK} strokeLinejoin="round" />
      ))}
      {drawing.symbols.map((s) => (
        <g key={s.name}>
          <line x1={s.a.x} y1={s.a.y} x2={s.bodyA.x} y2={s.bodyA.y} {...INK} />
          <line x1={s.bodyB.x} y1={s.bodyB.y} x2={s.b.x} y2={s.b.y} {...INK} />
          <Body s={s} />
          <text x={s.label.x} y={s.label.y} textAnchor={s.label.anchor} fontSize={14} fontWeight={600} fill="currentColor">
            {s.name}
          </text>
          <text x={s.label.x} y={s.label.y + (s.horizontal ? (s.typ === "V" || s.typ === "I" || s.typ === "C" ? 56 : 46) : 15)} textAnchor={s.label.anchor} fontSize={12} fill="currentColor" opacity={0.85}>
            {valueOf(s.name)}
          </text>
        </g>
      ))}
      {drawing.dots.map((d) => (
        <circle key={`${d.x},${d.y}`} cx={d.x} cy={d.y} r={3.6} fill="currentColor" />
      ))}
      {drawing.ground && (
        <path
          d={`M${drawing.ground.x},${drawing.ground.y} v10 M${drawing.ground.x - 11},${drawing.ground.y + 10} h22 M${drawing.ground.x - 7},${drawing.ground.y + 15} h14 M${drawing.ground.x - 3},${drawing.ground.y + 20} h6`}
          stroke="currentColor"
          strokeWidth={2}
          fill="none"
        />
      )}
    </svg>
  );
}
