import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  MessagesSquare,
  BookMarked,
  Network,
  GraduationCap,
  Settings,
  Sparkles,
  LogOut,
  PenSquare,
  Sigma,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/i18n";
import { useUserStore } from "@/stores/user";
import { authClient } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, key: "nav.dashboard" },
  { to: "/chat", icon: MessagesSquare, key: "nav.chat" },
  { to: "/dictionary", icon: BookMarked, key: "nav.dictionary" },
  { to: "/dna", icon: Network, key: "nav.dna" },
  { to: "/exercises", icon: PenSquare, key: "nav.exercises" },
  { to: "/formulas", icon: Sigma, key: "nav.formulas" },
  { to: "/exam", icon: GraduationCap, key: "nav.exam" },
  { to: "/settings", icon: Settings, key: "nav.settings" },
];

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const { t } = useT();
  const profile = useUserStore((s) => s.profile);
  const plan = useUserStore((s) => s.plan);
  const initials =
    (profile.firstName[0] ?? "") + (profile.lastName[0] ?? "");

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 py-6">
        <Link to="/dashboard" onClick={onNavigate}>
          <Logo />
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3" data-tour="nav">
        {navItems.map(({ to, icon: Icon, key }) => {
          const active = location === to;
          return (
            <Link
              key={to}
              to={to}
              // Le tuteur est l'étape 3 du guide. L'attribut vit sur le lien,
              // pas sur un conteneur : c'est ce rectangle-là qu'il faut
              // éclairer, pas toute la colonne.
              data-tour={to === "/chat" ? "chat" : undefined}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="size-[18px]" />
              {t(key)}
            </Link>
          );
        })}
      </nav>

      <div className="p-3">
        <Link
          to="/pricing"
          onClick={onNavigate}
          className="brand-gradient mb-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.01]"
        >
          <Sparkles className="size-4" />
          {t("nav.pricing")}
        </Link>
        <div className="bg-secondary/60 flex items-center gap-3 rounded-xl p-2.5">
          <Avatar>
            <AvatarFallback className="brand-gradient text-xs font-bold text-white">
              {initials.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {profile.firstName} {profile.lastName}
            </p>
            <Badge variant="secondary" className="mt-0.5 capitalize">
              {plan}
            </Badge>
          </div>
          <button
            onClick={() => authClient.signOut()}
            className="text-muted-foreground hover:text-destructive shrink-0 transition-colors"
            aria-label={t("auth.signOut")}
            title={t("auth.signOut")}
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
