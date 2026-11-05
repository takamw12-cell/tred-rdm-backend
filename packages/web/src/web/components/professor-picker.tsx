import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Sparkles } from "lucide-react";
import { ProfessorPortrait } from "@/components/professor-portrait";
import {
  PROFESSOR_IDS,
  PROFESSORS,
  professorText,
  professorUi,
  useProfessor,
  type ProfessorId,
} from "@/lib/professors";
import { orpc } from "@/lib/api";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Le vestiaire : une carte par professeur. Le choix est enregistré côté
 * serveur (user_access.professor_id) — le tuteur le lit à chaque message.
 */
export function ProfessorPicker() {
  const { locale } = useT();
  const ui = professorUi(locale);
  const qc = useQueryClient();
  const current = useProfessor();
  const save = useMutation(orpc.account.setProfessor.mutationOptions());
  const [confirmed, setConfirmed] = useState<ProfessorId | null>(null);
  const [failed, setFailed] = useState(false);

  const selected = (save.isPending ? save.variables?.professorId : undefined) ?? current.id;

  function choose(id: ProfessorId) {
    if (id === current.id || save.isPending) return;
    setFailed(false);
    save.mutate(
      { professorId: id },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: orpc.account.getProfessor.key() });
          setConfirmed(id);
          setTimeout(() => setConfirmed((c) => (c === id ? null : c)), 2600);
        },
        onError: () => {
          setFailed(true);
          save.reset();
        },
      },
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {PROFESSOR_IDS.map((id) => {
          const p = PROFESSORS[id];
          const isMine = selected === id;
          const pending = save.isPending && save.variables?.professorId === id;
          return (
            <article
              key={id}
              className={cn(
                "relative flex flex-col overflow-hidden rounded-2xl border-2 bg-white text-[#0F172A] shadow-sm transition-all",
                isMine
                  ? "border-[#EAB308] shadow-[0_12px_32px_-12px_rgb(234_179_8/0.55)]"
                  : "border-transparent ring-1 ring-black/5 hover:-translate-y-0.5 hover:shadow-md",
              )}
            >
              {isMine && (
                <span className="absolute top-3 right-3 z-10 inline-flex items-center gap-1 rounded-full bg-[#EAB308] px-2.5 py-1 text-xs font-bold text-[#0F172A] shadow">
                  <Check className="size-3" strokeWidth={3} /> {ui.mine}
                </span>
              )}
              {/* 5:4 et cadrage à 30 % du haut : un portrait carré garde la
                  coiffure ET le menton. */}
              <div className="relative aspect-[5/4] overflow-hidden bg-[#0F172A]">
                <ProfessorPortrait professor={p} className="object-[center_30%] text-5xl" />
                <AnimatePresence>
                  {confirmed === id && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: "spring", damping: 14, stiffness: 220 }}
                      className="absolute inset-0 flex items-center justify-center bg-[#EAB308]/85"
                    >
                      <span className="flex items-center gap-2 text-lg font-bold text-[#0F172A]">
                        <Sparkles className="size-6" /> {p.name}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="flex flex-1 flex-col gap-1 p-4">
                <h3 className="font-display text-lg font-semibold">{p.name}</h3>
                <p className="text-xs font-semibold tracking-wide text-[#A16207] uppercase">
                  {professorText(p.title, locale)}
                </p>
                <p className="mt-1 flex-1 text-sm text-[#475569]">
                  {professorText(p.description, locale)}
                </p>
                <button
                  type="button"
                  onClick={() => choose(id)}
                  disabled={isMine || save.isPending}
                  className={cn(
                    "mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                    isMine
                      ? "cursor-default bg-[#FEF3C7] text-[#92400E]"
                      : "bg-[#0F172A] text-white hover:bg-[#1E293B] disabled:opacity-60",
                  )}
                >
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : isMine ? (
                    <Check className="size-4" />
                  ) : null}
                  {isMine ? ui.mine : ui.choose}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <AnimatePresence>
        {confirmed && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-sm font-medium text-[#15803D]"
            aria-live="polite"
          >
            {ui.saved}
          </motion.p>
        )}
      </AnimatePresence>
      {failed && (
        <p className="text-destructive text-sm" aria-live="polite">
          {ui.failed}
        </p>
      )}
    </div>
  );
}
