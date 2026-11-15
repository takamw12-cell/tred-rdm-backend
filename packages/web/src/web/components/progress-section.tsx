import { useQuery } from "@tanstack/react-query";
import { GalleryVerticalEnd, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { orpc } from "@/lib/api";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * « Mein Fortschritt » sur le tableau de bord (2026-11-15) :
 *
 *   - la maîtrise par matière, en barres — la moyenne des concepts que le
 *     tuteur a vus l'étudiant travailler (api/lib/concept-mastery.ts) ;
 *   - les cartes du jour : cinq au plus, d'abord celles qui touchent ses
 *     concepts les plus fragiles (api/lib/daily-review.ts).
 *
 * Rien à montrer → rien d'affiché, comme les autres blocs du tableau de bord :
 * un encadré vide apprend à l'œil à sauter la zone. Table pas encore migrée →
 * pas de barres, les cartes du jour restent.
 */

/** Rouge sous 40 %, jaune sous 70 %, vert au-delà : la couleur dit où regarder d'abord. */
function tone(score: number): string {
  if (score < 0.4) return "bg-destructive";
  if (score < 0.7) return "bg-learning";
  return "bg-mastered";
}

export function ProgressSection() {
  const { t } = useT();
  const { data } = useQuery(orpc.flashcards.progress.queryOptions());

  if (!data?.available || (data.subjects.length === 0 && data.daily.length === 0)) return null;

  return (
    <Card data-testid="progress-section">
      <CardContent className="space-y-5 pt-0">
        <div className="flex items-center gap-3">
          <span className="bg-secondary text-foreground grid size-10 shrink-0 place-items-center rounded-xl">
            <TrendingUp className="size-5" />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold">{t("progress.title")}</h2>
            <p className="text-muted-foreground text-xs">{t("progress.subtitle")}</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ── Maîtrise par matière ─────────────────────────────────────── */}
          <section aria-labelledby="progress-subjects">
            <h3 id="progress-subjects" className="label-tech mb-3">
              {t("progress.bySubject")}
            </h3>
            {data.subjects.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("progress.subjectsEmpty")}</p>
            ) : (
              <ul className="space-y-3">
                {data.subjects.map((s) => {
                  const percent = Math.round(s.score * 100);
                  return (
                    <li key={s.topic} data-testid="progress-subject">
                      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate font-medium">{s.topic}</span>
                        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                          {percent} % · {t("progress.concepts", { n: s.concepts })}
                        </span>
                      </div>
                      {/* La vraie barre pour les lecteurs d'écran ; le dessin, lui, est décoratif. */}
                      <progress className="sr-only" max={100} value={percent} aria-label={s.topic} />
                      <div className="bg-secondary h-2 overflow-hidden rounded-full" aria-hidden="true">
                        <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out", tone(s.score))} style={{ width: `${Math.max(4, percent)}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── Les cartes du jour ───────────────────────────────────────── */}
          <section aria-labelledby="progress-today">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h3 id="progress-today" className="label-tech">
                {t("progress.today")}
              </h3>
              {data.dueToday > data.daily.length && (
                <span className="text-muted-foreground text-xs tabular-nums">{t("progress.more", { n: data.dueToday - data.daily.length })}</span>
              )}
            </div>
            {data.daily.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("progress.todayEmpty")}</p>
            ) : (
              <>
                <ol className="space-y-1.5">
                  {data.daily.map((card) => (
                    <li key={card.id} className="border-border flex items-start gap-2.5 rounded-xl border px-3 py-2" data-testid="progress-card">
                      <GalleryVerticalEnd className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-medium">{card.front}</p>
                        {card.topic && <p className="text-muted-foreground truncate text-xs">{card.topic}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-muted-foreground text-xs">{t("progress.todayHint")}</p>
                  <Button asChild className="rounded-full bg-[#EAB308] font-semibold text-[#0F172A] hover:bg-[#CA8A04] hover:text-[#0F172A]">
                    <Link to="/flashcards">{t("progress.start")}</Link>
                  </Button>
                </div>
              </>
            )}
          </section>
        </div>
      </CardContent>
    </Card>
  );
}
