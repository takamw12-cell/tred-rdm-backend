// Remonte la recherche Ctrl/⌘ + K dans l'en-tête.
//
//   node patch-recherche.mjs
//
// Le composant `search-dialog.tsx` est bien dans ton dépôt, complet et
// fonctionnel. Il n'est simplement importé nulle part : `layout.tsx` a été
// réécrit après la livraison, et le montage a disparu avec l'ancienne version.
// Une fonction entière, invisible parce qu'une ligne d'import manquait.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WEB = path.join(ROOT, "packages", "web", "src", "web");
const LAYOUT = path.join(WEB, "components", "layout.tsx");
const DIALOG = path.join(WEB, "components", "search-dialog.tsx");

if (!fs.existsSync(LAYOUT)) {
  console.log(`\n⚠️  Introuvable : ${path.relative(ROOT, LAYOUT)}`);
  console.log("   Tu n'es pas à la racine du projet.\n");
  process.exit(1);
}
if (!fs.existsSync(DIALOG)) {
  console.log("\n⚠️  search-dialog.tsx est absent de ton dépôt.");
  console.log("   Dis-le-moi, je te le renvoie.\n");
  process.exit(1);
}

const before = fs.readFileSync(LAYOUT, "utf8");

if (before.includes("SearchDialog")) {
  console.log("⏭️  La recherche est déjà montée — rien à faire.");
  process.exit(0);
}

let out = before;

/* ── 1. Les imports ────────────────────────────────────────────────────── */

const reactImport = out.match(/^import \{([^}]*)\} from "react";$/m);
if (!reactImport) {
  console.log("❌ Import React introuvable."); process.exit(1);
}
if (!/\buseCallback\b/.test(reactImport[1])) {
  out = out.replace(
    reactImport[0],
    `import {${reactImport[1].replace("useEffect", "useCallback, useEffect")}} from "react";`,
  );
}

const lucide = out.match(/^import \{[\s\S]*?\} from "lucide-react";$/m);
if (!lucide) { console.log("❌ Import lucide introuvable."); process.exit(1); }
if (!/\bSearch\b/.test(lucide[0])) {
  out = out.replace(lucide[0], lucide[0].replace(/\n\} from "lucide-react";$/m, "\n  Search,\n} from \"lucide-react\";"));
}

const anchorImport = `import { AmbientBackground } from "@/components/ambient-background";`;
if (!out.includes(anchorImport)) { console.log("❌ Ancre d'import introuvable."); process.exit(1); }
out = out.replace(
  anchorImport,
  `${anchorImport}\nimport { SearchDialog, useSearchShortcut } from "@/components/search-dialog";`,
);

/* ── 2. L'état, dans AppLayout ─────────────────────────────────────────── */

// On s'accroche au premier `useState` de la fonction AppLayout.
const stateAnchor = out.match(/^(\s*const \[[a-zA-Z]+, set[A-Za-z]+\] = useState\([^)]*\);)$/m);
if (!stateAnchor) { console.log("❌ Aucun useState trouvé dans layout.tsx."); process.exit(1); }
out = out.replace(
  stateAnchor[0],
  `${stateAnchor[0]}
  const [searchOpen, setSearchOpen] = useState(false);
  // Mémorisé : \`useSearchShortcut\` dépend de cette fonction ; une nouvelle à
  // chaque rendu ferait détacher puis rattacher l'écouteur en boucle.
  const openSearch = useCallback(() => setSearchOpen(true), []);
  useSearchShortcut(openSearch);`,
);

/* ── 3. Le bouton, à gauche des trois réglages ─────────────────────────── */

const toggle = out.match(/^([ \t]*)<FontSizeToggle \/>$/m);
if (!toggle) { console.log("❌ <FontSizeToggle /> introuvable."); process.exit(1); }
const ind = toggle[1];
out = out.replace(
  toggle[0],
  `${ind}<button
${ind}  type="button"
${ind}  onClick={openSearch}
${ind}  className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm transition-colors sm:px-3"
${ind}  aria-label={t("search.title")}
${ind}  title={t("search.title")}
${ind}>
${ind}  <Search className="size-4" />
${ind}  <span className="hidden sm:inline">{t("search.title")}</span>
${ind}  {/* Le raccourci n'est montré que là où il existe un clavier. */}
${ind}  <kbd className="border-border text-muted-foreground ml-1 hidden rounded border px-1.5 py-0.5 text-[10px] lg:inline">
${ind}    ⌘K
${ind}  </kbd>
${ind}</button>
${toggle[0]}`,
);

/* ── 4. La palette elle-même ───────────────────────────────────────────── */

// Juste avant `<BottomNav />`, donc DANS l'arbre JSX rendu. La version
// précédente de ce script visait la dernière accolade du fichier et posait la
// balise hors du `return` — le fichier ne compilait plus. On s'accroche donc à
// un élément qui existe vraiment dans l'arbre.
const bottomNav = out.match(/^([ \t]*)<BottomNav \/>$/m);
if (!bottomNav) {
  console.log("❌ <BottomNav /> introuvable — envoie-moi layout.tsx.");
  process.exit(1);
}

out = out.replace(
  bottomNav[0],
  `${bottomNav[1]}<SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />\n\n${bottomNav[0]}`,
);

fs.writeFileSync(LAYOUT + ".bak", before, "utf8");
fs.writeFileSync(LAYOUT, out, "utf8");

console.log("✅ layout.tsx — recherche Ctrl/⌘ + K remontée");
console.log("\n👉 Ensuite :  bun run verify");
