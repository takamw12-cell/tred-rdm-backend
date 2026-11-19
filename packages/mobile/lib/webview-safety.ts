/**
 * Ce qui entre dans la WebView des formules (components/chat/RichText.tsx).
 *
 * La réponse du tuteur est insérée dans un `<script>`. `JSON.stringify` seul
 * ne suffit pas : une réponse qui contient `</script>` — recopiée d'un PDF
 * piégé, par exemple — fermerait le script et pourrait en ouvrir un autre.
 * On échappe donc `<`, `>`, `&` et les séparateurs de ligne Unicode : le
 * texte reste identique pour JavaScript, mais ne peut plus rien fermer.
 * (OWASP MASVS-PLATFORM, audit du 19 nov. 2026.)
 */
export function scriptSafeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Les fichiers chargés depuis le CDN, avec leur empreinte (SRI) : un fichier
 * modifié sur le CDN n'est pas exécuté. Calculées le 19 nov. 2026 sur les
 * fichiers publiés ; changer une version impose de recalculer l'empreinte.
 */
export const CDN_FILES = {
  markdownIt: { src: "https://cdn.jsdelivr.net/npm/markdown-it@14.1.0/dist/markdown-it.min.js", integrity: "sha384-wLhprpjsmjc/XYIcF+LpMxd8yS1gss6jhevOp6F6zhiIoFK6AmHtm4bGKtehTani" },
  katex: { src: "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js", integrity: "sha384-7zkQWkzuo3B5mTepMUcHkMB5jZaolc2xDwL6VFqjFALcbeS9Ggm/Yr2r3Dy4lfFg" },
  katexCss: { src: "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css", integrity: "sha384-nB0miv6/jRmo5UMMR1wu3Gz6NLsoTkbqJghGIsx//Rlm+ZU03BU6SQNC66uf4l5+" },
} as const;

/**
 * Politique de contenu de la page : scripts du CDN seulement (plus le script
 * de la page), aucune requête réseau, aucun formulaire, aucune image distante.
 */
export const WEBVIEW_CSP =
  "default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline' https://cdn.jsdelivr.net; font-src https://cdn.jsdelivr.net; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'";
