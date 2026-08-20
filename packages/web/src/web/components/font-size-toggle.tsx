import { Type } from "lucide-react";
import { useFontSizeStore, type FontSize } from "@/stores/font-size";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

// "Aa" reading-size control. Lives in the top bar next to theme/language.
export function FontSizeToggle() {
  const size = useFontSizeStore((s) => s.size);
  const setSize = useFontSizeStore((s) => s.setSize);
  const { t } = useT();

  const items: { value: FontSize; label: string; sample: string }[] = [
    { value: "small", label: t("fontSize.small"), sample: "text-sm" },
    { value: "medium", label: t("fontSize.medium"), sample: "text-base" },
    { value: "large", label: t("fontSize.large"), sample: "text-xl" },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label={t("fontSize.label")}>
          <span className="flex items-baseline font-semibold leading-none">
            <span className="text-sm">A</span>
            <span className="text-[0.65rem]">a</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Type className="size-3.5" />
          {t("fontSize.label")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map(({ value, label, sample }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setSize(value)}
            className={cn(
              "flex items-center justify-between",
              size === value && "text-primary font-semibold",
            )}
          >
            <span className={sample}>{label}</span>
            {size === value && <span className="text-primary text-xs">●</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
