// Captures de l'app pour les courts-métrages « Cinematic » (src/cinematic).
//
// La VRAIE interface, jouée sur le serveur local (base de test, compte de
// démonstration) : tableau de bord, Hörsaal, Tafel qui s'écrit, « Als Video
// erklären », lecteur. Les réponses du tuteur et la vidéo explicative sont
// SIMULÉES au format exact de l'app (aucun appel au modèle, aucun coût) ; les
// chiffres ont été calculés à la main et vérifiés (voir chaque scénario).
//
// Playwright n'est pas une dépendance du dépôt : copier ce fichier dans un
// dossier où `playwright` est installé, puis
//   bun cinematic-captures.mjs [en1 en2 …]
// Variables : CINE_BASE (http://localhost:4586), CINE_OUT (dossier des JPEG),
// CINE_DB (fichier SQLite de la base de TEST locale, jamais la production),
// CINE_AUDIO (un MP3 quelconque, servi à la place de la voix de la leçon),
// CINE_PASSWORD (obligatoire : mot de passe du compte de démonstration local).
import { chromium } from "playwright";
import { Database } from "bun:sqlite";
import { mkdirSync, readFileSync } from "node:fs";

const B = process.env.CINE_BASE ?? "http://localhost:4586";
const OUT = process.env.CINE_OUT ?? "C:/dev/tred-rdm/aerostudy-ai/packages/video/src/assets/cine/";
const DB = process.env.CINE_DB ?? "C:/Users/HP/AppData/Local/Temp/tred-perf/cine.db";
const AUDIO = process.env.CINE_AUDIO ?? "C:/Users/HP/AppData/Local/Temp/tred-perf/prod-test/3-voix.mp3";
// --dark : thème sombre de l'app et Tafel « Dunkel » (fichiers préfixés dk-). --board : le tableau seul.
const DARK = process.argv.includes("--dark");
const BOARD_ONLY = process.argv.includes("--board");
// Le mot de passe du compte de démonstration LOCAL n'est jamais écrit ici.
const PASSWORD = process.env.CINE_PASSWORD;
if (!PASSWORD) throw new Error("CINE_PASSWORD manquant : le mot de passe du compte de démonstration local (demo@tred.test)");
// 1920 × 1080 CSS → 2880 × 1620 px : net jusqu'à un zoom de 1,5. CINE_SCALE=3 pour les vidéos verticales, qui zooment fort sur le tableau.
const SCALE = Number(process.env.CINE_SCALE) || 1.5;
// CINE_VIEWPORT=1000x1500 : fenêtre étroite — la Tafel replie ses lignes, ce qui se lit mieux dans une vidéo verticale.
const [VW, VH] = (process.env.CINE_VIEWPORT ?? "1920x1080").split("x").map(Number);
const VIEWPORT = { width: VW || 1920, height: VH || 1080 };
mkdirSync(OUT, { recursive: true });

/* ── Courbes (calculées ici, jamais « dessinées ») ────────────────────── */

const r3 = (v) => Math.round(v * 1000) / 1000;
const range = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

// EN 1 — m = 2 kg, k = 200 N/m, c = 4 Ns/m → ω0 = 10 rad/s, D = 0,1, ωd = 9,95 rad/s, x0 = 5 cm.
const damped = {
  type: "line",
  title: "Damped oscillation x(t)",
  xLabel: "t [s]",
  yLabel: "x [cm]",
  series: [
    { label: "x(t)", data: range(0, 4, 200).map((t) => ({ x: r3(t), y: r3(5 * Math.exp(-t) * Math.cos(9.95 * t)) })) },
    { label: "envelope  +x0·e^(−Dω0t)", data: range(0, 4, 40).map((t) => ({ x: r3(t), y: r3(5 * Math.exp(-t)) })) },
    { label: "envelope  −x0·e^(−Dω0t)", data: range(0, 4, 40).map((t) => ({ x: r3(t), y: r3(-5 * Math.exp(-t)) })) },
  ],
};

// EN 3 — eau, ρ = 1000 kg/m³, p0 = 110 kPa : p(v) = p0 − ρv²/2 → 110 − 0,5·v² (kPa).
const bernoulli = {
  type: "line",
  title: "Static pressure along a streamline",
  xLabel: "v [m/s]",
  yLabel: "p [kPa]",
  series: [{ label: "p = p0 − ½ρv²", data: range(0, 10, 50).map((v) => ({ x: r3(v), y: r3(110 - 0.5 * v * v) })) }],
};

// DE 2 — Carnot, gaz parfait κ = 1,4, T_H = 600 K, T_K = 300 K, p1 = 10 bar, V1 = 1 L, V2 = 2 L.
// V3 = V2·(T_H/T_K)^(1/(κ−1)) = 11,31 L ; V4 = 5,657 L. Isothermes pV = const, adiabates pV^κ = const.
const K = 1.4;
const V3 = 2 * 2 ** 2.5;
const V4 = 2 ** 2.5;
const iso = (c) => (v) => c / v;
const adi = (p0, v0) => (v) => p0 * (v0 / v) ** K;
const curve = (f, a, b) => range(a, b, 40).map((v) => ({ x: r3(v), y: r3(f(v)) }));
const carnot = {
  type: "line",
  title: "Carnot-Prozess im p-V-Diagramm",
  xLabel: "V [l]",
  yLabel: "p [bar]",
  series: [
    { label: "1→2 isotherm, T = 600 K", data: curve(iso(10), 1, 2) },
    { label: "2→3 adiabat", data: curve(adi(5, 2), 2, V3) },
    { label: "3→4 isotherm, T = 300 K", data: curve(iso(5), V4, V3).reverse() },
    { label: "4→1 adiabat", data: curve(adi(10, 1), 1, V4).reverse() },
  ],
};

// DE 3 — acier S235 : E = 210 GPa, R_e = 235 MPa (ε = 0,112 %), R_m = 360 MPa, A ≈ 26 %.
const stressStrain = {
  type: "line",
  title: "Spannungs-Dehnungs-Diagramm · S235",
  xLabel: "ε [%]",
  yLabel: "σ [MPa]",
  series: [
    {
      label: "σ(ε)",
      data: [
        { x: 0, y: 0 }, { x: 0.112, y: 235 }, { x: 1.5, y: 235 }, { x: 3, y: 262 }, { x: 5, y: 292 }, { x: 8, y: 322 }, { x: 11, y: 343 },
        { x: 14, y: 355 }, { x: 17, y: 360 }, { x: 20, y: 357 }, { x: 23, y: 345 }, { x: 26, y: 318 },
      ],
    },
    { label: "R_e = 235 MPa", data: [{ x: 0, y: 235 }, { x: 26, y: 235 }] },
    { label: "R_m = 360 MPa", data: [{ x: 0, y: 360 }, { x: 26, y: 360 }] },
  ],
};

// TikTok « Physik verstehen » — le compresseur d'un turboréacteur, idéal (isentrope), air = gaz parfait.
// T1 = 288 K, π = p2/p1 = 30, κ = 1,4 → T2 = T1·π^((κ−1)/κ) = 761 K ; w_t12 = c_p·(T2 − T1) = 1,005·473 = 475 kJ/kg.
const AIR = { T1: 288, pi: 30, kappa: 1.4, cp: 1.005 };
const compT = (pi) => AIR.T1 * pi ** ((AIR.kappa - 1) / AIR.kappa);
const compressor = {
  type: "line",
  title: "Isentrope Verdichtung der Luft",
  xLabel: "p₂/p₁ [–]",
  yLabel: "T [K]",
  series: [{ label: "T = T₁ · (p₂/p₁)^((κ−1)/κ)", data: range(1, AIR.pi, 58).map((pi) => ({ x: r3(pi), y: r3(compT(pi)) })) }],
};
// Les nombres écrits au tableau sont recalculés ici : une faute de frappe arrête le script.
const de = (v, digits = 0) => v.toFixed(digits).replace(".", ",");
const COMP = { exp: de((AIR.kappa - 1) / AIR.kappa, 3), T2: de(compT(AIR.pi)), dT: de(compT(AIR.pi) - AIR.T1), w: de(AIR.cp * (compT(AIR.pi) - AIR.T1)) };
if (JSON.stringify(COMP) !== JSON.stringify({ exp: "0,286", T2: "761", dT: "473", w: "475" })) throw new Error(`Verdichter : valeurs inattendues ${JSON.stringify(COMP)}`);

// EN 2 — poutre sur deux appuis, L = 6 m, F = 12 kN en x = 2 m, q = 2 kN/m.
// A = 14 kN, B = 10 kN ; Q change de signe sous F → M_max = 14·2 − 2·2·1 = 24 kNm.
const beam = {
  v: 1,
  problem: {
    length: 6,
    supports: [{ x: 0, kind: "festlager", name: "A" }, { x: 6, kind: "loslager", name: "B" }],
    pointLoads: [{ x: 2, F: 12000 }],
    distributedLoads: [{ from: 0, to: 6, q: 2000 }],
    pointMoments: [],
  },
  units: { length: "m", force: "kN" },
};

const fence = (lang, obj) => "```" + lang + "\n" + JSON.stringify(obj) + "\n```";

// DE 1 — U_q = 12 V, R1 = 2 Ω en série avec R2 ∥ R3 (4 Ω chacun) → R_ges = 4 Ω, I1 = 3 A, I2 = I3 = 1,5 A.
const CIRCUIT = [
  "```svg",
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 230" width="520" height="230" fill="none" stroke="#1B2A4A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" font-family="Inter, sans-serif">',
  '<path d="M70 40 H170 M250 40 H330 M330 40 H440 M70 190 H440 M70 40 V95 M70 135 V190 M330 40 V85 M330 145 V190 M440 40 V85 M440 145 V190"/>',
  '<circle cx="70" cy="115" r="20"/><path d="M70 104 V126 M64 110 L70 104 L76 110" stroke-width="2"/>',
  '<rect x="170" y="28" width="80" height="24" rx="2" fill="#FFFDF5"/><rect x="318" y="85" width="24" height="60" rx="2" fill="#FFFDF5"/><rect x="428" y="85" width="24" height="60" rx="2" fill="#FFFDF5"/>',
  '<path d="M105 40 H135 M127 34 L135 40 L127 46" stroke="#CA8A04"/>',
  '<circle cx="330" cy="40" r="3.5" fill="#1B2A4A"/><circle cx="330" cy="190" r="3.5" fill="#1B2A4A"/>',
  '<g stroke="none" fill="#1B2A4A" font-size="17" font-weight="600"><text x="14" y="121">U_q</text><text x="196" y="20">R₁</text><text x="286" y="121">R₂</text><text x="462" y="121">R₃</text><text x="112" y="26" fill="#CA8A04">I₁</text></g>',
  "</svg>",
  "```",
].join("\n");

/* ── Les six scénarios ────────────────────────────────────────────────── */

const scene = (stage, visual, cue, heading, voiceover, extra = {}) => ({
  kind: "explanation", stage, visual_cues: [cue], visual, steps: [], keywords: [], chart: null, image: null, heading, bullets: [], formula: "", sourceIndex: 1, quote: "", voiceover, sourceTitle: "", sourceKind: "document", ...extra,
});

const SCENARIOS = {
  en1: {
    lang: "en",
    professor: "genius",
    docs: [{ title: "Engineering_Mechanics_3_Vibrations", kind: "vorlesung", pages: 86 }],
    question: "Why does the oscillation die out? Explain the damped spring-mass system from my notes.",
    answer: [
      '[[TAFEL schritt="The idea"]]',
      "A damper takes energy out of the system on **every** cycle, so each swing is a little smaller than the one before. Your notes call this the *underdamped* case (p. 42).",
      "[[/TAFEL]]",
      "[[REASONING]]",
      "@@STEP: Equation of motion",
      "$$m\\,\\ddot{x} + c\\,\\dot{x} + k\\,x = 0 \\qquad m = 2\\,\\mathrm{kg},\\; c = 4\\,\\mathrm{Ns/m},\\; k = 200\\,\\mathrm{N/m}$$",
      "@@STEP: Natural frequency and damping ratio",
      "$$\\omega_0 = \\sqrt{\\frac{k}{m}} = 10\\,\\mathrm{rad/s} \\qquad D = \\frac{c}{2\\sqrt{k\\,m}} = 0.1$$",
      "@@STEP: The motion",
      "$$x(t) = x_0\\,e^{-D\\omega_0 t}\\cos(\\omega_d t) \\qquad \\omega_d = \\omega_0\\sqrt{1 - D^2} \\approx 9.95\\,\\mathrm{rad/s}$$",
      fence("chart", damped),
      "[[/REASONING]]",
      '[[TAFEL schritt="Your turn"]]',
      "The envelope is $x_0\\,e^{-D\\omega_0 t}$. After how many seconds has the amplitude dropped to **half**?",
      "[[/TAFEL]]",
    ].join("\n"),
    lesson: {
      title: "Damped oscillation, step by step",
      language: "en",
      sourceTitle: "Engineering_Mechanics_3_Vibrations",
      scenes: [
        scene("hook", "question", "ask_question", "Why does every swing get smaller?", "Why does every swing get a little smaller than the one before?", { sourceKind: "analogy" }),
        scene("step", "flowchart", "draw_flowchart", "The way to the answer", "We go from the forces to the equation, and from the equation to the curve.", { steps: ["Spring force", "Damper force", "Equation of motion", "Decay"] }),
        scene("step", "formula", "write_equation", "The equation of motion", "Mass times acceleration, plus damping, plus the spring: together they are zero.", { formula: "m\\,\\ddot{x} + c\\,\\dot{x} + k\\,x = 0", bullets: ["The damper term removes energy"] }),
        scene("step", "formula", "write_equation", "The decaying motion", "The cosine swings, and the exponential squeezes it, cycle after cycle.", { formula: "x(t) = x_0\\,e^{-D\\omega_0 t}\\cos(\\omega_d t)", bullets: ["D = 0.1: underdamped"] }),
        scene("recap", "recap", "check_recap", "Remember", "Remember these three points for tomorrow.", { bullets: ["The damper removes energy every cycle", "The envelope is an exponential", "D < 1: it still oscillates"] }),
      ],
    },
  },
  en2: {
    lang: "en",
    professor: "sensei",
    docs: [{ title: "Statics_Group_Project_Brief", kind: "uebung", pages: 6 }, { title: "Engineering_Mechanics_1_Statics", kind: "vorlesung", pages: 124 }],
    question: "Task 2 of our project: beam on two supports, L = 6 m, F = 12 kN at x = 2 m, q = 2 kN/m. Reactions and maximum bending moment?",
    answer: [
      '[[TAFEL schritt="The system"]]',
      "Simply supported beam, pin at **A**, roller at **B**. One point load and a uniform load over the whole span.",
      "",
      "| Given | Value |",
      "|---|---|",
      "| Span $L$ | 6 m |",
      "| Point load $F$ at $x = 2\\,\\mathrm{m}$ | 12 kN |",
      "| Uniform load $q$ | 2 kN/m |",
      "[[/TAFEL]]",
      fence("balkendiagramm", beam),
      "[[REASONING]]",
      "@@STEP: Support reactions",
      "$$\\sum M_A = 0:\\quad B = \\frac{F \\cdot 2\\,\\mathrm{m} + q\\,L \\cdot 3\\,\\mathrm{m}}{6\\,\\mathrm{m}} = 10\\,\\mathrm{kN} \\qquad A = F + q\\,L - B = 14\\,\\mathrm{kN}$$",
      "@@STEP: Where is the moment largest?",
      "$$Q(2^-) = 14 - 2 \\cdot 2 = +10\\,\\mathrm{kN} \\qquad Q(2^+) = 10 - 12 = -2\\,\\mathrm{kN}$$",
      "@@STEP: Result",
      "$$M_{\\max} = M(2\\,\\mathrm{m}) = 14 \\cdot 2 - 2 \\cdot 2 \\cdot 1 = 24\\,\\mathrm{kNm}$$",
      "[[/REASONING]]",
      '[[TAFEL schritt="Check"]]',
      "$A + B = 14 + 10 = 24\\,\\mathrm{kN} = F + q\\,L$ ✓. The shear force changes sign under the point load, so the maximum sits exactly there.",
      "[[/TAFEL]]",
    ].join("\n"),
  },
  en3: {
    lang: "en",
    professor: "sensei",
    docs: [{ title: "Strömungslehre_Skript_Kapitel_4", kind: "vorlesung", pages: 74 }],
    question: "I don't understand chapter 4 of my German notes. What is the Bernoulli-Gleichung actually saying?",
    answer: [
      '[[TAFEL schritt="The concept"]]',
      "Your script says (S. 61): *„Entlang einer Stromlinie bleibt die Summe aus statischem Druck, Staudruck und geodätischem Druck konstant.“*",
      "",
      "In plain English: **a fluid cannot speed up for free.** Where it flows faster, its pressure has to drop.",
      "[[/TAFEL]]",
      '[[TAFEL schritt="Your professor\'s words"]]',
      "| In your script | Meaning | Term |",
      "|---|---|---|",
      "| statischer Druck | static pressure | $p$ |",
      "| Staudruck | dynamic pressure | $\\tfrac{1}{2}\\rho v^2$ |",
      "| geodätischer Druck | hydrostatic pressure | $\\rho g h$ |",
      "| Stromlinie | streamline | |",
      "[[/TAFEL]]",
      "[[REASONING]]",
      "@@STEP: Bernoulli-Gleichung",
      "$$p + \\tfrac{1}{2}\\rho v^2 + \\rho g h = \\text{const.}$$",
      "@@STEP: Example from the script: Venturi nozzle",
      "$$v_2 = v_1\\,\\frac{A_1}{A_2} = 2\\,\\mathrm{m/s} \\cdot 2 = 4\\,\\mathrm{m/s} \\qquad \\Delta p = \\tfrac{1}{2}\\rho\\,(v_2^2 - v_1^2) = 6\\,\\mathrm{kPa}$$",
      fence("chart", bernoulli),
      "[[/REASONING]]",
      '[[TAFEL schritt="Your turn"]]',
      "In your own words: why does the pressure fall in the narrow part of the nozzle?",
      "[[/TAFEL]]",
    ].join("\n"),
    lesson: {
      title: "The Bernoulli equation, in your language",
      language: "en",
      sourceTitle: "Strömungslehre_Skript_Kapitel_4",
      scenes: [
        scene("hook", "question", "ask_question", "Why does faster water have less pressure?", "Why does water that flows faster have less pressure?", { sourceKind: "analogy" }),
        scene("step", "highlight", "highlight_text", "What your script says", "Your script says: along a streamline, the sum of three pressures stays constant.", { quote: "Entlang einer Stromlinie bleibt die Summe aus statischem Druck, Staudruck und geodätischem Druck konstant.", keywords: ["statischem Druck", "Staudruck", "konstant"] }),
        scene("step", "flowchart", "draw_flowchart", "Three pressures, one sum", "Static pressure, dynamic pressure and height: three parts of one constant sum.", { steps: ["Static pressure", "Dynamic pressure", "Hydrostatic pressure", "Constant sum"] }),
        scene("step", "formula", "write_equation", "The Bernoulli equation", "Pressure, plus one half rho v squared, plus rho g h, is constant.", { formula: "p + \\tfrac{1}{2}\\rho v^2 + \\rho g h = \\text{const.}", bullets: ["Staudruck = dynamic pressure"] }),
        scene("recap", "recap", "check_recap", "Remember", "Remember these three points.", { bullets: ["Energy is conserved along a streamline", "Faster flow means lower pressure", "Staudruck is the dynamic pressure"] }),
      ],
    },
  },
  // Campagne TikTok « Survive Your Klausur », vidéo 2 (2026-11-14) : le tableau seul, thème sombre.
  sk2: {
    lang: "de",
    professor: "genius",
    boardOnly: true,
    docs: [{ title: "Thermodynamik_1_Skript", kind: "vorlesung", pages: 168 }],
    question: "Warum wird die Luft im Verdichter eines Triebwerks heiß, obwohl noch gar nichts verbrennt?",
    answer: [
      '[[TAFEL schritt="Joule-Prozess (Brayton) · der Verdichter"]]',
      "Der Verdichter **verrichtet Arbeit an der Luft**. Bei der idealen, isentropen Verdichtung steigen Druck **und** Temperatur – ganz ohne Verbrennung.",
      "",
      "| Größe | Wert |",
      "|---|---|",
      "| $T_1$ | 288 K |",
      "| $p_2/p_1$ | 30 |",
      "| $\\kappa$ | 1,4 |",
      "[[/TAFEL]]",
      "[[REASONING]]",
      "@@STEP: Isentrope Verdichtung",
      `$$T_2 = T_1 \\left(\\frac{p_2}{p_1}\\right)^{\\frac{\\kappa-1}{\\kappa}} = 288\\,\\mathrm{K} \\cdot 30^{${COMP.exp.replace(",", "{,}")}} = ${COMP.T2}\\,\\mathrm{K}$$`,
      fence("chart", compressor),
      "@@STEP: Arbeit des Verdichters",
      "$$w_{t,12} = c_p\\,(T_2 - T_1)$$",
      "@@STEP: Ergebnis",
      `$$w_{t,12} = 1{,}005\\,\\tfrac{\\mathrm{kJ}}{\\mathrm{kg\\,K}} \\cdot ${COMP.dT}\\,\\mathrm{K} = ${COMP.w}\\,\\tfrac{\\mathrm{kJ}}{\\mathrm{kg}}$$`,
      "[[/REASONING]]",
    ].join("\n"),
  },
  de1: {
    lang: "de",
    professor: "examiner",
    docs: [{ title: "Klausur_GET1_WS2025", kind: "klausur", pages: 8 }, { title: "GET1_Skript", kind: "vorlesung", pages: 142 }],
    question: "Aufgabe 2 aus der Altklausur: Wie groß ist der Gesamtstrom I₁ – und wie komme ich darauf?",
    answer: [
      '[[TAFEL schritt="Aufgabe 2 · Klausur WS 2025/26"]]',
      "Eine Quelle $U_q = 12\\,\\mathrm{V}$ speist $R_1 = 2\\,\\Omega$ in Reihe mit der Parallelschaltung $R_2 \\parallel R_3$, $R_2 = R_3 = 4\\,\\Omega$.",
      "",
      CIRCUIT,
      "[[/TAFEL]]",
      "[[REASONING]]",
      "@@STEP: Ersatzwiderstand",
      "$$R_{23} = \\frac{R_2\\,R_3}{R_2 + R_3} = 2\\,\\Omega \\qquad R_\\text{ges} = R_1 + R_{23} = 4\\,\\Omega$$",
      "@@STEP: Ohmsches Gesetz",
      "$$I_1 = \\frac{U_q}{R_\\text{ges}}$$",
      "@@STEP: Ergebnis",
      "$$I_1 = \\frac{12\\,\\mathrm{V}}{4\\,\\Omega} = 3\\,\\mathrm{A}$$",
      "[[/REASONING]]",
      '[[TAFEL schritt="Kontrolle"]]',
      "Stromteiler: $I_2 = I_3 = 1{,}5\\,\\mathrm{A}$, denn $R_2 = R_3$. Und $I_2 + I_3 = 3\\,\\mathrm{A} = I_1$ ✓. **Achte in der Klausur immer auf die Einheit.**",
      "[[/TAFEL]]",
    ].join("\n"),
    lesson: {
      title: "Gleichstromnetzwerk – Schritt für Schritt",
      language: "de",
      sourceTitle: "Klausur_GET1_WS2025",
      scenes: [
        scene("hook", "question", "ask_question", "Wie viel Strom liefert die Quelle?", "Wie viel Strom liefert die Quelle in dieser Klausuraufgabe wirklich?", { sourceKind: "analogy" }),
        scene("step", "flowchart", "draw_flowchart", "Der Weg zur Lösung", "Erst fassen wir zusammen, dann rechnen wir: vier kleine Schritte.", { steps: ["Parallelschaltung", "Ersatzwiderstand", "Ohmsches Gesetz", "Kontrolle"] }),
        scene("step", "formula", "write_equation", "Ersatzwiderstand", "Zwei gleiche Widerstände parallel ergeben genau die Hälfte.", { formula: "R_{23} = \\frac{R_2\\,R_3}{R_2 + R_3} = 2\\,\\Omega", bullets: ["R₂ = R₃ = 4 Ω"] }),
        scene("step", "formula", "write_equation", "Ohmsches Gesetz", "Zwölf Volt durch vier Ohm: das sind drei Ampere.", { formula: "I_1 = \\frac{U_q}{R_\\text{ges}} = \\frac{12\\,\\mathrm{V}}{4\\,\\Omega} = 3\\,\\mathrm{A}", bullets: ["R_ges = R₁ + R₂₃ = 4 Ω"] }),
        scene("recap", "recap", "check_recap", "Merke", "Merke dir diese drei Punkte für morgen.", { bullets: ["Erst zusammenfassen, dann rechnen", "Gleiche Widerstände parallel: die Hälfte", "Immer die Einheit prüfen"] }),
      ],
    },
  },
  de2: {
    lang: "de",
    professor: "genius",
    docs: [{ title: "Thermodynamik_1_Skript", kind: "vorlesung", pages: 168 }, { title: "Übungsblatt_05_Kreisprozesse", kind: "uebung", pages: 4 }],
    question: "Übungsblatt 5, Aufgabe 3: Carnot-Prozess zwischen 600 K und 300 K, zugeführte Wärme 100 kJ. Wirkungsgrad und p-V-Diagramm?",
    answer: [
      '[[TAFEL schritt="Gegeben"]]',
      "Carnot-Prozess mit idealem Gas ($\\kappa = 1{,}4$): zwei Isothermen, zwei Adiabaten.",
      "",
      "| Größe | Wert |",
      "|---|---|",
      "| $T_H$ | 600 K |",
      "| $T_K$ | 300 K |",
      "| $Q_\\text{zu}$ | 100 kJ |",
      "[[/TAFEL]]",
      "[[REASONING]]",
      "@@STEP: p-V-Diagramm",
      fence("chart", carnot),
      "@@STEP: Wirkungsgrad",
      "$$\\eta_C = 1 - \\frac{T_K}{T_H} = 1 - \\frac{300\\,\\mathrm{K}}{600\\,\\mathrm{K}} = 0{,}5$$",
      "@@STEP: Ergebnis",
      "$$|W| = \\eta_C \\cdot Q_\\text{zu} = 50\\,\\mathrm{kJ} \\qquad |Q_\\text{ab}| = Q_\\text{zu} - |W| = 50\\,\\mathrm{kJ}$$",
      "[[/REASONING]]",
      '[[TAFEL schritt="Kontrolle"]]',
      "Die eingeschlossene Fläche im p-V-Diagramm ist die Nutzarbeit. Kein realer Prozess zwischen diesen Temperaturen kommt über $\\eta_C = 50\\,\\%$.",
      "[[/TAFEL]]",
    ].join("\n"),
  },
  de3: {
    lang: "en",
    professor: "maverick",
    docs: [{ title: "Werkstoffkunde_1_Skript", kind: "vorlesung", pages: 210 }],
    question: "My German script keeps saying Streckgrenze and Zugfestigkeit. What do they mean, and where are they on the curve?",
    answer: [
      '[[TAFEL schritt="The concept"]]',
      "Your script says (S. 88): *„Bis zur Streckgrenze verformt sich der Werkstoff elastisch.“*",
      "",
      "In plain English: up to the **yield strength**, steel springs back. Beyond it, the deformation stays.",
      "[[/TAFEL]]",
      "[[REASONING]]",
      "@@STEP: The curve from your script",
      fence("chart", stressStrain),
      "@@STEP: Hooke's law (Hookesches Gesetz)",
      "$$\\sigma = E \\cdot \\varepsilon \\qquad \\varepsilon_e = \\frac{R_e}{E} = \\frac{235\\,\\mathrm{MPa}}{210\\,000\\,\\mathrm{MPa}} \\approx 0.11\\,\\%$$",
      "[[/REASONING]]",
      '[[TAFEL schritt="Your professor\'s words"]]',
      "| In your script | Meaning | Symbol |",
      "|---|---|---|",
      "| Streckgrenze | yield strength | $R_e$ |",
      "| Zugfestigkeit | tensile strength | $R_m$ |",
      "| Bruchdehnung | elongation at fracture | $A$ |",
      "| E-Modul | Young's modulus | $E$ |",
      "[[/TAFEL]]",
    ].join("\n"),
    lesson: {
      title: "Streckgrenze and Zugfestigkeit, explained",
      language: "en",
      sourceTitle: "Werkstoffkunde_1_Skript",
      scenes: [
        scene("hook", "question", "ask_question", "When does steel stop springing back?", "When does a steel bar stop springing back to its old shape?", { sourceKind: "analogy" }),
        scene("step", "highlight", "highlight_text", "What your script says", "Your script says: up to the Streckgrenze, the material deforms elastically.", { quote: "Bis zur Streckgrenze verformt sich der Werkstoff elastisch.", keywords: ["Streckgrenze", "elastisch"] }),
        scene("step", "flowchart", "draw_flowchart", "Along the curve", "We follow the curve: elastic, yielding, hardening, and finally fracture.", { steps: ["Elastic", "Yield strength", "Tensile strength", "Fracture"] }),
        scene("step", "formula", "write_equation", "Hooke's law", "In the elastic part, stress is simply Young's modulus times strain.", { formula: "\\sigma = E \\cdot \\varepsilon", bullets: ["Streckgrenze = yield strength"] }),
        scene("recap", "recap", "check_recap", "Remember", "Remember these three points.", { bullets: ["Streckgrenze: the end of elastic behaviour", "Zugfestigkeit: the highest stress", "Bruchdehnung: strain at fracture"] }),
      ],
    },
  },
};


// ── Série B, « The Universal Brain » : Droit, Médecine, Ingénierie ───────
// Pression du ventricule gauche et de l'aorte sur un battement (valeurs de manuel, mmHg).
const heart = (title, lv, ao) => ({
  type: "line", title, xLabel: "t [s]", yLabel: "p [mmHg]",
  series: [
    { label: lv, data: [[0, 8], [0.05, 10], [0.1, 80], [0.15, 110], [0.25, 120], [0.32, 100], [0.38, 15], [0.45, 5], [0.6, 7], [0.8, 8]].map(([x, y]) => ({ x, y })) },
    { label: ao, data: [[0, 85], [0.1, 80], [0.15, 110], [0.25, 120], [0.32, 100], [0.4, 95], [0.6, 88], [0.8, 82]].map(([x, y]) => ({ x, y })) },
  ],
});
const FLOW_DE = "```mermaid\ngraph LR\n  A[Objektiver Tatbestand] --> B[Subjektiver Tatbestand] --> C[Rechtswidrigkeit] --> D[Schuld] --> E[Strafbarkeit]\n```";
const FLOW_EN = "```mermaid\ngraph LR\n  A[Objective elements] --> B[Subjective elements] --> C[Unlawfulness] --> D[Guilt] --> E[Criminal liability]\n```";

Object.assign(SCENARIOS, {
  lawde: {
    lang: "de", professor: "examiner", boardOnly: true,
    docs: [{ title: "Strafrecht_BT_Skript", kind: "vorlesung", pages: 190 }],
    question: "Fall 3 aus dem Skript: A nimmt das Fahrrad des B mit, um es zu verkaufen. Strafbar nach § 242 StGB?",
    answer: [
      '[[TAFEL schritt="Sachverhalt"]]', "A nimmt das unverschlossene Fahrrad des B vom Hof mit, um es zu verkaufen. Wir prüfen **§ 242 Abs. 1 StGB** im Gutachtenstil.", "", FLOW_DE, "[[/TAFEL]]",
      "[[REASONING]]",
      "@@STEP: Objektiver Tatbestand", "| Merkmal | Subsumtion |", "|---|---|", "| fremde bewegliche Sache | das Fahrrad gehört B ✓ |", "| Wegnahme | Bruch fremden, Begründung neuen Gewahrsams ✓ |",
      "@@STEP: Subjektiver Tatbestand", "| Merkmal | Subsumtion |", "|---|---|", "| Vorsatz | A weiß, dass das Rad B gehört ✓ |", "| Zueignungsabsicht | Verkauf: Aneignung und dauernde Enteignung ✓ |",
      "@@STEP: Ergebnis", "Rechtswidrigkeit und Schuld liegen vor. **A ist strafbar wegen Diebstahls, § 242 Abs. 1 StGB.**",
      "[[/REASONING]]",
    ].join("\n"),
  },
  lawen: {
    lang: "en", professor: "examiner", boardOnly: true,
    docs: [{ title: "Criminal_Law_Case_Studies", kind: "vorlesung", pages: 190 }],
    question: "Case 3 from my notes: A takes B's bicycle in order to sell it. Is that theft under § 242 StGB?",
    answer: [
      '[[TAFEL schritt="The facts"]]', "A takes B's unlocked bicycle from the yard in order to sell it. We test **§ 242 (1) StGB** step by step.", "", FLOW_EN, "[[/TAFEL]]",
      "[[REASONING]]",
      "@@STEP: Objective elements", "| Element | Applied to the case |", "|---|---|", "| movable property of another | the bicycle belongs to B ✓ |", "| taking away | A breaks B's custody and establishes his own ✓ |",
      "@@STEP: Subjective elements", "| Element | Applied to the case |", "|---|---|", "| intent | A knows the bicycle is B's ✓ |", "| intent to appropriate | selling it: appropriation and permanent deprivation ✓ |",
      "@@STEP: Result", "Unlawfulness and guilt are given. **A is liable for theft under § 242 (1) StGB.**",
      "[[/REASONING]]",
    ].join("\n"),
  },
  medde: {
    lang: "de", professor: "sensei", boardOnly: true,
    docs: [{ title: "Physiologie_Herz_Kreislauf", kind: "vorlesung", pages: 96 }],
    question: "Erkläre mir den Herzzyklus: Was passiert in Systole und Diastole?",
    answer: [
      '[[TAFEL schritt="Überblick"]]', "Ein Herzschlag hat **vier Phasen**. Die Klappen öffnen und schließen allein durch den Druck.", "",
      "| Phase | Klappen | Was passiert |", "|---|---|---|", "| Anspannung | alle geschlossen | Druck steigt, Volumen bleibt |", "| Austreibung | Taschenklappen offen | Blut strömt in die Aorta |", "| Entspannung | alle geschlossen | Druck fällt |", "| Füllung | Segelklappen offen | der Ventrikel füllt sich |",
      "[[/TAFEL]]",
      "[[REASONING]]",
      "@@STEP: Druckverlauf im linken Ventrikel", fence("chart", heart("Druck im linken Herzen", "linker Ventrikel", "Aorta")),
      "@@STEP: Herzzeitvolumen", "$$HZV = SV \\cdot HF = 70\\,\\mathrm{ml} \\cdot 70\\,\\mathrm{min^{-1}} \\approx 4{,}9\\,\\mathrm{l/min}$$",
      "[[/REASONING]]",
    ].join("\n"),
  },
  meden: {
    lang: "en", professor: "sensei", boardOnly: true,
    docs: [{ title: "Physiology_Heart_and_Circulation", kind: "vorlesung", pages: 96 }],
    question: "Explain the cardiac cycle: what happens in systole and diastole?",
    answer: [
      '[[TAFEL schritt="Overview"]]', "One heartbeat has **four phases**. The valves open and close by pressure alone.", "",
      "| Phase | Valves | What happens |", "|---|---|---|", "| Isovolumetric contraction | all closed | pressure rises, volume stays |", "| Ejection | semilunar valves open | blood flows into the aorta |", "| Isovolumetric relaxation | all closed | pressure falls |", "| Filling | AV valves open | the ventricle fills |",
      "[[/TAFEL]]",
      "[[REASONING]]",
      "@@STEP: Pressure in the left ventricle", fence("chart", heart("Pressure in the left heart", "left ventricle", "aorta")),
      "@@STEP: Cardiac output", "$$CO = SV \\cdot HR = 70\\,\\mathrm{ml} \\cdot 70\\,\\mathrm{min^{-1}} \\approx 4.9\\,\\mathrm{l/min}$$",
      "[[/REASONING]]",
    ].join("\n"),
  },
  circen: {
    lang: "en", professor: "genius", boardOnly: true,
    docs: [{ title: "Electrical_Engineering_1_Notes", kind: "vorlesung", pages: 142 }],
    question: "Problem 2: what is the total current I₁, and how do I get there?",
    answer: [
      '[[TAFEL schritt="Problem 2 · DC network"]]', "A source $U_q = 12\\,\\mathrm{V}$ feeds $R_1 = 2\\,\\Omega$ in series with the parallel pair $R_2 \\parallel R_3$, $R_2 = R_3 = 4\\,\\Omega$.", "", CIRCUIT, "[[/TAFEL]]",
      "[[REASONING]]",
      "@@STEP: Equivalent resistance", "$$R_{23} = \\frac{R_2\\,R_3}{R_2 + R_3} = 2\\,\\Omega \\qquad R_\\text{tot} = R_1 + R_{23} = 4\\,\\Omega$$",
      "@@STEP: Ohm's law", "$$I_1 = \\frac{U_q}{R_\\text{tot}}$$",
      "@@STEP: Result", "$$I_1 = \\frac{12\\,\\mathrm{V}}{4\\,\\Omega} = 3\\,\\mathrm{A}$$",
      "[[/REASONING]]",
    ].join("\n"),
  },
});

/* ── La vidéo explicative simulée (forme exacte de GET /api/video/:id) ── */

const SCENE_MS = 3400;
function lessonPayload(id, professor, lesson) {
  const words = [];
  lesson.scenes.forEach((sc, i) => {
    const list = sc.voiceover.split(/\s+/);
    const each = (SCENE_MS - 400) / list.length;
    list.forEach((text, k) => words.push({ text, startMs: Math.round(i * SCENE_MS + 150 + k * each), endMs: Math.round(i * SCENE_MS + 150 + (k + 0.85) * each) }));
  });
  return {
    id, status: "done", title: lesson.title, language: lesson.language, durationMs: lesson.scenes.length * SCENE_MS + 600, saved: false, createdAt: new Date().toISOString(),
    audioUrl: `/api/video/${id}/audio`,
    scenes: lesson.scenes.map((sc) => ({ ...sc, sourceTitle: sc.sourceKind === "analogy" ? "" : lesson.sourceTitle })),
    words, sceneStartsMs: lesson.scenes.map((_, i) => i * SCENE_MS), professor, beam: null, backdrop: null,
  };
}

/* ── Base de test : l'étudiante, ses documents ────────────────────────── */

function prepareDb(sc, withDocs) {
  const db = new Database(DB);
  const u = db.query("select id from user where email='demo@tred.test'").get();
  db.run("update user_access set role='user', professor_id=?, locale=? where user_id=?", [sc.professor, sc.lang, u.id]);
  for (const t of ["document", "flashcard", "misconception", "chat_message", "chat_conversation", "usage_counter"]) {
    try { db.run(`delete from ${t} where user_id=?`, [u.id]); } catch { /* table sans user_id : on laisse */ }
  }
  if (withDocs) {
    sc.docs.forEach((d, i) => {
      db.run("insert into document (id, user_id, visibility, title, kind, text_content, page_count, char_count, created_at) values (?,?,?,?,?,?,?,?,?)", [`cine_${i}`, u.id, "private", d.title, d.kind, `${d.title}\n`, d.pages, d.pages * 2100, Math.floor(Date.now() / 1000) - i * 60]);
    });
  }
  db.close();
}

/* ── Prises de vue ────────────────────────────────────────────────────── */

const sse = (o) => `data: ${JSON.stringify(o)}\n\n`;
function stream(text, step = 28) {
  const out = [sse({ type: "start" }), sse({ type: "start-step" }), sse({ type: "text-start", id: "t1" })];
  for (let i = 0; i < text.length; i += step) out.push(sse({ type: "text-delta", id: "t1", delta: text.slice(i, i + step) }));
  out.push(sse({ type: "text-end", id: "t1" }), sse({ type: "finish-step" }), sse({ type: "finish" }), "data: [DONE]\n\n");
  return out.join("");
}

async function run(browser, id) {
  const sc = SCENARIOS[id];
  const report = { id, rects: {} };
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE, locale: sc.lang === "de" ? "de-DE" : "en-GB", timezoneId: "Europe/Berlin" });
  await ctx.addInitScript(({ lang, dark }) => {
    localStorage.setItem("tred-analytics-consent", "denied");
    localStorage.setItem("tred-professor-autospeak", "0");
    // Le guide de première visite est déjà vu : en fenêtre étroite il revenait par-dessus le tableau.
    localStorage.setItem("tred.guide.v1", new Date().toISOString());
    localStorage.setItem("aerostudy-locale", JSON.stringify({ state: { locale: lang }, version: 0 }));
    if (dark) {
      localStorage.setItem("aerostudy-theme", JSON.stringify({ state: { theme: "dark" }, version: 1 }));
      localStorage.setItem("tred-board-theme", JSON.stringify({ state: { theme: "dark", custom: null }, version: 0 }));
    }
  }, { lang: sc.lang, dark: DARK });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message.slice(0, 140)));
  const boardOnly = BOARD_ONLY || sc.boardOnly;
  const shot = async (name) => p.screenshot({ path: `${OUT}${DARK ? "dk-" : ""}${id}-${name}.jpg`, type: "jpeg", quality: 86 });
  const rect = async (name, locator) => {
    const b = await locator.first().boundingBox().catch(() => null);
    if (b) report.rects[name] = [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
  };
  const skip = async () => {
    const s = p.getByText(/Überspringen|^Skip/).first();
    if (await s.isVisible().catch(() => false)) await s.click();
  };

  // La vidéo explicative : étapes « script » → « voice » → « done », à la demande.
  const vid = `gv_cine_${id}`;
  let videoStep = "script";
  await p.route("**/api/video/generate", (route) => route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ id: vid, status: "pending" }) }));
  await p.route(`**/api/video/${vid}`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(videoStep === "done" && sc.lesson ? lessonPayload(vid, sc.professor, sc.lesson) : { id: vid, status: videoStep }) }));
  await p.route(`**/api/video/${vid}/audio`, (route) => route.fulfill({ status: 200, contentType: "audio/mpeg", body: readFileSync(AUDIO) }));
  await p.route(`**/api/video/${vid}/save`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  // Le serveur local n'a pas de clé de modèle : le bouton vidéo y est masqué.
  // On l'affiche comme en production (le reste de /api/config est inchangé).
  await p.route("**/api/config", async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({ response: res, json: { ...body, features: { ...body.features, explainerVideo: true } } });
  });
  // Le tuteur : la réponse simulée, retenue jusqu'à `release()`.
  let release;
  const gate = new Promise((r) => (release = r));
  await p.route("**/api/agent/messages", async (route) => {
    await gate;
    await route.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" }, body: stream(sc.answer) });
  });

  await p.request.post(`${B}/api/auth/sign-in/email`, { headers: { Origin: B, "Content-Type": "application/json" }, data: { email: "demo@tred.test", password: PASSWORD } });

  // 1. Tableau de bord : avant, puis après l'import des documents.
  if (!boardOnly) {
    prepareDb(sc, false);
    await p.goto(`${B}/dashboard`, { waitUntil: "networkidle" });
    await skip();
    await p.waitForTimeout(1200);
    await rect("import", p.getByRole("button", { name: /Dokumente importieren|Import documents/ }));
    await shot("dash0");
  }
  prepareDb(sc, true);
  if (!boardOnly) {
    await p.reload({ waitUntil: "networkidle" });
    await skip();
    await p.waitForTimeout(1200);
    await rect("docs", p.getByText(sc.docs[0].title).first());
    await shot("dash1");
  }

  // 2. Hörsaal : tableau vide, question, attente, écriture.
  await p.goto(`${B}/chat`, { waitUntil: "networkidle" });
  await skip();
  await p.getByRole("button", { name: /Neuer Chat|New chat/ }).first().click().catch(() => {});
  await p.waitForTimeout(900);
  const box = p.locator('[data-slot="chat-composer"] textarea, textarea').first();
  await rect("composer", box);
  await rect("send", p.getByRole("button", { name: /^Senden$|^Send$/ }));
  await rect("board", p.locator('[data-slot="tafel-board"]'));
  await rect("professor", p.locator('[data-slot="avatar"], [data-slot="professor"]'));
  await shot("board0");
  await box.fill(sc.question);
  await p.waitForTimeout(300);
  await shot("typed");
  await box.press("Enter");
  await p.waitForTimeout(1100);
  await shot("wait");
  release();
  // Le tableau s'écrit (et les schémas se dessinent) : on attend qu'il soit complet.
  await p.waitForTimeout(9000);
  const board = p.locator('[data-slot="tafel-board"]');
  const scrollH = await board.evaluate((el) => [el.scrollHeight, el.clientHeight]).catch(() => [0, 0]);
  report.scroll = scrollH;
  // Le tableau, de haut en bas, par paliers.
  const steps = Math.max(1, Math.min(5, Math.ceil((scrollH[0] - scrollH[1]) / 430)));
  for (let i = 0; i <= steps; i++) {
    await board.evaluate((el, y) => el.scrollTo({ top: y }), Math.round(((scrollH[0] - scrollH[1]) * i) / steps)).catch(() => {});
    await p.waitForTimeout(500);
    await shot(`page${i}`);
  }
  report.pages = steps + 1;

  // 3. « Als Video erklären ».
  if (sc.lesson) {
    const chip = p.getByRole("button", { name: /Als Video erklären|Explain as video/ }).first();
    await chip.scrollIntoViewIfNeeded().catch(() => {});
    await p.waitForTimeout(500);
    await rect("chip", chip);
    await shot("chip");
    await chip.click();
    await p.waitForTimeout(2300);
    await shot("gen-script");
    videoStep = "voice";
    await p.waitForTimeout(2300);
    await shot("gen-voice");
    videoStep = "done";
    await p.waitForTimeout(3200);
    await rect("player", p.locator(".__remotion-player, [class*='remotion']"));
    await rect("save", p.getByRole("button", { name: /Im Dashboard speichern|Save to dashboard|dashboard/i }));
    await shot("player00");
    // Le lecteur ne démarre pas toujours seul : on survole (les commandes
    // apparaissent), on lance la lecture, puis on écarte la souris.
    await p.mouse.move(960, 540);
    await p.waitForTimeout(400);
    const play = p.getByRole("button", { name: /Wiedergabe|Abspielen|Play/ }).first();
    report.play = await play.isVisible().catch(() => false);
    if (report.play) await play.click().catch(() => {});
    await p.mouse.move(120, 1040);
    await p.waitForTimeout(500);
    for (let i = 1; i <= 16; i++) {
      await p.waitForTimeout(820);
      await shot(`player${String(i).padStart(2, "0")}`);
    }
  }
  report.errors = errors.slice(0, 4);
  console.log(JSON.stringify(report));
  await ctx.close();
}

const asked = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ids = asked.length ? asked : Object.keys(SCENARIOS);
const browser = await chromium.launch({ channel: "msedge" });
for (const id of ids) await run(browser, id);
await browser.close();
