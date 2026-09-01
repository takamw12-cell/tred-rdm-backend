// Mentions légales : routes publiques, pied de page, et correction d'un défaut
// du lot 1.
//
//   node patch-legal.mjs
//
// Idempotent, .bak avant chaque écriture.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WEB = path.join(ROOT, "packages", "web", "src", "web");

const F = {
  appTsx: path.join(WEB, "app.tsx"),
  login: path.join(WEB, "pages", "login.tsx"),
  layout: path.join(WEB, "components", "layout.tsx"),
  data: path.join(WEB, "data", "legal.ts"),
  page: path.join(WEB, "pages", "legal.tsx"),
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

for (const [label, file] of [
  ["data/legal.ts", F.data],
  ["pages/legal.tsx", F.page],
]) {
  if (!fs.existsSync(file)) {
    failed.push(`${label} absent — le zip n'a pas été décompressé à la racine.`);
  }
}

/* ══ A. Routes publiques ═══════════════════════════════════════════════ */

patch("app.tsx — routes légales publiques", F.appTsx, (s) => {
  if (s.includes("LegalPage")) return null;

  let out = s;

  const firstImport = out.match(/^import .*$/m);
  if (!firstImport) return undefined;
  out = out.replace(
    firstImport[0],
    `${firstImport[0]}\nimport LegalPage from "@/pages/legal";`,
  );

  const appFn = `function App() {
  return (
    <Provider>
      <Gate />
    </Provider>
  );
}`;
  if (!out.includes(appFn)) return undefined;

  out = out.replace(
    appFn,
    `function App() {
  return (
    <Provider>
      {/* ── Routes publiques ────────────────────────────────────────────────
          Montées AVANT <Gate />, qui renvoie l'écran de connexion dès qu'il
          n'y a pas de session.

          • Les mentions légales : § 5 DDG exige que l'Impressum soit
            « unmittelbar erreichbar » — joignable sans détour, donc sans
            connexion. Derrière un mur de connexion, l'obligation n'est pas
            remplie.

          • La réinitialisation du mot de passe : on arrive dessus DÉCONNECTÉ,
            par un lien reçu par e-mail. Placée dans la zone authentifiée, elle
            ne s'ouvrait jamais — le lien renvoyait à la page de connexion, et
            personne ne pouvait changer son mot de passe. */}
      <Switch>
        <Route path="/impressum">{() => <LegalPage doc="impressum" />}</Route>
        <Route path="/datenschutz">{() => <LegalPage doc="datenschutz" />}</Route>
        <Route path="/widerruf">{() => <LegalPage doc="widerruf" />}</Route>
        <Route path="/agb">{() => <LegalPage doc="agb" />}</Route>
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route>
          <Gate />
        </Route>
      </Switch>
    </Provider>
  );
}`,
  );

  // La route de réinitialisation faisait doublon dans la zone authentifiée.
  out = out.replace(
    /^\s*<Route path="\/reset-password" component=\{ResetPasswordPage\} \/>\n(?=\s*<Route path="\/" component=\{RootRedirect\} \/>)/m,
    "",
  );

  return out;
});

/* ══ B. Pied de page — écran de connexion (public) ═════════════════════ */

patch("login.tsx — liens légaux", F.login, (s) => {
  if (s.includes("LegalFooter")) return null;

  let out = s;

  const logoImp = out.match(/^import \{ Logo[^}]*\} from "@\/components\/logo";$/m);
  const anyImp = logoImp ?? out.match(/^import .*$/m);
  if (!anyImp) return undefined;
  out = out.replace(
    anyImp[0],
    `${anyImp[0]}\nimport { LegalFooter } from "@/components/legal-footer";`,
  );

  const anchor = `      </motion.div>
    </div>
  );
}`;
  if (!out.includes(anchor)) return undefined;

  return out.replace(
    anchor,
    `      </motion.div>

      {/* Sous la carte, pas dedans : ces liens ne font pas partie du
          formulaire, et doivent rester visibles sans le remplir. */}
      <LegalFooter className="absolute bottom-6 left-0 right-0 px-4" />
    </div>
  );
}`,
  );
});

/* ══ C. Pied de page — coquille de l'application ═══════════════════════ */

patch("layout.tsx — liens légaux", F.layout, (s) => {
  if (s.includes("LegalFooter")) return null;

  let out = s;

  const btnImp = `import { Button } from "@/components/ui/button";`;
  if (!out.includes(btnImp)) return undefined;
  out = out.replace(
    btnImp,
    `${btnImp}\nimport { LegalFooter } from "@/components/legal-footer";`,
  );

  const anchor = `        <main className="flex-1 pb-16 lg:pb-0">{children}</main>`;
  if (!out.includes(anchor)) return undefined;

  return out.replace(
    anchor,
    `        <main className="flex-1 pb-16 lg:pb-0">{children}</main>

        {/* « Ständig verfügbar » : depuis chaque page, y compris connecté. */}
        <footer className="border-border border-t px-4 py-5 pb-20 lg:pb-5">
          <LegalFooter />
        </footer>`,
  );
});

/* ══ D. `bun run legal` ════════════════════════════════════════════════ */

patch("package.json — script legal", F.rootPkg, (s) => {
  let pkg;
  try {
    pkg = JSON.parse(s);
  } catch {
    throw new Error("package.json illisible — ajoute le script à la main");
  }
  pkg.scripts ??= {};
  if (pkg.scripts.legal) return null;
  pkg.scripts.legal = "node check-legal.mjs";
  return JSON.stringify(pkg, null, 2) + "\n";
});

/* ══ Bilan ═════════════════════════════════════════════════════════════ */

console.log(`\n${ok} appliqué(s) · ${skipped} déjà fait(s) · ${failed.length} échec(s)`);

if (failed.length) {
  console.log("\n⚠️  À faire à la main :");
  for (const f of failed) console.log("   • " + f);
}

console.log(`
════════════════════════════════════════════════════════════════
  UN DÉFAUT DU LOT 1 EST CORRIGÉ AU PASSAGE
════════════════════════════════════════════════════════════════

  La page /reset-password était montée DANS la zone connectée. Le
  lien reçu par e-mail renvoyait donc à l'écran de connexion, et
  personne n'aurait pu changer son mot de passe. Elle est
  maintenant publique, comme elle aurait dû l'être.

════════════════════════════════════════════════════════════════

👉 Ensuite :

   bun run legal     ce qu'il te reste à compléter
   bun run verify
`);
