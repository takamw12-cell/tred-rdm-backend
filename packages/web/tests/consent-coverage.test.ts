import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { trackingCoverage } from "../src/api/analytics/consent-coverage";

describe("fiabilité des statistiques PostHog (consentement)", () => {
  test("la couverture compare les imports vus par PostHog aux imports réels", () => {
    expect(trackingCoverage(8, 10)).toEqual({ share: 0.8, level: "verlaesslich" });
    expect(trackingCoverage(4, 10).level).toBe("vorsicht");
    expect(trackingCoverage(1, 10).level).toBe("duenn");
    expect(trackingCoverage(0, 0)).toEqual({ share: null, level: "unbekannt" });
    // Jamais plus de 100 % (un import compté deux fois côté PostHog).
    expect(trackingCoverage(12, 10).share).toBe(1);
  });

  test("la carte est branchée dans /admin/analytics", () => {
    const page = readFileSync(join(import.meta.dir, "../src/web/pages/admin-analytics.tsx"), "utf8");
    expect(page).toContain("Besucher haben dem Tracking zugestimmt");
    expect(readFileSync(join(import.meta.dir, "../src/api/analytics/routes.ts"), "utf8")).toContain("count(DISTINCT person_id)");
  });
});
