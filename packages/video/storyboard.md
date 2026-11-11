# Storyboard — vidéos promotionnelles TRED

> Écrit d'abord pour 22 s ; la première vidéo Remotion (`src/HoersaalPromo.tsx`, 15 s) en reprend le fil, resserré : Hook 2,5 s → Reveal 2,5 s → Hörsaal + solveur 5 s → Profs 2,5 s → Outro 2,5 s. Pas de musique dans cette première version.

Format : vertical 1080×1920, 30 fps, 22 s.
Ton : « premium, futuriste, inspirant » → base `cinematic`, retenu comme `polished` (longues tenues, fondus nets, pas de gag).

## Rubrique
- **Quoi :** un tuteur IA pour les études d'ingénieur, qui écrit la solution au tableau (la Tafel du Hörsaal numérique).
- **Pour qui :** les étudiants en ingénierie en Allemagne (Technische Mechanik d'abord).
- **Ce qui le distingue :** il lit TON polycopié et cite la page ; les diagrammes N, T, M viennent d'un solveur, pas d'un modèle de langage ; 4 professeurs d'anime au choix.
- **Promesse la plus forte (page d'accueil du 2026-11-11) :** « Die Universität für die Hosentasche » : un tableau interactif, des solveurs déterministes à la place de chiffres devinés. Aucune comparaison avec un autre assistant.
- **Accroche visuelle :** la turbine (fond aerospace-01 du projet) qui tourne + une formule au feutre barrée en rouge.
- **UI réelle montrée :** la Tafel (verre dans un cadre en métal brossé, salle bleu nuit), le professeur flottant avec sa pastille d'état, le vestiaire des 4 profs.
- **Légende :** voir share-copy.txt.

## Identité
Crème #FDFBF7, encre #1A1A1A, jaune #EAB308, nuit #0F172A ; encre du tableau #1B2A4A.
Polices du projet : Fraunces (titres), Inter (texte), Caveat (écriture au tableau). Logo TRED (tred-logo.svg).
Avatars : Prof. Kenta, Sensei Haruto, Prof. Ren, Dr. Aiko (public/avatars, générés pour le projet, licence Apache-2.0).
Aucune donnée personnelle ni secret à l'écran.

## Musique
Synthétisée, 120 BPM (temps = 0,5 s, mesure = 2 s), la mineur : nappe Am–F–C–G, sub-basse, kick doux, charleston à partir du reveal, arpège de cloches. Montée avant 3 s, impact sur 3 s et sur l'outro. Toutes les coupes tombent sur un temps.

## Storyboard (22 s)
| # | Temps | Scène | Texte à l'écran |
|---|---|---|---|
| 1 | 0–3 s | Hook. Turbine sombre qui tourne. Une formule s'écrit au feutre, un trait rouge la barre. | « M_max = −4 kNm » ✗ — « L'IA s'est encore trompée de signe ? » |
| 2 | 3–6 s | Reveal. Flash crème, logo TRED qui se pose. | « Le premier tuteur IA qui lit ton propre polycopié. » |
| 3 | 6–11 s | Le Hörsaal. Salle bleu nuit, la Tafel ; Prof. Kenta flottant « schreibt an die Tafel… » ; la solution s'écrit ligne par ligne. | Gegeben q = 2 kN/m, L = 4 m · A = B = qL/2 = 4 kN · M_max = qL²/8 = 4 kNm · « Chaque réponse cite la page du cours » |
| 4 | 11–15 s | Le solveur. Poutre sur deux appuis, charge répartie ; T(x) puis M(x) se tracent. | « Diagrammes N, T, M tracés par un solveur de Technische Mechanik. » |
| 5 | 15–18,5 s | Les profs. 4 cartes qui arrivent l'une après l'autre. | « Choisis qui t'explique au tableau. Le ton change, l'exactitude jamais. » |
| 6 | 18,5–22 s | Outro. Logo, URL, cible. | « tred-tutor.de » · « Conçu pour les étudiants en ingénierie en Allemagne. » |

Chiffres vérifiés : poutre sur deux appuis, q = 2 kN/m, L = 4 m → A = B = 4 kN, T de +4 à −4 kN, M_max = qL²/8 = 4 kNm au milieu.
