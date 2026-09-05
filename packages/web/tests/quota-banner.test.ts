import { describe, expect, test } from "bun:test";

/**
 * La règle d'affichage du bandeau de quota, isolée de React.
 *
 * Le composant `quota-banner.tsx` fait deux choses : décider QUOI dire, et le
 * dessiner. Seule la première est risquée — c'est elle qui, mal réglée, laisse
 * un étudiant dépenser son solde sans le savoir. Elle est donc testée ici,
 * telle qu'elle est écrite dans le composant.
 *
 * Si tu changes l'ordre des cas dans `QuotaBanner`, change-le aussi ici : le
 * test ne lit pas le composant, il verrouille la règle qu'il applique.
 */

const SEUIL = 0.2;

type Etat = "rien" | "alerte" | "credits" | "vide";

function bandeau(
  monthlyRemaining: number,
  monthlyLimit: number,
  purchasedCredits: number,
): Etat {
  if (monthlyRemaining <= 0 && purchasedCredits > 0) return "credits";
  if (monthlyRemaining <= 0 && purchasedCredits <= 0) return "vide";
  const proche = monthlyLimit > 0 && monthlyRemaining / monthlyLimit <= SEUIL;
  return proche ? "alerte" : "rien";
}

describe("ce que voit un étudiant sur le forfait gratuit (20 questions)", () => {
  test("au début du mois, rien ne s'affiche", () => {
    expect(bandeau(20, 20, 0)).toBe("rien");
    expect(bandeau(9, 20, 0)).toBe("rien");
  });

  test("à quatre questions restantes, on prévient", () => {
    expect(bandeau(4, 20, 0)).toBe("alerte");
  });

  test("à cinq, pas encore — un quart du forfait, c'est trop tôt", () => {
    expect(bandeau(5, 20, 0)).toBe("rien");
  });

  test("à zéro sans crédits, le mur est annoncé avant d'écrire", () => {
    expect(bandeau(0, 20, 0)).toBe("vide");
  });
});

describe("le cas qui coûte de l'argent en silence", () => {
  // C'est LE défaut que ce bandeau corrige : `consume()` bascule sur les
  // crédits achetés sans rien dire. L'annonce doit précéder la dépense.
  test("quota épuisé mais du solde : on le dit avant la question suivante", () => {
    expect(bandeau(0, 20, 12)).toBe("credits");
  });

  test("et le message de solde prime sur l'alerte de fin de forfait", () => {
    // Les deux conditions sont vraies à zéro ; l'ordre décide, et c'est
    // « je dépense ton argent » qui doit gagner.
    expect(bandeau(0, 500, 3)).toBe("credits");
  });

  test("avec du solde mais du quota restant, rien ne s'affiche encore", () => {
    expect(bandeau(200, 500, 12)).toBe("rien");
  });
});

describe("le forfait payant (500 questions)", () => {
  test("à 100 restantes, on prévient", () => {
    expect(bandeau(100, 500, 0)).toBe("alerte");
  });

  test("à 101, non", () => {
    expect(bandeau(101, 500, 0)).toBe("rien");
  });
});

describe("les cas dégénérés ne doivent rien casser", () => {
  test("une limite nulle ne déclenche pas de division par zéro", () => {
    expect(bandeau(3, 0, 0)).toBe("rien");
  });

  test("un compteur négatif compte comme épuisé", () => {
    expect(bandeau(-2, 20, 0)).toBe("vide");
    expect(bandeau(-2, 20, 5)).toBe("credits");
  });
});
