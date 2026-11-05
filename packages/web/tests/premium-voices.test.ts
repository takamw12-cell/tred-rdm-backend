import { describe, expect, test } from "bun:test";
// elevenlabs.ts → pipeline.ts → avatar-cost → base : une base en mémoire suffit.
process.env.DATABASE_URL ??= "file::memory:";
const { PREMIUM_SLOTS, premiumVoices, resolvePremiumVoice } = await import("../src/api/avatar/elevenlabs");
import { reserveChars } from "../src/api/tts/budget";
import { PROFESSOR_IDS } from "../src/api/lib/professors";

const withKey = <T>(env: Record<string, string | undefined>, fn: () => T): T => {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(env)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
};

describe("voix ElevenLabs par professeur", () => {
  test("chaque professeur du vestiaire a sa voix premium", () => {
    expect(PREMIUM_SLOTS.map((s) => s.id).sort()).toEqual([...PROFESSOR_IDS].sort());
    expect(new Set(PREMIUM_SLOTS.map((s) => s.defaultVoiceId)).size).toBe(PREMIUM_SLOTS.length);
  });

  test("sans clé : aucune voix premium (repli navigateur)", () => {
    withKey({ ELEVENLABS_API_KEY: undefined }, () => expect(premiumVoices()).toEqual([]));
  });

  test("avec la clé seule : les 4 voix par défaut ; une variable remplace la voix d'un prof", () => {
    withKey({ ELEVENLABS_API_KEY: "sk_test", ELEVENLABS_VOICE_AIKO: "custom-aiko-id" }, () => {
      const v = premiumVoices();
      expect(v).toHaveLength(4);
      expect(v.find((x) => x.id === "examiner")?.voiceId).toBe("custom-aiko-id");
      expect(resolvePremiumVoice("genius")?.style).toBe("energetic");
      expect(resolvePremiumVoice("inconnu", "strict")?.id).toBe("examiner");
    });
  });
});

describe("plafond quotidien de caractères (budget ElevenLabs)", () => {
  test("refuse au-delà du plafond, repart le lendemain", () => {
    withKey({ ELEVENLABS_DAILY_CHARS: "3000" }, () => {
      expect(reserveChars("u1", 2000, "2026-11-05")).toBe(true);
      expect(reserveChars("u1", 1500, "2026-11-05")).toBe(false);
      expect(reserveChars("u2", 2500, "2026-11-05")).toBe(true); // par étudiant
      expect(reserveChars("u1", 2500, "2026-11-06")).toBe(true);
    });
  });
});
