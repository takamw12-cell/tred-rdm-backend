/**
 * Vérifie qu'aucun secret n'est dans le bundle du navigateur.
 *
 *     bun scripts/check-bundle-secrets.ts        (depuis packages/web, après le build)
 *
 * Deux contrôles sur tous les fichiers texte de `dist/` :
 *   1. des formes de clés connues (Anthropic, Stripe, ElevenLabs, JWT…) ;
 *   2. la VALEUR de chaque variable serveur du `.env` local et de
 *      l'environnement — on n'affiche que son nom.
 * Sort en erreur (code 1) à la moindre trouvaille : la CI s'arrête.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { findLeakedValues, findSecretPatterns, parseEnvFile, serverOnlyValues } from "./bundle-secrets";

const DIST = join(import.meta.dir, "../dist");
const TEXT = /\.(js|mjs|css|html|json|map|txt|svg|xml|webmanifest)$/i;

if (!existsSync(DIST)) {
  console.error("dist/ introuvable : lance d'abord le build (bun run build:web).");
  process.exit(1);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : TEXT.test(name) ? [p] : [];
  });
}

const env: Record<string, string | undefined> = { ...process.env };
for (const candidate of [join(import.meta.dir, "../../../.env"), join(import.meta.dir, "../.env")]) {
  if (existsSync(candidate)) Object.assign(env, parseEnvFile(readFileSync(candidate, "utf8")));
}
const secrets = serverOnlyValues(env);

const files = walk(DIST);
let problems = 0;
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const rel = relative(DIST, file);
  for (const f of findSecretPatterns(text)) {
    problems += 1;
    console.error(`  x  ${rel} : ${f.name} (${f.excerpt})`);
  }
  for (const key of findLeakedValues(text, secrets)) {
    problems += 1;
    console.error(`  x  ${rel} : la valeur de ${key} est dans le bundle`);
  }
}

if (problems > 0) {
  console.error(`\n${problems} secret(s) dans le bundle du navigateur. Rien de ceci ne doit être déployé.`);
  process.exit(1);
}
console.log(`Aucun secret dans le bundle : ${files.length} fichiers lus, ${secrets.length} valeurs serveur comparées.`);
