// Fournisseur des modèles d'IA. Les call sites passent un identifiant
// « fournisseur/modèle » venu de lib/ai-models.ts (PRIMARY_AI_MODEL,
// FAST_AI_MODEL) : gateway(PRIMARY_MODEL).
//   anthropic/…   → Anthropic en direct (ANTHROPIC_API_KEY), comme avant ;
//   autre/…       → passerelle Vercel AI Gateway de l'AI SDK (AI_GATEWAY_API_KEY).
import { createAnthropic } from "@ai-sdk/anthropic";
import { gateway as aiGateway } from "ai";
import { stripLoneSurrogateEscapes } from "../lib/unicode-safe";

/**
 * Dernier contrôle avant Anthropic : un corps JSON contenant une moitié de
 * caractère Unicode est refusé (400) et le chat entier tombe. On la remplace
 * par U+FFFD ici, quel que soit le chemin qui l'a introduite.
 * Voir lib/unicode-safe.ts (incident du 5 novembre 2026).
 */
// `typeof fetch` sous Bun exige aussi `fetch.preconnect` : on part du fetch
// d'origine (qui l'a) et on ne remplace que l'appel.
const safeFetch: typeof fetch = Object.assign(
  (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (init && typeof init.body === "string") {
      const body = stripLoneSurrogateEscapes(init.body);
      if (body !== init.body) {
        console.warn("[gateway] moitié de caractère Unicode retirée de la requête");
        init = { ...init, body };
      }
    }
    return fetch(input, init);
  },
  { preconnect: fetch.preconnect },
);

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  fetch: safeFetch,
});

/** Identifiant de passerelle → identifiant de l'API Anthropic (« 4.6 » → « 4-6 »). */
export function anthropicModelId(modelId: string): string {
  return modelId.replace(/^anthropic\//, "").replace(/\./g, "-");
}

export function gateway(modelId: string) {
  if (modelId.startsWith("anthropic/")) return anthropic(anthropicModelId(modelId));
  // Autre fournisseur (OpenAI, Google…) : lib/ai-models.ts n'accepte ces
  // identifiants que si AI_GATEWAY_API_KEY est présente.
  return aiGateway(modelId);
}
