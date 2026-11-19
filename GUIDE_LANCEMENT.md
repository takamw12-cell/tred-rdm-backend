# GUIDE LANCEMENT — TRED (19 nov. 2026)

Le tunnel de paiement est validé en réel : Klausur-Pass payé 9,99 €, 50 crédits
crédités. Ce guide réunit les commandes de maintenance et la marche à suivre
pour le lancement marketing. Le détail technique de chaque fonction reste dans
`GUIDE_FOUNDER.md`.

Toutes les commandes se lancent depuis `C:\dev\tred-rdm\aerostudy-ai`.

---

## 1. Maintenance

### Migrations de la base (`migre-*.mjs`)

Chaque script ajoute une table ou une colonne en production. Il lit le `.env`
de la racine et peut être relancé sans risque : ce qui existe déjà est sauté.

```
node migre-<nom>.mjs
```

Les plus récents, à vérifier avant le lancement :

| Script | Pourquoi | Signe qu'il manque |
|---|---|---|
| `migre-prof-perso.mjs` | « Dein Professor » (nom, voix) et cache des voix | la page du professeur affiche « gleich verfügbar » |
| `migre-beta-credits.mjs --apply` | 10 crédits de bienvenue aux comptes de la bêta | un bêta-testeur a 0 crédit. Sans `--apply`, le script compte seulement |
| `migre-streak.mjs` | série de jours d'étude | la pastille de série n'apparaît pas |
| `migre-referral.mjs` | parrainage `/invite` | `/invite` dit « bientôt » |

### Compte fondateur (illimité)

```
node compte-fondateur.mjs --voir                (affiche, ne change rien)
node compte-fondateur.mjs                       (ton compte)
node compte-fondateur.mjs <adresse e-mail>      (un autre compte : démo Apple/Google, associé)
```

Effet : tarif `founder`, aucun crédit déduit, pastille « ∞ Credits (Founder) ».
Un Pass acheté par ce compte crédite quand même son stock, ce qui permet de
tester le webhook.

### Surveiller après le lancement

- **Railway → service TRED → Logs.** Filtres utiles :
  - `[subscriptions]` : un paiement qui n'a pas démarré. Le code Stripe est
    aussi affiché sous le bouton, par exemple « (Stripe: url_invalid · success_url) ».
  - `[stripe] webhook` : la livraison des crédits.
  - `[config]` : `WEBSITE_URL` invalide.
- **Bruit connu à éteindre** : toutes les heures, `[stripe] webhook: invalid signature`
  pour un événement `livemode: false`. C'est l'ancien webhook du **mode test** de
  Stripe qui pointe encore vers la production, avec l'ancien abonnement de test
  `sub_1UCG…`. Pour l'éteindre : Stripe → bascule « Mode test » → Développeurs →
  Webhooks → désactiver l'endpoint `tred-tutor.de`. Pour aller plus loin, annuler
  l'abonnement de test. Rien à voir avec les paiements réels.
- **Stripe → Paiements** : chaque Pass vendu. **Stripe → Webhooks (mode live)** :
  `we_1UdHfRRmKxbqlSdtGUHgZAEc` doit rester sans échec.

---

## 2. Les vidéos de lancement

### Où elles sont

`packages\video\out\marketing\` (1080 × 1920, ~20–30 s, H.264) :

| Fichier | Langue | Angle |
|---|---|---|
| `en1-panic-hack.mp4` | EN | Panik-Modus + la preuve par ton propre PDF |
| `en2-3d-arcade.mp4` | EN | turbofan 3D, 3D Detective, Arcade |
| `en3-personal-professor.mp4` | EN | ton professeur IA (nom, voix), réponses avec page |
| `de1-klausur-rettung.mp4` | DE | Klausur morgen → Panik-Modus → Beleg → Quiz |
| `de2-technischer-deep-dive.mp4` | DE | Triebwerk 3D, Tafel, Formel im Erklärvideo |
| `de3-lernprofil.mp4` | DE | Lernprofil, 7-Tage-Plan, +0,5 Credit |

Les scripts sont dans `packages\video\src\pro\storyboards\*.json` : accroche
(≤ 2,8 s), corps, appel à l'action. Pour modifier un texte, édite le JSON, puis
régénère la voix et la vidéo (commandes ci-dessous).

### Les refaire

```
cd packages\video
npm run voiceover:marketing                    (voix manquantes, ElevenLabs, ~250 caractères par vidéo)
npm run voiceover:marketing -- de1-klausur-rettung --force   (refaire une voix)
npm run render:marketing-all                   (les 6 vidéos, ~15 min chacune)
npm run render:marketing-all -- en2-3d-arcade  (une seule)
```

- **Musique** : synthétisée par `scripts/lofi-music.mjs` (aucun échantillon,
  libre de droits), en boucle à −20 dB.
- **Sans voix** : une vidéo sans `vo-<id>.mp3` dans `public\pro\` sort avec la
  musique et les sous-titres seuls.

### Comment les poster

1. **TikTok** (application ou TikTok Studio sur ordinateur) :
   - importer le `.mp4` ;
   - coller la légende correspondante de `marketing\TIKTOK_CAPTIONS.txt` ;
   - couverture : l'image « TRED » de la fin, ou le titre de l'accroche ;
   - ne pas ajouter de son TikTok par-dessus : la musique est déjà dans la vidéo.
2. **Rythme** : une vidéo par jour, en alternant EN et DE, entre 18 h et 21 h
   (heure allemande). Ordre conseillé : DE 1 → EN 1 → DE 2 → EN 2 → DE 3 → EN 3.
3. **Instagram Reels / YouTube Shorts / Snapchat** : mêmes fichiers, même légende.
   Raccourcir les hashtags à 3–5.
4. **LinkedIn** : `marketing\LINKEDIN_POST.txt` (version EN et version DE), avec
   la vidéo EN 2 ou DE 2 jointe. Publier en natif, sans lien YouTube.
5. **Suivi** : pour savoir quelle vidéo amène quelle inscription, mettre dans la
   bio un lien du type `tred-tutor.de/?utm_source=tiktok&utm_campaign=pro-de1`
   (voir « Suivi des campagnes » dans `GUIDE_FOUNDER.md`). Les inscriptions
   s'affichent dans PostHog.

### Ce qu'on peut dire, et ce qu'on évite (UWG)

- **Oui** : « la preuve par ton propre PDF », « chaque réponse montre sa page »,
  « kostenlos starten, 10 Credits », « 15 secondes par question ».
- **Non** : « zéro hallucination », « 100 % juste », « garanti », chiffres
  d'utilisateurs ou de réussite inventés, compteurs « factices ».
- Une affirmation nouvelle : la vérifier d'abord dans « Ce que TRED peut
  affirmer dans une publicité » (`GUIDE_FOUNDER.md`).

---

## 3. Ce soir (19 nov. 2026) — checklist finale

État vérifié à 13 h 20 UTC :
- **Production à jour** : le dernier commit (`85f2049`) est déployé (Railway SUCCESS).
  Le site, `/pricing` et `/api/config` répondent en 200, en moins de 0,8 s.
  Aucune erreur dans les journaux depuis 11 h 03 UTC.
- **Webhook Stripe** : l'endpoint du mode test (`we_1U6Cuh…`) est désactivé.
  L'endpoint live `we_1UdHfR…` est actif, avec 7 événements.
- **Paiement réel : PAS ENCORE PROUVÉ.** Dans Stripe live, il n'y a aucun
  paiement (0 charge) et une seule session de paiement : le Semester-Pass, ouverte
  à 12 h 06 UTC et restée « non payée ». La création de la page Stripe fonctionne,
  mais pas encore « argent encaissé → webhook → crédits ». Voir la première case
  ci-dessous.

À cocher dans l'ordre :

- [ ] **Achat réel de contrôle** : Pack 20 Credits (4,99 €) ou Klausur-Pass (9,99 €),
      payé jusqu'au bout. Ensuite, vérifier :
      - Stripe → Paiements : le paiement « Réussi » ;
      - Stripe → Webhooks → `we_1UdHfR…` : `checkout.session.completed` livré en 200 ;
      - TRED : la pastille de crédits a augmenté.

      Si l'un des trois manque, me l'écrire avant d'envoyer l'e-mail.
- [ ] **Crédits des bêta-testeurs** :
      `node migre-beta-credits.mjs` (compte), puis `node migre-beta-credits.mjs --apply`.
- [ ] **Poster EN 1** : `packages\video\out\marketing\en1-panic-hack-musique-v1.mp4`.
      Légende n° 1 de `marketing\TIKTOK_CAPTIONS.txt`.
- [ ] **LinkedIn** : `marketing\LINKEDIN_POST.txt`, avec la vidéo EN 1 tant que
      EN 2 / DE 2 ne sont pas rendues.
- [ ] **E-mail aux 36 bêta-testeurs** : `marketing\EMAIL_BETA.txt` (DE + EN). Ne
      l'envoyer qu'après les deux premières cases.
      1. L'envoyer d'abord **à toi-même** depuis ta boîte (Gmail), pour relire.
      2. Puis l'envoyer aux bêta-testeurs en **Cci** (jamais en « À »).

      TRED n'a pas d'envoi groupé libre depuis l'admin : `/api/emails/discovery`
      envoie seulement les campagnes « Tipps & Neuigkeiten » prévues, et seulement
      aux comptes qui ont confirmé leur abonnement (double opt-in).
- [ ] **Le soir** : Railway → Logs, filtres `[subscriptions]` et `[stripe] webhook`.
      Stripe → Paiements.

### Les fichiers (chemins exacts)

| Quoi | Fichier |
|---|---|
| Post LinkedIn (EN + DE) | `C:\dev\tred-rdm\aerostudy-ai\marketing\LINKEDIN_POST.txt` |
| Légendes TikTok (6 vidéos) | `C:\dev\tred-rdm\aerostudy-ai\marketing\TIKTOK_CAPTIONS.txt` |
| E-mail bêta-testeurs (DE + EN) | `C:\dev\tred-rdm\aerostudy-ai\marketing\EMAIL_BETA.txt` |
| Vidéo EN 1 (à poster ce soir) | `C:\dev\tred-rdm\aerostudy-ai\packages\video\out\marketing\en1-panic-hack-musique-v1.mp4` |
| Vidéo EN 1, musique « focus » | `C:\dev\tred-rdm\aerostudy-ai\packages\video\out\marketing\en1-panic-hack.mp4` |

### Les 5 autres vidéos, une fois les crédits ElevenLabs achetés

Il faut environ 1 300 caractères. Dans le terminal de Claude Code :

```
! cd /mnt/c/dev/tred-rdm/aerostudy-ai/packages/video && npm run voiceover:marketing && npm run render:marketing-all -- de1-klausur-rettung en2-3d-arcade de2-technischer-deep-dive en3-personal-professor de3-lernprofil
```

- `voiceover:marketing` ne génère que les voix manquantes. La voix de EN 1 existe
  déjà et n'est pas refacturée.
- Le rendu prend environ 20 min par vidéo, soit 1 h 30 à 2 h pour les cinq.
- Les fichiers arrivent dans `packages\video\out\marketing\<id>.mp4`.
- Chaque vidéo prend automatiquement sa musique : focus, chillhop ou cosy.

## 3. Le jour J — liste

- [ ] Migrations de la section 1 vérifiées (surtout `migre-beta-credits --apply`
      si les bêta-testeurs doivent recevoir leurs 10 crédits).
- [ ] Webhook du mode test de Stripe désactivé (bruit dans les journaux).
- [ ] E-mail aux bêta-testeurs : lien `tred-tutor.de`, ce qui change (crédits,
      Pass), lien d'invitation `/invite` (+15 crédits chacun).
- [ ] Première vidéo postée + post LinkedIn.
- [ ] Le soir : Railway (`[subscriptions]`, `[stripe] webhook`) et Stripe
      (paiements, webhooks) contrôlés.
