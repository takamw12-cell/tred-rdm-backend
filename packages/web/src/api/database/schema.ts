import { index, sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

/**
 * Define your database schema here, then apply it with `bun run db:push`
 * (from packages/web). Re-export any generated schema from this file
 * (e.g. Better Auth's auth-schema.ts) so drizzle generates complete migrations.
 * Table patterns and conventions: skills/app/references/api.md
 */

export const semester = sqliteTable("semester", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(), // e.g. "3. Semester" / "WS 2025/26"
  university: text("university"),
  program: text("program"), // Studiengang, e.g. "Luft- und Raumfahrttechnik"
  semesterNumber: integer("semester_number"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  },
  // Sans index sur userId, la base parcourt les lignes de TOUS les
  // étudiants à chaque lecture. Invisible à dix, décisif à mille.
  (t) => [
    index("semester_user_idx").on(t.userId),
  ],
);

export type Semester = typeof semester.$inferSelect;


// A share code lets another student copy a semester (and its documents) into
// their own account. Read-only snapshot semantics: no live permissions needed.
export const semesterShare = sqliteTable("semester_share", {
  code: text("code").primaryKey(),
  semesterId: text("semester_id").notNull(),
  ownerId: text("owner_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Un Fach : Elektrotechnik, Thermodynamik, Technische Mechanik.
 *
 * ── Pourquoi ce niveau manquait ───────────────────────────────────────────
 *
 * La hiérarchie s'arrêtait à Semester → Documents. Un étudiant qui suit six
 * matières se retrouvait avec trente fichiers en vrac, et finissait par créer
 * un « semestre » nommé « elektrotechnik » — ce qui casse le sens du semestre
 * et empêche de retrouver la même matière l'année suivante.
 *
 * ── Le Fach appartient au semestre ────────────────────────────────────────
 *
 * « Mathematik 1 » et « Mathematik 2 » sont donc deux Fächer distincts, sans
 * lien entre eux. C'est un choix : il rend l'écran simple à lire et la
 * suppression d'un semestre évidente. Un Fach qui traverserait les semestres
 * serait plus juste sur le fond, mais demanderait à l'étudiant de comprendre
 * deux axes au lieu d'un — et personne ne range ses cours en pensant à un
 * modèle de données.
 */
export const subject = sqliteTable(
  "subject",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    /** Le semestre auquel il appartient. Jamais nul : un Fach hors semestre
     *  n'a nulle part où s'afficher. */
    semesterId: text("semester_id").notNull(),
    name: text("name").notNull(),
    /** Couleur de la pastille, choisie par l'étudiant. Six teintes fixes ;
     *  voir SUBJECT_COLORS dans routes/subjects.ts. */
    color: text("color").notNull().default("slate"),
    /** Ordre d'affichage. L'ordre alphabétique met « Analysis » avant
     *  « Werkstoffkunde » même quand l'examen d'Analysis est en février. */
    position: integer("position").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    // La seule lecture qui compte : « les Fächer de ce semestre, dans l'ordre ».
    index("subject_semester_idx").on(t.semesterId, t.position),
    index("subject_user_idx").on(t.userId),
  ],
);

export type Subject = typeof subject.$inferSelect;

export const document = sqliteTable("document", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  semesterId: text("semester_id"), // nullable FK -> semester.id
  /** Le Fach. Nul = « pas encore classé », ce qui doit rester possible :
   *  obliger à choisir une matière au moment du téléversement ferait
   *  renoncer au téléversement. */
  subjectId: text("subject_id"),
  title: text("title").notNull(),
  kind: text("kind").notNull().default("vorlesung"), // vorlesung | uebung | klausur | other
  textContent: text("text_content").notNull(),
  fileKey: text("file_key"), // S3 key of the original PDF (nullable for legacy rows)
  pageCount: integer("page_count").notNull().default(0),
  charCount: integer("char_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  },
  // Sans index sur userId, la base parcourt les lignes de TOUS les
  // étudiants à chaque lecture. Invisible à dix, décisif à mille.
  (t) => [
    index("document_user_created_idx").on(t.userId, t.createdAt),
    index("document_semester_idx").on(t.semesterId),
    index("document_subject_idx").on(t.subjectId),
  ],
);

export type Document = typeof document.$inferSelect;

// ── KI-Chat history ──────────────────────────────────────────────────────
// A saved conversation, scoped to the document/semester it was held in, so it
// can be listed, reopened, and restored with the right context after a reload.
export const chatConversation = sqliteTable("chat_conversation", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull().default("Neue Unterhaltung"),
  semesterId: text("semester_id"), // scope at save time (nullable)
  documentId: text("document_id"), // single-document scope (nullable)
  documentTitle: text("document_title"), // cached label for restore
  lang: text("lang").notNull().default("de"), // language the messages are stored in
  // Soft-delete: when set, the conversation lives in the trash and is hidden
  // from the main list until restored or permanently purged.
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  },
  // Sans index sur userId, la base parcourt les lignes de TOUS les
  // étudiants à chaque lecture. Invisible à dix, décisif à mille.
  (t) => [
    index("conversation_user_updated_idx").on(t.userId, t.updatedAt),
  ],
);

export type ChatConversation = typeof chatConversation.$inferSelect;

export const chatMessage = sqliteTable("chat_message", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type ChatMessage = typeof chatMessage.$inferSelect;

// ── Gespeicherte Übungen & Klausuren ──────────────────────────────────────
// Every successful generation from the exercises page is auto-saved here so it
// can be listed (history), reopened to re-read the statement + solution, and
// exported to PDF later. The user can delete entries they don't want to keep.
export const savedExercise = sqliteTable("saved_exercise", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  semesterId: text("semester_id"), // scope at save time (nullable)
  mode: text("mode").notNull().default("exercise"), // exercise | klausur
  subject: text("subject").notNull().default(""),
  chapter: text("chapter").notNull().default(""),
  difficulty: text("difficulty").notNull().default("medium"),
  type: text("type").notNull().default("application"),
  basedOnId: text("based_on_id"), // Klausur document this was generated from
  locale: text("locale").notNull().default("de"),
  title: text("title").notNull().default(""),
  points: integer("points").notNull().default(0),
  statement: text("statement").notNull().default(""),
  solution: text("solution").notNull().default(""),
  scale: text("scale").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  },
  // Sans index sur userId, la base parcourt les lignes de TOUS les
  // étudiants à chaque lecture. Invisible à dix, décisif à mille.
  (t) => [
    index("saved_exercise_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export type SavedExercise = typeof savedExercise.$inferSelect;

// ── Tarif & Nutzung (serverseitig) ────────────────────────────────────────
// Der Tarif lebt in der Datenbank, nicht im Browser: nur so lassen sich Limits
// wirklich durchsetzen und später an eine Zahlung koppeln.
export const userPlan = sqliteTable("user_plan", {
  userId: text("user_id").primaryKey(),
  plan: text("plan").notNull().default("free"), // founder | free | standard | premium
  // Ende des bezahlten Zeitraums; null = unbefristet (z. B. Gründer-Tarif).
  validUntil: integer("valid_until", { mode: "timestamp" }),
  // Felder für den späteren Zahlungsanbieter (Stripe o. Ä.).
  customerId: text("customer_id"),
  subscriptionId: text("subscription_id"),
  // Roher Stripe-Status: active | trialing | past_due | canceled | unpaid ...
  // Nur zur Anzeige und für den Support. Über den ZUGANG entscheiden weiterhin
  // `plan` + `validUntil` — eine zweite Autorisierungsquelle wäre ein Risiko.
  subscriptionStatus: text("subscription_status"),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  },
  // Sans index sur userId, la base parcourt les lignes de TOUS les
  // étudiants à chaque lecture. Invisible à dix, décisif à mille.
  (t) => [
    index("user_plan_user_idx").on(t.userId),
  ],
);

export type UserPlan = typeof userPlan.$inferSelect;

// Monatszähler je Funktion. Ein Datensatz pro (Nutzer, Monat, Funktion).
export const usageCounter = sqliteTable(
  "usage_counter",
  {
    userId: text("user_id").notNull(),
    period: text("period").notNull(), // "2026-07"
    metric: text("metric").notNull(), // chat | exercise | video | formulas
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.period, t.metric] })],
);

export type UsageCounter = typeof usageCounter.$inferSelect;

// ── Was der Tutor sich gemerkt hat ────────────────────────────────────────
// Eine *Denklücke*, kein Rechenfehler: eine falsche Vorstellung, die
// wiederkommt, solange sie nicht ausgeräumt ist. `timesSeen` ist das
// eigentliche Signal — einmal ist Unachtsamkeit, dreimal ist ein Muster.
//
// Gelöste Einträge werden NICHT gelöscht, sondern auf "resolved" gesetzt:
// der Verlauf ist der Beleg dafür, dass jemand vorankommt.
export const misconception = sqliteTable(
  "misconception",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    semesterId: text("semester_id"),
    topic: text("topic").notNull().default("Allgemein"),
    label: text("label").notNull(),
    detail: text("detail").notNull().default(""),
    status: text("status").notNull().default("open"), // open | resolved
    timesSeen: integer("times_seen").notNull().default(1),

    /**
     * ── La planification des révisions ────────────────────────────────────
     *
     * Sans ces trois colonnes, « compris » clôturait une lacune pour toujours.
     * L'app savait ce que l'étudiant ne comprenait pas et n'y revenait jamais.
     *
     * `dueAt` est nullable : les lignes écrites avant cette migration n'ont pas
     * de rendez-vous. Elles sont traitées comme dues immédiatement plutôt que
     * d'être perdues.
     */
    dueAt: integer("due_at", { mode: "timestamp" }),
    /** Jours jusqu'à la prochaine révision. Double à chaque réussite. */
    intervalDays: integer("interval_days").notNull().default(1),
    /** Réussites consécutives. Remis à zéro par un échec. */
    reviews: integer("reviews").notNull().default(0),
    firstSeen: integer("first_seen", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    lastSeen: integer("last_seen", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("misconception_user_status_idx").on(t.userId, t.status),
    // La file de révision se lit « mes lacunes ouvertes dont l'échéance est
    // passée, la plus ancienne d'abord ». Les trois colonnes dans cet ordre.
    index("misconception_due_idx").on(t.userId, t.status, t.dueAt),
  ],
);

export type Misconception = typeof misconception.$inferSelect;

/**
 * Signalement d'une réponse du tuteur.
 *
 * ── Pourquoi cette table existe ───────────────────────────────────────────
 *
 * Google Play l'exige. Sa règle « AI-Generated Content » demande que toute app
 * produisant du contenu par IA « contienne des fonctions de signalement
 * permettant aux utilisateurs de signaler un contenu offensant SANS quitter
 * l'application ». TRED est un agent conversationnel texte-vers-texte : il est
 * dans le champ, sans discussion possible. Sans ce chemin, la fiche est
 * refusée.
 *
 * ── Ce qui est conservé, et pourquoi ──────────────────────────────────────
 *
 * Le texte signalé est copié ici, tronqué. Ce n'est pas une redondance : une
 * conversation peut être supprimée par l'étudiant juste après le signalement,
 * et un rapport qui pointe vers du vide ne sert à rien — ni pour corriger le
 * modèle, ni pour répondre à Google.
 *
 * `resolvedAt` n'est pas un ornement : sans lui, la liste des signalements
 * grossit sans qu'on sache lesquels ont été regardés.
 */
export const contentReport = sqliteTable(
  "content_report",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    conversationId: text("conversation_id"),
    messageId: text("message_id"),
    /** « harmful » | « wrong » | « offensive » | « other » — voir routes/reports.ts. */
    reason: text("reason").notNull(),
    /** L'extrait signalé, borné. Le champ libre de l'étudiant vient après. */
    excerpt: text("excerpt").notNull().default(""),
    note: text("note").notNull().default(""),
    locale: text("locale").notNull().default("de"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  },
  (t) => [
    // La seule lecture qui compte : « les signalements non traités, les plus
    // récents d'abord ».
    index("content_report_open_idx").on(t.resolvedAt, t.createdAt),
    index("content_report_user_idx").on(t.userId),
  ],
);

export type ContentReport = typeof contentReport.$inferSelect;

/**
 * Le journal des tâches planifiées. Une ligne par tâche, pas par exécution.
 *
 * ── À quoi ça sert vraiment ───────────────────────────────────────────────
 *
 * Cette table est un VERROU, pas un historique. La relance du soir tourne dans
 * le processus du serveur : deux répliques Railway la déclencheraient donc
 * deux fois, et l'étudiant recevrait deux notifications identiques. Avant
 * d'envoyer quoi que ce soit, chaque réplique tente
 *
 *     UPDATE job_run SET ran_at = maintenant
 *      WHERE key = 'evening_reminder' AND ran_at < début_de_la_journée
 *
 * SQLite rend le nombre de lignes touchées. Une seule réplique en obtient 1 ;
 * les autres obtiennent 0 et ne font rien. Pas de service externe, pas de
 * configuration, et le jour où tu passes à deux répliques rien ne change.
 */
export const jobRun = sqliteTable("job_run", {
  key: text("key").primaryKey(),
  ranAt: integer("ran_at").notNull().default(0),
  /** Ce que la dernière exécution a fait — pour savoir si elle sert. */
  note: text("note").notNull().default(""),
});

export type JobRun = typeof jobRun.$inferSelect;

export * from "./auth-schema";

// ── Zugang: Sperre und Rolle ──────────────────────────────────────────────
// Bewusst eine eigene Tabelle statt zusätzlicher Spalten in `user`: die
// Nutzertabelle gehört Better Auth und wird von dessen Schema-Generator
// überschrieben. Ein fehlender Datensatz bedeutet "aktiv, normale Rolle" —
// so bleiben Altkonten ohne Migration nutzbar.
export const userAccess = sqliteTable("user_access", {
  userId: text("user_id").primaryKey(),
  // false = gesperrt. Der Zugang wird sofort serverseitig verweigert.
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  role: text("role").notNull().default("user"), // user | admin
  // Mit welchem Einladungscode das Konto entstanden ist (Nachvollziehbarkeit).
  invitedWith: text("invited_with"),
  // Notiz für den Betreiber: wer ist das, warum gesperrt.
  note: text("note"),
  // Oberflächensprache. Bewusst HIER und nicht in `user`: die Nutzertabelle
  // gehört Better Auth und wird von dessen Schema-Generator überschrieben —
  // eine dort ergänzte Spalte wäre beim nächsten Generieren wieder weg.
  locale: text("locale").notNull().default("de"), // de | en | fr
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  },
  // Sans index sur userId, la base parcourt les lignes de TOUS les
  // étudiants à chaque lecture. Invisible à dix, décisif à mille.
  (t) => [
    index("user_access_user_idx").on(t.userId),
  ],
);

export type UserAccess = typeof userAccess.$inferSelect;

// ── Einladungscodes ───────────────────────────────────────────────────────
// Registrierung nur mit gültigem Code. Ein Code kann mehrfach nutzbar sein
// (`maxUses`), etwa ein Code je Hochschule oder je Kurs.
export const inviteCode = sqliteTable("invite_code", {
  code: text("code").primaryKey(), // versal, ohne 0/O/1/I
  label: text("label").notNull().default(""), // "FH Aachen TM2 WS26"
  maxUses: integer("max_uses").notNull().default(1),
  usedCount: integer("used_count").notNull().default(0),
  // null = unbefristet
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type InviteCode = typeof inviteCode.$inferSelect;

// ── Push-Benachrichtigungen (Expo) ────────────────────────────────────────
// Ein Datensatz je Gerät. Der Token ist der Primärschlüssel: meldet sich auf
// demselben Gerät ein anderes Konto an, wandert der Token per Upsert zum neuen
// Nutzer, statt doppelt zu existieren — sonst bekäme der Vorbesitzer weiter
// Benachrichtigungen über fremde Klausuren.
export const pushToken = sqliteTable("push_token", {
  token: text("token").primaryKey(), // ExponentPushToken[...] oder FCM-Token
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(), // ios | android
  deviceName: text("device_name"),
  appVersion: text("app_version"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  },
  // Sans index sur userId, la base parcourt les lignes de TOUS les
  // étudiants à chaque lecture. Invisible à dix, décisif à mille.
  (t) => [
    index("push_token_user_idx").on(t.userId),
  ],
);

export type PushToken = typeof pushToken.$inferSelect;

// ── Gekaufte Credits ──────────────────────────────────────────────────────
// Bewusst GETRENNT vom Monatskontingent in `usage_counter`. Zwei Guthaben mit
// unterschiedlicher Natur: das Monatskontingent verfällt und setzt sich über
// den Periodenschlüssel von selbst zurück; gekaufte Credits gehören dem
// Nutzer und verfallen nie. In eine Spalte gepresst, ließe sich nicht mehr
// unterscheiden, was am Monatsende verfällt und was bleibt.
export const purchasedCredits = sqliteTable("purchased_credits", {
  userId: text("user_id").primaryKey(),
  creditsRemaining: integer("credits_remaining").notNull().default(0),
  lastPurchasedAt: integer("last_purchased_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  },
  // Sans index sur userId, la base parcourt les lignes de TOUS les
  // étudiants à chaque lecture. Invisible à dix, décisif à mille.
  (t) => [
    index("purchased_credits_user_idx").on(t.userId),
  ],
);

export type PurchasedCredits = typeof purchasedCredits.$inferSelect;

// ── Journal ───────────────────────────────────────────────────────────────
// Jede Bewegung, positiv wie negativ. Zwei Gründe: der Studierende sieht seine
// Historie, und beim Streitfall über eine Rechnung ist das die einzige
// belastbare Quelle. `id` ist bei Käufen die Stripe-Session-ID — dadurch kann
// ein doppelt zugestellter Webhook keine Credits doppelt gutschreiben.
export const creditTransaction = sqliteTable(
  "credit_transactions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    /** Positiv = Gutschrift, negativ = Verbrauch. */
    amount: integer("amount").notNull(),
    /** purchase | consume | grant | refund */
    type: text("type").notNull(),
    description: text("description").notNull().default(""),
    /** Woraus wurde bezahlt: "quota" (Monatskontingent) oder "credits". */
    source: text("source"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("credit_transactions_user_created_idx").on(t.userId, t.createdAt)],
);

export type CreditTransaction = typeof creditTransaction.$inferSelect;


// ── Übersetzungs-Cache ────────────────────────────────────────────────────
// Jede Übersetzung kostet einen Modellaufruf. Derselbe Absatz wird aber von
// vielen Studierenden derselben Vorlesung angefragt — ohne Cache bezahlt man
// dieselbe Übersetzung hundertmal. Der Schlüssel ist ein Hash aus Quelltext
// UND Zielsprache: derselbe Text nach Englisch und nach Französisch sind zwei
// verschiedene Einträge.
export const translationCache = sqliteTable(
  "translation_cache",
  {
    /** SHA-256 von `${sourceText}\u0000${targetLocale}`, hex. Zugleich Primärschlüssel. */
    id: text("id").primaryKey(),
    sourceHash: text("source_hash").notNull(),
    targetLocale: text("target_locale").notNull(),
    translatedText: text("translated_text").notNull(),
    /** Wie oft der Eintrag getroffen wurde — zeigt, ob der Cache sich lohnt. */
    hits: integer("hits").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("translation_cache_hash_idx").on(t.sourceHash, t.targetLocale)],
);

export type TranslationCache = typeof translationCache.$inferSelect;

/**
 * Compteur de limitation de débit, une ligne par clé.
 *
 * `key` = "<portée>:<appelant>", où l'appelant est l'empreinte du cookie de
 * session quand il existe, sinon l'IP. Voir middleware/rate-limit.ts.
 *
 * `windowStart` est le début de la fenêtre en millisecondes, arrondi au
 * multiple de la durée de fenêtre. Comparer deux entiers suffit alors à savoir
 * si l'on est encore dans la même fenêtre — pas de calcul de date à faire.
 */
export const rateLimit = sqliteTable(
  "rate_limit",
  {
    key: text("key").primaryKey(),
    windowStart: integer("window_start").notNull(),
    count: integer("count").notNull().default(0),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("rate_limit_window_idx").on(t.windowStart)],
);
