// 1) Rend le chargement des langues paresseux — corrige la lenteur.
// 2) Vérifie que la locale atteint bien le tuteur — corrige « la langue ne suit pas ».
//
//   node fix-i18n-perf.mjs
//
// Idempotent, avec .bak.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const W = (...p) => path.join(ROOT, "packages", "web", "src", ...p);
const IDX = W("web", "i18n", "index.ts");
const MSG = W("web", "i18n", "messages");

if (!fs.existsSync(IDX)) {
  console.error(`❌ Introuvable : ${path.relative(ROOT, IDX)}`);
  console.error("   Lance ce script depuis C:\\dev\\tred-rdm\\aerostudy-ai");
  process.exit(1);
}

/* ══ 1. Chargement paresseux ═══════════════════════════════════════════ */

const src = fs.readFileSync(IDX, "utf8");

const meta = [...src.matchAll(/\{\s*code:\s*"(\w+)",\s*flag:\s*"([^"]+)",\s*label:\s*"([^"]+)"\s*\}/g)]
  .map((m) => ({ code: m[1], flag: m[2], label: m[3] }));

if (meta.length === 0) {
  console.error("❌ `localeMeta` illisible. Lance d'abord sync-locales.mjs.");
  process.exit(1);
}

const already = src.includes("LOADERS");
const first = meta[0].code;

let weight = 0;
for (const { code } of meta) {
  const f = path.join(MSG, `${code}.ts`);
  if (fs.existsSync(f)) weight += fs.statSync(f).size;
  else console.log(`⚠️  messages/${code}.ts absent`);
}
const firstSize = fs.existsSync(path.join(MSG, `${first}.ts`))
  ? fs.statSync(path.join(MSG, `${first}.ts`)).size
  : 0;

if (already) {
  console.log("⏭️  Chargement paresseux déjà en place.");
} else {
  const loaders = meta
    .map(({ code }) =>
      code === first
        ? `  ${code}: async () => ${code},`
        : `  ${code}: () => import("./messages/${code}").then((m) => m.${code}),`,
    )
    .join("\n");

  const metaLines = meta
    .map((m) => `  { code: "${m.code}", flag: "${m.flag}", label: "${m.label}" },`)
    .join("\n");

  const next = `import { useCallback, useSyncExternalStore } from "react";
import { ${first} } from "./messages/${first}";
import type { Locale, Messages } from "./types";
import { useLocaleStore } from "@/stores/locale";

export type { Locale, Messages };

/**
 * Les paquets de traduction sont chargés À LA DEMANDE.
 *
 * Avant, les ${meta.length} langues étaient importées statiquement : ${Math.round(weight / 1024)} Ko de
 * JavaScript téléchargés par CHAQUE visiteur, dont ${meta.length - 1} langues qu'il ne lira
 * jamais. Sur le réseau d'un campus, ça se sent au premier affichage.
 *
 * Seul le ${first} est embarqué — il s'affiche immédiatement, sans attente. Les
 * autres arrivent en arrière-plan au moment où on les demande, et restent en
 * mémoire ensuite. Vite les découpe automatiquement en fichiers séparés.
 */
const LOADERS: Record<Locale, () => Promise<Messages>> = {
${loaders}
};

const loaded: Partial<Record<Locale, Messages>> = { ${first} };
const pending = new Set<Locale>();

/* Abonnement minimal : les composants se redessinent quand un paquet arrive. */
let version = 0;
const listeners = new Set<() => void>();
function emit() {
  version += 1;
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
const getVersion = () => version;

/** Précharge une langue. Sans effet si elle est déjà là ou en cours. */
export function preloadLocale(locale: Locale): void {
  if (loaded[locale] || pending.has(locale)) return;
  pending.add(locale);
  LOADERS[locale]()
    .then((pack) => {
      loaded[locale] = pack;
      emit();
    })
    .catch(() => {
      // Réseau coupé pendant le chargement : on retombe sur le ${first},
      // l'interface reste lisible. Une nouvelle tentative aura lieu au
      // prochain rendu.
    })
    .finally(() => pending.delete(locale));
}

export const localeMeta: { code: Locale; flag: string; label: string }[] = [
${metaLines}
];

// Resolve a dot-path against the message tree.
function resolve(obj: unknown, path: string): string {
  const value = path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined,
      obj,
    );
  return typeof value === "string" ? value : path;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\\{(\\w+)\\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : \`{\${key}}\`,
  );
}

export type TranslateFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

/**
 * Hook de traduction. Lire la langue depuis le store fait que chaque
 * consommateur se redessine à l'instant du changement — sans rechargement.
 *
 * Tant que le paquet demandé n'est pas arrivé, on affiche le ${first}. C'est
 * imperceptible sur une connexion normale, et bien préférable à un écran vide
 * ou à des clés brutes.
 */
export function useT(): { t: TranslateFn; locale: Locale } {
  const locale = useLocaleStore((s) => s.locale);
  useSyncExternalStore(subscribe, getVersion, getVersion);

  preloadLocale(locale);
  const pack = loaded[locale] ?? ${first};

  const t = useCallback<TranslateFn>(
    (key, vars) => interpolate(resolve(pack, key), vars),
    [pack],
  );

  return { t, locale };
}
`;

  fs.writeFileSync(IDX + ".bak", src, "utf8");
  fs.writeFileSync(IDX, next, "utf8");

  console.log("✅ Chargement paresseux en place.");
  console.log(`   avant : ${Math.round(weight / 1024)} Ko dans le bundle principal`);
  console.log(`   après : ${Math.round(firstSize / 1024)} Ko (${first} seul), le reste à la demande`);
  console.log(`   gain  : ~${Math.round((weight - firstSize) / 1024)} Ko au premier affichage\n`);
}

/* ══ 2. La locale atteint-elle le tuteur ? ═════════════════════════════ */

console.log("── La chaîne de la langue ────────────────────");

const codes = meta.map((m) => m.code);
let broken = 0;

function check(file, label, test) {
  const f = W(...file);
  if (!fs.existsSync(f)) {
    console.log(`  ❌ ${label} — fichier absent`);
    broken++;
    return;
  }
  const s = fs.readFileSync(f, "utf8");
  const missing = codes.filter((c) => !test(s, c));
  if (missing.length === 0) console.log(`  ✅ ${label}`);
  else {
    console.log(`  ❌ ${label} — manque : ${missing.join(", ")}`);
    broken++;
  }
}

check(["api", "agent", "index.ts"], "LANG_LABEL (langue de réponse du tuteur)", (s, c) => {
  const m = s.match(/const LANG_LABEL[\s\S]*?\};/);
  return !!m && new RegExp(`\\b${c}:`).test(m[0]);
});

check(["api", "routes", "account.ts"], "LOCALES (ce que la base accepte)", (s, c) => {
  const m = s.match(/export const LOCALES = \[[^\]]*\]/);
  return !!m && m[0].includes(`"${c}"`);
});

check(["api", "index.ts"], "TR_LANG (traduction de l'historique)", (s, c) => {
  const m = s.match(/const TR_LANG[\s\S]*?\};/);
  return !!m && new RegExp(`\\b${c}:`).test(m[0]);
});

// Le repli de LANG_LABEL — le piège silencieux.
const agent = fs.readFileSync(W("api", "agent", "index.ts"), "utf8");
if (/LANG_LABEL\[opts\.locale\]\s*\?\?\s*opts\.locale/.test(agent)) {
  console.log("  ✅ repli sur le code (et non sur l'allemand)");
} else {
  console.log("  ❌ repli sur \"Deutsch\" — une langue inconnue répondra en allemand");
  broken++;
}

// Le store écrit-il en base ?
const STORE = W("web", "stores", "locale.ts");
if (fs.existsSync(STORE)) {
  const s = fs.readFileSync(STORE, "utf8");
  if (/account\.setLocale/.test(s)) console.log("  ✅ le store écrit la langue en base");
  else {
    console.log("  ❌ le store n'écrit PAS en base — le tuteur ne saura jamais");
    console.log("     → applique stores/locale.ts de la livraison tred-locale-fix");
    broken++;
  }
} else {
  console.log("  ⚠️  stores/locale.ts introuvable");
}

console.log("\n── verdict ───────────────────────────────────");
if (broken === 0) {
  console.log("  Chaîne complète. Si la langue ne suit toujours pas, la colonne");
  console.log("  user_access.locale n'existe probablement pas en base :");
  console.log("     bun --env-file=.env migration-langue.mjs");
} else {
  console.log(`  ${broken} maillon(s) cassé(s) — voir ci-dessus.`);
}
console.log("\n👉 bunx tsc --noEmit -p packages\\web\n");
