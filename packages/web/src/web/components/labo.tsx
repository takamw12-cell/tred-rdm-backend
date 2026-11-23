import { Suspense, lazy, useId, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import katex from "katex";
import "katex/dist/katex.min.css";
import { BookOpen, FlaskConical, Info, Loader2, RotateCcw, Search, ShieldCheck, Sparkles } from "lucide-react";
import { MarkdownContent } from "@/components/markdown-content";
import { PageContainer, PageHeader, Reveal } from "@/components/page";
import { documentsListOptions } from "@/queries/documents";
import { paywallFromResponse } from "@/lib/paywall";
import { useT } from "@/i18n";
import { clampInput, formatQuantity, sceneById, sliderToValue, valueToSlider, type SimInput } from "@/lib/sim-catalog";
import { computeGenerated, plotPoints, type GeneratedSim } from "@/lib/sim-generated";
import type { CheckStatus, FormulaCheck, SimulationDto } from "../../api/lib/simulation";

/**
 * Le Labo (/explorer?labo=1[&doc=<id>]) : une barre de recherche pour n'importe
 * quel concept, avec ou sans document (POST /api/simulate).
 *
 * Trois réponses possibles, et la pastille dit laquelle :
 *   - une loi du catalogue, égale à une loi de référence (« prouvé avec SymPy ») ;
 *   - une simulation GÉNÉRÉE pour un concept hors catalogue : syntaxe et unités
 *     contrôlées, mais aucune loi de référence — annoncée comme telle ;
 *   - une explication, quand le concept n'a pas de formule.
 */
const SimulationScene = lazy(() => import("@/components/SimulationScene"));

const TEXT = {
  de: {
    title: "Labo",
    subtitle: "Such ein Konzept, und ich baue dir eine interaktive Simulation dazu. Bei jeder steht, was geprüft wurde.",
    back: "Alle Modelle",
    document: "Dokument",
    choose: "Dokument wählen …",
    noDocs: "Noch keine Dokumente: Lade zuerst ein Skript oder Übungsblatt unter „Meine Kurse“ hoch.",
    existing: "Simulationen zu diesem Dokument",
    none: "Zu diesem Dokument gibt es noch keine Simulation.",
    concept: "Konzept",
    conceptHint: "z. B. Spannungsteiler",
    generate: "Simulation erzeugen",
    building: "Die KI baut die Simulation …",
    buildingHint: "Ich lese das Dokument, schreibe die Formeln ab und prüfe jede einzelne. Das dauert bis zu einer Minute.",
    noModel: "Für dieses Konzept gibt es noch kein geprüftes Modell, oder dein Dokument behandelt es nicht. Ich zeige lieber nichts als etwas Ungeprüftes.",
    rejected: "Die Simulation wurde verworfen: mindestens eine Formel hat die Prüfung nicht bestanden.",
    failed: "Das hat nicht geklappt. Versuch es bitte noch einmal.",
    noText: "Dieses Dokument enthält keinen lesbaren Text.",
    limit: "Für dieses Dokument sind schon 20 Simulationen gespeichert.",
    reset: "Zurücksetzen",
    results: "Berechnet",
    formulas: "Formeln aus deinem Dokument",
    page: "S.",
    proved: "Mit SymPy bewiesen",
    numeric: "Numerisch geprüft",
    provedHint: "SymPy hat gezeigt, dass jede Formel mit dem geprüften Gesetz übereinstimmt. Einheiten und Quelle sind geprüft.",
    numericHint: "Jede Formel stimmt auf 40 Wertesätzen mit dem geprüften Gesetz überein. Einheiten und Quelle sind geprüft.",
    notSaved: "Hinweis: Diese Simulation konnte nicht gespeichert werden.",
    search: "Suche ein Konzept: Normalspannung, Ableitung, Herzzeitvolumen …",
    noDocument: "Ohne Dokument",
    docHint: "Mit einem Dokument nimmt die Simulation die Formeln und Bezeichnungen aus deinem Kurs.",
    subjects: { eng: "Ingenieurwesen", med: "Medizin", math: "Mathe", cs: "Informatik" },
    generatedTitle: "Von der KI gebaut · Einheiten geprüft",
    generatedDoc: "Diese Simulation wurde gerade für dich gebaut. Geprüft: Schreibweise und Einheiten jeder Formel, und die Fundstelle in deinem Dokument. Nicht geprüft: ob die Formel fachlich vollständig ist. Sie ist nicht mit SymPy gegen ein Referenzgesetz bewiesen.",
    generatedNoDoc: "Diese Simulation wurde gerade für dich gebaut. Geprüft: Schreibweise und Einheiten jeder Formel. Sie stammt nicht aus deinen Unterlagen und ist nicht mit SymPy gegen ein Referenzgesetz bewiesen. Vergleiche sie mit deinem Skript.",
    notInDoc: "nicht in deinem Dokument gefunden",
    formulasGenerated: "Formeln",
    curve: "Verlauf",
    explanationTitle: "Erklärung von der KI",
    explanationHint: "Zu diesem Konzept gibt es keine Formel zum Simulieren. Die Erklärung ist von der KI geschrieben; nur die Zitate unten wurden in deinem Dokument gefunden.",
    explanationNoQuotes: "Zu diesem Konzept gibt es keine Formel zum Simulieren. Die Erklärung ist von der KI geschrieben und nicht aus deinen Unterlagen belegt.",
    quotes: "In deinem Dokument gefunden",
    docRequired: "Für dieses geprüfte Modell brauche ich ein Dokument: Wähle oben eines aus.",
    nothing: "Zu diesem Begriff konnte ich nichts Sinnvolles bauen. Versuch es mit einem engeren Begriff, zum Beispiel „Normalspannung im Zugstab“.",
    notKept: "Ohne Dokument wird diese Simulation nicht gespeichert.",
    scene: "3D-Simulation",
  },
  en: {
    title: "Lab",
    subtitle: "Search a concept and I build an interactive simulation for it. Each one states what was checked.",
    back: "All models",
    document: "Document",
    choose: "Choose a document …",
    noDocs: "No documents yet: first upload a script or exercise sheet under “My courses”.",
    existing: "Simulations for this document",
    none: "There is no simulation for this document yet.",
    concept: "Concept",
    conceptHint: "e.g. voltage divider",
    generate: "Generate simulation",
    building: "The AI is building the simulation …",
    buildingHint: "I read the document, copy the formulas and check each one. This takes up to a minute.",
    noModel: "There is no verified model for this concept yet, or your document does not cover it. I would rather show nothing than something unchecked.",
    rejected: "The simulation was discarded: at least one formula did not pass the check.",
    failed: "That did not work. Please try again.",
    noText: "This document has no readable text.",
    limit: "20 simulations are already stored for this document.",
    reset: "Reset",
    results: "Computed",
    formulas: "Formulas from your document",
    page: "p.",
    proved: "Proved with SymPy",
    numeric: "Checked numerically",
    provedHint: "SymPy showed that every formula equals the verified law. Units and source are checked.",
    numericHint: "Every formula equals the verified law on 40 sets of values. Units and source are checked.",
    notSaved: "Note: this simulation could not be saved.",
    search: "Search a concept: normal stress, derivative, cardiac output …",
    noDocument: "No document",
    docHint: "With a document, the simulation takes the formulas and names from your course.",
    subjects: { eng: "Engineering", med: "Medicine", math: "Maths", cs: "Computer science" },
    generatedTitle: "Built by AI · units checked",
    generatedDoc: "This simulation was just built for you. Checked: the syntax and units of every formula, and where it stands in your document. Not checked: whether the formula is complete. It is not proved with SymPy against a reference law.",
    generatedNoDoc: "This simulation was just built for you. Checked: the syntax and units of every formula. It does not come from your material and is not proved with SymPy against a reference law. Compare it with your notes.",
    notInDoc: "not found in your document",
    formulasGenerated: "Formulas",
    curve: "Curve",
    explanationTitle: "Explanation by AI",
    explanationHint: "This concept has no formula to simulate. The explanation is written by AI; only the quotes below were found in your document.",
    explanationNoQuotes: "This concept has no formula to simulate. The explanation is written by AI and is not backed by your material.",
    quotes: "Found in your document",
    docRequired: "This verified model needs a document: choose one above.",
    nothing: "I could not build anything useful for this term. Try a narrower one, for example “normal stress in a tension rod”.",
    notKept: "Without a document, this simulation is not saved.",
    scene: "3D simulation",
  },
  fr: {
    title: "Labo",
    subtitle: "Cherche un concept, je construis une simulation interactive. Chacune dit ce qui a été vérifié.",
    back: "Tous les modèles",
    document: "Document",
    choose: "Choisis un document …",
    noDocs: "Aucun document : dépose d'abord un cours ou une feuille d'exercices dans « Mes cours ».",
    existing: "Simulations de ce document",
    none: "Ce document n'a pas encore de simulation.",
    concept: "Concept",
    conceptHint: "p. ex. diviseur de tension",
    generate: "Générer une simulation",
    building: "L'IA construit la simulation …",
    buildingHint: "Je lis le document, je recopie les formules et je vérifie chacune. Cela prend jusqu'à une minute.",
    noModel: "Il n'existe pas encore de modèle vérifié pour ce concept, ou ton document n'en parle pas. Je préfère ne rien montrer plutôt qu'une chose non vérifiée.",
    rejected: "La simulation a été rejetée : au moins une formule n'a pas passé la vérification.",
    failed: "Cela n'a pas marché. Réessaie.",
    noText: "Ce document ne contient pas de texte lisible.",
    limit: "Ce document a déjà 20 simulations enregistrées.",
    reset: "Réinitialiser",
    results: "Calculé",
    formulas: "Formules de ton document",
    page: "p.",
    proved: "Prouvé avec SymPy",
    numeric: "Vérifié numériquement",
    provedHint: "SymPy a montré que chaque formule est égale à la loi vérifiée. Les unités et la source sont vérifiées.",
    numericHint: "Chaque formule est égale à la loi vérifiée sur 40 jeux de valeurs. Les unités et la source sont vérifiées.",
    notSaved: "Note : cette simulation n'a pas pu être enregistrée.",
    search: "Cherche un concept : contrainte normale, dérivée, débit cardiaque …",
    noDocument: "Sans document",
    docHint: "Avec un document, la simulation reprend les formules et les notations de ton cours.",
    subjects: { eng: "Ingénierie", med: "Médecine", math: "Maths", cs: "Informatique" },
    generatedTitle: "Construit par l'IA · unités vérifiées",
    generatedDoc: "Cette simulation vient d'être construite pour toi. Vérifié : l'écriture et les unités de chaque formule, et sa place dans ton document. Non vérifié : que la formule soit complète. Elle n'est pas prouvée avec SymPy contre une loi de référence.",
    generatedNoDoc: "Cette simulation vient d'être construite pour toi. Vérifié : l'écriture et les unités de chaque formule. Elle ne vient pas de tes documents et n'est pas prouvée avec SymPy contre une loi de référence. Compare-la avec ton cours.",
    notInDoc: "introuvable dans ton document",
    formulasGenerated: "Formules",
    curve: "Courbe",
    explanationTitle: "Explication par l'IA",
    explanationHint: "Ce concept n'a pas de formule à simuler. L'explication est écrite par l'IA ; seules les citations ci-dessous ont été retrouvées dans ton document.",
    explanationNoQuotes: "Ce concept n'a pas de formule à simuler. L'explication est écrite par l'IA et n'est pas appuyée par tes documents.",
    quotes: "Retrouvé dans ton document",
    docRequired: "Ce modèle vérifié a besoin d'un document : choisis-en un ci-dessus.",
    nothing: "Je n'ai rien pu construire d'utile pour ce terme. Essaie un terme plus précis, par exemple « contrainte normale dans une barre ».",
    notKept: "Sans document, cette simulation n'est pas gardée.",
    scene: "Simulation 3D",
  },
} as const;
type Text = (typeof TEXT)[keyof typeof TEXT];

/** Les suggestions rapides, par filière. Les trois premières lignes d'ingénierie sont des lois du catalogue. */
const SUGGESTIONS: Record<"eng" | "med" | "math" | "cs", Record<Lang, string[]>> = {
  eng: { de: ["Normalspannung", "Spannungsteiler", "Hebelgesetz", "Federpendel", "Hookesches Gesetz"], en: ["Normal stress", "Voltage divider", "Law of the lever", "Mass on a spring", "Hooke's law"], fr: ["Contrainte normale", "Diviseur de tension", "Loi du levier", "Masse-ressort", "Loi de Hooke"] },
  med: { de: ["Herzzeitvolumen", "Body-Mass-Index", "Halbwertszeit eines Medikaments"], en: ["Cardiac output", "Body mass index", "Drug half-life"], fr: ["Débit cardiaque", "Indice de masse corporelle", "Demi-vie d'un médicament"] },
  math: { de: ["Satz des Pythagoras", "Zinseszins", "Kreisfläche"], en: ["Pythagorean theorem", "Compound interest", "Area of a circle"], fr: ["Théorème de Pythagore", "Intérêts composés", "Aire d'un disque"] },
  cs: { de: ["Amdahlsches Gesetz", "Binäre Suche", "Datenübertragungsrate"], en: ["Amdahl's law", "Binary search", "Data transfer rate"], fr: ["Loi d'Amdahl", "Recherche dichotomique", "Débit de données"] },
};

const WHY: Record<CheckStatus, { de: string; en: string; fr: string }> = {
  ok: { de: "in Ordnung", en: "passed", fr: "acceptée" },
  syntax: { de: "Ausdruck nicht lesbar", en: "expression not readable", fr: "expression illisible" },
  unknown_output: { de: "Größe unbekannt", en: "unknown quantity", fr: "grandeur inconnue" },
  units: { de: "Einheiten stimmen nicht", en: "units do not match", fr: "unités incohérentes" },
  not_reference: { de: "weicht vom geprüften Gesetz ab", en: "differs from the verified law", fr: "différente de la loi vérifiée" },
  disproved: { de: "von SymPy widerlegt", en: "disproved by SymPy", fr: "réfutée par SymPy" },
  no_source: { de: "Zitat nicht im Dokument gefunden", en: "quote not found in the document", fr: "citation introuvable dans le document" },
  conversion: { de: "Umrechnungsfaktor doppelt", en: "unit factor applied twice", fr: "facteur d'unités compté deux fois" },
};

type Lang = "de" | "en" | "fr";
type Failure = { kind: "noModel" | "rejected" | "failed" | "noText" | "limit" | "docRequired" | "nothing"; checks: FormulaCheck[] };

/** « 3 chiffres + unité », sans préfixe : les unités d'une simulation générée sont celles que le cours emploie (MPa, mm², l/min). */
const plain = (value: number, unit: string) => (Number.isFinite(value) ? `${Number(value.toPrecision(3))}${unit ? ` ${unit}` : ""}` : "–");
const texUnit = (text: string) => text.replace(/ (.+)$/, "\\,\\mathrm{$1}").replace("Ω", "\\Omega").replace("µ", "\\mu ").replace(/·/g, "\\cdot ").replace(/²/g, "^2").replace(/³/g, "^3").replace(/°/g, "^\\circ").replace(/%/g, "\\%");

/** La courbe d'une grandeur calculée en fonction d'un curseur, avec le point courant. */
function Curve({ sim, values, outputs, title }: { sim: GeneratedSim; values: Record<string, number>; outputs: Record<string, number>; title: string }) {
  const points = plotPoints(sim, values);
  const x = sim.inputs.find((v) => v.symbol === sim.plot?.x);
  const y = sim.outputs.find((v) => v.symbol === sim.plot?.y);
  if (!x || !y || points.length < 2) return null;
  const ys = points.map((p) => p.y);
  const [lo, hi] = [Math.min(...ys), Math.max(...ys)];
  const W = 320;
  const H = 120;
  const px = (v: number) => 8 + ((v - x.min) / (x.max - x.min)) * (W - 16);
  const py = (v: number) => (hi > lo ? H - 10 - ((v - lo) / (hi - lo)) * (H - 20) : H / 2);
  return (
    <figure className="bg-secondary/60 m-0 rounded-xl p-3" data-testid="sim-curve">
      <figcaption className="text-muted-foreground mb-1 flex justify-between text-xs">
        <span>
          {title}: {y.label} ({y.unitLabel || "–"})
        </span>
        <span>
          {x.label} ({x.unitLabel || "–"})
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" aria-hidden="true">
        <polyline points={points.map((p) => `${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(" ")} fill="none" stroke="#38BDF8" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx={px(values[x.symbol]!)} cy={py(outputs[y.symbol]!)} r="5.5" fill="#F59E0B" stroke="#fff" strokeWidth="1.5" />
      </svg>
    </figure>
  );
}

function ExplanationView({ sim, text }: { sim: SimulationDto; text: Text }) {
  const e = sim.spec.explanation;
  if (!e) return null;
  return (
    <section className="bg-card rounded-2xl border p-4 shadow-sm sm:p-6" data-testid="explanation-view">
      <h2 className="text-xl font-bold tracking-tight">{e.title}</h2>
      <p className="text-muted-foreground mb-3 text-sm">{sim.concept}</p>
      <MarkdownContent content={e.markdown} />
      {e.quotes.length > 0 && (
        <div className="mt-4">
          <p className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">{text.quotes}</p>
          <ul className="space-y-2">
            {e.quotes.map((q, i) => (
              <li key={i} className="bg-secondary/60 rounded-xl border-l-4 border-l-[#34D399] px-3 py-2 text-sm">
                <span className="italic">„{q.text}“</span> <span className="text-muted-foreground text-xs whitespace-nowrap">· {text.page} {q.page}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#F59E0B]/50 bg-[#F59E0B]/10 p-3" data-testid="sim-verified" data-engine={sim.engine}>
        <Info className="mt-0.5 size-5 shrink-0 text-[#B45309] dark:text-[#FBBF24]" />
        <p className="text-sm">
          <span className="font-semibold">{text.explanationTitle}</span>
          <span className="text-muted-foreground block text-xs">{e.quotes.length > 0 ? text.explanationHint : text.explanationNoQuotes}</span>
        </p>
      </div>
    </section>
  );
}

function Tex({ tex }: { tex: string }) {
  const html = useMemo(() => katex.renderToString(tex, { displayMode: true, throwOnError: false, strict: false }), [tex]);
  return <div className="overflow-x-auto overflow-y-hidden [&_.katex-display]:my-0" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function SimulationView({ sim, text, lang }: { sim: SimulationDto; text: Text; lang: Lang }) {
  const uid = useId();
  const gen = sim.spec.scene === "generated" ? sim.spec.generated : undefined;
  const catalog = gen ? null : sceneById(sim.spec.scene);
  // Une simulation générée prend la même forme qu'une loi du catalogue : mêmes curseurs, même affichage.
  const scene = useMemo(
    () =>
      gen
        ? {
            id: "generated" as const,
            label: { de: gen.title, en: gen.title, fr: gen.title },
            inputs: gen.inputs.map((v): SimInput => ({ ...v, unit: "", label: { de: v.label, en: v.label, fr: v.label } })),
            outputs: gen.outputs.map((v) => ({ symbol: v.symbol, tex: v.tex, unitLabel: v.unitLabel, label: { de: v.label, en: v.label, fr: v.label } })),
            compute: (v: Record<string, number>) => computeGenerated(gen, v),
          }
        : catalog,
    [gen, catalog],
  );
  const start = useMemo(() => Object.fromEntries((scene?.inputs ?? []).map((v) => [v.symbol, valueToSlider(v, clampInput(v, sim.spec.values[v.symbol]))])), [scene, sim.spec.values]);
  // L'état est la POSITION des curseurs (0…1) : la valeur s'en déduit, jamais l'inverse.
  // Le parent donne une `key` par simulation : une autre simulation repart de ses propres valeurs.
  const [pos, setPos] = useState<Record<string, number>>(start);
  if (sim.spec.scene === "explanation") return <ExplanationView sim={sim} text={text} />;
  if (!scene) return null;

  const values = Object.fromEntries(scene.inputs.map((v) => [v.symbol, sliderToValue(v, pos[v.symbol] ?? 0)]));
  const outputs = scene.compute(values);
  const proved = sim.engine === "sympy";
  const show = gen ? plain : formatQuantity;
  const formulas = gen ? gen.formulas : sim.spec.formulas;
  const sourced = gen ? gen.formulas.some((f) => f.page !== null) : true;
  const colors = ["#F59E0B", "#38BDF8", "#A78BFA", "#34D399"];

  return (
    <section className="bg-card rounded-2xl border p-4 shadow-sm sm:p-6" data-testid="simulation-view">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight">{scene.label[lang]}</h2>
          <p className="text-muted-foreground text-sm">{gen?.summary || sim.concept}</p>
        </div>
        <button type="button" onClick={() => setPos(start)} className="text-muted-foreground hover:text-foreground inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium">
          <RotateCcw className="size-4" />
          {text.reset}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Suspense fallback={<div className="grid aspect-[4/3] w-full place-items-center rounded-xl bg-[#0F172A]"><Loader2 className="size-6 animate-spin text-white/70" /></div>}>
          <div className="min-w-0 space-y-3">
            <SimulationScene scene={scene.id} generated={gen} values={values} outputs={outputs} label={`${text.scene}: ${scene.label[lang]}`} />
            {gen && <Curve sim={gen} values={values} outputs={outputs} title={text.curve} />}
          </div>
        </Suspense>

        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            {scene.inputs.map((v, i) => {
              const id = `${uid}-${v.symbol}`;
              return (
                <div key={v.symbol}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <label htmlFor={id} className="text-sm font-semibold">
                      {v.label[lang]}
                    </label>
                    <output htmlFor={id} className="text-base font-bold tabular-nums" data-testid={`sim-value-${v.symbol}`}>
                      {show(values[v.symbol]!, v.unitLabel)}
                    </output>
                  </div>
                  <input id={id} type="range" min={0} max={1} step={0.005} value={pos[v.symbol] ?? 0} onChange={(e) => setPos((p) => ({ ...p, [v.symbol]: Number(e.target.value) }))} className="h-11 w-full cursor-pointer touch-pan-y" style={{ accentColor: v.color ?? colors[i % colors.length] }} data-testid={`sim-slider-${v.symbol}`} />
                </div>
              );
            })}
          </div>

          <div aria-live="polite" data-testid="sim-formulas">
            <p className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">{gen && !sourced ? text.formulasGenerated : text.formulas}</p>
            <div className="space-y-2">
              {formulas.map((f) => {
                const out = scene.outputs.find((o) => o.symbol === f.output)!;
                return (
                  <div key={f.output} className={`bg-secondary/60 rounded-xl border-l-4 px-3 py-2.5 ${f.page === null ? "border-l-[#F59E0B]" : "border-l-[#34D399]"}`}>
                    <div className="text-[0.8rem] sm:text-[0.95rem]">
                      <Tex tex={`${f.tex} = ${texUnit(show(outputs[f.output]!, out.unitLabel))}`} />
                    </div>
                    {f.page === null ? (
                      <p className="text-muted-foreground mt-1 text-xs">
                        {out.label[lang]}
                        {sim.documentId ? ` · ${text.notInDoc}` : ""}
                      </p>
                    ) : (
                      <details className="mt-1 text-xs">
                        <summary className="text-muted-foreground cursor-pointer">
                          {out.label[lang]} · {text.page} {f.page}
                        </summary>
                        <blockquote className="text-muted-foreground mt-1 border-l-2 pl-2 italic">{f.excerpt}</blockquote>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {gen ? (
            <div className="flex items-start gap-2 rounded-xl border border-[#F59E0B]/50 bg-[#F59E0B]/10 p-3" data-testid="sim-verified" data-engine={sim.engine}>
              <Sparkles className="mt-0.5 size-5 shrink-0 text-[#B45309] dark:text-[#FBBF24]" />
              <p className="text-sm">
                <span className="font-semibold">{text.generatedTitle}</span>
                <span className="text-muted-foreground block text-xs">{sourced ? text.generatedDoc : text.generatedNoDoc}</span>
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-xl border border-[#34D399]/50 bg-[#34D399]/10 p-3" data-testid="sim-verified" data-engine={sim.engine}>
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#047857] dark:text-[#34D399]" />
              <p className="text-sm">
                <span className="font-semibold">{proved ? text.proved : text.numeric}</span>
                <span className="text-muted-foreground block text-xs">{proved ? text.provedHint : text.numericHint}</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function Labo() {
  const { locale } = useT();
  const lang: Lang = locale === "de" || locale === "fr" ? locale : "en";
  const text = TEXT[lang];
  const params = new URLSearchParams(useSearch());
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { data: docs = [], isPending: docsPending } = useQuery(documentsListOptions());
  const docId = params.get("doc") ?? "";
  const [concept, setConcept] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [shownId, setShownId] = useState<string | null>(null);
  const [unsaved, setUnsaved] = useState<SimulationDto | null>(null);
  const [subject, setSubject] = useState<keyof typeof SUGGESTIONS>("eng");

  const listKey = ["simulate", docId];
  const { data: sims = [] } = useQuery({
    queryKey: listKey,
    enabled: !!docId,
    queryFn: async (): Promise<SimulationDto[]> => {
      const res = await fetch(`/api/simulate?documentId=${encodeURIComponent(docId)}`);
      if (!res.ok) return [];
      return ((await res.json()) as { simulations: SimulationDto[] }).simulations;
    },
  });
  const shown = (unsaved && unsaved.id === shownId ? unsaved : sims.find((s) => s.id === shownId)) ?? (docId ? (sims[0] ?? null) : null);

  const choose = (id: string) => {
    setFailure(null);
    setShownId(null);
    setUnsaved(null);
    navigate(id ? `/explorer?labo=1&doc=${encodeURIComponent(id)}` : "/explorer?labo=1");
  };

  const generate = async (asked = concept) => {
    if (asked.trim().length < 2 || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const res = await fetch("/api/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: docId, concept: asked }) });
      if (await paywallFromResponse(res, "exercise")) return;
      const body = (await res.json().catch(() => ({}))) as { simulation?: SimulationDto; saved?: boolean; error?: string; checks?: FormulaCheck[] };
      if (res.ok && body.simulation) {
        if (body.saved === false) setUnsaved(body.simulation);
        setShownId(body.simulation.id);
        await queryClient.invalidateQueries({ queryKey: listKey });
        return;
      }
      const kind = body.error === "DOCUMENT_REQUIRED" ? "docRequired" : body.error === "NOTHING_TO_SHOW" ? "nothing" : body.error === "NO_VERIFIED_MODEL" ? "noModel" : body.error === "VERIFICATION_FAILED" ? "rejected" : body.error === "NO_TEXT" ? "noText" : body.error === "LIMIT_REACHED" ? "limit" : "failed";
      setFailure({ kind, checks: body.checks ?? [] });
    } catch {
      setFailure({ kind: "failed", checks: [] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer className="max-w-6xl">
      <Link to="/explorer" className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-sm font-medium">
        ← {text.back}
      </Link>
      <PageHeader title={text.title} subtitle={text.subtitle} />

      <div className="bg-card mb-6 space-y-4 rounded-2xl border p-4 sm:p-6" data-testid="labo-controls">
        <div>
          <label htmlFor="labo-concept" className="sr-only">
            {text.concept}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2" />
              <input id="labo-concept" type="search" value={concept} onChange={(e) => setConcept(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void generate()} maxLength={120} placeholder={text.search} className="bg-background h-13 w-full rounded-xl border pr-3 pl-11 text-base" data-testid="labo-concept" />
            </div>
            <button type="button" onClick={() => void generate()} disabled={busy || concept.trim().length < 2} className="bg-primary text-primary-foreground inline-flex h-13 shrink-0 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold disabled:opacity-50" data-testid="labo-generate">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
              {text.generate}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" data-testid="labo-subjects">
            {(Object.keys(SUGGESTIONS) as (keyof typeof SUGGESTIONS)[]).map((key) => (
              <button key={key} type="button" role="tab" aria-selected={subject === key} onClick={() => setSubject(key)} className="aria-selected:bg-foreground aria-selected:text-background text-muted-foreground min-h-9 rounded-full border px-3 text-xs font-semibold">
                {text.subjects[key]}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5" data-testid="labo-suggestions">
            {SUGGESTIONS[subject][lang].map((label) => (
              <button key={label} type="button" onClick={() => setConcept(label)} className="text-muted-foreground hover:text-foreground hover:border-primary/60 min-h-9 rounded-full border px-3 text-xs">
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="labo-doc" className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
            <BookOpen className="size-4" />
            {text.document}
          </label>
          <select id="labo-doc" value={docId} onChange={(e) => choose(e.target.value)} disabled={docsPending} className="bg-background h-11 w-full rounded-lg border px-3 text-sm" data-testid="labo-doc">
            <option value="">{text.noDocument}</option>
            {docs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground mt-1 text-xs">{text.docHint}</p>
        </div>

        {docId && (sims.length > 0 || unsaved) && (
          <div>
            <p className="mb-1.5 text-sm font-semibold">{text.existing}</p>
            <div className="flex flex-wrap gap-2" data-testid="labo-list">
              {[...(unsaved ? [unsaved] : []), ...sims].map((s) => (
                <button key={s.id} type="button" onClick={() => setShownId(s.id)} aria-pressed={shown?.id === s.id} className="hover:border-primary/60 aria-pressed:border-primary aria-pressed:bg-primary/10 inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-medium">
                  {s.engine === "sympy" || s.engine === "numeric" ? <ShieldCheck className="size-4 text-[#047857] dark:text-[#34D399]" /> : <Sparkles className="size-4 text-[#B45309] dark:text-[#FBBF24]" />}
                  {s.spec.generated?.title ?? s.spec.explanation?.title ?? sceneById(s.spec.scene)?.label[lang] ?? s.concept}
                </button>
              ))}
            </div>
          </div>
        )}

        {busy && (
          <div className="bg-secondary/60 flex items-start gap-3 rounded-xl p-3" aria-live="polite" data-testid="labo-building">
            <Loader2 className="text-primary mt-0.5 size-5 shrink-0 animate-spin" />
            <p className="text-sm">
              <span className="font-semibold">{text.building}</span>
              <span className="text-muted-foreground block text-xs">{text.buildingHint}</span>
            </p>
          </div>
        )}

        {failure && !busy && (
          <div className="bg-secondary/60 flex items-start gap-3 rounded-xl border p-3" aria-live="polite" data-testid="labo-failure" data-kind={failure.kind}>
            <Info className="text-muted-foreground mt-0.5 size-5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold">{text[failure.kind]}</p>
              {failure.checks.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-xs">
                  {failure.checks.map((c, i) => (
                    <li key={i}>
                      {c.output}: {WHY[c.status][lang]}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {shown && (
        <Reveal>
          <SimulationView key={shown.id} sim={shown} text={text} lang={lang} />
          {unsaved?.id === shown.id && <p className="text-muted-foreground mt-2 text-xs">{shown.documentId ? text.notSaved : text.notKept}</p>}
        </Reveal>
      )}
    </PageContainer>
  );
}
