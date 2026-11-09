import { describe, expect, spyOn, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_FAST_MODEL, DEFAULT_PRIMARY_MODEL, resolveModel } from "../src/api/lib/ai-models";
import { anthropicModelId } from "../src/api/agent/gateway";

/**
 * Changer de modèle d'IA = changer PRIMARY_AI_MODEL / FAST_AI_MODEL sur
 * Railway. Ces tests garantissent qu'aucun modèle n'est écrit en dur ailleurs
 * et qu'une valeur fausse ne coupe jamais le tuteur.
 */
describe("modèles d'IA : réglés par l'environnement", () => {
  test("sans variable : les modèles actuels", () => {
    expect(resolveModel("PRIMARY_AI_MODEL", DEFAULT_PRIMARY_MODEL, {})).toBe("anthropic/claude-sonnet-4.6");
    expect(resolveModel("FAST_AI_MODEL", DEFAULT_FAST_MODEL, {})).toBe("anthropic/claude-haiku-4.5");
  });

  test("un autre modèle Anthropic : pris tel quel, sans clé supplémentaire", () => {
    expect(resolveModel("PRIMARY_AI_MODEL", DEFAULT_PRIMARY_MODEL, { PRIMARY_AI_MODEL: " anthropic/claude-opus-4.1 " })).toBe(
      "anthropic/claude-opus-4.1",
    );
  });

  test("un autre fournisseur : seulement avec la clé de la passerelle", () => {
    const err = spyOn(console, "error").mockImplementation(() => {});
    expect(resolveModel("PRIMARY_AI_MODEL", DEFAULT_PRIMARY_MODEL, { PRIMARY_AI_MODEL: "openai/gpt-5" })).toBe(DEFAULT_PRIMARY_MODEL);
    expect(err).toHaveBeenCalled();
    expect(
      resolveModel("PRIMARY_AI_MODEL", DEFAULT_PRIMARY_MODEL, { PRIMARY_AI_MODEL: "openai/gpt-5", AI_GATEWAY_API_KEY: "x" }),
    ).toBe("openai/gpt-5");
    err.mockRestore();
  });

  test.each(["claude-sonnet-4.6", "anthropic/", "anthropic/claude sonnet", "rm -rf /", "a/b/c", "anthropic/<script>"])(
    "valeur mal écrite refusée, le défaut reste : %s",
    (bad) => {
      const err = spyOn(console, "error").mockImplementation(() => {});
      expect(resolveModel("PRIMARY_AI_MODEL", DEFAULT_PRIMARY_MODEL, { PRIMARY_AI_MODEL: bad })).toBe(DEFAULT_PRIMARY_MODEL);
      err.mockRestore();
    },
  );

  test("identifiant de passerelle → identifiant de l'API Anthropic", () => {
    expect(anthropicModelId("anthropic/claude-sonnet-4.6")).toBe("claude-sonnet-4-6");
    expect(anthropicModelId("anthropic/claude-haiku-4.5")).toBe("claude-haiku-4-5");
  });

  test("aucun identifiant de modèle écrit en dur hors de lib/ai-models.ts", () => {
    const root = join(import.meta.dir, "../src/api");
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".ts") ? [join(d, e.name)] : [],
      );
    for (const file of walk(root)) {
      if (file.endsWith("ai-models.ts")) continue;
      const hit = /["'`](?:anthropic|openai|google)\/[a-z0-9.-]+["'`]/i.exec(readFileSync(file, "utf8"))?.[0] ?? null;
      expect({ file, hit }).toEqual({ file, hit: null });
    }
  });
});
