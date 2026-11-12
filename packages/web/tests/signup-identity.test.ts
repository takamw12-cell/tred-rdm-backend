/**
 * Chantier « identité » du 12 nov. 2026 :
 *  - le nom complet est obligatoire à l'inscription (formulaire ET serveur) ;
 *  - le profil local est vidé à la déconnexion ;
 *  - il est relu sur le serveur à la connexion.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isValidSignupName } from "../src/api/lib/display-name";
import { EMPTY_PROFILE, useUserStore } from "../src/web/stores/user";

const lire = (f: string) => readFileSync(join(import.meta.dir, "..", "src", f), "utf8");

describe("nom complet obligatoire à l'inscription", () => {
  test("un vrai nom passe", () => {
    for (const n of ["Anna Schmidt", "Li Wu", "Jörg", "  Lena   Meyer  ", "محمد علي"]) {
      expect(isValidSignupName(n, "x@uni.de")).toBe(true);
    }
  });

  test("vide, espaces, une lettre, chiffres seuls ou e-mail : refusé", () => {
    for (const n of ["", "   ", "A", "12345", "--", "lena@uni.de", null, undefined]) {
      expect(isValidSignupName(n, "lena@uni.de")).toBe(false);
    }
  });

  test("le formulaire ne remplace plus un nom vide par le début de l'e-mail", () => {
    const login = lire("web/pages/login.tsx");
    expect(login).toContain("isValidSignupName(name, email)");
    expect(login).not.toContain("emailLocalPart");
    expect(login).toContain('t("auth.nameRequired")');
  });

  test("le serveur refuse aussi une inscription sans nom", () => {
    const auth = lire("api/auth.ts");
    expect(auth).toContain('ctx.path !== "/sign-up/email"');
    expect(auth).toContain("isValidSignupName(name, email)");
    expect(auth).toContain("NAME_REQUIRED");
  });

  test("le message existe dans les douze langues", () => {
    for (const l of ["de", "en", "fr", "es", "it", "pt", "ru", "ar", "hi", "bn", "ja", "zh"]) {
      expect(lire(`web/i18n/messages/${l}.ts`)).toContain("nameRequired:");
    }
  });
});

describe("déconnexion", () => {
  test("reset() vide le profil, le plan et le propriétaire", () => {
    useUserStore.setState({
      onboarded: true,
      ownerId: "u-1",
      plan: "premium",
      profile: { ...EMPTY_PROFILE, firstName: "Anna", lastName: "Schmidt", email: "anna@uni.de", degree: "Maschinenbau" },
    });
    useUserStore.getState().reset();
    const s = useUserStore.getState();
    expect(s.profile).toEqual(EMPTY_PROFILE);
    expect(s.ownerId).toBeNull();
    expect(s.onboarded).toBe(false);
    expect(s.plan).toBe("free");
  });

  test("la déconnexion et la suppression du compte passent par le nettoyage local", () => {
    const out = lire("web/lib/sign-out.ts");
    expect(out).toContain("useUserStore.getState().reset()");
    expect(out).toContain("forgetProfile()");
    expect(out).toContain("qc.clear()");
    expect(lire("web/components/sidebar.tsx")).toContain("signOutEverywhere(qc)");
    expect(lire("web/components/sidebar.tsx")).not.toContain("authClient.signOut()");
    expect(lire("web/pages/settings.tsx")).toContain("clearLocalAccount()");
  });

  test("à la connexion, le profil est relu sur le serveur", () => {
    const app = lire("web/app.tsx");
    expect(app).toContain("hydrateProfile(userId)");
    const sync = lire("web/lib/profile-sync.ts");
    expect(sync).toContain("client.account.getProfile()");
    expect(sync).toContain("export function forgetProfile()");
  });
});
