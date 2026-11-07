import { OpenTelemetry } from "@ai-sdk/otel";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PostHogSpanProcessor } from "@posthog/ai/otel";
import { registerTelemetry } from "ai";

const projectToken = process.env.POSTHOG_PROJECT_TOKEN;
const host = process.env.POSTHOG_HOST;

for (const [name, value] of Object.entries({ POSTHOG_PROJECT_TOKEN: projectToken, POSTHOG_HOST: host })) {
  if (!value && process.env.NODE_ENV !== "production") {
    console.warn(
      `${name} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${name} is configured`,
    );
  }
}

export const posthogSpanProcessor =
  projectToken && host
    ? new PostHogSpanProcessor({
        projectToken,
        host,
        privacyMode: false,
      })
    : null;

export const aiObservabilitySdk = posthogSpanProcessor
  ? new NodeSDK({
      resource: resourceFromAttributes({ "service.name": "tred-web-api" }),
      spanProcessors: [posthogSpanProcessor],
    })
  : null;

if (aiObservabilitySdk) {
  aiObservabilitySdk.start();

  registerTelemetry(
    new OpenTelemetry({
      enrichSpan: ({ runtimeContext }) => ({
        environment:
          typeof runtimeContext?.properties === "object" &&
          runtimeContext.properties !== null &&
          "environment" in runtimeContext.properties &&
          typeof runtimeContext.properties.environment === "string"
            ? runtimeContext.properties.environment
            : undefined,
        "posthog.distinct_id":
          typeof runtimeContext?.distinctId === "string"
            ? runtimeContext.distinctId
            : undefined,
        "$ai_session_id":
          typeof runtimeContext?.sessionId === "string"
            ? runtimeContext.sessionId
            : undefined,
        "$ai_trace_name":
          typeof runtimeContext?.traceName === "string"
            ? runtimeContext.traceName
            : undefined,
      }),
    }),
  );
}
