import { cpSync, createReadStream, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Plugin } from "vite";

/**
 * Les fichiers annexes de PDF.js, servis sous /pdfjs/ :
 *
 *   cmaps/           tables de caractères (PDF en chinois, japonais, coréen)
 *   standard_fonts/  les 14 polices standard qu'un PDF peut ne pas embarquer
 *                    (Helvetica, Times… : très fréquent dans les exports PowerPoint)
 *   wasm/            décodeurs d'images JPEG 2000 / JBIG2 (les scans) et profils couleur
 *   iccs/            profil CMJN
 *
 * Sans eux, le lecteur de l'app (web/components/pdf-viewer.tsx) affiche des
 * pages aux lettres fausses ou des scans blancs. PDF.js les demande par nom
 * de fichier fixe dans un dossier : on ne peut donc pas les importer un par
 * un (Vite renommerait chacun). Ils sont copiés tels quels depuis le paquet
 * `pdfjs-dist` installé — jamais commités, toujours de la version du moteur.
 */
const FOLDERS = ["cmaps", "standard_fonts", "wasm", "iccs"] as const;
const MIME: Record<string, string> = { ".wasm": "application/wasm", ".js": "text/javascript", ".bcmap": "application/octet-stream", ".pfb": "application/octet-stream", ".ttf": "font/ttf", ".icc": "application/vnd.iccprofile" };

export default function pdfjsAssetsPlugin(): Plugin {
  const pkg = path.dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
  let outDir = "dist";
  return {
    name: "tred:pdfjs-assets",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    // En développement : servis directement depuis node_modules.
    configureServer(server) {
      server.middlewares.use("/pdfjs", (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? "").split("?")[0] ?? "").replace(/^\/+/, "");
        const file = path.join(pkg, rel);
        // Seulement les quatre dossiers, et rien qui en sorte.
        if (!FOLDERS.some((f) => rel.startsWith(`${f}/`)) || !file.startsWith(pkg + path.sep) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("Content-Type", MIME[path.extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
    // Au build : copiés dans dist/pdfjs/, à côté des autres fichiers statiques.
    closeBundle() {
      for (const folder of FOLDERS) {
        const from = path.join(pkg, folder);
        if (existsSync(from)) cpSync(from, path.join(outDir, "pdfjs", folder), { recursive: true });
      }
    },
  };
}
