// Lot 2 : recherche globale · export PDF · tests automatiques.
//
//   node patch-lot2.mjs
//
// Idempotent : relancer ne fait rien de plus. Une sauvegarde .bak est écrite
// avant chaque modification. Chaque bloc est indépendant — si l'un ne
// reconnaît pas ton fichier, il est signalé à la fin et les autres passent
// quand même.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WEBPKG = path.join(ROOT, "packages", "web");
const API = path.join(WEBPKG, "src", "api");
const WEB = path.join(WEBPKG, "src", "web");

const F = {
  apiIndex: path.join(API, "index.ts"),
  layout: path.join(WEB, "components", "layout.tsx"),
  chat: path.join(WEB, "pages", "chat.tsx"),
  messages: path.join(WEB, "i18n", "messages"),
  rootPkg: path.join(ROOT, "package.json"),
};

let ok = 0;
let skipped = 0;
const failed = [];

function patch(label, file, fn) {
  if (!fs.existsSync(file)) {
    failed.push(`${label} — fichier absent : ${path.relative(ROOT, file)}`);
    return;
  }
  const before = fs.readFileSync(file, "utf8");
  let after;
  try {
    after = fn(before);
  } catch (err) {
    failed.push(`${label} — ${err.message}`);
    return;
  }
  if (after === null) {
    console.log(`⏭️  ${label} — déjà fait`);
    skipped++;
    return;
  }
  if (after === undefined) {
    failed.push(`${label} — motif introuvable dans ${path.relative(ROOT, file)}`);
    return;
  }
  fs.writeFileSync(file + ".bak", before, "utf8");
  fs.writeFileSync(file, after, "utf8");
  console.log(`✅ ${label}`);
  ok++;
}

/* ══ A. Le routeur connaît la recherche ════════════════════════════════ */

patch("api/index.ts — route de recherche", F.apiIndex, (s) => {
  if (s.includes('from "./routes/search"')) return null;

  const imp = `import { chats } from "./routes/chats";`;
  if (!s.includes(imp)) return undefined;

  let out = s.replace(imp, `${imp}\nimport { search } from "./routes/search";`);

  // Le routeur est un objet littéral : on ajoute une entrée, pas une ligne au
  // hasard. On s'accroche à `chats,` qui y figure déjà.
  const re = /(export const router = \{[\s\S]*?)\n(\s*)chats,\n/;
  if (!re.test(out)) return undefined;
  out = out.replace(re, `$1\n$2chats,\n$2search,\n`);

  return out;
});

/* ══ B. Le bouton et le raccourci dans l'en-tête ═══════════════════════ */

patch("layout.tsx — bouton de recherche + Ctrl/⌘ K", F.layout, (s) => {
  if (s.includes("SearchDialog")) return null;

  let out = s;

  // 1. useCallback : sans lui, le raccourci se réenregistrerait à chaque rendu.
  const reactImp = out.match(/^import \{([^}]*)\} from "react";$/m);
  if (!reactImp) return undefined;
  if (!reactImp[1].includes("useCallback")) {
    out = out.replace(
      reactImp[0],
      `import {${reactImp[1].replace("useEffect", "useCallback, useEffect")}} from "react";`,
    );
  }

  // 2. L'icône.
  const lucide = out.match(/^import \{ ([^}]*) \} from "lucide-react";$/m);
  if (!lucide) return undefined;
  if (!lucide[1].includes("Search")) {
    out = out.replace(lucide[0], `import { ${lucide[1]}, Search } from "lucide-react";`);
  }

  // 3. Le composant.
  const btnImp = `import { Button } from "@/components/ui/button";`;
  if (!out.includes(btnImp)) return undefined;
  out = out.replace(
    btnImp,
    `${btnImp}\nimport { SearchDialog, useSearchShortcut } from "@/components/search-dialog";`,
  );

  // 4. L'état, dans AppLayout.
  const stateAnchor = `  const [open, setOpen] = useState(false);`;
  if (!out.includes(stateAnchor)) return undefined;
  out = out.replace(
    stateAnchor,
    `${stateAnchor}
  const [searchOpen, setSearchOpen] = useState(false);
  // Mémorisé : \`useSearchShortcut\` dépend de cette fonction, une nouvelle à
  // chaque rendu ferait détacher puis rattacher l'écouteur en boucle.
  const openSearch = useCallback(() => setSearchOpen(true), []);
  useSearchShortcut(openSearch);`,
  );

  // 5. Le bouton, à gauche des trois réglages.
  const toggleAnchor = `            <FontSizeToggle />`;
  if (!out.includes(toggleAnchor)) return undefined;
  out = out.replace(
    toggleAnchor,
    `            <button
              type="button"
              onClick={openSearch}
              className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm transition-colors sm:px-3"
              aria-label={t("search.title")}
              title={t("search.title")}
            >
              <Search className="size-4" />
              <span className="hidden sm:inline">{t("search.title")}</span>
              {/* Le raccourci n'est montré que là où il existe un clavier. */}
              <kbd className="border-border text-muted-foreground ml-1 hidden rounded border px-1.5 py-0.5 text-[10px] lg:inline">
                ⌘K
              </kbd>
            </button>
${toggleAnchor}`,
  );

  // 6. La palette elle-même, au niveau le plus haut pour passer par-dessus tout.
  const mountAnchor = `      <BottomNav />`;
  if (!out.includes(mountAnchor)) return undefined;
  out = out.replace(
    mountAnchor,
    `      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />

${mountAnchor}`,
  );

  return out;
});

/* ══ C. La page de discussion écoute la recherche ══════════════════════ */

patch("chat.tsx — ouverture depuis la recherche", F.chat, (s) => {
  if (s.includes("tred:open-chat")) return null;

  const anchor = `  useEffect(() => {
    if (bootRef.current || !convQuery.isSuccess) return;
    bootRef.current = true;
    const latest = convList[0];`;

  if (!s.includes(anchor)) return undefined;

  const replacement = `  // ── Ouverture depuis la recherche globale ────────────────────────────────
  // Deux chemins, parce que cette page peut déjà être à l'écran ou pas encore
  // montée quand on clique un résultat :
  //   • déjà là  → l'événement arrive tout de suite, ci-dessous ;
  //   • ailleurs → la demande attend dans sessionStorage et est lue au montage.
  useEffect(() => {
    function forget(key: string) {
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* navigation privée */
      }
    }
    function onOpenChat(e: Event) {
      const id = (e as CustomEvent<string>).detail;
      forget("tred.openChat");
      if (typeof id === "string" && id) void openConversation(id);
    }
    function onOpenDoc(e: Event) {
      const d = (e as CustomEvent<{ id: string; title: string }>).detail;
      forget("tred.openDoc");
      if (d && d.id) setActiveDoc({ id: d.id, title: d.title ?? "" });
    }
    window.addEventListener("tred:open-chat", onOpenChat);
    window.addEventListener("tred:open-doc", onOpenDoc);
    return () => {
      window.removeEventListener("tred:open-chat", onOpenChat);
      window.removeEventListener("tred:open-doc", onOpenDoc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (bootRef.current || !convQuery.isSuccess) return;
    bootRef.current = true;

    // Une demande venue de la recherche prime sur la reprise automatique : on
    // vient de cliquer un résultat précis, rouvrir autre chose serait absurde.
    const readOnce = (key: string): unknown => {
      try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        sessionStorage.removeItem(key);
        return JSON.parse(raw) as unknown;
      } catch {
        return null;
      }
    };

    const wantedDoc = readOnce("tred.openDoc") as { id?: string; title?: string } | null;
    if (wantedDoc && wantedDoc.id) {
      setActiveDoc({ id: wantedDoc.id, title: wantedDoc.title ?? "" });
      return;
    }

    const wantedChat = readOnce("tred.openChat");
    if (typeof wantedChat === "string" && wantedChat) {
      void openConversation(wantedChat);
      return;
    }

    const latest = convList[0];`;

  return s.replace(anchor, replacement);
});

/* ══ D. Libellés, dans TOUTES les langues ══════════════════════════════ */

// Le type `Messages` est déduit de de.ts : si une langue n'a pas exactement les
// mêmes clés, TypeScript refuse de compiler. Un bloc manquant quelque part
// casserait donc le déploiement entier — d'où le passage sur chaque fichier.
const SEARCH_TEXTS = {
  de: {
    title: "Suche",
    placeholder: "Dokumente, Unterhaltungen, Übungen durchsuchen …",
    hint: "Mindestens zwei Zeichen eingeben.",
    empty: 'Nichts zu "{q}" gefunden.',
    more: "Es gibt weitere Treffer — schränke die Suche ein.",
    documents: "Dokumente",
    conversations: "Unterhaltungen",
    exercises: "Übungen",
    navigate: "wechseln",
    open: "öffnen",
    close: "schließen",
    back: "zurück",
    exportPdf: "Als PDF",
    solution: "Lösung",
    question: "Frage",
    answer: "Antwort",
    loadFailed: "Konnte nicht geladen werden.",
    emptyConversation: "Diese Unterhaltung ist leer.",
  },
  fr: {
    title: "Recherche",
    placeholder: "Chercher dans les documents, conversations, exercices …",
    hint: "Saisis au moins deux caractères.",
    empty: 'Rien trouvé pour « {q} ».',
    more: "Il y a d'autres résultats — précise ta recherche.",
    documents: "Documents",
    conversations: "Conversations",
    exercises: "Exercices",
    navigate: "naviguer",
    open: "ouvrir",
    close: "fermer",
    back: "retour",
    exportPdf: "En PDF",
    solution: "Corrigé",
    question: "Question",
    answer: "Réponse",
    loadFailed: "Chargement impossible.",
    emptyConversation: "Cette conversation est vide.",
  },
  en: {
    title: "Search",
    placeholder: "Search documents, conversations, exercises …",
    hint: "Type at least two characters.",
    empty: 'Nothing found for "{q}".',
    more: "There are more results — narrow your search.",
    documents: "Documents",
    conversations: "Conversations",
    exercises: "Exercises",
    navigate: "move",
    open: "open",
    close: "close",
    back: "back",
    exportPdf: "As PDF",
    solution: "Solution",
    question: "Question",
    answer: "Answer",
    loadFailed: "Could not be loaded.",
    emptyConversation: "This conversation is empty.",
  },
};

function searchBlock(locale) {
  const texts = SEARCH_TEXTS[locale] ?? SEARCH_TEXTS.en;
  const lines = Object.entries(texts)
    .map(([k, v]) => `    ${k}: ${JSON.stringify(v)},`)
    .join("\n");
  return `  search: {\n${lines}\n  },`;
}

if (!fs.existsSync(F.messages)) {
  failed.push(`libellés — dossier absent : ${path.relative(ROOT, F.messages)}`);
} else {
  const files = fs.readdirSync(F.messages).filter((f) => f.endsWith(".ts"));
  if (files.length === 0) failed.push("libellés — aucun fichier de langue trouvé");

  for (const file of files) {
    const locale = path.basename(file, ".ts");
    patch(`${file} — libellés de recherche`, path.join(F.messages, file), (s) => {
      if (/^\s*search:\s*\{/m.test(s)) return null;
      // `export const de = {` mais aussi `export const en: Messages = {` — la
      // langue de référence n'est pas annotée, les autres le sont.
      const re = /^(export const \w+(?:\s*:\s*[\w.<>[\]]+)?\s*=\s*\{)$/m;
      if (!re.test(s)) return undefined;
      return s.replace(re, `$1\n${searchBlock(locale)}`);
    });
  }
}

/* ══ E. `bun run verify` ═══════════════════════════════════════════════ */

patch("package.json — scripts test et verify", F.rootPkg, (s) => {
  let pkg;
  try {
    pkg = JSON.parse(s);
  } catch {
    throw new Error("package.json illisible — ajoute les scripts à la main");
  }

  pkg.scripts ??= {};
  if (pkg.scripts.verify) return null;

  // `test` n'est écrasé que s'il n'existe pas ou s'il ne fait rien : le script
  // par défaut de npm est un `echo` suivi d'un code d'erreur.
  const placeholder = !pkg.scripts.test || /no test specified/.test(pkg.scripts.test);
  if (placeholder) pkg.scripts.test = "bun test";

  // Les types AVANT les tests : une erreur de type est plus rapide à trouver
  // qu'un test qui échoue pour une raison qui n'a rien à voir.
  pkg.scripts.verify = "bunx tsc --noEmit -p packages/web && bun test";

  return JSON.stringify(pkg, null, 2) + "\n";
});

/* ══ Bilan ═════════════════════════════════════════════════════════════ */

console.log(`\n${ok} appliqué(s) · ${skipped} déjà fait(s) · ${failed.length} échec(s)`);

if (failed.length) {
  console.log("\n⚠️  À faire à la main :");
  for (const f of failed) console.log("   • " + f);
  console.log("\n   Ces fichiers diffèrent de ceux que j'ai analysés. Envoie-les-moi.");
}

console.log("\n👉 Ensuite :");
console.log("   bun run verify");
console.log("   git add -A && git commit -m \"lot 2 : recherche + PDF + tests\" && git push");
