# Test de charge : les utilisateurs synthétiques

Trois scripts versionnés dans ce dossier (le reste de `scripts/` est local et ignoré par git).

> **Ces scripts ne doivent JAMAIS toucher la production.**
> Ils créent des centaines de faux comptes, déposent des centaines de faux PDF et posent des centaines de questions.
> Le serveur visé est toujours un serveur **local** ; la base est un fichier SQLite local ou une **branche Turso de staging**, jamais `DATABASE_URL` de la production.

| Fichier | Rôle |
|---|---|
| `simulate-users.mjs` | Les robots (Curieux 50 %, Stressé 40 %, Hacker 10 %), la sonde et l'écriture du rapport. |
| `stress-mocks.mjs` | Faux Anthropic, faux stockage S3, faux Sentry, sur `127.0.0.1`. |
| `stress-test-turso.mjs` | Lance les faux services, un serveur et un worker locaux branchés sur une base Turso de staging, puis les robots. |

## Les garde-fous écrits dans le code

- `simulate-users.mjs` refuse toute adresse de serveur qui n'est pas `localhost` ou `127.0.0.1`.
- Il refuse de partir si le serveur peut envoyer des e-mails (`RESEND_API_KEY` posée), ou si le faux Anthropic ne répond pas.
- `stress-test-turso.mjs` refuse la base de production (comparée au `DATABASE_URL` du `.env`) et toute base dont le nom ne contient ni « staging », ni « stress », ni « test ».
- Le serveur de test reçoit un environnement construit par le script : aucune clé du `.env` (Anthropic, ElevenLabs, Resend…) ne lui parvient. Les rappels du soir, l'agent de rétention et le résumé du matin sont coupés : une branche de staging contient les comptes réels, personne ne doit être contacté.
- Dans les pages pilotées par les robots, toute requête vers l'extérieur (PostHog, polices, régies) est coupée.

## Lancer le test contre une base Turso de staging

1. **Créer la branche de staging** dans Turso (ta base → Branches → Create branch) et un jeton pour cette branche. Son nom doit contenir « staging ».
2. **Copier** `.env.stress.example` en `.env.stress.local` (ignoré par git) et y coller l'adresse et le jeton. On peut aussi les passer par l'environnement : `TURSO_STAGING_URL`, `TURSO_STAGING_TOKEN`.
3. **Démarrer un Redis local** sur le port 6399 (ou donner son adresse dans `STRESS_REDIS_URL`).
4. **Construire le front** une fois : `bun run build:web`.
5. **Vérifier les réglages sans rien lancer** : `bun scripts/stress-test-turso.mjs --dry-run`.
6. **Lancer** :

   ```
   bun scripts/stress-test-turso.mjs --stages=100            # un palier
   bun scripts/stress-test-turso.mjs                         # 100, puis 500, puis 1000
   ```

   Le script s'arrête au premier palier non tenu. Le rapport est écrit dans `RAPPORT-STRESS-TEST-TURSO.md`.
7. **Supprimer la branche de staging et son jeton** dans Turso une fois le test fini : elle contient les faux comptes et une copie des données réelles.

Ce que ce test ne mesure toujours pas : Railway (le serveur tourne sur ta machine), le vrai modèle (simulé : premier mot à 0,9 s, réponse en 3 s) et « Als Video erklären » (l'adresse d'ElevenLabs est écrite en dur, la tester coûterait de vrais appels).

## Banc 100 % local (fichier SQLite)

Utile pour mettre au point les robots, pas pour mesurer : le serveur et le worker se disputent le verrou du fichier SQLite, ce qui n'existe pas avec Turso (voir `RAPPORT-STRESS-TEST.md`).

```
bun scripts/stress-mocks.mjs
# depuis packages/web — jamais depuis la racine, dont le .env est celui de la production :
#   PORT=4587 NODE_ENV=production DATABASE_URL=file:…/stress.db REDIS_URL=redis://127.0.0.1:6399
#   S3_ENDPOINT=http://127.0.0.1:4599 S3_BUCKET=stress S3_ACCESS_KEY_ID=local S3_SECRET_ACCESS_KEY=local
#   ANTHROPIC_API_KEY=sk-ant-stress-fake ANTHROPIC_BASE_URL=http://127.0.0.1:4598/v1 SENTRY_DSN=http://stress@127.0.0.1:4597/1
bun src/__server.ts          # et dans un autre terminal : bun src/worker.ts
bun ../../scripts/simulate-users.mjs --stages=100 --server-log=…/server.log --worker-log=…/worker.log
```

## Options de `simulate-users.mjs`

| Option | Défaut | Effet |
|---|---|---|
| `--stages=100,500,1000` | `100` | Les paliers, dans l'ordre. Arrêt au premier palier non tenu (`--force` pour continuer). |
| `--ui=6` | `6` | Robots par palier qui pilotent une vraie page. |
| `--min-delay=2 --max-delay=10` | 2 et 10 | Pause entre deux actions, en secondes. |
| `--ramp=10` | 10 robots par seconde | Durée d'arrivée des robots d'un palier, en secondes. |
| `--seed=123` | aléatoire | Rejoue le même tirage de profils. |
| `--report=…` | `RAPPORT-STRESS-TEST.md` | Fichier du rapport. Les blocs « Décision » et « Lecture des résultats » écrits à la main y sont conservés. |
