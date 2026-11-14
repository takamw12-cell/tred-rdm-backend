import path from "node:path";
import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind-v4";
import webpack from "webpack";

/**
 * La vidéo réutilise les VRAIS composants de packages/web (Tafel, professeur,
 * logo, solveur de Technische Mechanik). On donne donc à Remotion :
 *  - l'alias `@` de l'app web (src/web) ;
 *  - Tailwind v4, avec la feuille de styles de l'app (src/style.css) ;
 *  - les fichiers publics de l'app (avatars, fonds, polices) ;
 *  - `import.meta.env`, que Vite fournit à l'app et pas Webpack.
 */
const WEB = path.resolve(process.cwd(), "../web");

Config.setPublicDir(path.join(WEB, "public"));
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setOverwriteOutput(true);

Config.overrideWebpackConfig((current) => {
  const withTailwind = enableTailwind(current);
  return {
    ...withTailwind,
    resolve: {
      ...withTailwind.resolve,
      // Les url("/fonts/…") de styles.css pointent vers public/ de l'app web.
      roots: [path.join(WEB, "public")],
      alias: {
        ...(withTailwind.resolve?.alias as Record<string, string> | undefined),
        "@": path.join(WEB, "src/web"),
        // La composition « Als Video erklären » vit dans packages/web et importe
        // `remotion` : sans cet alias, Webpack y chargerait une SECONDE copie
        // (celle de l'app), et ses hooks ne verraient pas la composition.
        remotion$: path.resolve(process.cwd(), "node_modules/remotion"),
      },
    },
    module: {
      ...withTailwind.module,
      rules: [
        ...(withTailwind.module?.rules ?? []),
        // Les clips face caméra (public/facecam/) sortent souvent du téléphone
        // avec une extension en majuscules (« INTRO.MOV »), que la règle de
        // Remotion — minuscules seulement — laisserait passer pour du code.
        { test: /\.(mp4|mov|webm)$/i, exclude: /\.(mp4|mov|webm)$/, type: "asset/resource" },
      ],
    },
    plugins: [
      ...(withTailwind.plugins ?? []),
      new webpack.DefinePlugin({
        "import.meta.env": JSON.stringify({ MODE: "production", DEV: false, PROD: true, SSR: false }),
      }),
    ],
  };
});
