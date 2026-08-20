import { motion } from "framer-motion";
import { localeMeta } from "@/i18n";
import { useLocaleStore } from "@/stores/locale";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);

  return (
    <div
      className={cn(
        "bg-secondary/70 inline-flex items-center gap-0.5 rounded-full p-1",
        className,
      )}
      role="group"
      aria-label="Language"
    >
      {localeMeta.map((l) => {
        const active = l.code === locale;
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => setLocale(l.code)}
            aria-pressed={active}
            className={cn(
              "relative inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none",
              active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId="lang-pill"
                className="brand-gradient absolute inset-0 rounded-full"
                transition={{ type: "spring", stiffness: 400, damping: 30, duration: 0.2 }}
              />
            )}
            <span className="relative">{l.flag}</span>
            <span className="relative">{l.label}</span>
          </button>
        );
      })}
    </div>
  );
}
