import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { Check, Loader2, PartyPopper, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { Link } from "wouter";
import { PageContainer, PageHeader } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MarkdownContent } from "@/components/markdown-content";
import { orpc } from "@/lib/api";
import { documentsListOptions } from "@/queries/documents";
import { useFeatures } from "@/queries/features";
import { useGenerateFlashcards } from "@/lib/flashcards-api";
import { track } from "@/lib/analytics";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * /flashcards — la révision du jour, une carte à la fois.
 *
 *   Retourner : clic / tap sur la carte, ou Espace.
 *   « Gewusst »       bouton vert, flèche →, ou glisser la carte à droite.
 *   « Nicht gewusst » bouton, flèche ←, ou glisser à gauche → revient demain.
 *
 * La file est figée au chargement : une carte ratée ne revient pas dans la
 * même séance (elle revient demain, règle du fondateur).
 */

type Card = {
  id: string;
  front: string;
  back: string;
  topic: string;
  sourceLabel: string;
  intervalDays: number;
  reviews: number;
  nextReviewDate: Date | string;
};

const SWIPE_PX = 110;

export default function FlashcardsPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const features = useFeatures();
  const summary = useQuery(orpc.flashcards.summary.queryOptions());
  const dueQuery = useQuery({ ...orpc.flashcards.due.queryOptions({ input: { limit: 100 } }), staleTime: Infinity });
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [tally, setTally] = useState({ knew: 0, forgot: 0 });
  const [showAll, setShowAll] = useState(false);

  // La file de la séance : prise une fois, puis indépendante des rafraîchissements.
  useEffect(() => {
    if (queue === null && dueQuery.data) setQueue(dueQuery.data as Card[]);
  }, [dueQuery.data, queue]);

  const review = useMutation({
    ...orpc.flashcards.review.mutationOptions(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: orpc.flashcards.summary.key() }),
  });

  const current = queue?.[pos] ?? null;
  const answer = useCallback(
    (knew: boolean) => {
      if (!current || review.isPending) return;
      review.mutate({ id: current.id, knew });
      setTally((s) => (knew ? { ...s, knew: s.knew + 1 } : { ...s, forgot: s.forgot + 1 }));
      setFlipped(false);
      setPos((p) => p + 1);
      if (queue && pos + 1 >= queue.length) track("flashcards_session_done", { cards: queue.length });
    },
    [current, review, queue, pos],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !current) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === "ArrowRight") answer(true);
      else if (e.key === "ArrowLeft") answer(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, answer]);

  function restart() {
    setQueue(null);
    setPos(0);
    setTally({ knew: 0, forgot: 0 });
    void qc.invalidateQueries({ queryKey: orpc.flashcards.key() });
  }

  const unavailable = summary.data && !summary.data.available;
  const total = summary.data?.total ?? 0;
  const done = queue !== null && pos >= queue.length;

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title={t("flashcards.title")} subtitle={t("flashcards.subtitle")} />

      {unavailable ? (
        <Card className="p-5 text-sm">{t("flashcards.errUnavailable")}</Card>
      ) : (
        <>
          {/* La séance */}
          <section aria-label={t("flashcards.sessionLabel")} className="mb-8">
            {queue === null || dueQuery.isLoading ? (
              <p className="text-muted-foreground flex items-center justify-center gap-2 py-16 text-sm">
                <Loader2 className="size-4 animate-spin" /> {t("common.loading")}
              </p>
            ) : queue.length === 0 ? (
              <EmptyDeck total={total} />
            ) : done ? (
              <SessionDone knew={tally.knew} forgot={tally.forgot} onRestart={restart} />
            ) : (
              current && (
                <>
                  <div className="text-muted-foreground mb-3 flex items-center justify-between text-xs tabular-nums">
                    <span>{t("flashcards.progress", { n: pos + 1, total: queue.length })}</span>
                    <span className="hidden sm:inline">{t("flashcards.hintKeys")}</span>
                  </div>
                  {/* Décoratif : « Karte n von N » juste au-dessus dit déjà la progression. */}
                  <div className="bg-secondary mb-4 h-1.5 overflow-hidden rounded-full" aria-hidden>
                    <div className="h-full rounded-full bg-[#EAB308] transition-all" style={{ width: `${(pos / queue.length) * 100}%` }} />
                  </div>
                  <AnimatePresence mode="wait">
                    <SwipeCard
                      key={current.id}
                      card={current}
                      flipped={flipped}
                      onFlip={() => setFlipped((f) => !f)}
                      onSwipe={answer}
                    />
                  </AnimatePresence>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      onClick={() => answer(false)}
                      disabled={review.isPending}
                      className="hover:border-learning/60 hover:bg-learning/10 h-12 rounded-xl"
                    >
                      <X className="size-4" /> {t("flashcards.forgot")}
                    </Button>
                    <Button
                      onClick={() => answer(true)}
                      disabled={review.isPending}
                      className="h-12 rounded-xl bg-[#EAB308] font-semibold text-[#0F172A] hover:bg-[#CA8A04] hover:text-[#0F172A]"
                    >
                      <Check className="size-4" /> {t("flashcards.knew")}
                    </Button>
                  </div>
                  <p className="text-muted-foreground mt-2 text-center text-[11px]">{t("flashcards.forgotHint")}</p>
                </>
              )
            )}
          </section>

          {features.flashcards && <GeneratePanel />}

          {total > 0 && (
            <section className="mt-8">
              <button
                type="button"
                onClick={() => setShowAll((s) => !s)}
                className="text-muted-foreground hover:text-foreground text-sm font-medium underline-offset-4 hover:underline"
                aria-expanded={showAll}
              >
                {showAll ? t("flashcards.hideAll") : t("flashcards.showAll", { n: total })}
              </button>
              {showAll && <AllCards />}
            </section>
          )}
        </>
      )}
    </PageContainer>
  );
}

function SwipeCard({
  card,
  flipped,
  onFlip,
  onSwipe,
}: {
  card: Card;
  flipped: boolean;
  onFlip: () => void;
  onSwipe: (knew: boolean) => void;
}) {
  const { t } = useT();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], [-10, 10]);
  const knewOpacity = useTransform(x, [20, SWIPE_PX], [0, 1]);
  const forgotOpacity = useTransform(x, [-SWIPE_PX, -20], [1, 0]);

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > SWIPE_PX) onSwipe(true);
    else if (info.offset.x < -SWIPE_PX) onSwipe(false);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.18 }}
      style={{ x, rotate }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.9}
      onDragEnd={onDragEnd}
      className="relative cursor-grab touch-pan-y select-none active:cursor-grabbing"
    >
      <motion.span
        style={{ opacity: knewOpacity }}
        className="pointer-events-none absolute top-4 left-4 z-10 rounded-md border-2 border-emerald-500 px-2 py-0.5 text-xs font-bold text-emerald-600 uppercase"
        aria-hidden
      >
        {t("flashcards.knew")}
      </motion.span>
      <motion.span
        style={{ opacity: forgotOpacity }}
        className="border-learning text-learning pointer-events-none absolute top-4 right-4 z-10 rounded-md border-2 px-2 py-0.5 text-xs font-bold uppercase"
        aria-hidden
      >
        {t("flashcards.forgot")}
      </motion.span>

      <button
        type="button"
        onClick={onFlip}
        aria-pressed={flipped}
        aria-label={flipped ? t("flashcards.showFront") : t("flashcards.showBack")}
        className="block w-full [perspective:1200px] focus-visible:outline-none"
      >
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
          className="relative grid min-h-[17rem] [transform-style:preserve-3d] sm:min-h-[19rem]"
        >
          <Face side="front" topic={card.topic} source={card.sourceLabel} label={t("flashcards.front")}>
            <MarkdownContent content={card.front} className="text-lg font-semibold sm:text-xl [&_p]:my-0" />
            <span className="text-muted-foreground mt-6 text-xs">{t("flashcards.tapToFlip")}</span>
          </Face>
          <Face side="back" topic={card.topic} source={card.sourceLabel} label={t("flashcards.back")}>
            <MarkdownContent content={card.back} className="text-base sm:text-lg [&_p]:my-1" />
          </Face>
        </motion.div>
      </button>
    </motion.div>
  );
}

function Face({
  side,
  topic,
  source,
  label,
  children,
}: {
  side: "front" | "back";
  topic: string;
  source: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "col-start-1 row-start-1 flex flex-col items-center justify-center rounded-2xl border p-6 text-center shadow-sm [backface-visibility:hidden] sm:p-8",
        side === "front"
          ? "border-[#E7E2D8] bg-[#FDFBF7] text-[#1A1A1A] dark:border-white/10 dark:bg-[#0F172A] dark:text-white"
          : "border-[#EAB308]/50 bg-white text-[#1A1A1A] [transform:rotateY(180deg)] dark:bg-[#111c33] dark:text-white",
      )}
    >
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-5 pt-4 text-[11px] tracking-wide uppercase">
        <span className="font-semibold text-[#CA8A04] dark:text-[#EAB308]">{label}</span>
        <span className="text-muted-foreground max-w-[60%] truncate" title={source}>
          {topic || source}
        </span>
      </div>
      <div className="w-full min-w-0 pt-4">{children}</div>
    </div>
  );
}

function EmptyDeck({ total }: { total: number }) {
  const { t } = useT();
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
        <Sparkles className="text-signature size-6" />
        <p className="font-display text-base font-semibold">{total > 0 ? t("flashcards.allDone") : t("flashcards.emptyTitle")}</p>
        <p className="text-muted-foreground max-w-md text-sm">{total > 0 ? t("flashcards.allDoneHint") : t("flashcards.emptyHint")}</p>
      </CardContent>
    </Card>
  );
}

function SessionDone({ knew, forgot, onRestart }: { knew: number; forgot: number; onRestart: () => void }) {
  const { t } = useT();
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <PartyPopper className="size-7 text-[#EAB308]" />
        <p className="font-display text-lg font-semibold">{t("flashcards.sessionDone")}</p>
        <output className="text-muted-foreground text-sm tabular-nums">{t("flashcards.sessionTally", { knew, forgot })}</output>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={onRestart}>
            <RotateCcw className="size-4" /> {t("flashcards.checkAgain")}
          </Button>
          <Button asChild className="bg-[#0F172A] text-white hover:bg-[#1E293B] dark:bg-[#EAB308] dark:text-[#0F172A]">
            <Link to="/dashboard">{t("flashcards.toDashboard")}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** « Aus einem Dokument erstellen » : la même génération que dans la bibliothèque. */
function GeneratePanel() {
  const { t } = useT();
  const { data: docs = [] } = useQuery(documentsListOptions(null));
  const [docId, setDocId] = useState("");
  const gen = useGenerateFlashcards();
  const usable = useMemo(() => docs.filter((d) => (d.charCount ?? 0) > 200 || d.pageCount > 0), [docs]);
  if (usable.length === 0) return null;
  return (
    <Card>
      <CardContent className="pt-0">
        <h2 className="font-display mb-1 text-base font-semibold">{t("flashcards.fromDocTitle")}</h2>
        <p className="text-muted-foreground mb-3 text-xs">{t("flashcards.fromDocHint")}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="fc-doc">
            {t("flashcards.pickDoc")}
          </label>
          <select
            id="fc-doc"
            value={docId}
            onChange={(e) => setDocId(e.target.value)}
            className="border-border bg-card min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">{t("flashcards.pickDoc")}</option>
            {usable.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
          <Button
            disabled={!docId || gen.isPending}
            onClick={() => gen.mutate({ source: "document", documentId: docId })}
            className="bg-[#EAB308] font-semibold text-[#0F172A] hover:bg-[#CA8A04] hover:text-[#0F172A]"
          >
            {gen.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {gen.isPending ? t("flashcards.generating") : t("flashcards.generate")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AllCards() {
  const { t } = useT();
  const qc = useQueryClient();
  const { data: cards = [], isLoading } = useQuery(orpc.flashcards.list.queryOptions({ input: { limit: 500 } }));
  const remove = useMutation({
    ...orpc.flashcards.remove.mutationOptions(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: orpc.flashcards.key() }),
  });
  const fmt = new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "2-digit" });
  if (isLoading) return <Loader2 className="mt-3 size-4 animate-spin" />;
  return (
    <ul className="mt-3 space-y-2">
      {cards.map((c) => (
        <li key={c.id} className="border-border flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm">
          <div className="min-w-0 flex-1">
            <MarkdownContent content={c.front} className="font-medium [&_p]:my-0" />
            <MarkdownContent content={c.back} className="text-muted-foreground text-xs [&_p]:my-0" />
            <p className="text-muted-foreground mt-1 text-[11px]">
              {[c.topic, c.sourceLabel].filter(Boolean).join(" · ")} · {t("flashcards.nextOn", { date: fmt.format(new Date(c.nextReviewDate)) })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (confirm(t("flashcards.deleteConfirm"))) remove.mutate({ id: c.id });
            }}
            className="text-muted-foreground hover:text-destructive shrink-0 p-1"
            aria-label={t("flashcards.delete")}
            title={t("flashcards.delete")}
          >
            <Trash2 className="size-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
