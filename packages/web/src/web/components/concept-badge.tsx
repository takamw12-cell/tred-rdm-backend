import { CircleDashed, CircleDot, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/i18n";
import type { KnowState } from "@/stores/learning";

const config: Record<
  KnowState,
  { variant: "mastered" | "learning" | "new"; icon: typeof CheckCircle2; key: string }
> = {
  mastered: { variant: "mastered", icon: CheckCircle2, key: "states.mastered" },
  learning: { variant: "learning", icon: CircleDot, key: "states.learning" },
  new: { variant: "new", icon: CircleDashed, key: "states.new" },
};

export function ConceptBadge({ state }: { state: KnowState }) {
  const { t } = useT();
  const { variant, icon: Icon, key } = config[state];
  return (
    <Badge variant={variant}>
      <Icon className="size-3" />
      {t(key)}
    </Badge>
  );
}
