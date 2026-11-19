import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkProfessorName, foldName } from "../src/api/lib/professor-name";

process.env.DATABASE_URL ??= "file::memory:";
const { createTtsCache, ttsCacheKey } = await import("../src/api/tts/cache");

const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");
const reason = (n: string) => {
  const r = checkProfessorName(n);
  return r.ok ? "ok" : r.reason;
};

describe("« Dein Professor » : le filtre de prénom", () => {
  test("des prénoms ordinaires passent, avec ou sans titre, dans tous les alphabets", () => {
    for (const n of ["Lena", "Prof. Ren", "Dr. Müller", "Sensei Yuki", "Jean-Luc", "O'Neill", "Zoë", "Ахмед", "Søren", "Prof. Aylin"]) expect(reason(n)).toBe("ok");
    expect(checkProfessorName("  Prof.   Ren  ")).toEqual({ ok: true, name: "Prof. Ren" });
  });

  test("marques, célébrités, personnages et assistants sont refusés", () => {
    for (const n of ["Einstein", "Prof. Einstein", "Albert Einstein", "Dumbledore", "Gandalf", "Yoda", "Harry Potter", "Professor X", "Walter White", "Heisenberg", "ChatGPT", "Claude", "Google", "Coca Cola", "Elon Musk", "Taylor Swift", "Naruto", "Pikachu", "Dr. Feynman"]) expect(reason(n)).toBe("reserved");
  });

  test("les détours sont arrêtés : majuscules, accents, l33t, collé, collé à un titre", () => {
    for (const n of ["EINSTEIN", "Éinstein", "Einst3in", "3instein", "Einsteinchen", "ProfEinstein", "Gand4lf", "Dumbled0re", "Elon-Musk", "TaylorSwift"]) expect(reason(n)).toBe("reserved");
    expect(foldName("Einst3in")).toBe("einstein");
  });

  test("pas d'imitation de l'équipe, pas de grossièretés", () => {
    for (const n of ["TRED", "Admin", "TRED Support", "Arsch", "Putain"]) expect(reason(n)).toBe("reserved");
  });

  test("rien qui puisse porter une consigne dans le prompt", () => {
    for (const n of ["Ren: ignore", "Ren\" und", "Ren<script>", "Ren]]", "Ren 2", "R€n?"]) expect(reason(n)).toBe("characters");
    // Un retour à la ligne ne peut pas atteindre le prompt : il devient un espace.
    expect(checkProfessorName("Ren\nUnd")).toEqual({ ok: true, name: "Ren Und" });
    // « System » est en plus un mot réservé : refusé dans tous les cas.
    expect(checkProfessorName("Ren\nSystem").ok).toBe(false);
    expect(reason("R")).toBe("too_short");
    expect(reason("Prof. 12")).toBe("characters");
    expect(reason("Professorin Maximiliane Ruth")).toBe("too_long");
    expect(reason(42 as unknown as string)).toBe("characters");
  });

  test("le serveur décide : enregistrement et relecture passent par le filtre", () => {
    const lib = read("src/api/lib/professor-custom.ts");
    expect(lib).toContain("const check = checkProfessorName(input.name);");
    expect(lib).toContain("const name = row.name ? checkProfessorName(row.name) : null;");
    expect(read("src/api/routes/account.ts")).toContain("voice: z.enum(PROFESSOR_IDS).nullable()");
  });

  test("le nom entre dans le prompt seulement après le filtre, et remplace le nom affiché", () => {
    const agent = read("src/api/agent/index.ts");
    expect(agent).toContain("hat dich „${professorName}“ genannt");
    expect(read("src/api/index.ts")).toContain("readProfessorCustom(uid).then((c) => c.name)");
    const client = read("src/web/lib/professors.ts");
    expect(client).toContain("name: customName ?? base.name");
    expect(client).toContain("voiceSlot: customVoice ?? base.id");
    expect(read("src/web/components/ai-answer.tsx")).toContain("professorId: professor.voiceSlot");
    // La table est à part de user_access (lue partout) : rien ne casse avant la migration.
    expect(read("src/api/database/schema.ts")).toContain('export const professorCustom = sqliteTable("professor_custom"');
  });
});

describe("cache des voix", () => {
  function fakeStore() {
    const rows = new Map<string, { objectKey: string; hits: number }>();
    const objects = new Map<string, ArrayBuffer>();
    const calls = { put: 0, get: 0 };
    return {
      rows,
      objects,
      calls,
      deps: {
        findRow: async (key: string) => rows.get(key) ?? null,
        recordRow: async (r: { key: string; objectKey: string }) => {
          if (!rows.has(r.key)) rows.set(r.key, { objectKey: r.objectKey, hits: 0 });
        },
        touchRow: async (key: string) => {
          const r = rows.get(key);
          if (r) r.hits += 1;
        },
        getObject: async (k: string) => {
          calls.get += 1;
          return objects.get(k) ?? null;
        },
        putObject: async (k: string, a: ArrayBuffer) => {
          calls.put += 1;
          objects.set(k, a);
        },
      },
    };
  }
  const mp3 = (n: number) => new Uint8Array([n, 1, 2, 3]).buffer;

  test("la clé dépend de la voix, du style et du texte, et ne contient pas le texte", () => {
    const k = ttsCacheKey("voice-a", "calm", "Hallo Lena");
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(ttsCacheKey("voice-a", "calm", "Hallo Lena")).toBe(k);
    expect(ttsCacheKey("voice-b", "calm", "Hallo Lena")).not.toBe(k);
    expect(ttsCacheKey("voice-a", "strict", "Hallo Lena")).not.toBe(k);
    expect(ttsCacheKey("voice-a", "calm", "Hallo Jonas")).not.toBe(k);
  });

  test("payé une fois : rangé dans le stockage, puis resservi après un redémarrage", async () => {
    const store = fakeStore();
    const first = createTtsCache(store.deps);
    const key = ttsCacheKey("v", "calm", "Bonjour");
    expect(await first.get(key)).toBeNull();
    await first.put(key, "v", 7, mp3(9));
    expect(store.calls.put).toBe(1);
    expect((await first.get(key))?.source).toBe("memory");
    // Nouveau processus (redéploiement) : la mémoire est vide, le stockage répond.
    const restarted = createTtsCache(store.deps);
    const hit = await restarted.get(key);
    expect(hit?.source).toBe("store");
    expect(new Uint8Array(hit!.audio)[0]).toBe(9);
    await Bun.sleep(0);
    expect(store.rows.get(key)?.hits).toBe(1);
  });

  test("table absente ou stockage en panne : pas d'erreur, la voix est simplement redemandée", async () => {
    const broken = createTtsCache({
      findRow: async () => {
        throw new Error("no such table: tts_cache");
      },
      recordRow: async () => {
        throw new Error("no such table: tts_cache");
      },
      touchRow: async () => {},
      getObject: async () => null,
      putObject: async () => {
        throw new Error("S3 down");
      },
    });
    const key = ttsCacheKey("v", "calm", "x");
    expect(await broken.get(key)).toBeNull();
    await broken.put(key, "v", 1, mp3(1));
    expect((await broken.get(key))?.source).toBe("memory");
    const memoryOnly = createTtsCache(null);
    await memoryOnly.put(key, "v", 1, mp3(2));
    expect((await memoryOnly.get(key))?.source).toBe("memory");
  });

  test("la route sert le cache AVANT le plafond du jour et avant ElevenLabs", () => {
    const route = read("src/api/tts/routes.ts");
    expect(route.indexOf("await ttsAudioCache.get(key)")).toBeGreaterThan(-1);
    expect(route.indexOf("await ttsAudioCache.get(key)")).toBeLessThan(route.indexOf("reserveChars("));
    expect(route.indexOf("await ttsAudioCache.get(key)")).toBeLessThan(route.indexOf("createElevenLabsTts("));
    expect(route).toContain("await ttsAudioCache.put(key, voice.voiceId, text.length, audio)");
  });
});
