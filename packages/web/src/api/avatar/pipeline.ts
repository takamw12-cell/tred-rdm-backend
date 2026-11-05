/**
 * Pipeline du professeur virtuel : SQUELETTE, NON ACTIVÉ.
 *
 *   LLM (Claude) ──texte──▶ TTS (ElevenLabs) ──audio──▶ Avatar (HeyGen) ──vidéo──▶ Transport (LiveKit)
 *
 * Rien ici n'est appelé par l'app. Chaque étage est une interface, et la
 * fonction `createAvatarPipeline` les enchaîne. Tant qu'un étage n'est pas
 * branché, il lève `NotConfiguredError` au lieu de simuler un succès.
 *
 * ── Pourquoi pas Pipecat directement ici ──────────────────────────────────
 * Pipecat (`pipecat-ai[heygen,elevenlabs,livekit]`) est un framework PYTHON.
 * Il n'existe pas de version serveur TypeScript : les paquets `@pipecat-ai/*`
 * sur npm sont des clients navigateur. Deux options, à trancher quand les
 * clés seront là :
 *
 *   A. Le plus simple : HeyGen LiveAvatar en mode « Avatar Only ». LiveAvatar
 *      transporte DÉJÀ sa vidéo via LiveKit et peut fournir sa propre voix :
 *      les étages TTS et Transport se réduisent alors à « envoyer le texte à
 *      LiveAvatar ». C'est ce que ce squelette vise en premier.
 *   B. Plein contrôle : un petit service Python Pipecat déployé à part sur
 *      Railway. Ce fichier deviendrait alors le client qui lui envoie le texte.
 *
 * Dans les deux cas, l'interface ci-dessous ne change pas pour le reste de l'app.
 */

import { createAvatarCostMeter, logAvatarSession } from "../lib/avatar-cost";

export class NotConfiguredError extends Error {
  constructor(stage: string) {
    super(`Avatar pipeline: étage « ${stage} » non configuré (voir GUIDE_FOUNDER.md)`);
    this.name = "NotConfiguredError";
  }
}

/** Morceaux de texte produits par le LLM, dans l'ordre (streaming). */
export interface LlmStage {
  explain(prompt: string): AsyncIterable<string>;
}

/** Texte → audio (PCM/MP3). Facultatif si l'avatar fournit sa propre voix. */
export interface TtsStage {
  synthesize(text: string): Promise<ArrayBuffer>;
}

/** Fait parler l'avatar, soit à partir d'un texte, soit à partir d'un audio. */
export interface AvatarStage {
  start(): Promise<{ sessionId: string }>;
  speak(input: { text: string } | { audio: ArrayBuffer }): Promise<void>;
  stop(): Promise<void>;
}

/** Room temps réel où l'étudiant reçoit la vidéo du professeur. */
export interface TransportStage {
  roomFor(userId: string): string;
}

export interface AvatarPipelineDeps {
  llm: LlmStage;
  tts?: TtsStage;
  avatar: AvatarStage;
  transport: TransportStage;
}

/**
 * Enchaîne les étages pour une session. `tts` absent = l'avatar lit le texte
 * lui-même (option A). Le coût est mesuré et écrit dans `avatar_usage` à la fin.
 */
export function createAvatarPipeline(userId: string, deps: AvatarPipelineDeps) {
  const meter = createAvatarCostMeter();
  let started = false;

  return {
    room: deps.transport.roomFor(userId),

    async start() {
      await deps.avatar.start();
      started = true;
    },

    /** Le LLM explique, et l'avatar le dit au fil de l'eau, phrase par phrase. */
    async explain(prompt: string) {
      if (!started) throw new Error("Avatar pipeline: start() d'abord");
      for await (const chunk of deps.llm.explain(prompt)) {
        if (!chunk.trim()) continue;
        if (deps.tts) {
          meter.addSpokenText(chunk);
          await deps.avatar.speak({ audio: await deps.tts.synthesize(chunk) });
        } else {
          await deps.avatar.speak({ text: chunk });
        }
      }
    },

    async stop() {
      if (!started) return 0;
      started = false;
      await deps.avatar.stop();
      return logAvatarSession(userId, meter.measure());
    },
  };
}

/** Étages par défaut : tous non configurés. Remplacés un par un plus tard. */
export const unconfigured = {
  llm: {
    explain(): AsyncIterable<string> {
      throw new NotConfiguredError("llm");
    },
  },
  avatar: {
    start: () => Promise.reject(new NotConfiguredError("avatar")),
    speak: () => Promise.reject(new NotConfiguredError("avatar")),
    stop: () => Promise.resolve(),
  },
  transport: {
    roomFor: (userId: string) => `hoersaal-${userId}`,
  },
} satisfies AvatarPipelineDeps;
