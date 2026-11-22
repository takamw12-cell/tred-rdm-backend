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
      python3 \
      python3-venv \
      libcairo2 \
      libcairo2-dev \
      pkg-config \
      gcc \
      libc6-dev \
      libgl1 \
      libegl1 \
      libfontconfig1 \
      fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

# SymPy, pour la vérification symbolique (pastille « Mit SymPy geprüft ») :
# un environnement Python à part, dans /opt/sympy, aux versions exactes de
# requirements.txt. Le serveur le lance dans un sous-processus isolé
# (packages/web/src/api/lib/sympy-verify.ts) ; pas de service en plus.
COPY packages/web/src/api/sympy/requirements.txt /tmp/sympy-requirements.txt
RUN python3 -m venv /opt/sympy \
 && /opt/sympy/bin/pip install --no-cache-dir --disable-pip-version-check -r /tmp/sympy-requirements.txt \
 && rm /tmp/sympy-requirements.txt

# ── Le moteur de dessin de « Als Video erklären » (api/video-engine/) ──────
#
# Handanim (tableau blanc), Buttery (cinématique), Matplotlib (formules) et
# FFmpeg (fourni par imageio-ffmpeg) dans un environnement à part,
# /opt/video-engine. Le serveur le lance en sous-processus isolé
# (packages/web/src/api/lib/video-engine.ts) ; sans lui, l'application se
# comporte comme avant.
#
# Python 3.12, pas celui de Debian : numpy 2.5 n'a pas de roue pour le 3.11 de
# bookworm. `uv` (binaire figé, pris dans son image officielle) installe cet
# interpréteur. pycairo n'a pas de roue Linux : il se compile ici, d'où
# libcairo2-dev, pkg-config et gcc plus haut. libgl1, libegl1 et
# libfontconfig1 sont les bibliothèques que Skia charge ; fonts-dejavu-core
# donne une police aux étiquettes du style cinématique.
COPY --from=ghcr.io/astral-sh/uv:0.11.15 /uv /usr/local/bin/uv
COPY packages/web/src/api/video-engine/requirements.txt /tmp/video-requirements.txt
RUN UV_PYTHON_INSTALL_DIR=/opt/uv-python uv venv --python 3.12 /opt/video-engine \
 && uv pip install --python /opt/video-engine/bin/python --no-cache -r /tmp/video-requirements.txt \
 && rm /tmp/video-requirements.txt \
 && chmod -R a+rX /opt/uv-python /opt/video-engine

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

# Même principe que pour LaTeX : une image où SymPy ne vérifie pas une égalité
# connue doit échouer ICI, pas sur la question d'un étudiant. Le programme
# quitte le compte racine pour « nobody » avant de calculer : ce contrôle
# prouve aussi qu'il lit ses bibliothèques sous ce compte.
RUN /opt/sympy/bin/python -I -B packages/web/src/api/sympy/verify_math.py --self-test | grep -q '"is_valid": true' \
 && echo "verification SymPy operationnelle"

# Et le moteur de dessin : une courte vidéo dans chaque style (tracés, icône
# animée, formule, musique baissée sous la voix), encodée par FFmpeg. Une image
# qui ne sait pas dessiner échoue ICI.
RUN HOME=/tmp MPLCONFIGDIR=/tmp /opt/video-engine/bin/python -I -B -X utf8 packages/web/src/api/video-engine/render_video.py --self-test | grep -q '"ok": true' \
 && echo "moteur de dessin operationnel"

ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "packages/web/src/__server.ts"]
