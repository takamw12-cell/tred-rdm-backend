import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { useT } from "@/i18n";

/**
 * Bandeau « hors ligne ».
 *
 * Il dit seulement ce qui est vrai aujourd'hui : sans réseau, le tuteur ne
 * peut pas répondre. Il ne promet PAS la lecture hors ligne des notes — l'app
 * n'a pas de cache hors ligne (pas de service worker) ; ce qui est déjà à
 * l'écran reste lisible, rien de plus.
 *
 * `navigator.onLine` connaît l'état de l'interface réseau, pas celui du
 * serveur : il ne se trompe que dans le sens « en ligne alors que non », donc
 * le bandeau n'apparaît jamais à tort.
 */
export function OfflineBanner() {
  const { t } = useT();
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (!offline) return null;
  return (
    <output
      data-testid="offline-banner"
      className="fixed inset-x-3 top-3 z-[70] mx-auto flex max-w-xl items-center gap-2.5 rounded-xl border border-white/15 bg-[#0F172A] px-4 py-2.5 text-sm text-white shadow-[0_12px_32px_-12px_rgb(0_0_0/0.6)]"
    >
      <WifiOff className="size-4 shrink-0 text-[#FACC15]" aria-hidden />
      {t("offline.banner")}
    </output>
  );
}
