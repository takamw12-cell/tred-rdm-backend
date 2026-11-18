# Rapport du test de charge — utilisateurs synthétiques

Généré le 18/11/2026 03:58:33 par `scripts/simulate-users.mjs` (graine du hasard : 190571). Serveur testé : `http://localhost:4587` — **local**, jamais la production.

<!-- décision:début -->
## Décision (fondateur, 18 nov. 2026)

- **Le verrou SQLite est un artefact du banc local.** Ce test a tourné sur un fichier SQLite partagé par deux processus (serveur web et worker). La production n'utilise pas ce fichier mais **Turso**, un serveur de base de données. Les inscriptions refusées et les erreurs 500 de ce rapport viennent de ce verrou ; elles ne disent rien de la tenue de la production.
- **Les paliers de 500 et 1 000 robots ne seront pas lancés sur ce banc**, ni sur un serveur libSQL local. Ils seront mesurés contre une **base Turso de staging réelle**, avec `scripts/stress-test-turso.mjs` (mode d'emploi : `scripts/README.md`). Le fondateur crée la branche de staging et lance le test lui-même.
- **Les défauts réels trouvés par ce test sont corrigés d'abord** (commit du 18 nov. 2026) :
  1. le worker n'écrit plus jamais le contenu d'un document dans son journal, dans Redis ou dans Sentry — seulement `{ documentId, userId, errorCode, pageCount, byteSize }` ;
  2. une écriture refusée par la base est rejouée (3 essais, attente qui double) pour l'inscription, le compteur d'usage d'une question et l'enregistrement d'un document ;
  3. un corps JSON cassé sur `/api/agent/messages` répond 400 `invalid_json`, plus 500.
- Les chiffres ci-dessous sont ceux du passage du 18 nov. **avant** ces corrections. La section « Après les corrections » dit ce qui a été revérifié, et ce qui reste à établir sur Turso.
<!-- décision:fin -->

## En bref

- **100 robots : palier NON tenu.** 90/100 inscriptions réussies, 173/173 imports terminés, 271/284 réponses du tuteur complètes, 0 plantage du serveur, temps de réponse moyen de l'API 216 ms (95 % sous 167 ms). Motif : inscriptions réussies : 90/100.
- **Point de rupture :** **À 100 ou moins utilisateurs simultanés, sur ce banc d'essai** — au palier de 100 : inscriptions réussies : 90/100.
- **Pas encore mesuré :** 500, 1000 robots.

<!-- analyse:début -->
## Lecture des résultats (analyse écrite à la main le 18 nov. 2026, conservée quand le rapport est régénéré)

**Le serveur ne s'effondre pas à 100 utilisateurs, mais le palier n'est pas tenu sur ce banc d'essai : une inscription sur dix est refusée.** La cause est le verrou du fichier SQLite local. Les 1 000 robots n'ont donc pas été lancés.

### Ce qui a tenu

- **Aucun plantage** du serveur ni du worker, sur trois passages de 100 robots.
- **La file Redis (BullMQ) ne se bloque pas** : jusqu'à 68 imports en attente, 173 fichiers déposés et 173 importés, file vide dès le départ du dernier robot. Un import attend 5,3 s en moyenne et 15,6 s au pire, avec un seul worker comme en production.
- **Mémoire** : serveur web 410 Mo au début, 636 Mo au plus haut, 450 Mo à la fin ; worker 98 → 234 → 174 Mo. Elle redescend après le palier, mais pas tout à fait à son niveau de départ (278 Mo avant le tout premier passage). Trois passages courts ne permettent pas de dire s'il y a une fuite : il faudrait un test long.
- **La base SQLite n'est ni abîmée ni plantée.** Elle se verrouille, voir ci-dessous.
- **Sécurité** : `/admin` et ses API fermés avec ou sans compte, `.exe` refusé (même renommé en `.pdf`), document d'un autre compte introuvable, code tapé dans le chat jamais exécuté dans la page.

### Ce qui a cédé, et pourquoi

Le journal du serveur contient 345 lignes « SQLITE_BUSY : database is locked » pendant le palier. Le serveur web et le worker sont deux processus qui écrivent dans le même fichier SQLite ; quand le worker enregistre un document de 40 pages, l'écriture du serveur web au même instant est refusée, sans nouvel essai. Conséquences mesurées :

| Effet | Passage 1 | Passage 2 (celui de ce rapport) |
|---|---|---|
| Inscriptions refusées (422 « Failed to create user ») | 7 / 100 | 10 / 100 |
| Questions au tuteur en erreur 500 (compteur d'usage non écrit) | 10 | 8 |
| Comptes créés dont la session est ensuite refusée (401 partout) | 4 | 1 |
| Questions refusées en 404 « document not found » (cause non établie) | 5 | 0 |
| Limiteur de débit qui laisse passer sans compter | 88 fois | 99 fois |
| Imports repris par le worker après un échec d'écriture (tous terminés) | 45 | 18 |

**Contre-épreuve.** Même test, 100 robots, worker arrêté : un seul processus écrit dans la base et l'import se fait dans la requête. Résultat : 100/100 inscriptions, 159/159 imports, toutes les réponses complètes, **zéro** ligne SQLITE_BUSY. Le code tient donc 100 utilisateurs ; c'est le fichier partagé entre deux processus qui cède.

**Ce que cela dit de la production.** La production n'utilise pas un fichier SQLite mais Turso, un serveur de base de données qui met les écritures en file. Ce verrou précis ne devrait pas s'y produire. Ce test ne le prouve pas : il ne mesure pas Turso.

La contre-épreuve montre aussi ce que la file apporte : sans elle, `/api/health` met jusqu'à 3,6 s à répondre et 5 % des réponses du tuteur dépassent 10 s, parce que la lecture des PDF occupe le serveur web.

Les temps varient d'un passage à l'autre sur ce portable, qui héberge aussi les robots : au passage 2, 5 % des réponses du tuteur dépassent 19 s et la sonde de santé est restée deux fois sans réponse en 5 s ; au passage 1, c'était 5,2 s et aucune sonde manquée.

### Quatre défauts réels du code, indépendants du banc d'essai

1. **(Corrigé.) Le worker écrit le texte entier d'un document dans son journal quand l'enregistrement échoue.** 18 reprises ont produit 26 500 lignes de journal contenant le contenu des PDF. En production, ce serait le cours d'un étudiant dans les journaux Railway. À corriger en premier.
2. **(Corrigé pour l'inscription, la question et le document.) Aucune nouvelle tentative quand la base refuse une écriture.** Une inscription ou une question échoue aussitôt (422 ou 500). Turso aussi peut refuser ponctuellement une requête.
3. **(Corrigé.) Un corps JSON cassé sur `/api/agent/messages` renvoie 500 au lieu de 400** (6 essais sur 6). Sans danger, mais chaque essai crée une fausse alerte.
4. **Quand la base refuse d'écrire, le limiteur de débit laisse tout passer.** C'est un choix écrit dans le code (ne pas couper le service) ; il faut savoir que les limites anti-abus disparaissent exactement quand la base est sous pression.

### Sentry

Le serveur envoie bien ses erreurs : quatre types distincts sont arrivés au faux récepteur (JSON cassé, base verrouillée…). Mais 16 erreurs 500 pendant le palier n'ont donné que 2 événements. Je n'ai pas établi pourquoi ; le dédoublonnage des erreurs identiques par le SDK est l'explication probable. Sentry dira donc qu'une erreur existe, pas combien de fois elle s'est produite.

### Dans le tableau de sécurité

Les lignes « 401 × 1 » viennent du robot dont la session a été perdue par le verrou de la base : ses essais ont été refusés faute de session, ce qui reste un refus. Les « 500 × 1 » sur les injections dans le chat sont l'erreur du compteur d'usage décrite plus haut, pas un effet de l'injection.

### Non testé

- **« Als Video erklären »** : l'adresse d'ElevenLabs est écrite en dur, la tester aurait coûté de vrais appels. La route a répondu 503 « non configuré » 45 fois sur 45.
- **Le bandeau cookies** : le build local n'a pas de clé d'analyse, donc l'app n'affiche aucun bandeau. Les robots le cliquent s'il existe.
- **Le vrai modèle, Turso et Railway** : voir la dernière section.

### Après les corrections (18 nov. 2026, même banc, un passage de 100 robots avec l'ancien code et un avec le code corrigé, base remise à neuf)

| | Ancien code | Code corrigé |
|---|---|---|
| Inscriptions réussies | 75 / 100 | 97 / 100 |
| Lignes du journal du worker | 59 605 (avec le texte des documents) | 194 (aucun contenu) |
| Corps JSON cassé sur `/api/agent/messages` | 500 | 400 `invalid_json` |
| Questions au tuteur en erreur 500 | 6 sur 230 | **112 sur 269** |
| Questions refusées en 404 « document not found » | 0 | 25 |
| Fichiers non importés | 6 sur 150 | 18 sur 179 |

- **Vérifié** : la fuite est fermée (le journal du worker ne contient plus que des lignes `[worker] import échoué {…}` avec identifiants, code, pages et octets), l'inscription est rejouée et aboutit, le JSON cassé répond 400.
- **Non résolu** : avec le code corrigé, les questions au tuteur échouent plus souvent sur ce banc (112 contre 6), alors que leur écriture est maintenant essayée trois fois. Je n'ai pas établi la cause. Ce que j'ai écarté : le client de base seul reprend normalement après un verrou court, et l'inscription rejouée ne laisse aucun verrou derrière elle. Hypothèse, non démontrée : plus de robots passent l'inscription (97 contre 75), donc plus de charge, et le verrou du fichier reste tenu plus longtemps que les 0,6 s que couvrent les trois essais. Un seul passage de chaque côté : l'écart peut aussi tenir en partie à la variation du banc. Un indice dans ce sens : une autre écriture du même moment, que je n'ai pas modifiée (le décompte des tokens en fin de réponse), échoue elle aussi bien plus souvent (47 fois contre 2).
- **Observé une fois, non expliqué** : après deux passages de suite sans redémarrage, le serveur web a gardé un verrou d'écriture au repos et toutes les écritures ont échoué jusqu'à son redémarrage. Je ne l'ai pas reproduit sur base neuve, ni avec l'ancien code, ni avec le code corrigé.
- Ces deux points ne peuvent pas être tranchés sur un fichier SQLite. **Premier contrôle à faire sur Turso** : au palier de 100, le nombre de questions en erreur 500 et de 404 « document not found » doit être nul.

### Avant de lancer 500 et 1 000 robots

Voir la section « Décision » en tête de ce rapport : pas sur ce banc, mais contre une base Turso de staging, avec `scripts/stress-test-turso.mjs`.
<!-- analyse:fin -->

## Les quatre chiffres demandés

| | 100 utilisateurs | 500 utilisateurs | 1000 utilisateurs |
|---|---|---|---|
| Temps de réponse moyen de l'API | 216 ms | non lancé | non lancé |
| 95 % des réponses de l'API sous | 167 ms | non lancé | non lancé |
| Réponse la plus lente de l'API | 15.8 s | non lancé | non lancé |
| Inscriptions réussies | 90 / 100 | non lancé | non lancé |
| Plantages du serveur | 0 | non lancé | non lancé |
| Requêtes d'étudiants en erreur 5xx ou sans réponse | 8 / 1511 (0.53 %) | non lancé | non lancé |
| Palier tenu | non | non lancé | non lancé |

« API » = toutes les requêtes des robots sauf deux, mesurées à part : la réponse du tuteur (un flux de plusieurs secondes, dont la durée est fixée ici par le faux modèle) et l'envoi des fichiers (dont la durée dépend du poids du fichier).

Point de rupture : **À 100 ou moins utilisateurs simultanés, sur ce banc d'essai** — au palier de 100 : inscriptions réussies : 90/100.

Un palier est « tenu » si : aucun plantage, au plus 1 % de requêtes d'étudiants en erreur (les essais du Hacker sont jugés à part, dans le tableau de sécurité), au moins 99 % d'inscriptions et d'imports réussis, 95 % des réponses de l'API sous 3000 ms, et une file d'import jamais immobile plus de 60 s.

## Palier de 100 robots

Durée : 123 s. Arrivée étalée sur 10 s, pauses de 2 à 10 s entre deux actions.

### Les robots

| Profil | Robots | dont vraie page | Inscrits | Parcours terminé |
|---|---|---|---|---|
| Le Curieux | 46 (46.0 %) | 3 | 38 | 36 |
| Le Stressé | 45 (45.0 %) | 2 | 45 | 39 |
| Le Hacker | 9 (9.0 %) | 1 | 7 | 7 |

« Parcours terminé » : Curieux = 1 import terminé et 1 réponse complète ; Stressé = 3 imports et 5 réponses ; Hacker = tous ses essais faits (leur résultat est dans le tableau de sécurité).

### Temps de réponse par geste

| Geste | Requêtes | Moyenne | Médiane | 95 % sous | Maximum | Codes HTTP | Inattendues |
|---|---|---|---|---|---|---|---|
| suivi de l'import | 586 | 35 ms | 21 ms | 112 ms | 227 ms | 200 × 586 | 0 |
| question au tuteur | 263 | 6320 ms | 3020 ms | 19.2 s | 22.3 s | 200 × 255, 500 × 8 | 8 |
| inscription | 100 | 190 ms | 123 ms | 574 ms | 1164 ms | 200 × 90, 422 × 10 | 10 |
| session | 90 | 22 ms | 11 ms | 82 ms | 119 ms | 200 × 90 | 0 |
| tableau de bord (briefing) | 90 | 16 ms | 10 ms | 42 ms | 121 ms | 200 × 89, 401 × 1 | 1 |
| config | 83 | 12 ms | 8 ms | 24 ms | 131 ms | 200 × 83 | 0 |
| import (lot) | 45 | 148 ms | 134 ms | 350 ms | 383 ms | 202 × 45 | 0 |
| « Als Video erklären » | 45 | 9 ms | 8 ms | 15 ms | 30 ms | 503 × 45 | 0 |
| Lernprofil | 45 | 9 ms | 6 ms | 24 ms | 55 ms | 200 × 45 | 0 |
| plan d'étude | 45 | 7 ms | 6 ms | 12 ms | 24 ms | 200 × 45 | 0 |
| page d'accueil | 43 | 22 ms | 7 ms | 103 ms | 107 ms | 200 × 43 | 0 |
| import (un fichier) | 38 | 56 ms | 35 ms | 173 ms | 174 ms | 202 × 38 | 0 |
| déconnexion | 38 | 4902 ms | 5037 ms | 13.8 s | 14.0 s | 200 × 38 | 0 |
| hacker : API admin sans compte | 36 | 12 ms | 4 ms | 57 ms | 58 ms | 401 × 36 | 0 |
| hacker : API admin avec un compte ordinaire | 28 | 17 ms | 6 ms | 95 ms | 98 ms | 401 × 8, 404 × 20 | 0 |
| hacker : injection dans le chat | 21 | 5504 ms | 3050 ms | 17.9 s | 18.7 s | 200 × 16, 401 × 3, 500 × 2 | 5 |
| hacker : page /admin | 9 | 25 ms | 7 ms | 74 ms | 74 ms | 404 × 9 | 0 |
| hacker : injection SQL à la connexion | 9 | 23 ms | 9 ms | 79 ms | 79 ms | 400 × 9 | 0 |
| hacker : se nommer administrateur | 7 | 7 ms | 7 ms | 15 ms | 15 ms | 401 × 2, 404 × 5 | 0 |
| hacker : dépôt d'un .exe | 7 | 2011 ms | 23 ms | 14.0 s | 14.0 s | 401 × 1, 415 × 6 | 1 |
| hacker : dépôt d'un .exe renommé en .pdf | 7 | 116 ms | 39 ms | 603 ms | 603 ms | 401 × 1, 415 × 6 | 1 |
| hacker : corps JSON cassé | 7 | 4160 ms | 11 ms | 15.8 s | 15.8 s | 401 × 1, 500 × 6 | 7 |
| hacker : document d'un autre compte | 7 | 114 ms | 6 ms | 405 ms | 405 ms | 401 × 1, 404 × 6 | 1 |
| hacker : chemin « ../ » | 7 | 92 ms | 5 ms | 610 ms | 610 ms | 401 × 1, 404 × 6 | 1 |

Total : 1656 requêtes — 1621 conformes, 0 refusées par une limite de débit (429), 19 autres refus 4xx, 16 erreurs 5xx inattendues, 0 sans réponse.

### Import des PDF et file Redis (BullMQ)

- Fichiers déposés : 173 · importés : 173 · en échec : 0 · pas finis après 8 min : 0.
- Du dépôt au document prêt : 5336 ms en moyenne, médiane 4847 ms, 95 % sous 12.4 s, maximum 15.6 s.
- File `import-pdf` : jusqu'à 68 travaux en attente, 1 en cours au plus ; 173 terminés et 0 en échec côté Redis.
- File immobile (des travaux attendent, aucun ne se termine) : non (plus long silence : 0 s). File vide 0 s après le dernier robot.
- Mémoire de Redis au plus haut : 14 Mo.
- Stockage (faux S3) : 173 fichiers reçus, 132 Mo.

### Serveur : santé, mémoire, journaux, Sentry

- Sonde `/api/health` toutes les 2 s : 54 mesures, 2 sans réponse, moyenne 94 ms, 95 % sous 63 ms, maximum 4479 ms.
- Plantages du serveur : 0.
- Mémoire du serveur web : 410 Mo au début, 636 Mo au plus haut, 450 Mo à la fin.
- Mémoire du worker : 98 Mo au début, 234 Mo au plus haut, 174 Mo à la fin.
- Journal du serveur : 4231 lignes pendant le palier ; erreurs 500 (« [500] ») : 16 ; base SQLite occupée ou abîmée (SQLITE_BUSY, locked, corrupt…) : 345 ; limiteur de débit en panne : 99 ; lignes « error » (autres) : 126.
  - exemple (erreurs 500 (« [500] »)) : `[500] POST /api/agent/messages : Failed query: insert into "usage_counter" ("user_id", "period", "metric", "count") values (?, ?, ?, ?) on conflict ("usage_counter"."user_id", "usage_counter"."period"`
  - exemple (base SQLite occupée ou abîmée (SQLITE_BUSY, locked, corrupt…)) : `LibsqlError: SQLITE_BUSY: database is locked`
  - exemple (limiteur de débit en panne) : `[rate-limit] compteur indisponible, requête autorisée 38 |   async queryWithCache(queryString, params, query) {`
  - exemple (lignes « error » (autres)) : `error: Failed query: insert into "rate_limit" ("key", "window_start", "count", "updated_at") values (?, ?, ?, ?) on conflict ("rate_limit"."key") do update set "window_start" = excluded.window_start, `
- Journal du worker : 26547 lignes pendant le palier ; aucune ligne d'erreur.
- Sentry (faux récepteur local) : 2 erreur(s) reçue(s) pendant le palier, 4 enveloppe(s).
  - Types d'erreurs reçus depuis le démarrage du faux récepteur (cumul, pas seulement ce palier) : 1 × `SyntaxError: JSON Parse error: Expected '}'` ; 1 × `TypeError: undefined is not an object (evaluating 'messages.length')` ; 2 × `SqliteError: database is locked` ; 2 × `SyntaxError: JSON Parse error: Unexpected EOF`
- Appels au modèle (faux Anthropic local, 0 €) : 283, jusqu'à 35 réponses en cours en même temps.

## Sécurité : les essais du Hacker

| Essai | Attendu | Réponses obtenues | Robots | Verdict |
|---|---|---|---|---|
| GET /api/admin/session sans compte | 401 | 401 × 9 | 9 | conforme |
| GET /api/admin/users sans compte | 401 | 401 × 9 | 9 | conforme |
| GET /api/admin/queues sans compte | 401 | 401 × 9 | 9 | conforme |
| GET /api/admin/reports sans compte | 401 | 401 × 9 | 9 | conforme |
| GET /admin (la page) sans compte | aucune donnée | 404 × 9 | 9 | conforme |
| connexion avec « ' OR 1=1 -- » | refus (4xx) | 400 × 9 | 9 | conforme |
| GET /api/admin/session avec un compte ordinaire | 404 | 401 × 2, 404 × 5 | 7 | conforme |
| GET /api/admin/users avec un compte ordinaire | 404 | 401 × 2, 404 × 5 | 7 | conforme |
| GET /api/admin/queues avec un compte ordinaire | 404 | 401 × 2, 404 × 5 | 7 | conforme |
| GET /api/admin/reports avec un compte ordinaire | 404 | 401 × 2, 404 × 5 | 7 | conforme |
| POST /api/admin/users/access (se nommer admin) | 404 | 401 × 2, 404 × 5 | 7 | conforme |
| dépôt de « skript_loesungen.exe » | 415 | 401 × 1, 415 × 6 | 7 | conforme |
| dépôt d'un .exe renommé en .pdf | 415 | 401 × 1, 415 × 6 | 7 | conforme |
| balise <script> dans le chat | réponse normale, aucun 5xx | 200 × 5, 401 × 1, 500 × 1 | 7 | **à corriger** (1/7) |
| injection SQL dans le chat | réponse normale, aucun 5xx | 200 × 5, 401 × 1, 500 × 1 | 7 | **à corriger** (1/7) |
| injection de consigne dans le chat | réponse normale, aucun 5xx | 200 × 6, 401 × 1 | 7 | conforme |
| corps JSON cassé sur /api/agent/messages | 400 | 401 × 1, 500 × 6 | 7 | **à corriger** (6/7) |
| lire le PDF d'un autre compte | 404 | 401 × 1, 404 × 6 | 7 | conforme |
| chemin « ../../etc/passwd » | 404 | 401 × 1, 404 × 6 | 7 | conforme |
| le compte fonctionne encore après les essais | 200 | 200 × 6, 401 × 1 | 7 | **à corriger** (1/7) |

## Ce que les robots à vraie page ont vu

| Vérification | Réussies | Détail du premier cas |
|---|---|---|
| page d'accueil affichée | 3 / 3 |  |
| inscription par le formulaire | 4 / 6 | HTTP 422, arrivée sur /login |
| bandeau cookies accepté | sans objet | aucun bandeau : ce build local n'a pas de clé d'analyse, donc rien à accepter |
| tableau de bord affiché (carte « Dein Briefing ») | 3 / 3 | Willkommen bei TRED! Lade dein erstes Skript hoch, damit ich dir einen Lernplan  |
| /admin fermé dans le navigateur | 1 / 1 | page HTTP 404, réponses /api/admin : aucune requête |
| code tapé dans le chat : rien ne s'exécute dans la page | 1 / 1 | drapeau=null, fenêtres=0, balises injectées=0 |

Requêtes vers l'extérieur coupées dans ces pages (PostHog, polices, régies…) : 0. Aucune n'a quitté la machine.

## Comment ce test a été fait, et ce qu'il ne dit pas

- **Tout est local.** Serveur web et worker lancés depuis ce dépôt, base SQLite locale (copie de test, mode WAL), Redis local, et trois faux services (`scripts/stress-mocks.mjs`) à la place d'Anthropic, du stockage S3 et de Sentry. Aucun appel payant, aucune donnée ni statistique de production touchée. Le script refuse toute adresse non locale.
- **Ce test mesure le code de TRED, pas Railway.** La machine de test héberge à la fois les robots, le serveur, le worker, Redis et la base. En production la base est Turso (≈ 55 ms par aller-retour, contre moins d'1 ms ici) et le modèle est le vrai (plusieurs secondes, limites de débit d'Anthropic) : les temps de réponse réels seront plus longs que ceux de ce rapport, et le point de rupture réel peut être ailleurs.
- **Le modèle est simulé** : premier mot après ≈ 0,9 s, réponse complète en ≈ 3 s. La durée « question au tuteur » reflète ce réglage, pas le vrai modèle.
- **« Als Video erklären » n'est pas testé en charge.** L'adresse d'ElevenLabs est écrite en dur dans le code : la tester aurait voulu dire de vrais appels payants. Sans clé, la route répond 503 « non configuré » — c'est la réponse attendue ici.
- **Les robots.** Un « browser context » Playwright par robot. 6 par palier pilotent une vraie page (bandeau cookies, formulaire d'inscription, tableau de bord, /admin, saisie dans le chat) ; les autres envoient les mêmes requêtes depuis leur contexte sans afficher la page, pour ne pas mesurer la mémoire du portable à la place du serveur. Chaque robot a sa propre adresse IP simulée (en-têtes posés comme le fait l'edge de Railway), sinon les limites anti-abus par adresse les bloqueraient tous ensemble.
- **Fausses données.** Noms, adresses `test_user_…@tred-bot.de`, mots de passe et PDF sont générés par le script. Le serveur de test n'envoie aucun e-mail (vérifié au démarrage).
- **Sentry.** Le serveur de test envoie ses erreurs à un faux récepteur local, qui les compte : cela vérifie que le serveur capte et envoie bien ses erreurs, sans rien écrire dans le vrai projet Sentry.

## Relancer le test

```
# 1. Redis local, puis les faux services
bun scripts/stress-mocks.mjs
# 2. Serveur et worker, depuis packages/web (jamais depuis la racine : son .env est celui de la production)
#    PORT=4587 NODE_ENV=production DATABASE_URL=file:…/stress.db REDIS_URL=redis://127.0.0.1:6399
#    S3_ENDPOINT=http://127.0.0.1:4599 S3_BUCKET=stress S3_ACCESS_KEY_ID=local S3_SECRET_ACCESS_KEY=local
#    ANTHROPIC_API_KEY=sk-ant-stress-fake ANTHROPIC_BASE_URL=http://127.0.0.1:4598/v1 SENTRY_DSN=http://stress@127.0.0.1:4597/1
bun src/__server.ts      # et dans un autre terminal : bun src/worker.ts
# 3. Les robots
bun ../../scripts/simulate-users.mjs --stages=100 --server-log=…/server.log --worker-log=…/worker.log
bun ../../scripts/simulate-users.mjs --stages=100,500,1000   # s'arrête au premier palier non tenu
```
