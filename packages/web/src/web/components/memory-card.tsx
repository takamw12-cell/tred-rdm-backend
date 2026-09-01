import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, Check, X, Repeat } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { orpc } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";

/**
 * « Woran du gerade arbeitest » — ce que le tuteur a retenu.
 *
 * C'est la partie visible de la mémoire, et elle n'est pas décorative. Une IA
 * qui garde un profil de toi sans te le montrer est à la fois inquiétante et
 * invérifiable. Ici tu vois exactement ce qu'elle croit savoir, tu peux clore
 * une lacune (« compris ») ou la supprimer (« faux »).
 *
 * La carte disparaît quand il n'y a rien : un encadré vide sur le tableau de
 * bord d'un nouvel utilisateur ne dit rien de bon sur le produit.
 */

function daysSince(value: string | Date): number {
  const d = value instanceof Date ? value : new Date(value);
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

function ageLabel(value: string | Date, t: (k: string, v?: Record<string, string | number>) => string): string {
  const days = daysSince(value);
  if (days <= 0) return t("memory.today");
  if (days === 1) return t("memory.yesterday");
  if (days < 7) return t("memory.daysAgo", { n: days });
  return t("memory.weeksAgo", { n: Math.max(1, Math.floor(days / 7)) });
}

export function MemoryCard() {
  const { t } = useT();
  const qc = useQueryClient();

  const { data: gaps = [] } = useQuery(orpc.memory.list.queryOptions({ input: {} }));

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: orpc.memory.list.key() });
  };

  const resolveMut = useMutation({
    ...orpc.memory.resolve.mutationOptions(),
    onSuccess: invalidate,
  });
  const removeMut = useMutation({
    ...orpc.memory.remove.mutationOptions(),
    onSuccess: invalidate,
  });

  if (gaps.length === 0) return null;

  return (
    <Card>
      <CardContent className="pt-0">
        <div className="mb-4 flex items-center gap-2">
          <Brain className="text-primary size-4" />
          <h2 className="font-display text-base font-semibold">{t("memory.title")}</h2>
        </div>

        <p className="text-muted-foreground mb-4 text-xs">{t("memory.subtitle")}</p>

        <ul className="space-y-2">
          {gaps.slice(0, 5).map((gap) => (
            <li
              key={gap.id}
              className="border-border/60 bg-secondary/30 group flex items-start gap-3 rounded-xl border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug font-medium">{gap.label}</p>

                <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                  <span>{gap.topic}</span>

                  {/* Le compteur est le cœur du dispositif : c'est lui qui
                      distingue « une fois, par distraction » de « à chaque
                      fois, depuis trois semaines ». */}
                  {gap.timesSeen > 1 && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 font-medium",
                        gap.timesSeen >= 3 ? "text-learning" : "",
                      )}
                    >
                      <Repeat className="size-3" />
                      {t("memory.times", { n: gap.timesSeen })}
                    </span>
                  )}

                  <span>{ageLabel(gap.lastSeen, t)}</span>
                </div>
              </div>

              <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <button
                  onClick={() => resolveMut.mutate({ id: gap.id })}
                  disabled={resolveMut.isPending}
                  className="text-muted-foreground hover:text-mastered rounded-md p-1 transition-colors"
                  aria-label={t("memory.understood")}
                  title={t("memory.understood")}
                >
                  <Check className="size-4" />
                </button>
                <button
                  onClick={() => removeMut.mutate({ id: gap.id })}
                  disabled={removeMut.isPending}
                  className="text-muted-foreground hover:text-destructive rounded-md p-1 transition-colors"
                  aria-label={t("memory.wrong")}
                  title={t("memory.wrong")}
                >
                  <X className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>

        {gaps.length > 5 && (
          <p className="text-muted-foreground mt-3 text-[11px]">
            {t("memory.more", { n: gaps.length - 5 })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
