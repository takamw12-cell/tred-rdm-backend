import { useEffect, useState, type ReactNode } from "react";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { SidebarContent } from "@/components/sidebar";
import { Link, useLocation } from "wouter";
import { LayoutGrid, MessagesSquare, PenSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { FontSizeToggle } from "@/components/font-size-toggle";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function AppLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { t } = useT();

  // Hauptmenü einklappbar. Auf dem Handy übernimmt die untere Leiste, dort
  // gibt es die Schiene ohnehin nicht — die Einstellung gilt nur ab lg.
  const [navOpen, setNavOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("tred.nav") !== "closed";
  });
  useEffect(() => {
    window.localStorage.setItem("tred.nav", navOpen ? "open" : "closed");
  }, [navOpen]);

  return (
    <div className="bg-background flex min-h-screen">
      {/* Hauptmenü — feste Schiene ab lg, einklappbar */}
      <aside
        className={cn(
          "bg-sidebar border-sidebar-border fixed inset-y-0 left-0 z-30 hidden overflow-hidden border-r transition-[width] duration-200 lg:block",
          navOpen ? "w-64" : "w-0 border-r-0",
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
          navOpen && "lg:pl-64",
        )}
      >
        {/* Top bar */}
        <header className="bg-background/80 border-border sticky top-0 z-20 flex h-16 items-center gap-3 border-b px-4 backdrop-blur-md sm:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SidebarContent onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>

          {/* Auf großen Bildschirmen klappt derselbe Platz das Menü weg. */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:inline-flex"
            aria-label={navOpen ? t("nav.hideMenu") : t("nav.showMenu")}
            title={navOpen ? t("nav.hideMenu") : t("nav.showMenu")}
            aria-pressed={navOpen}
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

          {/* Eingeklappt bleibt die Marke sichtbar, sonst verliert man die Orientierung. */}
          {!navOpen && (
            <Link to="/dashboard" className="hidden lg:block">
              <LogoMark className="size-8" />
            </Link>
          )}

          <div className="ml-auto flex items-center gap-2">
            <FontSizeToggle />
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>

        {/* Auf dem Handy bleibt der Hauptbereich frei von der unteren Leiste. */}
        <main className="flex-1 pb-16 lg:pb-0">{children}</main>
      </div>

      <BottomNav />
    </div>
  );
}

/**
 * Untere Navigationsleiste (nur Handy).
 *
 * Bisher führte jeder Weg über das ☰-Menü — auf dem Handy ein Umweg. Die drei
 * wichtigsten Bereiche sind jetzt immer mit dem Daumen erreichbar.
 */
function BottomNav() {
  const { t } = useT();
  const [location] = useLocation();
  const items = [
    { to: "/dashboard", icon: LayoutGrid, key: "nav.dashboard" },
    { to: "/chat", icon: MessagesSquare, key: "nav.chat" },
    { to: "/exercises", icon: PenSquare, key: "nav.exercises" },
  ] as const;

  return (
    <nav
      className="border-border bg-background/95 fixed inset-x-0 bottom-0 z-40 flex border-t backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label={t("nav.menu")}
    >
      {items.map(({ to, icon: Icon, key }) => {
        const active = location === to || location.startsWith(`${to}/`);
        return (
          <Link
            key={to}
            href={to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
              active ? "text-primary" : "text-muted-foreground",
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
