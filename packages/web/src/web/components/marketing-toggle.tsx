import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/i18n";
import { orpc, client } from "@/lib/api";

/**
 * Réglages → « Tipps & Neuigkeiten » (lib/marketing.ts côté serveur).
 * Activer envoie un e-mail de confirmation (double opt-in) ; désactiver vaut
 * tout de suite. Les e-mails liés au compte (mot de passe, paiements) ne
 * dépendent pas de ce réglage.
 */
export function MarketingToggle() {
  const { t, locale } = useT();
  const qc = useQueryClient();
  const q = useQuery(orpc.account.getMarketing.queryOptions());
  const m = useMutation({
    mutationFn: (optIn: boolean) => client.account.setMarketing({ optIn, locale }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: orpc.account.getMarketing.key() }),
  });
  const status = m.data?.status ?? q.data?.status;
  if (status === "not_migrated") return <p className="text-muted-foreground text-sm">{t("marketing.unavailable")}</p>;
  const on = status === "pending" || status === "confirmed";
  return (
    <div className="flex items-start justify-between gap-4" data-testid="marketing-toggle" data-status={status ?? "loading"}>
      <div className="min-w-0">
        <p className="text-sm font-medium" id="marketing-label">
          {t("marketing.optIn")}
        </p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {status === "pending" ? t("marketing.pending") : status === "confirmed" ? t("marketing.confirmed") : t("marketing.hint")}
        </p>
      </div>
      {q.isLoading || m.isPending ? (
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      ) : (
        <Switch checked={on} onCheckedChange={(v) => m.mutate(v)} aria-labelledby="marketing-label" />
      )}
    </div>
  );
}
