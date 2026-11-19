# Note technique — avatar personnalisé du professeur (après le lancement)

19 nov. 2026. Rien n'est codé ; à discuter après le lancement.

## Ce que ça voudrait dire

L'étudiant téléverse une image (photo ou dessin) qui remplace le portrait du professeur dans le Hörsaal et les réglages. Le prénom et la voix existent déjà (« Dein Professor », `professor_custom`).

## Faisable sans risque majeur : le stockage

- **Où** : le stockage existant (Cloudflare R2 / S3, `api/lib/media-storage.ts`), préfixe `avatars/<compte>/`. Une colonne `avatar_key` dans `professor_custom`.
- **Comment** : téléversement par le serveur (comme les documents), redimensionné à 512 × 512, réencodé en WebP. Le réencodage retire les métadonnées EXIF (position GPS d'une photo prise au téléphone) et neutralise les fichiers piégés. Taille max 5 Mo à l'entrée, ~40 Ko stockés.
- **Affichage** : servi par une route authentifiée (pas d'URL publique), mis en cache dans l'app.
- **RGPD** : ajouté à l'export et à la suppression (`api/lib/gdpr.ts`). Une photo de visage est une donnée personnelle, pas « sensible » au sens de l'art. 9 tant qu'elle ne sert pas à identifier.
- **Coût** : négligeable (quelques Ko par compte).

## Le vrai sujet : la modération

Une image affichée seulement à son auteur est peu risquée. Mais dès qu'elle peut apparaître ailleurs (Lerngruppe, partage d'une explication, vidéo), il faut modérer :

| Option | Coût | Qualité | Remarque |
|---|---|---|---|
| A. Image privée, jamais montrée à d'autres | 0 € | — | La plus simple. Seul l'auteur voit son avatar. Pas de modération nécessaire au-delà d'un bouton « signaler ». **Recommandée pour une V1.** |
| B. Modération automatique (Claude Haiku avec image, ou API de modération d'un fournisseur cloud) | ~0,1 ct à 0,5 ct par image | Bonne sur nudité / violence / symboles haineux ; moyenne sur marques et personnes connues | Refus avant enregistrement ; journal des refus. |
| C. Modération humaine (file d'attente dans le panneau fondateur) | Ton temps | Excellente | Ne tient pas au-delà de quelques dizaines d'images par jour. |

## Les points juridiques à trancher avant de coder

1. **Droit à l'image et marques** : une photo d'une célébrité ou un personnage connu (Disney, manga…) affiché comme « ton professeur » dans un produit payant reprend le problème déjà réglé pour les prénoms. Le filtre de texte ne marche pas sur une image ; il faut l'option B, ou l'option A (image jamais montrée à d'autres).
2. **App Store / Google Play** : un contenu téléversé par l'utilisateur impose un moyen de signaler et de bloquer (App Store 1.2, Google Play « Contenu généré par l'utilisateur »). Avec l'option A, un bouton « supprimer mon avatar » suffit en pratique ; avec un affichage partagé, il faut un signalement et un délai de traitement.
3. **Mineurs** : TRED vise des étudiants, mais une photo de mineur téléversée par erreur doit pouvoir être supprimée immédiatement (bouton de suppression + effacement du stockage, pas seulement de la ligne).

## Alternative moins risquée

Proposer un **générateur de portraits** dans le style des 9 professeurs (choix de coiffure, couleur, lunettes…) au lieu d'un téléversement : aucun contenu externe, aucune modération, aucun droit à l'image. Plus de travail de dessin, zéro risque juridique.

## Estimation

- Option A (téléversement privé) : ~1 jour (route, réencodage, réglages, RGPD, tests).
- Option B en plus : ~0,5 jour, plus le coût par image.
- Générateur de portraits : 2 à 4 jours selon le nombre de variantes graphiques.
