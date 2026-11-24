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
 *   INCOMPLET    la topologie est juste, mais une donnée de la feuille manque
 *                (fréquence, « ~ », grandeur donnée comme Uc = 5 V) : le calcul
 *                serait impossible ou faux ;
 *   FAUX         TRED retient une lecture qui n'est pas celle de la feuille.
 * INCOMPLET et FAUX comptent comme échecs.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSi } from "../../src/api/lib/solvers/solveCircuit.ts";
import { beyondNetlist, compareReadings, givenKey, readSchematic } from "../../src/api/lib/circuit/vision-read.ts";

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
  frequency: null,
  source_type: "unbekannt",
  given_values: [],
  andere: [],
  unklar: [],
});
const num = (v) => {
  try {
    return Number(parseSi(String(v)).toPrecision(9));
  } catch {
    return String(v).trim().toLowerCase();
  }
};

/** Les données de la feuille que la référence exige et que la lecture n'a pas. */
function missing(exp, raw) {
  const r = renamed(raw, exp.namen);
  const out = [];
  if (exp.frequency !== undefined && r.frequency !== exp.frequency) out.push(`fréquence ${exp.frequency} Hz (lu : ${r.frequency ?? "rien"})`);
  if (exp.source_type !== undefined && r.source_type !== exp.source_type) out.push(`source ${exp.source_type} (lu : ${r.source_type})`);
  for (const [name, wert] of exp.gegeben ?? []) {
    const inGiven = (r.given_values ?? []).some((g) => givenKey(g.name) === givenKey(name) && num(g.wert) === num(wert));
    const asPart = r.elemente.some((e) => givenKey(e.name) === givenKey(name) && num(e.wert) === num(wert));
    if (!inGiven && !asPart) out.push(`${name} = ${wert}`);
  }
  for (const [typ, name, wert] of exp.bauteile ?? []) {
    if (!r.elemente.some((e) => e.typ === typ && givenKey(e.name) === givenKey(name) && num(e.wert) === num(wert))) out.push(`composant ${name} = ${wert}`);
  }
  if (exp.andere_enthaelt && !r.andere.join(" ").toLowerCase().includes(exp.andere_enthaelt)) out.push(`« ${exp.andere_enthaelt} » dans la description`);
  return out;
}
const complete = (exp, reading, ok) => {
  const m = missing(exp, reading);
  return m.length ? { verdict: "INCOMPLET", detail: `manque : ${m.join(" ; ")}` } : ok;
};
const renamed = (reading, map = {}) => ({ ...reading, elemente: reading.elemente.map((e) => ({ ...e, name: map[e.name] ?? e.name })) });
const matches = (reading, exp) => exp.varianten.some((rows) => compareReadings(asReading(rows, exp.schalter), renamed(reading, exp.namen)).agree);
const list = (r) => r.elemente.map((e) => `${e.name}(${e.a}–${e.b}${e.wert ? ` ${e.wert}` : ""})`).join(" ");

/** @returns {{ verdict: "JUSTE" | "PRUDENT" | "FAUX", detail: string }} */
function judge(exp, v) {
  if (exp.art === "kein_schaltplan") return v === null ? { verdict: "JUSTE", detail: "pas un schéma, rien d'affiché" } : { verdict: "FAUX", detail: `un schéma est annoncé : ${v.kind}` };
  if (exp.art === "ausserhalb") {
    if (v === null) return { verdict: "PRUDENT", detail: "non lu : le tuteur lit l'image lui-même" };
    if (v.kind === "disputed") return { verdict: "PRUDENT", detail: `lectures en désaccord (${v.disputed.join(", ")})` };
    return beyondNetlist(v.reading) ? complete(exp, v.reading, { verdict: "JUSTE", detail: `hors netlist reconnu, composants et données présents : ${v.reading.andere[0]?.slice(0, 50)}` }) : { verdict: "FAUX", detail: `carte de netlist sans le composant spécial : ${list(v.reading)}` };
  }
  if (v === null) return { verdict: "PRUDENT", detail: "non lu : le tuteur lit l'image lui-même" };
  if (v.kind === "disputed") {
    const one = matches(v.first, exp) || matches(v.second, exp);
    return { verdict: "PRUDENT", detail: `lectures en désaccord sur ${v.disputed.join(", ")}${one ? " (l'une des deux est juste)" : " (aucune n'est juste)"}` };
  }
  if (beyondNetlist(v.reading)) return { verdict: "PRUDENT", detail: `composant hors netlist annoncé à tort : ${v.reading.andere[0]?.slice(0, 70)}` };
  return matches(v.reading, exp) ? complete(exp, v.reading, { verdict: "JUSTE", detail: "composants, connexions, valeurs et données conformes" }) : { verdict: "FAUX", detail: `lu : ${list(v.reading)}` };
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
  const seen = v?.kind === "agreed" ? v.reading : v?.kind === "disputed" ? v.first : null;
  rows.push({
    key,
    art: exp.art,
    verdict,
    detail,
    s: ((Date.now() - started) / 1000).toFixed(1),
    n: seen ? seen.elemente.length + seen.schalter.length : "—",
    f: seen ? (seen.frequency === null ? "—" : `${seen.frequency} Hz`) : "—",
    ac: seen ? (seen.source_type === "unbekannt" ? "—" : seen.source_type) : "—",
    given: seen?.given_values.length ? seen.given_values.map((g) => `${g.name} = ${g.wert}${g.einheit ? ` ${g.einheit}` : ""}`).join(", ") : "—",
  });
  console.log(`${verdict.padEnd(9)} ${key}  ${rows.at(-1).s} s  f=${rows.at(-1).f} ${rows.at(-1).ac}  [${rows.at(-1).given}]  ${detail}`);
}

const count = (x) => rows.filter((r) => r.verdict === x).length;
const table = [
  `# Lecture des schémas — ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
  "",
  `**${count("JUSTE")}/${rows.length} justes · ${count("PRUDENT")} prudents · ${count("INCOMPLET")} incomplets · ${count("FAUX")} faux**`,
  "",
  "| Photo | Type attendu | Composants | Fréquence | AC/DC | Valeurs données | Verdict | Temps | Détail |",
  "|---|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.key} | ${r.art} | ${r.n} | ${r.f} | ${r.ac} | ${r.given} | ${r.verdict} | ${r.s} s | ${r.detail.replaceAll("|", "/")} |`),
].join("\n");
writeFileSync(join(here, "dernier-resultat.md"), `${table}\n`);
console.log(`\n${count("JUSTE")}/${rows.length} justes · ${count("PRUDENT")} prudents · ${count("INCOMPLET")} incomplets · ${count("FAUX")} faux  →  tests/schemas-verification/dernier-resultat.md`);
process.exit(count("FAUX") + count("INCOMPLET") ? 1 : 0);
