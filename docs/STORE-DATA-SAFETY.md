# Google Play — fiche « Sécurité des données » (Data safety) de TRED Tutor

Relevé fait dans le code le 19 nov. 2026 (app `packages/mobile`, serveur `packages/web/src/api`).
À recopier dans Play Console → Contenu de l'application → Sécurité des données.
Si une fonction change, cette fiche doit changer avec elle.

## Questions générales

| Question | Réponse | Pourquoi |
|---|---|---|
| L'app collecte ou partage-t-elle des données utilisateur ? | **Oui** | Compte, documents, messages au tuteur. |
| Toutes les données sont-elles chiffrées en transit ? | **Oui** | API uniquement en HTTPS (`app.json → extra.apiUrl`), trafic en clair refusé par Android. |
| Les utilisateurs peuvent-ils demander la suppression de leurs données ? | **Oui** | Dans l'app : Einstellungen → Deine Daten → « Konto löschen » (mot `LÖSCHEN`). Supprime le compte et toutes ses tables (`api/lib/gdpr.ts`). |
| Lien web de suppression (obligatoire) | `https://www.tred-tutor.de/datenschutz` | **À vérifier par toi** : Google exige une page qui explique comment supprimer le compte sans installer l'app. La page Datenschutz doit contenir ce paragraphe (voir « À faire » plus bas). |
| L'app contient-elle des annonces ? | **Non** | Les emplacements publicitaires existent dans le code (`mobile/lib/ads.ts`) mais aucun SDK publicitaire n'est installé. À changer le jour où AppLovin/AdMob est ajouté. |
| Achats dans l'app | **Aucun** | Masqués sur Android et iOS (`mobile/lib/store-policy.ts`), refusés par le serveur pour l'app. |

« Partagé » au sens de Google = transmis à un tiers **pour son propre usage**. Les prestataires qui traitent les données pour le compte de TRED (Anthropic, ElevenLabs, Cloudflare, Turso, Railway, Resend) ne comptent **pas** comme partage. Réponse « Partagé » : **Non** pour toutes les catégories.

## Données collectées, catégorie par catégorie

| Catégorie Google | Type | Collecté | Obligatoire ? | Finalités à cocher | Détail |
|---|---|---|---|---|---|
| Infos personnelles | **Nom** | Oui | Obligatoire | Fonctionnalité de l'app, Gestion du compte | Prénom/nom saisi à l'inscription, affiché dans l'app. |
| Infos personnelles | **Adresse e-mail** | Oui | Obligatoire | Gestion du compte, Communications du développeur | Connexion, réinitialisation du mot de passe, rappels d'étude (désactivables). Envoi par Resend. |
| Infos personnelles | **ID utilisateur** | Oui | Obligatoire | Fonctionnalité de l'app, Gestion du compte | Identifiant interne du compte. |
| Fichiers et documents | **Fichiers et documents** | Oui | Facultatif | Fonctionnalité de l'app | PDF, images, Word/PowerPoint importés. Texte extrait et envoyé à Anthropic pour répondre ; fichier stocké chez Cloudflare R2 / S3. |
| Messages | **Autres messages dans l'app** | Oui | Facultatif | Fonctionnalité de l'app, Personnalisation | Questions au tuteur et réponses (historique des conversations), envoyées à Anthropic. |
| Activité dans l'app | **Interactions avec l'app** | Oui | Obligatoire | Statistiques, Fonctionnalité de l'app | Écrans vus (OneDollarStats, `app/_layout.tsx`), série de jours d'étude, progression par concept. |
| Activité dans l'app | **Autres contenus générés par l'utilisateur** | Oui | Facultatif | Fonctionnalité de l'app, Personnalisation | Fiches, plan d'étude, prénom donné au professeur, signalements de réponses. |
| Infos financières | **Historique des achats** | Oui | Facultatif | Fonctionnalité de l'app, Gestion du compte | L'app affiche les Pass et crédits achetés sur le site (aucun achat dans l'app, aucune donnée de carte). |
| Identifiants de l'appareil ou autres | **ID d'appareil ou autre** | Oui | Facultatif | Fonctionnalité de l'app | Jeton de notification push (Expo), seulement si l'étudiant accepte les notifications. |

## Ce que l'app Android NE collecte PAS (répondre « Non »)

- **Audio / voix** : l'app Android n'utilise pas le micro (aucune permission `RECORD_AUDIO`). La voix du professeur est **générée** côté serveur (ElevenLabs) à partir du texte de la réponse : c'est un traitement de texte, pas un enregistrement de l'utilisateur.
- Localisation (précise ou approximative), contacts, agenda, photos/vidéos de la galerie (un document image passe par « Fichiers et documents »), santé, données financières de paiement (carte, IBAN), journaux de plantage (aucun service de rapport de plantage dans l'app mobile).
- L'adresse IP sert seulement à limiter les abus (compteurs de requêtes), jamais à situer l'utilisateur.

## Intégrité de l'app (Play Integrity)

Le jeton Play Integrity est produit par Google Play et vérifié par Google ; TRED n'en garde que le verdict pendant 24 h, sans identifiant d'appareil. Selon la documentation Google, l'usage de l'API Play Integrity n'est pas une « collecte » à déclarer en soi. **À confirmer par toi** au moment de remplir le formulaire (le texte d'aide de la Play Console fait foi).

## À faire avant d'envoyer la fiche

1. **Page Datenschutz** (`packages/web/src/web/data/legal.ts`, texte juridique, à valider par toi) : elle cite Anthropic, ElevenLabs, Cloudflare, Turso, Railway, Resend, Stripe, PostHog, Replicate et OneDollarStats, mais **pas** : Sentry (erreurs serveur), le service de notifications Expo (relayé par Google FCM / Apple APNs), HeyGen, Google Play Integrity et Apple App Attest. Elle doit aussi expliquer comment supprimer son compte sans l'app (Google l'exige pour le lien de suppression).
2. Le jour où un SDK publicitaire est installé : passer « Contient des annonces » à Oui et ajouter « ID publicitaire ».
