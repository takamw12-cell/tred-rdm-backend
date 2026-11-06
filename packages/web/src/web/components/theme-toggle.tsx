import { Moon, Sun } from "lucide-react";
import { isDark, LIGHT_ONLY, useThemeStore } from "@/stores/theme";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Bascule clair ↔ sombre en un clic. Le choix est gardé sur l'appareil
 * (zustand persist, clé « aerostudy-theme ») ; « System » se règle dans
 * Paramètres → Erscheinungsbild.
 *
 *   variant="outline" : en-têtes clairs (connexion, onboarding)
 *   variant="sidebar" : à côté de l'avatar, sur la barre latérale bleu nuit
 */
export function ThemeToggle({ variant = "outline" }: { variant?: "outline" | "sidebar" }) {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);
  const { t } = useT();
  if (LIGHT_ONLY) return null;

  const dark = isDark(theme);
  const label = `${t("common.theme")}: ${dark ? t("common.dark") : t("common.light")}`;
  const Icon = dark ? Sun : Moon;

  if (variant === "sidebar") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={dark}
        aria-label={label}
        title={label}
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-[#EAB308]",
          dark && "text-[#EAB308]",
        )}
      >
        <Icon className="size-4" />
      </button>
    );
  }

  return (
    <Button variant="outline" size="icon" onClick={toggle} aria-pressed={dark} aria-label={label} title={label}>
      <Icon className="size-4" />
    </Button>
  );
}
