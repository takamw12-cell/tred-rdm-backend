import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { RotateCcw } from "lucide-react";
import { MarkdownContent } from "@/components/markdown-content";

/**
 * Une formule qui se construit pas à pas : chaque étape « saute » à sa place,
 * l'une après l'autre (timeline GSAP, chargée à la demande — elle ne pèse pas
 * sur le reste de l'app).
 *
 * Mouvement réduit (réglage du système) : toutes les étapes sont là d'emblée,
 * GSAP n'est même pas téléchargé. Si GSAP ne se charge pas, pareil : le
 * contenu ne dépend jamais de l'animation.
 */
export function FormulaSteps({ steps, title, replayLabel }: { steps: { tex: string; note: string }[]; title: string; replayLabel: string }) {
  const list = useRef<HTMLOListElement>(null);
  const reduced = useReducedMotion();
  const [run, setRun] = useState(0);

  useEffect(() => {
    const el = list.current;
    if (!el || reduced) return;
    let cancelled = false;
    let revert: (() => void) | null = null;
    // Cachées tout de suite : GSAP arrive un instant plus tard.
    el.dataset.pending = "true";
    void import("gsap")
      .then(({ gsap }) => {
        if (cancelled) return;
        const ctx = gsap.context(() => {
          const timeline = gsap.timeline({ defaults: { duration: 0.5, ease: "back.out(1.9)" } });
          el.querySelectorAll<HTMLElement>("[data-step]").forEach((item, i) => {
            timeline.fromTo(item, { autoAlpha: 0, scale: 0.6, y: 12 }, { autoAlpha: 1, scale: 1, y: 0 }, 0.1 + i * 0.55);
          });
        }, el);
        delete el.dataset.pending;
        revert = () => ctx.revert();
      })
      .catch(() => {
        delete el.dataset.pending;
      });
    return () => {
      cancelled = true;
      delete el.dataset.pending;
      revert?.();
    };
  }, [steps, reduced, run]);

  return (
    <section data-testid="formula-steps" className="rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-[0.14em] text-[#EAB308] uppercase">{title}</h3>
        {!reduced && (
          <button
            type="button"
            onClick={() => setRun((n) => n + 1)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-white/80 ring-1 ring-white/20 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-[#EAB308] focus-visible:outline-none"
          >
            <RotateCcw className="size-3.5" />
            {replayLabel}
          </button>
        )}
      </div>
      {/* data-pending : les étapes restent invisibles le temps que GSAP arrive (pas de flash « tout puis rien »). */}
      <ol ref={list} className="space-y-2 data-[pending=true]:[&>li]:invisible">
        {steps.map((s, i) => (
          <li key={`${run}-${i}`} data-step className="flex items-start gap-3 rounded-xl bg-[#0B1220]/70 px-3 py-2">
            <span className="mt-2 grid size-6 shrink-0 place-items-center rounded-full bg-[#EAB308] text-xs font-bold text-[#0F172A]">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <MarkdownContent content={`$$${s.tex}$$`} className="text-white [&_.katex-display]:my-1.5 [&_.katex]:text-white" />
              <p className="text-xs leading-snug text-white/75">{s.note}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
