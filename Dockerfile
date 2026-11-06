# TRED — image de déploiement.
#
# ── Pourquoi une image, alors que nixpacks suffisait ──────────────────────
#
# Le tuteur dessinait ses schémas électriques en SVG, coordonnée par
# coordonnée. Un modèle de langage qui place à la main les segments d'un
# amplificateur opérationnel produit un dessin de travers, et cela se voit au
# premier coup d'œil — c'est une des raisons pour lesquelles TRED ne « faisait
# pas prof ».
#
# CircuiTikz est ce dont se servent réellement les professeurs d'ingénierie
# allemands. Il demande une distribution LaTeX, donc une image explicite.
# `railway.json` bascule sur ce fichier ; pour revenir en arrière, il suffit
# d'y remettre `"builder": "NIXPACKS"` — l'application fonctionne sans LaTeX,
# elle perd seulement les schémas compilés.
#
# ── Ce que pèse ce choix ──────────────────────────────────────────────────
#
# Environ 700 Mo de TeX Live et deux à quatre minutes de construction en plus.
# On installe les quatre collections nécessaires et pas `texlive-full`, qui
# ferait cinq gigaoctets pour les mêmes figures :
#
#   texlive-latex-base        le moteur
#   texlive-latex-extra       la classe `standalone`
#   texlive-pictures          tikz ET circuitikz
#   texlive-science           siunitx (les unités, partout en ingénierie)
#   texlive-fonts-recommended helvet, la police sans-serif des figures
#   dvisvgm + mupdf-tools     PDF → SVG
#
# ── mupdf-tools n'est pas facultatif ──────────────────────────────────────
#
# `dvisvgm --pdf` lit le PDF via Ghostscript OU via mutool. Depuis
# Ghostscript 10.01, dvisvgm refuse Ghostscript et exige mutool :
#
#   ERROR: To process PDF files, either Ghostscript < 10.01.0 or mutool
#   is required. The installed Ghostscript version 10.02.1 isn't supported.
#
# Sans `mupdf-tools`, pdflatex produirait donc un PDF parfait et la
# conversion échouerait juste après — une panne d'autant plus déroutante que
# les journaux LaTeX, eux, sont propres. Vérifié ici avant livraison.
# ── Étape 1 : le front (Vite) + le pré-rendu SEO ─────────────────────────
#
# Le pré-rendu (packages/web/scripts/prerender.mjs) ouvre les pages publiques
# dans Chromium pour en figer le HTML — lisible par Google et AdSense sans
# JavaScript. Chromium et ses bibliothèques restent dans CETTE étape : seul
# packages/web/dist passe dans l'image finale.
FROM oven/bun:1-debian AS web-build
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/web/package.json packages/web/
COPY packages/mobile/package.json packages/mobile/
RUN bun install --frozen-lockfile
# Même version que le paquet `playwright` du lockfile (packages/web).
RUN bunx playwright@1.64.1 install --with-deps chromium

# Variables PUBLIQUES lues par Vite au build. Avec un Dockerfile, Railway ne
# transmet une variable au build que si elle est déclarée ici en ARG : sans
# ces lignes, VITE_POSTHOG_KEY, VITE_ADSENSE_CLIENT_ID… n'entrent jamais dans
# le bundle (constaté le 6 nov. 2026 : aucune clé PostHog en production).
ARG VITE_WEBSITE_URL
ARG VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST
ARG VITE_AMAZON_PARTNER_TAG
ARG VITE_AUTH_GOOGLE
ARG VITE_AUTH_APPLE
ARG VITE_AVATAR_ENABLED
ARG VITE_TLDRAW_LICENSE_KEY
ARG VITE_ADSENSE_CLIENT_ID
ARG VITE_ADSENSE_SLOT_NATIVE
ARG VITE_ADSENSE_SLOT_INTERSTITIAL
ARG VITE_GAM_REWARDED_AD_UNIT
ARG VITE_ADS_TEST_MODE

COPY . .
RUN bun run build:web

# ── Étape 2 : l'image qui tourne (Bun + chaîne LaTeX) ──────────────────────
FROM oven/bun:1-debian

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      texlive-latex-base \
      texlive-latex-extra \
      texlive-pictures \
      texlive-science \
      texlive-fonts-recommended \
      dvisvgm \
      mupdf-tools \
      ghostscript \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Vérification à la construction, pas à la première question d'un étudiant.
# Une image sans circuitikz doit échouer ICI, où on la regarde, et non six
# heures plus tard sur un schéma qui ne s'affiche pas.
RUN kpsewhich circuitikz.sty > /dev/null \
 && kpsewhich standalone.cls > /dev/null \
 && kpsewhich siunitx.sty    > /dev/null \
 && command -v dvisvgm       > /dev/null \
 && command -v mutool        > /dev/null \
 && echo "chaine LaTeX complete"

WORKDIR /app

# Les dépendances d'abord : tant que le lockfile ne change pas, Docker
# réutilise cette couche et la construction ne réinstalle rien.
COPY package.json bun.lock ./
COPY packages/web/package.json packages/web/
COPY packages/mobile/package.json packages/mobile/
RUN bun install --frozen-lockfile

COPY . .
# Le front construit (et pré-rendu) à l'étape 1.
COPY --from=web-build /app/packages/web/dist packages/web/dist

ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "packages/web/src/__server.ts"]
