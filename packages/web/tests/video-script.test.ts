import { describe, expect, test } from "bun:test";
import { langOf } from "../src/api/lib/languages";
import {
  MAX_VOICE_WORDS,
  alignmentToWords,
  buildVideoPrompt,
  QUOTE_SUPPORT_MIN,
  extractNumbers,
  indexSource,
  normalizeText,
  quoteSupport,
  quoteTokens,
  sceneStartsMs,
  validateVideoScript,
  videoDurationMs,
  videoRequestSchema,
  type VideoScene,
  type VideoSource,
} from "../src/api/lib/video-script";

const SOURCES: VideoSource[] = [
  {
    title: "TM2_Skript.pdf",
    content:
      "Balken auf zwei Lagern. Bei einer Gleichstreckenlast q über die Länge l tragen beide Lager die Last zu gleichen Teilen: A = B = q·l/2. " +
      "Beispiel: q = 2 kN/m und l = 4 m ergeben A = B = 4 kN. Das maximale Biegemoment liegt in der Feldmitte und beträgt M = q·l²/8.",
  },
  { title: "Formelsammlung.pdf", content: "Die Biegespannung berechnet sich aus Sigma gleich M durch W. Zulässig sind 235 N/mm² für S235." },
];

const voice = (n: number) => Array.from({ length: n }, () => "wort").join(" ");

const scene = (over: Partial<VideoScene> = {}): VideoScene => ({
  heading: "Lagerkräfte",
  bullets: ["Beide Lager teilen die Last"],
  formula: String.raw`A = B = \frac{q\,l}{2}`,
  sourceIndex: 1,
  quote: "tragen beide Lager die Last zu gleichen Teilen",
  voiceover: voice(30),
  ...over,
});

describe("validateVideoScript — zéro invention", () => {
  test("garde une scène dont la citation est mot pour mot dans l'extrait", () => {
    const r = validateVideoScript({ title: "Lagerkräfte", scenes: [scene(), scene({ heading: "Beispiel", quote: "q = 2 kN/m und l = 4 m ergeben A = B = 4 kN" })] }, SOURCES);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.scenes).toHaveLength(2);
      expect(r.scenes[0]!.sourceTitle).toBe("TM2_Skript.pdf");
      expect(r.words).toBe(60);
    }
  });

  test("la citation tolère la casse, les espaces et la typographie", () => {
    const r = validateVideoScript({ title: "t", scenes: [scene({ quote: "  Tragen beide  Lager\ndie Last zu gleichen Teilen " }), scene()] }, SOURCES);
    expect(r.ok && r.scenes.length).toBe(2);
  });

  test("supprime une scène dont la citation est inventée ou reformulée", () => {
    const r = validateVideoScript({ title: "t", scenes: [scene({ quote: "die Lager teilen sich die Last gleichmäßig auf" }), scene(), scene()] }, SOURCES);
    expect(r.ok && r.scenes.length).toBe(2);
    expect(r.dropped).toEqual([{ index: 0, reason: "quote_not_in_source", detail: "0.00" }]);
  });

  test("supprime une citation traduite dans la langue de l'étudiant", () => {
    const r = validateVideoScript({ title: "t", scenes: [scene({ quote: "les deux appuis portent la charge à parts égales" }), scene(), scene()] }, SOURCES);
    expect(r.dropped[0]?.reason).toBe("quote_not_in_source");
  });

  test("des mots du cours dans le désordre ne font pas une citation", () => {
    const r = validateVideoScript({ title: "t", scenes: [scene({ quote: "Teilen gleichen Last Lager beide tragen die zu" }), scene(), scene()] }, SOURCES);
    expect(r.dropped[0]?.reason).toBe("quote_not_in_source");
  });

  test("supprime une scène qui cite un extrait qui n'existe pas", () => {
    const r = validateVideoScript({ title: "t", scenes: [scene({ sourceIndex: 7 }), scene(), scene()] }, SOURCES);
    expect(r.dropped[0]).toEqual({ index: 0, reason: "unknown_source" });
  });

  test("supprime une scène dont un nombre n'est dans aucun extrait", () => {
    const r = validateVideoScript({ title: "t", scenes: [scene({ voiceover: `${voice(20)} das ergibt 12,5 Kilonewton` }), scene(), scene()] }, SOURCES);
    expect(r.dropped[0]).toEqual({ index: 0, reason: "number_not_in_sources", detail: "12.5" });
  });

  test("un nombre inventé dans la formule ou les points à l'écran est aussi rejeté", () => {
    const formula = validateVideoScript({ title: "t", scenes: [scene({ formula: String.raw`M = \frac{q\,l^2}{12}` }), scene(), scene()] }, SOURCES);
    expect(formula.dropped[0]?.reason).toBe("number_not_in_sources");
    const bullet = validateVideoScript({ title: "t", scenes: [scene({ bullets: ["Zulässig: 355 N/mm²"] }), scene(), scene()] }, SOURCES);
    expect(bullet.dropped[0]?.detail).toBe("355");
  });

  test("accepte les nombres des extraits, écrits avec une autre décimale", () => {
    const r = validateVideoScript({ title: "t", scenes: [scene({ voiceover: `${voice(20)} 235 und 4.0 Kilonewton`, quote: "Zulässig sind 235 N/mm² für S235", sourceIndex: 2 }), scene()] }, SOURCES);
    expect(r.ok && r.dropped.length).toBe(0);
  });

  test("accepte les nombres donnés par l'étudiant dans sa question", () => {
    const sc = scene({ voiceover: `${voice(20)} mit 17 Kilonewton` });
    expect(validateVideoScript({ title: "t", scenes: [sc, scene(), scene()] }, SOURCES).dropped).toHaveLength(1);
    expect(validateVideoScript({ title: "t", scenes: [sc, scene(), scene()] }, SOURCES, "Was passiert bei F = 17 kN?").dropped).toHaveLength(0);
  });

  test("un chiffre seul est structurel (exposant, « Schritt 2 »), pas une valeur inventée", () => {
    const r = validateVideoScript({ title: "t", scenes: [scene({ heading: "Schritt 3", formula: String.raw`M = \frac{q\,l^2}{8}` }), scene()] }, SOURCES);
    expect(r.ok && r.dropped.length).toBe(0);
  });

  test("refuse la vidéo quand il ne reste pas deux scènes prouvées", () => {
    const r = validateVideoScript({ title: "t", scenes: [scene({ quote: "rien de tout cela n'est dans le cours" }), scene()] }, SOURCES);
    expect(r).toMatchObject({ ok: false, error: "no_valid_scene" });
  });

  test("refuse une voix trop courte ou trop longue", () => {
    const short = validateVideoScript({ title: "t", scenes: [scene({ voiceover: voice(10) }), scene({ voiceover: voice(10) })] }, SOURCES);
    expect(short).toMatchObject({ ok: false, error: "too_short" });
    const long = validateVideoScript({ title: "t", scenes: [scene({ voiceover: voice(MAX_VOICE_WORDS) }), scene()] }, SOURCES);
    expect(long).toMatchObject({ ok: false, error: "too_long" });
  });

  test("sans aucun extrait, aucune scène ne passe", () => {
    expect(validateVideoScript({ title: "t", scenes: [scene(), scene()] }, [])).toMatchObject({ ok: false, error: "no_valid_scene" });
  });
});

describe("citations — le texte d'un PDF est abîmé, la citation reste vraie", () => {
  // Ce que l'extraction d'un PDF produit vraiment : coupures de ligne, mots coupés, espaces doubles, ligature.
  const PDF: VideoSource[] = [
    {
      title: "TM2_Skript.pdf",
      content:
        "3.2 Lagerreaktionen\n\nBei einer Gleich-\nstreckenlast  q über die  Länge l tragen beide\nLager die Last zu gleichen Teilen (vgl. Abb. 3.4).\nDie Auﬂagerkräfte ergeben sich aus dem Momenten-\ngleichgewicht um das Lager A.",
    },
  ];
  const src = indexSource(PDF[0]!.content);

  test("citation recopiée proprement d'un texte coupé par des fins de ligne", () => {
    expect(quoteSupport("Bei einer Gleichstreckenlast q über die Länge l tragen beide Lager die Last zu gleichen Teilen", src)).toBe(1);
    const r = validateVideoScript({ title: "t", scenes: [scene({ quote: "Bei einer Gleichstreckenlast q über die Länge l tragen beide Lager die Last zu gleichen Teilen" }), scene({ quote: "Die Auflagerkräfte ergeben sich aus dem Momentengleichgewicht um das Lager A." })] }, PDF);
    expect(r.ok && r.dropped.length).toBe(0);
  });

  test("ponctuation, parenthèses et guillemets ne comptent pas", () => {
    expect(quoteSupport("tragen beide Lager die Last zu gleichen Teilen, vgl. Abb. 3.4", src)).toBe(1);
  });

  test("une faute de frappe corrigée ou un mot sauté ne fait pas rejeter une vraie citation", () => {
    expect(quoteSupport("Bei einer Gleichstreckenlast q über die Länge l tragen beide Lager die Last zu gleichen Teilen vergleiche Abb. 3.4", src)).toBeGreaterThanOrEqual(QUOTE_SUPPORT_MIN);
    expect(quoteSupport("Bei einer Gleichstreckenlast über die Länge l tragen beide Lager die Last zu gleichen Teilen", src)).toBeGreaterThanOrEqual(QUOTE_SUPPORT_MIN);
  });

  test("une phrase inventée sur le même sujet reste sous le seuil", () => {
    expect(quoteSupport("Die Lagerkräfte eines Balkens sind immer gleich groß und betragen die Hälfte der Last", src)).toBeLessThan(0.2);
    expect(quoteSupport("Das maximale Moment liegt in der Mitte des Balkens", src)).toBeLessThan(0.2);
  });

  test("une citation de moins de quatre mots ne prouve rien", () => {
    expect(quoteSupport("die Last", src)).toBe(0);
  });

  test("quoteTokens recolle un mot coupé en fin de ligne et aplatit la ligature", () => {
    expect(quoteTokens("Momenten-\ngleichgewicht der Auﬂagerkräfte")).toEqual(["momentengleichgewicht", "der", "auflagerkräfte"]);
  });
});

describe("nombres et texte", () => {
  test("extractNumbers lit la virgule décimale et le point des milliers", () => {
    expect(extractNumbers("4,50 kN und 1.000 N, dazu 0,25 und 12")).toEqual(["4.5", "1", "1000", "0.25", "12"]);
  });
  test("normalizeText aplatit espaces, casse et guillemets", () => {
    expect(normalizeText("  „Balken“  auf\n ZWEI Lagern ")).toBe('"balken" auf zwei lagern');
  });
});

describe("buildVideoPrompt", () => {
  const p = buildVideoPrompt({ language: langOf("es"), sources: SOURCES, question: "¿Por qué A = B?", answer: "Weil …" });
  test("impose la langue de l'étudiant, en tête et en fin de prompt", () => {
    expect(p.system.startsWith(langOf("es").top)).toBe(true);
    expect(p.system.trimEnd().endsWith(langOf("es").bottom)).toBe(true);
    expect(p.system).toContain(langOf("es").label);
  });
  test("porte la règle de non-invention et numérote les extraits", () => {
    expect(p.system).toContain("UNIQUEMENT sur les extraits de cours fournis");
    expect(p.prompt).toContain("[S1] TM2_Skript.pdf");
    expect(p.prompt).toContain("[S2] Formelsammlung.pdf");
  });
  test("la réponse du tuteur est donnée comme contexte, pas comme source", () => {
    expect(p.prompt).toContain("ce n'est PAS une source");
  });
});

describe("requête", () => {
  test("la langue est obligatoire", () => {
    expect(videoRequestSchema.safeParse({ question: "x" }).success).toBe(false);
    expect(videoRequestSchema.safeParse({ question: "x", language: "fr" }).success).toBe(true);
  });
});

describe("durée et découpage : la voix décide", () => {
  const alignment = {
    characters: [..."Ja gut. Und nun"],
    character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.7],
    character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.1, 1.2, 1.3, 1.4, 1.6, 1.7, 1.9],
  };
  const words = alignmentToWords(alignment);
  test("les caractères horodatés deviennent des mots horodatés", () => {
    expect(words.map((w) => w.text)).toEqual(["Ja", "gut.", "Und", "nun"]);
    expect(words[1]).toEqual({ text: "gut.", startMs: 300, endMs: 700 });
  });
  test("la durée de la vidéo est celle de la voix, plus une marge", () => {
    expect(videoDurationMs(words)).toBe(1900 + 1500);
    expect(videoDurationMs([])).toBe(0);
  });
  test("chaque scène commence au premier mot de sa voix", () => {
    expect(sceneStartsMs([{ voiceover: "Ja gut." }, { voiceover: "Und nun" }], words)).toEqual([0, 1000]);
  });
});
