import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileText, Loader2, Plus, Search } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  courseCreateOptions,
  courseJoinOptions,
  courseSearchOptions,
  myCoursesKey,
} from "@/queries/courses";
import { useT } from "@/i18n";

/**
 * Choisir ses cours.
 *
 * ── Ce que ce composant répare ────────────────────────────────────────────
 *
 * Treize comptes, onze sans le moindre document. Un nouvel inscrit arrivait
 * devant un tableau de bord vide : rien à lire, donc rien à demander au
 * tuteur, donc aucune raison de revenir le lendemain. Le guide de premier
 * lancement n'y change rien — il expliquait bien une pièce qui était vraiment
 * vide.
 *
 * Ici, l'étudiant nomme ses cours et récupère immédiatement ce que sa
 * promotion a déjà déposé. La première question au tuteur devient possible
 * avant le premier téléversement.
 *
 * ── Chercher d'abord, créer ensuite ───────────────────────────────────────
 *
 * Le champ cherche pendant qu'on tape et ne propose de créer qu'à la fin, en
 * dernière ligne. L'ordre inverse — un bouton « créer un cours » bien visible —
 * produirait quarante cours « Elektrotechnik 2 » d'un membre chacun, ce qui est
 * exactement l'état d'avant en plus compliqué.
 */
export function CoursePicker({
  university,
  onDone,
}: {
  /** Pré-remplie depuis le semestre quand on la connaît. */
  university?: string;
  /** Appelé après une adhésion, pour refermer ou avancer. */
  onDone?: () => void;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [uni, setUni] = useState(university ?? "");
  const champ = useRef<HTMLInputElement>(null);

  useEffect(() => {
    champ.current?.focus();
  }, []);

  const recherche = useQuery(courseSearchOptions(q, uni));
  const rejoindre = useMutation({
    ...courseJoinOptions(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: myCoursesKey() });
      await recherche.refetch();
      onDone?.();
    },
  });
  const creer = useMutation({
    ...courseCreateOptions(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: myCoursesKey() });
      setQ("");
      await recherche.refetch();
      onDone?.();
    },
  });

  const resultats = recherche.data ?? [];
  // On ne propose la création que si aucun résultat ne porte déjà ce nom, à la
  // casse près. C'est la dernière barrière avant les doublons.
  const nomLibre =
    q.trim().length >= 2 &&
    !resultats.some((r) => r.name.trim().toLowerCase() === q.trim().toLowerCase());

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
        <Input
          value={uni}
          onChange={(e) => setUni(e.target.value)}
          placeholder={t("courses.universityPlaceholder")}
          aria-label={t("courses.university")}
        />
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            ref={champ}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("courses.searchPlaceholder")}
            aria-label={t("courses.search")}
            className="pl-8"
          />
        </div>
      </div>

      {recherche.isFetching && (
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <Loader2 className="size-3.5 animate-spin" />
          {t("common.loading")}
        </p>
      )}

      {resultats.length > 0 && (
        <ul className="space-y-2">
          {resultats.map((c) => (
            <li key={c.id}>
              <Card className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {c.university}
                    {c.program ? ` · ${c.program}` : ""}
                  </p>
                </div>
                {/* Le nombre de documents décide si on rejoint. « 14 » et « 0 »
                    ne se rejoignent pas de la même façon. */}
                <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs tabular-nums">
                  <FileText className="size-3.5" />
                  {c.documentCount} {t("courses.documents")}
                </span>
                {c.joined ? (
                  <span className="text-signature flex shrink-0 items-center gap-1 text-xs font-medium">
                    <Check className="size-4" />
                    {t("courses.joined")}
                  </span>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => rejoindre.mutate({ courseId: c.id })}
                    disabled={rejoindre.isPending}
                  >
                    {t("courses.join")}
                  </Button>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      {nomLibre && !recherche.isFetching && (
        <Card className="flex flex-wrap items-center gap-3 border-dashed p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">
              {t("courses.createHint", { name: q.trim() })}
            </p>
            <p className="text-muted-foreground text-xs">{t("courses.createBody")}</p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5"
            disabled={creer.isPending || uni.trim().length < 2}
            onClick={() => creer.mutate({ name: q.trim(), university: uni.trim() })}
          >
            <Plus className="size-4" />
            {t("courses.create")}
          </Button>
        </Card>
      )}
    </div>
  );
}
