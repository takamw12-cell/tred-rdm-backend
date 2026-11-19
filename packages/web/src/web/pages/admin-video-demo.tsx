import { Suspense, useMemo } from "react";
import { useSearch } from "wouter";
import { Loader2 } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/page";
import { safeLazy } from "@/lib/lazy-import";
import type { ExplainerVideo } from "@/lib/explainer-video";

/**
 * /admin/video-demo — aperçu de la composition « Als Video erklären » avec un
 * storyboard de démonstration : question, formule écrite progressivement,
 * code tapé à la machine, récapitulatif. Sans voix ni appel au modèle : sert
 * à contrôler le rendu après une modification de la composition.
 *
 *   ?frame=420   ouvre la vidéo à cette image (30 images par seconde)
 *   ?o=portrait  format téléphone
 */
const ExplainerPlayer = safeLazy(() => import("@/video/explainer-player"));

export const DEMO_VIDEO: ExplainerVideo = {
  id: "demo-storyboard",
  title: "Die Ableitung von x²",
  language: "de",
  durationMs: 29_000,
  saved: false,
  audioUrl: "",
  professor: null,
  backdrop: null,
  sceneStartsMs: [0, 6_000, 14_000, 23_000],
  words: [],
  scenes: [
    { heading: "Warum ist die Ableitung von x² gleich 2x?", bullets: [], formula: "", quote: "", voiceover: "", sourceTitle: "", sourceKind: "analogy", visual: "question", stage: "hook" },
    {
      heading: "Der Differenzenquotient",
      bullets: ["h geht gegen null"],
      formula: "f'(x) = \\lim_{h \\to 0} \\frac{(x+h)^2 - x^2}{h} \\\\ = \\lim_{h \\to 0} (2x + h) = 2x",
      quote: "",
      voiceover: "",
      sourceTitle: "Analysis I, Kapitel 4",
      sourceKind: "document",
      visual: "formula",
      stage: "step",
    },
    {
      heading: "Numerisch nachgeprüft",
      bullets: ["Python, Vorwärtsdifferenz"],
      formula: "",
      code: "def ableitung(f, x, h=1e-6):\n    return (f(x + h) - f(x)) / h\n\nquadrat = lambda x: x ** 2\nprint(ableitung(quadrat, 3))  # ≈ 6.000001",
      code_language: "python",
      quote: "",
      voiceover: "",
      sourceTitle: "Übungsblatt 3",
      sourceKind: "document",
      visual: "code",
      stage: "example",
    },
    { heading: "Merke", bullets: ["Ableitung = Grenzwert des Differenzenquotienten", "(x²)' = 2x", "Numerisch prüfen mit kleinem h"], formula: "", quote: "", voiceover: "", sourceTitle: "", sourceKind: "analogy", visual: "recap", stage: "recap" },
  ],
};

export default function AdminVideoDemoPage() {
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const orientation = params.get("o") === "portrait" ? "portrait" : "landscape";
  const frame = Number(params.get("frame") ?? "");
  return (
    <PageContainer className="max-w-5xl">
      <PageHeader title="Erklärvideo – Vorschau" subtitle="Storyboard-Demo: Frage, Formel, Code, Merke. Ohne Stimme." />
      <div className="mx-auto" style={{ maxWidth: orientation === "portrait" ? 420 : undefined }} data-testid="video-demo">
        <Suspense fallback={<Loader2 className="text-muted-foreground size-6 animate-spin" />}>
          <ExplainerPlayer video={DEMO_VIDEO} orientation={orientation} autoPlay={false} initialFrame={Number.isFinite(frame) && frame > 0 ? frame : undefined} />
        </Suspense>
      </div>
    </PageContainer>
  );
}
