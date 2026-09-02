import { useState, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { terms } from "@/data/dictionary";
import { useT } from "@/i18n";
import { pick } from "@/data/localized";

/**
 * Le terme technique allemand, glosé au survol — et au toucher.
 *
 * ── Pourquoi l'ouverture est contrôlée ici ────────────────────────────────
 *
 * Une info-bulle Radix s'ouvre au survol et au focus clavier. Sur un téléphone
 * il n'y a ni l'un ni l'autre : le doigt touche, rien ne s'ouvre, et
 * l'étudiant conclut que le soulignement ne sert à rien. Or c'est en révisant
 * dans le train qu'il a le plus besoin de savoir ce que veut dire
 * « Flächenträgheitsmoment ».
 *
 * L'état est donc tenu ici. Radix continue de l'ouvrir au survol et au focus
 * en passant par `onOpenChange` ; le toucher le bascule. Les trois gestes
 * fonctionnent, sans qu'aucun n'en casse un autre.
 *
 * Le déclencheur est un vrai `<button>` remis à plat, et non un `<span>` à qui
 * l'on colle `role="button"` : le clavier, le focus visible et les lecteurs
 * d'écran fonctionnent alors sans qu'on ait rien à réimplémenter.
 */
export function DictionaryTooltip({
  termId,
  children,
}: {
  termId: string;
  children: ReactNode;
}) {
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);

  const term = terms.find((x) => x.id === termId);
  // Un terme retiré du dictionnaire ne doit pas faire disparaître le mot de la
  // phrase : on rend alors le texte tel quel.
  if (!term) return <>{children}</>;

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        {/* Un vrai <button>, pas un <span role="button"> : le clavier, le
            focus et les lecteurs d'écran viennent alors gratuitement et
            correctement. `type="button"` l'empêche de valider un formulaire —
            le champ de chat en est un. Les styles par défaut sont remis à
            plat pour qu'il se lise comme un mot dans la phrase. */}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="decoration-primary/50 hover:decoration-primary text-primary focus-visible:ring-ring m-0 inline cursor-help border-0 bg-transparent p-0 text-left align-baseline font-[inherit] text-[length:inherit] leading-[inherit] font-semibold underline decoration-dotted underline-offset-4 focus-visible:rounded-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="font-display font-semibold">{term.term}</p>
        <p className="text-primary text-xs font-medium">
          {pick(term.translation, locale)}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          {pick(term.definition, locale)}
        </p>
        <p className="text-muted-foreground/70 mt-1 text-[10px] tracking-wide uppercase">
          {t("dictionary.definition")}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
