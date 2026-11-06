import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { ORPCError } from "@orpc/client";
import { Bug, Info, Lightbulb, Loader2, MessageCircle, MessageSquareText, Star } from "lucide-react";
import { Modal } from "@/components/modal";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { client } from "@/lib/api";
import { track } from "@/lib/analytics";
import { useT } from "@/i18n";
import { useFeedbackUi } from "@/stores/feedback";
import { toast } from "@/stores/toast";
import { cn } from "@/lib/utils";
import { FEEDBACK_TYPES, MAX_MESSAGE, MIN_MESSAGE, type FeedbackType } from "../../api/lib/feedback";

/**
 * Feedback des bêta-testeurs, sans quitter l'app.
 *
 *   <FeedbackFab />   bouton flottant, en bas à droite ;
 *   <FeedbackHost />  la modale, montée une fois dans le layout ;
 *   la barre latérale ouvre la même modale (stores/feedback.ts).
 *
 * Le serveur ajoute lui-même le professeur choisi et le navigateur ; le
 * client envoie la page (chemin + paramètres, les jetons sont retirés côté
 * serveur) et la langue.
 */

const TYPE_ICON: Record<FeedbackType, typeof Bug> = { bug: Bug, idea: Lightbulb, general: MessageCircle };

/**
 * Pages où le bouton flottant gênerait : le chat a son champ de saisie et son
 * bouton d'envoi en bas à droite. L'entrée de la barre latérale y reste.
 */
const NO_FAB = [/^\/chat(\/|$)/, /^\/classroom(\/|$)/];

export function FeedbackFab() {
  const { t } = useT();
  const [location] = useLocation();
  const openFeedback = useFeedbackUi((s) => s.openFeedback);
  if (NO_FAB.some((r) => r.test(location))) return null;
  return (
    <button
      type="button"
      onClick={openFeedback}
      aria-label={t("feedback.fab")}
      title={t("feedback.fab")}
      className={cn(
        "fixed right-4 z-30 grid size-11 place-items-center rounded-full shadow-lg transition-transform hover:scale-105 focus-visible:ring-[3px] focus-visible:ring-[#EAB308]/50 focus-visible:outline-none",
        // Mobile : au-dessus de la barre de navigation du bas (≈ 4 rem).
        "bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:right-6 lg:bottom-6",
        "border border-white/10 bg-[#0F172A] text-[#EAB308] dark:border-[#EAB308]/30 dark:bg-[#1E293B]",
      )}
    >
      <MessageSquareText className="size-5" aria-hidden />
    </button>
  );
}

export function FeedbackHost() {
  const open = useFeedbackUi((s) => s.open);
  const close = useFeedbackUi((s) => s.close);
  const { t } = useT();
  // Remonté à chaque ouverture : un brouillon envoyé ne réapparaît pas.
  return (
    <Modal
      open={open}
      onClose={close}
      title={t("feedback.title")}
      className="max-h-[92dvh] overflow-y-auto border-[#E7E2D8] bg-[#FDFBF7] text-[#1A1A1A] dark:border-white/10 dark:bg-[#0F172A] dark:text-white"
    >
      {open && <FeedbackForm onDone={close} />}
    </Modal>
  );
}

function FeedbackForm({ onDone }: { onDone: () => void }) {
  const { t, locale } = useT();
  const [type, setType] = useState<FeedbackType>("bug");
  const [rating, setRating] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: () =>
      client.feedback.submit({
        type,
        rating,
        message: message.trim(),
        pageUrl: window.location.pathname + window.location.search,
        locale,
      }),
    onSuccess: () => {
      track("feedback_submitted", { type, rating: rating ?? 0 });
      toast(t("feedback.thanks"));
      onDone();
    },
    onError: (err) => {
      const limited = err instanceof ORPCError && err.code === "TOO_MANY_REQUESTS";
      setError(t(limited ? "feedback.rateLimited" : "feedback.error"));
    },
  });

  const tooShort = message.trim().length < MIN_MESSAGE;
  const shown = hover ?? rating ?? 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (tooShort) {
          setError(t("feedback.tooShort"));
          return;
        }
        setError(null);
        send.mutate();
      }}
      className="space-y-5"
    >
      <p className="-mt-2 text-sm text-[#6B6B6B] dark:text-white/65">{t("feedback.intro")}</p>

      {/* ── Type ─────────────────────────────────────────────────────── */}
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{t("feedback.typeLabel")}</legend>
        <div className="grid grid-cols-3 gap-2">
          {FEEDBACK_TYPES.map((value) => {
            const Icon = TYPE_ICON[value];
            const selected = type === value;
            return (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-medium transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-[#EAB308]/40",
                  selected
                    ? "border-[#EAB308] bg-[#EAB308]/12 text-[#0F172A] dark:text-white"
                    : "border-[#E7E2D8] bg-white/70 text-[#3A3A3A] hover:border-[#0F172A]/30 dark:border-white/10 dark:bg-white/5 dark:text-white/75 dark:hover:border-white/25",
                )}
              >
                <input
                  type="radio"
                  name="feedback-type"
                  value={value}
                  checked={selected}
                  onChange={() => setType(value)}
                  aria-label={t(`feedback.type_${value}`)}
                  className="sr-only"
                />
                <Icon className={cn("size-5", selected ? "text-[#CA8A04] dark:text-[#EAB308]" : "")} aria-hidden />
                {t(`feedback.type_${value}`)}
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* ── Note (facultative) ───────────────────────────────────────── */}
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">{t("feedback.ratingLabel")}</legend>
        <div className="flex items-center gap-1" onMouseLeave={() => setHover(null)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              onMouseEnter={() => setHover(n)}
              title={t("feedback.stars", { n })}
              className="cursor-pointer rounded-md p-1 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-[#EAB308]/40"
            >
              <input
                type="radio"
                name="feedback-rating"
                value={n}
                checked={rating === n}
                onChange={() => setRating(n)}
                // Un second clic sur la même étoile retire la note.
                onClick={() => rating === n && setRating(null)}
                aria-label={t("feedback.stars", { n })}
                className="sr-only"
              />
              <Star
                aria-hidden
                className={cn(
                  "size-7 transition-colors",
                  n <= shown ? "fill-[#EAB308] text-[#EAB308]" : "text-[#D6D0C4] dark:text-white/25",
                )}
              />
            </label>
          ))}
        </div>
      </fieldset>

      {/* ── Message ──────────────────────────────────────────────────── */}
      <div>
        <label htmlFor="feedback-message" className="mb-1.5 block text-sm font-semibold">
          {t("feedback.messageLabel")}
        </label>
        <Textarea
          id="feedback-message"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            if (error) setError(null);
          }}
          placeholder={t(`feedback.placeholder_${type}`)}
          maxLength={MAX_MESSAGE}
          rows={5}
          aria-invalid={!!error && tooShort}
          className="min-h-28 resize-y border-[#E7E2D8] bg-white/80 focus-visible:border-[#EAB308] focus-visible:ring-[#EAB308]/30 dark:border-white/15 dark:bg-white/5"
        />
        <p className="mt-2 flex items-start gap-1.5 text-xs text-[#6B6B6B] dark:text-white/55">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden />
          {t("feedback.contextNote")}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone} className="dark:text-white/80 dark:hover:bg-white/10">
          {t("feedback.cancel")}
        </Button>
        <Button
          type="submit"
          disabled={send.isPending}
          className="bg-[#EAB308] font-semibold text-[#0F172A] hover:bg-[#CA8A04] hover:text-[#0F172A]"
        >
          {send.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {send.isPending ? t("feedback.sending") : t("feedback.send")}
        </Button>
      </div>
    </form>
  );
}
