import { Link } from "wouter";
import { ArrowRight, FileUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

/**
 * La pièce vide, et ce qu'on y met.
 *
 * Un nouvel inscrit ouvre un tableau de bord vide : rien à lire, donc rien à
 * demander au tuteur. Ce bloc lui dit quoi faire : déposer SES documents.
 *
 * Jusqu'au 12 nov. 2026, il proposait de rejoindre un cours partagé. Le
 * partage est fermé (UrhG) : chaque étudiant ne voit que ses propres
 * documents, et le bloc le dit.
 *
 * Il disparaît de lui-même dès qu'un document existe. Rien à fermer, aucune
 * préférence à retenir.
 */
export function EmptyStart({ hasDocuments }: { hasDocuments: boolean }) {
  const { t } = useT();
  if (hasDocuments) return null;

  return (
    <Card className="border-signature/40 bg-signature/5 mb-6">
      <CardContent className="pt-0">
        <div className="flex flex-wrap items-start gap-3">
          <span className="text-signature mt-0.5">
            <FileUp className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold">
              {t("emptyStart.title")}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {t("emptyStart.body")}
            </p>
          </div>
          <Link to="/chat">
            <Button size="sm" className="gap-1.5">
              {t("dashboard.importDocs")}
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
