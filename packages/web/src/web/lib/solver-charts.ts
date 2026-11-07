/**
 * Diagramme der Fachlöser (thermo_berechnen, physik_berechnen, solve_ai).
 *
 * Wie beim Balken (beam-svg.ts) zeichnet nicht das Modell, sondern der
 * Code: der Löser liefert `diagramme` (Schema des ```chart-Blocks), und hier
 * wird daraus Text — an der Stelle des Werkzeugaufrufs. Das p-V-Diagramm
 * oder die Wurfbahn zeigt so genau die Rechnung; Speichern und Übersetzen
 * übernehmen den Block ohne weiteres Zutun.
 */
const CHART_TOOLS = new Set(["thermo_berechnen", "physik_berechnen", "solve_ai", "solve_open_math"]);

interface ChartLike {
  type?: unknown;
  series?: unknown;
}

const isChart = (c: unknown): c is ChartLike =>
  !!c && typeof c === "object" && Array.isArray((c as ChartLike).series);

export function solverChartBlockFromPart(part: unknown): string | null {
  const p = part as { type?: string; toolName?: string; state?: string; output?: { ok?: boolean; diagramme?: unknown } };
  const name = p?.type === "dynamic-tool" ? p.toolName : p?.type?.startsWith("tool-") ? p.type.slice(5) : undefined;
  if (!name || !CHART_TOOLS.has(name) || p.state !== "output-available") return null;
  if (!p.output?.ok || !Array.isArray(p.output.diagramme)) return null;
  const charts = p.output.diagramme.filter(isChart).slice(0, 3);
  if (charts.length === 0) return null;
  return charts.map((c) => `\n\n\`\`\`chart\n${JSON.stringify(c)}\n\`\`\`\n\n`).join("");
}
