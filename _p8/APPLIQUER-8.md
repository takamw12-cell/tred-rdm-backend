# TRED — Conformité RGPD, clause de responsabilité, TVA, langue et cache de traduction

## Ce que j'ai fait, et ce que je n'ai pas fait

Tu m'as demandé deux chantiers complets. J'ai livré **tout ce qui est backend et
que je peux faire correctement sans ton dossier mobile**, et j'ai laissé de côté
ce qui aurait été du devinage.

| Demandé | État |
|---|---|
| Colonne `locale` + route | ✅ mais **pas dans `user`** — voir plus bas |
| Cache `translation_cache` | ✅ branché sur la route existante |
| Prompt de traduction « ne jamais traduire » | ✅ **existait déjà** — inchangé |
| `locale` lue en base par `buildTutorAgent` | ✅ |
| Clause de non-responsabilité dans le prompt | ✅ |
| `data-export` (Art. 15/20) | ✅ |
| `delete-account` (Art. 17) | ✅ avec résiliation Stripe préalable |
| Stripe Tax / OSS | ✅ code + instructions |
| Impressum · Datenschutz · AGB | ✅ modèles à valider |
| i18next mobile, `LanguageSelector`, bandeau cookies | ⛔ **besoin du dossier `packages/mobile`** |
| Vérification d'âge à l'inscription | ⛔ voir la note en fin de document |

## Trois choses que tu dois savoir avant de déployer

### 1. `locale` ne va PAS dans la table `user`

Tu demandais une migration sur `user`. **Cette table appartient à Better Auth**
et son générateur de schéma la réécrit. Une colonne ajoutée là disparaît au
prochain `generate`.

Ton propre code l'avait déjà compris — le commentaire de `user_access` dit
exactement ça :

> *« Bewusst eine eigene Tabelle statt zusätzlicher Spalten in `user`: die
> Nutzertabelle gehört Better Auth und wird von dessen Schema-Generator
> überschrieben. »*

J'ai donc mis `locale` dans `user_access`, où vivent déjà `role` et `isActive`.
Même effet, sans le piège.

### 2. Le prompt de traduction que tu demandais existe déjà

Ta route `/api/agent/translate` contient déjà, mot pour mot, l'interdiction de
traduire : formules LaTeX, blocs mermaid/chart/tikz, marqueurs `[[…]]`, nombres,
unités, et les termes allemands (`Flächenträgheitsmoment`, `Querkraft`,
`Biegemoment`, `Spannung`, `Auftrieb`, `Wirkungsgrad`).

Je ne l'ai pas touché. Ce qui manquait, c'était le **cache** — et lui, il te fera
économiser de l'argent dès la première semaine.

### 3. Ton site n'a probablement pas besoin d'un bandeau cookies

Tu n'utilises aujourd'hui que le cookie de session et une préférence de langue.
Les cookies strictement nécessaires sont **dispensés de consentement**
(§ 25 Abs. 2 TDDDG). Un bandeau inutile fait fuir des inscriptions.

Le jour où tu ajoutes une mesure d'audience, il devient obligatoire — et il
devra proposer « refuser » aussi visiblement que « accepter ». J'ai préféré ne
pas te faire coder maintenant quelque chose qui te coûterait des conversions
sans obligation légale.

## Le cache de traduction

Clé : SHA-256 de `texte source` + octet nul + `langue cible`. Le même paragraphe
vers l'anglais et vers le français sont deux entrées ; un caractère changé est
une nouvelle entrée.

Un compteur `hits` par entrée permet de mesurer si le cache paie. Sur un
polycopié partagé par une promo entière, le premier étudiant paie la traduction,
les suivants la lisent gratuitement.

Le cache ne peut pas casser la fonctionnalité : lecture et écriture avalent
leurs erreurs. Un cache en panne rend le service plus lent, jamais indisponible.

## La suppression de compte

`account.deleteAccount` exige de taper littéralement **`LÖSCHEN`**. Un simple
bouton se presse par erreur, et il n'y a rien à récupérer après.

Deux points de conception :

**L'abonnement Stripe est résilié AVANT la suppression.** Sans ça, le compte
disparaît et le prélèvement mensuel continue — sur un client qui n'existe plus
et que personne ne peut identifier. C'est le genre de bug qui finit en
litige bancaire.

**Quinze tables sont parcourues**, dans l'ordre des dépendances. La liste est
exportée sous `PERSONAL_DATA_TABLES` dans `lib/gdpr.ts` : quand tu ajoutes une
table avec un `user_id`, ajoute-la là. L'erreur coûteuse en RGPD n'est pas de
mal supprimer, c'est d'oublier une table — personne ne le remarque avant qu'une
autorité ne pose la question.

Le rapport renvoyé indique le nombre de lignes effacées par table et les
éventuelles erreurs, sans jamais interrompre le reste.

## Stripe Tax

Ajouté sur les deux flux de paiement :

```ts
automatic_tax: { enabled: true },
billing_address_collection: "required",
customer_update: { address: "auto", name: "auto" },
tax_id_collection: { enabled: true },
```

Pour une prestation numérique à un consommateur d'un autre pays de l'UE, la TVA
est celle **du pays de l'acheteur**. Stripe Tax la calcule d'après l'adresse —
d'où la collecte obligatoire et l'enregistrement sur le client, faute de quoi le
calcul retombe sur ton pays et ta déclaration OSS est fausse.

### À faire dans le Dashboard Stripe

1. **Settings → Tax** → activer Stripe Tax, adresse d'origine = Allemagne
2. **Registrations** → ajouter l'Allemagne, puis l'**enregistrement OSS** dès
   que tu dépasses le seuil de 10 000 € de ventes transfrontalières UE
3. **Products** → chaque prix : *Tax behavior* = **Inclusive** si tu affiches
   des prix TTC (l'usage en B2C allemand), sinon *Exclusive*
4. **Settings → Invoicing** → activer les factures, y mettre ton Impressum et,
   si applicable, la mention `Kleinunternehmerregelung gemäß § 19 UStG`

**Si tu es Kleinunternehmer**, laisse Stripe Tax **désactivé** dans le
dashboard : le code ci-dessus reste alors sans effet. Tu ne factures pas de
TVA, et la mention § 19 doit figurer sur chaque facture.

> ⚠️ Le régime Kleinunternehmer ne dispense **pas** de l'OSS pour les ventes
> numériques transfrontalières UE au-delà de 10 000 €/an. C'est une confusion
> fréquente et coûteuse. À valider avec ton Steuerberater avant le premier euro
> encaissé hors d'Allemagne.

## Les textes juridiques

Trois modèles dans `legal/` : `impressum.md`, `datenschutz.md`, `agb.md`.

Ils sont **rédigés d'après ce que ton code fait réellement** — les tables, les
sous-traitants, les durées, les exceptions. C'est leur intérêt : ils sont exacts,
pas génériques. Chaque `[…]` reste à compléter, chaque bloc `>` est une remarque
pour toi ou pour ton avocat.

**Une clause de responsabilité maximaliste est nulle en droit allemand**
(§ 307 BGB) — et sa nullité te laisse sans protection du tout. Celle du § 7 est
volontairement mesurée : responsabilité pleine pour faute intentionnelle, faute
lourde et atteinte aux personnes, limitée au dommage prévisible pour les
manquements essentiels, exclue au-delà. C'est ce qui tient devant un tribunal.

## Fichiers

```
api/database/schema.ts            [MODIFIÉ]  user_access.locale + translation_cache
api/index.ts                      [MODIFIÉ]  cache traduction, router account, locale DB
api/agent/index.ts                [MODIFIÉ]  clause de responsabilité dans le prompt
api/lib/gdpr.ts                   [NOUVEAU]  export + suppression
api/lib/translation-cache.ts      [NOUVEAU]
api/routes/account.ts             [NOUVEAU]  locale · export · suppression
api/routes/subscriptions.ts       [MODIFIÉ]  Stripe Tax
api/routes/credits.ts             [MODIFIÉ]  Stripe Tax
legal/impressum.md · datenschutz.md · agb.md
migration/add-legal-tables.mjs
```

`tsc --noEmit` passe.

## Installation

### 1. Le code

```
cd C:\dev\tred-rdm\aerostudy-ai
powershell -Command "Expand-Archive -Path (Get-ChildItem '%USERPROFILE%\Downloads\tred-legal*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName -DestinationPath '.\_p8' -Force"
xcopy /E /Y /I _p8\api packages\web\src\api
```

### 2. La migration

```
mkdir C:\tmp-migr
cd C:\tmp-migr
npm init -y
npm install @libsql/client
copy C:\dev\tred-rdm\aerostudy-ai\.env .
copy C:\dev\tred-rdm\aerostudy-ai\_p8\migration\add-legal-tables.mjs .
node --env-file=.env add-legal-tables.mjs
```

### 3. Déployer

```
cd C:\dev\tred-rdm\aerostudy-ai
railway up
rmdir /s /q C:\tmp-migr
```

### 4. Vérifier

Console du navigateur, connecté :

```js
await fetch('/api/rpc/account/getLocale', {
  method:'POST', headers:{'Content-Type':'application/json'},
  credentials:'include', body:'{}'
}).then(r => r.json());
```

Doit répondre `{ locale: "de" }`.

⚠️ **Ne teste `deleteAccount` que sur un compte jetable.** C'est irréversible,
et ton compte actuel porte l'abonnement de test.

## Ce qui reste, et ce dont j'ai besoin

**i18next mobile, `LanguageSelector`, écrans juridiques mobiles** — il me faut
`packages/mobile` (sans `node_modules`). C'est la quatrième fois que je le
demande ; ce même zip débloque aussi le badge de crédits, la page tarifs mobile
et les notifications push qui attendent depuis deux jours.

**Vérification d'âge.** Je ne l'ai pas implémentée volontairement : une case
« j'ai plus de 16 ans » sans vérification réelle n'a quasiment aucune valeur
juridique et donne une fausse sécurité. Si ton public est étudiant du supérieur,
la question à poser à ton avocat est plutôt : as-tu besoin d'un consentement
parental, ou une mention dans les CGV suffit-elle ? La réponse détermine s'il
faut coder quoi que ce soit.

**Le double consentement du § 6** (renonciation au droit de rétractation) n'est
pas implémenté. Sans lui, un client peut utiliser l'app treize jours et se faire
rembourser intégralement. Deux cases non précochées avant le paiement — à faire
avant le lancement réel.

---

## Rappel que tu as toi-même formulé

Je ne suis ni avocat ni Steuerberater. Ces textes et ce code sont une base
technique solide et fidèle à ton application — ils font gagner à un
professionnel l'essentiel de son temps de cadrage. Ils ne remplacent pas sa
validation, et deux points en particulier méritent un vrai avis : les documents
protégés par le droit d'auteur que tes utilisateurs téléversent, et ton statut
fiscal face à l'OSS.
