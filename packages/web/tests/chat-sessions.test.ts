import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { saveConversation, scopeMismatch, sessionForScope } from "../src/api/lib/chat-sessions";
import { conversationsOfScope, docFromSearch, mayApplyResume, searchWithDoc } from "../src/web/lib/chat-sessions";

/**
 * Sessions de chat isolées par document (2026-11-15).
 *
 * Constat reproduit avant d'écrire une ligne : changer de document pendant
 * qu'une réponse s'écrivait laissait le flux finir — la réponse du document A
 * s'affichait sous le document B et était ENREGISTRÉE dans l'historique de B.
 * Revenir sur un document donnait aussi un tableau vide : son historique
 * existait, mais n'était pas repris.
 *
 * Trois règles, vérifiées ici :
 *   1. une portée (un document, ou « Alle Materialien ») a SA dernière
 *      conversation, et jamais celle d'une autre portée ni d'un autre compte ;
 *   2. une conversation enregistrée ne change plus de document — même si un
 *      client en retard (l'app mobile rouvre une conversation sans son
 *      document) l'enregistre avec une autre portée ;
 *   3. l'adresse porte le document (`/chat?doc=…`).
 */

const T0 = 1_794_000_000; // secondes, comme la colonne (mode « timestamp »)

async function memoryDb() {
  const libsql = await import("@libsql/client");
  const dz = await import("drizzle-orm/libsql");
  const client = libsql.createClient({ url: ":memory:" });
  await client.execute("CREATE TABLE document (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, semester_id TEXT, title TEXT NOT NULL)");
  await client.execute(
    "CREATE TABLE chat_conversation (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT 'Neue Unterhaltung', semester_id TEXT, document_id TEXT, document_title TEXT, lang TEXT NOT NULL DEFAULT 'de', deleted_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
  );
  await client.execute("CREATE TABLE chat_message (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL)");

  const doc = (id: string, userId: string, title: string, sem: string | null = null) =>
    client.execute({ sql: "INSERT INTO document (id, user_id, semester_id, title) VALUES (?,?,?,?)", args: [id, userId, sem, title] });
  let n = 0;
  const conv = async (id: string, userId: string, o: { doc?: string | null; sem?: string | null; at: number; deleted?: boolean; messages?: [string, string][] }) => {
    await client.execute({
      sql: "INSERT INTO chat_conversation (id, user_id, title, semester_id, document_id, document_title, deleted_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
      args: [id, userId, `Titel ${id}`, o.sem ?? null, o.doc ?? null, o.doc ? `Titel von ${o.doc}` : null, o.deleted ? T0 + o.at : null, T0 + o.at, T0 + o.at],
    });
    // Tous les messages d'un enregistrement tombent dans la MÊME seconde (la route écrit `base + i` ms).
    for (const [role, content] of o.messages ?? []) {
      await client.execute({ sql: "INSERT INTO chat_message (id, conversation_id, role, content, created_at) VALUES (?,?,?,?,?)", args: [`m${++n}`, id, role, content, T0 + o.at] });
    }
  };
  // biome-ignore lint/suspicious/noExplicitAny: base de test réduite aux colonnes lues
  return { client, db: dz.drizzle(client) as any, doc, conv };
}

/** Deux étudiantes, trois documents, des conversations dans chaque portée. */
async function seeded() {
  const m = await memoryDb();
  await m.doc("dA", "lena", "Elektrotechnik 1 – Skript", "s1");
  await m.doc("dB", "lena", "Technische Mechanik – Übungen", "s1");
  await m.doc("dX", "jonas", "Thermodynamik (Jonas)", "s9");
  await m.conv("a-alt", "lena", { doc: "dA", sem: "s1", at: 10, messages: [["user", "A: erste Frage"], ["assistant", "A: erste Antwort"]] });
  await m.conv("a-neu", "lena", {
    doc: "dA",
    sem: "s1",
    at: 50,
    messages: [["user", "A: Knotenregel?"], ["assistant", "A: Summe aller Ströme ist null."], ["user", "A: und die Maschenregel?"], ["assistant", "A: Summe aller Spannungen ist null."]],
  });
  await m.conv("b-1", "lena", { doc: "dB", sem: "s1", at: 40, messages: [["user", "B: Auflagerreaktionen?"], ["assistant", "B: je 5 kN."]] });
  await m.conv("g-s1", "lena", { doc: null, sem: "s1", at: 60, messages: [["user", "GLOBAL s1: Überblick?"], ["assistant", "GLOBAL s1: drei Skripte."]] });
  await m.conv("g-alle", "lena", { doc: null, sem: null, at: 30, messages: [["user", "GLOBAL alle: was habe ich?"]] });
  await m.conv("x-1", "jonas", { doc: "dX", sem: "s9", at: 70, messages: [["user", "JONAS: geheim"]] });
  return m;
}

const texts = (s: { messages: { content: string }[] }) => s.messages.map((x) => x.content);

describe("la session d'un document : sa dernière conversation, et rien d'autre", () => {
  test("le document A rend SA conversation la plus récente, messages dans l'ordre", async () => {
    const { db } = await seeded();
    const s = await sessionForScope(db, "lena", { documentId: "dA", semesterId: "s1" });
    expect(s.document).toEqual({ id: "dA", title: "Elektrotechnik 1 – Skript", semesterId: "s1" });
    expect(s.conversation?.id).toBe("a-neu");
    // Quatre messages enregistrés dans la même seconde : l'ordre d'écriture tient.
    expect(texts(s)).toEqual(["A: Knotenregel?", "A: Summe aller Ströme ist null.", "A: und die Maschenregel?", "A: Summe aller Spannungen ist null."]);
  });

  test("le document B a sa propre session : aucun message de A n'y entre", async () => {
    const { db } = await seeded();
    const s = await sessionForScope(db, "lena", { documentId: "dB", semesterId: "s1" });
    expect(s.conversation?.id).toBe("b-1");
    expect(texts(s)).toEqual(["B: Auflagerreaktionen?", "B: je 5 kN."]);
    expect(texts(s).join(" ")).not.toContain("A:");
    expect(texts(s).join(" ")).not.toContain("GLOBAL");
  });

  test("la portée du document ne dépend pas du semestre envoyé : un document n'a qu'une session", async () => {
    const { db } = await seeded();
    expect((await sessionForScope(db, "lena", { documentId: "dA", semesterId: null })).conversation?.id).toBe("a-neu");
    expect((await sessionForScope(db, "lena", { documentId: "dA" })).conversation?.id).toBe("a-neu");
  });

  test("un document sans conversation : tableau vide — et AUCUNE ligne n'est créée", async () => {
    const m = await seeded();
    await m.doc("dC", "lena", "Mathematik 2", "s1");
    const before = (await m.client.execute("SELECT count(*) AS c FROM chat_conversation")).rows[0]!.c;
    const s = await sessionForScope(m.db, "lena", { documentId: "dC", semesterId: "s1" });
    expect(s.document?.title).toBe("Mathematik 2");
    expect(s.conversation).toBeNull();
    expect(s.messages).toEqual([]);
    expect((await m.client.execute("SELECT count(*) AS c FROM chat_conversation")).rows[0]!.c).toBe(before);
  });

  test("une conversation à la corbeille n'est pas la session : la précédente revient", async () => {
    const m = await seeded();
    await m.conv("a-corbeille", "lena", { doc: "dA", sem: "s1", at: 90, deleted: true, messages: [["user", "A: supprimée"]] });
    const s = await sessionForScope(m.db, "lena", { documentId: "dA", semesterId: "s1" });
    expect(s.conversation?.id).toBe("a-neu");
  });
});

describe("la session globale (« Alle Materialien ») est une portée à part", () => {
  test("jamais une conversation liée à un document, même plus récente", async () => {
    const m = await seeded();
    await m.conv("a-tout-neuf", "lena", { doc: "dA", sem: "s1", at: 99, messages: [["user", "A: le plus récent de tous"]] });
    const s = await sessionForScope(m.db, "lena", { documentId: null, semesterId: "s1" });
    expect(s.document).toBeNull();
    expect(s.conversation?.id).toBe("g-s1");
    expect(texts(s)).toEqual(["GLOBAL s1: Überblick?", "GLOBAL s1: drei Skripte."]);
  });

  test("chaque semestre a la sienne ; sans semestre (« Alle Kurse ») aussi", async () => {
    const { db } = await seeded();
    expect((await sessionForScope(db, "lena", { documentId: null, semesterId: null })).conversation?.id).toBe("g-alle");
    expect((await sessionForScope(db, "lena", { documentId: null })).conversation?.id).toBe("g-alle");
    expect((await sessionForScope(db, "lena", { documentId: null, semesterId: "s2" })).conversation).toBeNull();
  });
});

describe("jamais la conversation — ni le document — d'un autre compte", () => {
  test("le document d'une autre étudiante : ni titre, ni conversation, comme un identifiant inventé", async () => {
    const { db } = await seeded();
    const foreign = await sessionForScope(db, "lena", { documentId: "dX", semesterId: "s9" });
    const invented = await sessionForScope(db, "lena", { documentId: "n-existe-pas", semesterId: null });
    expect(foreign).toEqual({ document: null, conversation: null, messages: [] });
    expect(invented).toEqual(foreign);
  });

  test("même identifiant de document dans une ligne d'un autre compte : seules MES conversations reviennent", async () => {
    const m = await seeded();
    // Ligne forgée : Jonas aurait enregistré une conversation sous l'identifiant du document de Lena.
    await m.conv("x-forge", "jonas", { doc: "dA", sem: "s1", at: 95, messages: [["user", "JONAS: intrus"]] });
    const s = await sessionForScope(m.db, "lena", { documentId: "dA", semesterId: "s1" });
    expect(s.conversation?.id).toBe("a-neu");
    expect(texts(s).join(" ")).not.toContain("JONAS");
    // Et Jonas n'obtient rien sur le document de Lena, pas même sa ligne forgée.
    expect(await sessionForScope(m.db, "jonas", { documentId: "dA", semesterId: "s1" })).toEqual({ document: null, conversation: null, messages: [] });
  });

  test("la session globale d'un compte ne voit pas celle d'un autre", async () => {
    const m = await seeded();
    await m.conv("g-jonas", "jonas", { doc: null, sem: null, at: 99, messages: [["user", "JONAS: global"]] });
    expect((await sessionForScope(m.db, "lena", { documentId: null, semesterId: null })).conversation?.id).toBe("g-alle");
  });

  test("document supprimé depuis : plus de session pour lui (l'historique reste dans le tiroir)", async () => {
    const m = await seeded();
    await m.client.execute("DELETE FROM document WHERE id = 'dB'");
    expect(await sessionForScope(m.db, "lena", { documentId: "dB", semesterId: "s1" })).toEqual({ document: null, conversation: null, messages: [] });
  });
});

describe("une conversation enregistrée ne change plus de document", () => {
  test("même portée : on enregistre", () => {
    expect(scopeMismatch({ documentId: "dA" }, { documentId: "dA" })).toBe(false);
    expect(scopeMismatch({ documentId: null }, { documentId: null })).toBe(false);
    expect(scopeMismatch({ documentId: null }, {})).toBe(false);
  });

  test("première sauvegarde : rien à comparer", () => {
    expect(scopeMismatch(undefined, { documentId: "dA" })).toBe(false);
    expect(scopeMismatch(null, { documentId: null })).toBe(false);
  });

  test("un autre document, ou passer du document au global (et l'inverse) : ce n'est plus la même portée", () => {
    expect(scopeMismatch({ documentId: "dA" }, { documentId: "dB" })).toBe(true);
    expect(scopeMismatch({ documentId: "dA" }, { documentId: null })).toBe(true);
    expect(scopeMismatch({ documentId: "dA" }, {})).toBe(true);
    expect(scopeMismatch({ documentId: null }, { documentId: "dA" })).toBe(true);
  });
});

describe("l'enregistrement (SQL réel) : la conversation reste sous SON document", () => {
  const NOW = new Date((T0 + 500) * 1000);
  const row = async (m: Awaited<ReturnType<typeof memoryDb>>, id: string) =>
    (await m.client.execute({ sql: "SELECT user_id, title, semester_id, document_id, document_title, updated_at FROM chat_conversation WHERE id = ?", args: [id] })).rows[0];
  const contents = async (m: Awaited<ReturnType<typeof memoryDb>>, id: string) =>
    (await m.client.execute({ sql: "SELECT content FROM chat_message WHERE conversation_id = ? ORDER BY created_at, rowid", args: [id] })).rows.map((r) => r.content);

  test("première sauvegarde : créée sous son document, avec ses messages dans l'ordre", async () => {
    const m = await seeded();
    const out = await saveConversation(m.db, "lena", { id: "neu", title: "  Frage zum Spannungsteiler  ", semesterId: "s1", documentId: "dA", documentTitle: "Elektrotechnik 1 – Skript", lang: "de", messages: [{ role: "user", content: "Q1" }, { role: "assistant", content: "A1" }] }, NOW);
    expect(out).toEqual({ id: "neu", scopeKept: false });
    expect(await row(m, "neu")).toMatchObject({ user_id: "lena", title: "Frage zum Spannungsteiler", semester_id: "s1", document_id: "dA", document_title: "Elektrotechnik 1 – Skript" });
    expect(await contents(m, "neu")).toEqual(["Q1", "A1"]);
    // Et c'est maintenant LA session du document.
    expect((await sessionForScope(m.db, "lena", { documentId: "dA", semesterId: "s1" })).conversation?.id).toBe("neu");
  });

  test("échange suivant, même document : les messages sont remplacés, rien n'est dupliqué", async () => {
    const m = await seeded();
    await saveConversation(m.db, "lena", { id: "a-neu", title: "T", semesterId: "s1", documentId: "dA", documentTitle: "Elektrotechnik 1 – Skript", messages: [{ role: "user", content: "Q1" }, { role: "assistant", content: "A1" }, { role: "user", content: "Q2" }] }, NOW);
    expect(await contents(m, "a-neu")).toEqual(["Q1", "A1", "Q2"]);
    expect((await row(m, "a-neu"))!.document_id).toBe("dA");
  });

  test("un client envoie un AUTRE document pour la même conversation : elle reste sous le sien", async () => {
    const m = await seeded();
    const out = await saveConversation(m.db, "lena", { id: "a-neu", title: "T", semesterId: "s1", documentId: "dB", documentTitle: "Technische Mechanik – Übungen", messages: [{ role: "user", content: "Q" }] }, NOW);
    expect(out.scopeKept).toBe(true);
    expect(await row(m, "a-neu")).toMatchObject({ document_id: "dA", document_title: "Titel von dA", semester_id: "s1" });
    // La session du document B n'a pas bougé : la conversation de A n'y est pas entrée.
    expect((await sessionForScope(m.db, "lena", { documentId: "dB", semesterId: "s1" })).conversation?.id).toBe("b-1");
  });

  test("l'app mobile rouvre une conversation SANS son document : l'historique reste rangé sous le document", async () => {
    const m = await seeded();
    // packages/mobile, écran chat/[id] ouvert depuis l'historique : ni documentId ni documentTitle.
    const out = await saveConversation(m.db, "lena", { id: "b-1", title: "B: Auflagerreaktionen?", documentId: null, semesterId: null, lang: "de", messages: [{ role: "user", content: "B: Auflagerreaktionen?" }, { role: "assistant", content: "B: je 5 kN." }, { role: "user", content: "und M(x)?" }] }, NOW);
    expect(out.scopeKept).toBe(true);
    expect(await row(m, "b-1")).toMatchObject({ document_id: "dB", document_title: "Titel von dB", semester_id: "s1" });
    expect(await contents(m, "b-1")).toEqual(["B: Auflagerreaktionen?", "B: je 5 kN.", "und M(x)?"]);
    // Elle n'est pas devenue la session globale.
    expect((await sessionForScope(m.db, "lena", { documentId: null, semesterId: null })).conversation?.id).toBe("g-alle");
  });

  test("même document, sans titre de document dans l'envoi : le titre déjà connu reste", async () => {
    const m = await seeded();
    await saveConversation(m.db, "lena", { id: "a-neu", title: "T", semesterId: "s1", documentId: "dA", messages: [{ role: "user", content: "Q" }] }, NOW);
    expect((await row(m, "a-neu"))!.document_title).toBe("Titel von dA");
  });

  test("l'identifiant d'une conversation d'un autre compte : refusé, rien n'est écrasé ni effacé", async () => {
    const m = await seeded();
    expect(saveConversation(m.db, "lena", { id: "x-1", title: "Übernahme", documentId: null, messages: [{ role: "user", content: "LENA schreibt hinein" }] }, NOW)).rejects.toThrow("NOT_OWNER");
    await Promise.resolve();
    expect(await row(m, "x-1")).toMatchObject({ user_id: "jonas", document_id: "dX" });
    expect(await contents(m, "x-1")).toEqual(["JONAS: geheim"]);
  });
});

describe("l'adresse porte le document : /chat?doc=…", () => {
  test("lire le document de l'adresse", () => {
    expect(docFromSearch("?doc=4ad5dcc3-412e-403b-ae3e-1e4ffb9ff14b")).toBe("4ad5dcc3-412e-403b-ae3e-1e4ffb9ff14b");
    expect(docFromSearch("doc=abc_123&utm_source=tiktok")).toBe("abc_123");
    expect(docFromSearch("?utm_source=tiktok&doc=abc")).toBe("abc");
  });

  test("absent, vide ou farfelu : portée globale", () => {
    expect(docFromSearch("")).toBeNull();
    expect(docFromSearch("?doc=")).toBeNull();
    expect(docFromSearch("?document=abc")).toBeNull();
    expect(docFromSearch("?doc=<script>alert(1)</script>")).toBeNull();
    expect(docFromSearch(`?doc=${"a".repeat(129)}`)).toBeNull();
  });

  test("écrire le document dans l'adresse sans toucher aux autres paramètres", () => {
    expect(searchWithDoc("", "dA")).toBe("?doc=dA");
    expect(searchWithDoc("?utm_source=tiktok", "dA")).toBe("?utm_source=tiktok&doc=dA");
    expect(searchWithDoc("?doc=dA&utm_source=tiktok", "dB")).toBe("?doc=dB&utm_source=tiktok");
  });

  test("portée globale : le paramètre disparaît", () => {
    expect(searchWithDoc("?doc=dA", null)).toBe("");
    expect(searchWithDoc("?doc=dA&utm_source=tiktok", null)).toBe("?utm_source=tiktok");
    expect(searchWithDoc("", null)).toBe("");
  });
});

describe("le tiroir d'historique : les conversations de la portée ouverte", () => {
  const list = [
    { id: "a-neu", documentId: "dA", semesterId: "s1" },
    { id: "g-s1", documentId: null, semesterId: "s1" },
    { id: "b-1", documentId: "dB", semesterId: "s1" },
    { id: "a-alt", documentId: "dA", semesterId: "s1" },
    { id: "g-alle", documentId: null, semesterId: null },
  ];

  test("un document : ses conversations seulement, ordre de la liste gardé", () => {
    expect(conversationsOfScope(list, { documentId: "dA", semesterId: "s1" }).map((c) => c.id)).toEqual(["a-neu", "a-alt"]);
    expect(conversationsOfScope(list, { documentId: "dB", semesterId: null }).map((c) => c.id)).toEqual(["b-1"]);
  });

  test("global : seulement les conversations sans document, du même semestre", () => {
    expect(conversationsOfScope(list, { documentId: null, semesterId: "s1" }).map((c) => c.id)).toEqual(["g-s1"]);
    expect(conversationsOfScope(list, { documentId: null, semesterId: null }).map((c) => c.id)).toEqual(["g-alle"]);
  });
});

describe("la reprise n'écrase jamais une question déjà posée", () => {
  const fresh = { requestToken: 3, currentToken: 3, freshSessionId: "s-new", currentSessionId: "s-new", messageCount: 0 };

  test("rien n'a bougé pendant le chargement : on reprend l'historique", () => {
    expect(mayApplyResume(fresh)).toBe(true);
  });

  test("l'étudiant a déjà changé de document : la réponse en retard est ignorée", () => {
    expect(mayApplyResume({ ...fresh, currentToken: 4 })).toBe(false);
  });

  test("il a déjà écrit dans le tableau vide : sa question reste, l'historique attend dans le tiroir", () => {
    expect(mayApplyResume({ ...fresh, messageCount: 1 })).toBe(false);
  });

  test("une autre conversation a été ouverte entre-temps : on n'y touche pas", () => {
    expect(mayApplyResume({ ...fresh, currentSessionId: "s-autre" })).toBe(false);
  });
});

describe("branchement", () => {
  const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8");
  const ROUTES = read("../src/api/routes/chats.ts");
  const PAGE = read("../src/web/pages/chat.tsx");
  const BOARD = read("../src/web/components/tafel-board.tsx");

  test("la route de session lit la portée pour le compte de la session, jamais un autre", () => {
    expect(ROUTES).toMatch(/forScope: authed/);
    expect(ROUTES).toContain("sessionForScope(db, context.user.id");
  });

  test("l'enregistrement passe par la règle « une conversation reste sous son document »", () => {
    expect(ROUTES).toContain("saveConversation(db, context.user.id, input)");
    // Pas de refus pour une portée différente : un client plus ancien perdrait son historique.
    expect(ROUTES).not.toContain("CONFLICT");
  });

  test("l'app mobile continue une conversation rouverte avec SA portée, pas celle de l'adresse", () => {
    const MOBILE = read("../../mobile/app/chat/[id].tsx");
    expect(MOBILE).toContain("existing.data?.conversation");
    expect(MOBILE).toContain("documentId: scope.documentId ?? null");
  });

  test("une instance de chat PAR conversation : changer de conversation coupe le flux en cours", () => {
    // useChat recrée son instance quand `id` change et arrête l'ancienne (@ai-sdk/react).
    expect(PAGE).toMatch(/useChat\(\{[^}]*id: session\.id/s);
    // Le document envoyé au tuteur est celui de la session — pas un état à part.
    expect(PAGE).toContain("docIdRef.current = session.doc?.id ?? null");
    expect(PAGE).not.toContain("setMessages([])");
  });

  test("changer de document demande au serveur la session de CE document", () => {
    expect(PAGE).toContain("client.chats.forScope(");
    expect(PAGE).toContain("mayApplyResume(");
  });

  test("le badge du document est posé sur le tableau", () => {
    expect(PAGE).toContain("scopeBadge=");
    expect(BOARD).toContain('data-testid="board-scope"');
  });

  test("« Neuer Chat » garde le document : une nouvelle branche, pas une autre portée", () => {
    const body = PAGE.slice(PAGE.indexOf("function newChat()"), PAGE.indexOf("function applyConversation("));
    expect(body).toContain("doc: current.doc");
    // Il ne supprime rien : l'ancienne conversation reste dans l'historique du document.
    expect(body).not.toMatch(/remove|delete|purge/i);
  });

  test("supprimer le document ouvert ramène à « Alle Materialien » : la session ne reste pas sur un document disparu", () => {
    const LIBRARY = read("../src/web/components/document-library.tsx");
    const body = LIBRARY.slice(LIBRARY.indexOf("async function handleDelete("), LIBRARY.indexOf("const busy = progress"));
    expect(body).toContain("if (id === activeId) onSelect(null);");
  });

  test("le tiroir d'historique montre d'abord les conversations du document ouvert", () => {
    expect(PAGE).toContain("conversationsOfScope(convList, { documentId: activeDoc?.id ?? null");
    expect(PAGE).toContain("shownConvs.map(");
  });

  test("les textes du badge et du tiroir existent dans les douze langues", () => {
    for (const lang of ["ar", "bn", "de", "en", "es", "fr", "hi", "it", "ja", "pt", "ru", "zh"]) {
      const src = read(`../src/web/i18n/messages/${lang}.ts`);
      for (const key of ["boardScopeLabel", "historyAll", "noHistoryScope"]) expect(src).toContain(`    ${key}: "`);
    }
  });
});
