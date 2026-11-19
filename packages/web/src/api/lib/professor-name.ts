/**
 * « Dein Professor » (19 nov. 2026) : le prénom que l'étudiant donne à son
 * professeur. Règles pures, partagées par le serveur (qui décide) et
 * l'interface (qui prévient pendant la saisie).
 *
 * Ce nom s'affiche dans le Hörsaal et entre dans le prompt du tuteur ; il est
 * donc strictement borné :
 *   · 2 à 24 caractères, lettres (tous alphabets), espaces, point, tiret,
 *     apostrophe — rien qui puisse fermer une phrase du prompt ou porter une
 *     consigne (pas de chiffres, de deux-points, de guillemets, de crochets) ;
 *   · refus des marques, des célébrités et des personnages connus (règle du
 *     fondateur : TRED est commercial, aucun nom ni signe distinctif d'autrui),
 *     y compris écrits en « l33t », avec accents ou collés à un titre ;
 *   · refus des noms qui imitent l'équipe (« Admin », « Support », « TRED »)
 *     et des grossièretés courantes.
 * La liste n'est pas exhaustive : elle arrête les cas évidents. Un signalement
 * reste possible ; le fondateur peut l'allonger ici.
 */

export const PROFESSOR_NAME_MIN = 2;
export const PROFESSOR_NAME_MAX = 24;

export type ProfessorNameRefusal = "too_short" | "too_long" | "characters" | "reserved";
export type ProfessorNameCheck = { ok: true; name: string } | { ok: false; reason: ProfessorNameRefusal };

/** Titres permis devant le prénom ; ignorés pour la comparaison. */
const TITLES = new Set(["prof", "professor", "professorin", "professeur", "profesor", "profesora", "dr", "doktor", "docteur", "sensei", "herr", "frau", "mr", "mrs", "ms", "mme", "m"]);

/**
 * Mots refusés (comparés en minuscules, sans accents, après décodage « l33t »).
 * Un mot de 6 lettres ou plus est aussi refusé à l'intérieur d'un mot
 * (« Einsteinchen ») ; les plus courts seulement en mot entier (« Meta » oui,
 * « Metallica »… est aussi refusé, mais « Metin » passe).
 */
const BLOCKED_WORDS = [
  // Assistants et entreprises d'IA
  "chatgpt", "openai", "gpt", "claude", "anthropic", "gemini", "bard", "copilot", "siri", "alexa", "cortana", "grok", "mistral", "deepseek", "perplexity",
  // Marques et entreprises
  "google", "apple", "microsoft", "amazon", "tesla", "nike", "adidas", "puma", "cocacola", "pepsi", "mcdonalds", "disney", "pixar", "marvel", "netflix", "meta", "facebook", "instagram", "tiktok", "youtube", "spotify", "samsung", "huawei", "sony", "nintendo", "playstation", "xbox", "bmw", "mercedes", "porsche", "audi", "volkswagen", "ferrari", "lamborghini", "redbull", "ikea", "lidl", "aldi", "rewe", "edeka", "zalando", "duolingo", "studysmarter", "chegg", "khan", "wikipedia", "lego", "barbie", "rolex", "gucci", "chanel", "louisvuitton", "supreme",
  // Personnes réelles connues (sciences, politique, culture, sport, tech)
  "einstein", "newton", "feynman", "hawking", "curie", "darwin", "galilei", "galileo", "euler", "gauss", "leibniz", "pythagoras", "archimedes", "nobel", "oppenheimer", "turing", "edison", "freud", "kant", "nietzsche", "goethe", "schiller", "mozart", "beethoven", "picasso", "musk", "zuckerberg", "bezos", "gates", "trump", "biden", "obama", "merkel", "scholz", "macron", "putin", "selenskyj", "zelensky", "hitler", "stalin", "mussolini", "napoleon", "beyonce", "rihanna", "shakira", "eminem", "drake", "kardashian", "ronaldo", "messi", "neymar", "mbappe", "federer", "nadal", "jordan", "schumacher", "verstappen", "hamilton", "bieber", "swift", "adele",
  // Personnages connus (films, séries, livres, mangas, jeux)
  "dumbledore", "snape", "hermione", "voldemort", "gandalf", "frodo", "yoda", "vader", "skywalker", "sherlock", "moriarty", "batman", "superman", "spiderman", "ironman", "hulk", "thanos", "deadpool", "wolverine", "joker", "heisenberg", "naruto", "kakashi", "goku", "vegeta", "luffy", "pikachu", "pokemon", "mario", "luigi", "zelda", "sonic", "kirby", "minion", "shrek", "simpson", "homer", "spongebob", "elsa", "mickey", "garfield", "snoopy", "tintin", "asterix", "obelix", "kenobi", "skywalker", "jedi", "sith", "hogwarts", "potter", "weasley", "xavier", "magneto", "erwin", "koro", "nagisa", "tsunade", "gojo", "levi", "light", "ryuk", "itachi", "sasuke", "eren", "mikasa",
  // Imitation de l'équipe ou du service
  "tred", "admin", "administrator", "support", "moderator", "staff", "system", "official", "offiziell",
  // Grossièretés courantes (de, en, fr, es)
  "fuck", "shit", "bitch", "nazi", "arsch", "fotze", "hure", "wichser", "schlampe", "putain", "merde", "connard", "salope", "puta", "mierda", "cabron", "penis", "vagina", "porn", "porno", "sex",
];
/** Expressions de plusieurs mots (comparées mot à mot, titres retirés). */
const BLOCKED_PHRASES = ["harry potter", "walter white", "professor x", "steve jobs", "bill gates", "elon musk", "taylor swift", "jack sparrow", "darth vader", "tony stark", "peter parker", "bruce wayne", "lara croft", "mr bean", "james bond", "albert einstein", "marie curie", "isaac newton", "coca cola", "red bull", "louis vuitton", "mc donalds"];

const BLOCKED = new Set(BLOCKED_WORDS);
const BLOCKED_LONG = BLOCKED_WORDS.filter((w) => w.length >= 6);
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", $: "s", "€": "e", "!": "i", "|": "i" };

/** Minuscules, sans accents, « l33t » décodé, ß → ss. Garde espaces, points, tirets. */
export function foldName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[01345789@$€!|]/g, (c) => LEET[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe");
}

/** Le nom propre, prêt à afficher : espaces simples, bords nets. */
export function tidyName(raw: string): string {
  return raw.normalize("NFC").replace(/\s+/g, " ").trim();
}

const ALLOWED = /^[\p{L}][\p{L}\p{M} .'’-]*$/u;

function reserved(name: string): boolean {
  // Les caractères « l33t » sont refusés à la saisie, mais l'on compare aussi la version décodée.
  const all = foldName(name).split(/[\s.'’-]+/).filter(Boolean);
  const words = all.filter((w) => !TITLES.has(w));
  if (words.length === 0) return false;
  const joined = words.join("");
  if (words.some((w) => BLOCKED.has(w)) || BLOCKED.has(joined)) return true;
  if (BLOCKED_LONG.some((b) => joined.includes(b))) return true;
  // Les expressions se comparent titres compris (« Professor X »).
  const spaced = ` ${all.join(" ")} `;
  return BLOCKED_PHRASES.some((p) => spaced.includes(` ${p} `) || joined.includes(p.replace(/ /g, "")));
}

export function checkProfessorName(raw: unknown): ProfessorNameCheck {
  if (typeof raw !== "string") return { ok: false, reason: "characters" };
  const name = tidyName(raw);
  const letters = name.replace(/[^\p{L}]/gu, "");
  if (letters.length < PROFESSOR_NAME_MIN) return { ok: false, reason: "too_short" };
  if (name.length > PROFESSOR_NAME_MAX) return { ok: false, reason: "too_long" };
  // Chiffres et symboles refusés à la saisie, mais un nom « l33t » est d'abord jugé sur ce qu'il imite.
  if (reserved(name)) return { ok: false, reason: "reserved" };
  if (!ALLOWED.test(name)) return { ok: false, reason: "characters" };
  return { ok: true, name };
}
