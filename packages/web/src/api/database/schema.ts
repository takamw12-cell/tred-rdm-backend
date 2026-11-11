import { index, sqliteTable, text, integer, primaryKey, real } from "drizzle-orm/sqlite-core";

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
  /** Le cours partagé où ce document est publié. Nul = strictement privé. */
  courseId: text("course_id"),
  /**
   * "private" | "course".
   *
   * Deux colonnes plutôt qu'une : `courseId` dit OÙ, `visibility` dit SI. Les
   * séparer permet de retirer un document du partage sans perdre son
   * rattachement, et de l'y remettre d'un geste. Avec une colonne unique, tout
   * retrait effacerait l'information — et un retrait demandé par un
   * professeur deviendrait irréversible pour l'étudiant qui l'a déposé.
   */
  visibility: text("visibility").notNull().default("private"),
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
    // « Les documents partagés de ce cours » — la lecture faite à chaque
    // ouverture du tableau de bord par chaque membre.
    index("document_course_idx").on(t.courseId, t.visibility),
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
 * Retours des bêta-testeurs : bug, idée ou remarque générale, envoyés depuis
 * l'app (bouton flottant / barre latérale). Lus dans /admin/feedback.
 *
 * Contexte capturé pour déboguer : la page (chemin, sans jeton), le
 * professeur choisi, la langue et le navigateur. Jamais le contenu d'un chat.
 * Table créée par migre-feedback.mjs (racine du dépôt).
 */
export const feedback = sqliteTable(
  "feedback",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    /** « bug » | « idea » | « general » — voir lib/feedback.ts. */
    type: text("type").notNull(),
    /** 1 à 5, facultatif. */
    rating: integer("rating"),
    message: text("message").notNull(),
    pageUrl: text("page_url").notNull().default(""),
    professorId: text("professor_id"),
    locale: text("locale").notNull().default("de"),
    userAgent: text("user_agent").notNull().default(""),
    /** « open » | « resolved ». */
    status: text("status").notNull().default("open"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  },
  (t) => [
    index("feedback_status_idx").on(t.status, t.createdAt),
    index("feedback_user_idx").on(t.userId, t.createdAt),
  ],
);

export type Feedback = typeof feedback.$inferSelect;

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
  // Lernstil (VARK): visual | auditory | text | interactive | balanced.
  // Steuert, WIE der Tutor erklärt — nicht, WAS er erklärt. Hier und nicht in
  // `user`, aus demselben Grund wie `locale`. Migration: migre-learning-style.mjs
  learningStyle: text("learning_style").notNull().default("interactive"),
    // Professeur choisi (lib/professors.ts). Ajoutée par migre-professeur.mjs.
    professorId: text("professor_id").notNull().default("genius"),
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

// ── La bibliothèque de cours partagée ──────────────────────────────────────
//
// Le constat qui a fait construire ça : treize comptes, onze n'ayant jamais
// déposé un seul document. Ce n'était pas un défaut d'accueil — c'était qu'un
// nouvel inscrit arrivait dans une pièce vide et n'avait rien à demander.
//
// À la FH Aachen, tous les étudiants d'une Vorlesung ont LE MÊME Skript.
// Chacun le téléversait séparément, et le serveur l'extrayait autant de fois
// qu'il y avait d'inscrits. Le partage règle d'un coup l'arrivée (il y a
// quelque chose à lire dès la première minute), la raison d'inviter quelqu'un,
// et le coût d'extraction.
//
// ── Ce qui n'est PAS fait ici, volontairement ─────────────────────────────
//
// Les documents ne sont pas copiés. Un document partagé reste UNE ligne, avec
// son `userId` d'origine : celui qui l'a déposé reste identifiable, et le
// retirer se fait en remettant `visibility` à "private". Dupliquer aurait
// rendu tout retrait impossible à garantir — et un Skript est une œuvre
// protégée, donc le retrait doit être certain.

/**
 * Un cours suivi par plusieurs étudiants.
 *
 * `normalizedKey` est l'identité réelle du cours. Sans elle, « Elektrotechnik 2 »,
 * « elektrotechnik 2 » et « Elektrotechnik  2 » feraient trois cours distincts,
 * chacun avec un seul membre — c'est-à-dire aucun partage, et le problème
 * intact.
 */
export const course = sqliteTable(
  "course",
  {
    id: text("id").primaryKey(),
    /** L'identité, calculée : "<université>/<nom>" sans casse ni accents. */
    normalizedKey: text("normalized_key").notNull().unique(),
    /** Ce que l'on affiche, tel que le premier étudiant l'a écrit. */
    name: text("name").notNull(),
    university: text("university").notNull(),
    /** Studiengang, quand il est connu. Sert à proposer les bons cours. */
    program: text("program"),
    /** Qui l'a créé. Pour le support, jamais affiché comme une propriété. */
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("course_key_idx").on(t.normalizedKey),
    index("course_university_idx").on(t.university),
  ],
);

export type Course = typeof course.$inferSelect;

/** Qui suit quel cours. La clé composite empêche la double adhésion. */
export const courseMember = sqliteTable(
  "course_member",
  {
    courseId: text("course_id").notNull(),
    userId: text("user_id").notNull(),
    joinedAt: integer("joined_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    primaryKey({ columns: [t.courseId, t.userId] }),
    // La lecture chaude : « mes cours », faite à chaque question au tuteur.
    index("course_member_user_idx").on(t.userId),
  ],
);

export type CourseMember = typeof courseMember.$inferSelect;

// ── Professeur virtuel : suivi des coûts ───────────────────────────────────
//
// Une ligne par session d'avatar (HeyGen LiveAvatar + TTS éventuel). Le coût
// est une ESTIMATION calculée par lib/avatar-cost.ts au moment de l'écriture,
// figée en centimes : si les prix changent ensuite, l'historique reste lisible
// tel qu'il a été facturé à l'époque.
// Créée sur Turso par migre-avatar-usage.mjs (à la racine du dépôt).
export const avatarUsage = sqliteTable(
  "avatar_usage",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    durationSec: integer("duration_sec").notNull(),
    ttsChars: integer("tts_chars").notNull().default(0),
    costCents: integer("cost_cents").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("avatar_usage_user_idx").on(t.userId, t.createdAt)],
);

export type AvatarUsage = typeof avatarUsage.$inferSelect;

// ── Karteikarten (répétition espacée, V2 — Pilier 1) ──────────────────────
//
// Une carte = un recto (la question : « Formel der Normalspannung ») et un
// verso (« $\sigma = F/A$ »). Générées par l'IA depuis un document, une
// conversation ou une lacune (`misconception`), ou écrites à la main.
//
// La planification est celle demandée par le fondateur : « Gewusst » →
// intervalle × facteur de facilité ; « Nicht gewusst » → demain. Le calcul est
// dans lib/flashcards.ts (pur, testé). Une carte neuve est due tout de suite.
// Table créée sur Turso par migre-flashcards.mjs (racine du dépôt).
export const flashcard = sqliteTable(
  "flashcard",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    frontContent: text("front_content").notNull(),
    backContent: text("back_content").notNull(),
    /** Le thème affiché au-dessus de la carte (« Festigkeitslehre »). */
    topic: text("topic").notNull().default(""),
    /** « document » | « chat » | « gap » | « manual ». */
    sourceType: text("source_type").notNull().default("manual"),
    /** L'id du document ou de la lacune d'origine — rien pour un chat. */
    sourceId: text("source_id"),
    /** Le titre de la source au moment de la création (le document peut disparaître). */
    sourceLabel: text("source_label").notNull().default(""),
    nextReviewDate: integer("next_review_date", { mode: "timestamp_ms" }).notNull(),
    /** 0 = jamais révisée. */
    intervalDays: integer("interval_days").notNull().default(0),
    easeFactor: real("ease_factor").notNull().default(2.5),
    reviews: integer("reviews").notNull().default(0),
    /** Combien de fois « Nicht gewusst » : les cartes difficiles se repèrent. */
    lapses: integer("lapses").notNull().default(0),
    lastReviewedAt: integer("last_reviewed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    // La lecture chaude : « mes cartes dues », sur le tableau de bord.
    index("flashcard_due_idx").on(t.userId, t.nextReviewDate),
    index("flashcard_source_idx").on(t.userId, t.sourceType, t.sourceId),
  ],
);

export type Flashcard = typeof flashcard.$inferSelect;

// ── Intelligence collective (V2 — Pilier 4, FONDATIONS) ───────────────────
//
// Une excellente explication du tuteur, ANONYMISÉE, versée dans la base de
// connaissances d'un cours partagé (`course`) : les autres membres en
// profitent et votent. `contributorId` sert uniquement au droit de retrait
// (RGPD : l'auteur peut retirer sa contribution) et à la modération ; il
// n'est JAMAIS renvoyé aux autres étudiants.
// Tables créées par migre-shared-knowledge.mjs (racine du dépôt).
export const sharedKnowledge = sqliteTable(
  "shared_knowledge",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id").notNull(),
    /** Le thème (« Ritterschnitt »), pour regrouper et chercher. */
    topic: text("topic").notNull().default(""),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    upvotes: integer("upvotes").notNull().default(0),
    /** « pending » (en modération) | « published » | « removed ». */
    status: text("status").notNull().default("pending"),
    contributorId: text("contributor_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("shared_knowledge_course_idx").on(t.courseId, t.status, t.upvotes),
    index("shared_knowledge_contributor_idx").on(t.contributorId),
  ],
);

export type SharedKnowledge = typeof sharedKnowledge.$inferSelect;

/** Un vote par étudiant et par entrée : la clé composite l'impose. */
export const sharedKnowledgeVote = sqliteTable(
  "shared_knowledge_vote",
  {
    knowledgeId: text("knowledge_id").notNull(),
    userId: text("user_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.knowledgeId, t.userId] })],
);

// ── Agent de rétention (lib/retention/) ───────────────────────────────────
//
// `user_notifications` est à la fois la boîte de réception de l'étudiant
// (web, et mobile quand le push est tapé) et le journal de l'agent : chaque
// action est UNE ligne, avec la raison écrite pour l'admin, le jour de Berlin
// (limite d'une notification par jour) et ce que l'étudiant en a fait.
// Tables créées par migre-retention.mjs (racine du dépôt). Tant qu'elles
// n'existent pas, l'agent reste inerte et la boîte de réception est vide.
export const userNotification = sqliteTable(
  "user_notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    /** send_push_notification | create_flashcard | send_daily_digest */
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** JSON : href, screen, gapId, counts. */
    data: text("data").notNull().default("{}"),
    /** La lacune visée (create_flashcard) — pour ne jamais la reproposer. */
    gapId: text("gap_id"),
    /** Pourquoi l'agent l'a fait, en clair, pour /admin/retention. */
    reason: text("reason").notNull().default(""),
    /** Jour de Berlin « 2026-11-07 » : la limite d'une notification par jour. */
    dayKey: text("day_key").notNull(),
    /** push = aussi envoyée au mobile ; inbox = boîte de réception seulement. */
    channel: text("channel").notNull().default("inbox"),
    /** Appareils effectivement atteints par Expo (0 si web seulement ou échec). */
    pushSent: integer("push_sent").notNull().default(0),
    /** unread | opened | accepted | dismissed */
    status: text("status").notNull().default("unread"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    openedAt: integer("opened_at", { mode: "timestamp_ms" }),
    respondedAt: integer("responded_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("user_notifications_user_idx").on(t.userId, t.createdAt),
    index("user_notifications_day_idx").on(t.userId, t.dayKey),
    index("user_notifications_created_idx").on(t.createdAt),
  ],
);

export type UserNotification = typeof userNotification.$inferSelect;

/** Réglages de l'agent (clé → valeur). « paused » : "1" en pause, "0" actif. */
export const retentionSetting = sqliteTable("retention_setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── « Als Video erklären » : les vidéos explicatives sur mesure ───────────
//
// Une ligne par vidéo demandée dans le chat. Le pipeline (api/video/routes.ts)
// la fait passer de pending → script → voice → done (ou failed) ; le navigateur
// suit `status` en polling. Il n'y a pas de MP4 : `script` (scènes validées et
// horodatage de la voix) et `audioKey` (le MP3 dans le bucket des médias)
// suffisent au lecteur. `videoKey` reste nul tant qu'aucun export n'existe.
// `durationMs` est la durée de la voix : aucune durée n'est fixée dans le code.
// Table créée sur Turso par migre-generated-video.mjs (racine du dépôt).
export const generatedVideo = sqliteTable(
  "generated_video",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    chatId: text("chat_id"),
    messageId: text("message_id"),
    title: text("title").notNull().default(""),
    /** La question de l'étudiant (tronquée). */
    prompt: text("prompt").notNull().default(""),
    /** Langue de l'interface de l'étudiant : celle du script et de la voix. */
    language: text("language").notNull().default("de"),
    /** « pending » | « script » | « voice » | « done » | « failed ». */
    status: text("status").notNull().default("pending"),
    /** Code d'erreur stable (« not_grounded », « daily_limit »…), jamais un message brut. */
    error: text("error"),
    /** JSON : { scenes, words, sceneStartsMs } — vide tant que status ≠ done. */
    script: text("script"),
    audioKey: text("audio_key"),
    videoKey: text("video_key"),
    durationMs: integer("duration_ms").notNull().default(0),
    /** « Im Dashboard speichern ». */
    saved: integer("saved", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("generated_video_user_idx").on(t.userId, t.createdAt)],
);

export type GeneratedVideo = typeof generatedVideo.$inferSelect;

// ── Résultats des solveurs (source de « Als Video erklären ») ─────────────
//
// Chaque calcul réussi d'un solveur dans le chat (Technische Mechanik, thermo, circuits…) :
// l'entrée et la sortie en JSON, bornées (lib/solver-results.ts). La vidéo
// explicative s'appuie sur ces chiffres calculés, et son validateur refuse
// tout nombre qui ne vient ni du cours ni d'eux. `conversationId` est celui
// du chat (navigateur) ; nul pour les surfaces qui ne l'envoient pas.
// Table créée sur Turso par migre-solver-result.mjs (racine du dépôt).
export const solverResult = sqliteTable(
  "solver_result",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    conversationId: text("conversation_id"),
    solver: text("solver").notNull(),
    input: text("input").notNull().default("{}"),
    output: text("output").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("solver_result_user_idx").on(t.userId, t.conversationId, t.createdAt)],
);

export type SolverResult = typeof solverResult.$inferSelect;
