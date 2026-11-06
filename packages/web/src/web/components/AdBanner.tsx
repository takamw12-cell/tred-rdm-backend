import { useState } from "react";
import { BookOpen, Calculator, ExternalLink, Wrench, X } from "lucide-react";
import { useUserStore } from "@/stores/user";
import { categoryForProgram } from "@/lib/background-sets";
import { partnerUrl, resourcesFor, type PartnerResource } from "@/lib/partner-resources";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * « Partner-Ressourcen » — publicité NON intrusive, sous le Dashboard.
 *
 * Jamais dans le chat (l'apprentissage d'abord), jamais animée, jamais en
 * pop-up. Verre dépoli, bordure crème, marquée « Anzeige » comme l'exige le
 * droit allemand. Masquable : le choix est retenu 30 jours sur l'appareil.
 * Le contenu suit la filière du profil (lib/partner-resources.ts).
 */

const HIDE_KEY = "tred-partner-hidden-until";
const ICONS = { calculator: Calculator, book: BookOpen, tool: Wrench } as const;

export function hiddenNow(): boolean {
  try {
    return Number(localStorage.getItem(HIDE_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

export function hideFor30Days() {
  try {
    localStorage.setItem(HIDE_KEY, String(Date.now() + 30 * 86_400_000));
  } catch {
    /* navigation privée : masqué pour cette visite seulement */
  }
}

export function AdBanner({ className }: { className?: string }) {
  const program = useUserStore((s) => s.profile.degree);
  const [hidden, setHidden] = useState(hiddenNow);
  if (hidden) return null;

  const category = categoryForProgram(program);
  const items = resourcesFor(category);
  const tag = import.meta.env.VITE_AMAZON_PARTNER_TAG as string | undefined;

  const hide = () => {
    hideFor30Days();
    track("partner_hidden", { category });
    setHidden(true);
  };

  return (
    <aside
      aria-label="Partner-Ressourcen (Anzeige)"
      className={cn(
        "relative rounded-2xl border border-[#F1E7CF]/45 bg-white/[0.07] p-4 text-white backdrop-blur-md sm:p-5",
        "shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]",
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2 pr-8">
        <span className="rounded-full border border-[#F1E7CF]/50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[#F1E7CF] uppercase">
          Anzeige
        </span>
        <p className="text-sm font-semibold">Partner-Ressourcen für dein Studium</p>
      </div>
      <button
        type="button"
        onClick={hide}
        className="absolute top-3 right-3 grid size-7 place-items-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        aria-label="Partner-Ressourcen ausblenden"
        title="30 Tage ausblenden"
      >
        <X className="size-4" />
      </button>

      <ul className="grid gap-2 sm:grid-cols-3">
        {items.map((r) => (
          <li key={r.id}>
            <ResourceLink r={r} href={partnerUrl(r, tag)} onClick={() => track("partner_click", { category, id: r.id })} />
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] leading-snug text-white/70">
        {tag
          ? "Als Amazon-Partner verdient TRED an qualifizierten Verkäufen — für dich ändert sich der Preis nicht."
          : "Unverbindliche Empfehlungen."}{" "}
        Keine Weitergabe deiner Daten an Partner.
      </p>
    </aside>
  );
}

export function ResourceLink({ r, href, onClick }: { r: PartnerResource; href: string; onClick: () => void }) {
  const Icon = ICONS[r.icon];
  return (
    <a
      href={href}
      target="_blank"
      rel="sponsored noopener noreferrer"
      onClick={onClick}
      className="group flex h-full items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 transition-colors hover:border-[#F1E7CF]/50 hover:bg-white/[0.08]"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#F1E7CF]/15 text-[#F1E7CF]">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1 text-[13px] leading-tight font-semibold">
          {r.title}
          <ExternalLink className="size-3 shrink-0 opacity-50 group-hover:opacity-90" aria-hidden />
        </span>
        <span className="mt-1 block text-xs leading-snug text-white/75">{r.why}</span>
      </span>
    </a>
  );
}
