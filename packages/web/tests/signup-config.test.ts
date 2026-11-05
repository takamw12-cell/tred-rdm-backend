import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { fetchInviteRequired } from "../src/web/lib/signup-config";

/**
 * L'inscription ne doit JAMAIS être bloquée côté client parce que
 * `/api/config` a échoué. Le champ « code d'invitation » n'apparaît que si le
 * serveur a répondu correctement avec `inviteRequired: true`.
 */

const json = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

let errorSpy: ReturnType<typeof spyOn>;
beforeEach(() => {
  errorSpy = spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("fetchInviteRequired", () => {
  test("serveur ouvert → pas de code", async () => {
    expect(await fetchInviteRequired(json({ publicSignup: true, inviteRequired: false }))).toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("serveur fermé → code exigé", async () => {
    expect(await fetchInviteRequired(json({ publicSignup: false, inviteRequired: true }))).toBe(true);
  });

  test("erreur réseau → inscription non bloquée, erreur journalisée", async () => {
    const failing = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await fetchInviteRequired(failing)).toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  test("statut HTTP en erreur → inscription non bloquée", async () => {
    expect(await fetchInviteRequired(json({ inviteRequired: true }, 502))).toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  test("réponse HTML (fallback SPA) → inscription non bloquée", async () => {
    const html = (async () =>
      new Response("<!doctype html><html></html>", { status: 200 })) as unknown as typeof fetch;
    expect(await fetchInviteRequired(html)).toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  test("champ absent ou non booléen → pas de code", async () => {
    expect(await fetchInviteRequired(json({}))).toBe(false);
    expect(await fetchInviteRequired(json({ inviteRequired: "true" }))).toBe(false);
  });
});
