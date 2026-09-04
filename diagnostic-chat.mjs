/**
 * Pourquoi le tuteur dit qu'il ne voit aucun document.
 *
 *     node <chemin>\diagnostic-chat.mjs
 *
 * Le prompt du tuteur bascule sur « l'étudiant n'a encore rien téléversé » dès
 * que la liste de documents qu'on lui passe est vide. Ce script regarde ce que
 * le serveur trouverait vraiment pour ton compte, et à quel endroit la chaîne
 * casse. Lecture seule : il n'écrit rien.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function trouverEnv() {
  const departs = [process.cwd(), dirname(fileURLToPath(import.meta.url))];
  for (const depart of departs) {
    let d = depart;
    for (let i = 0; i < 8; i++) {
      const c = join(d, ".env");
      if (existsSync(c)) return c;
      const p = dirname(d);
      if (p === d) break;
      d = p;
    }
  }
  return null;
}

const chemin = trouverEnv();
if (!chemin) { console.error("\n  x  Aucun .env trouve.\n"); process.exit(1); }

const env = Object.fromEntries(
  readFileSync(chemin, "utf8").split(/\r?\n/)
    .filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);

const url = (env.DATABASE_URL ?? "").replace(/^libsql:\/\//, "https://").replace(/\/$/, "");
const token = env.DATABASE_AUTH_TOKEN ?? "";
if (!url) { console.error("  x  DATABASE_URL absent"); process.exit(1); }

async function sql(requetes) {
  const res = await fetch(`${url}/v2/pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ requests: [...requetes.map((s) => ({ type: "execute", stmt: { sql: s } })), { type: "close" }] }),
  }).catch((e) => { console.error("  x  Reseau : " + e.message); process.exit(1); });
  if (!res.ok) { console.error(`  x  Turso ${res.status}`); console.error((await res.text()).slice(0, 300)); process.exit(1); }
  const body = await res.json();
  const ko = (body.results ?? []).filter((r) => r.type === "error");
  if (ko.length) { for (const f of ko) console.error("  x  " + (f.error?.message ?? "erreur")); process.exit(1); }
  return body.results ?? [];
}

const lignes = (r) => (r?.response?.result?.rows ?? []).map((row) => row.map((c) => c?.value));

console.log("\n  Ce que le serveur trouverait pour chaque compte\n");

const [parCompte] = await sql([`
  SELECT u.email,
         count(d.id),
         sum(CASE WHEN d.text_content IS NULL OR length(d.text_content) = 0 THEN 1 ELSE 0 END),
         sum(CASE WHEN d.semester_id IS NULL THEN 1 ELSE 0 END),
         sum(length(coalesce(d.text_content, '')))
    FROM user u LEFT JOIN document d ON d.user_id = u.id
   GROUP BY u.id
   ORDER BY count(d.id) DESC
`]);

console.log("  compte                          docs  sans texte  sans semestre  caracteres");
console.log("  " + "-".repeat(76));
for (const [email, n, vides, sansSem, chars] of lignes(parCompte)) {
  console.log(
    "  " + String(email ?? "?").padEnd(30) +
    String(n ?? 0).padStart(5) +
    String(vides ?? 0).padStart(12) +
    String(sansSem ?? 0).padStart(15) +
    String(chars ?? 0).padStart(12),
  );
}

const [detail] = await sql([`
  SELECT d.title,
         length(coalesce(d.text_content, '')),
         d.page_count,
         CASE WHEN d.semester_id IS NULL THEN 'aucun' ELSE 'oui' END,
         CASE WHEN d.file_key IS NULL THEN 'non' ELSE 'oui' END
    FROM document d
   ORDER BY d.created_at DESC
   LIMIT 20
`]);

console.log("\n  Les vingt derniers documents\n");
console.log("  titre                                   texte  pages  semestre  fichier");
console.log("  " + "-".repeat(76));
for (const [titre, chars, pages, sem, fic] of lignes(detail)) {
  const t = String(titre ?? "?").slice(0, 36).padEnd(38);
  console.log("  " + t + String(chars ?? 0).padStart(7) + String(pages ?? 0).padStart(7) +
              String(sem ?? "?").padStart(10) + String(fic ?? "?").padStart(9));
}

console.log(`
  COMMENT LIRE

  "texte" a 0        L'extraction a echoue : le tuteur recoit un document
                     sans contenu. C'est la panne la plus probable.

  "semestre" aucun   Le document n'est rattache a aucun semestre. Si un
                     semestre est SELECTIONNE dans le chat, le tuteur ne
                     verra AUCUN de ces documents -- alors que la liste de
                     gauche, elle, les affiche tous.

  Tout a l'air normal ?  Alors le probleme est ailleurs, et c'est la
  version deployee sur Railway qu'il faut regarder.
`);
