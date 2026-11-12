/**
 * Un nouvel étudiant ne voit JAMAIS le nom de quelqu'un d'autre.
 *
 * Régression de novembre 2026 : le profil par défaut du navigateur était un
 * profil de démonstration (« Wilfred Takam », plan « founder »), affiché dans
 * la barre latérale et le tableau de bord de tout nouveau compte.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { emailLocalPart, realName, resolveIdentity } from "../src/api/lib/display-name";
import { EMPTY_PROFILE, claimProfile, migrateUserState, useUserStore } from "../src/web/stores/user";

const FORBIDDEN = /rached|takam|wilfred|edwin/i;

describe("nom affiché", () => {
  test("le nom du compte s'affiche tel quel", () => {
    const id = resolveIdentity({ name: "Anna Schmidt", email: "anna@uni.de", fallback: "Student" });
    expect(id).toEqual({ full: "Anna Schmidt", first: "Anna", initials: "AS", needsName: false });
  });

  test("sans nom : la partie de l'e-mail avant le @", () => {
    for (const name of ["", "   ", null, undefined]) {
      const id = resolveIdentity({ name, email: "lena.meyer@rwth-aachen.de", fallback: "Student" });
      expect(id.full).toBe("lena.meyer");
      expect(id.first).toBe("lena.meyer");
      expect(id.initials).toBe("LM");
      expect(id.needsName).toBe(true);
    }
  });

  test("un « nom » qui est l'e-mail (anciennes inscriptions) n'est pas affiché en entier", () => {
    const id = resolveIdentity({ name: "Lena@Uni.de", email: "lena@uni.de", fallback: "Student" });
    expect(id.full).toBe("lena");
    expect(realName("someone@else.org", "lena@uni.de")).toBe("");
  });

  test("ni nom ni e-mail : le mot traduit", () => {
    expect(resolveIdentity({ name: "", email: "", fallback: "Étudiant" }).full).toBe("Étudiant");
    expect(resolveIdentity({ fallback: "Student" }).first).toBe("Student");
    expect(emailLocalPart("pas-un-email")).toBe("");
  });

  test("le nom de l'onboarding ne sert que s'il n'y a pas de nom de compte", () => {
    expect(resolveIdentity({ name: "", email: "a@b.de", profileName: "Ali Kaya", fallback: "S" }).full).toBe("Ali Kaya");
    expect(resolveIdentity({ name: "Ali K.", email: "a@b.de", profileName: "Autre Nom", fallback: "S" }).full).toBe("Ali K.");
  });

  test("aucune combinaison ne produit un nom codé en dur", () => {
    const names = ["", null, undefined, "x@y.de"];
    const emails = ["", null, undefined, "neu@uni.de"];
    for (const name of names) for (const email of emails) {
      const id = resolveIdentity({ name, email, profileName: " ", fallback: "Student" });
      expect(`${id.full} ${id.first} ${id.initials}`).not.toMatch(FORBIDDEN);
      expect(["neu", "Student"]).toContain(id.full);
    }
  });
});

describe("profil local du navigateur", () => {
  test("le profil par défaut est vide, le plan par défaut est « free »", () => {
    const s = useUserStore.getState();
    expect(s.profile).toEqual(EMPTY_PROFILE);
    expect(Object.values(s.profile).join("")).toBe("");
    expect(s.plan).toBe("free");
    expect(s.ownerId).toBeNull();
  });

  const demo = {
    onboarded: false,
    plan: "founder" as const,
    germanMode: true,
    ownerId: null,
    profile: { ...EMPTY_PROFILE, firstName: "Wilfred", lastName: "Takam", email: "wilfred@aerostudy.ai", degree: "Luft- und Raumfahrttechnik" },
  };

  test("l'ancien profil de démonstration est effacé du localStorage", () => {
    const m = migrateUserState(demo);
    expect(m.profile.firstName).toBe("");
    expect(m.profile.lastName).toBe("");
    expect(m.profile.email).toBe("");
    expect(m.plan).toBe("free");
    // Le réglage de filière, lui, reste : le fond d'écran ne change pas.
    expect(m.profile.degree).toBe("Luft- und Raumfahrttechnik");
  });

  test("un autre compte sur le même appareil repart d'un profil vide", () => {
    const anna = { ...demo, onboarded: true, ownerId: "anna", plan: "premium" as const, profile: { ...EMPTY_PROFILE, firstName: "Anna", lastName: "Schmidt", email: "anna@uni.de", degree: "Medizin" } };
    const next = claimProfile(anna, "ben", "ben@uni.de");
    expect(next.profile).toEqual(EMPTY_PROFILE);
    expect(next.onboarded).toBe(false);
    expect(next.plan).toBe("free");
    expect(next.ownerId).toBe("ben");
    // Le même compte garde tout.
    expect(claimProfile(anna, "anna", "anna@uni.de")).toBe(anna);
  });

  test("profil sans propriétaire : le nom n'est gardé que si l'e-mail est celui du compte", () => {
    const old = { ...demo, profile: { ...EMPTY_PROFILE, firstName: "Anna", lastName: "Schmidt", email: "Anna@uni.de", degree: "Medizin" } };
    expect(claimProfile(old, "anna", "anna@uni.de").profile.firstName).toBe("Anna");
    const other = claimProfile(old, "ben", "ben@uni.de");
    expect(other.profile.firstName).toBe("");
    expect(other.profile.email).toBe("");
    expect(other.profile.degree).toBe("Medizin");
  });
});

describe("aucun nom en dur dans l'interface", () => {
  const root = join(import.meta.dir, "../src/web");
  // Les mentions légales (Impressum, AGB) nomment l'éditeur : c'est la loi.
  const allowed = new Set([join(root, "data/legal.ts")]);
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f)) files.push(p);
    }
  };
  walk(root);

  test("aucun fichier de l'interface ne contient le nom du fondateur", () => {
    // Seule exception : la ligne qui reconnaît l'ancien profil de démonstration pour l'effacer.
    const clean = (f: string) =>
      readFileSync(f, "utf8")
        .split("\n")
        .filter((line) => !line.includes("LEGACY_DEMO_EMAIL ="))
        .join("\n");
    const hits = files.filter((f) => !allowed.has(f) && FORBIDDEN.test(clean(f)));
    expect(hits).toEqual([]);
  });

  test("barre latérale et tableau de bord lisent le nom dans la session", () => {
    for (const f of ["components/sidebar.tsx", "pages/dashboard.tsx"]) {
      const src = readFileSync(join(root, f), "utf8");
      expect(src).toContain("useIdentity()");
      expect(src).not.toMatch(/profile\.(firstName|lastName)/);
    }
  });
});
