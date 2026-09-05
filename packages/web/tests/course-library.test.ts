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

describe("qui a le droit de lire quoi", () => {
  const MOI = "u-moi";
  const AUTRE = "u-autre";
  const MON_COURS = ["c-elektro"];

  const prive = (userId: string) => ({
    userId,
    courseId: null,
    visibility: "private",
  });
  const partage = (userId: string, courseId: string) => ({
    userId,
    courseId,
    visibility: "course",
  });

  test("mon document privé : oui", () => {
    expect(canRead(prive(MOI), MOI, MON_COURS)).toBe(true);
  });

  test("le document privé d'un autre : NON", () => {
    expect(canRead(prive(AUTRE), MOI, MON_COURS)).toBe(false);
  });

  test("le document qu'un autre a partagé dans mon cours : oui", () => {
    // Tout l'objet de la bibliothèque : le Skript déposé par quelqu'un d'autre.
    expect(canRead(partage(AUTRE, "c-elektro"), MOI, MON_COURS)).toBe(true);
  });

  test("un document partagé dans un cours que je NE suis PAS : non", () => {
    expect(canRead(partage(AUTRE, "c-thermo"), MOI, MON_COURS)).toBe(false);
  });

  test("un étudiant sans aucun cours ne voit que les siens", () => {
    expect(canRead(partage(AUTRE, "c-elektro"), MOI, [])).toBe(false);
    expect(canRead(prive(MOI), MOI, [])).toBe(true);
  });
});

describe("le retrait du partage doit être immédiat et total", () => {
  const MOI = "u-moi";
  const AUTRE = "u-autre";
  const COURS = ["c-elektro"];

  test("retiré, il redevient invisible même en gardant son rattachement", () => {
    // `unshare` remet visibility à "private" SANS effacer courseId, pour
    // pouvoir le remettre en ligne d'un geste. Si la lecture ne regardait que
    // courseId, le retrait n'aurait aucun effet — et un retrait demandé par un
    // professeur serait sans valeur.
    const retire = { userId: AUTRE, courseId: "c-elektro", visibility: "private" };
    expect(canRead(retire, MOI, COURS)).toBe(false);
  });

  test("mais son propriétaire continue de le lire", () => {
    const retire = { userId: MOI, courseId: "c-elektro", visibility: "private" };
    expect(canRead(retire, MOI, COURS)).toBe(true);
  });

  test("une visibilité inconnue ne donne aucun droit", () => {
    // Défense en profondeur : si une valeur inattendue arrive un jour dans
    // cette colonne, elle doit fermer, pas ouvrir.
    const bizarre = { userId: AUTRE, courseId: "c-elektro", visibility: "public" };
    expect(canRead(bizarre, MOI, COURS)).toBe(false);
  });
});
