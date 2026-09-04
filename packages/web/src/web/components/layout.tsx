import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutGrid,
  Menu,
  MessagesSquare,
  PenSquare,
  PanelLeftOpen,
  X,
  Search,
} from "lucide-react";
import { SidebarContent } from "@/components/sidebar";
import { OnboardingGuide } from "@/components/onboarding-guide";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { FontSizeToggle } from "@/components/font-size-toggle";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { LegalFooter } from "@/components/legal-footer";
import { AmbientBackground } from "@/components/ambient-background";
import { SearchDialog, useSearchShortcut } from "@/components/search-dialog";

const PANEL_W = "17rem";

/**
 * Un SEUL panneau, deux conteneurs.
 *
 * L'ancien code avait deux implémentations différentes — une `<aside>` collée
 * au bord pour le PC, un `<Sheet>` Radix pour le mobile. Deux rendus, deux
 * comportements, et le PC cassé sans que le mobile le montre.
 *
 * Ici `<SidebarPanel>` est écrit une fois. Sur PC il occupe une colonne du
 * flex ; sur mobile il flotte au-dessus d'un voile. Même bordure, même rayon,
 * même bouton X. Ce qui est réparé d'un côté l'est des deux.
 *
 * Radix `Sheet` a été retiré : le portail et ses classes `hidden`/`lg:block`
 * étaient la source du bug d'affichage. Une dépendance de moins.
 */
function SidebarPanel({
  onClose,
  onNavigate,
}: {
  onClose: () => void;
  onNavigate?: () => void;
}) {
  const { t } = useT();

  return (
    <div className="bg-sidebar border-sidebar-border flex h-full flex-col overflow-hidden rounded-2xl border shadow-sm">
      <div className="flex items-center justify-between px-4 pt-4">
        <Link to="/dashboard" onClick={onNavigate} aria-label="TRED">
          <LogoMark className="size-8" />
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label={t("nav.hideMenu")}
          title={t("nav.hideMenu")}
        >
          <X className="size-5" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarContent onNavigate={onNavigate} />
      </div>
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { t } = useT();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // Mémorisé : `useSearchShortcut` dépend de cette fonction ; une nouvelle à
  // chaque rendu ferait détacher puis rattacher l'écouteur en boucle.
  const openSearch = useCallback(() => setSearchOpen(true), []);
  useSearchShortcut(openSearch);

  // Le choix PC est mémorisé. Lu paresseusement pour éviter un premier rendu
  // à l'état ouvert suivi d'un saut à l'état fermé.
  const [navOpen, setNavOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("tred.nav") !== "closed";
  });

  useEffect(() => {
    window.localStorage.setItem("tred.nav", navOpen ? "open" : "closed");
  }, [navOpen]);

  // Échap ferme le tiroir mobile, et le corps ne défile pas derrière lui.
  // Sans ce verrou, fermer le tiroir renvoie l'utilisateur en haut de page.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  return (
    <div className="relative flex min-h-screen">
      <AmbientBackground />
      {/* ── Colonne PC ────────────────────────────────────────────────
          `hidden lg:flex` sur le conteneur, jamais sur le panneau : c'est ce
          qui empêche le panneau de disparaître à mi-largeur. La largeur
          s'anime, le contenu reste à taille fixe pour ne pas se comprimer. */}
      <div
        className={cn(
          "hidden shrink-0 overflow-hidden p-3 transition-[width] duration-200 ease-out lg:flex",
          navOpen ? "" : "w-0 p-0",
        )}
        style={navOpen ? { width: `calc(${PANEL_W} + 1.5rem)` } : undefined}
        aria-hidden={!navOpen}
      >
        <div className="sticky top-3 h-[calc(100vh-1.5rem)]" style={{ width: PANEL_W }}>
          <SidebarPanel onClose={() => setNavOpen(false)} />
        </div>
      </div>

      {/* ── Tiroir mobile — même panneau ─────────────────────────────── */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("nav.menu")}
            className="fixed inset-y-3 left-3 z-50 lg:hidden"
            style={{ width: PANEL_W }}
          >
            <SidebarPanel
              onClose={() => setMobileOpen(false)}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </>
      )}

      {/* ── Colonne principale ───────────────────────────────────────── */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="bg-background/80 border-border sticky top-0 z-20 flex h-16 items-center gap-3 border-b px-4 backdrop-blur-md sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            data-tour="nav"
            aria-label={t("nav.menu")}
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-5" />
          </Button>

          {/* Ce bouton n'existe QUE menu replié : ouvrir se fait ici,
              fermer se fait par le X du panneau. Un seul rôle par bouton. */}
          {!navOpen && (
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:inline-flex"
              aria-label={t("nav.showMenu")}
              title={t("nav.showMenu")}
              onClick={() => setNavOpen(true)}
            >
              <PanelLeftOpen className="size-5" />
            </Button>
          )}

          <Link to="/dashboard" className={cn("lg:hidden")} aria-label="TRED">
            <LogoMark className="size-8" />
          </Link>

          {!navOpen && (
            <Link to="/dashboard" className="hidden lg:block" aria-label="TRED">
              <LogoMark className="size-8" />
            </Link>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={openSearch}
              className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm transition-colors sm:px-3"
              aria-label={t("search.title")}
              title={t("search.title")}
            >
              <Search className="size-4" />
              <span className="hidden sm:inline">{t("search.title")}</span>
              {/* Le raccourci n'est montré que là où il existe un clavier. */}
              <kbd className="border-border text-muted-foreground ml-1 hidden rounded border px-1.5 py-0.5 text-[10px] lg:inline">
                ⌘K
              </kbd>
            </button>
            <FontSizeToggle />
            <span data-tour="language">
              <LanguageSwitcher />
            </span>
            <ThemeToggle />
          </div>
        </header>

        {/* `min-w-0` plus haut : sans lui, un tableau ou un bloc de code large
            pousse la colonne et fait défiler la page entière de côté. */}
        <main className="min-w-0 flex-1 pb-16 lg:pb-0">{children}</main>

        {/* Le guide du premier lancement. Monté ici et pas dans une page :
            il doit pouvoir éclairer l'en-tête et la barre latérale, qui
            n'appartiennent à aucune page. */}
        <OnboardingGuide />

        {/* « Ständig verfügbar » : joignable depuis chaque page. */}
        <footer className="border-border border-t px-4 py-5 pb-20 lg:pb-5">
          <LegalFooter />
        </footer>
      </div>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />

      <BottomNav />
    </div>
  );
}

/** Barre inférieure, mobile uniquement. Retire `<BottomNav />` ci-dessus si
 *  tu préfères que le tiroir soit le seul mode de navigation. */
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
      className="border-border bg-background/95 fixed inset-x-0 bottom-0 z-30 flex border-t backdrop-blur lg:hidden"
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
