import { useState } from "react";
import { Link } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, GalleryVerticalEnd } from "lucide-react";
import { useT } from "@/i18n";
import { EXPLORER_MODELS, pick } from "@/lib/explorer-models";

/**
 * « Interaktive Karteikarten » du Dashboard (2026-11-15) : une carte qui se
 * retourne en 3D — la question au recto, la réponse de TRED au verso.
 *
 * Les cartes sont celles du turboréacteur de l'Explorateur 3D. Les cartes
 * tirées des documents de l'étudiant, avec leur répétition espacée, restent
 * sur la page « Karteikarten » : le bouton y mène.
 */
const CARDS = EXPLORER_MODELS.turbofan.hotspots;

export function FlipDeck() {
  const { t, locale } = useT();
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = CARDS[index];
  const face = "col-start-1 row-start-1 flex min-h-[11.5rem] flex-col justify-center rounded-2xl border p-5 text-center shadow-sm [backface-visibility:hidden]";

  return (
    <section data-testid="flip-deck">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-xl font-semibold">{t("dashboard.cardsTitle")}</h2>
        <span className="text-muted-foreground text-xs tabular-nums">
          {index + 1} / {CARDS.length}
        </span>
      </div>
      <motion.button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-pressed={flipped}
        aria-label={t("dashboard.cardsHint")}
        data-testid="flip-card"
        whileHover={reduced ? undefined : { y: -3 }}
        whileTap={reduced ? undefined : { scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 24 }}
        className="block w-full [perspective:1200px] focus-visible:outline-none"
      >
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 180, damping: 20 }}
          className="relative grid [transform-style:preserve-3d]"
        >
          <div className={`${face} border-border bg-card text-card-foreground`}>
            <span className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-[0.14em] uppercase">{t("dashboard.cardsQuestion")}</span>
            <span className="font-display text-lg leading-snug font-semibold">{pick(card.quiz, locale)}</span>
          </div>
          <div className={`${face} border-[#EAB308]/60 bg-[#0F172A] text-white [transform:rotateY(180deg)]`}>
            <span className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-[#EAB308] uppercase">
              {t("dashboard.cardsAnswer")} · {pick(card.title, locale)}
            </span>
            <span className="text-sm leading-relaxed text-white/90">{pick(card.text, locale)}</span>
          </div>
        </motion.div>
      </motion.button>
      <p className="text-muted-foreground mt-2 text-center text-xs">{t("dashboard.cardsHint")}</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          data-testid="flip-next"
          onClick={() => {
            setFlipped(false);
            setIndex((i) => (i + 1) % CARDS.length);
          }}
          className="border-border hover:border-signature/60 hover:bg-accent/60 inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-xs font-semibold transition-colors motion-safe:active:scale-[0.97]"
        >
          {t("dashboard.cardsNext")}
          <ArrowRight className="size-3.5" />
        </button>
        <Link to="/flashcards" className="text-muted-foreground hover:text-foreground inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold">
          <GalleryVerticalEnd className="size-3.5" />
          {t("dashboard.cardsMine")}
        </Link>
      </div>
    </section>
  );
}
