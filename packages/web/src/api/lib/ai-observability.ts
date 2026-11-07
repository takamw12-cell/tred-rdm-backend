const AI_SESSION_ID_SAFE_CHARS = /[^A-Za-z0-9_~.@()!'|:-]/g;

/** AI SDK v7 telemetry settings shared by every production generation. */
export function aiTelemetry(functionId: string) {
  return {
    functionId,
    recordInputs: true,
    recordOutputs: true,
    includeRuntimeContext: {
      distinctId: true,
      sessionId: true,
      traceName: true,
      properties: true,
    },
  };
}

/** Runtime context becomes PostHog's user, AI session, and deployment metadata. */
export function aiRuntimeContext(
  distinctId: string,
  sessionId: string,
  traceName: string,
) {
  return {
    distinctId,
    sessionId,
    traceName,
    properties: {
      environment: process.env.NODE_ENV ?? "development",
    },
  };
}

export type AiRuntimeContext = ReturnType<typeof aiRuntimeContext>;

/** AI session ids permit a smaller character set than Better Auth's opaque IDs. */
export function aiSessionId(scope: string, identifier: string): string {
  return `${scope}:${identifier.replace(AI_SESSION_ID_SAFE_CHARS, "_")}`;
}
