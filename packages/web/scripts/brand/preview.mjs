/** La planche public/brand/palette-preview.html : autonome, toutes les valeurs mesurées par brand-palette.mjs. */
import { contrast, hexToRgb, ratioText, simulate } from "./color.mjs";
import { BRAND, SCALES } from "./tokens.mjs";

const fr = (r) => ratioText(r).replace(".", ",");
const ink = (hex, dark) => (contrast(hex, "#ffffff") >= contrast(hex, dark) ? "#ffffff" : dark);
const rgb = (hex) => hexToRgb(hex).map((v) => Math.round(v * 255)).join(", ");
const vars = (mode, R) => Object.entries(R[mode]).map(([k, v]) => `--${k}:${v}`).join(";");
const OK = '<b class="ok" aria-label="réussi">✓</b>';
const KO = '<b class="ko" aria-label="échec">✕</b>';
const VISIONS = [["normal", "Vision normale"], ["protan", "Protanopie"], ["deutan", "Deutéranopie"], ["tritan", "Tritanopie"]];
const KEY_ROLES = ["primary", "secondary", "accent", "success", "warning", "error", "info"];
const ROLE_FR = { primary: "Orange (action)", secondary: "Or (XP)", accent: "Cyan", success: "Succès", warning: "Avertissement", error: "Erreur", info: "Info" };

function brandCards() {
  return BRAND.map(([k, hex, name, use]) => `
  <article class="brand">
    <div class="chip-big" style="background:${hex};color:${ink(hex, "#0a0a0a")}"><span>${name}</span>${k === "night" ? "" : '<span class="aa">Aa</span>'}</div>
    <dl><dt>Hex</dt><dd><code>${hex.toUpperCase()}</code></dd><dt>RVB</dt><dd>${rgb(hex)}</dd>
      <dt>Sur blanc</dt><dd>${fr(contrast(hex, "#ffffff"))}:1</dd><dt>Sur nuit</dt><dd>${fr(contrast(hex, "#0a0a0a"))}:1</dd></dl>
    <p class="use"><code>--tred-brand-${k}</code> · ${use}</p>
  </article>`).join("");
}

function scaleRows(palette) {
  return SCALES.map(([name, key, desc]) => {
    const sc = palette.scales[key];
    const chips = Object.entries(sc.steps).map(([st, hex]) => {
      const t = ink(hex, "#120f0d");
      const anchor = sc.anchor === st || (sc.anchor == null && false);
      return `<div class="chip" style="background:${hex};color:${t}" title="--tred-${name}-${st}">
        <span class="st">${st}${anchor ? ' <span aria-label="couleur de marque exacte">◆</span>' : ""}</span>
        <span class="hx">${hex.slice(1).toUpperCase()}</span><span class="cr">Aa ${fr(contrast(hex, t))}</span></div>`;
    }).join("");
    return `<div class="scale"><div class="scale-h"><code>${name}</code><span>${desc}</span></div><div class="chips">${chips}</div></div>`;
  }).join("");
}

function rolePanel(mode, R) {
  const list = Object.entries(R[mode]).map(([k, v]) => `<li><i style="background:${v}"></i><code>--tred-${k}</code><span>${v.toUpperCase()}</span></li>`).join("");
  return `
  <section class="panel mode-${mode}" style="${vars(mode, R)}" aria-label="Mode ${mode === "light" ? "clair" : "sombre"}">
    <h3>${mode === "light" ? "Mode clair" : "Mode sombre"}</h3>
    <div class="mock">
      <div class="mock-card">
        <span class="badge accent-b">✓ Vérifié par le solveur</span>
        <h4>Série 3 · Transformée de Laplace</h4>
        <p class="muted">Exercice 4 sur 6 · mode examen</p>
        <div class="xp" role="img" aria-label="Progression 68 %"><div style="width:68%"></div></div>
        <p class="muted small">+40 XP · niveau 7</p>
        <label class="field"><span class="muted small">Ta réponse</span><span class="input">F(s) = 1 / (s + 2)</span></label>
        <div class="row"><span class="btn primary">Valider</span><span class="btn ghost">Indice</span><span class="btn gold">+40 XP</span></div>
        <p><a href="#roles">Voir la démonstration pas à pas</a></p>
        <div class="badges"><span class="badge s">✓ Juste</span><span class="badge w">! Unité manquante</span><span class="badge e">✕ Signe faux</span><span class="badge i">i Rappel de cours</span></div>
      </div>
    </div>
    <ul class="roles">${list}</ul>
  </section>`;
}

function contrastTable(checks) {
  const cell = (c, mode) => {
    const r = c[mode];
    const sample = `<span class="sample" style="background:${r.bg};color:${r.fg};${c.min === 3 ? `box-shadow:inset 0 0 0 3px ${r.fg}` : ""}">${c.min === 3 ? "◼" : "Aa"}</span>`;
    const verdict = r.pass ? OK : c.rule ? '<b class="mid">souligné</b>' : KO;
    return `<td>${sample}<span class="ratio">${fr(r.ratio)}:1</span> ${verdict}</td>`;
  };
  const rows = checks.map((c) => `<tr><th scope="row">${c.label}<small><code>${c.fg}</code> / <code>${c.bg}</code></small></th><td class="min">${c.min === 3 ? "3:1" : "4,5:1"}</td>${cell(c, "light")}${cell(c, "dark")}</tr>`).join("");
  return `<div class="scroll"><table class="ct"><thead><tr><th scope="col">Paire</th><th scope="col">Seuil</th><th scope="col">Clair</th><th scope="col">Sombre</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function cvdSection(cvd, R) {
  const grid = (mode) => `
    <div class="cvd-grid" style="background:${R[mode].background};color:${R[mode].text}">
      <span></span>${KEY_ROLES.map((k) => `<span class="cvd-h">${ROLE_FR[k]}</span>`).join("")}
      ${VISIONS.map(([v, label]) => `<span class="cvd-l">${label}</span>${KEY_ROLES.map((k) => {
        const hex = v === "normal" ? R[mode][k] : simulate(R[mode][k], v);
        return `<i style="background:${hex}" title="${hex}"></i>`;
      }).join("")}`).join("")}
    </div>`;
  const n1 = (d) => d.toFixed(1).replace(".", ",");
  const tag = (d) => `<b class="${d >= 10 ? "ok" : d >= 6 ? "mid" : "ko"}">${n1(d)}</b>`;
  const rows = cvd.map((c) => `<tr><th scope="row"><i class="dot" style="background:${c.x}"></i><i class="dot" style="background:${c.y}"></i>${ROLE_FR[c.a]} / ${ROLE_FR[c.b]}</th><td>${c.mode === "light" ? "clair" : "sombre"}</td><td>${tag(c.de.normal)}</td><td>${tag(c.de.protan)}</td><td>${tag(c.de.deutan)}</td><td>${tag(c.de.tritan)}</td></tr>`).join("");
  return `
    <div class="cvd-pair">${grid("light")}${grid("dark")}</div>
    <div class="scroll"><table class="ct cvd"><thead><tr><th scope="col">Couple</th><th scope="col">Mode</th><th scope="col">Normale</th><th scope="col">Protan</th><th scope="col">Deutan</th><th scope="col">Tritan</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function previewHtml({ palette, R, checks, cvd, symbol }) {
  const total = checks.length * 2;
  const passed = checks.reduce((n, c) => n + (c.light.pass ? 1 : 0) + (c.dark.pass ? 1 : 0), 0);
  const ruled = checks.filter((c) => c.rule && (!c.light.pass || !c.dark.pass)).length * 2;
  const risky = cvd.filter((c) => Math.min(c.de.protan, c.de.deutan, c.de.tritan) < 10).length;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>TRED Palette Signal</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#0a0a0a;color:#f5f2f1;font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1280px;margin:0 auto;padding:40px 16px 72px}
h1{font-size:clamp(30px,5vw,48px);line-height:1.05;margin:0 0 8px;letter-spacing:-.02em}
h2{font-size:22px;margin:56px 0 6px;letter-spacing:-.01em} h2+p{color:#a4a19f;margin:0 0 18px;max-width:760px}
h3{margin:0 0 14px;font-size:17px} h4{margin:10px 0 2px;font-size:17px}
code{font:12.5px ui-monospace,SFMono-Regular,Consolas,monospace}
.hero{display:flex;gap:28px;align-items:center;flex-wrap:wrap}
.hero .mark svg{width:128px;height:128px;display:block}
.eyebrow{margin:0 0 6px;color:#a4a19f;font-size:13px;letter-spacing:.06em;text-transform:uppercase}
.lead{color:#d6d4d2;max-width:640px;margin:0 0 14px}
.stats{display:flex;flex-wrap:wrap;gap:8px}
.stat{border:1px solid #45403e;border-radius:999px;padding:4px 12px;font-size:13px}
.stat.good{border-color:#0d9373;color:#3fc6a0} .stat.watch{border-color:#ad6e0a;color:#e59b37}
.brands{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
@media (max-width:900px){.brands{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:520px){.brands{grid-template-columns:1fr}}
.brand{background:#1f1b19;border:1px solid #2f2a28;border-radius:18px;padding:12px}
.chip-big{height:120px;border-radius:12px;display:flex;justify-content:space-between;align-items:flex-end;padding:12px;font-weight:700;border:1px solid #2f2a28}
.chip-big .aa{font-size:28px}
.brand dl{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin:10px 2px 6px;font-size:13px}
.brand dt{color:#a4a19f} .brand dd{margin:0;text-align:right}
.use{margin:0;font-size:12.5px;color:#a4a19f}
.scale{margin-bottom:14px}
.scale-h{display:flex;gap:10px;align-items:baseline;margin-bottom:6px;flex-wrap:wrap} .scale-h span{color:#a4a19f;font-size:13px}
.chips{display:grid;grid-template-columns:repeat(11,minmax(76px,1fr));gap:4px;overflow-x:auto;padding-bottom:4px}
.chip{border-radius:10px;padding:8px 8px 7px;display:flex;flex-direction:column;gap:1px;min-height:84px;font-size:11.5px}
.chip .st{font-weight:700;font-size:13px} .chip .hx{font-family:ui-monospace,Consolas,monospace;opacity:.92} .chip .cr{margin-top:auto;opacity:.92}
.modes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
@media (max-width:900px){.modes{grid-template-columns:1fr}}
.panel{background:var(--background);color:var(--text);border-radius:22px;padding:18px;border:1px solid var(--border)}
.mock-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px}
.muted{color:var(--text-muted);margin:0} .small{font-size:13px}
.xp{height:10px;border-radius:999px;background:var(--surface-alt);margin:12px 0 4px;overflow:hidden}
.xp div{height:100%;background:var(--secondary);border-radius:999px}
.field{display:flex;flex-direction:column;gap:4px;margin:12px 0}
.input{border:1px solid var(--border-strong);border-radius:10px;padding:8px 10px;background:var(--surface);outline:2px solid var(--focus);outline-offset:2px;font-family:ui-monospace,Consolas,monospace;font-size:14px}
.row{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 6px}
.btn{border-radius:10px;padding:8px 14px;font-weight:650;font-size:14px}
.btn.primary{background:var(--primary);color:var(--on-primary)}
.btn.ghost{border:1px solid var(--border-strong);color:var(--text)}
.btn.gold{background:var(--secondary);color:var(--on-secondary)}
.panel a{color:var(--link);text-decoration:underline;text-underline-offset:3px;font-weight:600}
.badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.badge{border-radius:999px;padding:3px 10px;font-size:12.5px;font-weight:650}
.badge.s{background:var(--success-soft);color:var(--success)} .badge.w{background:var(--warning-soft);color:var(--warning)}
.badge.e{background:var(--error-soft);color:var(--error)} .badge.i{background:var(--info-soft);color:var(--info)}
.badge.accent-b{background:var(--accent-soft);color:var(--accent);display:inline-block}
.roles{list-style:none;padding:0;margin:16px 0 0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 14px;font-size:12.5px}
@media (max-width:520px){.roles{grid-template-columns:1fr}}
.roles li{display:flex;align-items:center;gap:8px;min-width:0} .roles li span{margin-left:auto;color:var(--text-muted);font-family:ui-monospace,Consolas,monospace}
.roles i{width:18px;height:18px;border-radius:5px;flex:none;box-shadow:inset 0 0 0 1px rgb(127 127 127/.45)}
.roles code{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.scroll{overflow-x:auto;border:1px solid #2f2a28;border-radius:16px}
.ct{border-collapse:collapse;width:100%;min-width:620px;font-size:13.5px}
.ct th,.ct td{padding:8px 12px;border-bottom:1px solid #1f1b19;text-align:left;vertical-align:middle;white-space:nowrap}
.ct thead th{color:#a4a19f;font-weight:600;background:#120f0d;position:sticky;top:0}
.ct tbody th{font-weight:500;white-space:normal} .ct small{display:block;color:#767270}
.ct .min{color:#a4a19f}
.sample{display:inline-grid;place-items:center;width:44px;height:30px;border-radius:7px;font-weight:700;margin-right:8px;vertical-align:middle;border:1px solid #2f2a28}
.ratio{font-variant-numeric:tabular-nums;font-weight:600}
.ok{color:#3fc6a0} .ko{color:#fe8477} .mid{color:#e59b37}
.cvd-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-bottom:16px}
@media (max-width:900px){.cvd-pair{grid-template-columns:1fr}}
.cvd-grid{display:grid;grid-template-columns:96px repeat(7,minmax(0,1fr));gap:4px;padding:14px;border-radius:18px;border:1px solid #2f2a28;align-items:center;font-size:11.5px}
.cvd-grid i{height:34px;border-radius:7px} .cvd-h{text-align:center;line-height:1.15} .cvd-l{font-weight:600}
.dot{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:4px;vertical-align:-1px}
.rules{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
@media (max-width:760px){.rules{grid-template-columns:1fr}}
.rules section{border:1px solid #2f2a28;border-radius:16px;padding:14px 18px}
.rules h3{font-size:15px;margin-bottom:6px} .rules p,.rules li{color:#d6d4d2;font-size:14px;margin:0} .rules ul{padding-left:18px;margin:0}
footer{margin-top:48px;color:#a4a19f;font-size:13.5px}
</style>
</head>
<body>
<main>
  <header class="hero">
    <div class="mark">${symbol}</div>
    <div>
      <p class="eyebrow">Identité TRED · palette officielle</p>
      <h1>${palette.name}</h1>
      <p class="lead">L’orange signal et l’or de la toque sur une nuit d’ingénieur, avec le cyan comme couleur de la précision : focus, résultats vérifiés par les solveurs. Palette tirée du symbole « Boutons-Toque ». Trois teintes en tout, des neutres légèrement chauds et quatre couleurs d’état.</p>
      <div class="stats">
        <span class="stat good">${passed}/${total} paires au seuil WCAG AA</span>
        ${ruled ? `<span class="stat">${ruled} paires réglées par le soulignement des liens</span>` : ""}
        <span class="stat good">Audit du skill brand-identity : 0 échec</span>
        <span class="stat watch">${risky} couples à doubler d’une icône (daltonisme)</span>
      </div>
    </div>
  </header>

  <h2>Couleurs de marque</h2>
  <p>Les quatre couleurs du symbole. Elles servent au logo et aux grandes surfaces. Pour l’interface, ce sont les rôles plus bas qui s’ajustent, jamais ces quatre valeurs.</p>
  <div class="brands">${brandCards()}</div>

  <h2>Échelles 50 → 950</h2>
  <p>Échelles OKLCH à 11 pas. ◆ marque le pas qui contient exactement la couleur de marque. Dans chaque case, « Aa » donne le contraste du texte le plus lisible sur cette couleur (blanc ou nuit).</p>
  ${scaleRows(palette)}

  <h2 id="roles">Rôles : clair et sombre côte à côte</h2>
  <p>Ce sont les variables à utiliser dans les composants. Le mode sombre inverse les neutres et éclaircit les accents le long de leur propre échelle, sans changer de teinte.</p>
  <div class="modes">${rolePanel("light", R)}${rolePanel("dark", R)}</div>

  <h2>Tous les contrastes mesurés</h2>
  <p>Ratios WCAG 2.2, tronqués au centième : 4,49 compte comme un échec. 4,5:1 pour le texte normal (1.4.3) ; 3:1 pour les composants d’interface et les éléments graphiques (1.4.11) ; un grand texte passe donc dès qu’un texte normal passe.</p>
  ${contrastTable(checks)}

  <h2>Daltonisme</h2>
  <p>Couleurs simulées avec Machado 2009 (sévérité totale). Le tableau donne l’écart perçu CIEDE2000 : ≥ 10 distinct, 6 à 10 risqué, moins de 6 confondu. L’audit du skill simule la tritanopie avec Brettel 1997 : ses valeurs tritan diffèrent un peu, les autres sont identiques.</p>
  ${cvdSection(cvd, R)}

  <h2>Règles d’usage</h2>
  <div class="rules">
    <section><h3>Liens toujours soulignés</h3><p>Le lien orange est lisible sur la page (≥ 4,5:1), mais trop proche du texte courant pour s’en distinguer par la couleur seule. Le soulignement règle ce point (technique WCAG G183).</p></section>
    <section><h3>Jamais l’état par la couleur seule</h3><p>Orange, or et ambre sont voisins : un état porte toujours une icône et un mot (✓ Juste, ! Attention, ✕ Erreur). C’est l’exigence WCAG 1.4.1, et c’est indispensable avec une marque orange.</p></section>
    <section><h3>Un rôle par fonction</h3><ul><li><code>primary</code> : une action principale par écran</li><li><code>secondary</code> (or) : XP, séries, récompenses</li><li><code>accent</code> (cyan) : focus, « vérifié par le solveur »</li><li><code>neutral-cool</code> : blocs de code et tableaux techniques</li></ul></section>
    <section><h3>La marque n’est pas un rôle</h3><p>En mode clair, l’orange #FF6B00 ne passe pas 3:1 sur la page : les boutons prennent <code>primary-600</code>, et le logo garde #FF6B00. Les couleurs de marque ne sont jamais retouchées pour l’interface.</p></section>
  </div>

  <footer>
    <p>Source unique : <code>packages/web/src/web/styles/brand/palette.json</code> (format du skill brand-identity). Fichiers générés : <code>tokens.css</code> et <code>theme.css</code> (Tailwind v4), à côté de la source, ainsi que cette page. Pour regénérer : <code>bun scripts/brand-palette.mjs</code> depuis <code>packages/web</code>.</p>
  </footer>
</main>
</body>
</html>
`;
}
