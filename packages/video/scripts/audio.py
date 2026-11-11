"""Musiques de fond et effets sonores des vidéos TRED, synthétisés par code.

Rien n'est échantillonné : tout est calculé ici (numpy), donc libre de droits.
    uvx --with numpy python scripts/audio.py
Écrit src/assets/music-{fr,de,en}.wav et src/assets/sfx-*.wav.
"""

from __future__ import annotations

import wave
from pathlib import Path

import numpy as np

SR = 44100
OUT = Path(__file__).resolve().parent.parent / "src" / "assets"
rng = np.random.default_rng(7)


# ── Outils ───────────────────────────────────────────────────────────────
def t_axis(sec: float) -> np.ndarray:
    return np.arange(int(sec * SR)) / SR


def midi(n: float) -> float:
    return 440.0 * 2 ** ((n - 69) / 12)


def lowpass_fft(x: np.ndarray, cutoff: float, slope: float = 2.0) -> np.ndarray:
    """Passe-bas doux dans le domaine fréquentiel (pour les longues pistes)."""
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    spec *= 1 / (1 + (f / cutoff) ** (2 * slope)) ** 0.5
    return np.fft.irfft(spec, len(x))


def highpass_fft(x: np.ndarray, cutoff: float) -> np.ndarray:
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    spec *= 1 - 1 / (1 + (f / cutoff) ** 4) ** 0.5
    return np.fft.irfft(spec, len(x))


def reverb(x: np.ndarray, seconds: float = 2.2, wet: float = 0.25, seed: int = 1) -> np.ndarray:
    """Réverbération par convolution avec un bruit à décroissance exponentielle (stéréo)."""
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    env = np.exp(-6.0 * np.arange(n) / n)
    out = []
    for ch in range(2):
        ir = r.standard_normal(n) * env
        ir = lowpass_fft(ir, 5000)
        ir /= np.sqrt(np.sum(ir**2))
        size = len(x) + n
        y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
        out.append(y)
    dry = np.stack([x, x])
    return (1 - wet) * dry + wet * np.stack(out)


def adsr(n: int, a: float, d: float, s: float, r: float) -> np.ndarray:
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    s_n = max(0, n - a_n - d_n - r_n)
    env = np.concatenate(
        [
            np.linspace(0, 1, a_n, endpoint=False),
            np.linspace(1, s, d_n, endpoint=False),
            np.full(s_n, s),
            np.linspace(s, 0, r_n),
        ]
    )
    return np.pad(env, (0, max(0, n - len(env))))[:n]


def place(track: np.ndarray, sound: np.ndarray, at: float, gain: float = 1.0) -> None:
    i = int(at * SR)
    if i >= track.shape[-1]:
        return
    n = min(sound.shape[-1], track.shape[-1] - i)
    track[..., i : i + n] += gain * sound[..., :n]


# ── Instruments ──────────────────────────────────────────────────────────
def pad(notes: list[int], sec: float, bright: float = 1800) -> np.ndarray:
    t = t_axis(sec)
    x = np.zeros_like(t)
    for n in notes:
        for det in (-0.08, 0.0, 0.07):
            f = midi(n + det)
            # dent de scie douce (6 harmoniques)
            x += sum(np.sin(2 * np.pi * f * k * t) / k for k in range(1, 7))
    x = lowpass_fft(x, bright)
    return x * adsr(len(t), 0.9, 0.5, 0.8, 1.2) / (len(notes) * 6)


def pluck(note: float, sec: float = 0.9, tone: float = 1.0) -> np.ndarray:
    t = t_axis(sec)
    f = midi(note)
    x = (
        np.sin(2 * np.pi * f * t)
        + 0.45 * tone * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 9)
        + 0.2 * tone * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t * 14)
    )
    return x * np.exp(-t * 4.5) * adsr(len(t), 0.004, 0.0, 1.0, 0.05)


def bell(note: float, sec: float = 1.6) -> np.ndarray:
    t = t_axis(sec)
    f = midi(note)
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2.76 * f * t) * np.exp(-t * 5)
    return x * np.exp(-t * 3.2) * adsr(len(t), 0.002, 0, 1, 0.1)


def kick(sec: float = 0.45, depth: float = 1.0) -> np.ndarray:
    t = t_axis(sec)
    f = 45 + 85 * np.exp(-t * 28)
    phase = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(phase) * np.exp(-t * 7.5) * depth
    click = rng.standard_normal(len(t)) * np.exp(-t * 400) * 0.15
    return np.tanh(1.4 * (x + click))


def hat(sec: float = 0.06, open_: bool = False) -> np.ndarray:
    t = t_axis(0.25 if open_ else sec)
    x = highpass_fft(rng.standard_normal(len(t)), 7000)
    return x * np.exp(-t * (14 if open_ else 70)) * 0.5


def clap() -> np.ndarray:
    t = t_axis(0.3)
    n = highpass_fft(rng.standard_normal(len(t)), 1200)
    env = np.zeros_like(t)
    for off in (0, 0.011, 0.022):
        env += np.where(t >= off, np.exp(-(t - off) * 60), 0)
    env += np.exp(-t * 18) * 0.5
    return n * env * 0.4


def sub(note: int, sec: float) -> np.ndarray:
    t = t_axis(sec)
    x = np.sin(2 * np.pi * midi(note) * t)
    return np.tanh(1.6 * x) * adsr(len(t), 0.01, 0.1, 0.85, 0.08) * 0.55


def taiko() -> np.ndarray:
    t = t_axis(1.2)
    f = 60 + 40 * np.exp(-t * 18)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 4)
    noise = lowpass_fft(rng.standard_normal(len(t)), 900) * np.exp(-t * 20) * 0.6
    return np.tanh(1.8 * (x + noise))


def riser(sec: float) -> np.ndarray:
    t = t_axis(sec)
    n = rng.standard_normal(len(t))
    # balayage de filtre : on mélange un bruit grave et un bruit aigu
    lo, hi = lowpass_fft(n, 600), highpass_fft(n, 3000)
    mix = (1 - t / sec) * lo + (t / sec) * hi
    return mix * (t / sec) ** 2 * 0.5


# ── Pistes ───────────────────────────────────────────────────────────────
def song(bpm: float, sec: float, chords: list[list[int]], style: str) -> np.ndarray:
    beat = 60 / bpm
    bar = 4 * beat
    mono = np.zeros(int(sec * SR))
    drums = np.zeros_like(mono)
    n_bars = int(np.ceil(sec / bar))
    end = sec - 2.5  # les 2,5 dernières secondes : on laisse sonner

    for b in range(n_bars):
        t0 = b * bar
        if t0 >= end:
            break
        ch = chords[b % len(chords)]
        place(mono, pad(ch, bar + 1.2, 1500 if style == "cine" else 2200), t0, 0.9)

        if style == "warm":  # FR : arpège de piano doux, kick léger
            arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 12]
            for i in range(8):
                place(mono, pluck(arp[i % 4], tone=0.8), t0 + i * beat / 2, 0.16 if i % 2 else 0.22)
            place(mono, sub(ch[0] - 12, bar * 0.95), t0, 0.5)
            if b >= 1:
                for k in (0, 2):
                    place(drums, kick(depth=0.8), t0 + k * beat, 0.55)
                for i in range(8):
                    place(drums, hat(), t0 + i * beat / 2 + beat / 4 * (i % 2), 0.18)

        elif style == "drive":  # DE : arpège en doubles croches, 4 temps
            arp = [ch[0] + 12, ch[2] + 12, ch[1] + 24, ch[2] + 12]
            for i in range(16):
                place(mono, pluck(arp[i % 4], 0.35, tone=1.3), t0 + i * beat / 4, 0.12)
            for k in range(4):
                place(mono, sub(ch[0] - 12, beat * 0.9), t0 + k * beat, 0.55)
            if b >= 1:
                for k in range(4):
                    place(drums, kick(), t0 + k * beat, 0.7)
                    place(drums, hat(), t0 + k * beat + beat / 2, 0.25)
                for k in (1, 3):
                    place(drums, clap(), t0 + k * beat, 0.45)

        else:  # EN : cinématique, taïkos, cloches
            place(mono, sub(ch[0] - 12, bar * 0.98), t0, 0.6)
            place(drums, taiko(), t0, 0.7)
            if b >= 1:
                place(drums, taiko(), t0 + 2.5 * beat, 0.45)
                place(drums, taiko(), t0 + 3 * beat, 0.35)
            for i, n in enumerate([ch[0] + 24, ch[2] + 12, ch[1] + 24]):
                place(mono, bell(n), t0 + (i * 1.5 + 0.5) * beat, 0.12)

    # fin : un dernier accord tenu + coup final
    last = chords[0]
    place(mono, pad(last, 3.0), end, 0.9)
    place(mono, bell(last[0] + 24, 2.5), end, 0.18)
    place(drums, kick(depth=1.0) if style != "cine" else taiko(), end, 0.6)

    # montée vers la fin de chaque vidéo (outro)
    place(mono, riser(1.5), end - 1.5, 0.35)

    stereo = reverb(mono, 2.4 if style == "cine" else 1.8, 0.3) + np.stack([drums, drums]) * 0.9
    # fondu de sortie
    fade = np.ones(stereo.shape[1])
    n_f = int(1.2 * SR)
    fade[-n_f:] = np.linspace(1, 0, n_f) ** 2
    stereo *= fade
    return stereo / np.max(np.abs(stereo)) * 0.85


# ── Effets sonores ───────────────────────────────────────────────────────
def sfx_click() -> np.ndarray:
    t = t_axis(0.09)
    x = np.sin(2 * np.pi * 2300 * t) * np.exp(-t * 90) + rng.standard_normal(len(t)) * np.exp(-t * 700) * 0.4
    return np.stack([x, x]) * 0.7


def sfx_success() -> np.ndarray:
    out = np.zeros(int(1.6 * SR))
    for i, n in enumerate([84, 88, 91]):  # do – mi – sol, aigus
        place(out, bell(n, 1.3), i * 0.085, 0.45)
    return reverb(out, 1.2, 0.3, seed=3) * 0.9


def sfx_whoosh() -> np.ndarray:
    t = t_axis(0.55)
    n = rng.standard_normal(len(t))
    sweep = (np.sin(np.pi * t / t[-1])) ** 2
    lo, hi = lowpass_fft(n, 800), highpass_fft(n, 2500)
    x = (lo * (1 - t / t[-1]) + hi * (t / t[-1])) * sweep * 0.6
    return np.stack([x * (1 - t / t[-1] * 0.5), x * (0.5 + t / t[-1] * 0.5)])


def sfx_pop() -> np.ndarray:
    t = t_axis(0.12)
    f = 900 * np.exp(-t * 18) + 250
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 35)
    return np.stack([x, x]) * 0.6


def sfx_type() -> np.ndarray:
    t = t_axis(0.04)
    x = highpass_fft(rng.standard_normal(len(t)), 3000) * np.exp(-t * 300)
    return np.stack([x, x]) * 0.35


def write(name: str, x: np.ndarray) -> None:
    if x.ndim == 1:
        x = np.stack([x, x])
    pcm = (np.clip(x.T, -1, 1) * 32767).astype("<i2")
    with wave.open(str(OUT / name), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"{name}: {x.shape[1] / SR:.1f} s")


SERIES = {
    # Série « université universelle » (45 s) : trois styles, deux tonalités chacun.
    "en1": (100, [[55, 59, 62, 66], [52, 59, 64, 67], [48, 55, 60, 64], [50, 57, 62, 66]], "warm"),   # sol majeur
    "de1": (92, [[50, 57, 62, 66], [47, 54, 59, 62], [43, 50, 55, 59], [45, 52, 57, 61]], "warm"),    # ré majeur
    "en2": (120, [[52, 55, 59, 64], [48, 55, 60, 64], [43, 50, 55, 59], [50, 54, 57, 62]], "drive"),  # mi mineur
    "de2": (112, [[45, 52, 57, 60], [41, 53, 57, 60], [43, 55, 59, 62], [40, 52, 55, 59]], "drive"),  # la mineur
    "en3": (88, [[48, 55, 60, 63], [44, 51, 56, 60], [46, 53, 58, 62], [43, 50, 55, 59]], "cine"),    # do mineur
    "de3": (94, [[53, 57, 60, 65], [50, 57, 62, 65], [46, 53, 58, 62], [48, 55, 60, 64]], "cine"),    # fa majeur
}

CAMPAIGN = {
    # Campagne « parle comme un ami » (30 s) : une piste par vidéo, EN et DE dans des tonalités voisines.
    "c1-en": (118, [[52, 55, 59, 64], [48, 55, 60, 64], [43, 50, 55, 59], [50, 54, 57, 62]], "drive"),  # mi mineur, énergique
    "c1-de": (114, [[45, 52, 57, 60], [41, 53, 57, 60], [43, 55, 59, 62], [40, 52, 55, 59]], "drive"),  # la mineur
    "c2-en": (98, [[55, 59, 62, 66], [52, 59, 64, 67], [48, 55, 60, 64], [50, 57, 62, 66]], "warm"),    # sol majeur, curieux
    "c2-de": (96, [[50, 57, 62, 66], [47, 54, 59, 62], [43, 50, 55, 59], [45, 52, 57, 61]], "warm"),    # ré majeur
    "c3-en": (90, [[48, 55, 60, 63], [44, 51, 56, 60], [46, 53, 58, 62], [43, 50, 55, 59]], "cine"),    # do mineur, précis
    "c3-de": (92, [[53, 56, 60, 65], [49, 56, 61, 65], [51, 58, 63, 67], [48, 55, 60, 64]], "cine"),    # fa mineur
    "c4-en": (126, [[50, 53, 57, 62], [46, 53, 58, 62], [48, 55, 60, 64], [45, 52, 57, 61]], "drive"),  # ré mineur, urgence
    "c4-de": (124, [[47, 50, 54, 59], [43, 50, 55, 59], [45, 52, 57, 61], [42, 49, 54, 58]], "drive"),  # si mineur
    "c5-en": (102, [[53, 57, 60, 64], [50, 57, 62, 65], [46, 53, 58, 62], [48, 55, 60, 64]], "warm"),   # fa majeur, léger
    "c5-de": (100, [[48, 52, 55, 59], [45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59]], "warm"),   # do majeur
}

if __name__ == "__main__":
    import sys

    OUT.mkdir(parents=True, exist_ok=True)
    if len(sys.argv) > 1 and sys.argv[1] == "campaign":
        for key, (bpm, chords, style) in CAMPAIGN.items():
            write(f"music-{key}.wav", song(bpm, 30.5, chords, style))
        raise SystemExit
    if len(sys.argv) > 1 and sys.argv[1] == "series":
        for key, (bpm, chords, style) in SERIES.items():
            write(f"music-{key}.wav", song(bpm, 45.5, chords, style))
        raise SystemExit
    F, A, D, Bb, C, G = 53, 57, 50, 46, 48, 55
    write("music-fr.wav", song(96, 30.5, [[F, 57, 60, 64], [A - 12, 60, 64, 67], [D, 57, 60, 65], [Bb, 57, 62, 65]], "warm"))
    write("music-de.wav", song(116, 30.5, [[D, 53, 57, 62], [Bb, 53, 58, 62], [F, 57, 60, 65], [C, 55, 60, 64]], "drive"))
    write("music-en.wav", song(90, 30.5, [[45, 52, 57, 60], [41, 53, 57, 60], [48, 52, 55, 60], [43, 50, 55, 59]], "cine"))
    write("sfx-click.wav", sfx_click())
    write("sfx-success.wav", sfx_success())
    write("sfx-whoosh.wav", sfx_whoosh())
    write("sfx-pop.wav", sfx_pop())
    write("sfx-type.wav", sfx_type())
