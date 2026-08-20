/**
 * Parametrische Skizzen im Lehrbuch-Stil.
 *
 * Warum das existiert: Lässt man ein Sprachmodell jede Skizze frei zeichnen,
 * erfindet es die Geometrie jedes Mal neu — mal sitzt ein Lager falsch, mal
 * hängt ein Bauteil am falschen Potential. Hier wird stattdessen ein GEPRÜFTES
 * Gerüst gezeichnet und nur noch mit Zahlen und Beschriftungen gefüllt.
 * Dadurch sehen alle Skizzen gleich aus — sauber, beschriftet, wie im Skript.
 */

// ── Gemeinsames Erscheinungsbild ─────────────────────────────────────────
const FONT = "Inter, 'Helvetica Neue', Arial, sans-serif";
const C = {
  body: "#1e293b", // Bauteile, Balken, Leitungen
  force: "#2563EB", // Kräfte, Lasten, Spannungen
  compression: "#EF4444", // Druck
  tension: "#10B981", // Zug
  dim: "#64748B", // Bemaßung, Achsen
  hatch: "#94A3B8", // Schraffur, Erde
} as const;
const W = { body: 2.5, force: 3, dim: 1.2, thin: 1.4 } as const;

/** Pfeilspitzen und Schraffurmuster, einmal pro Skizze. */
function defs(): string {
  const marker = (id: string, color: string) =>
    `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" ` +
    `markerHeight="6" orient="auto-start-reverse">` +
    `<path d="M0,0 L10,5 L0,10 z" fill="${color}"/></marker>`;
  return (
    `<defs>${marker("arrF", C.force)}${marker("arrD", C.dim)}` +
    `${marker("arrB", C.body)}</defs>`
  );
}

/** Beschriftung. `vektor` setzt den Pfeil über das Symbol (F⃗, v⃗). */
function label(
  x: number,
  y: number,
  text: string,
  opts: { color?: string; anchor?: "start" | "middle" | "end"; size?: number; vektor?: boolean } = {},
): string {
  const { color = C.body, anchor = "middle", size = 14, vektor = false } = opts;
  const t =
    `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" ` +
    `text-anchor="${anchor}" font-family="${FONT}">${escapeText(text)}</text>`;
  if (!vektor) return t;
  // Vektorpfeil als eigene Linie: bleibt in jedem Renderer sichtbar,
  // anders als kombinierende Unicode-Zeichen.
  const half = text.length * size * 0.28;
  const cx = anchor === "start" ? x + half : anchor === "end" ? x - half : x;
  const y0 = y - size * 0.95;
  return (
    `${t}<line x1="${cx - half}" y1="${y0}" x2="${cx + half}" y2="${y0}" ` +
    `stroke="${color}" stroke-width="1.1" marker-end="url(#arrB)"/>`
  );
}

/** Schützt vor kaputtem SVG, lässt Umlaute und Akzente unangetastet. */
function escapeText(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function frame(width: number, height: number, body: string): string {
  return (
    `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" ` +
    `font-family="${FONT}" font-size="14">${defs()}${body}</svg>`
  );
}

/** Schraffierte Wand / Erde unter einer Strecke. */
function hatching(x1: number, x2: number, y: number, step = 10): string {
  let out = `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${C.hatch}" stroke-width="${W.thin}"/>`;
  for (let x = x1; x <= x2 - step; x += step) {
    out += `<line x1="${x}" y1="${y + 9}" x2="${x + 8}" y2="${y}" stroke="${C.hatch}" stroke-width="1"/>`;
  }
  return out;
}

/** Bemaßung mit Pfeilen an beiden Enden. */
function dimension(x1: number, x2: number, y: number, text: string): string {
  return (
    `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${C.dim}" ` +
    `stroke-width="${W.dim}" marker-start="url(#arrD)" marker-end="url(#arrD)"/>` +
    `<line x1="${x1}" y1="${y - 6}" x2="${x1}" y2="${y + 6}" stroke="${C.dim}" stroke-width="1"/>` +
    `<line x1="${x2}" y1="${y - 6}" x2="${x2}" y2="${y + 6}" stroke="${C.dim}" stroke-width="1"/>` +
    label((x1 + x2) / 2, y - 10, text, { color: C.dim, size: 13 })
  );
}

/** Widerstand als genormtes Rechteck, waagerecht oder senkrecht. */
function resistor(
  x: number,
  y: number,
  orientation: "h" | "v",
  name: string,
  color = C.body,
): string {
  const w = orientation === "h" ? 46 : 20;
  const h = orientation === "h" ? 20 : 46;
  const rect =
    `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" ` +
    `fill="#fff" stroke="${color}" stroke-width="2" rx="2"/>`;
  const lbl =
    orientation === "h"
      ? label(x, y - h / 2 - 8, name, { color, size: 13 })
      : label(x - w / 2 - 8, y + 4, name, { color, anchor: "end", size: 13 });
  return rect + lbl;
}

// ── Gabarit 1: Spannungsteiler ───────────────────────────────────────────
export interface SpannungsteilerSpec {
  typ: "spannungsteiler";
  /** Beschriftung der oberen Quelle, z. B. "+U_B = +15 V". */
  quelle: string;
  /** Oberer Widerstand (zwischen Quelle und Abgriff). */
  rOben: string;
  /** Unterer Widerstand (zwischen Abgriff und Masse). */
  rUnten: string;
  /** Beschriftung des Abgriffs, z. B. "U₋". */
  abgriff: string;
}

function spannungsteiler(s: SpannungsteilerSpec): string {
  const x = 150;
  const body =
    `<line x1="${x}" y1="30" x2="${x}" y2="70" stroke="${C.body}" stroke-width="${W.body}"/>` +
    label(x, 22, s.quelle, { color: C.force, size: 13 }) +
    resistor(x, 95, "v", s.rOben) +
    `<line x1="${x}" y1="118" x2="${x}" y2="160" stroke="${C.body}" stroke-width="${W.body}"/>` +
    // Abgriff
    `<circle cx="${x}" cy="140" r="3.5" fill="${C.body}"/>` +
    `<line x1="${x}" y1="140" x2="${x + 90}" y2="140" stroke="${C.body}" stroke-width="${W.thin}"/>` +
    label(x + 96, 145, s.abgriff, { color: C.force, anchor: "start", size: 14 }) +
    resistor(x, 185, "v", s.rUnten) +
    `<line x1="${x}" y1="208" x2="${x}" y2="235" stroke="${C.body}" stroke-width="${W.body}"/>` +
    ground(x, 235);
  return frame(320, 270, body);
}

function ground(x: number, y: number): string {
  return (
    `<line x1="${x - 16}" y1="${y}" x2="${x + 16}" y2="${y}" stroke="${C.body}" stroke-width="2.2"/>` +
    `<line x1="${x - 10}" y1="${y + 6}" x2="${x + 10}" y2="${y + 6}" stroke="${C.body}" stroke-width="2"/>` +
    `<line x1="${x - 4}" y1="${y + 12}" x2="${x + 4}" y2="${y + 12}" stroke="${C.body}" stroke-width="2"/>`
  );
}

// ── Gabarit 2: Komparator mit zwei Teilern und LED ───────────────────────
export interface KomparatorSpec {
  typ: "komparator_led";
  quelle: string; // "+U_B"
  /** Referenzzweig → nicht invertierender Eingang (+). */
  refOben: string; // "R1"
  refUnten: string; // "R2"
  /** Messzweig → invertierender Eingang (−). */
  messOben: string; // "R3 (PTC)"
  messUnten: string; // "R4"
  vorwiderstand: string; // "R5"
  led: string; // "LD1"
  /** Optional: Schutzdiode antiparallel zur LED einzeichnen. */
  schutzdiode?: boolean;
}

function komparatorLed(s: KomparatorSpec): string {
  const yRail = 34;
  const xRef = 90;
  const xMess = 200;
  const opX = 300;
  const opY = 150;

  const zweig = (x: number, rOben: string, rUnten: string, abgriffY: number) =>
    `<line x1="${x}" y1="${yRail}" x2="${x}" y2="78" stroke="${C.body}" stroke-width="${W.body}"/>` +
    resistor(x, 100, "v", rOben) +
    `<line x1="${x}" y1="123" x2="${x}" y2="${abgriffY}" stroke="${C.body}" stroke-width="${W.body}"/>` +
    `<circle cx="${x}" cy="${abgriffY}" r="3.5" fill="${C.body}"/>` +
    `<line x1="${x}" y1="${abgriffY}" x2="${x}" y2="190" stroke="${C.body}" stroke-width="${W.body}"/>` +
    resistor(x, 212, "v", rUnten) +
    `<line x1="${x}" y1="235" x2="${x}" y2="255" stroke="${C.body}" stroke-width="${W.body}"/>` +
    ground(x, 255);

  const rail =
    `<line x1="${xRef - 20}" y1="${yRail}" x2="${xMess + 20}" y2="${yRail}" stroke="${C.force}" stroke-width="${W.body}"/>` +
    label(xRef - 26, yRail + 5, s.quelle, { color: C.force, anchor: "end", size: 13 });

  // Referenzzweig links → (+), Messzweig rechts → (−)
  const zweige = zweig(xRef, s.refOben, s.refUnten, 168) + zweig(xMess, s.messOben, s.messUnten, 132);

  const op =
    `<path d="M${opX},${opY - 55} L${opX},${opY + 55} L${opX + 85},${opY} z" fill="#fff" stroke="${C.body}" stroke-width="2.2"/>` +
    label(opX + 14, opY - 22, "−", { anchor: "start", size: 17 }) +
    label(opX + 14, opY + 34, "+", { anchor: "start", size: 17 }) +
    // Eingangsleitungen: (−) oben, (+) unten
    `<line x1="${xMess}" y1="132" x2="${opX}" y2="${opY - 28}" stroke="${C.body}" stroke-width="${W.thin}"/>` +
    `<line x1="${xRef}" y1="168" x2="${opX}" y2="${opY + 28}" stroke="${C.body}" stroke-width="${W.thin}"/>` +
    label(xMess + 8, 126, "U₋", { color: C.force, anchor: "start", size: 13 }) +
    label(xRef + 8, 186, "U₊", { color: C.force, anchor: "start", size: 13 });

  const xOut = opX + 85;
  const xR5 = xOut + 55;
  const xLed = xR5 + 70;
  const ausgang =
    `<line x1="${xOut}" y1="${opY}" x2="${xR5 - 23}" y2="${opY}" stroke="${C.body}" stroke-width="${W.thin}"/>` +
    resistor(xR5, opY, "h", s.vorwiderstand) +
    `<line x1="${xR5 + 23}" y1="${opY}" x2="${xLed}" y2="${opY}" stroke="${C.body}" stroke-width="${W.thin}"/>` +
    `<line x1="${xLed}" y1="${opY}" x2="${xLed}" y2="${opY + 30}" stroke="${C.body}" stroke-width="${W.thin}"/>` +
    // LED: Dreieck + Kathodenbalken + zwei Emissionspfeile
    `<path d="M${xLed - 13},${opY + 30} L${xLed + 13},${opY + 30} L${xLed},${opY + 52} z" fill="${C.tension}" stroke="${C.body}" stroke-width="1.6"/>` +
    `<line x1="${xLed - 14}" y1="${opY + 52}" x2="${xLed + 14}" y2="${opY + 52}" stroke="${C.body}" stroke-width="2.2"/>` +
    `<line x1="${xLed + 16}" y1="${opY + 30}" x2="${xLed + 28}" y2="${opY + 20}" stroke="${C.body}" stroke-width="1.2" marker-end="url(#arrB)"/>` +
    `<line x1="${xLed + 16}" y1="${opY + 42}" x2="${xLed + 28}" y2="${opY + 32}" stroke="${C.body}" stroke-width="1.2" marker-end="url(#arrB)"/>` +
    label(xLed - 20, opY + 46, s.led, { anchor: "end", size: 13 }) +
    `<line x1="${xLed}" y1="${opY + 52}" x2="${xLed}" y2="${opY + 78}" stroke="${C.body}" stroke-width="${W.thin}"/>` +
    ground(xLed, opY + 78);

  const diode = s.schutzdiode
    ? `<line x1="${xLed - 42}" y1="${opY + 12}" x2="${xLed - 42}" y2="${opY + 70}" stroke="${C.body}" stroke-width="${W.thin}"/>` +
      `<line x1="${xLed - 42}" y1="${opY + 12}" x2="${xLed}" y2="${opY + 12}" stroke="${C.body}" stroke-width="${W.thin}"/>` +
      `<line x1="${xLed - 42}" y1="${opY + 70}" x2="${xLed}" y2="${opY + 70}" stroke="${C.body}" stroke-width="${W.thin}"/>` +
      // Gegensinnig: Spitze nach oben
      `<path d="M${xLed - 55},${opY + 52} L${xLed - 29},${opY + 52} L${xLed - 42},${opY + 30} z" fill="#fff" stroke="${C.body}" stroke-width="1.6"/>` +
      `<line x1="${xLed - 56}" y1="${opY + 30}" x2="${xLed - 28}" y2="${opY + 30}" stroke="${C.body}" stroke-width="2.2"/>` +
      label(xLed - 62, opY + 46, "D", { anchor: "end", size: 13, color: C.dim })
    : "";

  return frame(560, 300, rail + zweige + op + ausgang + diode);
}

// ── Gabarit 3: Balken mit Lagern und Lasten ──────────────────────────────
export interface BalkenSpec {
  typ: "balken";
  laenge: string; // "L = 4,0 m"
  /** Konstante Streckenlast über die ganze Länge, z. B. "q₀ = 6,0 kN/m". */
  streckenlast?: string;
  /** Einzelkraft: Beschriftung und Lage als Anteil 0…1 der Länge. */
  einzelkraft?: { text: string; bei: number };
  /** Bemaßung bis zur Einzelkraft, z. B. "1,5 m". */
  masz?: string;
  lagerLinks?: string; // "A"
  lagerRechts?: string; // "B"
}

function balken(s: BalkenSpec): string {
  const x1 = 80;
  const x2 = 420;
  const yB = 150;
  const parts: string[] = [];

  if (s.streckenlast) {
    parts.push(label((x1 + x2) / 2, 44, s.streckenlast, { color: C.force, size: 13 }));
    parts.push(
      `<line x1="${x1}" y1="56" x2="${x2}" y2="56" stroke="${C.force}" stroke-width="${W.dim}"/>`,
    );
    for (let x = x1; x <= x2; x += 34) {
      parts.push(
        `<line x1="${x}" y1="56" x2="${x}" y2="${yB - 12}" stroke="${C.force}" stroke-width="1.6" marker-end="url(#arrF)"/>`,
      );
    }
  }

  if (s.einzelkraft) {
    const xF = x1 + (x2 - x1) * Math.min(1, Math.max(0, s.einzelkraft.bei));
    parts.push(
      `<line x1="${xF}" y1="72" x2="${xF}" y2="${yB - 10}" stroke="${C.force}" stroke-width="${W.force}" marker-end="url(#arrF)"/>`,
    );
    parts.push(label(xF, 66, s.einzelkraft.text, { color: C.force, size: 14, vektor: true }));
    if (s.masz) parts.push(dimension(x1, xF, yB + 62, s.masz));
  }

  // Balken
  parts.push(
    `<rect x="${x1}" y="${yB - 10}" width="${x2 - x1}" height="14" fill="${C.body}" rx="2"/>`,
  );

  // Festlager links (Dreieck + Schraffur), Loslager rechts (Dreieck + Linie)
  parts.push(
    `<path d="M${x1 - 15},${yB + 30} L${x1 + 15},${yB + 30} L${x1},${yB + 4} z" fill="#fff" stroke="${C.body}" stroke-width="2"/>` +
      hatching(x1 - 22, x1 + 22, yB + 30),
  );
  parts.push(
    `<path d="M${x2 - 15},${yB + 26} L${x2 + 15},${yB + 26} L${x2},${yB + 4} z" fill="#fff" stroke="${C.body}" stroke-width="2"/>` +
      `<line x1="${x2 - 20}" y1="${yB + 32} " x2="${x2 + 20}" y2="${yB + 32}" stroke="${C.body}" stroke-width="2"/>` +
      hatching(x2 - 22, x2 + 22, yB + 38),
  );
  parts.push(label(x1, yB + 62, s.lagerLinks ?? "A", { size: 14 }));
  parts.push(label(x2, yB + 62, s.lagerRechts ?? "B", { size: 14 }));
  parts.push(dimension(x1, x2, yB + 92, s.laenge));

  return frame(500, 270, parts.join(""));
}

// ── Gabarit 4: Rechteckquerschnitt ───────────────────────────────────────
export interface QuerschnittSpec {
  typ: "querschnitt";
  breite: string; // "b = 80 mm"
  hoehe: string; // "h = 160 mm"
  /** Neutrale Faser einzeichnen (gestrichelt). */
  neutraleFaser?: boolean;
}

function querschnitt(s: QuerschnittSpec): string {
  const x = 150;
  const y = 40;
  const w = 90;
  const h = 160;
  const body =
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#EFF6FF" stroke="${C.body}" stroke-width="2.2"/>` +
    (s.neutraleFaser
      ? `<line x1="${x - 26}" y1="${y + h / 2}" x2="${x + w + 26}" y2="${y + h / 2}" stroke="${C.dim}" stroke-width="${W.dim}" stroke-dasharray="6 4"/>` +
        label(x + w + 32, y + h / 2 + 5, "n. F.", { color: C.dim, anchor: "start", size: 12 })
      : "") +
    dimension(x, x + w, y - 18, s.breite) +
    // Senkrechte Bemaßung
    `<line x1="${x - 30}" y1="${y}" x2="${x - 30}" y2="${y + h}" stroke="${C.dim}" stroke-width="${W.dim}" marker-start="url(#arrD)" marker-end="url(#arrD)"/>` +
    `<line x1="${x - 36}" y1="${y}" x2="${x - 24}" y2="${y}" stroke="${C.dim}" stroke-width="1"/>` +
    `<line x1="${x - 36}" y1="${y + h}" x2="${x - 24}" y2="${y + h}" stroke="${C.dim}" stroke-width="1"/>` +
    `<text x="${x - 40}" y="${y + h / 2}" fill="${C.dim}" font-size="13" text-anchor="middle" ` +
    `font-family="${FONT}" transform="rotate(-90 ${x - 40} ${y + h / 2})">${escapeText(s.hoehe)}</text>`;
  return frame(380, 240, body);
}

// ── Öffentliche Schnittstelle ────────────────────────────────────────────
export type DiagramSpec =
  | SpannungsteilerSpec
  | KomparatorSpec
  | BalkenSpec
  | QuerschnittSpec;

export function renderDiagram(spec: DiagramSpec): { svg: string } | { error: string } {
  switch (spec.typ) {
    case "spannungsteiler":
      return { svg: spannungsteiler(spec) };
    case "komparator_led":
      return { svg: komparatorLed(spec) };
    case "balken":
      return { svg: balken(spec) };
    case "querschnitt":
      return { svg: querschnitt(spec) };
    default:
      return { error: "Unbekannter Skizzentyp." };
  }
}
