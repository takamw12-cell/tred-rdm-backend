import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Gift, Loader2 } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n";
import { client, orpc } from "@/lib/api";
import { creditsMeKey } from "@/queries/credits";

/**
 * « Freunde einladen » : mon code et mon lien (api/lib/referral.ts). Quand un
 * nouveau compte l'utilise, chacun reçoit 15 crédits. Plus bas : saisir le
 * code reçu d'un ami (seulement dans les 7 jours après l'inscription).
 */
export default function InvitePage() {
  const { t } = useT();
  const qc = useQueryClient();
  const me = useQuery(orpc.referral.me.queryOptions());
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState("");
  const redeem = useMutation({
    mutationFn: () => client.referral.redeem({ code }),
    onSuccess: (res) => {
      if (res.ok) void qc.invalidateQueries({ queryKey: creditsMeKey() });
    },
  });

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* presse-papiers refusé : le lien reste sélectionnable à l'écran */
    }
  }

  const data = me.data;
  const result = redeem.data;
  return (
    <PageContainer>
      <PageHeader title={t("invite.title")} subtitle={data ? t("invite.subtitle", { n: data.credits }) : ""} />
      <Card className="space-y-4 p-6" data-testid="invite-card">
        {me.isLoading ? (
          <Loader2 className="text-muted-foreground size-5 animate-spin" />
        ) : !data?.code || !data.link ? (
          <p className="text-sm">{t("invite.unavailable")}</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span className="bg-signature/15 text-signature grid size-11 shrink-0 place-items-center rounded-xl">
                <Gift className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-muted-foreground text-xs">{t("invite.yourCode")}</p>
                <p className="font-display text-2xl font-extrabold tracking-wide" data-testid="invite-code">{data.code}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input readOnly value={data.link} className="min-w-0 flex-1 font-mono text-xs" aria-label={t("invite.link")} data-testid="invite-url" />
              <Button variant="outline" onClick={() => void copy(data.link!)} data-testid="invite-copy">
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? t("invite.copied") : t("invite.copy")}
              </Button>
            </div>
            <p className="text-muted-foreground text-sm">{t("invite.count", { n: data.count, max: data.max })}</p>
            <p className="text-muted-foreground text-xs">{t("invite.rules")}</p>
          </>
        )}
      </Card>

      <Card className="mt-5 space-y-3 p-6">
        <h2 className="font-display text-base font-bold">{t("invite.haveCode")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="TRED-XXXXXX" className="max-w-xs font-mono uppercase" aria-label={t("invite.haveCode")} data-testid="invite-redeem-input" />
          <Button onClick={() => redeem.mutate()} disabled={!code.trim() || redeem.isPending} data-testid="invite-redeem">
            {redeem.isPending && <Loader2 className="size-4 animate-spin" />}
            {t("invite.redeem")}
          </Button>
        </div>
        {result && (
          <output className="block text-sm font-medium" data-testid="invite-redeem-result">
            {result.ok ? t("invite.redeemed", { n: result.credits }) : t(`invite.refused.${result.reason}`)}
          </output>
        )}
      </Card>
    </PageContainer>
  );
}
