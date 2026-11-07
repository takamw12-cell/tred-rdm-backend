import { useQuery } from "@tanstack/react-query";
import { GalleryVerticalEnd, Loader2, Swords } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { orpc } from "@/lib/api";
import { useFeatures } from "@/queries/features";
import { useGenerateFlashcards } from "@/lib/flashcards-api";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Le bloc proactif du tableau de bord (V2 — Pilier 1).
 *
 *   « Heute zu wiederholen : X Karten »  dès qu'une carte est due.
 *   « Du hast eine Lücke bei [Thema] … » quand une lacune ouverte (notée par
 *                                         merke_luecke) n'a pas encore de
 *                                         cartes : un clic en crée 3 et ouvre
 *                                         la révision.
 *
 * Rien à montrer → rien d'affiché (même règle que ReviewCard : un encadré
 * vide apprend à l'œil à sauter la zone). Table pas encore migrée → masqué.
 */
export function FlashcardsWidget() {
  const { t } = useT();
  const [, navigate] = useLocation();
  const features = useFeatures();
  const { data } = useQuery(orpc.flashcards.summary.queryOptions());
  const gen = useGenerateFlashcards((created) => {
    if (created > 0) navigate("/flashcards");
  });

  if (!data?.available) return null;
  const showGap = Boolean(data.gap) && features.flashcards;
  if (data.dueToday === 0 && !showGap) return null;

  return (
    <Card className={cn(data.dueToday > 0 && "border-[#EAB308]/50")}>
      <CardContent className="space-y-4 pt-0">
        {data.dueToday > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#EAB308]/15 text-[#CA8A04] dark:text-[#EAB308]">
                <GalleryVerticalEnd className="size-5" />
              </span>
              <div>
                <h2 className="font-display text-base font-semibold">
                  {t("flashcards.dueTitle", { n: data.dueToday })}
                </h2>
                <p className="text-muted-foreground text-xs">{t("flashcards.dueHint")}</p>
              </div>
            </div>
            <Button asChild className="rounded-full bg-[#EAB308] font-semibold text-[#0F172A] hover:bg-[#CA8A04] hover:text-[#0F172A]">
              <Link to="/flashcards">{t("flashcards.startReview")}</Link>
            </Button>
          </div>
        )}

        {showGap && data.gap && (
          <div
            className={cn(
              "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
              data.dueToday > 0 && "border-border/60 border-t pt-4",
            )}
          >
            <p className="flex min-w-0 flex-1 items-start gap-2 text-sm">
              <Swords className="text-learning mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{t("flashcards.gapPrompt", { topic: data.gap.topic || data.gap.label })}</span>
            </p>
            <Button
              variant="outline"
              className="w-full rounded-full sm:w-auto"
              disabled={gen.isPending}
              onClick={() => gen.mutate({ source: "gap", gapId: data.gap!.id })}
            >
              {gen.isPending && <Loader2 className="size-4 animate-spin" />}
              {gen.isPending ? t("flashcards.generating") : t("flashcards.gapAction")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Petit bouton « Karteikarten erstellen » pour une ligne de document. */
export function DocFlashcardsButton({ documentId, className }: { documentId: string; className?: string }) {
  const { t } = useT();
  const features = useFeatures();
  const gen = useGenerateFlashcards();
  if (!features.flashcards) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!gen.isPending) gen.mutate({ source: "document", documentId });
      }}
      disabled={gen.isPending}
      className={cn("text-muted-foreground hover:text-foreground shrink-0 disabled:opacity-100", className)}
      aria-label={t("flashcards.fromDoc")}
      title={t("flashcards.fromDoc")}
    >
      {gen.isPending ? <Loader2 className="size-4 animate-spin" /> : <GalleryVerticalEnd className="size-4" />}
    </button>
  );
}
