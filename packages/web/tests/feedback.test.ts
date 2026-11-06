import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FEEDBACK_TYPES,
  MAX_MESSAGE,
  cleanPageUrl,
  cleanUserAgent,
  feedbackInput,
  newFeedbackId,
} from "../src/api/lib/feedback";
import { de } from "../src/web/i18n/messages/de";
import { en } from "../src/web/i18n/messages/en";
import { fr } from "../src/web/i18n/messages/fr";

describe("feedback : validation de l'entrée", () => {
  test("les trois types : bug, idea, general", () => {
    expect([...FEEDBACK_TYPES]).toEqual(["bug", "idea", "general"]);
  });
  test("message obligatoire (3 caractères utiles), note facultative 1–5", () => {
    expect(feedbackInput.safeParse({ type: "bug", message: "Absturz im Chat" }).success).toBe(true);
    expect(feedbackInput.safeParse({ type: "idea", message: "Dark mode ✨", rating: null }).success).toBe(true);
    expect(feedbackInput.safeParse({ type: "bug", message: "   a  " }).success).toBe(false);
    expect(feedbackInput.safeParse({ type: "bug", message: "ok ok", rating: 0 }).success).toBe(false);
    expect(feedbackInput.safeParse({ type: "bug", message: "ok ok", rating: 6 }).success).toBe(false);
    expect(feedbackInput.safeParse({ type: "bug", message: "ok ok", rating: 2.5 }).success).toBe(false);
    expect(feedbackInput.safeParse({ type: "spam", message: "ok ok" }).success).toBe(false);
    expect(feedbackInput.safeParse({ type: "general", message: "x".repeat(MAX_MESSAGE + 1) }).success).toBe(false);
  });
  test("le message est enregistré sans espaces autour", () => {
    const r = feedbackInput.parse({ type: "general", message: "  Super App  " });
    expect(r.message).toBe("Super App");
  });
});

describe("feedback : URL de la page", () => {
  test("chemin et paramètres sûrs gardés", () => {
    expect(cleanPageUrl("/chat?documentId=abc")).toBe("/chat?documentId=abc");
    expect(cleanPageUrl("/dashboard")).toBe("/dashboard");
  });
  test("jetons retirés, hôte jamais gardé", () => {
    expect(cleanPageUrl("/reset-password?token=SECRET&lang=de")).toBe("/reset-password?lang=de");
    expect(cleanPageUrl("/pricing?session_id=cs_live_123")).toBe("/pricing");
    expect(cleanPageUrl("https://evil.example/x?code=1")).toBe("/x");
  });
  test("vide ou absurde → chaîne vide ; borné à 500", () => {
    expect(cleanPageUrl(undefined)).toBe("");
    expect(cleanPageUrl("")).toBe("");
    expect(cleanPageUrl(`/${"a".repeat(900)}`).length).toBe(500);
  });
  test("navigateur borné, sur une ligne", () => {
    expect(cleanUserAgent("Mozilla\r\nX")).toBe("Mozilla X");
    expect(cleanUserAgent("x".repeat(999)).length).toBe(300);
    expect(cleanUserAgent(null)).toBe("");
  });
  test("identifiant préfixé, unique", () => {
    const a = newFeedbackId();
    expect(a).toMatch(/^fb_[0-9a-f]{20}$/);
    expect(newFeedbackId()).not.toBe(a);
  });
});

describe("feedback : textes et câblage", () => {
  const keys = (o: object) => Object.keys(o).sort();
  test("DE, EN, FR complets et identiques en clés", () => {
    expect(keys(en.feedback)).toEqual(keys(de.feedback));
    expect(keys(fr.feedback)).toEqual(keys(de.feedback));
    expect(de.feedback.thanks).toBe("Danke für dein Feedback!");
    for (const t of FEEDBACK_TYPES) {
      expect(de.feedback[`type_${t}`]).toBeTruthy();
      expect(de.feedback[`placeholder_${t}`]).toBeTruthy();
    }
  });
  test("la route est montée et list/resolve sont réservées aux admins", () => {
    const route = readFileSync(join(import.meta.dir, "../src/api/routes/feedback.ts"), "utf8");
    expect(route).toMatch(/submit:\s*authed/);
    expect(route).toMatch(/list:\s*adminOnly/);
    expect(route).toMatch(/resolve:\s*adminOnly/);
    const index = readFileSync(join(import.meta.dir, "../src/api/index.ts"), "utf8");
    expect(index).toContain("feedback: feedbackRoutes");
  });
  test("migration et schéma Drizzle d'accord sur les colonnes", () => {
    const mig = readFileSync(join(import.meta.dir, "../../../migre-feedback.mjs"), "utf8");
    const schema = readFileSync(join(import.meta.dir, "../src/api/database/schema.ts"), "utf8");
    for (const col of ["user_id", "type", "rating", "message", "page_url", "professor_id", "locale", "user_agent", "status", "created_at", "resolved_at"]) {
      expect(mig).toContain(`${col} `);
      expect(schema).toContain(`"${col}"`);
    }
  });
});
