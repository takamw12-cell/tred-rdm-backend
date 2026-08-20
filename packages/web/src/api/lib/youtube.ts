// YouTube-Suche für den Tutor-Chat.
//
// Warum serverseitig? Der API-Key darf nie ins Frontend-Bundle — sonst kann ihn
// jeder auslesen und unser Tagesbudget verbrennen. Außerdem ist das Kontingent
// der YouTube Data API knapp: search.list kostet 100 Einheiten, das Standard-
// Kontingent liegt bei 10.000/Tag — also nur ~100 echte Suchen pro Tag. Deshalb
// hier: aggressives Caching (gleiches Thema = keine zweite Anfrage) und ein
// Tageszähler, der freundlich abbricht, bevor Google uns hart sperrt.

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";

/** Kosten laut Google: search.list = 100, videos.list = 1. */
const SEARCH_COST = 100;
const DAILY_BUDGET = Number(process.env.YOUTUBE_DAILY_BUDGET ?? 9000);

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 h

export interface YoutubeHit {
  id: string;
  title: string;
  channel: string;
  channelId: string;
  thumbnail: string;
  publishedAt: string;
  duration: string;
  views: number | null;
  trusted: boolean;
}

interface CacheEntry {
  at: number;
  hits: YoutubeHit[];
}

const cache = new Map<string, CacheEntry>();

// Tagesbudget wird bei jedem Datumswechsel (UTC) zurückgesetzt.
let spent = 0;
let spentDay = "";

function budgetLeft(cost: number): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== spentDay) {
    spentDay = today;
    spent = 0;
  }
  if (spent + cost > DAILY_BUDGET) return false;
  spent += cost;
  return true;
}

// Kanäle, die im deutschen Ingenieur-/MINT-Studium tatsächlich weiterhelfen.
// Treffer von hier werden nach oben sortiert und im UI als Empfehlung markiert.
const TRUSTED = [
  "studyflix",
  "simpleclub",
  "thesimpleclub",
  "thesimplephysics",
  "thesimplemaths",
  "daniel jung",
  "mathe by daniel jung",
  "ingenieurkurse",
  "technische mechanik",
  "mathematrick",
  "matheretter",
  "weitz",
  "physik ist überall",
  "elektrotechnik",
  "elektrotechnische grundlagen",
  "maschinenbau",
  "hochschule",
  "universität",
  "3blue1brown",
  "khan academy",
  "the efficient engineer",
  "lesics",
  "engineering explained",
];

function isTrusted(channel: string): boolean {
  const c = channel.toLowerCase();
  return TRUSTED.some((name) => c.includes(name));
}

// Ein Chatverlauf ist keine gute Suchanfrage. Erste Fassung nahm einfach die
// ersten Wörter der Antwort — und landete damit bei der Begrüßung ("Perfekt
// Rached, fangen wir mit den Grundlagen an"), inklusive Vorname. Jetzt zählt,
// WAS oft vorkommt und WO es steht: Überschriften und Fettungen der Antwort
// sowie die Frage des Studenten wiegen schwer, Fließtext kaum. Kostet weiterhin
// keinen Modellaufruf.
const STOPWORDS = new Set([
  "der","die","das","und","oder","aber","doch","also","dann","wenn","weil","dass",
  "ein","eine","einer","eines","einem","einen","ist","sind","war","waren","wird",
  "werden","wurde","kann","können","muss","müssen","soll","sollen","hat","haben",
  "hier","dort","dies","diese","dieser","dieses","für","mit","von","vom","zum",
  "zur","auf","aus","bei","nach","über","unter","durch","gegen","ohne","sich",
  "man","wir","ich","du","sie","es","ihr","nicht","nur","noch","schon","sehr",
  "mehr","auch","wie","was","wer","wo","warum","welche","welcher","welches",
  "the","and","for","with","from","that","this","are","have","has","you",
  "your","our","its","can","will","would","should","about","into","then","than",
  "les","des","une","dans","pour","avec","que","qui","est","sont","sur","par",
  "beispiel","aufgabe","frage","antwort","schritt","siehe","gilt","folgt",
  "berechne","bestimme","zeige","erkläre","erklärung","lösung",
  // Gesprächsfloskeln — der häufigste Grund für unbrauchbare Suchanfragen.
  "hallo","danke","bitte","gern","gerne","klar","super","prima","perfekt","genau",
  "okay","alles","gut","schön","toll","los","legen","fangen","anfangen","starten",
  "beginnen","schauen","gucken","zusammen","gemeinsam","lass","lassen","kurz",
  "erstmal","zunächst","weiter","nächste","nächsten","thema","themen","kapitel",
  "verstehen","verstanden","merken","wichtig","dabei","damit","dazu","davon",
  "sowie","bzw","etwa","zum beispiel","usw","also",
]);

const CONNECTORS = new Set(["und", "oder", "der", "die", "das", "von", "des"]);

/** Markup, Formeln und Code entfernen — übrig bleibt lesbarer Fließtext. */
function stripMarkup(raw: string): string {
  return raw
    .replace(/\[\[\/?[A-Z]+\]\]/g, " ")
    .replace(/@@STEP:/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]*\$/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`|~]/g, " ")
    .replace(/[-–—]{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}äöüÄÖÜß-]/gu, ""))
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w));
}

/**
 * Destilliert aus Frage + Antwort ein paar Suchbegriffe.
 * `question` ist die letzte Frage des Studenten, `studentName` wird
 * herausgefiltert (die Anrede des Tutors soll nie in der Suche landen).
 */
export function extractTopic(
  answer: string,
  question = "",
  studentName = "",
): string {
  const body = stripMarkup(answer);

  // Überschriften und Fettungen stehen für das Thema — sie zählen dreifach.
  const headings = [...answer.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => m[1]);
  const bolds = [...answer.matchAll(/\*\*([^*\n]{3,60})\*\*/g)].map((m) => m[1]);
  const strong = stripMarkup([...headings, ...bolds].join(" "));

  const banned = new Set(
    tokenize(studentName).map((w) => w.toLowerCase()),
  );

  const score = new Map<string, number>();
  const display = new Map<string, string>();

  function add(text: string, weight: number) {
    for (const word of tokenize(text)) {
      const key = word.toLowerCase();
      if (STOPWORDS.has(key) || banned.has(key)) continue;
      score.set(key, (score.get(key) ?? 0) + weight);
      // Großgeschriebene Variante bevorzugen: deutsche Fachbegriffe sind Nomen.
      const current = display.get(key);
      if (!current || (/^[A-ZÄÖÜ]/.test(word) && !/^[A-ZÄÖÜ]/.test(current))) {
        display.set(key, word);
      }
    }
  }

  add(question, 4); // was der Student wissen will, wiegt am schwersten
  add(strong, 3); // Überschriften und Fettungen der Antwort
  add(body, 1); // Fließtext nur als Häufigkeitssignal

  // Nomen (großgeschrieben) und lange Komposita sind typische Fachbegriffe.
  for (const [key, word] of display) {
    let bonus = 0;
    if (/^[A-ZÄÖÜ]/.test(word)) bonus += 1;
    if (word.length >= 9) bonus += 1;
    score.set(key, (score.get(key) ?? 0) + bonus);
  }

  const ranked = [...score.entries()]
    .filter(([key]) => !CONNECTORS.has(key))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key]) => display.get(key) ?? key);

  if (ranked.length > 0) return ranked.join(" ");
  // Notnagel: erste sinnvolle Wörter der Frage, sonst der Antwort.
  return tokenize(question || body).slice(0, 5).join(" ");
}

function thumbOf(snippet: Record<string, unknown>): string {
  const t = (snippet.thumbnails ?? {}) as Record<string, { url?: string }>;
  return t.medium?.url ?? t.high?.url ?? t.default?.url ?? "";
}

/** ISO-8601-Dauer (PT12M34S) → Sekunden. */
function durationSeconds(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** PT12M34S → "12:34" */
function formatDuration(iso: string): string {
  const total = durationSeconds(iso);
  if (!total) return "";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export type YoutubeResult =
  | { ok: true; query: string; hits: YoutubeHit[]; cached: boolean }
  | { ok: false; code: "not_configured" | "quota" | "failed" };

const REGION: Record<string, { region: string; lang: string }> = {
  de: { region: "DE", lang: "de" },
  fr: { region: "FR", lang: "fr" },
  en: { region: "US", lang: "en" },
};

export async function searchYoutube(
  rawTopic: string,
  locale = "de",
  question = "",
  studentName = "",
): Promise<YoutubeResult> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { ok: false, code: "not_configured" };

  const loc = REGION[locale] ? locale : "de";
  const query = extractTopic(rawTopic, question, studentName);
  if (!query) return { ok: true, query: "", hits: [], cached: false };

  const cacheKey = `${loc}:${query.toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { ok: true, query, hits: hit.hits, cached: true };
  }

  if (!budgetLeft(SEARCH_COST)) return { ok: false, code: "quota" };

  try {
    // safeSearch bleibt auf "moderate": "strict" filtert im MINT-Bereich viel zu
    // viel weg (Sprengstoff-, Medizin- oder Anatomie-Begriffe in Titeln reichen
    // schon). videoSyndicated ist raus — zusammen mit videoEmbeddable lieferte
    // die Kombination regelmäßig null Treffer.
    async function runSearch(q: string, restrictRegion: boolean) {
      const params = new URLSearchParams({
        key: key as string,
        part: "snippet",
        q,
        type: "video",
        maxResults: "12",
        videoEmbeddable: "true",
        safeSearch: "moderate",
        relevanceLanguage: REGION[loc].lang,
      });
      if (restrictRegion) params.set("regionCode", REGION[loc].region);
      return fetch(`${SEARCH_URL}?${params.toString()}`);
    }

    let res = await runSearch(query, true);
    if (!res.ok) {
      const body = await res.text();
      console.error("[youtube] search failed", res.status, body.slice(0, 400));
      // 403 ist bei der YouTube-API fast immer Kontingent oder ein Key ohne
      // aktivierte Data API — beides soll der Nutzer als klare Meldung sehen.
      return { ok: false, code: res.status === 403 ? "quota" : "failed" };
    }

    let data = (await res.json()) as {
      items?: { id?: { videoId?: string }; snippet?: Record<string, unknown> }[];
    };
    let items = data.items ?? [];

    // Zweiter Versuch, wenn nichts kam: nur die drei stärksten Begriffe und
    // ohne Länderfilter. Kostet weitere 100 Einheiten, ist aber besser als eine
    // leere Trefferliste — und das Ergebnis wird ohnehin zwischengespeichert.
    if (items.length === 0) {
      const short = query.split(" ").slice(0, 3).join(" ");
      if (short && short !== query && budgetLeft(SEARCH_COST)) {
        res = await runSearch(short, false);
        if (res.ok) {
          data = (await res.json()) as typeof data;
          items = data.items ?? [];
        }
      }
    }

    const ids = items.map((i) => i.id?.videoId).filter(Boolean) as string[];
    if (ids.length === 0) {
      // Auch das leere Ergebnis merken, sonst kostet jeder erneute Klick auf
      // dasselbe Thema wieder 100 Einheiten.
      cache.set(cacheKey, { at: Date.now(), hits: [] });
      return { ok: true, query, hits: [], cached: false };
    }

    // Zweiter Aufruf für Dauer und Aufrufzahlen (kostet nur 1 Einheit).
    let details = new Map<string, { duration: string; views: number | null }>();
    if (budgetLeft(1)) {
      const dParams = new URLSearchParams({
        key,
        part: "contentDetails,statistics",
        id: ids.join(","),
      });
      const dRes = await fetch(`${VIDEOS_URL}?${dParams.toString()}`);
      if (dRes.ok) {
        const dData = (await dRes.json()) as {
          items?: {
            id?: string;
            contentDetails?: { duration?: string };
            statistics?: { viewCount?: string };
          }[];
        };
        details = new Map(
          (dData.items ?? []).map((v) => [
            String(v.id),
            {
              duration: String(v.contentDetails?.duration ?? ""),
              views: v.statistics?.viewCount ? Number(v.statistics.viewCount) : null,
            },
          ]),
        );
      }
    }

    const hits: YoutubeHit[] = items
      .map((item) => {
        const id = item.id?.videoId ?? "";
        const sn = (item.snippet ?? {}) as Record<string, unknown>;
        const channel = String(sn.channelTitle ?? "");
        const detail = details.get(id);
        return {
          id,
          title: String(sn.title ?? "").replace(/&(amp|quot|#39);/g, (m) =>
            m === "&amp;" ? "&" : m === "&quot;" ? '"' : "'",
          ),
          channel,
          channelId: String(sn.channelId ?? ""),
          thumbnail: thumbOf(sn),
          publishedAt: String(sn.publishedAt ?? ""),
          duration: detail?.duration ? formatDuration(detail.duration) : "",
          views: detail?.views ?? null,
          trusted: isTrusted(channel),
          _seconds: detail?.duration ? durationSeconds(detail.duration) : 0,
        };
      })
      .filter((h) => h.id)
      // Bewertung: bekannte Lernkanäle zuerst, dann Videos in brauchbarer
      // Länge (3–35 min), dann Reichweite. Die YouTube-Relevanz bleibt als
      // Grundreihenfolge erhalten, wir sortieren nur stabil darüber.
      .map((h, index) => {
        let score = 100 - index;
        if (h.trusted) score += 60;
        if (h._seconds >= 180 && h._seconds <= 2100) score += 20;
        if (h._seconds > 0 && h._seconds < 90) score -= 25;
        if (h.views && h.views > 50_000) score += 10;
        return { h, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(({ h }) => {
        const { _seconds, ...rest } = h;
        void _seconds;
        return rest;
      });

    cache.set(cacheKey, { at: Date.now(), hits });
    // Cache klein halten — der Prozess läuft lange, der Speicher soll nicht wachsen.
    if (cache.size > 500) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) cache.delete(oldest[0]);
    }

    return { ok: true, query, hits, cached: false };
  } catch (err) {
    console.error("[youtube] request failed", err);
    return { ok: false, code: "failed" };
  }
}
