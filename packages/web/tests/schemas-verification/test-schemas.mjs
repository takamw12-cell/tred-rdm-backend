/**
 * Jeu d'essai de la lecture des schémas : chaque photo passe dans la VRAIE
 * double lecture de TRED (lib/circuit/vision-read.ts), et le résultat est
 * comparé à ce que la feuille contient vraiment (attendu.json).
 *
 * Lancer (depuis packages/web, clé ANTHROPIC_API_KEY dans l'environnement) :
 *   bun tests/schemas-verification/test-schemas.mjs            toutes les photos
 *   bun tests/schemas-verification/test-schemas.mjs aufgabe14  une seule
 *
 * COÛT : deux lectures par le modèle de vision par photo (quelques centimes).
 * Ce script n'est PAS dans `bun test` : il ne tourne que sur demande.
 *
 * Verdicts :
 *   JUSTE        la lecture retenue est celle de la feuille ;
 *   PRUDENT      les deux lectures se contredisent : TRED ne calcule rien et
 *                fait vérifier l'étudiant — pas d'erreur, mais pas de lecture ;
 *   FAUX         TRED retient une lecture qui n'est pas celle de la feuille.
 *                C'est le seul cas dangereux : il doit rester à zéro.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beyondNetlist, compareReadings, readSchematic } from "../../src/api/lib/circuit/vision-read.ts";

const here = dirname(fileURLToPath(import.meta.url));
const expected = JSON.parse(readFileSync(join(here, "attendu.json"), "utf8"));
const only = process.argv.slice(2);
const photos = readdirSync(join(here, "photos")).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
if (!photos.length) {
  console.error("Aucune photo dans tests/schemas-verification/photos/ (elles ne sont pas dans git : droit d'auteur).");
  process.exit(2);
}

const asReading = (rows, schalter = []) => ({
  istSchaltplan: true,
  elemente: rows.map(([typ, name, a, b, wert]) => ({ typ, name, a, b, wert })),
  lage: [],
  schalter: schalter.map((s) => ({ gx: 0, gy: 0, ...s, stellungen: s.stellungen.map((p) => ({ x: 0, y: 0, ...p })) })),
  andere: [],
  unklar: [],
});
const renamed = (reading, map = {}) => ({ ...reading, elemente: reading.elemente.map((e) => ({ ...e, name: map[e.name] ?? e.name })) });
const matches = (reading, exp) => exp.varianten.some((rows) => compareReadings(asReading(rows, exp.schalter), renamed(reading, exp.namen)).agree);
const list = (r) => r.elemente.map((e) => `${e.name}(${e.a}–${e.b}${e.wert ? ` ${e.wert}` : ""})`).join(" ");

/** @returns {{ verdict: "JUSTE" | "PRUDENT" | "FAUX", detail: string }} */
function judge(exp, v) {
  if (exp.art === "kein_schaltplan") return v === null ? { verdict: "JUSTE", detail: "pas un schéma, rien d'affiché" } : { verdict: "FAUX", detail: `un schéma est annoncé : ${v.kind}` };
  if (exp.art === "ausserhalb") {
    if (v === null) return { verdict: "PRUDENT", detail: "non lu : le tuteur lit l'image lui-même" };
    if (v.kind === "disputed") return { verdict: "PRUDENT", detail: `lectures en désaccord (${v.disputed.join(", ")})` };
    return beyondNetlist(v.reading) ? { verdict: "JUSTE", detail: `hors netlist reconnu : ${v.reading.andere[0]?.slice(0, 70)}` } : { verdict: "FAUX", detail: `carte de netlist sans le composant spécial : ${list(v.reading)}` };
  }
  if (v === null) return { verdict: "PRUDENT", detail: "non lu : le tuteur lit l'image lui-même" };
  if (v.kind === "disputed") {
    const one = matches(v.first, exp) || matches(v.second, exp);
    return { verdict: "PRUDENT", detail: `lectures en désaccord sur ${v.disputed.join(", ")}${one ? " (l'une des deux est juste)" : " (aucune n'est juste)"}` };
  }
  if (beyondNetlist(v.reading)) return { verdict: "PRUDENT", detail: `composant hors netlist annoncé à tort : ${v.reading.andere[0]?.slice(0, 70)}` };
  return matches(v.reading, exp) ? { verdict: "JUSTE", detail: "composants, connexions et valeurs conformes" } : { verdict: "FAUX", detail: `lu : ${list(v.reading)}` };
}

const rows = [];
for (const file of photos) {
  const key = file.replace(/\.[^.]+$/, "");
  if (only.length && !only.includes(key)) continue;
  const exp = expected[key];
  if (!exp) {
    console.warn(`${key} : pas de référence dans attendu.json, ignorée`);
    continue;
  }
  const started = Date.now();
  const v = await readSchematic(new Uint8Array(readFileSync(join(here, "photos", file))), /png$/i.test(file) ? "image/png" : "image/jpeg", { timeoutMs: 90_000 });
  const { verdict, detail } = judge(exp, v);
  rows.push({ key, art: exp.art, verdict, detail, s: ((Date.now() - started) / 1000).toFixed(1) });
  console.log(`${verdict.padEnd(8)} ${key}  ${rows.at(-1).s} s  ${detail}`);
}

const count = (x) => rows.filter((r) => r.verdict === x).length;
const table = [
  `# Lecture des schémas — ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
  "",
  `**${count("JUSTE")}/${rows.length} justes · ${count("PRUDENT")} prudents · ${count("FAUX")} faux**`,
  "",
  "| Photo | Type attendu | Verdict | Temps | Détail |",
  "|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.key} | ${r.art} | ${r.verdict} | ${r.s} s | ${r.detail.replaceAll("|", "/")} |`),
].join("\n");
writeFileSync(join(here, "dernier-resultat.md"), `${table}\n`);
console.log(`\n${count("JUSTE")}/${rows.length} justes · ${count("PRUDENT")} prudents · ${count("FAUX")} faux  →  tests/schemas-verification/dernier-resultat.md`);
process.exit(count("FAUX") ? 1 : 0);
