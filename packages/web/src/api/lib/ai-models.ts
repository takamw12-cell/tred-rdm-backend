/**
 * Les modèles d'IA de TRED — réglés par variables d'environnement (Railway),
 * jamais écrits en dur ailleurs (tests/ai-models.test.ts le vérifie).
 *
 *   PRIMARY_AI_MODEL  le tuteur, les exercices, les vidéos explicatives,
 *                     l'extraction des documents, les Karteikarten…
 *                     défaut : Claude Sonnet 4.6
 *   FAST_AI_MODEL     les petites tâches rapides (salutations, requête
 *                     YouTube). défaut : Claude Haiku 4.5
 *
 * Format « fournisseur/modèle » : « anthropic/claude-sonnet-4.6 »,
 * « anthropic/claude-opus-4.1 », « openai/gpt-5 », « google/gemini-2.5-pro »…
 *
 * Anthropic est appelé en direct (ANTHROPIC_API_KEY, agent/gateway.ts). Tout
 * autre fournisseur passe par la passerelle Vercel AI Gateway, fournie par
 * l'AI SDK, et exige AI_GATEWAY_API_KEY. Valeur mal écrite ou clé absente :
 * la valeur est refusée au démarrage (message dans les logs Railway) et le
 * modèle par défaut reste en place — une faute de frappe ne coupe jamais le
 * tuteur.
 *
 * Module serveur uniquement (lit process.env).
 */

export const DEFAULT_PRIMARY_MODEL = "anthropic/claude-sonnet-4.6";
export const DEFAULT_FAST_MODEL = "anthropic/claude-haiku-4.5";

/** « fournisseur/modèle » : lettres, chiffres, tirets, points, deux-points. */
const MODEL_ID = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9.:-]*$/i;

type Env = Record<string, string | undefined>;

export function resolveModel(name: string, fallback: string, env: Env = process.env): string {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  if (!MODEL_ID.test(raw)) {
    console.error(`[ai-models] ${name}="${raw.slice(0, 80)}" ignoré : format attendu « fournisseur/modèle ». Modèle utilisé : ${fallback}.`);
    return fallback;
  }
  if (!raw.startsWith("anthropic/") && !env.AI_GATEWAY_API_KEY) {
    console.error(
      `[ai-models] ${name}="${raw}" ignoré : un modèle hors Anthropic passe par Vercel AI Gateway, ` +
        `et AI_GATEWAY_API_KEY manque. Modèle utilisé : ${fallback}.`,
    );
    return fallback;
  }
  return raw;
}

/** Le modèle principal (Sonnet par défaut). */
export const PRIMARY_MODEL = resolveModel("PRIMARY_AI_MODEL", DEFAULT_PRIMARY_MODEL);
/** Le modèle rapide et bon marché (Haiku par défaut). */
export const FAST_MODEL = resolveModel("FAST_AI_MODEL", DEFAULT_FAST_MODEL);
