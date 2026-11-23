import { Suspense, lazy, useId, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import katex from "katex";
import "katex/dist/katex.min.css";
import { FlaskConical, Loader2, RotateCcw, ShieldCheck, ShieldX } from "lucide-react";
import { PageContainer, PageHeader, Reveal } from "@/components/page";
import { documentsListOptions } from "@/queries/documents";
import { paywallFromResponse } from "@/lib/paywall";
import { useT } from "@/i18n";
import { SIM_SCENES, clampInput, formatQuantity, sceneById, sliderToValue, valueToSlider } from "@/lib/sim-catalog";
import type { CheckStatus, FormulaCheck, SimulationDto } from "../../api/lib/simulation";

/**
 * Le Labo (/explorer?labo=1&doc=<id>) : pour un document de l'étudiant, les
 * simulations 3D déjà construites, et le bouton qui en construit une nouvelle
 * (POST /api/simulate). Une simulation n'arrive ici que vérifiée ; un refus du
 * serveur est montré tel quel, formule par formule.
 */
const SimulationScene = lazy(() => import("@/components/SimulationScene"));

const TEXT = {
  de: {
    title: "Labo",
    subtitle: "3D-Simulationen aus deinen eigenen Unterlagen. Jede Formel wird geprüft, bevor du sie siehst.",
    back: "Alle Modelle",
    document: "Dokument",
    choose: "Dokument wählen …",
    noDocs: "Noch keine Dokumente: Lade zuerst ein Skript oder Übungsblatt unter „Meine Kurse“ hoch.",
    existing: "Simulationen zu diesem Dokument",
    none: "Zu diesem Dokument gibt es noch keine Simulation.",
    concept: "Konzept",
    conceptHint: "z. B. Spannungsteiler",
    generate: "Simulation erzeugen",
    building: "Ich baue eine 3D-Simulation aus deinem Kurs …",
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
    scene: "3D-Simulation",
  },
  en: {
    title: "Lab",
    subtitle: "3D simulations from your own course material. Every formula is checked before you see it.",
    back: "All models",
    document: "Document",
    choose: "Choose a document …",
    noDocs: "No documents yet: first upload a script or exercise sheet under “My courses”.",
    existing: "Simulations for this document",
    none: "There is no simulation for this document yet.",
    concept: "Concept",
    conceptHint: "e.g. voltage divider",
    generate: "Generate simulation",
    building: "I am building a 3D simulation from your course …",
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
    scene: "3D simulation",
  },
  fr: {
    title: "Labo",
    subtitle: "Des simulations 3D tirées de tes propres documents. Chaque formule est vérifiée avant de s'afficher.",
    back: "Tous les modèles",
    document: "Document",
    choose: "Choisis un document …",
    noDocs: "Aucun document : dépose d'abord un cours ou une feuille d'exercices dans « Mes cours ».",
    existing: "Simulations de ce document",
    none: "Ce document n'a pas encore de simulation.",
    concept: "Concept",
    conceptHint: "p. ex. diviseur de tension",
    generate: "Générer une simulation",
    building: "Je construis une simulation 3D à partir de ton cours …",
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
    scene: "Simulation 3D",
  },
} as const;
type Text = (typeof TEXT)[keyof typeof TEXT];

const WHY: Record<CheckStatus, { de: string; en: string; fr: string }> = {
  ok: { de: "in Ordnung", en: "passed", fr: "acceptée" },
  syntax: { de: "Ausdruck nicht lesbar", en: "expression not readable", fr: "expression illisible" },
  unknown_output: { de: "Größe unbekannt", en: "unknown quantity", fr: "grandeur inconnue" },
  units: { de: "Einheiten stimmen nicht", en: "units do not match", fr: "unités incohérentes" },
  not_reference: { de: "weicht vom geprüften Gesetz ab", en: "differs from the verified law", fr: "différente de la loi vérifiée" },
  disproved: { de: "von SymPy widerlegt", en: "disproved by SymPy", fr: "réfutée par SymPy" },
  no_source: { de: "Zitat nicht im Dokument gefunden", en: "quote not found in the document", fr: "citation introuvable dans le document" },
};

type Lang = "de" | "en" | "fr";
type Failure = { kind: "noModel" | "rejected" | "failed" | "noText" | "limit"; checks: FormulaCheck[] };

function Tex({ tex }: { tex: string }) {
  const html = useMemo(() => katex.renderToString(tex, { displayMode: true, throwOnError: false, strict: false }), [tex]);
  return <div className="overflow-x-auto overflow-y-hidden [&_.katex-display]:my-0" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function SimulationView({ sim, text, lang }: { sim: SimulationDto; text: Text; lang: Lang }) {
  const uid = useId();
  const scene = sceneById(sim.spec.scene);
  const start = useMemo(() => Object.fromEntries((scene?.inputs ?? []).map((v) => [v.symbol, valueToSlider(v, clampInput(v, sim.spec.values[v.symbol]))])), [scene, sim.spec.values]);
  // L'état est la POSITION des curseurs (0…1) : la valeur s'en déduit, jamais l'inverse.
  // Le parent donne une `key` par simulation : une autre simulation repart de ses propres valeurs.
  const [pos, setPos] = useState<Record<string, number>>(start);
  if (!scene) return null;

  const values = Object.fromEntries(scene.inputs.map((v) => [v.symbol, sliderToValue(v, pos[v.symbol] ?? 0)]));
  const outputs = scene.compute(values);
  const proved = sim.engine === "sympy";
  const colors = ["#F59E0B", "#38BDF8", "#A78BFA", "#34D399"];

  return (
    <section className="bg-card rounded-2xl border p-4 shadow-sm sm:p-6" data-testid="simulation-view">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight">{scene.label[lang]}</h2>
          <p className="text-muted-foreground truncate text-sm">{sim.concept}</p>
        </div>
        <button type="button" onClick={() => setPos(start)} className="text-muted-foreground hover:text-foreground inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium">
          <RotateCcw className="size-4" />
          {text.reset}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Suspense fallback={<div className="grid aspect-[4/3] w-full place-items-center rounded-xl bg-[#0F172A]"><Loader2 className="size-6 animate-spin text-white/70" /></div>}>
          <SimulationScene scene={scene.id} values={values} outputs={outputs} label={`${text.scene}: ${scene.label[lang]}`} />
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
                      {formatQuantity(values[v.symbol]!, v.unitLabel)}
                    </output>
                  </div>
                  <input id={id} type="range" min={0} max={1} step={0.005} value={pos[v.symbol] ?? 0} onChange={(e) => setPos((p) => ({ ...p, [v.symbol]: Number(e.target.value) }))} className="h-11 w-full cursor-pointer touch-pan-y" style={{ accentColor: v.color ?? colors[i % colors.length] }} data-testid={`sim-slider-${v.symbol}`} />
                </div>
              );
            })}
          </div>

          <div aria-live="polite" data-testid="sim-formulas">
            <p className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">{text.formulas}</p>
            <div className="space-y-2">
              {sim.spec.formulas.map((f) => {
                const out = scene.outputs.find((o) => o.symbol === f.output)!;
                return (
                  <div key={f.output} className="bg-secondary/60 rounded-xl border-l-4 border-l-[#34D399] px-3 py-2.5">
                    <div className="text-[0.8rem] sm:text-[0.95rem]">
                      <Tex tex={`${f.tex} = ${formatQuantity(outputs[f.output]!, out.unitLabel).replace(/ (.+)$/, "\\,\\mathrm{$1}").replace("Ω", "\\Omega").replace("µ", "\\mu ").replace("·", "\\cdot ").replace("²", "^2")}`} />
                    </div>
                    <details className="mt-1 text-xs">
                      <summary className="text-muted-foreground cursor-pointer">
                        {out.label[lang]} · {text.page} {f.page}
                      </summary>
                      <blockquote className="text-muted-foreground mt-1 border-l-2 pl-2 italic">{f.excerpt}</blockquote>
                    </details>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-[#34D399]/50 bg-[#34D399]/10 p-3" data-testid="sim-verified" data-engine={sim.engine}>
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#047857] dark:text-[#34D399]" />
            <p className="text-sm">
              <span className="font-semibold">{proved ? text.proved : text.numeric}</span>
              <span className="text-muted-foreground block text-xs">{proved ? text.provedHint : text.numericHint}</span>
            </p>
          </div>
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
  const shown = (unsaved && unsaved.id === shownId ? unsaved : sims.find((s) => s.id === shownId)) ?? sims[0] ?? null;

  const choose = (id: string) => {
    setFailure(null);
    setShownId(null);
    setUnsaved(null);
    navigate(id ? `/explorer?labo=1&doc=${encodeURIComponent(id)}` : "/explorer?labo=1");
  };

  const generate = async () => {
    if (!docId || concept.trim().length < 2 || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const res = await fetch("/api/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: docId, concept }) });
      if (await paywallFromResponse(res, "exercise")) return;
      const body = (await res.json().catch(() => ({}))) as { simulation?: SimulationDto; saved?: boolean; error?: string; checks?: FormulaCheck[] };
      if (res.ok && body.simulation) {
        if (body.saved === false) setUnsaved(body.simulation);
        setShownId(body.simulation.id);
        await queryClient.invalidateQueries({ queryKey: listKey });
        return;
      }
      const kind = body.error === "NO_VERIFIED_MODEL" ? "noModel" : body.error === "VERIFICATION_FAILED" ? "rejected" : body.error === "NO_TEXT" ? "noText" : body.error === "LIMIT_REACHED" ? "limit" : "failed";
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
        {!docsPending && docs.length === 0 ? (
          <p className="text-sm" data-testid="labo-no-docs">
            {text.noDocs}
          </p>
        ) : (
          <>
            <div>
              <label htmlFor="labo-doc" className="mb-1 block text-sm font-semibold">
                {text.document}
              </label>
              <select id="labo-doc" value={docId} onChange={(e) => choose(e.target.value)} className="bg-background h-11 w-full rounded-lg border px-3 text-sm" data-testid="labo-doc">
                <option value="">{text.choose}</option>
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </div>

            {docId && (
              <>
                <div>
                  <p className="mb-1.5 text-sm font-semibold">{text.existing}</p>
                  {sims.length === 0 && !unsaved ? (
                    <p className="text-muted-foreground text-sm" data-testid="labo-none">
                      {text.none}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2" data-testid="labo-list">
                      {[...(unsaved ? [unsaved] : []), ...sims].map((s) => (
                        <button key={s.id} type="button" onClick={() => setShownId(s.id)} aria-pressed={shown?.id === s.id} className="hover:border-primary/60 aria-pressed:border-primary aria-pressed:bg-primary/10 inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-medium">
                          <ShieldCheck className="size-4 text-[#047857] dark:text-[#34D399]" />
                          {sceneById(s.spec.scene)?.label[lang] ?? s.concept}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="labo-concept" className="mb-1 block text-sm font-semibold">
                    {text.concept}
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input id="labo-concept" value={concept} onChange={(e) => setConcept(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void generate()} maxLength={120} placeholder={text.conceptHint} className="bg-background h-11 min-w-0 flex-1 rounded-lg border px-3 text-sm" data-testid="labo-concept" />
                    <button type="button" onClick={() => void generate()} disabled={busy || concept.trim().length < 2} className="bg-primary text-primary-foreground inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50" data-testid="labo-generate">
                      {busy ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
                      {text.generate}
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {SIM_SCENES.map((s) => (
                      <button key={s.id} type="button" onClick={() => setConcept(s.label[lang])} className="text-muted-foreground hover:text-foreground rounded-full border px-2.5 py-1 text-xs">
                        {s.label[lang]}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
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
          <div className="flex items-start gap-3 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] p-3 text-[#991B1B]" role="alert" data-testid="labo-failure" data-kind={failure.kind}>
            <ShieldX className="mt-0.5 size-5 shrink-0" />
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
          {unsaved?.id === shown.id && <p className="text-muted-foreground mt-2 text-xs">{text.notSaved}</p>}
        </Reveal>
      )}
    </PageContainer>
  );
}
