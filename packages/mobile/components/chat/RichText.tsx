import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { useColors } from "@/hooks/use-colors";
import { Space } from "@/constants/theme";

/**
 * Rendu Markdown + LaTeX d'une réponse du tuteur.
 *
 * Trois décisions qui expliquent la forme de ce fichier :
 *
 * **Une WebView, et seulement quand il y a des maths.** Un étudiant en RDM
 * lit `σ = M/W`, pas `$$\sigma = M/W$$`. Aucune bibliothèque React Native ne
 * rend correctement du LaTeX ; KaTeX dans une WebView, si. Mais une WebView
 * coûte cher en mémoire, donc les messages sans formule passent par du texte
 * natif — c'est le cas de la moitié d'une conversation.
 *
 * **Jamais pendant le streaming.** Recréer le document HTML à chaque token
 * ferait clignoter l'écran et chaufferait le téléphone. Le texte brut s'affiche
 * pendant l'écriture, le rendu riche prend le relais à la fin.
 *
 * **La hauteur remonte par postMessage.** Une WebView n'a pas de hauteur
 * intrinsèque : sans cette mesure, elle s'affiche en 0 pixel ou occupe tout
 * l'écran. La page renvoie sa hauteur réelle une fois KaTeX passé.
 */

const MATH = /(\$\$[\s\S]+?\$\$)|(\\\[[\s\S]+?\\\])|(\$[^$\n]+\$)|(\\\([\s\S]+?\\\))/;

export function hasMath(text: string): boolean {
  return MATH.test(text);
}

function buildHtml(markdown: string, colors: {
  fg: string;
  bg: string;
  muted: string;
  border: string;
  accent: string;
}): string {
  // JSON.stringify échappe guillemets, retours à la ligne et antislashs —
  // indispensable ici : le LaTeX est fait d'antislashs, et une simple
  // interpolation casserait le script au premier `\frac`.
  const payload = JSON.stringify(markdown);

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<style>
  :root { color-scheme: light dark; }
  html,body { margin:0; padding:0; background:transparent; }
  body {
    color:${colors.fg};
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    padding: 0;
    overflow-wrap: break-word;
  }
  p { margin: 0 0 .7em; }
  p:last-child { margin-bottom: 0; }
  strong { font-weight: 700; }
  ul,ol { margin: 0 0 .7em; padding-left: 1.25em; }
  li { margin: .2em 0; }
  code {
    background:${colors.border}; padding:1px 5px; border-radius:5px;
    font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: .9em;
  }
  pre {
    background:${colors.border}; padding:10px 12px; border-radius:10px;
    overflow-x:auto; margin: 0 0 .7em;
  }
  pre code { background:none; padding:0; }
  h1,h2,h3 { font-size: 1.05em; font-weight: 700; margin: 1em 0 .4em; }
  blockquote {
    margin:0 0 .7em; padding-left:.8em;
    border-left:3px solid ${colors.accent}; color:${colors.muted};
  }
  table { border-collapse: collapse; width:100%; margin: 0 0 .7em; display:block; overflow-x:auto; }
  th,td { border:1px solid ${colors.border}; padding:5px 8px; text-align:left; font-size:.92em; }
  .katex-display { margin:.6em 0; overflow-x:auto; overflow-y:hidden; padding:2px 0; }
  .fallback { white-space: pre-wrap; }
</style>
</head><body>
<div id="out" class="fallback"></div>
<script>
  var SRC = ${payload};
  var out = document.getElementById('out');
  out.textContent = SRC;   // visible même si les scripts distants ne chargent pas

  function report() {
    var h = Math.ceil(document.documentElement.scrollHeight);
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(String(h));
  }

  function load(src) {
    return new Promise(function (res) {
      var s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = res;
      document.head.appendChild(s);
    });
  }

  Promise.all([
    load('https://cdn.jsdelivr.net/npm/markdown-it@14.1.0/dist/markdown-it.min.js'),
    load('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js'),
  ]).then(function () {
    try {
      if (window.markdownit) {
        out.classList.remove('fallback');
        out.innerHTML = window.markdownit({ html:false, linkify:true, breaks:true }).render(SRC);
      }
      if (window.katex) renderMath();
    } catch (e) { /* le texte brut reste affiché */ }
    report();
    setTimeout(report, 120);
    setTimeout(report, 500);
  });

  // Rendu des formules : on parcourt les nœuds de texte et on remplace les
  // segments mathématiques. Passer par innerHTML global casserait les liens
  // et les blocs de code déjà rendus par markdown-it.
  function renderMath() {
    var re = /\\$\\$([\\s\\S]+?)\\$\\$|\\\\\\[([\\s\\S]+?)\\\\\\]|\\$([^$\\n]+?)\\$|\\\\\\(([\\s\\S]+?)\\\\\\)/g;
    var walker = document.createTreeWalker(out, NodeFilter.SHOW_TEXT, null);
    var nodes = [], n;
    while ((n = walker.nextNode())) {
      if (n.parentElement && n.parentElement.closest('code,pre')) continue;
      if (re.test(n.nodeValue)) nodes.push(n);
      re.lastIndex = 0;
    }
    nodes.forEach(function (node) {
      var frag = document.createDocumentFragment();
      var text = node.nodeValue, last = 0, m;
      re.lastIndex = 0;
      while ((m = re.exec(text))) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        var display = m[1] !== undefined || m[2] !== undefined;
        var tex = m[1] || m[2] || m[3] || m[4] || '';
        var span = document.createElement('span');
        try {
          window.katex.render(tex, span, { displayMode: display, throwOnError: false });
        } catch (e) {
          span.textContent = m[0];
        }
        frag.appendChild(span);
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
  }
</script>
</body></html>`;
}

export function RichText({
  text,
  streaming = false,
}: {
  text: string;
  /** Pendant l'écriture : texte brut, pas de WebView. */
  streaming?: boolean;
}) {
  const c = useColors();
  const [height, setHeight] = useState(40);

  const rich = !streaming && hasMath(text);

  const html = useMemo(
    () =>
      rich
        ? buildHtml(text, {
            fg: c.foreground,
            bg: c.card,
            muted: c.mutedForeground,
            border: c.border,
            accent: c.accent,
          })
        : "",
    [rich, text, c],
  );

  if (!rich) {
    return (
      <Text selectable style={[styles.plain, { color: c.foreground }]}>
        {text}
      </Text>
    );
  }

  return (
    <View style={{ height, overflow: "hidden" }}>
      <WebView
        originWhitelist={["*"]}
        source={{ html }}
        style={styles.web}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        androidLayerType="software"
        // Le tuteur ne produit pas de liens à ouvrir dans l'app ; toute
        // navigation depuis la WebView est refusée, elle n'affiche que du texte.
        onShouldStartLoadWithRequest={(r) => r.url === "about:blank"}
        onMessage={(e) => {
          const h = Number(e.nativeEvent.data);
          if (Number.isFinite(h) && h > 0 && Math.abs(h - height) > 2) setHeight(h);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  plain: { fontSize: 15, lineHeight: 23 },
  web: { backgroundColor: "transparent", flex: 1, marginHorizontal: -Space.xs },
});
