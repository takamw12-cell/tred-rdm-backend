import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, RotateCcw, Sparkles, Target } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { orpc } from "@/lib/api";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * La révision du jour.
 *
 * ── Pourquoi une carte séparée de la mémoire ──────────────────────────────
 *
 * `MemoryCard` montre TOUT ce que TRED a retenu : c'est de la transparence, et
 * l'étudiant doit pouvoir corriger un profil erroné. Celle-ci ne montre que ce
 * qu'il est temps de revoir. Mélanger les deux donnerait une liste de vingt
 * lignes dont personne ne saurait laquelle traiter — et une liste qu'on ne
 * traite pas est une liste qu'on cesse de regarder.
 *
 * ── Deux boutons, pas trois ───────────────────────────────────────────────
 *
 * « Je sais » et « Pas encore ». Les systèmes de répétition espacée proposent
 * souvent quatre nuances de réussite ; à ce stade, chaque choix supplémentaire
 * est une occasion d'hésiter, et l'hésitation fait fermer l'onglet. Deux
 * boutons suffisent à faire tourner la boucle.
 *
 * ── Ce qui se passe derrière ──────────────────────────────────────────────
 *
 * « Je sais » double l'intervalle — 1, 2, 4, 8, 16, 32, 64 jours — et au-delà
 * de soixante jours la notion cesse de revenir. « Pas encore » ramène à
 * demain. Le calcul est dans `api/lib/memory-schedule.ts`, avec ses tests.
 */
export function ReviewCard() {
  const { t } = useT();
  const qc = useQueryClient();

  const { data: due = [], isLoading } = useQuery(
    orpc.memory.due.queryOptions({ input: {} }),
  );

  const review = useMutation({
    ...orpc.memory.review.mutationOptions(),
    onSuccess: () => {
      // Les deux listes bougent ensemble : une lacune acquise quitte la file
      // de révision ET change d'état dans la mémoire.
      void qc.invalidateQueries({ queryKey: orpc.memory.due.key() });
      void qc.invalidateQueries({ queryKey: orpc.memory.list.key() });
    },
  });

  // Rien à réviser n'est pas un vide à combler : c'est le résultat normal la
  // plupart des jours. Un encadré « rien à faire » sur un tableau de bord
  // apprend à l'œil à sauter cette zone, y compris les jours où elle compte.
  if (isLoading || due.length === 0) return null;

  const current = due[0];
  if (!current) return null;

  return (
    <Card className="border-signature/40">
      <CardContent className="pt-0">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Target className="text-signature size-4" />
            <h2 className="font-display text-base font-semibold">
              {t("memory.reviewTitle")}
            </h2>
          </div>
          {due.length > 1 && (
            <span className="text-muted-foreground text-xs tabular-nums">
              {t("memory.reviewLeft", { n: due.length })}
            </span>
          )}
        </div>

        <p className="text-muted-foreground mb-4 text-xs">
          {t("memory.reviewSubtitle")}
        </p>

        {/* Une seule lacune à la fois. Cinq d'un coup, c'est une corvée ;
            une seule, c'est une question — et on répond aux questions. */}
        <div className="border-border/60 bg-secondary/30 rounded-xl border p-4">
          <p className="text-muted-foreground mb-1.5 text-[11px] tracking-wide uppercase">
            {current.topic}
          </p>
          <p className="text-sm leading-snug font-medium">{current.label}</p>

          {current.detail && (
            <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
              {current.detail}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={review.isPending}
              onClick={() => review.mutate({ id: current.id, ok: true })}
              className={cn(
                "border-border hover:border-mastered/60 hover:bg-mastered/10",
                "inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium",
                "transition-colors disabled:opacity-50",
              )}
            >
              <Check className="size-4" />
              {t("memory.reviewKnown")}
            </button>

            <button
              type="button"
              disabled={review.isPending}
              onClick={() => review.mutate({ id: current.id, ok: false })}
              className={cn(
                "border-border hover:border-learning/60 hover:bg-learning/10",
                "text-muted-foreground inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium",
                "transition-colors disabled:opacity-50",
              )}
            >
              <RotateCcw className="size-4" />
              {t("memory.reviewNotYet")}
            </button>
          </div>
        </div>

        {/* Le compteur de réussites est la seule preuve visible de progrès sur
            une notion. Sans lui, répondre « je sais » trois fois de suite ne
            produit aucun retour, et la boucle paraît tourner à vide. */}
        {current.reviews > 0 && (
          <p className="text-muted-foreground mt-3 flex items-center gap-1.5 text-[11px]">
            <Sparkles className="size-3" />
            {t("memory.reviewStreak", { n: current.reviews })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
