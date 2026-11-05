import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { analyticsAvailable, getConsent, onConsentChange, setConsent, type Consent } from "@/lib/analytics";

/**
 * Einwilligung zur Produkt-Analyse (§ 25 TDDDG (ex-TTDSG)).
 *
 * "Ablehnen" ist genauso groß und genauso nah wie "Erlauben" — eine
 * Zustimmung, die nur über einen versteckten Link abzulehnen ist, wäre
 * keine freiwillige Einwilligung. Kein Vorab-Häkchen, kein Tracking bis
 * zur Entscheidung. Ohne PostHog-Schlüssel erscheint die Leiste gar nicht.
 */
export function AnalyticsConsent() {
  const { t } = useT();
  const [choice, setChoice] = useState<Consent | null>(() => getConsent());
  useEffect(() => onConsentChange(setChoice), []);

  if (!analyticsAvailable() || choice !== null) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="consent-title"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-xl rounded-xl border border-[#F1E7CF]/60 bg-[#0F172A]/85 p-4 text-white shadow-[0_16px_40px_-12px_rgb(0_0_0/0.6)] backdrop-blur-md sm:bottom-5"
    >
      <p id="consent-title" className="flex items-center gap-2 text-sm font-semibold">
        <BarChart3 className="size-4 text-[#EAB308]" aria-hidden />
        {t("consent.title")}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-white/80">
        {t("consent.body")}{" "}
        <a href="/datenschutz" className="underline underline-offset-2 hover:text-white">
          {t("consent.more")}
        </a>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
          onClick={() => setConsent("denied")}
        >
          {t("consent.deny")}
        </Button>
        <Button
          className="bg-[#EAB308] text-[#0F172A] hover:bg-[#FACC15]"
          onClick={() => setConsent("granted")}
        >
          {t("consent.allow")}
        </Button>
      </div>
    </div>
  );
}

/** Schalter für die Einstellungen: Einwilligung jederzeit widerrufen/erteilen. */
export function AnalyticsToggle() {
  const { t } = useT();
  const [choice, setChoice] = useState<Consent | null>(() => getConsent());
  useEffect(() => onConsentChange(setChoice), []);
  if (!analyticsAvailable()) return null;
  const on = choice === "granted";
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{t("consent.title")}</p>
        <p className="text-muted-foreground text-xs">{on ? t("consent.stateOn") : t("consent.stateOff")}</p>
      </div>
      <Button variant={on ? "outline" : "default"} size="sm" onClick={() => setConsent(on ? "denied" : "granted")}>
        {on ? t("consent.revoke") : t("consent.allow")}
      </Button>
    </div>
  );
}
