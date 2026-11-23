import { useEffect, useId, useMemo, useRef, useState } from "react";
import katex from "katex";
import { RotateCcw } from "lucide-react";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { DIVIDER_LIMITS, flowSpeed, ohmsToSlider, sig3, sliderToOhms, solveDivider, withPrefix } from "@/lib/voltage-divider";

/**
 * Atelier — le diviseur de tension interactif.
 *
 * Trois curseurs (U, R1, R2). À chaque mouvement, tout se recalcule
 * (lib/voltage-divider.ts) et se voit : les charges circulent plus ou moins
 * vite dans la maille, les flèches de tension s'allongent, la barre de partage
 * se déplace, et les formules se réécrivent avec les valeurs du moment.
 *
 * SVG et non 3D : un schéma électrique se lit à plat, comme dans le cours, et
 * il reste net sur un téléphone. Aucune IA ici : ce sont les lois d'Ohm et des
 * mailles, calculées dans le navigateur.
 */

const TEXT = {
  de: {
    title: "Spannungsteiler",
    lead: "Bewege die Regler: Strom und Formeln ändern sich sofort.",
    source: "Quellenspannung",
    reset: "Zurücksetzen",
    current: "Strom",
    split: "So teilt sich die Spannung",
    power: "Leistung",
    up: "R₁ größer → U₂ kleiner. R₂ größer → U₂ größer.",
    equal: "R₁ = R₂: Die Spannung teilt sich genau zur Hälfte.",
    most2: "R₂ ist viel größer als R₁: Fast die ganze Spannung liegt an R₂.",
    most1: "R₁ ist viel größer als R₂: Fast die ganze Spannung liegt an R₁.",
    schematic: "Schaltplan des Spannungsteilers mit fließendem Strom",
  },
  en: {
    title: "Voltage divider",
    lead: "Move the sliders: current and formulas change at once.",
    source: "Source voltage",
    reset: "Reset",
    current: "Current",
    split: "How the voltage is shared",
    power: "Power",
    up: "Larger R₁ → smaller U₂. Larger R₂ → larger U₂.",
    equal: "R₁ = R₂: the voltage is split exactly in half.",
    most2: "R₂ is much larger than R₁: almost all the voltage is across R₂.",
    most1: "R₁ is much larger than R₂: almost all the voltage is across R₁.",
    schematic: "Voltage divider schematic with flowing current",
  },
  fr: {
    title: "Diviseur de tension",
    lead: "Bouge les curseurs : le courant et les formules changent tout de suite.",
    source: "Tension de la source",
    reset: "Réinitialiser",
    current: "Courant",
    split: "Comment la tension se partage",
    power: "Puissance",
    up: "R₁ plus grande → U₂ plus petite. R₂ plus grande → U₂ plus grande.",
    equal: "R₁ = R₂ : la tension se partage exactement en deux.",
    most2: "R₂ est bien plus grande que R₁ : presque toute la tension est sur R₂.",
    most1: "R₁ est bien plus grande que R₂ : presque toute la tension est sur R₁.",
    schematic: "Schéma du diviseur de tension avec le courant qui circule",
  },
} as const;

/** L'état est la POSITION des curseurs de résistance (0 à 1), pas la valeur arrondie : sinon un petit pas au clavier retomberait sur la même valeur. */
const START = { u: 12, t1: ohmsToSlider(100), t2: ohmsToSlider(220) };
const C = { wire: "#64748B", flow: "#EAB308", u: "#2563EB", r1: "#F97316", r2: "#10B981" };

/** La maille, dans le sens du courant : source (haut) → R1 → nœud → R2 → retour. */
const LOOP: [number, number][] = [
  [70, 70],
  [400, 70],
  [400, 290],
  [70, 290],
];
const SEGMENTS = LOOP.map((p, k) => {
  const q = LOOP[(k + 1) % LOOP.length]!;
  return { p, q, len: Math.hypot(q[0] - p[0], q[1] - p[1]) };
});
const PERIMETER = SEGMENTS.reduce((n, s) => n + s.len, 0);
const DOTS = 16;

function pointAt(t: number): [number, number] {
  let d = (((t % 1) + 1) % 1) * PERIMETER;
  for (const s of SEGMENTS) {
    if (d <= s.len) return [s.p[0] + ((s.q[0] - s.p[0]) * d) / s.len, s.p[1] + ((s.q[1] - s.p[1]) * d) / s.len];
    d -= s.len;
  }
  return LOOP[0]!;
}

function Tex({ tex, className }: { tex: string; className?: string }) {
  const html = useMemo(() => katex.renderToString(tex, { displayMode: true, throwOnError: false, strict: false }), [tex]);
  return <div className={cn("overflow-x-auto overflow-y-hidden [&_.katex-display]:my-0", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}

function Slider({ id, label, color, value, min, max, step, shown, onChange }: { id: string; label: React.ReactNode; color: string; value: number; min: number; max: number; step: number; shown: string; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold" style={{ color }}>
          {label}
        </label>
        <output htmlFor={id} className="text-base font-bold tabular-nums">
          {shown}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full cursor-pointer touch-pan-y"
        style={{ accentColor: color }}
        data-testid={`slider-${id.split("-").pop()}`}
      />
    </div>
  );
}

export function InteractiveCircuit() {
  const { locale } = useT();
  const text = TEXT[locale as keyof typeof TEXT] ?? (locale === "de" ? TEXT.de : TEXT.en);
  const comma = !["en", "zh", "ja", "hi", "bn"].includes(locale);
  const uid = useId();
  const [input, setInput] = useState(START);
  const s = useMemo(() => solveDivider({ u: input.u, r1: sliderToOhms(input.t1), r2: sliderToOhms(input.t2) }), [input]);

  // Les charges : déplacées image par image SANS redessiner React. Leur vitesse suit le courant.
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const speed = useRef(flowSpeed(s.i));
  useEffect(() => {
    speed.current = flowSpeed(s.i);
  }, [s.i]);
  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let phase = 0;
    let last = performance.now();
    let raf = 0;
    const place = () => {
      dots.current.forEach((dot, k) => {
        if (!dot) return;
        const [x, y] = pointAt(phase + k / DOTS);
        dot.setAttribute("cx", String(x));
        dot.setAttribute("cy", String(y));
      });
    };
    place();
    if (still) return;
    const tick = (now: number) => {
      phase += (speed.current * Math.min(64, now - last)) / 1000;
      last = now;
      place();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const n = (v: number) => sig3(v, comma);
  const iShown = withPrefix(s.i, "A", comma);
  const r1Shown = withPrefix(s.r1, "Ω", comma);
  const r2Shown = withPrefix(s.r2, "Ω", comma);
  const unit = (x: { value: string; unit: string }) => `${x.value.replace(",", "{,}")}\\,\\mathrm{${x.unit.replace("Ω", "\\Omega").replace("µ", "\\mu ")}}`;
  const volts = (v: number) => `${n(v).replace(",", "{,}")}\\,\\mathrm{V}`;
  const formulas = [
    { color: C.flow, tex: `I = \\frac{U}{R_1 + R_2} = \\frac{${volts(s.u)}}{${unit(r1Shown)} + ${unit(r2Shown)}} = \\mathbf{${unit(iShown)}}` },
    { color: C.r2, tex: `U_2 = U \\cdot \\frac{R_2}{R_1 + R_2} = ${volts(s.u)} \\cdot \\frac{${unit(r2Shown)}}{${unit(r1Shown)} + ${unit(r2Shown)}} = \\mathbf{${volts(s.u2)}}` },
    { color: C.r1, tex: `U_1 = U - U_2 = ${volts(s.u)} - ${volts(s.u2)} = \\mathbf{${volts(s.u1)}}` },
  ];
  const insight = Math.abs(s.r1 - s.r2) / Math.max(s.r1, s.r2) < 0.02 ? text.equal : s.ratio > 0.9 ? text.most2 : s.ratio < 0.1 ? text.most1 : text.up;

  // Les flèches de tension grandissent avec leur part de U.
  const u1Len = 30 + 90 * (1 - s.ratio);
  const u2Len = 40 + 140 * s.ratio;
  const heat = (p: number) => 0.12 + 0.5 * Math.min(1, p / (s.p1 + s.p2));
  const arrow = `${uid}-arrow`;
  const fmt = (x: { value: string; unit: string }) => `${x.value} ${x.unit}`;

  return (
    <section className="bg-card rounded-2xl border p-4 shadow-sm sm:p-6" data-testid="interactive-circuit">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{text.title}</h2>
          <p className="text-muted-foreground text-sm">{text.lead}</p>
        </div>
        <button type="button" onClick={() => setInput(START)} className="text-muted-foreground hover:text-foreground inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium">
          <RotateCcw className="size-4" />
          {text.reset}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* ── Le schéma ── */}
        <div className="self-start rounded-xl bg-[#0F172A] p-2">
          <svg viewBox="0 0 520 360" aria-labelledby={`${uid}-schematic`} className="block h-auto w-full">
            <title id={`${uid}-schematic`}>{text.schematic}</title>
            <defs>
              {[C.u, C.r1, C.r2].map((color) => (
                <marker key={color} id={`${arrow}-${color.slice(1)}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill={color} />
                </marker>
              ))}
            </defs>
            {/* Les fils */}
            <path d="M70 70 H400 V290 H70 Z" fill="none" stroke={C.wire} strokeWidth="3" strokeLinejoin="round" />
            <path d="M400 70 H470" stroke={C.wire} strokeWidth="3" />
            <path d="M400 290 H470" stroke={C.wire} strokeWidth="3" />
            {/* Le courant : des charges qui tournent dans la maille */}
            {Array.from({ length: DOTS }, (_, k) => (
              <circle key={k} ref={(el) => void (dots.current[k] = el)} r="5" fill={C.flow} style={{ filter: "drop-shadow(0 0 4px #EAB308)" }} />
            ))}
            {/* La source */}
            <circle cx="70" cy="180" r="30" fill="#0F172A" stroke={C.u} strokeWidth="3" />
            <text x="70" y="172" textAnchor="middle" fill={C.u} fontSize="20" fontWeight="700">+</text>
            <text x="70" y="200" textAnchor="middle" fill={C.u} fontSize="22" fontWeight="700">−</text>
            <text x="22" y="150" textAnchor="middle" fill={C.u} fontSize="17" fontWeight="700">U</text>
            <text x="70" y="238" textAnchor="middle" fill="#E2E8F0" fontSize="15" fontWeight="600" className="tabular-nums">{n(s.u)} V</text>
            {/* R1 (symbole européen : un rectangle), chauffé selon sa puissance */}
            <rect x="180" y="52" width="110" height="36" rx="3" fill="#0F172A" />
            <rect x="180" y="52" width="110" height="36" rx="3" fill={C.r1} fillOpacity={heat(s.p1)} stroke={C.r1} strokeWidth="3" style={{ transition: "fill-opacity 200ms" }} />
            <text x="235" y="76" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="700">R₁</text>
            <text x="235" y="112" textAnchor="middle" fill="#E2E8F0" fontSize="15" fontWeight="600" className="tabular-nums">{fmt(r1Shown)}</text>
            {/* R2 */}
            <rect x="382" y="125" width="36" height="110" rx="3" fill="#0F172A" />
            <rect x="382" y="125" width="36" height="110" rx="3" fill={C.r2} fillOpacity={heat(s.p2)} stroke={C.r2} strokeWidth="3" style={{ transition: "fill-opacity 200ms" }} />
            <text x="400" y="186" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="700">R₂</text>
            <text x="372" y="262" textAnchor="end" fill="#E2E8F0" fontSize="15" fontWeight="600" className="tabular-nums">{fmt(r2Shown)}</text>
            {/* Les bornes de sortie */}
            <circle cx="470" cy="70" r="6" fill="#0F172A" stroke={C.r2} strokeWidth="3" />
            <circle cx="470" cy="290" r="6" fill="#0F172A" stroke={C.r2} strokeWidth="3" />
            <circle cx="400" cy="70" r="5" fill={C.wire} />
            <circle cx="400" cy="290" r="5" fill={C.wire} />
            {/* U1 : au-dessus de R1 ; U2 : entre les bornes. Leur longueur suit leur part. */}
            <line x1={235 - u1Len / 2} y1="34" x2={235 + u1Len / 2} y2="34" stroke={C.r1} strokeWidth="3" markerEnd={`url(#${arrow}-${C.r1.slice(1)})`} style={{ transition: "all 200ms" }} />
            <text x="235" y="24" textAnchor="middle" fill={C.r1} fontSize="16" fontWeight="700" className="tabular-nums">U₁ = {n(s.u1)} V</text>
            <line x1="470" y1={180 - u2Len / 2} x2="470" y2={180 + u2Len / 2} stroke={C.r2} strokeWidth="3" markerEnd={`url(#${arrow}-${C.r2.slice(1)})`} style={{ transition: "all 200ms" }} />
            <text x="470" y="322" textAnchor="middle" fill={C.r2} fontSize="16" fontWeight="700" className="tabular-nums">U₂ = {n(s.u2)} V</text>
            {/* Le courant */}
            <text x="130" y="56" textAnchor="middle" fill={C.flow} fontSize="16" fontWeight="700" className="tabular-nums">I = {fmt(iShown)} →</text>
          </svg>
        </div>

        {/* ── Les curseurs et les formules ── */}
        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            <Slider id={`${uid}-u`} label={<>U · {text.source}</>} color={C.u} min={DIVIDER_LIMITS.u[0]} max={DIVIDER_LIMITS.u[1]} step={0.5} value={s.u} shown={`${n(s.u)} V`} onChange={(u) => setInput((v) => ({ ...v, u }))} />
            <Slider id={`${uid}-r1`} label="R₁" color={C.r1} min={0} max={1} step={0.01} value={input.t1} shown={fmt(r1Shown)} onChange={(t1) => setInput((v) => ({ ...v, t1 }))} />
            <Slider id={`${uid}-r2`} label="R₂" color={C.r2} min={0} max={1} step={0.01} value={input.t2} shown={fmt(r2Shown)} onChange={(t2) => setInput((v) => ({ ...v, t2 }))} />
          </div>

          <div>
            <p className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">{text.split}</p>
            <div className="flex h-9 overflow-hidden rounded-lg text-sm font-bold text-white tabular-nums" aria-hidden>
              <div className="flex min-w-0 items-center justify-center overflow-hidden whitespace-nowrap" style={{ width: `${(1 - s.ratio) * 100}%`, background: C.r1, transition: "width 200ms" }}>
                {s.ratio < 0.85 && `U₁ ${n(s.u1)} V`}
              </div>
              <div className="flex min-w-0 items-center justify-center overflow-hidden whitespace-nowrap" style={{ width: `${s.ratio * 100}%`, background: C.r2, transition: "width 200ms" }}>
                {s.ratio > 0.15 && `U₂ ${n(s.u2)} V`}
              </div>
            </div>
          </div>

          <div className="space-y-2" aria-live="polite" data-testid="circuit-formulas">
            {formulas.map((f) => (
              <div key={f.color} className="bg-secondary/60 rounded-xl border-l-4 px-2 py-2.5 text-[0.72rem] sm:px-3 sm:text-[0.95rem]" style={{ borderLeftColor: f.color }}>
                <Tex tex={f.tex} />
              </div>
            ))}
          </div>

          <p className="text-sm font-medium" data-testid="circuit-insight">
            {insight}
          </p>
          <p className="text-muted-foreground text-xs tabular-nums">
            {text.power}: P₁ = {fmt(withPrefix(s.p1, "W", comma))} · P₂ = {fmt(withPrefix(s.p2, "W", comma))}
          </p>
        </div>
      </div>
    </section>
  );
}
