import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

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
});

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

export const document = sqliteTable("document", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  semesterId: text("semester_id"), // nullable FK -> semester.id
  title: text("title").notNull(),
  kind: text("kind").notNull().default("vorlesung"), // vorlesung | uebung | klausur | other
  textContent: text("text_content").notNull(),
  fileKey: text("file_key"), // S3 key of the original PDF (nullable for legacy rows)
  pageCount: integer("page_count").notNull().default(0),
  charCount: integer("char_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

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
});

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
});

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
});

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
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

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
});

export type PushToken = typeof pushToken.$inferSelect;
