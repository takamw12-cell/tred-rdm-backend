import { describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??= "file::memory:";
const { normalizeCourseKey } = await import("../src/api/routes/courses");
const { canRead } = await import("../src/api/lib/visible-documents");

/**
 * Deux règles, et une seule des deux peut coûter cher.
 *
 * `normalizeCourseKey` décide si le partage a lieu : mal réglée, chaque
 * étudiant crée son propre cours d'un membre et rien n'est partagé. C'est un
 * échec visible, qui se corrige.
 *
 * `canRead` décide qui lit quoi. Mal réglée, chaque étudiant lit les documents
 * privés de tous les autres — un incident qui ne se voit pas de l'intérieur,
 * ne produit aucune erreur, et ne se découvre que par quelqu'un d'autre. C'est
 * pour cette seconde règle que ce fichier existe.
 */

describe("deux étudiants doivent atterrir dans le même cours", () => {
  const attendu = normalizeCourseKey("FH Aachen", "Elektrotechnik 2");

  test("la casse ne compte pas", () => {
    expect(normalizeCourseKey("fh aachen", "elektrotechnik 2")).toBe(attendu);
  });

  test("les espaces en trop non plus", () => {
    expect(normalizeCourseKey("FH  Aachen", "Elektrotechnik  2")).toBe(attendu);
  });

  test("ni la ponctuation", () => {
    expect(normalizeCourseKey("FH-Aachen", "Elektrotechnik-2")).toBe(attendu);
  });

  test("ni les accents et les umlauts", () => {
    // « Höhere Mathematik » tapé sans umlaut par quelqu'un pressé.
    expect(normalizeCourseKey("FH Aachen", "Höhere Mathematik")).toBe(
      normalizeCourseKey("FH Aachen", "Hohere Mathematik"),
    );
  });
});

describe("ce qui doit RESTER deux cours différents", () => {
  test("deux matières distinctes", () => {
    expect(normalizeCourseKey("FH Aachen", "Elektrotechnik 2")).not.toBe(
      normalizeCourseKey("FH Aachen", "Thermodynamik 2"),
    );
  });

  test("le même nom dans deux universités", () => {
    expect(normalizeCourseKey("FH Aachen", "Elektrotechnik 2")).not.toBe(
      normalizeCourseKey("RWTH Aachen", "Elektrotechnik 2"),
    );
  });

  test("le chiffre romain n'est pas fusionné avec le chiffre arabe", () => {
    // Décision assumée : comprendre « II » = « 2 » dans un nom libre
    // demanderait de deviner, et fusionner à tort deux cours différents est
    // pire que d'en laisser deux à fusionner à la main.
    expect(normalizeCourseKey("FH Aachen", "Elektrotechnik II")).not.toBe(
      normalizeCourseKey("FH Aachen", "Elektrotechnik 2"),
    );
  });
});

/**
 * Depuis le 12 nov. 2026, le partage est fermé (UrhG) : un document n'est
 * lisible que par son propriétaire, quelles que soient les valeurs restées
 * dans `courseId` et `visibility`.
 */
describe("qui a le droit de lire quoi : le propriétaire, et personne d'autre", () => {
  const MOI = "u-moi";
  const AUTRE = "u-autre";
  const MON_COURS = ["c-elektro"];

  test("mon document privé : oui", () => {
    expect(canRead({ userId: MOI, courseId: null, visibility: "private" }, MOI, MON_COURS)).toBe(true);
  });

  test("le document privé d'un autre : NON", () => {
    expect(canRead({ userId: AUTRE, courseId: null, visibility: "private" }, MOI, MON_COURS)).toBe(false);
  });

  test("un document resté « partagé » dans mon ancien cours : NON", () => {
    // La ligne que la migration n'aurait pas encore repassée en "private".
    expect(canRead({ userId: AUTRE, courseId: "c-elektro", visibility: "course" }, MOI, MON_COURS)).toBe(false);
  });

  test("mon propre document resté « partagé » : je le lis toujours", () => {
    expect(canRead({ userId: MOI, courseId: "c-elektro", visibility: "course" }, MOI, [])).toBe(true);
  });

  test("une visibilité inconnue ne donne aucun droit", () => {
    expect(canRead({ userId: AUTRE, courseId: "c-elektro", visibility: "public" }, MOI, MON_COURS)).toBe(false);
  });

  test("la requête SQL ne regarde plus que le propriétaire", async () => {
    const src = await Bun.file(new URL("../src/api/lib/visible-documents.ts", import.meta.url)).text();
    const corps = src.slice(src.indexOf("export function visibleDocuments"));
    expect(corps).toContain("return eq(document.userId, userId);");
    expect(corps).not.toContain("inArray");
    expect(corps).not.toContain("document.visibility");
  });
});

describe("les routes de partage sont fermées", () => {
  test("cours, semestre par code et base partagée répondent « Feature disabled »", async () => {
    const lire = (f: string) => Bun.file(new URL(f, import.meta.url)).text();
    const cours = await lire("../src/api/routes/courses.ts");
    for (const route of ["mine", "search", "create", "join", "leave", "documents", "shareable", "share", "unshare"]) {
      expect(cours).toContain(`  ${route}: ferme,`);
    }
    expect(cours).not.toContain("courseMember");
    const semestres = await lire("../src/api/routes/semesters.ts");
    for (const route of ["shareCreate", "shareInfo", "shareRedeem"]) {
      expect(semestres).toContain(`${route}: authed.handler(() => featureDisabled())`);
    }
    expect(await lire("../src/api/lib/feature-disabled.ts")).toContain('new ORPCError("FORBIDDEN", { message: FEATURE_DISABLED })');
  });

  test("plus personne n'est membre d'un cours", async () => {
    const { myCourseIds } = await import("../src/api/routes/courses");
    expect(await myCourseIds("u-moi")).toEqual([]);
  });
});
