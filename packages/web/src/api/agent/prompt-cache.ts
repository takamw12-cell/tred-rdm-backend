import type { ModelMessage } from "ai";

/**
 * Second point de cache Anthropic : sur le DERNIER message de l'étape.
 *
 * Le premier est sur le bloc système fixe (agent/index.ts, TTL 1 h). Celui-ci
 * couvre le reste — extraits du cours, historique, résultats d'outils — et
 * sert surtout DANS une même réponse : la boucle d'outils renvoie tout le
 * contexte à chaque étape (recherche → solveur → texte), et les étapes 2, 3…
 * le relisent depuis le cache au lieu de le refaire lire au modèle.
 *
 * Anthropic accepte au plus 4 points ; on en pose 2. Les messages d'entrée ne
 * sont pas modifiés (copie du dernier seulement).
 */
export function withConversationCacheBreakpoint(messages: ModelMessage[]): ModelMessage[] {
  if (messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  const marked = {
    ...last,
    providerOptions: {
      ...last.providerOptions,
      anthropic: { ...last.providerOptions?.anthropic, cacheControl: { type: "ephemeral" } },
    },
  } as ModelMessage;
  return [...messages.slice(0, -1), marked];
}
