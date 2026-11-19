import { createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { eq, sql } from "drizzle-orm";
import { db } from "../database";
import { ttsCache } from "../database/schema";
import { MEDIA_BUCKET, mediaClient, mediaStorageConfigured } from "../lib/media-storage";

/**
 * Cache des voix ElevenLabs (19 nov. 2026). ElevenLabs facture au caractère :
 * la même phrase, dans la même voix et le même style, n'est payée qu'une fois.
 *
 *   1. mémoire du serveur (les 60 derniers extraits, instantané) ;
 *   2. table `tts_cache` + stockage (préfixe `tts-cache/`) : survit aux
 *      redéploiements et sert tous les comptes ;
 *   3. sinon ElevenLabs, puis on range le résultat aux deux niveaux.
 *
 * La clé est une empreinte (sha256) : la table ne contient aucun texte. Un
 * extrait n'est rendu qu'à qui envoie déjà le texte exact. Sans table
 * (migre-prof-perso.mjs pas encore lancé) ou sans stockage, il reste la mémoire.
 */
export const TTS_CACHE_VERSION = "v1";
export const TTS_OBJECT_PREFIX = "tts-cache/";
const MEMORY_MAX = 60;

export function ttsCacheKey(voiceId: string, style: string, text: string): string {
  return createHash("sha256").update(`${TTS_CACHE_VERSION}|${voiceId}|${style}|${text}`).digest("hex");
}

/** Ce dont le cache a besoin, injectable pour les tests. */
export interface TtsCacheDeps {
  findRow(key: string): Promise<{ objectKey: string } | null>;
  recordRow(row: { key: string; voiceId: string; chars: number; bytes: number; objectKey: string }): Promise<void>;
  touchRow(key: string): Promise<void>;
  getObject(objectKey: string): Promise<ArrayBuffer | null>;
  putObject(objectKey: string, audio: ArrayBuffer): Promise<void>;
}

export type CacheSource = "memory" | "store" | "miss";

export function createTtsCache(deps: TtsCacheDeps | null) {
  const memory = new Map<string, ArrayBuffer>();
  const remember = (key: string, audio: ArrayBuffer) => {
    memory.delete(key);
    memory.set(key, audio);
    if (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value!);
  };

  return {
    async get(key: string): Promise<{ audio: ArrayBuffer; source: CacheSource } | null> {
      const hit = memory.get(key);
      if (hit) return { audio: hit, source: "memory" };
      if (!deps) return null;
      try {
        const row = await deps.findRow(key);
        if (!row) return null;
        const audio = await deps.getObject(row.objectKey);
        if (!audio) return null;
        remember(key, audio);
        void deps.touchRow(key).catch(() => {});
        return { audio, source: "store" };
      } catch {
        // Table absente, stockage indisponible : on retombe sur ElevenLabs, jamais sur une erreur.
        return null;
      }
    },

    async put(key: string, voiceId: string, chars: number, audio: ArrayBuffer): Promise<void> {
      remember(key, audio);
      if (!deps) return;
      const objectKey = `${TTS_OBJECT_PREFIX}${key}.mp3`;
      try {
        // L'objet d'abord : une ligne ne désigne jamais un fichier absent.
        await deps.putObject(objectKey, audio);
        await deps.recordRow({ key, voiceId, chars, bytes: audio.byteLength, objectKey });
      } catch {
        /* le prochain appel repaiera ; la réponse en cours n'est pas touchée */
      }
    },

    /** Pour les tests. */
    memorySize: () => memory.size,
  };
}

const productionDeps: TtsCacheDeps = {
  async findRow(key) {
    const [row] = await db.select({ objectKey: ttsCache.objectKey }).from(ttsCache).where(eq(ttsCache.key, key)).limit(1);
    return row ?? null;
  },
  async recordRow(row) {
    await db.insert(ttsCache).values({ ...row, hits: 0 }).onConflictDoNothing();
  },
  async touchRow(key) {
    await db.update(ttsCache).set({ hits: sql`${ttsCache.hits} + 1`, lastUsedAt: new Date() }).where(eq(ttsCache.key, key));
  },
  async getObject(objectKey) {
    const res = await mediaClient.send(new GetObjectCommand({ Bucket: MEDIA_BUCKET, Key: objectKey }));
    const bytes = await res.Body?.transformToByteArray();
    return bytes ? (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer) : null;
  },
  async putObject(objectKey, audio) {
    await mediaClient.send(new PutObjectCommand({ Bucket: MEDIA_BUCKET, Key: objectKey, Body: new Uint8Array(audio), ContentType: "audio/mpeg" }));
  },
};

export const ttsAudioCache = createTtsCache(mediaStorageConfigured() ? productionDeps : null);
