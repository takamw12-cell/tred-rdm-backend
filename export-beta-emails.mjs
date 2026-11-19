#!/usr/bin/env node
/**
 * export-beta-emails.mjs — LECTURE SEULE. Liste les adresses des comptes TRED
 * pour l'e-mail de lancement aux bêta-testeurs (envoi en Cci depuis Gmail).
 *
 *     node C:\dev\tred-rdm\aerostudy-ai\export-beta-emails.mjs
 *
 * Écrit marketing/BETA_EMAILS.txt — fichier exclu de git (.git/info/exclude) :
 * il contient des données personnelles, il ne doit JAMAIS être commité.
 * Exclus d'office : le compte fondateur (il est dans le champ « À ») et les
 * boîtes jetables de test (fldubai.com, mail.tm).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(here, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
const url = (env.DATABASE_URL ?? "").replace(/^libsql:\/\//, "https://").replace(/\/$/, "");
const SQL = "SELECT email, email_verified FROM user ORDER BY created_at";
const res = await fetch(`${url}/v2/pipeline`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.DATABASE_AUTH_TOKEN ?? ""}` },
  body: JSON.stringify({ requests: [{ type: "execute", stmt: { sql: SQL } }, { type: "close" }] }),
});
if (!res.ok) throw new Error(`Turso ${res.status}`);
const rows = (await res.json()).results[0].response.result.rows.map((r) => ({ email: String(r[0].value).trim().toLowerCase(), verified: String(r[1].value) === "1" }));
const FOUNDER = (env.ADMIN_EMAILS ?? "").toLowerCase().split(/[,\s]+/).filter(Boolean);
const keep = rows.filter((r) => r.email.includes("@") && !FOUNDER.includes(r.email) && !/@(fldubai\.com|mail\.tm)$/.test(r.email));
const skipped = rows.length - keep.length;
const verified = keep.filter((r) => r.verified).length;

const mail = readFileSync(join(here, "marketing/EMAIL_BETA.txt"), "utf8").replaceAll("[Ton prénom]", "Rached");
const body = mail.slice(mail.indexOf("──────────────── DE"));
writeFileSync(
  join(here, "marketing/BETA_EMAILS.txt"),
  `NE PAS COMMITER — données personnelles (exclu de git).\n` +
    `${keep.length} adresses (${verified} confirmées), ${skipped} exclues (fondateur, boîtes de test).\n\n` +
    `── Cci (copier-coller) ──\n${keep.map((r) => r.email).join(", ")}\n\n` +
    `── Objet ──\nTRED ist live! 🎉 10 Credits für dich / TRED is live! 🎉 10 credits for you\n\n${body}`,
);
const ex = join(here, ".git/info/exclude");
if (existsSync(ex) && !readFileSync(ex, "utf8").includes("marketing/BETA_EMAILS.txt")) writeFileSync(ex, readFileSync(ex, "utf8") + "\nmarketing/BETA_EMAILS.txt\n");
console.log(`marketing/BETA_EMAILS.txt : ${keep.length} adresses (${verified} confirmées), ${skipped} exclues.`);
