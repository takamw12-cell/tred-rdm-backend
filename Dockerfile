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
RUN bun run build:web

ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "packages/web/src/__server.ts"]
