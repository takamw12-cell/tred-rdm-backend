import { Monitor, Moon, Sun } from "lucide-react";
import { useThemeStore, type Theme } from "@/stores/theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const { t } = useT();

  const items: { value: Theme; icon: typeof Sun; label: string }[] = [
    { value: "light", icon: Sun, label: t("common.light") },
    { value: "dark", icon: Moon, label: t("common.dark") },
    { value: "system", icon: Monitor, label: t("common.system") },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label={t("common.theme")}>
          {theme === "dark" ? (
            <Moon className="size-4" />
          ) : theme === "light" ? (
            <Sun className="size-4" />
          ) : (
            <Monitor className="size-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map(({ value, icon: Icon, label }) => (
          <DropdownMenuItem key={value} onClick={() => setTheme(value)}>
            <Icon className="size-4" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
