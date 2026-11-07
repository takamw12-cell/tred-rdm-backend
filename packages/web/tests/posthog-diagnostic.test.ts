import { afterEach, describe, expect, it } from "bun:test";
import { posthogEnvReport, posthogErrorSummary, posthogQueryConfigured } from "../src/api/analytics/posthog-diagnostic";

const SAVED = { ...process.env };
afterEach(() => {
  for (const k of ["POSTHOG_PERSONAL_API_KEY", "POSTHOG_PROJECT_ID"]) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
});

describe("PostHog-Diagnose", () => {
  it("meldet nur ja/nein, nie den Wert", () => {
    process.env.POSTHOG_PERSONAL_API_KEY = "phx_geheim123";
    process.env.POSTHOG_PROJECT_ID = "12345";
    const report = posthogEnvReport();
    expect(report.POSTHOG_PERSONAL_API_KEY).toBe(true);
    expect(JSON.stringify(report)).not.toContain("geheim");
    expect(JSON.stringify(report)).not.toContain("12345");
    expect(posthogQueryConfigured()).toBe(true);
  });

  it("eine leere oder nur aus Leerzeichen bestehende Variable zählt als fehlend", () => {
    process.env.POSTHOG_PERSONAL_API_KEY = "  ";
    process.env.POSTHOG_PROJECT_ID = "12345";
    expect(posthogQueryConfigured()).toBe(false);
    expect(posthogEnvReport().POSTHOG_PERSONAL_API_KEY).toBe(false);
  });

  it("401 / 403 / 404 bekommen eine verständliche Ursache", () => {
    const body = JSON.stringify({ type: "authentication_error", code: "authentication_failed", detail: "Invalid personal API key." });
    expect(posthogErrorSummary(401, body)).toContain("HTTP 401");
    expect(posthogErrorSummary(401, body)).toContain("authentication_failed");
    expect(posthogErrorSummary(403, "{}")).toContain("query:read");
    expect(posthogErrorSummary(404, "not json")).toContain("POSTHOG_PROJECT_ID");
  });
});
