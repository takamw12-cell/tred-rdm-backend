/**
 * /admin n'appartient qu'au fondateur (décision du 12 nov. 2026).
 * Double protection, côté serveur : e-mail dans ADMIN_EMAILS ET rôle admin.
 * Sans session : 401 sur l'API. Tout autre compte : 404, jamais 403.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

process.env.DATABASE_URL ??= "file::memory:";
const { adminDenialStatus, adminWhitelist, isAdminAllowed, isAdminPath } = await import("../src/api/lib/admin-guard");

const SRC = join(import.meta.dir, "..", "src");
const lire = (f: string) => readFileSync(join(SRC, f), "utf8");
const FOUNDER = ["fondateur@tred.test"];
const admin = { email: "fondateur@tred.test", emailVerified: true, role: "admin", isActive: true };

describe("la liste blanche ADMIN_EMAILS", () => {
  test("virgules, espaces et casse sont tolérés", () => {
    expect(adminWhitelist(" Fondateur@TRED.test , second@tred.test ")).toEqual(["fondateur@tred.test", "second@tred.test"]);
  });

  test("vide, absente ou mal écrite : personne n'entre (fail closed)", () => {
    for (const raw of [undefined, "", "   ", ",,,", "pas-une-adresse", "*", "@", "a@b"]) {
      const liste = adminWhitelist(raw);
      expect(liste).toEqual([]);
      expect(isAdminAllowed(admin, liste, true)).toBe(false);
    }
  });
});

describe("la règle : e-mail ET rôle, les deux", () => {
  test("le fondateur entre", () => {
    expect(isAdminAllowed(admin, FOUNDER, true)).toBe(true);
    expect(isAdminAllowed({ ...admin, email: " Fondateur@Tred.Test " }, FOUNDER, true)).toBe(true);
  });

  test("un rôle admin sans l'e-mail : refusé", () => {
    expect(isAdminAllowed({ ...admin, email: "etudiant@uni.de" }, FOUNDER, true)).toBe(false);
  });

  test("l'e-mail sans le rôle admin : refusé", () => {
    for (const role of ["user", "", null, undefined, "founder", "ADMIN"]) {
      expect(isAdminAllowed({ ...admin, role }, FOUNDER, true)).toBe(false);
    }
  });

  test("l'e-mail doit être EXACT : ni préfixe, ni sous-adresse, ni domaine voisin", () => {
    for (const email of ["fondateur@tred.test.evil.org", "xfondateur@tred.test", "fondateur+1@tred.test", "fondateur@tred.tes", "", null]) {
      expect(isAdminAllowed({ ...admin, email }, FOUNDER, true)).toBe(false);
    }
  });

  test("compte bloqué : refusé ; adresse non confirmée : refusée quand le serveur vérifie les adresses", () => {
    expect(isAdminAllowed({ ...admin, isActive: false }, FOUNDER, true)).toBe(false);
    expect(isAdminAllowed({ ...admin, emailVerified: false }, FOUNDER, true)).toBe(false);
    expect(isAdminAllowed({ ...admin, emailVerified: false }, FOUNDER, false)).toBe(true);
  });
});

describe("ce que reçoit quelqu'un qui n'est pas admin", () => {
  test("sans session : 401 ; avec une session d'étudiant : 404, jamais 403", () => {
    expect(adminDenialStatus({ state: "anonymous" })).toBe(401);
    expect(adminDenialStatus({ state: "denied" })).toBe(404);
  });

  test("la page est gardée par le serveur, avant de servir quoi que ce soit", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/analytics")).toBe(true);
    expect(isAdminPath("/administration")).toBe(false);
    expect(isAdminPath("/dashboard")).toBe(false);
    const server = lire("__server.ts");
    const garde = server.indexOf("adminPageDenial(request)");
    expect(garde).toBeGreaterThan(0);
    // Avant les pages pré-rendues, les fichiers statiques et index.html.
    expect(garde).toBeLessThan(server.indexOf("getPrerenderedPath(url.pathname)"));
    expect(garde).toBeLessThan(server.indexOf("getStaticFilePath(url.pathname)"));
    expect(lire("api/lib/admin-guard.ts")).toContain("status: 404");
  });
});

/** Tous les fichiers .ts de l'API (sans les sauvegardes). */
function apiFiles(dir = join(SRC, "api")): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return apiFiles(p);
    return /\.ts$/.test(name) && !name.endsWith(".bak") ? [p] : [];
  });
}

describe("aucune route d'administration sans garde", () => {
  const files = apiFiles().map((p) => ({ p, src: readFileSync(p, "utf8") }));

  test("chaque route REST /api/admin/* commence par requireAdmin", () => {
    const routes: string[] = [];
    for (const { p, src } of files) {
      const re = /app\.(get|post|put|patch|delete)\(\s*["'`](\/api\/admin[^"'`]*)["'`]\s*,\s*async\s*\(c\)\s*=>\s*\{(?=([\s\S]{0,200}))/g;
      for (const m of src.matchAll(re)) {
        routes.push(m[2]!);
        const debut = m[3]!.trim();
        // La garde est la PREMIÈRE instruction, et son refus la deuxième.
        if (!/^const guard = await requireAdmin\(c\);\s*if \(!guard\.ok\) return c\.json\(/.test(debut)) {
          throw new Error(`route sans garde en tête : ${m[1]!.toUpperCase()} ${m[2]} (${p})`);
        }
      }
    }
    // La liste connue : en ajouter une oblige à passer par ce test.
    expect(routes.sort()).toEqual(["/api/admin/analytics", "/api/admin/queues", "/api/admin/reports", "/api/admin/reports/resolve", "/api/admin/session", "/api/admin/users", "/api/admin/users/access"]);
  });

  test("une route /api/admin déclarée autrement (sans garde lisible) fait échouer ce test", () => {
    for (const { p, src } of files) {
      // Tout chemin /api/admin passé en argument (app.get, app.all, app.use, app.route…).
      const declarees = (src.match(/\(\s*["'`]\/api\/admin[^"'`]*["'`]/g) ?? []).length;
      const gardees = (src.match(/app\.(get|post|put|patch|delete)\(\s*["'`]\/api\/admin[^"'`]*["'`]\s*,\s*async\s*\(c\)\s*=>\s*\{\s*const guard = await requireAdmin\(c\);/g) ?? []).length;
      if (declarees !== gardees) throw new Error(`${p} : ${declarees} chemin(s) /api/admin, ${gardees} gardé(s)`);
    }
  });

  test("requireAdmin et adminOnly passent tous deux par la même règle", () => {
    const index = lire("api/index.ts");
    expect(index).toContain("const check = await checkAdmin(c.req.raw.headers);");
    expect(index).not.toMatch(/status: 401 \| 403/);
    const mw = lire("api/middleware/auth.ts");
    expect(mw).toContain("const check = await checkAdmin(context.headers);");
    expect(mw).toContain('throw new ORPCError("NOT_FOUND")');
    // Plus aucune garde d'administration ne se contente du rôle.
    for (const { p, src } of files) {
      if (p.endsWith("admin-guard.ts")) continue;
      if (/role\s*[!=]==\s*"admin"/.test(src) && /requireAdmin|adminOnly\s*=/.test(src)) throw new Error(`${p} : garde d'administration fondée sur le rôle seul`);
    }
  });

  test("les données d'administration en oRPC sont derrière adminOnly", () => {
    expect(lire("api/routes/retention.ts")).toMatch(/overview: adminOnly\b/);
    expect(lire("api/routes/retention.ts")).toMatch(/setPaused: adminOnly\b/);
    expect(lire("api/routes/retention.ts")).toMatch(/preview: adminOnly\b/);
    expect(lire("api/routes/feedback.ts")).toMatch(/list: adminOnly\b/);
    expect(lire("api/routes/feedback.ts")).toMatch(/resolve: adminOnly\b/);
  });
});

describe("l'interface", () => {
  test("aucune page d'administration n'est montée avant le oui du serveur", () => {
    const app = lire("web/app.tsx");
    for (const page of ["AdminPage", "AdminAnalyticsPage", "AdminFeedbackPage", "AdminRetentionPage"]) {
      expect(app).toContain(`<AdminGate><${page} /></AdminGate>`);
      expect(app).not.toContain(`component={${page}}`);
    }
    expect(lire("web/components/admin-gate.tsx")).toContain('fetch("/api/admin/session"');
  });

  test("aucun lien vers /admin hors des pages d'administration, et aucune liste d'administrateurs dans le navigateur", () => {
    const web = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) return web(p);
        return /\.(ts|tsx)$/.test(name) ? [p] : [];
      });
    for (const p of web(join(SRC, "web"))) {
      const src = readFileSync(p, "utf8");
      expect(src.includes("ADMIN_EMAILS")).toBe(false);
      const file = p.replace(/\\/g, "/");
      if (/pages\/admin|components\/admin-gate|web\/app\.tsx$/.test(file)) continue;
      if (/["'`]\/admin(\/|["'`])/.test(src)) throw new Error(`lien vers /admin dans ${file}`);
    }
  });
});
