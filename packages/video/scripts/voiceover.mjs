// Génère les voix off des vidéos (ElevenLabs, eleven_multilingual_v2) avec
// l'horodatage de chaque caractère → sous-titres synchronisés.
//
//   node scripts/voiceover.mjs            (toutes les vidéos manquantes)
//   node scripts/voiceover.mjs fr --force (refaire une langue)
//
// La clé est lue dans le .env de la racine (ELEVENLABS_API_KEY) et n'est
// jamais affichée. Coût : ~350 caractères par vidéo (facturés par ElevenLabs).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CAMPAIGN, CINE_A, CINE_B, DEMO, TIKTOK, V4, VOICEOVERS } from "../src/voiceovers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, "../src/assets");
const envFile = join(here, "../../../.env");

function apiKey() {
  const line = readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("ELEVENLABS_API_KEY="));
  const key = line?.slice("ELEVENLABS_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
  if (!key) throw new Error("ELEVENLABS_API_KEY absente du .env");
  return key;
}

/** Caractères horodatés → mots horodatés (en millisecondes). */
function toWords(al) {
  const words = [];
  let cur = null;
  al.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (cur) words.push(cur), (cur = null);
      return;
    }
    const start = Math.round(al.character_start_times_seconds[i] * 1000);
    const end = Math.round(al.character_end_times_seconds[i] * 1000);
    if (!cur) cur = { text: "", startMs: start, endMs: end };
    cur.text += ch;
    cur.endMs = end;
  });
  if (cur) words.push(cur);
  return words;
}

const [only, flag] = process.argv.slice(2);
const key = apiKey();
for (const vo of [...VOICEOVERS, ...CAMPAIGN, ...DEMO, ...V4, ...CINE_A, ...CINE_B, ...TIKTOK]) {
  // « c » = toute la campagne de 30 s, « d » = la campagne de démonstration, « v » = la campagne V4, « k » = Cinematic série A, « b » = Cinematic série B, « t » = TikTok « Survive Your Klausur » ; sinon un id exact.
  if (only && only !== vo.id && !((only === "c" || only === "d" || only === "v" || only === "k" || only === "b" || only === "t") && vo.id.startsWith(only))) continue;
  const mp3 = join(assets, `vo-${vo.id}.mp3`);
  const json = join(assets, `vo-${vo.id}.json`);
  if (existsSync(mp3) && existsSync(json) && flag !== "--force") {
    console.log(`${vo.id} : déjà généré`);
    continue;
  }
  const settings = vo.settings ?? { stability: 0.5, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true, speed: vo.speed ?? 1 };
  const call = (voiceSettings) =>
    fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vo.voiceId}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        text: vo.text,
        model_id: vo.model ?? "eleven_multilingual_v2",
        ...(vo.language ? { language_code: vo.language } : {}),
        voice_settings: voiceSettings,
      }),
    });
  let res = await call(settings);
  // Certains modèles refusent le réglage de débit : on recommence sans lui.
  if ((res.status === 400 || res.status === 422) && "speed" in settings) {
    const { speed: _speed, ...rest } = settings;
    console.log(`${vo.id} : débit refusé par le modèle, voix générée au débit normal`);
    res = await call(rest);
  }
  if (!res.ok) throw new Error(`${vo.id} : ElevenLabs ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  writeFileSync(mp3, Buffer.from(data.audio_base64, "base64"));
  const words = toWords(data.alignment);
  writeFileSync(json, JSON.stringify({ id: vo.id, words }, null, 1) + "\n");
  console.log(`${vo.id} : ${words.length} mots, ${(words.at(-1).endMs / 1000).toFixed(1)} s, ${vo.text.length} caractères`);
}
