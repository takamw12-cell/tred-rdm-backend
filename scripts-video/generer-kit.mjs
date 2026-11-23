// Kit de production vidéo (HeyGen + Canva) : écrit les textes et les voix.
//   node scripts-video/generer-kit.mjs            textes + voix manquantes
//   node scripts-video/generer-kit.mjs --textes   textes seulement (aucun appel payant)
//   node scripts-video/generer-kit.mjs --force    refait toutes les voix
// Sortie : ../video-production/{scripts,voix}/ (hors du dépôt). La clé ElevenLabs
// est lue dans le .env de la racine et n'est jamais affichée. ElevenLabs facture
// au caractère : ~190 caractères par voix.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const kit = join(here, "../../video-production");
const { scripts } = JSON.parse(readFileSync(join(here, "scripts.json"), "utf8"));
const flags = new Set(process.argv.slice(2));
for (const d of ["scripts", "voix", "assets"]) mkdirSync(join(kit, d), { recursive: true });

const takes = scripts.map((s) => ({ ...s, file: s.id, body: s.text }));
for (const t of takes) writeFileSync(join(kit, "scripts", `${t.file}.txt`), t.body + "\n");

const seconds = (text) => Math.round((text.split(/\s+/).length / 2.6) * 10) / 10;
const sheet = ["# Scripts HeyGen — TRED", "", "Le texte à coller dans HeyGen est dans le fichier `.txt` du même nom (les mots seuls).", ""];
for (const s of scripts) {
  sheet.push(`## ${s.id} — ${s.focus} (${s.lang.toUpperCase()})`, "", `- **Texte HeyGen :** ${s.text}`, `- **Ton :** ${s.tone}`, `- **Titre Canva :** ${s.canvaTitle}`, `- **Voix ElevenLabs :** ${s.voiceName} → \`voix/${s.id}.mp3\``, `- **Durée estimée :** ${seconds(s.text)} s`);
  sheet.push("");
}
writeFileSync(join(kit, "scripts", "LISEZMOI.md"), sheet.join("\n"));
console.log(`${takes.length} textes écrits`);
if (flags.has("--textes")) process.exit(0);

const line = readFileSync(join(here, "../.env"), "utf8").split(/\r?\n/).find((l) => l.startsWith("ELEVENLABS_API_KEY="));
const key = line?.slice("ELEVENLABS_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
if (!key) throw new Error("ELEVENLABS_API_KEY absente du .env");
for (const t of takes) {
  const mp3 = join(kit, "voix", `${t.file}.mp3`);
  if (existsSync(mp3) && !flags.has("--force")) {
    console.log(`${t.file} : déjà généré`);
    continue;
  }
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${t.voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text: t.body, model_id: "eleven_multilingual_v2", language_code: t.lang, voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true } }),
  });
  if (!res.ok) throw new Error(`${t.file} : ElevenLabs ${res.status} ${(await res.text()).slice(0, 200)}`);
  const audio = Buffer.from(await res.arrayBuffer());
  writeFileSync(mp3, audio);
  console.log(`${t.file} : ${Math.round(audio.length / 1024)} Ko, ~${(audio.length / 16000).toFixed(1)} s`);
}
