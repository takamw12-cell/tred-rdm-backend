// Direct Anthropic provider (replaces the Runable AI gateway).
// Call sites keep the same signature: gateway("anthropic/claude-sonnet-4.6").
import { createAnthropic } from "@ai-sdk/anthropic";

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL_MAP: Record<string, string> = {
  "anthropic/claude-sonnet-4.6": "claude-sonnet-4-6",
};

export function gateway(modelId: string) {
  const mapped =
    MODEL_MAP[modelId] ?? modelId.replace(/^anthropic\//, "").replace(/\./g, "-");
  return anthropic(mapped);
}
