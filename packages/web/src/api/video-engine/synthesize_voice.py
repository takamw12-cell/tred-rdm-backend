#!/usr/bin/env python3
"""TRED — la voix off de « Als Video erklären » par Edge-TTS.

    python -I -B -X utf8 synthesize_voice.py --voice de-DE-KatjaNeural --out voix.mp3 < texte.json

Entrée standard : {"segments": ["voix de la scène 1", "voix de la scène 2", …]}.
Sortie : UN MP3 (les scènes bout à bout) et, sur la sortie standard, une ligne
JSON avec l'instant de chaque mot, scène par scène :

    {"ok": true, "segments": [{"start_ms": 0, "end_ms": 4810,
        "words": [{"text": "Die", "start_ms": 100, "end_ms": 262}, …]}, …]}

Ces instants viennent du service lui-même (événements « WordBoundary ») : le
dessin se cale dessus sans passer par une reconnaissance vocale. Chaque scène
est synthétisée à part, donc son début est connu exactement, quelle que soit la
façon dont la langue découpe ses mots (chinois, japonais…).

⚠ Edge-TTS n'est PAS une API officielle : la bibliothèque parle au service de
lecture à voix haute du navigateur Edge. Le texte du script part chez
Microsoft, sans contrat ni garantie de disponibilité. C'est pourquoi cette voix
ne sert que si le serveur est réglé pour (`VIDEO_VOICE_PROVIDER=edge`) ; voir
GUIDE_FOUNDER.md, « Vidéos dessinées ».
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys

MAX_TEXT = 6000
MAX_SEGMENTS = 20
VOICE_NAME = re.compile(r"^[a-z]{2,3}-[A-Za-z]{2,4}(-[A-Za-z]+)?-[A-Za-z]+Neural$")


def emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=True) + "\n")
    sys.stdout.flush()


# Le service rend du MP3 à débit constant (24 kHz, 48 kbit/s) : la durée se lit sur la taille.
MP3_BYTES_PER_MS = 48_000 / 8 / 1000


async def synthesize(segments: list[str], voice: str, rate: str, out_path: str) -> list[dict]:
    import edge_tts

    out: list[dict] = []
    offset = 0.0
    with open(out_path, "wb") as fh:
        for text in segments:
            words: list[dict] = []
            size = 0
            speech = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary", connect_timeout=15, receive_timeout=60)
            async for chunk in speech.stream():
                if chunk["type"] == "audio":
                    fh.write(chunk["data"])
                    size += len(chunk["data"])
                elif chunk["type"] == "WordBoundary":
                    # Le service compte en pas de 100 nanosecondes.
                    start = offset + chunk["offset"] / 10_000
                    words.append({"text": chunk["text"], "start_ms": round(start), "end_ms": round(start + chunk["duration"] / 10_000)})
            if size == 0 or not words:
                raise RuntimeError("segment sans audio")
            length = size / MP3_BYTES_PER_MS
            out.append({"start_ms": round(offset), "end_ms": round(offset + length), "words": words})
            offset += length
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="TRED — texte → voix (MP3) + instants des mots")
    parser.add_argument("--voice", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--rate", default="+0%")
    args = parser.parse_args()
    try:
        if not VOICE_NAME.match(args.voice) or not re.match(r"^[+-]\d{1,2}%$", args.rate):
            emit({"ok": False, "error": "invalid_voice"})
            return 2
        payload = json.loads(sys.stdin.read())
        segments = payload.get("segments") if isinstance(payload, dict) else None
        if not isinstance(segments, list) or not (1 <= len(segments) <= MAX_SEGMENTS) or not all(isinstance(t, str) and t.strip() for t in segments) or sum(len(t) for t in segments) > MAX_TEXT:
            emit({"ok": False, "error": "invalid_text"})
            return 2
        done = asyncio.run(synthesize([" ".join(t.split()) for t in segments], args.voice, args.rate, args.out))
        emit({"ok": True, "voice": args.voice, "segments": done})
        return 0
    except Exception as exc:  # noqa: BLE001 — la dernière ligne doit toujours être un résultat lisible
        emit({"ok": False, "error": "voice_failed", "detail": f"{type(exc).__name__}: {exc}"[:300]})
        return 1


if __name__ == "__main__":
    sys.exit(main())
