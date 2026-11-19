# Voix et musique des vidéos « Pro Marketing »

Déposer ici, puis relancer `npm run render:marketing-all` :

- `music.mp3` — la musique de fond (lofi), commune aux 6 vidéos, jouée à −20 dB.
  Une musique propre à une vidéo : `music-<id>.mp3` (ex. `music-en1-panic-hack.mp3`).
- `vo-<id>.mp3` et `vo-<id>.json` — la voix off et ses mots horodatés,
  générés par `npm run voiceover:marketing` (ElevenLabs, clé lue dans le .env de la racine).

Sans voix : les sous-titres défilent au rythme du storyboard. Sans musique : silence.
Les identifiants (`<id>`) sont les noms des fichiers de `src/pro/storyboards/`.
