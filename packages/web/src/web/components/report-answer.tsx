import { useState } from "react";
import { Flag, Check } from "lucide-react";

import { client } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Signaler une réponse du tuteur, côté web.
 *
 * ── Pourquoi le web l'a aussi ─────────────────────────────────────────────
 *
 * Google Play n'exige ce chemin que dans l'application. Mais la règle vise
 * une chose réelle : un modèle de langage peut sortir n'importe quoi, et
 * l'étudiant qui le constate doit pouvoir le dire à l'instant où il le voit.
 * Le web sert exactement le même modèle. Ne l'y mettre que parce qu'un store
 * l'oblige serait traiter la règle comme une formalité.
 *
 * ── Discret, mais pas caché ───────────────────────────────────────────────
 *
 * Le drapeau vit au bout de la rangée d'actions, en gris. Les autres puces —
 * « pourquoi », « explique autrement » — sont des gestes fréquents ; celui-ci
 * doit se trouver quand on le cherche et ne pas s'attraper du pouce quand on
 * ne le cherche pas.
 */

const REASONS = ["harmful", "wrong", "offensive", "other"] as const;
type Reason = (typeof REASONS)[number];

export function ReportAnswer({
  conversationId,
  messageId,
  text,
  locale,
}: {
  conversationId: string;
  messageId: string;
  text: string;
  locale: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function send() {
    if (!reason || busy) return;
    setBusy(true);
    // Le serveur avale déjà ses propres erreurs et renvoie toujours ok. Ce
    // `catch` couvre la coupure réseau : on remercie quand même. Refuser un
    // signalement parce que le wifi de l'amphi a lâché serait absurde.
    await client.reports
      .create({ reason, conversationId, messageId, excerpt: text, note, locale })
      .catch(() => {});
    setBusy(false);
    setSent(true);
  }

  if (sent) {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1.5 px-2.5 py-1 text-xs">
        <Check className="size-3.5" />
        {t("report.thanksTitle")}
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("report.action")}
        className="text-muted-foreground/70 hover:text-destructive hover:border-destructive/40 border-transparent flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
      >
        <Flag className="size-3.5" />
        {t("report.action")}
      </button>
    );
  }

  return (
    <div className="border-border bg-card mt-1 w-full rounded-xl border p-3">
      <p className="mb-1 text-sm font-semibold">{t("report.title")}</p>
      <p className="text-muted-foreground mb-3 text-xs leading-relaxed">
        {t("report.body")}
      </p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {REASONS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={reason === value}
            onClick={() => setReason(value)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              reason === value
                ? "border-destructive bg-destructive/10 text-destructive"
                : "border-border text-muted-foreground hover:border-destructive/40",
            )}
          >
            {t(`report.reason_${value}` as "report.reason_other")}
          </button>
        ))}
      </div>

      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={1000}
        rows={2}
        placeholder={t("report.notePlaceholder")}
        aria-label={t("report.notePlaceholder")}
        className="mb-3 text-sm"
      />

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t("common.cancel")}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={!reason || busy}
          onClick={() => void send()}
        >
          {t("report.send")}
        </Button>
      </div>
    </div>
  );
}
