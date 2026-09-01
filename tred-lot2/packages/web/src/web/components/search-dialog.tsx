import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  FileText,
  Loader2,
  MessageSquare,
  PenSquare,
  Printer,
  Search,
  X,
} from "lucide-react";
import { client } from "@/lib/api";
import { searchAllOptions } from "@/queries/search";
import { MarkdownContent } from "@/components/markdown-content";
import { printElement } from "@/lib/pdf-print";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";

/**
 * Recherche globale — la palette Ctrl/⌘ + K.
 *
 * Elle existe parce qu'au bout d'un semestre l'application contient une
 * quarantaine de documents et des dizaines de conversations : sans recherche,
 * retrouver « ce que l'IA m'avait expliqué sur le moment fléchissant » veut
 * dire rouvrir les conversations une par une jusqu'à tomber dessus.
 *
 * Le serveur ne renvoie qu'un extrait de 320 caractères par résultat, jamais le
 * document entier (voir api/routes/search.ts) : la palette reste rapide même
 * avec des polycopiés de plusieurs centaines de pages.
 */

type Hit = {
  id: string;
  kind: "document" | "conversation" | "exercise";
  title: string;
  excerpt: string | null;
  from: number;
  to: number;
  meta: string;
  semesterId: string | null;
  documentTitle?: string | null;
  score: number;
};

/** Surligne le morceau trouvé sans jamais interpréter le texte comme du HTML. */
function Excerpt({ hit }: { hit: Hit }) {
  if (!hit.excerpt) return null;

  const { excerpt, from, to } = hit;
  const valid = to > from && from >= 0 && to <= excerpt.length;

  if (!valid) {
    return (
      <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">{excerpt}</p>
    );
  }

  return (
    <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
      {excerpt.slice(0, from)}
      <mark className="bg-primary/20 text-foreground rounded-[3px] px-0.5">
        {excerpt.slice(from, to)}
      </mark>
      {excerpt.slice(to)}
    </p>
  );
}

const ICONS = {
  document: FileText,
  conversation: MessageSquare,
  exercise: PenSquare,
} as const;

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const [location, navigate] = useLocation();

  const [raw, setRaw] = useState("");
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const [preview, setPreview] = useState<{ title: string; body: string } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // On interroge le serveur 220 ms après la dernière frappe. Sans ce délai,
  // « Biegemoment » déclencherait douze requêtes au lieu d'une.
  useEffect(() => {
    const id = setTimeout(() => setQ(raw.trim()), 220);
    return () => clearTimeout(id);
  }, [raw]);

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    // Le focus doit arriver APRÈS l'ouverture, sinon le navigateur le pose sur
    // un élément encore invisible et l'ignore.
    const id = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(id);
  }, [open]);

  const enabled = open && q.length >= 2;

  const { data, isFetching } = useQuery({
    ...searchAllOptions(q),
    enabled,
    // Le résultat d'une recherche vieillit vite (un document vient d'être
    // ajouté) mais pas en quelques secondes.
    staleTime: 30_000,
  });

  const groups = useMemo(() => {
    const d = (data?.documents ?? []) as Hit[];
    const c = (data?.conversations ?? []) as Hit[];
    const e = (data?.exercises ?? []) as Hit[];
    return [
      { key: "documents", label: t("search.documents"), items: d },
      { key: "conversations", label: t("search.conversations"), items: c },
      { key: "exercises", label: t("search.exercises"), items: e },
    ].filter((g) => g.items.length > 0);
  }, [data, t]);

  /** Tous les résultats à plat — c'est sur cette liste que ↑ ↓ se déplacent. */
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => {
    setCursor(0);
  }, [q]);

  /* ── Ouverture d'un résultat ───────────────────────────────────────────── */

  function goToChat(detail: unknown, eventName: string, key: string) {
    // Deux chemins, parce que la page de discussion peut déjà être à l'écran
    // ou pas encore montée :
    //   • déjà là   → l'événement la prévient tout de suite ;
    //   • ailleurs  → la clé de session survit à la navigation et la page la
    //     lit à son démarrage.
    try {
      sessionStorage.setItem(key, JSON.stringify(detail));
    } catch {
      /* navigation privée : l'événement ci-dessous suffira si on est déjà là */
    }
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
    if (location !== "/chat") navigate("/chat");
    onClose();
  }

  async function openHit(hit: Hit) {
    if (hit.kind === "conversation") {
      goToChat(hit.id, "tred:open-chat", "tred.openChat");
      return;
    }

    if (hit.kind === "document") {
      goToChat(
        { id: hit.id, title: hit.title },
        "tred:open-doc",
        "tred.openDoc",
      );
      return;
    }

    // Un exercice s'ouvre SUR PLACE. Il n'a pas de page à lui : le renvoyer
    // vers l'historique obligerait à le retrouver une seconde fois.
    setPreviewBusy(true);
    try {
      const full = await client.savedExercises.get({ id: hit.id });
      if (!full) return;
      const body =
        full.statement +
        (full.solution ? `\n\n---\n\n### ${t("search.solution")}\n\n${full.solution}` : "");
      setPreview({ title: full.title || hit.title, body });
    } catch {
      setPreview({ title: hit.title, body: t("search.loadFailed") });
    } finally {
      setPreviewBusy(false);
    }
  }

  /**
   * Aperçu imprimable d'une conversation.
   *
   * C'est ici que vit l'export PDF d'une discussion, et non dans la page de
   * discussion elle-même : l'aperçu réutilise le rendu Markdown + KaTeX de
   * l'application, donc les formules sortent en vectoriel et restent
   * sélectionnables dans le PDF — ce qu'une capture d'écran ne donnera jamais.
   */
  async function previewConversation(hit: Hit) {
    setPreviewBusy(true);
    try {
      const res = await client.chats.get({ id: hit.id });
      if (!res) return;
      const body = res.messages
        .map((m) => {
          const who = m.role === "user" ? t("search.question") : t("search.answer");
          return `### ${who}\n\n${m.content}`;
        })
        .join("\n\n---\n\n");
      setPreview({
        title: res.conversation.title || hit.title,
        body: body || t("search.emptyConversation"),
      });
    } catch {
      setPreview({ title: hit.title, body: t("search.loadFailed") });
    } finally {
      setPreviewBusy(false);
    }
  }

  /* ── Clavier ───────────────────────────────────────────────────────────── */

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (preview) setPreview(null);
      else onClose();
      return;
    }
    if (preview || flat.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (c + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (c - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = flat[cursor];
      if (hit) void openHit(hit);
    }
  }

  // Garder la ligne sélectionnée visible quand on descend au clavier.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  const nothing = enabled && !isFetching && flat.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh]"
      role="dialog"
      aria-modal="true"
      aria-label={t("search.title")}
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      <div
        className="bg-card border-border relative flex max-h-[75vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-2xl"
        onKeyDown={onKeyDown}
      >
        {/* ── Barre de saisie ─────────────────────────────────────────────── */}
        <div className="border-border flex items-center gap-3 border-b px-4 py-3">
          {preview ? (
            <button
              onClick={() => setPreview(null)}
              className="text-muted-foreground hover:text-foreground shrink-0"
              aria-label={t("search.back")}
            >
              <ArrowLeft className="size-5" />
            </button>
          ) : (
            <Search className="text-muted-foreground size-5 shrink-0" />
          )}

          {preview ? (
            <span className="flex-1 truncate text-sm font-semibold">{preview.title}</span>
          ) : (
            <input
              ref={inputRef}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={t("search.placeholder")}
              className="placeholder:text-muted-foreground flex-1 bg-transparent text-sm outline-none"
              autoComplete="off"
              spellCheck={false}
            />
          )}

          {(isFetching || previewBusy) && (
            <Loader2 className="text-muted-foreground size-4 shrink-0 animate-spin" />
          )}

          {preview && (
            <button
              onClick={() => printElement(printRef.current, { title: preview.title })}
              className="text-muted-foreground hover:text-foreground shrink-0"
              aria-label={t("search.exportPdf")}
              title={t("search.exportPdf")}
            >
              <Printer className="size-4" />
            </button>
          )}

          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label={t("search.close")}
          >
            <X className="size-4" />
          </button>
        </div>

        {/* ── Aperçu d'un exercice ────────────────────────────────────────── */}
        {preview ? (
          <div className="overflow-y-auto p-5">
            <div ref={printRef}>
              <MarkdownContent content={preview.body} />
            </div>
          </div>
        ) : (
          <div ref={listRef} className="overflow-y-auto">
            {q.length < 2 && (
              <p className="text-muted-foreground px-4 py-8 text-center text-sm">
                {t("search.hint")}
              </p>
            )}

            {nothing && (
              <p className="text-muted-foreground px-4 py-8 text-center text-sm">
                {t("search.empty", { q })}
              </p>
            )}

            {groups.map((group) => (
              <div key={group.key} className="py-1">
                <p className="text-muted-foreground px-4 pt-2 pb-1 text-[11px] font-semibold tracking-wide uppercase">
                  {group.label}
                </p>
                <ul>
                  {group.items.map((hit) => {
                    const index = flat.indexOf(hit);
                    const Icon = ICONS[hit.kind];
                    return (
                      <li key={`${hit.kind}:${hit.id}`}>
                        {/* Une ligne = deux actions. Le conteneur ne peut donc
                            pas être un bouton : un bouton dans un bouton est du
                            HTML invalide, que les lecteurs d'écran annoncent de
                            travers et que React finit par refuser. */}
                        <div
                          data-active={index === cursor}
                          onMouseEnter={() => setCursor(index)}
                          className={cn(
                            "group flex items-start gap-3 px-4 transition-colors",
                            index === cursor ? "bg-accent" : "hover:bg-accent/50",
                          )}
                        >
                          <button
                            onClick={() => void openHit(hit)}
                            className="flex min-w-0 flex-1 items-start gap-3 py-2.5 text-left"
                          >
                            <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline gap-2">
                                <span className="truncate text-sm font-medium">
                                  {hit.title}
                                </span>
                                {hit.meta && (
                                  <span className="text-muted-foreground shrink-0 text-[11px] capitalize">
                                    {hit.meta}
                                  </span>
                                )}
                              </span>
                              <Excerpt hit={hit} />
                            </span>
                          </button>

                          {hit.kind !== "document" && (
                            <button
                              onClick={() =>
                                void (hit.kind === "conversation"
                                  ? previewConversation(hit)
                                  : openHit(hit))
                              }
                              className="text-muted-foreground hover:text-foreground mt-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                              aria-label={t("search.exportPdf")}
                              title={t("search.exportPdf")}
                            >
                              <Printer className="size-3.5" />
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            {data?.truncated && (
              <p className="text-muted-foreground border-border border-t px-4 py-2 text-[11px]">
                {t("search.more")}
              </p>
            )}
          </div>
        )}

        {/* ── Aide clavier ────────────────────────────────────────────────── */}
        {!preview && flat.length > 0 && (
          <div className="border-border text-muted-foreground flex items-center gap-4 border-t px-4 py-2 text-[11px]">
            <span>↑ ↓ {t("search.navigate")}</span>
            <span>↵ {t("search.open")}</span>
            <span>Esc {t("search.close")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Ouvre la palette avec Ctrl/⌘ + K depuis n'importe où.
 *
 * Volontairement actif AUSSI pendant la saisie : c'est devenu le réflexe, et un
 * raccourci qui marche partout sauf là où l'on écrit passe pour cassé. Rien
 * n'est perdu — le texte en cours reste dans son champ, la palette ne fait que
 * s'ouvrir par-dessus.
 */
export function useSearchShortcut(onOpen: () => void) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      onOpen();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpen]);
}
