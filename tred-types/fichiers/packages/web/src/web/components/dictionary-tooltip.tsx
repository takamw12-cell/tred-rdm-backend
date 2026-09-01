import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { terms } from "@/data/dictionary";
import { useT } from "@/i18n";
import { pick } from "@/data/localized";

// Inline glossed German term with a hover tooltip (translation + definition).
export function DictionaryTooltip({
  termId,
  children,
}: {
  termId: string;
  children: ReactNode;
}) {
  const { t, locale } = useT();
  const term = terms.find((x) => x.id === termId);
  if (!term) return <>{children}</>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="decoration-primary/50 hover:decoration-primary cursor-help font-semibold text-primary underline decoration-dotted underline-offset-4">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-display font-semibold">{term.term}</p>
        <p className="text-primary text-xs font-medium">{pick(term.translation, locale)}</p>
        <p className="text-muted-foreground mt-1 text-xs">{pick(term.definition, locale)}</p>
        <p className="text-muted-foreground/70 mt-1 text-[10px] tracking-wide uppercase">
          {t("dictionary.definition")}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
