import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, Library } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CoursePicker } from "@/components/course-picker";
import { myCoursesOptions } from "@/queries/courses";
import { useUserStore } from "@/stores/user";
import { useT } from "@/i18n";

/**
 * La pièce vide, et ce qu'on y met.
 *
 * ── Le chiffre ────────────────────────────────────────────────────────────
 *
 * Treize comptes, onze n'ayant jamais déposé un seul document. Ils ouvraient
 * un tableau de bord vide : rien à lire, donc rien à demander au tuteur, donc
 * aucune raison de revenir le lendemain.
 *
 * ── Pourquoi ici et pas à l'inscription ───────────────────────────────────
 *
 * C'était mon premier réflexe : ajouter une étape « quels cours suis-tu ? »
 * après le formulaire. Deux raisons de ne pas le faire.
 *
 * D'abord, `pages/onboarding.tsx` n'ouvre pas encore de session côté serveur —
 * il enregistre un profil local et redirige. Les routes des cours exigent une
 * authentification ; le sélecteur y échouerait.
 *
 * Ensuite et surtout : les onze comptes vides EXISTENT DÉJÀ. Une étape
 * d'inscription ne les touche pas. Placée sur le tableau de bord, la
 * proposition s'affiche à la prochaine visite de chacun d'eux — et à chaque
 * nouveau venu, au même moment qu'il découvre le vide.
 *
 * ── Elle disparaît d'elle-même ────────────────────────────────────────────
 *
 * Dès qu'un cours est rejoint ou qu'un document existe, ce bloc s'efface. Rien
 * à fermer, aucune préférence à retenir : l'état du compte suffit à savoir
 * s'il a encore un sens.
 */
export function EmptyStart({ hasDocuments }: { hasDocuments: boolean }) {
  const { t } = useT();
  const profile = useUserStore((s) => s.profile);
  const { data: cours, isLoading } = useQuery(myCoursesOptions());

  // Tant qu'on ne sait pas, on n'affiche rien. Un bloc « tu n'as rien » qui
  // apparaît puis disparaît sur un compte fourni est une petite gifle.
  if (isLoading) return null;
  if (hasDocuments) return null;
  if ((cours?.length ?? 0) > 0) return null;

  return (
    <Card className="border-signature/40 bg-signature/5 mb-6">
      <CardContent className="pt-0">
        <div className="mb-4 flex items-start gap-3">
          <span className="text-signature mt-0.5">
            <Library className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold">
              {t("emptyStart.title")}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {t("emptyStart.body")}
            </p>
          </div>
        </div>

        {/* L'université est déjà connue du profil : la redemander ferait
            recommencer une saisie que l'étudiant vient de faire. */}
        <CoursePicker university={profile.university} />

        <div className="border-border mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
          <p className="text-muted-foreground flex-1 text-xs">
            {t("emptyStart.orUpload")}
          </p>
          <Link to="/chat">
            <Button variant="ghost" size="sm" className="gap-1.5">
              {t("dashboard.importDocs")}
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
