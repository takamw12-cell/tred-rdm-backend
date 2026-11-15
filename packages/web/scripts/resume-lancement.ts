// Le résumé du matin, à la demande — le même que l'e-mail de 8 h
// (src/api/lib/morning-digest-job.ts).
//
//   railway run bun packages/web/scripts/resume-lancement.ts            → l'affiche
//   railway run bun packages/web/scripts/resume-lancement.ts --envoyer  → l'envoie aussi aux adresses ADMIN_EMAILS
//
// `railway run` fournit les variables de production (base, PostHog, e-mail) ;
// rien n'est écrit en base, et seuls des comptes sont affichés.
import { renderDigest } from "../src/api/lib/morning-digest";
import { buildDigest, sendMorningDigest } from "../src/api/lib/morning-digest-job";

if (process.argv.includes("--envoyer")) {
  const { line, sent, recipients } = await sendMorningDigest();
  console.log(`${line} — ${sent}/${recipients} e-mail(s) partis`);
} else {
  console.log(renderDigest(await buildDigest()).text);
}
process.exit(0);
