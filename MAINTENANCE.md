# MAINTENANCE — TRED reste à jour, sans casser

TRED change de modèle d'IA, de voix et de bibliothèques **sans toucher au code** : tout se règle par des variables sur Railway (service **TRED** → onglet **Variables**). Un garde-fou automatique protège les solveurs : chaque modification passe d'abord les tests (`.github/workflows/ci.yml`), et rien n'est fusionné si un seul test échoue.

---

## Ce qui tourne tout seul

| Quand | Quoi | Ce que tu fais |
|---|---|---|
| Chaque lundi, 06:00 | Dependabot propose les mises à jour des paquets (React, Hono, Drizzle, AI SDK…), 14 jours après leur sortie | Rien pour les mineures : elles sont fusionnées toutes seules **si les tests passent**, puis Railway déploie. Les **majeures** t'attendent (voir plus bas). |
| Chaque modification | CI : typecheck, plus de 1 000 tests, build de production | Rien. Une croix rouge sur une PR = elle n'est pas fusionnée. |
| Le 1er du mois, 06:00 UTC | Scan de sécurité : failles connues des dépendances et scan OWASP ZAP passif du site | Lire le résultat (action 4). |

**Une mise à jour MAJEURE** (ex. React 20, Hono 5) arrive comme une Pull Request à part, jamais fusionnée automatiquement :
1. GitHub → **Pull requests** → la PR « chore(deps): bump … ».
2. Vérifie que la coche **CI** est verte. Rouge : ne fusionne pas, demande-moi.
3. Lis le lien « Release notes » de la PR. Si tu as un doute, demande-moi : je lis les changements cassants et je teste.
4. Verte et sans doute → bouton **Merge**. Railway déploie dans les 5 minutes.

---

## Les 5 actions du début de mois (30 minutes)

### 1. Un nouveau modèle d'IA, plus rapide ou meilleur ?
- Va sur la page des modèles d'Anthropic : <https://docs.anthropic.com/en/docs/about-claude/models> et sur la page des prix : <https://www.anthropic.com/pricing>.
- Aujourd'hui TRED utilise :
  - **`PRIMARY_AI_MODEL`** = `anthropic/claude-sonnet-4.6` (le tuteur, les exercices, les vidéos) ;
  - **`FAST_AI_MODEL`** = `anthropic/claude-haiku-4.5` (les petites tâches).
- **Pour changer :** Railway → TRED → Variables → `PRIMARY_AI_MODEL` = `anthropic/` suivi de l'identifiant API exact donné par Anthropic (ex. `anthropic/claude-opus-4-1`). Railway redéploie tout seul.
- **Vérifier :** pose deux ou trois questions au tuteur. Dans les logs Railway, un message `[ai-models] … ignoré` veut dire que la valeur est mal écrite. Dans ce cas, TRED est resté sur l'ancien modèle : rien n'est cassé.
- **Revenir en arrière :** supprime la variable. TRED reprend Sonnet 4.6.
- **Un modèle d'un autre fournisseur** (OpenAI, Google…) : `PRIMARY_AI_MODEL=openai/…`, mais il faut d'abord ajouter la clé `AI_GATEWAY_API_KEY` (compte Vercel AI Gateway). Sans elle, la valeur est refusée et l'ancien modèle reste. Préviens-moi avant : la mise en cache du prompt, qui fait baisser la facture, est propre à Anthropic.

### 2. De nouvelles voix ElevenLabs ?
- Bibliothèque de voix : <https://elevenlabs.io/app/voice-library>. Modèles : <https://elevenlabs.io/docs/models>.
- **Une voix par professeur**, réglable sans code : `ELEVENLABS_VOICE_KENTA`, `ELEVENLABS_VOICE_REN`, `ELEVENLABS_VOICE_AIKO`, `ELEVENLABS_VOICE_HARUTO`. La valeur est l'identifiant de la voix (« Voice ID », bouton copier dans ElevenLabs).
- **Le moteur de voix :** `ELEVENLABS_MODEL_ID` (aujourd'hui `eleven_multilingual_v2`).
- **Plafond de dépense :** `ELEVENLABS_DAILY_CHARS`.

### 3. Base de données et hébergement : sécurité et sauvegardes
TRED utilise **Turso** (base de données) et **Railway** (serveur). Pas de Supabase.
- **Turso :** <https://app.turso.tech>
  - vérifie l'usage (lectures, écritures, stockage) par rapport à la limite de ton offre ;
  - regarde les annonces de sécurité sur <https://status.turso.tech> ;
  - Turso applique lui-même ses correctifs, tu n'as rien à installer.
- **Railway :**
  - le dernier déploiement est vert (onglet **Deployments**) ;
  - pas d'alerte dans **Observability** ;
  - en cas de problème après une mise à jour : **Deployments** → le déploiement précédent → **Rollback**.
- **GitHub :** onglet **Security** → **Dependabot alerts**. Une alerte « High » ou « Critical » non résolue → préviens-moi.

### 4. Le scan de sécurité (OWASP)
Il tourne tout seul le 1er du mois. Pour le relancer à la main : GitHub → **Actions** → **Scan de sécurité** → **Run workflow**.
- **« Failles connues dans les dépendances » en rouge :** un paquet utilisé a une faille publiée. Dependabot propose en général la correction dans la semaine. Si ce n'est pas le cas, envoie-moi le nom du paquet.
- **« OWASP ZAP » :** télécharge **rapport-owasp-zap** en bas de la page du run et ouvre `rapport-zap.html`.
  - « High » : préviens-moi tout de suite.
  - « Medium » : on le traite dans le mois.
  - « Low » et « Informational » : à lire, rarement urgent.

### 5. Les coûts d'API
| Service | Où regarder | Leviers |
|---|---|---|
| Anthropic (le tuteur) | <https://console.anthropic.com> → Usage / Cost | `FAST_AI_MODEL` pour les petites tâches ; un modèle plus récent est souvent moins cher à qualité égale |
| ElevenLabs (voix) | <https://elevenlabs.io/app/usage> | `ELEVENLABS_DAILY_CHARS` |
| Replicate (images, vidéos) | <https://replicate.com/account/billing> | générations à la demande seulement |
| Railway (serveur) | Railway → **Usage** | — |
| Turso (base) | <https://app.turso.tech> → Usage | — |

Compare avec le mois précédent. Une hausse sans hausse du nombre d'étudiants → préviens-moi, on cherche la cause (une boucle, un abus, un cache qui ne sert plus).

---

## À activer une fois (2 minutes, sur GitHub)
1. **Settings** → **Code security** → activer **Dependabot alerts** et **Dependabot security updates**. Les correctifs de sécurité arrivent alors aussi en PR, et passent la même CI.
2. (Conseillé) Sur Railway, si ton offre propose l'option « attendre la CI » (« Wait for CI ») dans les réglages de la source GitHub : active-la. Un master rouge ne sera alors jamais déployé.
