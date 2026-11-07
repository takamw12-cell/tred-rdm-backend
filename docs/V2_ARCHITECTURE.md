# TRED V2 « Surhumain » — plan d'architecture des 4 piliers

*Rédigé le 7 novembre 2026. Pilier 1 codé de bout en bout ; Piliers 2, 3 et 4 posés en fondations (types, routes, tables, tests) et marqués « à faire » ci-dessous.*

Principes communs, repris de CLAUDE.md :
- Une brique sans sa clé reste inerte : 503 `not_configured`, bouton masqué via `/api/config` → `features`.
- Un appel au modèle de plus de quelques secondes passe par une route Hono, avec les mêmes garde-fous que le quiz : session, limite horaire, plafond de tokens (402). Le reste passe par oRPC.
- Les chiffres montrés à l'étudiant (intervalles, probabilités) sont calculés par du code pur et testé. Le modèle ne les invente pas.
- Les tables se créent avec un script `migre-*.mjs` idempotent, lancé par le fondateur. Sans la table, l'app reste debout.

```
             ┌───────────── Navigateur ─────────────┐
             │ /flashcards   Dashboard   Hörsaal    │
             │ Übungen › Prognose   (Partage écran) │
             └──────┬──────────────┬────────────┬───┘
                    │ oRPC         │ Hono (IA)  │ Hono (images)
    ┌───────────────▼──┐  ┌────────▼────────┐  ┌▼────────────────┐
    │ flashcards.*     │  │ /api/flashcards │  │ /api/vision/    │
    │ examPredictor.*  │  │   /generate     │  │   frame (501)   │
    │ sharedKnowledge.*│  └────────┬────────┘  └┬────────────────┘
    └───────┬──────────┘           │ Claude     │ Claude Vision
            │                      │ (Sonnet)   │ (à brancher)
    ┌───────▼──────────────────────▼────────────▼──────┐
    │ Turso : flashcard · shared_knowledge(+_vote)     │
    │         document(kind=klausur) · misconception   │
    └──────────────────────────────────────────────────┘
```

---

## Pilier 1 — Rétention : répétition espacée et Karteikarten (FAIT)

| Élément | Fichier |
|---|---|
| Table `flashcard` | `api/database/schema.ts`, `migre-flashcards.mjs` |
| Planification (pure) | `api/lib/flashcards.ts` — `newCardSchedule`, `reviewCard`, `endOfBerlinDay` |
| Génération IA | `api/flashcards/routes.ts` — `POST /api/flashcards/generate` (source `document`, `chat` ou `gap`) |
| Révision, compteurs, liste | `api/routes/flashcards.ts` — `summary`, `due`, `review`, `list`, `create`, `remove` |
| Page `/flashcards` | `web/pages/flashcards.tsx` : retourner la carte, glisser à droite ou à gauche, boutons, flèches du clavier |
| Bloc du tableau de bord | `web/components/flashcards-widget.tsx` : « Heute zu wiederholen : X Karten » et le message de lacune |
| Points d'entrée | icône sur chaque document (tableau de bord et bibliothèque du chat), puce « Karteikarten erstellen » sous une réponse du tuteur, menu latéral |

**Règle de planification (fondateur) :**
- « Gewusst » : l'intervalle est multiplié par le facteur de facilité (au moins +1 jour, au plus 365). Avec le facteur 2,5, la suite est 1, 3, 8, 20 puis 50 jours.
- « Nicht gewusst » : la carte revient demain, et le facteur baisse de 0,2 (plancher 1,3).
- Une carte est due si son échéance tombe avant la fin de la journée à Berlin.
- Une carte neuve est due tout de suite.

**Lacunes :** une lacune ouverte (`merke_luecke`) sans cartes déclenche le message « Du hast eine Lücke bei … ». Un clic génère 3 cartes ciblées sur cette lacune : le cœur de la notion, l'erreur typique et une petite application. La révision s'ouvre ensuite.

**Coût :** un appel Sonnet par génération. Un document donne 12 cartes, à partir d'un extrait de 24 000 caractères réparti sur tout le cours. La limite est de 20 générations par heure, et le plafond de tokens de l'abonnement s'applique. La révision ne coûte rien.

## Pilier 2 — Prédictif : Klausur-Prognose (FONDATIONS)

**En place :**
- `api/lib/exam-predictor.ts` : types, `predictTopics()` (fréquence pondérée par la récence avec une demi-vie d'environ 3 ans, lissage de Laplace pour ne jamais afficher 0 % ni 100 %), `tagByKeywords()` (repli sans IA), `guessExamYear()`, `confidenceFor()`.
- `examPredictor.status` (réel) : nombre d'Altklausuren visibles, années repérées, données suffisantes ou non (à partir de 3). `examPredictor.predict` répond 501.
- Onglet « Prognose » dans Übungen & Klausuren : affiche l'état réel et l'annonce « In Vorbereitung ». Aucun pourcentage inventé.

**À faire :**
1. Extraire les thèmes des chapitres d'un cours (`CourseTopic[]`) : un appel IA par cours, mis en cache dans une table `course_topic`.
2. Étiqueter chaque exercice des Altklausuren avec ces thèmes (`TaggedExam[]`) : un appel IA par examen, mis en cache.
3. Brancher `predict` sur `predictTopics()` et afficher la carte : barre par thème, liste des examens qui servent de preuve, avertissements.
4. Afficher en permanence : « Une prognose n'est pas une garantie. Le professeur peut changer. »

## Pilier 3 — Co-pilote : vision en direct (FONDATIONS)

**En place :**
- `web/lib/screen-capture.ts` : `getDisplayMedia` et `getUserMedia` natifs, `grabFrame()` (JPEG de 1600 px au plus), `sendFrame()`. **Aucun nouveau paquet** : `react-media-recorder` enregistre de la vidéo, ce qui n'est pas utile ici. LiveKit, déjà installé, ne servirait que pour un flux continu côté serveur.
- `POST /api/vision/frame` : session, clé, validation (JPEG, PNG ou WebP en data URL, 1,5 Mo au plus) et une image toutes les 4 s au plus. Répond 501.
- `api/lib/vision-copilot.ts` : schéma de la requête et forme de la réponse `VisionObservation { seen, issue?, speak }`.

**À faire :**
1. Brancher Claude Vision (`generateObject` avec une image) avec le prompt du Super-Professeur : signaler où se trouve l'erreur, jamais la solution.
2. Interface dans le Hörsaal : bouton « Bildschirm teilen » ou « Kamera », indicateur permanent, arrêt en un clic, une image toutes les 5 à 10 s, et seulement quand l'image change (différence de pixels).
3. Coût : environ 1 600 tokens d'entrée par image de 1 600 px. À une image toutes les 8 s, une heure fait 450 images. Il faudra un quota dédié avant l'ouverture.
4. Datenschutz : les images ne sont jamais stockées. La mention est à ajouter avant l'ouverture.

## Pilier 4 — Intelligence collective (FONDATIONS)

**En place :**
- Tables `shared_knowledge` (`course_id`, `topic`, `question`, `answer`, `upvotes`, `status`, `contributor_id`) et `shared_knowledge_vote` (un vote par étudiant), créées par `migre-shared-knowledge.mjs`.
- `api/lib/shared-knowledge.ts` : `anonymize()` (e-mail, téléphone, matricule, liens, prénom annoncé ; testé pour ne pas abîmer le LaTeX) et `contributionFrom()`.
- oRPC `sharedKnowledge.list` (membres du cours seulement, entrées publiées, l'auteur n'est jamais renvoyé), `upvote` (idempotent) et `contribute` (501).

**À faire, dans cet ordre, car c'est du contenu d'étudiants :**
1. Consentement explicite à chaque contribution (`consent: true` est déjà exigé par le schéma).
2. Modération : `pending`, puis `published`, depuis /admin, et retrait par l'auteur (RGPD).
3. Mention dans la Datenschutzerklärung, à valider par le fondateur.
4. Interface : bouton « Mit dem Kurs teilen » sous une réponse, et onglet « Aus dem Kurs » dans la Kursbibliothek.
5. Plus tard : le tuteur cite les entrées les mieux notées du cours (recherche dans `shared_knowledge` avant de répondre).
