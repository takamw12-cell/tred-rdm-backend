import { ReactNode } from "react";
import { useThemeStore } from "@/stores/theme";
import { useUserStore } from "@/stores/user";
import { useLearningStore } from "@/stores/learning";
import { usePreferencesStore } from "@/stores/preferences";

export default function SettingsPage() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const germanMode = useUserStore((s) => s.germanMode);
  const setGermanMode = useUserStore((s) => s.setGermanMode);
  const plan = useUserStore((s) => s.plan);
  const termStates = useLearningStore((s) => s.termStates);
  const codeLang = usePreferencesStore((s) => s.codeLang);
  const setCodeLang = usePreferencesStore((s) => s.setCodeLang);

  return (
    <div className="min-h-screen bg-background p-8 max-w-4xl mx-auto w-full">
      <h1 className="text-2xl font-bold mb-6">Paramètres</h1>
      
      <div className="space-y-6">
        {/* Section Thème */}
        <div className="border rounded-lg p-4">
          <h2 className="font-semibold mb-2">Thème</h2>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as any)}
            className="border rounded px-3 py-1"
          >
            <option value="light">Clair</option>
            <option value="dark">Sombre</option>
            <option value="system">Système</option>
          </select>
        </div>

        {/* Section Langue / Mode Allemand */}
        <div className="border rounded-lg p-4">
          <h2 className="font-semibold mb-2">Langue</h2>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={germanMode}
              onChange={() => setGermanMode(!germanMode)}
            />
            <span>Toujours afficher les termes techniques en allemand</span>
          </label>
        </div>

        {/* Section Code */}
        <div className="border rounded-lg p-4">
          <h2 className="font-semibold mb-2">Langage de code préféré</h2>
          <select
            value={codeLang}
            onChange={(e) => setCodeLang(e.target.value as any)}
            className="border rounded px-3 py-1"
          >
            <option value="python">Python</option>
            <option value="matlab">MATLAB</option>
          </select>
        </div>

        {/* Section Abonnement (placeholder) */}
        <div className="border rounded-lg p-4">
          <h2 className="font-semibold mb-2">Abonnement</h2>
          <p>Plan actuel : <strong>{plan}</strong></p>
          {/* Ici tu pourras mettre un bouton pour gérer l'abonnement Stripe */}
        </div>
      </div>
    </div>
  );
}