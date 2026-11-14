# Images de la campagne « Survive Your Klausur » — d'où elles viennent

| Fichier | Source | Droits |
|---|---|---|
| `broll-turbine.mp4` | **Vrai moteur** d'avion de ligne au sol, soufflante en moulinet (un Boeing 737 d'après la page Pexels ; soufflante métallique d'environ 24 pales, donc très probablement un CFM56-7B — non vérifié auprès de l'auteur). Clip Pexels n° 29323831, « Close-Up of Airplane Turbine Engine Spinning », par Emeric Martin — <https://www.pexels.com/video/close-up-of-airplane-turbine-engine-spinning-29323831/>. Téléchargé le 2026-11-14 (1080 × 1920, 30 i/s, 6,6 s). | Licence Pexels (<https://www.pexels.com/license/>, relue le 2026-11-14) : usage gratuit, y compris publicité et réseaux sociaux ; mention de l'auteur non exigée ; modification permise. |
| `broll-stress.mp4`, `broll-relief.mp4`, `broll-desk.mp4` | Générés le 2026-11-14 par Replicate (`lightricks/ltx-2.3-pro`), avec `scripts/tiktok-broll.mjs`. Personne et lieux fictifs. | Sorties du modèle, usage commercial. À signaler comme contenu généré par IA au moment de publier. |
| `app-*.jpg` | Captures de la VRAIE interface de TRED (serveur local, base de test, compte de démonstration), prises par `scripts/cinematic-captures.mjs` avec `CINE_PROFESSOR=genius`. | À nous. |
| Portrait de Prof. Kenta (hologramme de SK-3) | `packages/web/public/avatars/kenta.webp`, le fichier que sert l'app. | Voir `packages/web/public/avatars/CREDITS.md`. |

## Ce qui a été fait au clip Pexels, et pourquoi

Le fichier d'origine montre, au-dessus du moteur, le fuselage d'une compagnie
(lettre de sa livrée, immatriculation) et une personne sur la passerelle. La
licence Pexels interdit de laisser croire qu'une marque ou une personne visible
à l'image soutient le produit. Le clip est donc **recadré sur l'entrée d'air** :
ni livrée, ni immatriculation, ni personne dans le cadre. Il est aussi étalonné
vers le bleu nuit de la campagne.

```
ffmpeg -i <original> -an -vf "crop=830:1476:100:440,scale=1080:1920:flags=lanczos,curves=all='0/0 0.10/0.24 0.30/0.47 0.7/0.72 1/0.92',eq=saturation=0.86:contrast=1.04,colorbalance=rs=-0.07:bs=0.12:rm=-0.04:bm=0.07,vignette=PI/6" -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -r 30 -movflags +faststart broll-turbine.mp4
```

Les autres points de la licence, à garder en tête : ne pas revendre le clip tel
quel, ne pas le redistribuer sur une banque d'images, ne pas en faire un
élément de marque. Si une vidéo est recadrée autrement un jour, vérifier que la
livrée reste hors champ.

## Pourquoi pas un plan généré

Deux essais (2026-11-14) : une douzaine de pales en forme de rames, puis, avec
un texte plus précis, des pales en rayons de vélo et un moteur posé au sol dans
l'axe du fuselage. Un étudiant en aéronautique le voit tout de suite.
