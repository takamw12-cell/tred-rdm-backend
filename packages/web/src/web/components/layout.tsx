import { useEffect, useState, type ReactNode } from "react";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { SidebarContent } from "@/components/sidebar";
import { Link, useLocation } from "wouter";
import { LayoutGrid, MessageSquare, PenSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { FontSizeToggle } from "@/components/font-size-toggle";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

// Dictionnaire des traductions pour toutes les langues
const TRANSLATIONS: Record<string, Record<string, string>> = {
  de: { "nav.menu": "Menü", "nav.dashboard": "Dashboard", "nav.chat": "KI-Chat", "nav.exercises": "Übungen" },
  en: { "nav.menu": "Menu", "nav.dashboard": "Dashboard", "nav.chat": "AI Chat", "nav.exercises": "Exercises" },
  fr: { "nav.menu": "Menu", "nav.dashboard": "Tableau de bord", "nav.chat": "Chat IA", "nav.exercises": "Exercices" },
  es: { "nav.menu": "Menú", "nav.dashboard": "Tablero", "nav.chat": "Chat IA", "nav.exercises": "Ejercicios" },
  zh: { "nav.menu": "菜单", "nav.dashboard": "仪表盘", "nav.chat": "AI 聊天", "nav.exercises": "练习" },
  hi: { "nav.menu": "मेनू", "nav.dashboard": "डैशबोर्ड", "nav.chat": "AI चैट", "nav.exercises": "अभ्यास" },
  ar: { "nav.menu": "القائمة", "nav.dashboard": "لوحة القيادة", "nav.chat": "الدردشة AI", "nav.exercises": "تمارين" },
  pt: { "nav.menu": "Menu", "nav.dashboard": "Painel", "nav.chat": "Chat IA", "nav.exercises": "Exercícios" },
  ru: { "nav.menu": "Меню", "nav.dashboard": "Панель", "nav.chat": "Чат ИИ", "nav.exercises": "Упражнения" },
  bn: { "nav.menu": "মেনু", "nav.dashboard": "ড্যাশবোর্ড", "nav.chat": "AI চ্যাট", "nav.exercises": "অনুশীলন" },
  ja: { "nav.menu": "メニュー", "nav.dashboard": "ダッシュボード", "nav.chat": "AI チャット", "nav.exercises": "演習" },
  it: { "nav.menu": "Menu", "nav.dashboard": "Cruscotto", "nav.chat": "Chat IA", "nav.exercises": "Esercizi" },
};

export function AppLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(true);

  // Lecture sécurisée de la langue et du menu
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedNav = window.localStorage.getItem("tred.nav");
      setNavOpen(storedNav !== "closed");
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("tred.nav", navOpen ? "open" : "closed");
    }
  }, [navOpen]);

  // Récupération de la traduction actuelle
  const locale = typeof window !== "undefined" ? localStorage.getItem("tred.locale") || "de" : "de";
  const t = (key: string) => TRANSLATIONS[locale]?.[key] || key;

  return (
    <div className="bg-background flex min-h-screen">
      <aside
        className={cn(
          "bg-sidebar border-sidebar-border fixed inset-y-0 left-0 z-30 hidden overflow-hidden border-r transition-[width] duration-200",
          navOpen ? "w-64" : "w-0 border-r-0"
        )}
        aria-hidden={!navOpen}
      >
        <div className="w-64">
          <SidebarContent />
        </div>
      </aside>

      <div
        className={cn(
          "flex min-h-screen flex-1 flex-col transition-[padding] duration-200",
          navOpen && "lg:pl-64"
        )}
      >
        <header className="bg-background/80 border-b sticky top-0 z-20 flex h-16 items-center gap-3 border-b px-4 backdrop-blur">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label={t("nav.menu")}
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SidebarContent onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>

          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:inline-flex"
            onClick={() => setNavOpen((v) => !v)}
          >
            {navOpen ? (
              <PanelLeftClose className="size-5" />
            ) : (
              <PanelLeftOpen className="size-5" />
            )}
          </Button>

          <div className="lg:hidden">
            <LogoMark className="size-8" />
          </div>

          <Link to="/dashboard" className="hidden lg:block">
            <LogoMark className="size-8" />
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <FontSizeToggle />
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 pb-16 lg:pb-0">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}

function BottomNav() {
  // CORRECTION CRUCIALE : Utilisation de [location] pour déstructurer le tableau
  const [location] = useLocation();
  const locale = typeof window !== "undefined" ? localStorage.getItem("tred.locale") || "de" : "de";
  const t = (key: string) => TRANSLATIONS[locale]?.[key] || key;

  const items = [
    { to: "/dashboard", icon: LayoutGrid, key: "nav.dashboard" },
    { to: "/chat", icon: MessageSquare, key: "nav.chat" },
    { to: "/exercises", icon: PenSquare, key: "nav.exercises" },
  ] as const;

  return (
    <nav
      className="border-border bg-background/95 fixed inset-x-0 bottom-0 z-40 flex border-t backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map(({ to, icon: Icon, key }) => {
        const active = location === to || location.startsWith(to + "/");
        return (
          <Link
            key={to}
            href={to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
              active ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Icon className="size-5" />
            <span className="truncate px-1">{t(key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}