import { eq } from "drizzle-orm";
import { db } from "../database";
import { userAccess } from "../database/schema";
import { DEFAULT_LEARNING_STYLE } from "./learning-style";
import { session as sessionTable, user as userTable } from "../database/auth-schema";

/**
 * Zugangskontrolle.
 *
 * Zwei Ebenen, die unabhängig voneinander wirken:
 *   1. Registrierung — offen (seit der offenen Beta, Nov. 2026), geschützt
 *      durch die E-Mail-Bestätigung (auth.ts). Die Tabelle invite_code bleibt
 *      als Archiv bestehen; `invitedWith` zeigt, wer per Code kam.
 *   2. Nutzung — jede API-Anfrage prüft, ob das Konto noch aktiv ist.
 *
 * Eine Sperre wirkt sofort, weil sie zusätzlich alle Sitzungen des Kontos
 * löscht. Ohne diesen Schritt liefe ein bereits angemeldeter Browser bis zum
 * Ablauf des Cookies weiter — bei einem Kostenrisiko pro Anfrage ist das
 * genau das falsche Verhalten.
 */

/** E-Mail-Adressen, die beim ersten Login automatisch Admin werden. */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);
}

export interface AccessState {
  isActive: boolean;
  role: string;
}

/**
 * Zugangszustand eines Kontos. Fehlt der Datensatz, gilt das Konto als aktiv —
 * so funktionieren Konten aus der Zeit vor dieser Tabelle unverändert weiter.
 * Adressen aus ADMIN_EMAILS erhalten dabei einmalig die Admin-Rolle.
 */
export async function getAccess(userId: string, email?: string): Promise<AccessState> {
  // Colonnes EXPLICITES : cette lecture passe à chaque requête API. Un
  // `select()` complet y lirait aussi toute colonne ajoutée au schéma — et si
  // le code est déployé avant la migration, plus aucune requête ne passe.
  const rows = await db
    .select({ isActive: userAccess.isActive, role: userAccess.role })
    .from(userAccess)
    .where(eq(userAccess.userId, userId))
    .limit(1);

  const shouldBeAdmin = !!email && adminEmails().includes(email.toLowerCase());

  if (rows.length === 0) {
    const role = shouldBeAdmin ? "admin" : "user";
    await db
      .insert(userAccess)
      .values({ userId, isActive: true, role, learningStyle: DEFAULT_LEARNING_STYLE })
      .onConflictDoNothing();
    return { isActive: true, role };
  }

  const row = rows[0]!;
  // Nachträglich in ADMIN_EMAILS eingetragen? Rolle nachziehen.
  if (shouldBeAdmin && row.role !== "admin") {
    await db
      .update(userAccess)
      .set({ role: "admin", updatedAt: new Date() })
      .where(eq(userAccess.userId, userId));
    return { isActive: row.isActive, role: "admin" };
  }
  return { isActive: row.isActive, role: row.role };
}

/** Alle Sitzungen eines Kontos löschen — die Sperre greift damit sofort. */
export async function revokeSessions(userId: string): Promise<void> {
  await db.delete(sessionTable).where(eq(sessionTable.userId, userId));
}

export async function setActive(
  userId: string,
  isActive: boolean,
  note?: string,
): Promise<void> {
  await db
    .insert(userAccess)
    .values({ userId, isActive, note: note ?? null, learningStyle: DEFAULT_LEARNING_STYLE })
    .onConflictDoUpdate({
      target: userAccess.userId,
      set: { isActive, note: note ?? null, updatedAt: new Date() },
    });
  if (!isActive) await revokeSessions(userId);
}

/** Konten mit Zugangszustand, neueste zuerst — die Liste des Admin-Bereichs. */
export async function listUsers() {
  const rows = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      createdAt: userTable.createdAt,
      isActive: userAccess.isActive,
      role: userAccess.role,
      invitedWith: userAccess.invitedWith,
      note: userAccess.note,
    })
    .from(userTable)
    .leftJoin(userAccess, eq(userAccess.userId, userTable.id));

  return rows
    .map((r) => ({
      ...r,
      // Fehlender Zugangsdatensatz = Altkonto = aktiv.
      isActive: r.isActive ?? true,
      role: r.role ?? "user",
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
