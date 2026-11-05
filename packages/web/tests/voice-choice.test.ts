import { describe, expect, test } from "bun:test";
import { pickVoice, rankVoices, scoreVoice } from "../src/web/lib/speech";

const v = (name: string, lang: string) => ({ name, lang, voiceURI: name });
const VOICES = [
  v("eSpeak German", "de-DE"),
  v("Microsoft Hedda - German (Germany)", "de-DE"),
  v("Microsoft Katja Online (Natural) - German (Germany)", "de-DE"),
  v("Google Deutsch", "de-DE"),
  v("Google US English", "en-US"),
  v("Anna", "de_DE"),
];

describe("choix de la voix du professeur", () => {
  test("la voix « Natural » d'Edge passe avant Google, puis les autres", () => {
    const ranked = rankVoices(VOICES, "de").map((x) => x.name);
    expect(ranked[0]).toContain("Katja Online (Natural)");
    expect(ranked[1]).toBe("Google Deutsch");
    expect(ranked.at(-1)).toBe("eSpeak German");
  });

  test("jamais une voix d'une autre langue", () => {
    expect(rankVoices(VOICES, "de").some((x) => x.lang.startsWith("en"))).toBe(false);
    expect(scoreVoice(v("Google US English", "en-US"), "de")).toBeLessThan(0);
  });

  test("le choix de l'étudiant gagne, s'il existe encore sur l'appareil", () => {
    expect(pickVoice(VOICES, "de", "Anna")?.name).toBe("Anna");
    expect(pickVoice(VOICES, "de", "Voix disparue")?.name).toContain("Natural");
  });

  test("format de langue avec soulignement (Android) reconnu", () => {
    expect(scoreVoice(v("Anna", "de_DE"), "de")).toBeGreaterThan(0);
  });
});

import { PROFESSOR_STYLE, premiumSlotFor, prosodyFor } from "../src/web/lib/speech";
import { PROFESSOR_IDS } from "../src/api/lib/professors";

describe("panoplie de voix : styles", () => {
  test("chaque professeur a un style de voix", () => {
    for (const id of PROFESSOR_IDS) expect(["calm", "energetic", "strict"]).toContain(PROFESSOR_STYLE[id]);
    expect(PROFESSOR_STYLE.sensei).toBe("calm");
    expect(PROFESSOR_STYLE.examiner).toBe("strict");
  });

  test("énergique parle plus vite et plus haut que calme ; sévère plus grave", () => {
    const calm = prosodyFor("calm", true);
    const energetic = prosodyFor("energetic", true);
    const strict = prosodyFor("strict", true);
    expect(energetic.rate).toBeGreaterThan(calm.rate);
    expect(energetic.pitch).toBeGreaterThan(calm.pitch);
    expect(strict.pitch).toBeLessThan(calm.pitch);
    for (const p of [calm, energetic, strict, prosodyFor("energetic", false)]) {
      expect(p.rate).toBeGreaterThanOrEqual(0.7);
      expect(p.rate).toBeLessThanOrEqual(1.3);
    }
  });

  test("la voix premium suit le style, sinon la première disponible", () => {
    const slots = [
      { id: "senior", style: "calm" as const },
      { id: "examiner", style: "strict" as const },
    ];
    expect(premiumSlotFor(slots, "strict")?.id).toBe("examiner");
    expect(premiumSlotFor(slots, "energetic")?.id).toBe("senior");
    expect(premiumSlotFor([], "calm")).toBeUndefined();
  });
});
