import { ShieldCheck } from "lucide-react";
import { useT } from "@/i18n";
import type { ProofEngine } from "@/lib/proof";
import { cn } from "@/lib/utils";

/**
 * « Mit SymPy geprüft » : la pastille de preuve d'une réponse du tuteur.
 *
 *     ⛨ Mit SymPy geprüft
 *
 * Verte, discrète, avec un bouclier. Elle dit UNE chose : le calcul affiché a
 * été vérifié par un moteur de calcul formel côté serveur. Qui décide de
 * l'afficher : `proofOf()` (lib/proof.ts), à partir du résultat d'un outil du
 * serveur — jamais à partir du texte du tuteur.
 *
 * Couleurs fixes (vert sombre sur vert très clair, 7,1:1) : la pastille est
 * posée sur le tableau, vert, sombre ou blanc, où les jetons du thème
 * deviennent illisibles. `tone="board"` l'adapte aux tableaux foncés.
 */
export function ProofBadge({ engine, tone = "light", className }: { engine: ProofEngine; tone?: "light" | "board"; className?: string }) {
  const { t } = useT();
  const label = t(`proof.${engine}`);
  return (
    <span
      data-slot="proof-badge"
      data-testid="proof-badge"
      data-engine={engine}
      title={t(`proof.${engine}Hint`)}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border py-0.5 pr-2.5 pl-1.5 text-[11px] leading-5 font-semibold whitespace-nowrap",
        tone === "board" ? "border-[#4ADE80]/50 bg-[#16A34A]/20 text-[#BBF7D0]" : "border-[#16A34A]/35 bg-[#DCFCE7] text-[#14532D]",
        className,
      )}
    >
      <ShieldCheck className="size-3.5" strokeWidth={2.4} aria-hidden />
      {label}
    </span>
  );
}
