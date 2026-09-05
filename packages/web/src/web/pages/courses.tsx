import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, FileText, LogOut, Share2, Users } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CoursePicker } from "@/components/course-picker";
import {
  courseDocumentsOptions,
  courseLeaveOptions,
  courseShareOptions,
  courseUnshareOptions,
  courseDocumentsKey,
  myCoursesKey,
  myCoursesOptions,
  shareableKey,
  shareableOptions,
} from "@/queries/courses";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Mes cours, et ce que ma promotion y a déposé.
 *
 * ── Ce que cet écran change ───────────────────────────────────────────────
 *
 * Jusqu'ici, chaque étudiant d'une même Vorlesung téléversait le même Skript
 * séparément, et le serveur l'extrayait autant de fois qu'il y avait
 * d'inscrits. Surtout : un nouveau venu n'avait rien à lire tant qu'il n'avait
 * rien déposé lui-même.
 *
 * Le premier qui dépose son Skript rend TRED utile pour les trente suivants.
 * C'est le seul mécanisme de l'application qui s'améliore quand quelqu'un
 * d'autre s'en sert.
 *
 * ── Ce que l'écran dit toujours ───────────────────────────────────────────
 *
 * Qui a déposé quoi n'est pas affiché — inutile, et cela transformerait une
 * bibliothèque en tableau de contributions. En revanche, chacun voit lesquels
 * sont les SIENS, parce que ce sont les seuls qu'il peut retirer, et qu'un
 * bouton de retrait qui échoue est pire que pas de bouton.
 */
export default function CoursesPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const { data: mesCours, isLoading } = useQuery(myCoursesOptions());
  const [ouvert, setOuvert] = useState<string | null>(null);

  const documents = useQuery(courseDocumentsOptions(ouvert));

  const quitter = useMutation({
    ...courseLeaveOptions(),
    onSuccess: async () => {
      setOuvert(null);
      await qc.invalidateQueries({ queryKey: myCoursesKey() });
    },
  });

  // Ce que je peux apporter : mes documents encore privés. Chargé seulement
  // quand un cours est ouvert — sinon on lit cette liste à chaque visite pour
  // rien.
  const apportables = useQuery({ ...shareableOptions(), enabled: ouvert !== null });

  const partager = useMutation({
    ...courseShareOptions(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: courseDocumentsKey() });
      await qc.invalidateQueries({ queryKey: shareableKey() });
      await qc.invalidateQueries({ queryKey: myCoursesKey() });
    },
  });

  const retirer = useMutation({
    ...courseUnshareOptions(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: courseDocumentsKey() });
      await qc.invalidateQueries({ queryKey: shareableKey() });
      await qc.invalidateQueries({ queryKey: myCoursesKey() });
    },
  });

  const cours = mesCours ?? [];

  return (
    <div className="bg-background mx-auto min-h-screen w-full max-w-4xl space-y-6 p-6 md:p-8">
      <div>
        <h1 className="font-display mb-1 text-2xl font-bold tracking-tight">
          {t("courses.title")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("courses.subtitle")}</p>
      </div>

      {/* ── Rejoindre ────────────────────────────────────────────────────── */}
      <Card className="p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
          <BookOpen className="size-4" />
          {t("courses.addCourse")}
        </h2>
        <CoursePicker />
      </Card>

      {/* ── Mes cours ────────────────────────────────────────────────────── */}
      {isLoading ? null : cours.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("courses.none")}</p>
      ) : (
        <ul className="space-y-3">
          {cours.map((c) => {
            const actif = ouvert === c.id;
            return (
              <li key={c.id}>
                <Card className="overflow-hidden p-0">
                  <button
                    type="button"
                    onClick={() => setOuvert(actif ? null : c.id)}
                    aria-expanded={actif}
                    className="hover:bg-muted/50 flex w-full flex-wrap items-center gap-3 p-4 text-left transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {c.university}
                        {c.program ? ` · ${c.program}` : ""}
                      </p>
                    </div>
                    <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
                      <FileText className="size-3.5" />
                      {c.documentCount}
                    </span>
                    <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
                      <Users className="size-3.5" />
                      {c.memberCount}
                    </span>
                  </button>

                  {actif && (
                    <div className="border-border border-t p-4">
                      {documents.isLoading ? (
                        <p className="text-muted-foreground text-xs">
                          {t("common.loading")}
                        </p>
                      ) : (documents.data ?? []).length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                          {t("courses.empty")}
                        </p>
                      ) : (
                        <ul className="divide-border divide-y text-sm">
                          {(documents.data ?? []).map((d) => (
                            <li key={d.id} className="flex items-center gap-3 py-2">
                              <span className="min-w-0 flex-1 truncate">{d.title}</span>
                              <span className="text-muted-foreground shrink-0 text-xs">
                                {t("courses.pages", { n: d.pageCount })}
                              </span>
                              {d.mine && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="shrink-0 text-xs"
                                  disabled={retirer.isPending}
                                  onClick={() => retirer.mutate({ documentId: d.id })}
                                >
                                  {t("courses.unshare")}
                                </Button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* ── Apporter au cours ────────────────────────── */}
                      {(apportables.data ?? []).length > 0 && (
                        <div className="border-border mt-4 border-t pt-3">
                          <p className="text-muted-foreground mb-2 text-xs font-medium">
                            {t("courses.addYours")}
                          </p>
                          <ul className="space-y-1">
                            {(apportables.data ?? []).map((d) => (
                              <li key={d.id} className="flex items-center gap-3">
                                <span className="min-w-0 flex-1 truncate text-sm">
                                  {d.title}
                                </span>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="shrink-0 gap-1.5 text-xs"
                                  disabled={partager.isPending}
                                  onClick={() =>
                                    partager.mutate({ documentId: d.id, courseId: c.id })
                                  }
                                >
                                  <Share2 className="size-3.5" />
                                  {t("courses.share")}
                                </Button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className={cn("mt-4 flex justify-end")}>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground gap-1.5"
                          disabled={quitter.isPending}
                          onClick={() => quitter.mutate({ courseId: c.id })}
                        >
                          <LogOut className="size-3.5" />
                          {t("courses.leave")}
                        </Button>
                      </div>
                      {/* Dit explicitement, parce que c'est contre-intuitif :
                          quitter ne retire pas ce qu'on a déposé. */}
                      <p className="text-muted-foreground mt-1 text-right text-[11px]">
                        {t("courses.leaveHint")}
                      </p>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
