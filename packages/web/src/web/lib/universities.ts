/**
 * Hochschulen techniques allemandes et leur Land.
 *
 * - La VALEUR enregistrée dans le profil (`profile.university`) reste le nom
 *   officiel en texte libre : la recherche de cours (Dashboard) la lit telle
 *   quelle, et une Hochschule absente de la liste reste possible.
 *   `findUniversity` relie ce texte libre à la liste (« RWTH », « KIT
 *   Karlsruhe », l'ancienne valeur « fhAachen »…).
 * - Drapeaux : SVG du domaine public dans public/flags/ (voir CREDITS.md).
 *   `flag-icons` n'a aucun Land allemand (vérifié, v7.6.0) — d'où ces fichiers.
 * - Logos : NON repris (marques protégées). Monogramme `short` à la place.
 *
 * Module pur, testé dans tests/universities.test.ts.
 */

export type LandCode =
  | "bw" | "by" | "be" | "bb" | "hb" | "hh" | "he" | "mv"
  | "ni" | "nw" | "rp" | "sl" | "sn" | "st" | "sh" | "th";

export const BUNDESLAENDER: Record<LandCode, string> = {
  bw: "Baden-Württemberg",
  by: "Bayern",
  be: "Berlin",
  bb: "Brandenburg",
  hb: "Bremen",
  hh: "Hamburg",
  he: "Hessen",
  mv: "Mecklenburg-Vorpommern",
  ni: "Niedersachsen",
  nw: "Nordrhein-Westfalen",
  rp: "Rheinland-Pfalz",
  sl: "Saarland",
  sn: "Sachsen",
  st: "Sachsen-Anhalt",
  sh: "Schleswig-Holstein",
  th: "Thüringen",
};

/** « de-nw » — le code ISO 3166-2 en minuscules, comme le nom du fichier. */
export const flagCode = (land: LandCode) => `de-${land}`;
export const flagUrl = (land: LandCode) => `/flags/${flagCode(land)}.svg`;

export interface University {
  id: string;
  /** Nom officiel, enregistré tel quel dans le profil. */
  name: string;
  /** Monogramme affiché à la place du logo. */
  short: string;
  city: string;
  land: LandCode;
  /** Autres façons de l'écrire (recherche, ancien texte libre). */
  aliases?: string[];
}

const U = (id: string, name: string, short: string, city: string, land: LandCode, aliases: string[] = []): University => ({
  id, name, short, city, land, aliases,
});

export const UNIVERSITIES: University[] = [
  // Baden-Württemberg
  U("kit", "Karlsruher Institut für Technologie", "KIT", "Karlsruhe", "bw", ["KIT Karlsruhe", "Uni Karlsruhe"]),
  U("uni-stuttgart", "Universität Stuttgart", "USTUTT", "Stuttgart", "bw", ["Uni Stuttgart"]),
  U("hka", "Hochschule Karlsruhe", "HKA", "Karlsruhe", "bw"),
  U("hs-esslingen", "Hochschule Esslingen", "HSE", "Esslingen", "bw"),
  // Bayern
  U("tum", "Technische Universität München", "TUM", "München", "by", ["TU München", "TU Muenchen"]),
  U("hm", "Hochschule München", "HM", "München", "by"),
  U("fau", "Friedrich-Alexander-Universität Erlangen-Nürnberg", "FAU", "Erlangen", "by", ["FAU Erlangen"]),
  U("unibw-m", "Universität der Bundeswehr München", "UniBw", "Neubiberg", "by"),
  U("th-nuernberg", "Technische Hochschule Nürnberg", "THN", "Nürnberg", "by", ["TH Nürnberg", "Ohm"]),
  U("oth-r", "OTH Regensburg", "OTH", "Regensburg", "by"),
  // Berlin
  U("tu-berlin", "Technische Universität Berlin", "TUB", "Berlin", "be", ["TU Berlin"]),
  U("bht", "Berliner Hochschule für Technik", "BHT", "Berlin", "be", ["Beuth Hochschule"]),
  U("htw-berlin", "HTW Berlin", "HTW", "Berlin", "be"),
  // Brandenburg
  U("btu", "BTU Cottbus-Senftenberg", "BTU", "Cottbus", "bb"),
  U("th-brandenburg", "Technische Hochschule Brandenburg", "THB", "Brandenburg an der Havel", "bb"),
  // Bremen
  U("uni-bremen", "Universität Bremen", "UB", "Bremen", "hb", ["Uni Bremen"]),
  U("hs-bremen", "Hochschule Bremen", "HSB", "Bremen", "hb"),
  // Hamburg
  U("tuhh", "Technische Universität Hamburg", "TUHH", "Hamburg", "hh", ["TU Hamburg"]),
  U("haw-hamburg", "HAW Hamburg", "HAW", "Hamburg", "hh"),
  // Hessen
  U("tu-darmstadt", "Technische Universität Darmstadt", "TUDa", "Darmstadt", "he", ["TU Darmstadt"]),
  U("h-da", "Hochschule Darmstadt", "h_da", "Darmstadt", "he"),
  U("uni-kassel", "Universität Kassel", "UNIK", "Kassel", "he"),
  U("frankfurt-uas", "Frankfurt University of Applied Sciences", "FRA-UAS", "Frankfurt am Main", "he"),
  // Mecklenburg-Vorpommern
  U("uni-rostock", "Universität Rostock", "UR", "Rostock", "mv"),
  U("hs-wismar", "Hochschule Wismar", "HSW", "Wismar", "mv"),
  // Niedersachsen
  U("luh", "Leibniz Universität Hannover", "LUH", "Hannover", "ni", ["Uni Hannover"]),
  U("tu-bs", "Technische Universität Braunschweig", "TUBS", "Braunschweig", "ni", ["TU Braunschweig"]),
  U("tu-clausthal", "TU Clausthal", "TUCLZ", "Clausthal-Zellerfeld", "ni"),
  U("hs-hannover", "Hochschule Hannover", "HsH", "Hannover", "ni"),
  // Nordrhein-Westfalen
  U("rwth", "RWTH Aachen", "RWTH", "Aachen", "nw", ["RWTH Aachen University"]),
  U("fh-aachen", "FH Aachen", "FH AC", "Aachen", "nw", ["fhAachen", "Fachhochschule Aachen"]),
  U("tu-dortmund", "Technische Universität Dortmund", "TUDo", "Dortmund", "nw", ["TU Dortmund"]),
  U("rub", "Ruhr-Universität Bochum", "RUB", "Bochum", "nw"),
  U("ude", "Universität Duisburg-Essen", "UDE", "Duisburg", "nw"),
  U("th-koeln", "TH Köln", "THK", "Köln", "nw", ["Technische Hochschule Köln"]),
  U("uni-paderborn", "Universität Paderborn", "UPB", "Paderborn", "nw"),
  U("uni-siegen", "Universität Siegen", "USi", "Siegen", "nw"),
  // Rheinland-Pfalz
  U("rptu", "RPTU Kaiserslautern-Landau", "RPTU", "Kaiserslautern", "rp", ["TU Kaiserslautern"]),
  U("hs-koblenz", "Hochschule Koblenz", "HSK", "Koblenz", "rp"),
  // Saarland
  U("uds", "Universität des Saarlandes", "UdS", "Saarbrücken", "sl", ["Uni Saarland"]),
  U("htw-saar", "htw saar", "htw", "Saarbrücken", "sl"),
  // Sachsen
  U("tu-dresden", "Technische Universität Dresden", "TUD", "Dresden", "sn", ["TU Dresden"]),
  U("tu-chemnitz", "Technische Universität Chemnitz", "TUC", "Chemnitz", "sn", ["TU Chemnitz"]),
  U("tu-freiberg", "TU Bergakademie Freiberg", "TUBAF", "Freiberg", "sn"),
  // Sachsen-Anhalt
  U("ovgu", "Otto-von-Guericke-Universität Magdeburg", "OVGU", "Magdeburg", "st", ["Uni Magdeburg"]),
  U("h2", "Hochschule Magdeburg-Stendal", "h2", "Magdeburg", "st"),
  // Schleswig-Holstein
  U("cau", "Christian-Albrechts-Universität zu Kiel", "CAU", "Kiel", "sh", ["Uni Kiel"]),
  U("fh-kiel", "Fachhochschule Kiel", "FH Kiel", "Kiel", "sh"),
  // Thüringen
  U("tu-ilmenau", "Technische Universität Ilmenau", "TUIL", "Ilmenau", "th", ["TU Ilmenau"]),
  U("bauhaus", "Bauhaus-Universität Weimar", "BUW", "Weimar", "th"),
];

/** Minuscules, sans accents ni ponctuation : « TU München » → « tumunchen ». */
export function normalizeUni(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** La Hochschule de la liste correspondant au texte libre du profil, sinon null. */
export function findUniversity(text: string | null | undefined): University | null {
  const key = normalizeUni(text ?? "");
  if (key.length < 2) return null;
  return (
    UNIVERSITIES.find((u) =>
      [u.id, u.name, u.short, ...(u.aliases ?? [])].some((v) => normalizeUni(v) === key),
    ) ?? null
  );
}

/** Filtre pour la recherche du sélecteur : nom, sigle, ville, Land, alias. */
export function searchUniversities(query: string): University[] {
  const q = normalizeUni(query);
  if (!q) return UNIVERSITIES;
  return UNIVERSITIES.filter((u) =>
    [u.name, u.short, u.city, BUNDESLAENDER[u.land], ...(u.aliases ?? [])].some((v) => normalizeUni(v).includes(q)),
  );
}

/** Groupées par Land (ordre alphabétique des Länder), pour la liste. */
export function groupByLand(list: University[]): Array<{ land: LandCode; items: University[] }> {
  const groups = new Map<LandCode, University[]>();
  for (const u of list) groups.set(u.land, [...(groups.get(u.land) ?? []), u]);
  return [...groups.entries()]
    .sort(([a], [b]) => BUNDESLAENDER[a].localeCompare(BUNDESLAENDER[b], "de"))
    .map(([land, items]) => ({ land, items }));
}
