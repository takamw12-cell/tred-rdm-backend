# Voix et musique des vidéos « Pro Marketing »

Déposer ici, puis relancer `npm run render:marketing-all` :

- `music.wav` — la musique de fond lofi, SYNTHÉTISÉE par `node scripts/lofi-music.mjs` (aucun échantillon : libre de droits), jouée en boucle à −20 dB. Générée automatiquement par `render:marketing-all` si elle manque.
  Pour la remplacer par une autre musique : `music.mp3` (prioritaire sur le .wav).
  Une musique propre à une vidéo : `music-<id>.mp3` (ex. `music-en1-panic-hack.mp3`).
- `vo-<id>.mp3` et `vo-<id>.json` — la voix off et ses mots horodatés,
  générés par `npm run voiceover:marketing` (ElevenLabs, clé lue dans le .env de la racine).

Sans voix : les sous-titres défilent au rythme du storyboard. Sans musique : silence.
Les identifiants (`<id>`) sont les noms des fichiers de `src/pro/storyboards/`.
