import { useEffect, useRef, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MarkdownContent } from "@/components/markdown-content";
import { AiAnswer, parseAnswer, SourceCard } from "@/components/ai-answer";
import { BoardStatus, GlassBoard, INK, PaperNote, SolverStamp, StepChecklist } from "@/components/hoersaal";
import { isFinalStep, splitChoices, writingChunks, type Choice, type TafelBlock } from "@/lib/tafel";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Die Tafel — la zone d'affichage UNIQUE du Hörsaal (décision fondateur
 * 2026-11-09) : il n'y a plus de chat. En bas, seulement la saisie ; TOUTE
 * la réponse du professeur s'écrit ici, comme une page qui se remplit :
 *
 *   • la question de l'étudiant, recopiée en haut au feutre ;
 *   • les blocs [[TAFEL]] et les @@STEP, chacun sur sa feuille tenue par un
 *     aimant ; le texte hors blocs, directement sur le verre ;
 *   • chaque paragraphe apparaît à son tour (framer-motion), balayé de
 *     gauche à droite comme écrit au feutre ;
 *   • les options A), B), C) d'un QCM deviennent des boutons : un clic
 *     envoie la réponse ;
 *   • en pied de page, les gestes (« Pourquoi ? », quiz, vidéo…), fournis
 *     par la page.
 *
 * Chaque réponse est une page : on feuillette les précédentes (‹ 2/5 ›).
 * Rendu Markdown : react-markdown + remark-gfm (tableaux, listes) +
 * remark-math / rehype-katex (formules), via <MarkdownContent>.
 */

export interface TafelPage {
  /** Identifiant stable (celui du message de la réponse, sinon de la question). */
  id: string;
  /** Message de la réponse — absent tant que le professeur n'a rien écrit. */
  messageId?: string;
  /** La question de l'étudiant, recopiée en haut de la page. */
  question?: string;
  images?: { url: string; name?: string }[];
  blocks: TafelBlock[];
  /** Un outil de calcul (rechnen, balkenstatik…) a servi pour cette réponse. */
  solverUsed: boolean;
}

export function TafelBoard({
  page,
  writing,
  status,
  pager,
  emptyExtra,
  onChoice,
  chosen,
  notice,
  footer,
  className,
}: {
  page?: TafelPage;
  /** Cette page est encore en cours d'écriture (flux). */
  writing: boolean;
  /** Ce que fait le professeur (« analyse… », « écrit… »), en pastille. */
  status?: string;
  pager?: { index: number; count: number; onPrev: () => void; onNext: () => void };
  /** Sous l'invitation du tableau vide : les questions suggérées. */
  emptyExtra?: ReactNode;
  /** Absent = options affichées mais non cliquables (ancienne page, flux en cours). */
  onChoice?: (answer: string) => void;
  /** L'option déjà choisie sur cette page (lue dans la question suivante). */
  chosen?: string | null;
  /** Erreur, quota, réponse vide : posé sur la page. */
  notice?: ReactNode;
  /** Les gestes sous la réponse. */
  footer?: ReactNode;
  className?: string;
}) {
  const { t, locale } = useT();
  const body = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const blocks = page?.blocks ?? [];
  const steps = blocks.filter((b) => b.kind === "step");
  // Seules les étapes de calcul (@@STEP) sont numérotées et cochées : une
  // « Rückmeldung » ou une « Runde 2 » n'est pas l'étape 1 d'une démarche.
  const derivSteps = steps.filter((s) => s.derivation);
  const derivation = derivSteps.length >= 2;
  const lastIndex = blocks.length - 1;
  const textLength = blocks.reduce((n, b) => n + b.body.length, 0);

  // Nouvelle page : on la lit depuis le haut.
  useEffect(() => {
    stick.current = true;
    body.current?.scrollTo({ top: 0 });
  }, [page?.id]);

  // Pendant l'écriture, le tableau suit la craie — sauf si l'étudiant est
  // remonté relire : on ne lui arrache pas la page.
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const onScroll = () => {
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    const el = body.current;
    if (!writing || !el || !stick.current) return;
    requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight }));
  }, [writing, textLength]);

  const showPager = pager && pager.count > 1;
  const pill =
    status || showPager ? (
      <div className="flex shrink-0 flex-col items-end gap-2">
        {showPager && <BoardPager {...pager} />}
        {status && <BoardStatus>{status}</BoardStatus>}
      </div>
    ) : undefined;

  return (
    <GlassBoard
      aria-label={t("tafel.title")}
      eyebrow="Digitaler Hörsaal"
      title={t("tafel.title")}
      status={pill}
      className={className}
      bodyRef={body}
    >
      {!page && !notice ? (
        <div className="my-auto flex max-w-xl flex-col items-center gap-6">
          <p className="font-hand text-center text-3xl leading-snug text-[color:var(--board-muted)]">
            {EMPTY[locale === "de" || locale === "fr" ? locale : "en"]}
          </p>
          {emptyExtra}
        </div>
      ) : (
        <div key={page?.id} data-slot="tafel-page" className="flex w-full max-w-3xl flex-col items-center gap-6">
          {page?.question && (
            <QuestionLine question={page.question} images={page.images} label={t("tafel.yourQuestion")} />
          )}

          {derivation && (
            <StepChecklist
              label={t("tafel.progress")}
              steps={derivSteps.map((s) => ({
                label: s.label,
                done: s.complete && !(writing && blocks.indexOf(s) === lastIndex),
              }))}
            />
          )}

          {blocks.map((b, i) => {
            const live = writing && i === lastIndex;
            const key = b.kind === "step" && b.id ? b.id : `${b.kind}-${i}`;
            if (b.kind === "voice") {
              return (
                <div
                  key={key}
                  data-slot="tafel-voice"
                  className="w-full px-1 text-[1.05rem] leading-relaxed"
                  style={{ color: INK }}
                >
                  <BoardText text={b.body} writing={writing} live={live} offset={i} onChoice={onChoice} chosen={chosen} />
                </div>
              );
            }
            const n = steps.indexOf(b);
            const final = isFinalStep(b.label) && n === steps.length - 1;
            const inProgress = !b.complete || live;
            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: writing ? 0 : Math.min(i, 6) * 0.12 }}
                className="flex w-full justify-center"
              >
                <PaperNote
                  // Deux feuilles voisines ne sont jamais parallèles.
                  tilt={n % 2 === 0 ? -0.5 : 0.4}
                  highlight={final}
                  title={b.derivation && derivation ? `${derivSteps.indexOf(b) + 1}. ${b.label}` : b.label}
                  stamp={
                    final && page?.solverUsed && !inProgress ? (
                      <SolverStamp label={t("tafel.solver")} sublabel="" />
                    ) : undefined
                  }
                >
                  {/* Formules en grand : la Tafel se lit de loin. */}
                  <div
                    className={cn(
                      "[&_.katex-display]:my-3 [&_.katex-display]:!overflow-x-auto",
                      final ? "[&_.katex]:text-[1.45em]" : "[&_.katex-display_.katex]:text-[1.25em]",
                    )}
                  >
                    <BoardText
                      text={b.body}
                      writing={writing}
                      live={inProgress}
                      offset={i}
                      onChoice={onChoice}
                      chosen={chosen}
                    />
                  </div>
                </PaperNote>
              </motion.div>
            );
          })}

          {/* Rien d'écrit encore : la place de la réponse est déjà là. */}
          {writing && blocks.length === 0 && <WritingPlaceholder />}

          {notice && <div className="w-full">{notice}</div>}

          {footer && !writing && (
            <div data-slot="tafel-actions" className="flex w-full flex-wrap justify-center gap-2 pt-2">
              {footer}
            </div>
          )}
        </div>
      )}
    </GlassBoard>
  );
}

/** La question de l'étudiant, recopiée au feutre en haut de la page. */
function QuestionLine({
  question,
  images,
  label,
}: {
  question: string;
  images?: { url: string; name?: string }[];
  label: string;
}) {
  return (
    <div data-slot="tafel-question" className="w-full border-b border-dashed border-current/25 pb-3">
      <p className="font-mono text-[11px] tracking-[0.16em] text-[color:var(--board-muted)] uppercase">{label}</p>
      {/* Markdown sans HTML (react-markdown) : les formules d'une option
          choisie (« B) $3\,\mathrm{A}$ ») s'affichent en KaTeX. */}
      <div
        className="font-hand mt-1 line-clamp-4 text-2xl leading-snug sm:text-[1.7rem] [&_p]:my-0 [&_p]:!text-[length:inherit] [&_p]:!leading-snug"
        style={{ color: INK }}
      >
        <MarkdownContent content={question} />
      </div>
      {images && images.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {images.map((img, i) => (
            <img
              key={i}
              src={img.url}
              alt={img.name ?? ""}
              className="h-20 rounded-md object-cover shadow-[0_6px_14px_-6px_rgb(0_0_0/0.5)] ring-1 ring-black/10"
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Le texte écrit au tableau : sources ([[OFFICIAL]] / [[AEROSTUDY]]) en
 * cartes, options de QCM en boutons, et le reste paragraphe par paragraphe.
 */
export function BoardText({
  text,
  writing = false,
  live = false,
  offset = 0,
  onChoice,
  chosen,
}: {
  text: string;
  /** La page s'écrit : chaque nouveau paragraphe apparaît sans délai. */
  writing?: boolean;
  /** Ce texte-ci est en cours d'écriture : un curseur le suit. */
  live?: boolean;
  /** Rang du bloc dans la page : décale l'apparition à l'ouverture d'une page. */
  offset?: number;
  onChoice?: (answer: string) => void;
  chosen?: string | null;
}) {
  let n = 0;
  const delay = () => (writing ? 0 : Math.min(offset * 2 + n++, 12) * 0.07);
  return (
    <div className="space-y-3">
      {parseAnswer(text).map((seg, i) => {
        if (seg.kind === "official" || seg.kind === "aerostudy") {
          return (
            <Reveal key={i} delay={delay()}>
              <SourceCard variant={seg.kind} text={seg.text} />
            </Reveal>
          );
        }
        if (seg.kind === "reasoning") return <AiAnswer key={i} text={`[[REASONING]]${seg.text}[[/REASONING]]`} />;
        return splitChoices(seg.text).map((part, j) =>
          part.kind === "choices" ? (
            <Reveal key={`${i}-${j}`} delay={delay()}>
              <ChoiceButtons options={part.options} onChoice={onChoice} chosen={chosen} />
            </Reveal>
          ) : (
            writingChunks(part.text).map((chunk, k) => (
              <Reveal key={`${i}-${j}-${k}`} delay={delay()}>
                <MarkdownContent content={chunk} />
              </Reveal>
            ))
          ),
        );
      })}
      {live && (
        <span aria-hidden className="inline-block h-6 w-[3px] animate-pulse align-middle" style={{ background: INK }} />
      )}
    </div>
  );
}

/**
 * Un paragraphe qui s'écrit : balayage de gauche à droite (comme un feutre)
 * et fondu. Le masque est retiré à la fin, sinon il couperait les bulles du
 * dictionnaire. Mouvement réduit : simple fondu.
 */
function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, clipPath: "inset(0 100% 0 0)" }}
      animate={
        reduce ? { opacity: 1 } : { opacity: 1, clipPath: "inset(0 0% 0 0)", transitionEnd: { clipPath: "none" } }
      }
      transition={{ duration: reduce ? 0.2 : 0.55, ease: [0.33, 1, 0.68, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Les options d'un QCM, posées sur le tableau : A, B, C… Un clic envoie
 * « B) … » comme réponse. Sans `onChoice` (ancienne page, flux en cours),
 * elles restent lisibles, mais ne sont plus cliquables.
 */
export function ChoiceButtons({
  options,
  onChoice,
  chosen,
}: {
  options: Choice[];
  onChoice?: (answer: string) => void;
  chosen?: string | null;
}) {
  const { t } = useT();
  return (
    <fieldset data-slot="tafel-choices" className="m-0 grid min-w-0 gap-2 border-0 p-0 sm:grid-cols-2">
      <legend className="sr-only">{t("tafel.chooseAnswer")}</legend>
      {options.map((o) => {
        const picked = chosen === o.key;
        return (
          <button
            key={o.key}
            type="button"
            disabled={!onChoice}
            aria-pressed={picked}
            onClick={() => onChoice?.(`${o.key}) ${o.text}`)}
            className={cn(
              "flex min-h-12 items-center gap-3 rounded-xl bg-[color:var(--board-pill)] px-3 py-2 text-left ring-1 ring-current/20 transition-[box-shadow,transform]",
              onChoice &&
                "cursor-pointer hover:-translate-y-px hover:ring-2 hover:ring-[#EAB308] focus-visible:ring-2 focus-visible:ring-[#EAB308] focus-visible:outline-none",
              !onChoice && !picked && "opacity-70",
              picked && "ring-2 ring-[#EAB308]",
            )}
            style={{ color: INK }}
          >
            <span
              className={cn(
                "font-hand grid size-9 shrink-0 place-items-center rounded-full text-2xl leading-none font-bold",
                picked ? "bg-[#EAB308] text-[#0F172A]" : "ring-2 ring-current",
              )}
            >
              {o.key}
            </span>
            <span className="min-w-0 flex-1 [&_p]:my-0">
              <MarkdownContent content={o.text} />
            </span>
            {picked && <span className="sr-only">{t("tafel.yourChoice")}</span>}
          </button>
        );
      })}
    </fieldset>
  );
}

/** ‹ 2 / 5 › — feuilleter les réponses précédentes. */
function BoardPager({
  index,
  count,
  onPrev,
  onNext,
}: {
  index: number;
  count: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { t } = useT();
  const btn =
    "grid size-8 place-items-center rounded-full text-[color:var(--board-muted)] transition-colors hover:bg-[color:var(--board-pill)] hover:text-[color:var(--board-ink)] disabled:pointer-events-none disabled:opacity-30";
  return (
    <nav
      aria-label={t("tafel.pages")}
      data-slot="tafel-pager"
      className="flex items-center gap-0.5 rounded-full bg-[color:var(--board-pill)] p-0.5"
    >
      <button type="button" onClick={onPrev} disabled={index <= 0} aria-label={t("tafel.prevPage")} className={btn}>
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-12 px-1 text-center text-xs font-medium text-[color:var(--board-muted)] tabular-nums">
        {t("tafel.page", { n: index + 1, total: count })}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={index >= count - 1}
        aria-label={t("tafel.nextPage")}
        className={btn}
      >
        <ChevronRight className="size-4" />
      </button>
    </nav>
  );
}

/** Avant le premier mot : trois traits de feutre pâles. */
function WritingPlaceholder() {
  return (
    <div aria-hidden className="w-full max-w-xl space-y-3 py-2 motion-safe:animate-pulse">
      <div className="h-3 w-11/12 rounded-full bg-[color:var(--board-pill)]" />
      <div className="h-3 w-4/5 rounded-full bg-[color:var(--board-pill)]" />
      <div className="h-3 w-2/3 rounded-full bg-[color:var(--board-pill)]" />
    </div>
  );
}

/** Un geste sous la réponse (« Pourquoi ? », quiz…), posé sur le verre. */
export function BoardChip({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-9 items-center gap-1.5 rounded-full bg-[color:var(--board-pill)] px-3 py-1.5 text-xs font-medium text-[color:var(--board-muted)] ring-1 ring-current/15 transition-colors hover:text-[color:var(--board-ink)] hover:ring-[#EAB308]"
    >
      {icon}
      {label}
    </button>
  );
}

/** Tableau vide : une invitation écrite au feutre. */
const EMPTY = {
  de: "Die Tafel ist bereit. Stell deine Frage — ich schreibe alles hier an, Schritt für Schritt.",
  en: "The board is ready. Ask your question — I'll write everything here, step by step.",
  fr: "Le tableau est prêt. Pose ta question — j'écris tout ici, étape par étape.",
};
