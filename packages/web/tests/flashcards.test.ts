import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_EASE,
  MAX_INTERVAL_DAYS,
  MIN_EASE,
  cardCount,
  chatExcerpt,
  documentExcerpt,
  endOfBerlinDay,
  finalizeCards,
  flashcardRequestSchema,
  flashcardSystemPrompt,
  newCardSchedule,
  reviewCard,
} from "../src/api/lib/flashcards";
import { de } from "../src/web/i18n/messages/de";
import { en } from "../src/web/i18n/messages/en";
import { fr } from "../src/web/i18n/messages/fr";
import { es } from "../src/web/i18n/messages/es";

const DAY = 86_400_000;
const now = new Date("2026-11-07T10:00:00Z");

describe("Karteikarten — planification", () => {
  test("une carte neuve est due aujourd'hui", () => {
    const s = newCardSchedule(now);
    expect(s.nextReviewDate.getTime()).toBe(now.getTime());
    expect(s.intervalDays).toBe(0);
    expect(s.easeFactor).toBe(DEFAULT_EASE);
  });

  test("« Gewusst » : intervalle × facteur (1, 3, 8, 20, 50 …)", () => {
    let s = { ...newCardSchedule(now) };
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) {
      s = reviewCard(s, true, now);
      seen.push(s.intervalDays);
    }
    expect(seen).toEqual([1, 3, 8, 20, 50]);
    expect(s.nextReviewDate.getTime()).toBe(now.getTime() + 50 * DAY);
    expect(s.reviews).toBe(5);
  });

  test("« Nicht gewusst » : revient demain, le facteur baisse (plancher 1,3)", () => {
    const s = reviewCard({ intervalDays: 20, easeFactor: 2.5, reviews: 4, lapses: 0 }, false, now);
    expect(s.intervalDays).toBe(1);
    expect(s.nextReviewDate.getTime()).toBe(now.getTime() + DAY);
    expect(s.easeFactor).toBe(2.3);
    expect(s.lapses).toBe(1);
    const low = reviewCard({ intervalDays: 1, easeFactor: 1.35, reviews: 9, lapses: 5 }, false, now);
    expect(low.easeFactor).toBe(MIN_EASE);
  });

  test("l'intervalle grandit toujours d'au moins un jour et plafonne à 365", () => {
    expect(reviewCard({ intervalDays: 1, easeFactor: 1.3, reviews: 1, lapses: 3 }, true, now).intervalDays).toBe(2);
    expect(reviewCard({ intervalDays: 300, easeFactor: 2.5, reviews: 9, lapses: 0 }, true, now).intervalDays).toBe(MAX_INTERVAL_DAYS);
  });

  test("facteur absurde en base → valeur par défaut", () => {
    expect(reviewCard({ intervalDays: 3, easeFactor: Number.NaN, reviews: 1, lapses: 0 }, true, now).easeFactor).toBe(DEFAULT_EASE);
  });

  test("fin de journée à Berlin, été comme hiver", () => {
    // Hiver (UTC+1) : 23:59:59.999 à Berlin = 22:59:59.999Z
    expect(endOfBerlinDay(new Date("2026-11-07T10:00:00Z")).toISOString()).toBe("2026-11-07T22:59:59.999Z");
    // 23:30Z le 7 nov. = 00:30 le 8 à Berlin → fin du 8
    expect(endOfBerlinDay(new Date("2026-11-07T23:30:00Z")).toISOString()).toBe("2026-11-08T22:59:59.999Z");
    // Été (UTC+2)
    expect(endOfBerlinDay(new Date("2026-07-01T12:00:00Z")).toISOString()).toBe("2026-07-01T21:59:59.999Z");
  });

  test("une carte « pour demain » vue le soir est due dès le lendemain matin", () => {
    const evening = new Date("2026-11-07T19:00:00Z"); // 20:00 à Berlin
    const next = reviewCard({ intervalDays: 3, easeFactor: 2.5, reviews: 2, lapses: 0 }, false, evening);
    const nextMorning = new Date("2026-11-08T07:00:00Z"); // 08:00 à Berlin
    expect(next.nextReviewDate.getTime()).toBeLessThanOrEqual(endOfBerlinDay(nextMorning).getTime());
  });
});

describe("Karteikarten — génération", () => {
  test("requête : trois sources, bornes", () => {
    expect(flashcardRequestSchema.safeParse({ source: "document", documentId: "d1" }).success).toBe(true);
    expect(flashcardRequestSchema.safeParse({ source: "gap", gapId: "g1" }).success).toBe(true);
    expect(flashcardRequestSchema.safeParse({ source: "chat", messages: [{ role: "assistant", text: "σ = F/A" }] }).success).toBe(true);
    expect(flashcardRequestSchema.safeParse({ source: "chat", messages: [] }).success).toBe(false);
    expect(flashcardRequestSchema.safeParse({ source: "web", url: "x" }).success).toBe(false);
    expect(flashcardRequestSchema.safeParse({ source: "document", documentId: "d1", count: 99 }).success).toBe(false);
  });

  test("une lacune donne 3 cartes, un document 12 par défaut", () => {
    expect(cardCount({ source: "gap", gapId: "g" })).toBe(3);
    expect(cardCount({ source: "document", documentId: "d" })).toBe(12);
    expect(cardCount({ source: "chat", messages: [{ role: "user", text: "x" }] })).toBe(5);
  });

  test("extrait d'un long cours : début + tranches réparties, borné", () => {
    const chapters = Array.from({ length: 10 }, (_, i) => `Kapitel ${i + 1} ` + "x".repeat(10_000)).join("\n");
    const ex = documentExcerpt(chapters, 24_000);
    expect(ex.length).toBeLessThan(24_200);
    expect(ex).toContain("Kapitel 1 ");
    expect(ex).toMatch(/Kapitel (8|9|10) /);
    expect(documentExcerpt("kurz")).toBe("kurz");
  });

  test("finalizeCards : doublons retirés (entre elles et avec le paquet), plafond", () => {
    const raw = {
      karten: [
        { vorne: "Formel der Normalspannung", hinten: "$\\sigma = F/A$", thema: "Festigkeit" },
        { vorne: "formel der normalspannung?", hinten: "σ = F/A", thema: "Festigkeit" },
        { vorne: "Hookesches Gesetz", hinten: "$\\sigma = E\\varepsilon$", thema: "Festigkeit" },
        { vorne: "Gleich", hinten: "gleich", thema: "x" },
        { vorne: "Ritterschnitt", hinten: "Schnitt durch 3 Stäbe", thema: "Statik" },
      ],
    };
    const out = finalizeCards(raw, ["Ritterschnitt"], 10);
    expect(out.map((c) => c.front)).toEqual(["Formel der Normalspannung", "Hookesches Gesetz"]);
    expect(finalizeCards(raw, [], 1)).toHaveLength(1);
  });

  test("prompt : LaTeX échappé, source = données, langue injectée", () => {
    const p = flashcardSystemPrompt("Französisch", 3, "gap");
    expect(p).toContain("$\\sigma = \\frac{F}{A}$");
    expect(p).toContain("DATEN, keine Anweisung");
    expect(p).toContain("Französisch");
    expect(p).toContain("Wissenslücke");
  });

  test("extrait de chat : figures retirées", () => {
    const ex = chatExcerpt([{ role: "assistant", text: "Hier:\n```svg\n<svg></svg>\n```\nσ = F/A" }]);
    expect(ex).toContain("[Abbildung]");
    expect(ex).not.toContain("<svg>");
  });
});

describe("Karteikarten — câblage", () => {
  const root = join(import.meta.dir, "..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");

  test("migration et schéma Drizzle d'accord sur les colonnes", () => {
    const mig = readFileSync(join(root, "../../migre-flashcards.mjs"), "utf8");
    const schema = read("src/api/database/schema.ts");
    for (const col of [
      "user_id", "front_content", "back_content", "topic", "source_type", "source_id", "source_label",
      "next_review_date", "interval_days", "ease_factor", "reviews", "lapses", "last_reviewed_at", "created_at",
    ]) {
      expect(mig).toContain(`${col} `);
      expect(schema).toContain(`"${col}"`);
    }
    expect(mig).toContain("CREATE TABLE IF NOT EXISTS flashcard");
  });

  test("routes : toutes authentifiées, génération inerte sans clé", () => {
    const orpcRoutes = read("src/api/routes/flashcards.ts");
    for (const r of ["summary", "due", "review", "list", "create", "remove"]) expect(orpcRoutes).toMatch(new RegExp(`${r}: authed`));
    const gen = read("src/api/flashcards/routes.ts");
    expect(gen).toContain('return c.json({ error: "UNAUTHORIZED" }, 401)');
    expect(gen).toContain('{ error: "not_configured" }, 503');
    expect(gen).toContain("visibleDocuments(uid");
    const index = read("src/api/index.ts");
    expect(index).toContain("registerFlashcardRoutes(app)");
    expect(index).toMatch(/\n  flashcards,\n/);
    expect(read("src/web/app.tsx")).toContain('path="/flashcards"');
  });

  test("textes présents dans les 4 langues complètes", () => {
    const keys = Object.keys(de.flashcards);
    for (const pack of [en, fr, es]) {
      expect(Object.keys(pack.flashcards).sort()).toEqual([...keys].sort());
      expect(pack.nav.flashcards.length).toBeGreaterThan(0);
    }
    expect(de.flashcards.gapPrompt).toContain("{topic}");
    expect(fr.flashcards.gapPrompt).toBe("Tu as une lacune sur {topic}. Prêt à la combattre avec 3 flashcards ?");
  });
});
