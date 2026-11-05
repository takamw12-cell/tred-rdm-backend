// Direct Anthropic provider (replaces the Runable AI gateway).
// Call sites keep the same signature: gateway("anthropic/claude-sonnet-4.6").
import { createAnthropic } from "@ai-sdk/anthropic";
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

const MODEL_MAP: Record<string, string> = {
  "anthropic/claude-sonnet-4.6": "claude-sonnet-4-6",
};

export function gateway(modelId: string) {
  const mapped =
    MODEL_MAP[modelId] ?? modelId.replace(/^anthropic\//, "").replace(/\./g, "-");
  return anthropic(mapped);
}
