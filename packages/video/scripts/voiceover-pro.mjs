// Voix off des 6 vidéos « Pro Marketing » (ElevenLabs, mots horodatés).
//   node scripts/voiceover-pro.mjs                 (les voix manquantes)
//   node scripts/voiceover-pro.mjs en1-panic-hack --force
// Texte = les champs « voice » du storyboard, scène après scène. Résultat :
// public/pro/vo-<id>.mp3 et .json. Clé lue dans le .env de la racine, jamais
// affichée. Coût : ~300 caractères par vidéo (facturés par ElevenLabs).
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const boards = join(here, "../src/pro/storyboards");
const out = join(here, "../public/pro");
const line = readFileSync(join(here, "../../../.env"), "utf8").split(/\r?\n/).find((l) => l.startsWith("ELEVENLABS_API_KEY="));
const key = line?.slice("ELEVENLABS_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
if (!key) throw new Error("ELEVENLABS_API_KEY absente du .env");

function toWords(al) {
  const words = [];
  let cur = null;
  al.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) return void (cur && words.push(cur), (cur = null));
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
for (const file of readdirSync(boards).filter((f) => f.endsWith(".json"))) {
  const board = JSON.parse(readFileSync(join(boards, file), "utf8"));
  if (only && only !== board.id && only !== "--force") continue;
  const mp3 = join(out, `vo-${board.id}.mp3`);
  if (existsSync(mp3) && flag !== "--force" && only !== "--force") {
    console.log(`${board.id} : déjà généré`);
    continue;
  }
  const text = board.scenes.map((s) => s.voice).join(" ");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${board.voiceId}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", language_code: board.lang, voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true } }),
  });
  if (!res.ok) throw new Error(`${board.id} : ElevenLabs ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const words = toWords(data.alignment);
  // Le calage scène par scène compte les mots : il faut le même découpage que le storyboard.
  const expected = text.split(/\s+/).filter(Boolean).length;
  if (words.length !== expected) console.warn(`${board.id} : ${words.length} mots horodatés pour ${expected} attendus — vérifier le calage`);
  writeFileSync(mp3, Buffer.from(data.audio_base64, "base64"));
  writeFileSync(join(out, `vo-${board.id}.json`), JSON.stringify({ id: board.id, words }, null, 1) + "\n");
  console.log(`${board.id} : ${words.length} mots, ${(words.at(-1).endMs / 1000).toFixed(1)} s`);
}
