import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2, Zap } from "lucide-react";

import { Card } from "@/components/ui/card";
import { client } from "@/lib/api";
import { creditsMeOptions } from "@/queries/credits";
import { cn } from "@/lib/utils";

/**
 * Les recharges.
 *
 * ── Pourquoi elles existent ───────────────────────────────────────────────
 *
 * Le quota mensuel expire. Un étudiant qui l'épuise la veille d'une Klausur
 * est bloqué jusqu'au premier du mois — c'est-à-dire au pire moment possible,
 * celui où il aurait le plus payé pour continuer. La recharge existe pour ce
 * moment-là, et pour lui seul.
 *
 * ── Ce que le bloc montre, dans cet ordre ─────────────────────────────────
 *
 * D'abord ce qu'il reste, ensuite ce qu'on peut acheter. L'inverse — les prix
 * en premier — est une boutique ; celui-ci est un tableau de bord auquel on
 * a ajouté une porte de sortie.
 *
 * Les crédits achetés sont affichés séparément du quota, avec la mention
 * « n'expirent jamais ». C'est la promesse commerciale, elle doit être lisible
 * avant l'achat et pas seulement dans les conditions générales.
 */
export function CreditPacks() {
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading } = useQuery(creditsMeOptions());

  const buy = useMutation({
    mutationFn: (priceId: string) => client.credits.purchase({ priceId }),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: () =>
      setError("Der Kauf konnte nicht gestartet werden. Bitte später erneut versuchen."),
  });

  if (isLoading) {
    return (
      <Card className="flex items-center gap-3 p-5">
        <Loader2 className="text-muted-foreground size-4 animate-spin" />
        <p className="text-muted-foreground text-sm">Guthaben wird geladen …</p>
      </Card>
    );
  }

  if (!data) return null;

  const packs = data.packs ?? [];
  const low = data.total <= data.lowThreshold;

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display flex items-center gap-2 text-sm font-bold">
          <Zap className={cn("size-4", low ? "text-destructive" : "text-signature")} />
          Dein Guthaben
        </h2>
        <span
          className={cn(
            "font-display text-2xl font-extrabold tabular-nums",
            low && "text-destructive",
          )}
        >
          {data.total}
        </span>
      </div>

      {/* Les deux cagnottes, jamais additionnées à l'écran sans être aussi
          montrées séparément : ce qui expire et ce qui reste ne se gèrent pas
          de la même façon, et l'étudiant doit pouvoir le voir. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="bg-secondary/50 rounded-lg p-3">
          <p className="text-muted-foreground text-xs">Monatskontingent</p>
          <p className="mt-0.5 text-sm font-medium tabular-nums">
            {data.monthlyRemaining} / {data.monthlyLimit}
          </p>
          <p className="text-muted-foreground mt-1 text-[11px]">
            Setzt sich am Monatsanfang zurück.
          </p>
        </div>
        <div className="bg-secondary/50 rounded-lg p-3">
          <p className="text-muted-foreground text-xs">Gekaufte Credits</p>
          <p className="mt-0.5 text-sm font-medium tabular-nums">{data.purchasedCredits}</p>
          <p className="text-muted-foreground mt-1 text-[11px]">Verfallen nie.</p>
        </div>
      </div>

      {low && (
        <p className="text-destructive mt-3 text-xs">
          Dein Guthaben geht zur Neige. Lade auf, bevor du mitten in der
          Klausurvorbereitung stehst.
        </p>
      )}

      {error && (
        <div className="border-destructive/40 mt-4 flex items-center gap-2 rounded-lg border p-3">
          <AlertCircle className="text-destructive size-4 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {packs.length === 0 ? (
        <p className="text-muted-foreground mt-4 text-xs">
          Keine Credit-Pakete konfiguriert. Setze <code>STRIPE_PRICE_CREDITS_SMALL</code>,{" "}
          <code>…_MEDIUM</code> und <code>…_LARGE</code>.
        </p>
      ) : (
        <div className="mt-5">
          <p className="text-muted-foreground mb-2.5 text-xs">Aufladen — einmalig, kein Abo</p>
          <div className="grid gap-2.5 sm:grid-cols-3">
            {packs.map((pack) => (
              <button
                key={pack.priceId}
                type="button"
                disabled={buy.isPending}
                onClick={() => {
                  setError(null);
                  buy.mutate(pack.priceId);
                }}
                className="border-border hover:border-primary/50 hover:bg-accent/40 flex flex-col items-start rounded-lg border p-3 text-left transition-colors disabled:opacity-60"
              >
                <span className="font-display text-lg font-bold tabular-nums">
                  {pack.credits}
                </span>
                <span className="text-muted-foreground text-xs">Credits</span>
                <span className="mt-2 text-sm font-medium">
                  {new Intl.NumberFormat("de-DE", {
                    style: "currency",
                    currency: pack.currency || "EUR",
                  }).format(pack.amount / 100)}
                </span>
                {/* Le prix unitaire rend les paquets comparables d'un coup
                    d'œil. Sans lui, « lequel est le plus avantageux » demande
                    une division mentale que personne ne fait. */}
                <span className="text-muted-foreground text-[11px] tabular-nums">
                  {(pack.pricePerCredit / 100).toFixed(2).replace(".", ",")} € pro Credit
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {buy.isPending && (
        <p className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
          <Loader2 className="size-3 animate-spin" />
          Weiterleitung zu Stripe …
        </p>
      )}
    </Card>
  );
}
