import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { applyTheme, useThemeStore } from "@/stores/theme";
import { applyFontSize, useFontSizeStore } from "@/stores/font-size";
import { useLocaleStore } from "@/stores/locale";

const queryClient = new QueryClient();

interface ProviderProps {
  children: React.ReactNode;
}

// App-level providers. QueryClientProvider must stay (all API calls run through
// TanStack Query). Theme + locale are initialized on mount.
export function Provider({ children }: ProviderProps) {
  const theme = useThemeStore((s) => s.theme);
  const locale = useLocaleStore((s) => s.locale);
  const fontSize = useFontSizeStore((s) => s.size);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    applyFontSize(fontSize);
  }, [fontSize]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (useThemeStore.getState().theme === "system") applyTheme("system");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}
