import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Layers, Loader2, X } from "lucide-react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { orpc } from "@/lib/api";
import { useGenerateFlashcards } from "@/lib/flashcards-api";
import { useT } from "@/i18n";

/**
 * La boîte de réception de l'agent de rétention (lib/retention/) — le
 * « human-in-the-loop » côté étudiant.
 *
 *   Relance / récapitulatif : « Öffnen » (compte comme ouverte) ou « Ausblenden ».
 *   Proposition de Karteikarten : « Ja, erstellen » lance la génération
 *   habituelle à partir de la lacune (même route que le bouton du tableau de
 *   bord), « Nein danke » la refuse — l'agent ne la reproposera jamais.
 *
 * Seules les suggestions encore en attente s'affichent ; rien à montrer →
 * rien d'affiché. Tables pas encore migrées → masqué.
 */
export function NotificationInbox() {
  const { t } = useT();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { data } = useQuery(orpc.retention.inbox.queryOptions());
  const refresh = () => qc.invalidateQueries({ queryKey: orpc.retention.inbox.key() });

  const respond = useMutation({ ...orpc.retention.respond.mutationOptions(), onSettled: refresh });
  const gen = useGenerateFlashcards((created) => {
    if (created > 0) navigate("/flashcards");
  });

  if (!data?.available) return null;
  const pending = data.items.filter((i) => i.status === "unread" || i.status === "opened").slice(0, 3);
  if (pending.length === 0) return null;

  return (
    <Card>
      <CardContent className="space-y-3 pt-0">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-[#EAB308]" aria-hidden />
          <h2 className="text-sm font-semibold">{t("inbox.title")}</h2>
          <span className="text-muted-foreground text-xs">{t("inbox.subtitle")}</span>
        </div>
        <ul className="space-y-2">
          {pending.map((item) => {
            const proposal = item.kind === "create_flashcard" && item.gapId;
            const busy = (gen.isPending && proposal) || respond.isPending;
            return (
              <li key={item.id} className="border-border rounded-xl border p-3">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-muted-foreground mt-0.5 text-sm">{item.body}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {proposal ? (
                    <>
                      <Button
                        size="sm"
                        disabled={Boolean(busy)}
                        onClick={() => {
                          respond.mutate({ id: item.id, response: "accept" });
                          gen.mutate({ source: "gap", gapId: item.gapId! });
                        }}
                      >
                        {gen.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Layers className="size-4" aria-hidden />}
                        {t("inbox.accept")}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => respond.mutate({ id: item.id, response: "dismiss" })}>
                        <X className="size-4" aria-hidden />
                        {t("inbox.decline")}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        onClick={() => {
                          // « accept » compte aussi comme ouverte (store.ts → respond).
                          respond.mutate({ id: item.id, response: "accept" });
                          navigate(item.href);
                        }}
                      >
                        <Check className="size-4" aria-hidden />
                        {t("inbox.open")}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={respond.isPending} onClick={() => respond.mutate({ id: item.id, response: "dismiss" })}>
                        <X className="size-4" aria-hidden />
                        {t("inbox.dismiss")}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
