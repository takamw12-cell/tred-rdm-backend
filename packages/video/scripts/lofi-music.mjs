// Musique d'ambiance « lofi » des vidéos Pro Marketing, SYNTHÉTISÉE ici :
// aucun échantillon, aucun fichier externe → 100 % libre de droits.
//
//   node scripts/lofi-music.mjs            → les 3 ambiances, une piste par vidéo :
//     public/pro/music-<id>.wav (et music.wav = « focus », piste par défaut)
//   node scripts/lofi-music.mjs cosy       → une seule ambiance
//
// Trois ambiances (STYLES ci-dessous) :
//   focus    EN 1 / DE 1 (Panik, Klausur) : lofi calme, basse plus présente
//   chillhop EN 2 / DE 2 (3D, Arcade, Deep-Dive) : plus rapide, mélodie de piano
//   cosy     EN 3 / DE 3 (Professeur, Lernprofil) : très doux, feutré, beaucoup de vinyle
//
// Pourquoi un fichier et pas Web Audio dans la composition : Remotion rend
// chaque image dans Chrome mais assemble le son à partir de FICHIERS ; un son
// joué par Web Audio pendant le rendu n'est jamais enregistré. On calcule donc
// la piste ici (déterministe : même graine → même fichier), et la composition
// la lit en boucle à −20 dB.
//
// Recette : 72 BPM, 8 mesures (26,7 s) qui bouclent sans couture (tout ce qui
// déborde de la fin — résonances, réverbération — est replié au début).
//   · piano électrique doux (sinus + harmoniques, léger « wow » de bande),
//     accords Fmaj7 – Em7 – Dm9 – Cmaj9, arpégés à la main ;
//   · basse ronde, grosse caisse feutrée, caisse claire balai, charleston swingué ;
//   · filtre passe-bas sur l'ensemble (côté « cassette ») ;
//   · bruit de vinyle (souffle + craquements), réverbération légère.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SR = 44100;
const BARS = 8;

const STYLES = {
  focus: {
    bpm: 72, seed: 0x7ed, bass: 0.48, kick: 0.5, snare: 0.09, hats: 1, cutoff: 2200, hiss: 0.05, crackles: 5, melody: false,
    chords: [[41, [53, 57, 60, 64]], [40, [52, 55, 59, 62]], [38, [50, 53, 57, 60, 64]], [36, [48, 52, 55, 59, 62]]], // Fmaj7 Em7 Dm9 Cmaj9
    videos: ["en1-panic-hack", "de1-klausur-rettung"],
  },
  chillhop: {
    bpm: 86, seed: 0x5eed, bass: 0.36, kick: 0.55, snare: 0.12, hats: 1.4, cutoff: 3000, hiss: 0.035, crackles: 4, melody: true,
    chords: [[45, [57, 60, 64, 67, 71]], [38, [50, 53, 57, 60, 64]], [43, [55, 59, 62, 64, 65]], [36, [48, 52, 55, 59, 62]]], // Am9 Dm9 G13 Cmaj9
    videos: ["en2-3d-arcade", "de2-technischer-deep-dive"],
  },
  cosy: {
    bpm: 64, seed: 0xc05, bass: 0.26, kick: 0.22, snare: 0.0, hats: 0.5, cutoff: 1400, hiss: 0.12, crackles: 14, melody: false,
    chords: [[49, [56, 60, 63, 65]], [48, [55, 58, 63, 65]], [46, [53, 56, 60, 65]], [44, [51, 55, 60, 63]]], // Dbmaj7 Cm7 Bbm9 Abmaj7
    videos: ["en3-personal-professor", "de3-lernprofil"],
  },
};

function render(name, st) {
const BPM = st.bpm;
const BEAT = 60 / BPM;
const N = Math.round(BARS * 4 * BEAT * SR);

// Générateur pseudo-aléatoire à graine (mulberry32) : le fichier est toujours identique.
let seed = st.seed;
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const L = new Float32Array(N);
const R = new Float32Array(N);
const add = (i, l, r) => {
  const k = ((i % N) + N) % N; // repli circulaire : la boucle n'a pas de couture
  L[k] += l;
  R[k] += r;
};
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

/* ── Piano électrique ─────────────────────────────────────────────────── */
function epiano(t0, midi, vel, pan, length = 3.2) {
  const f = hz(midi);
  const start = Math.round(t0 * SR);
  const len = Math.round(length * SR);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const wow = 1 + 0.0025 * Math.sin(2 * Math.PI * 0.55 * (t0 + t)); // bande qui pleure un peu
    const ph = 2 * Math.PI * f * wow * t;
    const env = Math.min(1, t / 0.006) * Math.exp(-t / 1.6) * (n > len - 2000 ? (len - n) / 2000 : 1);
    const bell = Math.exp(-t / 0.25);
    const s = (Math.sin(ph + 0.6 * bell * Math.sin(ph * 2)) + 0.28 * Math.sin(2 * ph) * Math.exp(-t / 0.7) + 0.1 * Math.sin(3 * ph) * bell) * env * vel;
    add(start + n, s * (1 - pan) * 0.9, s * pan * 0.9);
  }
}

/* ── Basse, batterie feutrée ──────────────────────────────────────────── */
function bass(t0, midi, length) {
  const f = hz(midi);
  const start = Math.round(t0 * SR);
  const len = Math.round(length * SR);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const env = Math.min(1, t / 0.01) * Math.exp(-t / 0.9) * Math.min(1, (len - n) / 800);
    const s = (Math.sin(2 * Math.PI * f * t) + 0.15 * Math.sin(4 * Math.PI * f * t)) * env * st.bass;
    add(start + n, s, s);
  }
}
function kick(t0, vel = 1) {
  const start = Math.round(t0 * SR);
  let ph = 0;
  for (let n = 0; n < 0.35 * SR; n++) {
    const t = n / SR;
    ph += (2 * Math.PI * (48 + 70 * Math.exp(-t / 0.04))) / SR;
    const s = Math.sin(ph) * Math.exp(-t / 0.12) * st.kick * vel;
    add(start + n, s, s);
  }
}
function noiseHit(t0, decay, gain, cutoff, pan = 0.5) {
  // bruit filtré (passe-bas à un pôle) : caisse claire « balai » ou charleston
  const start = Math.round(t0 * SR);
  const a = Math.exp((-2 * Math.PI * cutoff) / SR);
  let y = 0;
  let prev = 0;
  for (let n = 0; n < decay * 6 * SR; n++) {
    const x = rnd() * 2 - 1;
    y = (1 - a) * x + a * y;
    const hp = y - prev; // un peu de passe-haut pour le charleston
    prev = y;
    const s = (cutoff > 5000 ? hp * 3 : y) * Math.exp(-n / SR / decay) * gain;
    add(start + n, s * (1 - pan) * 2, s * pan * 2);
  }
}

/* ── La partition ─────────────────────────────────────────────────────── */
const CHORDS = st.chords.map(([root, notes]) => ({ root, notes }));
for (let bar = 0; bar < BARS; bar++) {
  const t = bar * 4 * BEAT;
  const c = CHORDS[bar % 4];
  // accord arpégé à la main, puis rappel plus doux sur le temps 3 (et demi)
  c.notes.forEach((m, i) => epiano(t + i * 0.035 + rnd() * 0.01, m, 0.16 - i * 0.012, 0.35 + 0.3 * (i / c.notes.length)));
  c.notes.slice(1).forEach((m, i) => epiano(t + 2.5 * BEAT + i * 0.03, m + (i === 2 ? 12 : 0), 0.08, 0.65 - 0.3 * (i / 3), 2.2));
  bass(t, c.root, 2.2 * BEAT);
  bass(t + 2.5 * BEAT, c.root + (bar % 2 ? 7 : 0), 1.4 * BEAT);
  kick(t);
  kick(t + 2.5 * BEAT, 0.8);
  if (st.snare) {
    noiseHit(t + BEAT, 0.09, st.snare, 2600, 0.45);
    noiseHit(t + 3 * BEAT, 0.09, st.snare, 2600, 0.45);
  }
  for (let e = 0; e < 8; e++) {
    const swing = e % 2 ? 0.16 * BEAT : 0; // croches swinguées
    noiseHit(t + (e * BEAT) / 2 + swing, 0.025, (e % 2 ? 0.035 : 0.05) * st.hats, 9000, 0.6);
  }
  if (st.melody) {
    // Chillhop : une petite phrase de piano aigu, notes de l'accord une octave plus haut, rythme syncopé.
    const top = c.notes.map((m) => m + 12);
    const steps = [0, 1.5, 2, 3, 3.5];
    const order = bar % 2 ? [3, 2, 1, 2, 0] : [1, 2, 3, 4 % top.length, 2];
    steps.forEach((b, i) => epiano(t + b * BEAT, top[order[i] % top.length], 0.085, 0.62, 1.2));
  }
}

/* ── Passe-bas « cassette » (deux tours pour que la boucle soit continue) ── */
function lowpass(buf, cutoff) {
  const a = Math.exp((-2 * Math.PI * cutoff) / SR);
  let y = 0;
  for (let pass = 0; pass < 2; pass++) for (let n = 0; n < N; n++) buf[n] = y = (1 - a) * buf[n] + a * y;
}
lowpass(L, st.cutoff);
lowpass(R, st.cutoff);

/* ── Réverbération légère (Schroeder : 4 peignes, circulaires) ─────────── */
function reverb(src, offs) {
  const wet = new Float32Array(N);
  for (const [d, g] of [[1557 + offs, 0.77], [1617 + offs, 0.75], [1491 + offs, 0.74], [1422 + offs, 0.73]]) {
    const buf = new Float32Array(N);
    for (let pass = 0; pass < 3; pass++) for (let n = 0; n < N; n++) buf[n] = src[n] + g * buf[(n - d + N) % N];
    for (let n = 0; n < N; n++) wet[n] += buf[n] * 0.06;
  }
  return wet;
}
const wl = reverb(L, 0);
const wr = reverb(R, 23);
for (let n = 0; n < N; n++) {
  L[n] += wl[n];
  R[n] += wr[n];
}

/* ── Vinyle : souffle doux et craquements ─────────────────────────────── */
{
  let b = 0;
  for (let n = 0; n < N; n++) {
    b = 0.97 * b + 0.03 * (rnd() * 2 - 1); // souffle grave
    const crackle = rnd() < st.crackles / SR ? (rnd() * 2 - 1) * 0.12 : 0; // craquements par seconde
    L[n] += b * st.hiss + crackle;
    R[n] += b * st.hiss + crackle * 0.8;
  }
}

/* ── Normalisation et écriture WAV 16 bits stéréo ─────────────────────── */
let peak = 0;
for (let n = 0; n < N; n++) peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
const gain = 0.89 / peak;
const data = Buffer.alloc(N * 4);
for (let n = 0; n < N; n++) {
  data.writeInt16LE(Math.round(Math.tanh(L[n] * gain) * 32767), n * 4);
  data.writeInt16LE(Math.round(Math.tanh(R[n] * gain) * 32767), n * 4 + 2);
}
const head = Buffer.alloc(44);
head.write("RIFF", 0);
head.writeUInt32LE(36 + data.length, 4);
head.write("WAVEfmt ", 8);
head.writeUInt32LE(16, 16);
head.writeUInt16LE(1, 20);
head.writeUInt16LE(2, 22);
head.writeUInt32LE(SR, 24);
head.writeUInt32LE(SR * 4, 28);
head.writeUInt16LE(4, 32);
head.writeUInt16LE(16, 34);
head.write("data", 36);
head.writeUInt32LE(data.length, 40);
const wav = Buffer.concat([head, data]);
const dir = join(here, "../public/pro");
mkdirSync(dir, { recursive: true });
for (const id of st.videos) writeFileSync(join(dir, `music-${id}.wav`), wav);
if (name === "focus") writeFileSync(join(dir, "music.wav"), wav);
console.log(`${name} : ${(N / SR).toFixed(1)} s, ${BARS} mesures à ${BPM} BPM → ${st.videos.join(", ")}`);
}

const only = process.argv[2];
for (const [name, st] of Object.entries(STYLES)) if (!only || only === name) render(name, st);
