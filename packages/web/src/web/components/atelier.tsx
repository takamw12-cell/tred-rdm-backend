import { Link, useSearch } from "wouter";
import { PenSquare, Timer } from "lucide-react";
import { InteractiveCircuit } from "@/components/InteractiveCircuit";
import { PageContainer, PageHeader, Reveal } from "@/components/page";
import { useT } from "@/i18n";
import { SIMULATORS, exercisesHref } from "@/lib/atelier";

/**
 * L'Atelier (/explorer?atelier=<id>) : un simulateur interactif, puis la suite
 * logique — les exercices du même thème, tirés des documents de l'étudiant.
 * Une tâche du plan d'étude arrive ici avec son thème (?topic=…&subject=…).
 */
const TEXT = {
  de: { title: "Atelier", subtitle: "Erst ausprobieren, dann üben.", back: "Alle Modelle", from: "Aus deinem Lernplan", next: "Jetzt üben", exercises: "Aufgaben zu diesem Thema", exercisesHint: "Aus deinen Übungsblättern und Altklausuren.", exam: "Klausur-Simulation", examHint: "Mit Zeit, danach Korrektur mit Punkten." },
  en: { title: "Workshop", subtitle: "Try it first, then practise.", back: "All models", from: "From your study plan", next: "Practise now", exercises: "Exercises on this topic", exercisesHint: "From your exercise sheets and past exams.", exam: "Exam simulation", examHint: "Timed, then graded with points." },
  fr: { title: "Atelier", subtitle: "Essaie d'abord, entraîne-toi ensuite.", back: "Tous les modèles", from: "Depuis ton plan d'étude", next: "S'entraîner maintenant", exercises: "Exercices sur ce thème", exercisesHint: "Tirés de tes feuilles d'exercices et de tes anciens examens.", exam: "Simulation d'examen", examHint: "Chronométrée, puis corrigée avec des points." },
} as const;

export function Atelier() {
  const { locale } = useT();
  const text = TEXT[locale as keyof typeof TEXT] ?? TEXT.en;
  const params = new URLSearchParams(useSearch());
  const sim = SIMULATORS.find((s) => s.id === params.get("atelier")) ?? SIMULATORS[0]!;
  const topic = params.get("topic")?.slice(0, 120) ?? "";
  const subject = params.get("subject")?.slice(0, 120) ?? "";
  const card = "bg-card hover:border-primary/60 flex min-h-20 items-center gap-3 rounded-2xl border p-4 transition-colors focus-visible:ring-2 focus-visible:outline-none";

  return (
    <PageContainer className="max-w-6xl">
      <Link to="/explorer" className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-sm font-medium">
        ← {text.back}
      </Link>
      <PageHeader title={text.title} subtitle={text.subtitle} />
      {topic && (
        <p className="bg-secondary mb-4 inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-sm" data-testid="atelier-topic">
          <span className="text-muted-foreground shrink-0">{text.from}:</span>
          <span className="truncate font-semibold">{topic}</span>
        </p>
      )}
      <Reveal>
        <InteractiveCircuit />
      </Reveal>
      <h2 className="mt-8 mb-3 text-lg font-bold">{text.next}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link to={exercisesHref(topic || sim.chapter, subject)} className={card} data-testid="atelier-exercises">
          <PenSquare className="text-primary size-6 shrink-0" />
          <span>
            <span className="block font-semibold">{text.exercises}</span>
            <span className="text-muted-foreground block text-sm">{text.exercisesHint}</span>
          </span>
        </Link>
        <Link to="/exam" className={card} data-testid="atelier-exam">
          <Timer className="text-primary size-6 shrink-0" />
          <span>
            <span className="block font-semibold">{text.exam}</span>
            <span className="text-muted-foreground block text-sm">{text.examHint}</span>
          </span>
        </Link>
      </div>
    </PageContainer>
  );
}
