import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Clock, Wallet } from "lucide-react";

import { Card } from "@/components/ui/card";
import { CreditPacks } from "@/components/credit-packs";
import { creditTransactionsOptions, creditsMeOptions } from "@/queries/credits";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * La page de recharge.
 *
 * ── Pourquoi elle existe séparément de /pricing ───────────────────────────
 *
 * Le mur du quota tombe sur quelqu'un qui révise. Cette personne veut dix
 * questions ce soir, pas un abonnement mensuel. L'envoyer sur la page des
 * tarifs, c'est répondre à une urgence par un engagement — et le mobile avait
 * déjà son écran `/credits` quand le web n'en avait aucun : le même mur menait
 * à l'achat sur téléphone et à une page de vente sur ordinateur.
 *
 * ── L'ordre de la page ────────────────────────────────────────────────────
 *
 * Le solde, puis les recharges, puis l'historique. On regarde d'abord où on en
 * est, ensuite comment continuer, et l'historique n'intéresse que celui qui
 * doute d'un débit. Mettre les prix en premier ferait une boutique.
 */
export default function CreditsPage() {
  const { t } = useT();
  const { data } = useQuery(creditsMeOptions());
  const { data: historique } = useQuery(creditTransactionsOptions(30));

  return (
    <div className="bg-background mx-auto min-h-screen w-full max-w-3xl space-y-6 p-6 md:p-8">
      <div>
        <Link
          href="/chat"
          className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" />
          {t("credits.backToChat")}
        </Link>
        <h1 className="font-display mb-1 text-2xl font-bold tracking-tight">
          {t("credits.title")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("credits.subtitle")}</p>
      </div>

      {/* ── Les deux cagnottes, côte à côte ─────────────────────────────── */}
      <Card className="p-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground mb-1 text-xs">
              {t("credits.monthlyLeft")}
            </p>
            <p className="font-display text-2xl font-bold tabular-nums">
              {data ? `${data.monthlyRemaining} / ${data.monthlyLimit}` : "—"}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {t("credits.monthlyResets")}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs">
              <Wallet className="size-3.5" />
              {t("credits.purchased")}
            </p>
            <p className="font-display text-signature text-2xl font-bold tabular-nums">
              {data?.purchasedCredits ?? "—"}
            </p>
            {/* La promesse commerciale, à l'endroit où elle compte. */}
            <p className="text-muted-foreground mt-1 text-xs">
              {t("credits.neverExpire")}
            </p>
          </div>
        </div>
      </Card>

      <CreditPacks />

      {/* ── L'historique ────────────────────────────────────────────────── */}
      {historique && historique.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <Clock className="size-4" />
            {t("credits.history")}
          </h2>
          <ul className="divide-border divide-y text-sm">
            {historique.map((ligne) => (
              <li key={ligne.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate">{ligne.description}</span>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {new Date(ligne.createdAt).toLocaleDateString("de-DE")}
                </span>
                <span
                  className={cn(
                    "w-12 shrink-0 text-right font-medium tabular-nums",
                    ligne.amount > 0 ? "text-signature" : "text-muted-foreground",
                  )}
                >
                  {ligne.amount > 0 ? `+${ligne.amount}` : ligne.amount}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
