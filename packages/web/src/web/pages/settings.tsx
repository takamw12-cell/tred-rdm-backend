import { useThemeStore } from "@/stores/preferences";
import { useUserStore } from "@/stores/user";
import { useLearningStore } from "@/stores/learning";
import { usePreferencesStore } from "@/stores/preferences";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Moon, Sun, Laptop, Globe, CreditCard } from "lucide-react";

export default function SettingsPage() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const germanMode = useUserStore((s) => s.germanMode);
  const setGermanMode = useUserStore((s) => s.setGermanMode);
  const plan = useUserStore((s) => s.plan);
  const codeLang = usePreferencesStore((s) => s.codeLang);
  const setCodeLang = usePreferencesStore((s) => s.setCodeLang);

  return (
    <div className="min-h-screen w-full bg-background p-6 md:p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-1">Paramètres</h1>
        <p className="text-muted-foreground text-sm">
          Gérez vos préférences, votre abonnement et vos informations de compte.
        </p>
      </div>

      {/* Section : Apparence */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Moon className="size-4" /> Apparence
          </CardTitle>
          <CardDescription>Choisissez le thème de l'application.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {[
              { id: "light", icon: Sun, label: "Clair" },
              { id: "dark", icon: Moon, label: "Sombre" },
              { id: "system", icon: Laptop, label: "Système" },
            ].map((t) => (
              <Button
                key={t.id}
                variant={theme === t.id ? "default" : "outline"}
                size="sm"
                className="gap-2"
                onClick={() => setTheme(t.id as any)}
              >
                <t.icon className="size-4" />
                {t.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Section : Langue */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="size-4" /> Langue de l'interface
          </CardTitle>
          <CardDescription>Choisissez la langue de l'application et du tuteur IA.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Langue principale</Label>
              <p className="text-sm text-muted-foreground">Affichage du menu et du chat</p>
            </div>
            {/* Note : Le LanguageSwitcher gère ça globalement, on laisse donc la sélection visuelle */}
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Mode allemand technique</Label>
              <p className="text-sm text-muted-foreground">Conserve les termes techniques en allemand (ex: Flächenträgheitsmoment)</p>
            </div>
            <Switch checked={germanMode} onCheckedChange={setGermanMode} />
          </div>
        </CardContent>
      </Card>

      {/* Section : Calcul */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Laptop className="size-4" /> Code de calcul
          </CardTitle>
          <CardDescription>Langage de code utilisé pour les exercices et le mode calcul.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {["matlab", "python"].map((lang) => (
              <Button
                key={lang}
                variant={codeLang === lang ? "default" : "outline"}
                size="sm"
                onClick={() => setCodeLang(lang as any)}
                className="capitalize"
              >
                {lang}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Section : Abonnement */}
      <Card className="border-green-500/20 bg-green-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-green-600 dark:text-green-400">
            <CreditCard className="size-4" /> Abonnement
          </CardTitle>
          <CardDescription>
            Vous êtes actuellement sur le forfait <span className="font-bold text-green-600 dark:text-green-400">{plan || "Premium"}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="bg-green-500 hover:bg-green-600 text-white">Gérer mon abonnement</Button>
        </CardContent>
      </Card>
    </div>
  );
}