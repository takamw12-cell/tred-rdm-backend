import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookText, Eye, Headphones, Loader2, MessagesSquare, Shuffle } from "lucide-react";
import { orpc } from "@/lib/api";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Style d'apprentissage (VARK) — réglages.
 *
 * Enregistré côté serveur (user_access.learning_style) : c'est le tuteur qui
 * le lit, à chaque message, pour adapter la FORME de ses réponses.
 */

type Style = "visual" | "auditory" | "text" | "interactive" | "balanced";

const OPTIONS: { value: Style; icon: typeof Eye; label: string; desc: string }[] = [
  { value: "visual", icon: Eye, label: "settings.lsVisual", desc: "settings.lsVisualDesc" },
  { value: "auditory", icon: Headphones, label: "settings.lsAuditory", desc: "settings.lsAuditoryDesc" },
  { value: "text", icon: BookText, label: "settings.lsText", desc: "settings.lsTextDesc" },
  { value: "interactive", icon: MessagesSquare, label: "settings.lsInteractive", desc: "settings.lsInteractiveDesc" },
  { value: "balanced", icon: Shuffle, label: "settings.lsBalanced", desc: "settings.lsBalancedDesc" },
];

export function LearningStylePicker() {
  const { t } = useT();
  const qc = useQueryClient();
  const query = useQuery(orpc.account.getLearningStyle.queryOptions());
  const save = useMutation(orpc.account.setLearningStyle.mutationOptions());
  const [failed, setFailed] = useState(false);

  const current: Style = (save.variables?.learningStyle ?? query.data?.learningStyle ?? "interactive") as Style;

  function choose(value: Style) {
    if (value === current || save.isPending) return;
    setFailed(false);
    save.mutate(
      { learningStyle: value },
      {
        onSuccess: () =>
          void qc.invalidateQueries({ queryKey: orpc.account.getLearningStyle.key() }),
        onError: () => {
          setFailed(true);
          save.reset(); // revient à la valeur enregistrée
        },
      },
    );
  }

  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label={t("settings.learningStyleSection")} className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map(({ value, icon: Icon, label, desc }) => {
          const active = value === current;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={query.isLoading}
              onClick={() => choose(value)}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3 text-start transition-colors",
                active
                  ? "border-signature bg-accent"
                  : "border-border bg-card hover:border-signature/50",
                value === "balanced" && "sm:col-span-2",
              )}
            >
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full",
                  active ? "bg-signature text-signature-foreground" : "bg-secondary text-foreground",
                )}
              >
                {save.isPending && save.variables?.learningStyle === value ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Icon className="size-4" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{t(label)}</span>
                <span className="text-muted-foreground block text-xs leading-snug">{t(desc)}</span>
              </span>
            </button>
          );
        })}
      </div>
      {failed && <p className="text-destructive text-xs">{t("settings.lsSaveError")}</p>}
    </div>
  );
}
