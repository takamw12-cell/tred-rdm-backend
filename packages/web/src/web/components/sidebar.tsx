import type { ReactNode } from "react";
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
  MessageSquareText,
  GalleryVerticalEnd,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/i18n";
import { useIdentity } from "@/hooks/use-identity";
import { subscriptionMeOptions } from "@/queries/subscriptions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TrustBadge } from "@/components/trust-badge";
import { authClient } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useFeedbackUi } from "@/stores/feedback";

export const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, key: "nav.dashboard" },
  { to: "/chat", icon: MessagesSquare, key: "nav.chat" },
  { to: "/dictionary", icon: BookMarked, key: "nav.dictionary" },
  { to: "/dna", icon: Network, key: "nav.dna" },
  { to: "/flashcards", icon: GalleryVerticalEnd, key: "nav.flashcards" },
  { to: "/exercises", icon: PenSquare, key: "nav.exercises" },
  { to: "/formulas", icon: Sigma, key: "nav.formulas" },
  { to: "/exam", icon: GraduationCap, key: "nav.exam" },
  { to: "/settings", icon: Settings, key: "nav.settings" },
];

export function SidebarContent({
  onNavigate,
  headerAction,
}: {
  onNavigate?: () => void;
  /** Posé à droite du logo, sur la même ligne (le bouton X du panneau). */
  headerAction?: ReactNode;
}) {
  const [location] = useLocation();
  const { t } = useT();
  // Nom et plan viennent du compte connecté (session, serveur), jamais d'une
  // valeur par défaut du navigateur.
  const identity = useIdentity();
  const qc = useQueryClient();
  const { data: sub } = useQuery(subscriptionMeOptions());
  const plan = sub?.plan ?? "free";
  const openFeedback = useFeedbackUi((s) => s.openFeedback);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 py-6 pr-3 pl-5">
        <Link to="/dashboard" onClick={onNavigate}>
          {/* Sidebar bleu nuit : losanges et mot « TRED » passent en blanc, le gland reste jaune. */}
          <Logo markClassName="text-white" />
        </Link>
        {headerAction}
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
                // Bleu nuit / jaune TRED (décision fondateur, 5 nov. 2026).
                active
                  ? "bg-[#EAB308] text-[#0F172A] shadow-sm"
                  : "text-white/75 hover:bg-white/10 hover:text-white",
              )}
            >
              <Icon className="size-[18px]" />
              {t(key)}
            </Link>
          );
        })}
      </nav>

      <div className="p-3">
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            openFeedback();
          }}
          className="mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white"
        >
          <MessageSquareText className="size-[18px] text-[#EAB308]" aria-hidden />
          {t("feedback.fab")}
        </button>
        <Link
          to="/pricing"
          onClick={onNavigate}
          className="brand-gradient mb-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.01]"
        >
          <Sparkles className="size-4" />
          {t("nav.pricing")}
        </Link>
        <div className="flex items-center gap-3 rounded-xl bg-white/5 p-2.5">
          <Avatar>
            <AvatarFallback className="brand-gradient text-xs font-bold text-white">
              {identity.initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">
              {identity.full}
            </p>
            <Badge variant="secondary" className="mt-0.5 border-0 bg-white/10 text-white/80 capitalize">
              {plan}
            </Badge>
          </div>
          <ThemeToggle variant="sidebar" />
          <button
            onClick={() => {
              // Le cache des requêtes (cours, documents) ne doit pas survivre
              // à la déconnexion : le compte suivant ne doit rien en voir.
              void authClient.signOut().finally(() => qc.clear());
            }}
            className="shrink-0 text-white/60 transition-colors hover:text-red-400"
            aria-label={t("auth.signOut")}
            title={t("auth.signOut")}
          >
            <LogOut className="size-4" />
          </button>
        </div>
        <div className="mt-3 flex justify-center">
          <TrustBadge />
        </div>
      </div>
    </div>
  );
}
