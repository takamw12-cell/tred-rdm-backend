import { eq, sql } from "drizzle-orm";
import { db } from "../database";
import { userAccess, inviteCode } from "../database/schema";
import { session as sessionTable, user as userTable } from "../database/auth-schema";

/**
 * Zugangskontrolle.
 *
 * Zwei Ebenen, die unabhängig voneinander wirken:
 *   1. Registrierung — nur mit gültigem Einladungscode, und nur wenn
 *      ALLOW_PUBLIC_SIGNUP nicht ausdrücklich abgeschaltet ist.
 *   2. Nutzung — jede API-Anfrage prüft, ob das Konto noch aktiv ist.
 *
 * Eine Sperre wirkt sofort, weil sie zusätzlich alle Sitzungen des Kontos
 * löscht. Ohne diesen Schritt liefe ein bereits angemeldeter Browser bis zum
 * Ablauf des Cookies weiter — bei einem Kostenrisiko pro Anfrage ist das
 * genau das falsche Verhalten.
 */

/** Registrierung offen? Standard ist GESCHLOSSEN — Öffnen ist die bewusste Tat. */
export function publicSignupAllowed(): boolean {
  return process.env.ALLOW_PUBLIC_SIGNUP === "true";
}

/** Kennt der Betreiber überhaupt Einladungscodes? Sonst geht gar keine Anmeldung. */
export function inviteOnly(): boolean {
  return !publicSignupAllowed();
}

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
  const rows = await db
    .select()
    .from(userAccess)
    .where(eq(userAccess.userId, userId))
    .limit(1);

  const shouldBeAdmin = !!email && adminEmails().includes(email.toLowerCase());

  if (rows.length === 0) {
    const role = shouldBeAdmin ? "admin" : "user";
    await db
      .insert(userAccess)
      .values({ userId, isActive: true, role })
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
    .values({ userId, isActive, note: note ?? null })
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

// ── Einladungscodes ───────────────────────────────────────────────────────

// Ohne 0/O/1/I: Codes werden abgetippt, oft von einem Zettel oder einer Folie.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateCode(length = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export type CodeCheck =
  | { ok: true }
  | { ok: false; reason: "unknown" | "used_up" | "expired" | "disabled" };

/** Prüft einen Code, ohne ihn zu verbrauchen. */
export async function checkCode(raw: string): Promise<CodeCheck> {
  const code = normalizeCode(raw);
  if (!code) return { ok: false, reason: "unknown" };

  const rows = await db
    .select()
    .from(inviteCode)
    .where(eq(inviteCode.code, code))
    .limit(1);
  const row = rows[0];
  if (!row) return { ok: false, reason: "unknown" };
  if (row.disabled) return { ok: false, reason: "disabled" };
  if (row.expiresAt && row.expiresAt.getTime() < Date.now())
    return { ok: false, reason: "expired" };
  if (row.usedCount >= row.maxUses) return { ok: false, reason: "used_up" };
  return { ok: true };
}

/**
 * Verbraucht einen Code — erst NACH erfolgreicher Registrierung aufrufen.
 * Der Zähler wird in einer Bedingung hochgesetzt, damit zwei gleichzeitige
 * Anmeldungen einen Code mit maxUses=1 nicht beide verbrauchen können.
 */
export async function consumeCode(raw: string): Promise<boolean> {
  const code = normalizeCode(raw);
  const res = await db
    .update(inviteCode)
    .set({ usedCount: sql`${inviteCode.usedCount} + 1` })
    .where(
      sql`${inviteCode.code} = ${code} AND ${inviteCode.usedCount} < ${inviteCode.maxUses} AND ${inviteCode.disabled} = 0`,
    );
  return (res as unknown as { rowsAffected?: number }).rowsAffected !== 0;
}

export async function listCodes() {
  const rows = await db.select().from(inviteCode);
  return rows
    .map((r) => ({
      ...r,
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function createCode(opts: {
  label?: string;
  maxUses?: number;
  expiresInDays?: number | null;
}) {
  const code = generateCode();
  await db.insert(inviteCode).values({
    code,
    label: (opts.label ?? "").slice(0, 120),
    maxUses: Math.max(1, Math.min(500, opts.maxUses ?? 1)),
    expiresAt: opts.expiresInDays
      ? new Date(Date.now() + opts.expiresInDays * 86_400_000)
      : null,
  });
  return code;
}

export async function setCodeDisabled(code: string, disabled: boolean) {
  await db
    .update(inviteCode)
    .set({ disabled })
    .where(eq(inviteCode.code, normalizeCode(code)));
}

/** Markiert, mit welchem Code ein Konto entstanden ist. */
export async function tagInvite(userId: string, code: string) {
  await db
    .insert(userAccess)
    .values({ userId, invitedWith: normalizeCode(code), isActive: true })
    .onConflictDoUpdate({
      target: userAccess.userId,
      set: { invitedWith: normalizeCode(code), updatedAt: new Date() },
    });
}
