import { Link } from "wouter";
import type { ReactNode } from "react";
import { Languages, Palette, CreditCard, Database, ShieldCheck, Download, Trash2, Sun, Moon, Monitor, Calculator } from "lucide-react";
import { PageContainer, PageHeader, Reveal } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT, localeMeta } from "@/i18n";
import type { Locale } from "@/i18n/types";
import { useLocaleStore } from "@/stores/locale";
import { useThemeStore, type Theme } from "@/stores/theme";
import { useUserStore } from "@/stores/user";
import { useLearningStore } from "@/stores/learning";
import { usePreferencesStore, type CodeLang } from "@/stores/preferences";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { t } = useT();
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const germanMode = useUserStore((s) => s.germanMode);
  const setGermanMode = useUserStore((s) => s.setGermanMode);
  const plan = useUserStore((s) => s.plan);
  const termStates = useLearningStore((s) => s.termStates);
  const codeLang = usePreferencesStore((s) => s.codeLang);
  const setCodeLang = usePreferencesStore((s) => s.setCodeLang);

  return (
    <div className="border-2 border-red-500 min-h-screen bg-background p-8 max-w-4xl mx-auto w-full">
      <h1 className="text-2xl font-bold mb-4">Paramètres TRED</h1>
      <p>Si tu vois ce texte entouré d'une bordure rouge, la page s'affiche enfin !</p>
      <p>... tout le reste de tes composants de paramètres ici ...</p>
    </div>
  );
}
  

  function exportData() {
    const blob = new Blob(
      [JSON.stringify({ locale, theme, plan, germanMode, termStates }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "aerostudy-data.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const themes: { value: Theme; icon: typeof Sun; label: string }[] = [
    { value: "light", icon: Sun, label: t("common.light") },
    { value: "dark", icon: Moon, label: t("common.dark") },
    { value: "system", icon: Monitor, label: t("common.system") },
  ];

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title={t("settings.title")} />

      <div className="space-y-6">
        {/* Languages */}
        <SettingSection icon={<Languages className="size-4" />} title={t("settings.languagesSection")}>
          <Row label={t("settings.interfaceLanguage")}>
            <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {localeMeta.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.flag} {t(`langs.${l.code}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <Separator />
          <Row label={t("settings.germanLearningMode")} desc={t("settings.germanLearningModeDesc")}>
            <Switch checked={germanMode} onCheckedChange={setGermanMode} />
          </Row>
        </SettingSection>

        {/* Appearance */}
        <SettingSection icon={<Palette className="size-4" />} title={t("settings.appearanceSection")}>
          <Row label={t("common.theme")}>
            <div className="bg-secondary flex gap-1 rounded-xl p-1">
              {themes.map((th) => (
                <button
                  key={th.value}
                  onClick={() => setTheme(th.value)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    theme === th.value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <th.icon className="size-4" />
                  <span className="hidden sm:inline">{th.label}</span>
                </button>
              ))}
            </div>
          </Row>
        </SettingSection>

        {/* Calculation / code language */}
        <SettingSection icon={<Calculator className="size-4" />} title={t("settings.codeSection")}>
          <Row label={t("settings.codeLangLabel")} desc={t("settings.codeLangDesc")}>
            <div className="bg-secondary flex gap-1 rounded-xl p-1">
              {(["python", "matlab"] as CodeLang[]).map((cl) => (
                <button
                  key={cl}
                  onClick={() => setCodeLang(cl)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    codeLang === cl
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {cl === "matlab" ? t("calc.matlab") : t("calc.python")}
                </button>
              ))}
            </div>
          </Row>
        </SettingSection>

        {/* Subscription */}
        <SettingSection icon={<CreditCard className="size-4" />} title={t("settings.subscriptionSection")}>
          <Row label={t("settings.currentPlan")}>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="capitalize">{t(`pricing.plans.${plan}.name`)}</Badge>
              <Link to="/pricing">
                <Button variant="outline" size="sm">{t("settings.managePlan")}</Button>
              </Link>
            </div>
          </Row>
        </SettingSection>

        {/* Data */}
        <SettingSection icon={<Database className="size-4" />} title={t("settings.dataSection")}>
          <Row label={t("settings.exportData")} desc={t("settings.exportDataDesc")}>
            <Button variant="outline" size="sm" onClick={exportData}>
              <Download className="size-4" />
              {t("common.save")}
            </Button>
          </Row>
        </SettingSection>

        {/* Privacy */}
        <SettingSection icon={<ShieldCheck className="size-4" />} title={t("settings.privacySection")}>
          <p className="text-muted-foreground -mt-1 mb-3 text-sm">{t("settings.privacyDesc")}</p>
          <Row label={t("settings.deleteAccount")} desc={t("settings.deleteAccountDesc")}>
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
              <Trash2 className="size-4" />
              {t("settings.deleteAccount")}
            </Button>
          </Row>
        </SettingSection>
      </div>
    </PageContainer>
  );
}

function SettingSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Reveal>
      <Card>
        <CardContent className="pt-0">
          <h2 className="font-display mb-4 flex items-center gap-2 text-lg font-bold">
            <span className="bg-primary/10 text-primary grid size-8 place-items-center rounded-lg">{icon}</span>
            {title}
          </h2>
          <div className="space-y-4">{children}</div>
        </CardContent>
      </Card>
    </Reveal>
  );
}

function Row({ label, desc, children }: { label: string; desc?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {desc && <p className="text-muted-foreground mt-0.5 text-xs">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
