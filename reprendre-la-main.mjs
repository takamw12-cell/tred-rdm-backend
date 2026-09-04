/**
 * Te redonner l'accès après la suppression de ton compte.
 *
 *     node <chemin>\reprendre-la-main.mjs
 *
 * ── Le blocage ────────────────────────────────────────────────────────────
 *
 * L'inscription est fermée (`ALLOW_PUBLIC_SIGNUP` n'est pas à "true"), donc il
 * faut un code d'invitation. Les codes se créent depuis l'écran
 * d'administration. L'écran d'administration exige le rôle admin. Le rôle admin
 * vivait dans `user_access`, ligne supprimée avec ton compte.
 *
 * La boucle se coupe ici : on écrit un code directement dans la base.
 *
 * ── Pourquoi pas ouvrir l'inscription publique une minute ─────────────────
 *
 * Parce qu'une minute suffit. Ton adresse est indexée, ton domaine Railway est
 * public : ouvrir la porte, même brièvement, est un choix qu'on ne peut pas
 * défaire. Un code à usage limité ne laisse entrer que celui qui l'a.
 *
 * ── Et le rôle admin ? ────────────────────────────────────────────────────
 *
 * Il revient tout seul. `getAccess()` relit `ADMIN_EMAILS` à chaque appel : si
 * ton adresse y figure sur Railway, ta première connexion recrée la ligne avec
 * `role: "admin"`. Le script te le confirme avant de finir.
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
if (!chemin) {
  console.error("\n  x  Aucun .env trouve.\n");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(chemin, "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const url = (env.DATABASE_URL ?? "").replace(/^libsql:\/\//, "https://").replace(/\/$/, "");
const token = env.DATABASE_AUTH_TOKEN ?? "";
if (!url) {
  console.error("  x  DATABASE_URL absent du .env");
  process.exit(1);
}

/** Le meme alphabet que generateCode() : ni 0/O ni 1/I, un code se recopie. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const bytes = new Uint8Array(8);
crypto.getRandomValues(bytes);
const CODE = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");

// Drizzle ecrit les colonnes `mode: "timestamp"` en SECONDES, pas en
// millisecondes. Se tromper ici donnerait une date en 1970 — sans effet sur la
// validation, qui ne lit que `disabled`, `expires_at` et `used_count`, mais la
// liste des codes afficherait n'importe quoi.
const maintenant = Math.floor(Date.now() / 1000);

async function pipeline(requests) {
  const res = await fetch(`${url}/v2/pipeline`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ requests: [...requests, { type: "close" }] }),
  });
  if (!res.ok) {
    console.error(`  x  Turso a repondu ${res.status}`);
    console.error((await res.text()).slice(0, 400));
    process.exit(1);
  }
  const body = await res.json();
  const ko = (body.results ?? []).filter((r) => r.type === "error");
  if (ko.length) {
    for (const f of ko) console.error("  x  " + (f.error?.message ?? "erreur"));
    process.exit(1);
  }
  return body.results ?? [];
}

const n = (r, i) => r[i]?.response?.result?.rows?.[0]?.[0]?.value ?? "?";

console.log("\n  Etat de la base\n");

const avant = await pipeline([
  { type: "execute", stmt: { sql: "SELECT count(*) FROM user" } },
  { type: "execute", stmt: { sql: "SELECT count(*) FROM document" } },
  { type: "execute", stmt: { sql: "SELECT count(*) FROM chat_conversation" } },
  { type: "execute", stmt: { sql: "SELECT count(*) FROM invite_code" } },
  {
    type: "execute",
    stmt: {
      sql: "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='content_report'",
    },
  },
]);

console.log("    comptes           : " + n(avant, 0));
console.log("    documents         : " + n(avant, 1));
console.log("    conversations     : " + n(avant, 2));
console.log("    codes existants   : " + n(avant, 3));
console.log(
  "    table content_report : " + (n(avant, 4) === "1" ? "presente" : "ABSENTE"),
);

await pipeline([
  {
    type: "execute",
    stmt: {
      sql: `INSERT INTO invite_code (code, label, max_uses, used_count, expires_at, disabled, created_at)
            VALUES (?, ?, 3, 0, NULL, 0, ?)`,
      args: [
        { type: "text", value: CODE },
        { type: "text", value: "Wiederherstellung Betreiberkonto" },
        { type: "integer", value: String(maintenant) },
      ],
    },
  },
]);

console.log(`
  ────────────────────────────────────────────────────────────

    TON CODE :   ${CODE}

    Trois utilisations, sans expiration.

  ────────────────────────────────────────────────────────────

  1.  Va sur ton site, "Noch kein Konto? Registrieren".
  2.  Reinscris-toi avec takamw12@gmail.com et ce code.
  3.  Le role admin revient de lui-meme SI ton adresse figure dans
      ADMIN_EMAILS sur Railway. Verifie-le avant : Railway > ton
      service > Variables > ADMIN_EMAILS doit contenir
      takamw12@gmail.com.
  4.  Une fois dedans, desactive ce code depuis l'ecran Zugang.

  Ce qui ne revient pas : documents, conversations, semestres,
  exercices sauvegardes, lacunes suivies. La suppression est
  irreversible au niveau de l'application — c'est ce que le RGPD
  exige, et c'est ce que le code fait.
`);
