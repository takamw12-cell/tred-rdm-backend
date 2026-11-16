// Flyer TRED : marketing/flyer-tred.html → PDF A5 recto verso, planche A4 et captures.
//
//   node packages/web/scripts/generate-flyer.mjs [dossier de sortie]
//
// Sortie par défaut : <dossier utilisateur>/Downloads/TRED-Marketing
//   TRED-Flyer-Premium.pdf                  A5, page 1 = recto, page 2 = verso
//   TRED-Flyer-Premium-A4-2-pro-Blatt.pdf   A4 paysage, deux flyers par feuille, à couper au milieu
//   TRED-Flyer-Premium-recto.png / -verso.png   captures haute résolution pour valider
//
// Le script s'arrête en erreur si le rendu n'est pas imprimable tel quel : image ou police
// manquante, contenu coupé, texte hors de la marge de sécurité, requête vers l'extérieur.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const FLYER = pathToFileURL(join(WEB, "marketing/flyer-tred.html")).href;
const SORTIE = process.argv[2] ?? join(homedir(), "Downloads", "TRED-Marketing");

const LARGEUR_MM = 148;
const HAUTEUR_MM = 210;
const MARGE_MM = 15;
const QR_MIN_MM = 50;

// Règles d'impression injectées dans la page : format A5 exact, sans marge d'imprimante
// ajoutée par le navigateur (la marge de sécurité est dans la mise en page), couleurs de
// fond conservées, une face par page.
const CSS_IMPRESSION = `
  @page { size: ${LARGEUR_MM}mm ${HAUTEUR_MM}mm; margin: 0; }
  @media print {
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { background: none !important; padding: 0 !important; display: block !important; }
    .seite { box-shadow: none !important; break-inside: avoid; }
  }
`;

mkdirSync(SORTIE, { recursive: true });

const browser = await chromium.launch();
const problemes = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 3 });
  page.on("request", (r) => {
    if (!r.url().startsWith("file:")) problemes.push(`requête externe : ${r.url()}`);
  });
  page.on("requestfailed", (r) => problemes.push(`fichier introuvable : ${r.url()}`));
  page.on("pageerror", (e) => problemes.push(`erreur de script : ${e}`));

  // Le rendu validé à l'écran doit être celui du papier : tout se fait en média « print ».
  await page.emulateMedia({ media: "print" });

  const ouvrir = async (url) => {
    await page.goto(url, { waitUntil: "load" });
    await page.addStyleTag({ content: CSS_IMPRESSION });
    await page.evaluate(() => document.fonts.ready);
  };

  await ouvrir(FLYER);

  const etat = await page.evaluate(
    ({ marge, largeur, hauteur }) => {
      const mm = (px) => (px * 25.4) / 96;
      const hors = [];
      for (const face of document.querySelectorAll(".seite")) {
        const f = face.getBoundingClientRect();
        for (const el of face.querySelectorAll("[data-sicher]")) {
          const r = el.getBoundingClientRect();
          const bords = {
            gauche: mm(r.left - f.left),
            haut: mm(r.top - f.top),
            droite: largeur - mm(r.right - f.left),
            bas: hauteur - mm(r.bottom - f.top),
          };
          for (const [cote, valeur] of Object.entries(bords)) {
            if (valeur < marge - 0.05) {
              hors.push(`${face.dataset.seite} : « ${el.textContent.trim().slice(0, 30) || el.tagName} » à ${valeur.toFixed(1)} mm du bord ${cote}`);
            }
          }
        }
      }
      return {
        images: [...document.images].filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.src),
        polices: {
          Fraunces: document.fonts.check('600 40pt "Fraunces"'),
          Inter: document.fonts.check('500 12pt "Inter"'),
        },
        faces: [...document.querySelectorAll(".seite")].map((s) => ({
          face: s.dataset.seite,
          mm: [mm(s.getBoundingClientRect().width), mm(s.getBoundingClientRect().height)].map((v) => +v.toFixed(2)),
          coupe: s.scrollHeight > s.clientHeight || s.scrollWidth > s.clientWidth,
        })),
        // Le code lui-même, sans sa zone de silence (4 modules de chaque côté sur 57).
        qrMm: +((mm(document.querySelector(".kachel img").getBoundingClientRect().width) * 49) / 57).toFixed(1),
        hors,
      };
    },
    { marge: MARGE_MM, largeur: LARGEUR_MM, hauteur: HAUTEUR_MM },
  );

  for (const src of etat.images) problemes.push(`image non chargée : ${src}`);
  for (const [nom, ok] of Object.entries(etat.polices)) if (!ok) problemes.push(`police non chargée : ${nom}`);
  for (const f of etat.faces) {
    if (f.coupe) problemes.push(`${f.face} : le contenu dépasse la page`);
    if (Math.abs(f.mm[0] - LARGEUR_MM) > 0.1 || Math.abs(f.mm[1] - HAUTEUR_MM) > 0.1) {
      problemes.push(`${f.face} : ${f.mm.join(" × ")} mm au lieu de ${LARGEUR_MM} × ${HAUTEUR_MM}`);
    }
  }
  if (etat.faces.length !== 2) problemes.push(`${etat.faces.length} faces au lieu de 2`);
  if (etat.qrMm < QR_MIN_MM) problemes.push(`QR code de ${etat.qrMm} mm, minimum ${QR_MIN_MM}`);
  for (const h of etat.hors) problemes.push(`hors marge de sécurité (${MARGE_MM} mm) : ${h}`);

  // Une face à la fois : empilées, elles se touchent et l'une déborderait d'un pixel sur l'autre.
  for (const face of ["recto", "verso"]) {
    await page.evaluate((visible) => {
      for (const s of document.querySelectorAll(".seite")) s.style.display = s.dataset.seite === visible ? "" : "none";
    }, face);
    await page.locator(`[data-seite="${face}"]`).screenshot({ path: join(SORTIE, `TRED-Flyer-Premium-${face}.png`) });
  }
  await page.evaluate(() => {
    for (const s of document.querySelectorAll(".seite")) s.style.display = "";
  });
  await page.pdf({ path: join(SORTIE, "TRED-Flyer-Premium.pdf"), preferCSSPageSize: true, printBackground: true });

  await ouvrir(`${FLYER}?bogen=a4`);
  // La page impose son propre format A4 : il doit passer après la règle A5 injectée.
  await page.addStyleTag({ content: "@page { size: 297mm 210mm; margin: 0; }" });
  await page.pdf({
    path: join(SORTIE, "TRED-Flyer-Premium-A4-2-pro-Blatt.pdf"),
    preferCSSPageSize: true,
    printBackground: true,
  });

  console.log(JSON.stringify({ sortie: SORTIE, faces: etat.faces, qrMm: etat.qrMm, problemes }, null, 1));
} finally {
  await browser.close();
}

if (problemes.length > 0) {
  console.error(`\n${problemes.length} problème(s) : le flyer n'est pas prêt à imprimer.`);
  process.exit(1);
}
