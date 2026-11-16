// Polycopiés de démonstration fabriqués ici (aucun document réel) : même mise en page que celui des essais de citations.
const WIN: Record<string, string> = { "ä": "\\344", "ö": "\\366", "ü": "\\374", "Ä": "\\304", "Ö": "\\326", "Ü": "\\334", "ß": "\\337", "·": "\\267", "–": "\\226", "—": "\\227", "„": "\\204", "“": "\\223", "Δ": "D", "η": "eta", "κ": "kappa" };
const esc = (s: string) => s.replace(/[\\()]/g, "\\$&").replace(/[^\x20-\x7e]/g, (c) => WIN[c] ?? "?");

export interface Script {
  /** Ligne d'en-tête de chaque page. */
  header: string;
  /** Numéro de chapitre devant le numéro de section (« 3 » → « 3.12 »). */
  chapter: string;
  /** Un titre de section par page. */
  topics: string[];
  /** Le corps des pages qui en ont un à elles (numéro de page → lignes). */
  body: Record<number, string[]>;
  /** Le corps des autres pages, à partir du titre. */
  filler: (topic: string) => string[];
  /** « Seite » ou « Page ». */
  pageWord: string;
  /** Encadrés « à retenir » (numéro de page → titre + lignes). */
  notes?: Record<number, { title: string; lines: string[] }>;
}

export function buildPdf(sc: Script): Buffer {
  const objs: string[] = [];
  const add = (body: string) => objs.push(body);
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add("PAGES");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids: number[] = [];
  sc.topics.forEach((topic, i) => {
    const n = i + 1;
    const lines = sc.body[n] ?? sc.filler(topic);
    let c = "0.45 0.45 0.5 rg BT /F1 9 Tf 72 742 Td (" + esc(sc.header) + ") Tj ET\n";
    c += "0.92 0.70 0.03 RG 2 w 72 732 m 540 732 l S\n";
    c += "0.06 0.09 0.16 rg BT /F2 22 Tf 72 690 Td (" + esc(`${sc.chapter}.${n}  ${topic}`) + ") Tj ET\n";
    c += "0.1 0.1 0.12 rg BT /F1 13 Tf 72 650 Td 20 TL\n" + lines.map((l) => `(${esc(l)}) Tj T*`).join("\n") + "\nET\n";
    const note = sc.notes?.[n];
    if (note) {
      c += "0.98 0.97 0.92 rg 72 400 468 90 re f\n0.92 0.70 0.03 RG 1.2 w 72 400 468 90 re S\n0.06 0.09 0.16 rg BT /F2 12 Tf 88 462 Td (" + esc(note.title) + ") Tj ET\n";
      c += "BT /F1 12 Tf 88 440 Td 17 TL " + note.lines.map((l) => `(${esc(l)}) Tj T*`).join(" ") + " ET\n";
    }
    c += "0.45 0.45 0.5 rg BT /F1 10 Tf 290 48 Td (" + esc(`${sc.pageWord} ${n}`) + ") Tj ET\n";
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${objs.length + 2} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`);
    kids.push(objs.length);
    add(`<< /Length ${Buffer.byteLength(c, "latin1")} >>\nstream\n${c}endstream`);
  });
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/* ── Anglais : « Thermodynamics I · Chapter 3 », 14 pages, la capacité thermique page 12 ── */
export const EN_QUOTE = "The heat capacity is defined as the amount of heat a body absorbs per kelvin of temperature change.";
export const thermoEn = (): Buffer =>
  buildPdf({
    header: "Thermodynamics I · Chapter 3 — Heat and Energy",
    chapter: "3",
    pageWord: "Page",
    topics: ["Systems and state variables", "Temperature and thermal equilibrium", "Work and heat", "The first law", "Internal energy", "Enthalpy", "Ideal gas", "Changes of state", "Isothermal and isobaric processes", "Adiabatic processes", "Calorimetry", "Heat capacity", "Isentropic compression", "Summary"],
    filler: (topic) => [`This section covers ${topic.toLowerCase()}. The basics are explained with`, "examples from the lecture and practised in the exercises.", "Remember the definitions and the units."],
    body: {
      11: ["In calorimetry, the heat exchanged is measured through a change in", "temperature. The calorimeter is thermally insulated from the", "outside, so only the inside is considered."],
      12: ["The heat capacity is defined as the amount of heat a body absorbs", "per kelvin of temperature change.", "", "It holds:   Q = C · (T2 – T1)", "", "Related to the mass, one obtains the specific heat capacity c.", "For water it is about 4.18 kJ/(kg K)."],
      13: ["During isentropic compression, pressure and temperature rise", "without heat being exchanged with the surroundings. The compressor", "does work on the air."],
    },
    notes: { 12: { title: "Remember", lines: ["Large heat capacity: a lot of heat for a small temperature change.", "That is why water stores heat so well."] } },
  });

/* ── Allemand : le Skript des essais de citations (14 pages, Wärmekapazität page 12) ── */
export const DE_QUOTE = "Die Wärmekapazität ist definiert als die Wärmemenge, die ein Körper pro Kelvin Temperaturänderung aufnimmt.";
const DE_FILLER = (topic: string) => [`Dieser Abschnitt behandelt das Thema ${topic}. Die Grundlagen`, "werden an Beispielen aus der Vorlesung erklärt und in den Übungen", "vertieft. Merke dir die Definitionen und die Einheiten."];
export const thermoDe = (): Buffer =>
  buildPdf({
    header: "Thermodynamik I · Kapitel 3 — Wärme und Energie",
    chapter: "3",
    pageWord: "Seite",
    topics: ["Systeme und Zustandsgrößen", "Temperatur und thermisches Gleichgewicht", "Arbeit und Wärme", "Der erste Hauptsatz", "Innere Energie", "Enthalpie", "Ideales Gas", "Zustandsänderungen", "Isotherme und Isobare", "Adiabate Prozesse", "Kalorimetrie", "Wärmekapazität", "Isentrope Verdichtung", "Zusammenfassung"],
    filler: DE_FILLER,
    body: {
      11: ["In der Kalorimetrie wird die ausgetauschte Wärme über eine", "Temperaturänderung gemessen. Das Kalorimeter ist dabei nach außen", "wärmeisoliert, sodass nur das Innere betrachtet wird."],
      12: ["Die Wärmekapazität ist definiert als die Wärmemenge, die ein Körper", "pro Kelvin Temperaturänderung aufnimmt.", "", "Es gilt:   Q = C · (T2 – T1)", "", "Bezogen auf die Masse erhält man die spezifische Wärmekapazität c.", "Für Wasser beträgt sie etwa 4,18 kJ/(kg K)."],
      13: ["Bei der isentropen Verdichtung steigen Druck und Temperatur, ohne", "dass Wärme mit der Umgebung ausgetauscht wird. Der Verdichter", "verrichtet Arbeit an der Luft."],
    },
    notes: { 12: { title: "Merke", lines: ["Große Wärmekapazität: viel Wärme für wenig Temperaturänderung.", "Wasser speichert Wärme deshalb besonders gut."] } },
  });

/* ── Allemand : un Skript de 80 pages (pour le plan sur 7 jours) ── */
const BASE_80 = ["Systeme und Systemgrenzen", "Zustandsgrößen", "Temperatur", "Thermisches Gleichgewicht", "Druck", "Ideales Gas", "Zustandsgleichung", "Arbeit", "Volumenänderungsarbeit", "Wärme"];
/** Les pages qui portent les concepts du plan : numéro → [titre, corps]. */
export const PLAN_PAGES: Record<number, [string, string[]]> = {
  23: ["Enthalpie", ["Die Enthalpie H fasst innere Energie und Verschiebearbeit zusammen:", "", "H = U + p · V", "", "Bei isobaren Prozessen entspricht die zugeführte Wärme der Änderung", "der Enthalpie."]],
  42: ["Wärmekapazität", ["Die Wärmekapazität ist definiert als die Wärmemenge, die ein Körper", "pro Kelvin Temperaturänderung aufnimmt.", "", "Es gilt:   Q = C · (T2 – T1)", "", "Bezogen auf die Masse erhält man die spezifische Wärmekapazität c."]],
  57: ["Entropie", ["Die Entropie S ist eine Zustandsgröße. Bei reversibler Wärmezufuhr", "gilt:", "", "dS = dQ / T", "", "In einem abgeschlossenen System nimmt die Entropie nie ab."]],
  64: ["Kreisprozess", ["Bei einem Kreisprozess kehrt das System in seinen Ausgangszustand", "zurück. Die eingeschlossene Fläche im p-V-Diagramm ist die Nutzarbeit.", "", "Der Kreisprozess nach Carnot besteht aus zwei Isothermen und zwei", "Adiabaten."]],
  71: ["Wirkungsgrad", ["Der Wirkungsgrad ist das Verhältnis von Nutzarbeit zu zugeführter", "Wärme:", "", "eta = |W| / Q_zu", "", "Der Wirkungsgrad nach Carnot hängt nur von den beiden Temperaturen ab."]],
};
export const skript80 = (): Buffer => {
  const topics = Array.from({ length: 80 }, (_, i) => PLAN_PAGES[i + 1]?.[0] ?? `${BASE_80[i % BASE_80.length]} ${["– Grundlagen", "– Beispiele", "– Übungen", "– Vertiefung", "– Anwendung", "– Herleitung", "– Sonderfälle", "– Zusammenfassung"][Math.floor(i / 10)]}`);
  const body: Record<number, string[]> = {};
  for (const [page, [, lines]] of Object.entries(PLAN_PAGES)) body[Number(page)] = lines;
  return buildPdf({ header: "Thermodynamik I · Skript zur Vorlesung", chapter: "1", pageWord: "Seite", topics, filler: DE_FILLER, body });
};

/* ── Anglais : des notes de cours de 80 pages (campagne V8, plan sur 7 jours) ── */
const BASE_80_EN = ["Systems and boundaries", "State variables", "Temperature", "Thermal equilibrium", "Pressure", "Ideal gas", "Equation of state", "Work", "Boundary work", "Heat"];
export const PLAN_PAGES_EN: Record<number, [string, string[]]> = {
  23: ["Enthalpy", ["The enthalpy H combines internal energy and flow work:", "", "H = U + p · V", "", "In isobaric processes the heat supplied equals the change in", "enthalpy."]],
  42: ["Heat capacity", ["The heat capacity is defined as the amount of heat a body absorbs", "per kelvin of temperature change.", "", "It holds:   Q = C · (T2 – T1)", "", "Related to the mass, one obtains the specific heat capacity c."]],
  57: ["Entropy", ["The entropy S is a state variable. For reversible heat transfer:", "", "dS = dQ / T", "", "In an isolated system the entropy never decreases."]],
  64: ["Cyclic process", ["In a cyclic process the system returns to its initial state.", "The enclosed area in the p-V diagram is the net work.", "", "The Carnot cyclic process consists of two isotherms and two", "adiabats."]],
  71: ["Efficiency", ["The efficiency is the ratio of net work to the heat supplied:", "", "eta = |W| / Q_in", "", "The Carnot efficiency depends only on the two temperatures."]],
};
export const notes80En = (): Buffer => {
  const topics = Array.from({ length: 80 }, (_, i) => PLAN_PAGES_EN[i + 1]?.[0] ?? `${BASE_80_EN[i % BASE_80_EN.length]} ${["– basics", "– examples", "– exercises", "– in depth", "– applications", "– derivation", "– special cases", "– summary"][Math.floor(i / 10)]}`);
  const body: Record<number, string[]> = {};
  for (const [page, [, lines]] of Object.entries(PLAN_PAGES_EN)) body[Number(page)] = lines;
  return buildPdf({
    header: "Thermodynamics I · Lecture notes",
    chapter: "1",
    pageWord: "Page",
    topics,
    filler: (topic) => [`This section covers ${topic.toLowerCase()}. The basics are explained with`, "examples from the lecture and practised in the exercises.", "Remember the definitions and the units."],
    body,
  });
};

/* ── Allemand : une feuille d'exercices de 4 pages (campagne V8, import de plusieurs fichiers) ── */
export const uebungDe = (): Buffer =>
  buildPdf({
    header: "Technische Mechanik I · Übungsblatt 5",
    chapter: "5",
    pageWord: "Seite",
    topics: ["Balken auf zwei Stützen", "Einzellast in Feldmitte", "Streckenlast", "Kontrolle"],
    filler: DE_FILLER,
    body: { 2: ["Ein Balken der Länge l liegt auf zwei Stützen. In Feldmitte greift", "die Einzellast F an.", "", "Gesucht sind die Auflagerkräfte A und B."] },
  });
