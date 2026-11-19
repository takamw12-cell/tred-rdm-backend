import { Platform } from "react-native";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import * as AppIntegrity from "@expo/app-integrity";

/**
 * Intégrité de l'app (19 nov. 2026) — Apple App Attest sur iOS, Google Play
 * Integrity sur Android. Le serveur (packages/web/src/api/integrity) vérifie
 * la preuve et rend un jeton de 24 h, envoyé ensuite dans X-App-Integrity.
 *
 * Ne bloque JAMAIS l'app : sans module natif, sans configuration, appareil
 * non pris en charge ou réseau coupé, les requêtes partent simplement sans
 * jeton (le serveur est en mode « report » tant que le fondateur ne décide
 * pas autrement).
 *
 * iOS : la clé vit dans la Secure Enclave ; on garde son identifiant et le
 * « ticket » du serveur (clé publique + compteur) dans le trousseau.
 * Android : il faut le numéro du projet Google Cloud lié à l'app dans la Play
 * Console (app.json → extra.playIntegrityCloudProjectNumber).
 */
const API_URL: string = (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? process.env.EXPO_PUBLIC_API_URL ?? "";
const KEY_ID = "tred.attest.keyId";
const TICKET = "tred.attest.ticket";
const MARGIN_MS = 10 * 60_000;
const RETRY_AFTER_FAILURE_MS = 15 * 60_000;

let current: { token: string; expiresAt: number } | null = null;
let inFlight: Promise<string | null> | null = null;
let failedAt = 0;

async function post<T>(path: string, body: unknown): Promise<{ status: number; data: T | null }> {
  const res = await fetch(`${API_URL}/api/app-integrity/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, data: res.ok ? ((await res.json()) as T) : null };
}

async function challenge(): Promise<string | null> {
  const r = await post<{ challenge: string }>("challenge", {});
  return r.data?.challenge ?? null;
}

type Issued = { token: string; expiresAt: number; ticket?: string };

async function ios(): Promise<Issued | null> {
  if (!AppIntegrity.isSupported) return null;
  const keyId = await SecureStore.getItemAsync(KEY_ID);
  const ticket = await SecureStore.getItemAsync(TICKET);
  if (keyId && ticket) {
    const c = await challenge();
    if (!c) return null;
    const assertion = await AppIntegrity.generateAssertionAsync(keyId, c);
    const r = await post<Issued>("ios/assert", { ticket, assertion, challenge: c });
    if (r.data) {
      if (r.data.ticket) await SecureStore.setItemAsync(TICKET, r.data.ticket);
      return r.data;
    }
    // Clé ou ticket refusés (réinstallation, restauration sur un autre appareil) : on recommence l'attestation.
    if (r.status !== 400 && r.status !== 403) return null;
    await SecureStore.deleteItemAsync(KEY_ID);
    await SecureStore.deleteItemAsync(TICKET);
  }
  const newKey = await AppIntegrity.generateKeyAsync();
  const c = await challenge();
  if (!c) return null;
  const attestation = await AppIntegrity.attestKeyAsync(newKey, c);
  const r = await post<Issued>("ios/attest", { keyId: newKey, attestation, challenge: c });
  if (!r.data?.ticket) return null;
  await SecureStore.setItemAsync(KEY_ID, newKey);
  await SecureStore.setItemAsync(TICKET, r.data.ticket);
  return r.data;
}

let prepared = false;
async function android(): Promise<Issued | null> {
  const project = String(Constants.expoConfig?.extra?.playIntegrityCloudProjectNumber ?? "").trim();
  if (!/^\d{6,20}$/.test(project)) return null;
  if (!prepared) {
    await AppIntegrity.prepareIntegrityTokenProviderAsync(project);
    prepared = true;
  }
  const c = await challenge();
  if (!c) return null;
  // Requête « standard » : le défi du serveur sert de requestHash.
  const integrityToken = await AppIntegrity.requestIntegrityCheckAsync(c);
  return (await post<Issued>("android", { integrityToken, challenge: c })).data;
}

/** Le jeton d'intégrité en cours, renouvelé au besoin. null = pas de preuve disponible (jamais d'erreur). */
export async function integrityToken(): Promise<string | null> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return null;
  const now = Date.now();
  if (current && current.expiresAt - MARGIN_MS > now) return current.token;
  if (now - failedAt < RETRY_AFTER_FAILURE_MS) return current?.token ?? null;
  inFlight ??= (async () => {
    try {
      const issued = Platform.OS === "ios" ? await ios() : await android();
      if (!issued) {
        failedAt = Date.now();
        return null;
      }
      current = { token: issued.token, expiresAt: issued.expiresAt };
      return issued.token;
    } catch {
      failedAt = Date.now();
      return null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** En-têtes à joindre aux requêtes vers l'API : plateforme, et jeton s'il y en a un. */
export async function integrityHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (Platform.OS === "ios" || Platform.OS === "android") headers["X-TRED-Platform"] = Platform.OS;
  const token = await integrityToken();
  if (token) headers["X-App-Integrity"] = token;
  return headers;
}
