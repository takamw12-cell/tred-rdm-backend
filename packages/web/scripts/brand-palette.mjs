/**
 * Palette TRED : palette.json → tokens CSS, thème Tailwind v4 et planche de contrôle.
 *
 *   bun scripts/brand-palette.mjs            (depuis packages/web)
 *
 * Source unique : src/web/styles/brand/palette.json (format du skill brand-identity,
 * auditable avec son palette_audit.py). Ce script écrit, sans rien câbler dans l'app :
 *   - src/web/styles/brand/tokens.css   variables --tred-* (:root = clair, [data-theme="dark"] / .dark = sombre)
 *   - src/web/styles/brand/theme.css    @theme inline Tailwind v4, couleurs préfixées tred- (bg-tred-primary…)
 *   - public/brand/palette-preview.html les couleurs côte à côte, avec chaque ratio mesuré
 * Il s'arrête (code 1) si une seule paire passe sous son seuil WCAG.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { contrast, deltaE2000, simulate } from "./brand/color.mjs";
import { BRAND, CVD_PAIRS, PAIRS, SCALES, roles } from "./brand/tokens.mjs";
import { previewHtml } from "./brand/preview.mjs";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(WEB, "src/web/styles/brand");
const palette = JSON.parse(readFileSync(join(DIR, "palette.json"), "utf8"));
const R = roles(palette);
const HEADER = "/* Palette TRED « Signal » : générée par packages/web/scripts/brand-palette.mjs depuis palette.json. Ne pas modifier à la main. */";

/* ── Contrôles ─────────────────────────────────────────────────────────── */
const checks = PAIRS.map(([fg, bg, min, label, rule]) => {
  const res = {};
  for (const mode of ["light", "dark"]) {
    const ratio = contrast(R[mode][fg], R[mode][bg]);
    res[mode] = { fg: R[mode][fg], bg: R[mode][bg], ratio, pass: ratio >= min };
  }
  return { fg, bg, min, label, rule, ...res };
});
const cvd = ["light", "dark"].flatMap((mode) =>
  CVD_PAIRS.map(([a, b]) => {
    const [x, y] = [R[mode][a], R[mode][b]];
    const de = { normal: deltaE2000(x, y) };
    for (const k of ["protan", "deutan", "tritan"]) de[k] = deltaE2000(simulate(x, k), simulate(y, k));
    return { mode, a, b, x, y, de };
  }),
);
const failures = checks.flatMap((c) =>
  ["light", "dark"].filter((m) => !c[m].pass && !c.rule).map((m) => `${m}: ${c.fg} / ${c.bg} = ${c[m].ratio.toFixed(2)} < ${c.min}`),
);

/* ── tokens.css ────────────────────────────────────────────────────────── */
const scaleVars = SCALES.flatMap(([name, key]) =>
  Object.entries(palette.scales[key].steps).map(([step, hex]) => `  --tred-${name}-${step}: ${hex};`),
);
const roleVars = (mode) => Object.entries(R[mode]).map(([k, v]) => `  --tred-${k}: ${v};`);
const tokensCss = `${HEADER}
:root {
  color-scheme: light;
  /* Couleurs de marque : le logo et les illustrations. Ne jamais les retoucher pour l'interface. */
${BRAND.map(([k, hex, name]) => `  --tred-brand-${k}: ${hex}; /* ${name} */`).join("\n")}
  /* Échelles 50 → 950 (identiques dans les deux modes) */
${scaleVars.join("\n")}
  /* Rôles : mode clair */
${roleVars("light").join("\n")}
}

/* Mode sombre : neutres inversés, accents éclaircis le long de leur échelle */
[data-theme="dark"],
.dark {
  color-scheme: dark;
${roleVars("dark").join("\n")}
}
`;

/* ── theme.css (Tailwind v4) ───────────────────────────────────────────── */
const themeCss = `${HEADER}
/*
 * Tailwind v4 : chaque rôle et chaque échelle devient une couleur utilitaire préfixée tred-
 * (bg-tred-primary, text-tred-text-muted, border-tred-border-strong, bg-tred-primary-50…).
 * Le préfixe évite de remplacer les couleurs actuelles de l'app (primary, accent… de shadcn).
 * Câblage, une ligne dans src/web/styles.css après @import "tailwindcss"; :
 *   @import "./styles/brand/theme.css";
 * Le mode sombre suit [data-theme="dark"] ou la classe .dark déjà utilisée par l'app.
 */
@import "./tokens.css";

@theme inline {
${BRAND.map(([k]) => `  --color-tred-brand-${k}: var(--tred-brand-${k});`).join("\n")}
${Object.keys(R.light).map((k) => `  --color-tred-${k}: var(--tred-${k});`).join("\n")}
${SCALES.flatMap(([name, key]) => Object.keys(palette.scales[key].steps).map((st) => `  --color-tred-${name}-${st}: var(--tred-${name}-${st});`)).join("\n")}
}
`;

writeFileSync(join(DIR, "tokens.css"), tokensCss);
writeFileSync(join(DIR, "theme.css"), themeCss);
const symbol = readFileSync(join(WEB, "public/brand/concepts/tred-concept-a-color.svg"), "utf8");
writeFileSync(join(WEB, "public/brand/palette-preview.html"), previewHtml({ palette, R, checks, cvd, symbol }));

const total = checks.length * 2;
const passed = checks.reduce((n, c) => n + (c.light.pass ? 1 : 0) + (c.dark.pass ? 1 : 0), 0);
console.log(`palette « ${palette.name} » : ${passed}/${total} paires au seuil WCAG AA`);
for (const c of checks.filter((x) => x.rule && (!x.light.pass || !x.dark.pass)))
  console.log(`  règle « ${c.rule} » : ${c.label} (clair ${c.light.ratio.toFixed(2)}, sombre ${c.dark.ratio.toFixed(2)})`);
const risky = cvd.filter((c) => Math.min(c.de.protan, c.de.deutan, c.de.tritan) < 10);
for (const c of risky)
  console.log(`  daltonisme ${c.mode} ${c.a}/${c.b} : ΔE00 protan ${c.de.protan.toFixed(1)} · deutan ${c.de.deutan.toFixed(1)} · tritan ${c.de.tritan.toFixed(1)}`);
if (failures.length) {
  console.error("ÉCHEC WCAG :\n  " + failures.join("\n  "));
  process.exit(1);
}
