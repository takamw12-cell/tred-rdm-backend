import { ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Badge « Sicher & DSGVO » → /security.
 *
 * Il ne certifie rien (aucun label officiel n'est revendiqué) : il renvoie
 * vers une page qui dit précisément ce qui est fait — et ce qui ne l'est pas.
 */
const LABEL: Record<string, string> = {
  de: "Sicher & DSGVO",
  en: "Secure & GDPR",
  fr: "Sécurisé & RGPD",
  es: "Seguro y RGPD",
  it: "Sicuro e GDPR",
  pt: "Seguro e RGPD",
};

export function TrustBadge({ tone = "dark", className }: { tone?: "dark" | "light"; className?: string }) {
  const { locale } = useT();
  return (
    <Link
      to="/security"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
        tone === "dark"
          ? "border-[#F1E7CF]/35 bg-white/5 text-[#F1E7CF] hover:bg-white/10"
          : "border-border bg-card text-foreground hover:bg-muted",
        className,
      )}
    >
      <ShieldCheck className={cn("size-3.5", tone === "dark" ? "text-emerald-400" : "text-emerald-600")} aria-hidden />
      {LABEL[locale] ?? LABEL.en}
    </Link>
  );
}
