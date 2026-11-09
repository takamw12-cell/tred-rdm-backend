/**
 * Hochschulen techniques allemandes et leur Land.
 *
 * - La VALEUR enregistrée dans le profil (`profile.university`) reste le nom
 *   officiel en texte libre : la recherche de cours (Dashboard) la lit telle
 *   quelle, et une Hochschule absente de la liste reste possible.
 *   `findUniversity` relie ce texte libre à la liste (« RWTH », « KIT
 *   Karlsruhe », l'ancienne valeur « fhAachen »…).
 * - Logos (décision fondateur 2026-11-09, plus de drapeaux des Länder) :
 *   chaque établissement a son `domain` ; le logo est servi par NOTRE
 *   serveur (GET /api/logo/:domain, en cache), qui le récupère une fois —
 *   le navigateur de l'étudiant ne contacte jamais un tiers (RGPD). Rien
 *   n'est stocké dans le dépôt. Sans domaine ou sans logo : monogramme
 *   (`short`, sinon les initiales du nom).
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

export interface University {
  id: string;
  /** Nom officiel, enregistré tel quel dans le profil. */
  name: string;
  /** Monogramme affiché à la place du logo. */
  short: string;
  city: string;
  land: LandCode;
  /** Domaine officiel (« rwth-aachen.de ») : la source du logo. */
  domain: string;
  /** Autres façons de l'écrire (recherche, ancien texte libre). */
  aliases?: string[];
}

const U = (
  id: string,
  name: string,
  short: string,
  city: string,
  land: LandCode,
  domain: string,
  aliases: string[] = [],
): University => ({ id, name, short, city, land, domain, aliases });

export const UNIVERSITIES: University[] = [
  // Baden-Württemberg
  U("kit", "Karlsruher Institut für Technologie", "KIT", "Karlsruhe", "bw", "kit.edu", ["KIT Karlsruhe", "Uni Karlsruhe"]),
  U("uni-stuttgart", "Universität Stuttgart", "USTUTT", "Stuttgart", "bw", "uni-stuttgart.de", ["Uni Stuttgart"]),
  U("hka", "Hochschule Karlsruhe", "HKA", "Karlsruhe", "bw", "h-ka.de"),
  U("hs-esslingen", "Hochschule Esslingen", "HSE", "Esslingen", "bw", "hs-esslingen.de"),
  // Bayern
  U("tum", "Technische Universität München", "TUM", "München", "by", "tum.de", ["TU München", "TU Muenchen"]),
  U("hm", "Hochschule München", "HM", "München", "by", "hm.edu"),
  U("fau", "Friedrich-Alexander-Universität Erlangen-Nürnberg", "FAU", "Erlangen", "by", "fau.de", ["FAU Erlangen"]),
  U("unibw-m", "Universität der Bundeswehr München", "UniBw", "Neubiberg", "by", "unibw.de"),
  U("th-nuernberg", "Technische Hochschule Nürnberg", "THN", "Nürnberg", "by", "th-nuernberg.de", ["TH Nürnberg", "Ohm"]),
  U("oth-r", "OTH Regensburg", "OTH", "Regensburg", "by", "oth-regensburg.de"),
  // Berlin
  U("tu-berlin", "Technische Universität Berlin", "TUB", "Berlin", "be", "tu.berlin", ["TU Berlin"]),
  U("bht", "Berliner Hochschule für Technik", "BHT", "Berlin", "be", "bht-berlin.de", ["Beuth Hochschule"]),
  U("htw-berlin", "HTW Berlin", "HTW", "Berlin", "be", "htw-berlin.de"),
  // Brandenburg
  U("btu", "BTU Cottbus-Senftenberg", "BTU", "Cottbus", "bb", "b-tu.de"),
  U("th-brandenburg", "Technische Hochschule Brandenburg", "THB", "Brandenburg an der Havel", "bb", "th-brandenburg.de"),
  // Bremen
  U("uni-bremen", "Universität Bremen", "UB", "Bremen", "hb", "uni-bremen.de", ["Uni Bremen"]),
  U("hs-bremen", "Hochschule Bremen", "HSB", "Bremen", "hb", "hs-bremen.de"),
  // Hamburg
  U("tuhh", "Technische Universität Hamburg", "TUHH", "Hamburg", "hh", "tuhh.de", ["TU Hamburg"]),
  U("haw-hamburg", "HAW Hamburg", "HAW", "Hamburg", "hh", "haw-hamburg.de"),
  // Hessen
  U("tu-darmstadt", "Technische Universität Darmstadt", "TUDa", "Darmstadt", "he", "tu-darmstadt.de", ["TU Darmstadt"]),
  U("h-da", "Hochschule Darmstadt", "h_da", "Darmstadt", "he", "h-da.de"),
  U("uni-kassel", "Universität Kassel", "UNIK", "Kassel", "he", "uni-kassel.de"),
  U("frankfurt-uas", "Frankfurt University of Applied Sciences", "FRA-UAS", "Frankfurt am Main", "he", "frankfurt-university.de"),
  // Mecklenburg-Vorpommern
  U("uni-rostock", "Universität Rostock", "UR", "Rostock", "mv", "uni-rostock.de"),
  U("hs-wismar", "Hochschule Wismar", "HSW", "Wismar", "mv", "hs-wismar.de"),
  // Niedersachsen
  U("luh", "Leibniz Universität Hannover", "LUH", "Hannover", "ni", "uni-hannover.de", ["Uni Hannover"]),
  U("tu-bs", "Technische Universität Braunschweig", "TUBS", "Braunschweig", "ni", "tu-braunschweig.de", ["TU Braunschweig"]),
  U("tu-clausthal", "TU Clausthal", "TUCLZ", "Clausthal-Zellerfeld", "ni", "tu-clausthal.de"),
  U("hs-hannover", "Hochschule Hannover", "HsH", "Hannover", "ni", "hs-hannover.de"),
  // Nordrhein-Westfalen
  U("rwth", "RWTH Aachen", "RWTH", "Aachen", "nw", "rwth-aachen.de", ["RWTH Aachen University"]),
  U("fh-aachen", "FH Aachen", "FH AC", "Aachen", "nw", "fh-aachen.de", ["fhAachen", "Fachhochschule Aachen"]),
  U("tu-dortmund", "Technische Universität Dortmund", "TUDo", "Dortmund", "nw", "tu-dortmund.de", ["TU Dortmund"]),
  U("rub", "Ruhr-Universität Bochum", "RUB", "Bochum", "nw", "ruhr-uni-bochum.de"),
  U("ude", "Universität Duisburg-Essen", "UDE", "Duisburg", "nw", "uni-due.de"),
  U("th-koeln", "TH Köln", "THK", "Köln", "nw", "th-koeln.de", ["Technische Hochschule Köln"]),
  U("uni-paderborn", "Universität Paderborn", "UPB", "Paderborn", "nw", "uni-paderborn.de"),
  U("uni-siegen", "Universität Siegen", "USi", "Siegen", "nw", "uni-siegen.de"),
  // Rheinland-Pfalz
  U("rptu", "RPTU Kaiserslautern-Landau", "RPTU", "Kaiserslautern", "rp", "rptu.de", ["TU Kaiserslautern"]),
  U("hs-koblenz", "Hochschule Koblenz", "HSK", "Koblenz", "rp", "hs-koblenz.de"),
  // Saarland
  U("uds", "Universität des Saarlandes", "UdS", "Saarbrücken", "sl", "uni-saarland.de", ["Uni Saarland"]),
  U("htw-saar", "htw saar", "htw", "Saarbrücken", "sl", "htwsaar.de"),
  // Sachsen
  U("tu-dresden", "Technische Universität Dresden", "TUD", "Dresden", "sn", "tu-dresden.de", ["TU Dresden"]),
  U("tu-chemnitz", "Technische Universität Chemnitz", "TUC", "Chemnitz", "sn", "tu-chemnitz.de", ["TU Chemnitz"]),
  U("tu-freiberg", "TU Bergakademie Freiberg", "TUBAF", "Freiberg", "sn", "tu-freiberg.de"),
  // Sachsen-Anhalt
  U("ovgu", "Otto-von-Guericke-Universität Magdeburg", "OVGU", "Magdeburg", "st", "ovgu.de", ["Uni Magdeburg"]),
  U("h2", "Hochschule Magdeburg-Stendal", "h2", "Magdeburg", "st", "h2.de"),
  // Schleswig-Holstein
  U("cau", "Christian-Albrechts-Universität zu Kiel", "CAU", "Kiel", "sh", "uni-kiel.de", ["Uni Kiel"]),
  U("fh-kiel", "Fachhochschule Kiel", "FH Kiel", "Kiel", "sh", "fh-kiel.de"),
  // Thüringen
  U("tu-ilmenau", "Technische Universität Ilmenau", "TUIL", "Ilmenau", "th", "tu-ilmenau.de", ["TU Ilmenau"]),
  U("bauhaus", "Bauhaus-Universität Weimar", "BUW", "Weimar", "th", "uni-weimar.de"),
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

/** Les domaines dont le serveur accepte de servir le logo (liste fermée). */
export const LOGO_DOMAINS: ReadonlySet<string> = new Set(UNIVERSITIES.map((u) => u.domain));

/**
 * Monogramme d'un établissement absent de la liste (texte libre) : les
 * initiales des mots qui comptent, 4 lettres au plus — « Sorbonne
 * Université » → « SU », « Lycée Victor Hugo » → « LVH ». Vide → « TRED ».
 */
export function initialsOf(name: string | null | undefined): string {
  const SMALL = new Set(["de", "des", "du", "la", "le", "les", "der", "die", "das", "und", "et", "of", "the", "für", "zu", "am", "an", "d", "l"]);
  const words = (name ?? "")
    .split(/[\s\-–—/'’.,()]+/)
    .filter((w) => w && !SMALL.has(w.toLowerCase()));
  if (words.length === 0) return "TRED";
  // Un sigle déjà écrit (« RWTH », « HAW ») reste tel quel.
  if (words.length === 1) return /^[A-ZÄÖÜ0-9]{2,5}$/.test(words[0]) ? words[0] : words[0].slice(0, 2).toUpperCase();
  return words
    .slice(0, 4)
    .map((w) => w[0].toUpperCase())
    .join("");
}
