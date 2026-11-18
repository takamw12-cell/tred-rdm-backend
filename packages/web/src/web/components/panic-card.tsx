import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import katex from "katex";
import { FileText, Loader2, Siren, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { useLocaleStore } from "@/stores/locale";
import { documentsListOptions } from "@/queries/documents";

/**
 * « Panik-Modus » : la veille d'un examen, trois notions et trois formules
 * tirées d'UN document de l'étudiant (POST /api/agent/panic, api/lib/panic.ts).
 *
 * Chaque ligne porte la page du document où le serveur a retrouvé sa phrase,
 * mot pour mot : ce que la feuille affiche est dans le cours, rien d'autre.
 * « Erklären lassen » pose la question dans le Hörsaal sans l'envoyer — c'est
 * là que se trouve « Als Video erklären ».
 *
 * Trois feuilles par jour et par compte (le serveur compte).
 */

interface CheatSheet {
  title: string;
  concepts: Array<{ title: string; core: string; quote: string; page: number }>;
  formulas: Array<{ name: string; latex: string; meaning: string; quote: string; page: number }>;
}

const tex = (latex: string) => katex.renderToString(latex, { throwOnError: false, displayMode: true, output: "html" });

export function PanicCard() {
  const { t } = useT();
  const locale = useLocaleStore((s) => s.locale);
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [docId, setDocId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<CheatSheet | null>(null);
  const docs = useQuery({ ...documentsListOptions(), enabled: open });
  const list = (docs.data ?? []) as Array<{ id: string; title: string }>;
  const chosen = docId || list[0]?.id || "";

  async function generate() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    setSheet(null);
    try {
      const res = await fetch("/api/agent/panic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: chosen, locale }) });
      const body = (await res.json().catch(() => ({}))) as Partial<CheatSheet> & { error?: string };
      if (res.ok && body.concepts && body.formulas) setSheet(body as CheatSheet);
      else setError(res.status === 429 ? t("panic.limit") : body.error === "too_short" ? t("panic.tooShort") : body.error === "nothing_grounded" ? t("panic.nothing") : res.status === 503 ? t("panic.unavailable") : t("panic.error"));
    } catch {
      setError(t("panic.error"));
    } finally {
      setBusy(false);
    }
  }

  function explain(topic: string) {
    try {
      sessionStorage.setItem("tred.askDraft", JSON.stringify(t("panic.askDraft", { topic })));
    } catch {
      /* navigation privée : le Hörsaal s'ouvre, le champ reste vide */
    }
    navigate("/chat");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="panic-button"
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#B91C1C] px-5 py-3.5 text-[15px] font-bold text-white shadow-[0_10px_30px_-12px_rgb(185_28_28/0.9)] transition hover:bg-[#991B1B] focus-visible:ring-4 focus-visible:ring-[#FCA5A5]/60 focus-visible:outline-none sm:w-auto"
      >
        <Siren className="size-5" aria-hidden />
        {t("panic.button")}
      </button>
    );
  }

  return (
    <Card className="overflow-hidden border-[#B91C1C]/40 p-0" data-testid="panic-panel">
      <div className="flex items-center justify-between gap-3 bg-[#B91C1C] px-5 py-3 text-white">
        <p className="flex items-center gap-2 font-semibold">
          <Siren className="size-5" aria-hidden />
          {t("panic.title")}
        </p>
        <button type="button" onClick={() => setOpen(false)} aria-label={t("panic.close")} className="grid size-8 place-items-center rounded-lg hover:bg-white/15">
          <X className="size-4" />
        </button>
      </div>
      <div className="space-y-4 p-5">
        <p className="text-muted-foreground text-sm">{t("panic.intro")}</p>
        {docs.isLoading ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden /> {t("panic.loadingDocs")}
          </p>
        ) : list.length === 0 ? (
          <p className="text-sm" data-testid="panic-no-docs">{t("panic.noDocs")}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="panic-doc">{t("panic.document")}</label>
            <select id="panic-doc" value={chosen} onChange={(e) => setDocId(e.target.value)} className="border-input bg-background h-10 min-w-0 flex-1 rounded-xl border px-3 text-sm" data-testid="panic-doc">
              {list.map((d) => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </select>
            <Button onClick={() => void generate()} disabled={busy || !chosen} className="h-10 rounded-xl bg-[#B91C1C] font-semibold text-white hover:bg-[#991B1B]" data-testid="panic-generate">
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? t("panic.working") : t("panic.generate")}
            </Button>
          </div>
        )}
        {error && <p className="text-sm font-medium text-[#991B1B] dark:text-[#FCA5A5]" role="alert">{error}</p>}

        {sheet && (
          <div className="grid gap-5 lg:grid-cols-2" data-testid="cheat-sheet">
            <section>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-[#B91C1C] dark:text-[#FCA5A5]">{t("panic.concepts")}</h3>
              <ol className="space-y-3">
                {sheet.concepts.map((k, i) => (
                  <li key={k.quote} className="border-border rounded-xl border p-3" data-testid="cheat-concept">
                    <p className="font-semibold">{i + 1}. {k.title}</p>
                    <p className="mt-1 text-sm">{k.core}</p>
                    <p className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
                      <FileText className="size-3.5 shrink-0" aria-hidden />
                      {t("panic.source", { title: sheet.title, page: k.page })}
                    </p>
                    <Button variant="outline" size="sm" className="mt-2 rounded-full" onClick={() => explain(k.title)}>{t("panic.explain")}</Button>
                  </li>
                ))}
                {sheet.concepts.length === 0 && <li className="text-muted-foreground text-sm">{t("panic.noneFound")}</li>}
              </ol>
            </section>
            <section>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-[#B91C1C] dark:text-[#FCA5A5]">{t("panic.formulas")}</h3>
              <ol className="space-y-3">
                {sheet.formulas.map((f) => (
                  <li key={f.quote} className="border-border rounded-xl border p-3" data-testid="cheat-formula">
                    <p className="font-semibold">{f.name}</p>
                    {/* eslint-disable-next-line react/no-danger -- sortie de KaTeX, formule vérifiée par le serveur (cleanLatexForDisplay) */}
                    <div className="overflow-x-auto py-1 text-lg" dangerouslySetInnerHTML={{ __html: tex(f.latex) }} />
                    <p className="text-sm">{f.meaning}</p>
                    <p className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
                      <FileText className="size-3.5 shrink-0" aria-hidden />
                      {t("panic.source", { title: sheet.title, page: f.page })}
                    </p>
                  </li>
                ))}
                {sheet.formulas.length === 0 && <li className="text-muted-foreground text-sm">{t("panic.noneFound")}</li>}
              </ol>
            </section>
          </div>
        )}
      </div>
    </Card>
  );
}
