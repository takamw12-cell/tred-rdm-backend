import { describe, expect, test } from "bun:test";
import { CATEGORY_IMAGES, type BackgroundCategory } from "../src/web/lib/background-sets";
import { partnerUrl, resourcesFor, RESOURCES_BY_CATEGORY } from "../src/web/lib/partner-resources";

describe("Partner-Ressourcen", () => {
  test("jede Filière hat genau drei Empfehlungen, ohne Doppel", () => {
    for (const cat of Object.keys(CATEGORY_IMAGES) as BackgroundCategory[]) {
      const r = resourcesFor(cat);
      expect(r).toHaveLength(3);
      expect(new Set(r.map((x) => x.id)).size).toBe(3);
    }
    expect(Object.keys(RESOURCES_BY_CATEGORY).sort()).toEqual(Object.keys(CATEGORY_IMAGES).sort());
  });

  test("Elektrotechnik bekommt Elektrotechnik, nicht Maschinenbau", () => {
    expect(resourcesFor("electrical").map((r) => r.id)).toContain("hagmann");
    expect(resourcesFor("electrical").map((r) => r.id)).not.toContain("roloff-matek");
  });

  test("Link: Amazon.de-Suche, Tag nur wenn gültig", () => {
    const r = resourcesFor("aerospace")[0];
    const plain = new URL(partnerUrl(r));
    expect(plain.hostname).toBe("www.amazon.de");
    expect(plain.searchParams.get("k")).toBe(r.query);
    expect(plain.searchParams.has("tag")).toBe(false);
    expect(new URL(partnerUrl(r, "tred-21")).searchParams.get("tag")).toBe("tred-21");
    // Kein eingeschleuster Parameter über einen kaputten Tag.
    expect(new URL(partnerUrl(r, "x&k=evil")).searchParams.has("tag")).toBe(false);
  });
});
