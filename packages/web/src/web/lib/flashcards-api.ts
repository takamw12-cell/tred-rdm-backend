import { useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/api";
import { toast } from "@/stores/toast";
import { track } from "@/lib/analytics";
import { useT } from "@/i18n";

/**
 * Le client de POST /api/flashcards/generate (l'IA écrit les cartes) et le
 * hook partagé par le tableau de bord, la bibliothèque, le chat et la page
 * /flashcards — un seul endroit pour les messages d'erreur.
 */

export type GenerateBody =
  | { source: "document"; documentId: string; count?: number }
  | { source: "chat"; messages: { role: "user" | "assistant"; text: string }[]; count?: number }
  | { source: "gap"; gapId: string };

export interface GeneratedCard {
  id: string;
  front: string;
  back: string;
  topic: string;
}

export class FlashcardError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}

export async function generateFlashcards(body: GenerateBody, locale: string): Promise<{ created: number; cards: GeneratedCard[] }> {
  const res = await fetch("/api/flashcards/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, locale }),
  });
  const data = (await res.json().catch(() => ({}))) as { created?: number; cards?: GeneratedCard[]; error?: string };
  if (!res.ok) throw new FlashcardError(data.error ?? `http_${res.status}`, res.status);
  return { created: data.created ?? 0, cards: data.cards ?? [] };
}

/** Génère, rafraîchit les compteurs, affiche le résultat. */
export function useGenerateFlashcards(onDone?: (created: number) => void) {
  const { t, locale } = useT();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GenerateBody) => generateFlashcards(body, locale),
    onSuccess: (r, body) => {
      track("flashcards_generated", { source: body.source, created: r.created });
      void qc.invalidateQueries({ queryKey: orpc.flashcards.key() });
      toast(r.created > 0 ? t("flashcards.created", { n: r.created }) : t("flashcards.noneNew"), "success");
      onDone?.(r.created);
    },
    onError: (err) => {
      const code = err instanceof FlashcardError ? err.code : "failed";
      const status = err instanceof FlashcardError ? err.status : 0;
      const msg =
        status === 402
          ? t("flashcards.errLimit")
          : status === 429
            ? t("flashcards.errRate")
            : code === "no_text"
              ? t("flashcards.errNoText")
              : code === "too_many_cards"
                ? t("flashcards.errTooMany")
                : code === "not_configured" || code === "not_migrated"
                  ? t("flashcards.errUnavailable")
                  : t("flashcards.errFailed");
      toast(msg, "error");
    },
  });
}
