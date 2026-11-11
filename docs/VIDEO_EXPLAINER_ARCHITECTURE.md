# Architecture — « Als Video erklären » (vidéo explicative sur mesure)

> Statut : **validé par le fondateur le 11 novembre 2026. Backend, lecteur et tableau de bord codés ; export MP4 à venir.**
> Rédigé le 11 novembre 2026. À ne pas confondre avec `VIDEO_ARCHITECTURE.md` (génération vidéo par modèle, Grok / Runway).

## Le principe

Le bouton « Als Video erklären » du chat produit une explication vidéo du point exact qui bloque l'étudiant : la Tafel, les formules KaTeX, ses fonds d'écran, une voix ElevenLabs naturelle. La vidéo est **100 % fondée sur ses documents et sur les solveurs** : l'IA qui écrit le script n'invente rien.

## Décisions

| Sujet | Décision |
|---|---|
| Durée | **Dynamique, de 30 s à 3 min.** C'est la longueur du script qui la fixe ; la composition prend la durée de l'audio. Aucune durée fixe dans le code. |
| Langue | **La langue d'interface de l'étudiant** (`language` dans la requête : fr, en, de, es… les dix langues de `api/lib/languages.ts`). Script et voix dans cette langue ; formules et termes techniques du document dans leur langue d'origine. |
| Lecture | Lecteur Remotion dans le chat (la composition jouée en direct). Prête 15 à 25 s après le clic, quelle que soit la durée de la vidéo. |
| MP4 | Plus tard, à la demande (Remotion Lambda), pour le téléchargement et le partage. |
| Schémas | Uniquement ceux des solveurs (poutre, CircuiTikz) ou de la Tafel. Plus aucun SVG dessiné par le modèle. |

## Le pipeline

```
Clic « Als Video erklären »
  → POST /api/video/generate   { question, chatId, messageId, language, docId?, semesterId? }
      crée la ligne generated_video (pending) et répond tout de suite { id }
      1. Sources   : extraits du cours (selectRelevantContext) + résultats de solveurs du chat
      2. Script    : Claude, JSON strict, dans la langue demandée, chaque scène cite sa source
      3. Contrôle  : code qui rejette toute formule ou tout nombre sans source
      4. Voix      : ElevenLabs with-timestamps → MP3 sur R2 + horodatage mot par mot
      5. done      : durationMs = fin du dernier mot + 1,5 s
  ← GET /api/video/:id         (polling : script → voice → done | failed)
  → lecteur dans le chat (composition DynamicExplanation)
```

### La requête

`language` est obligatoire. Une langue inconnue est refusée (`400 unsupported_language`), jamais remplacée en silence par l'allemand.

### Le prompt du script

- Règle stricte : « Tu es un professeur. Tu expliques en te basant UNIQUEMENT sur les extraits de cours fournis et les résultats des solveurs. Si l'information n'est pas dans le document, tu ne l'inventes pas. »
- Règle de langue, écrite dans la langue de l'étudiant et placée en tête et en fin de prompt (même méthode que le chat) : « Génère le script et le texte de la voix off en [LANGUE]. Les formules et les termes techniques du document peuvent rester dans leur langue d'origine, mais l'explication est dans la langue de l'étudiant. »
- Règle de durée : le modèle choisit le nombre de scènes selon la difficulté, entre 75 et 450 mots de voix (30 s à 3 min à 150 mots par minute). Le serveur refuse un script hors de ces bornes.

### Le script JSON

```ts
type VideoScript = {
  title: string;
  language: string;
  scenes: {
    heading: string;
    bullets: string[];          // texte à l'écran
    formula?: string;           // LaTeX, rendu par KaTeX
    diagram?: { solver: string; payload: unknown }; // rendu par le solveur, jamais par le modèle
    source: { kind: "document"; title: string; quote: string } | { kind: "solver"; name: string };
    voiceover: string;          // ce que dit la voix pendant cette scène
  }[];
};
```

### Zéro hallucination, vérifiée par du code

- `source.quote` doit se retrouver mot pour mot dans l'extrait fourni.
- Chaque nombre de `formula`, `bullets` et `voiceover` doit apparaître dans les extraits ou dans une sortie de solveur.
- Une scène qui échoue est supprimée. S'il ne reste pas assez de scènes, la vidéo échoue avec un message clair.
- La source s'affiche à l'écran dans chaque scène.

### La voix

- Modèle multilingue d'ElevenLabs avec `language_code` = langue de l'étudiant.
- Voix : celle du professeur choisi par l'étudiant (`ELEVENLABS_VOICE_*`), qui parle toutes les langues du modèle. Une variable optionnelle par langue (`ELEVENLABS_VIDEO_VOICE_ES`, etc.) permet d'imposer une voix native.
- Le budget quotidien par étudiant (`ELEVENLABS_DAILY_CHARS`) et le quota `MEDIA_VIDEO_PER_DAY` s'appliquent.
- Sans `ELEVENLABS_API_KEY`, la route répond `503 not_configured` et le bouton garde son comportement actuel.

## La composition Remotion `DynamicExplanation`

- Props : `audioUrl`, `durationMs`, `words` (horodatage), `scenes`, `backgroundImages`, `language`.
- **Durée calculée, jamais fixe :** `calculateMetadata` renvoie `durationInFrames = ceil(durationMs / 1000 × fps)`. `durationMs` vient de l'horodatage ElevenLabs ; s'il manque, la composition mesure le fichier audio lui-même.
- Chaque scène dure le temps de sa voix (`splitPhrases` / `planVoice`, déjà écrits pour la campagne) : les textes apparaissent au rythme de la voix, les formules s'écrivent, les fonds tournent en douceur.
- Format : vertical 1080 × 1920 sur téléphone, horizontal 1920 × 1080 sur ordinateur.

## Base de données

Table `generated_video`, créée par `migre-generated-video.mjs` (idempotent) :

`id, userId, chatId, messageId, title, prompt, language, status (pending | script | voice | done | failed), error, script (JSON), audioKey, videoKey (nul tant qu'il n'y a pas de MP4), durationMs, saved, createdAt`

## Interface (textes à valider par le fondateur)

- Chargement : « TRED bereitet dein persönliches Video vor … », puis « Drehbuch wird geschrieben … », « Stimme wird aufgenommen … ». Traduits dans les dix langues.
- Lecteur dans le chat, bouton « Im Dashboard speichern ».
- Dashboard : section « Meine Erklärvideos » (titre, date, durée, relecture).

## Coûts (ordre de grandeur, à confirmer sur les pages officielles)

- Voix : environ 0,10 $ pour 1 000 caractères, soit 0,05 $ pour 30 s et 0,27 $ pour 3 min.
- Lecture dans le navigateur : 0. MP4 par Lambda, plus tard : environ 0,015 $ par minute de vidéo.
- Licence Remotion : gratuite jusqu'à 3 personnes dans l'entreprise ; payante dès la 4ᵉ.

## Étapes (un commit chacune)

1. Backend : table, routes, prompt, validateur testé, voix.
2. Remotion : `DynamicExplanation`.
3. Frontend : chargement, polling, lecteur dans le chat.
4. Dashboard : « Meine Erklärvideos ».

## Décisions du fondateur (11 novembre 2026)

1. **Sans document ni solveur : la vidéo est refusée.** Le bouton affiche « Lade dein Skript hoch, damit ich dir eine genaue Videoerklärung erstellen kann. »
2. **Textes d'interface validés**, tous passés par `t()` dans les 12 langues.
3. **Les solveurs sont une source de la V1.** Chaque calcul réussi dans le chat est enregistré (`solver_result`, via `guardSolver` → `onSolver`), injecté dans le prompt comme source numérotée, et le validateur rejette tout nombre absent des documents et des sorties des solveurs (`api/lib/solver-results.ts`).

## État

- Backend : fait (routes, tables `generated_video` et `solver_result`, validateur, voix).
- Remotion (`DynamicExplanation`), Frontend (fenêtre dans le Hörsaal, polling, 12 langues), Dashboard (« Meine Erklärvideos ») : faits le 11 novembre 2026.
- À faire : export MP4 (Remotion Lambda), téléchargement et partage.
