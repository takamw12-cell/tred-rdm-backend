import { useState } from "react";
import { Link } from "wouter";
import {
  Moon,
  Sun,
  Laptop,
  Globe,
  CreditCard,
  Download,
  Trash2,
  Loader2,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useThemeStore, type Theme } from "@/stores/theme";
import { useFontSizeStore, type FontSize } from "@/stores/font-size";
import { useUserStore } from "@/stores/user";
import { client } from "@/lib/api";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Page des réglages.
 *
 * ── Ce qui n'allait pas ───────────────────────────────────────────────────
 *
 * La version précédente portait ce commentaire en tête : « Version simplifiée :
 * on utilise useState localement ». C'était une MAQUETTE. Trois `useState`
 * locaux, zéro store, zéro appel au serveur, zéro traduction — tous les textes
 * écrits en dur en français.
 *
 * Conséquence : cliquer « Sombre » ne changeait pas le thème. Choisir une
 * langue ne changeait rien. Et « Code de calcul » ne pouvait pas disparaître,
 * puisque mes correctifs cherchaient un fichier qui n'existait plus.
 *
 * Tout ce qu'il fallait était déjà là — `useThemeStore`, `useFontSizeStore`,
 * `useUserStore`, `account.dataExport`, `account.deleteAccount`. La maquette
 * les recouvrait.
 *
 * ── Ce qui a disparu ──────────────────────────────────────────────────────
 *
 * La section « Code de calcul ». Elle réglait une variable que rien ne lisait.
 */

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon} {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Groupe de boutons exclusifs — thème, taille du texte. */
function Choice<T extends string>({
  value,
  options,
  onChange,
  sizes,
}: {
  value: T;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  onChange: (next: T) => void;
  /** Classe de taille par option — pour que les trois « A » se voient. */
  sizes?: string[];
}) {
  return (
    <div className="bg-secondary flex gap-1 rounded-xl p-1">
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            sizes?.[index],
            value === option.value
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useT();

  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const fontSize = useFontSizeStore((s) => s.size);
  const setFontSize = useFontSizeStore((s) => s.setSize);

  const plan = useUserStore((s) => s.plan);
  const germanMode = useUserStore((s) => s.germanMode);
  const setGermanMode = useUserStore((s) => s.setGermanMode);

  const [exporting, setExporting] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Export RGPD. Le fichier est fabriqué dans le navigateur à partir de la
   * réponse : pas de fichier temporaire côté serveur, donc rien à nettoyer et
   * aucune adresse devinable par un tiers.
   */
  async function exportData() {
    setError(null);
    setExporting(true);
    try {
      const result = await client.account.dataExport();
      const blob = new Blob([JSON.stringify(result.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(t("settings.exportFailed"));
    } finally {
      setExporting(false);
    }
  }

  /**
   * Suppression du compte. Le serveur exige le mot « LÖSCHEN » ; on l'exige
   * donc aussi ici, plutôt que de laisser partir une requête vouée à être
   * refusée. Un simple bouton se clique par accident, et rien ne revient.
   */
  async function deleteAccount() {
    if (confirm !== "LÖSCHEN") return;
    setError(null);
    setDeleting(true);
    try {
      await client.account.deleteAccount({ confirm: "LÖSCHEN" });
      window.location.href = "/";
    } catch {
      setError(t("settings.deleteFailed"));
      setDeleting(false);
    }
  }

  return (
    <div className="bg-background mx-auto min-h-screen w-full max-w-4xl space-y-6 p-6 md:p-8">
      <div>
        <h1 className="font-display mb-1 text-2xl font-bold tracking-tight">
          {t("settings.title")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("settings.subtitle")}</p>
      </div>

      <Section
        icon={<Moon className="size-4" />}
        title={t("settings.appearanceSection")}
      >
        <div className="space-y-4">
          <Row label={t("settings.themeLabel")}>
            <Choice<Theme>
              value={theme}
              onChange={setTheme}
              options={[
                { value: "light", label: t("settings.themeLight"), icon: <Sun className="size-3.5" /> },
                { value: "dark", label: t("settings.themeDark"), icon: <Moon className="size-3.5" /> },
                { value: "system", label: t("settings.themeSystem"), icon: <Laptop className="size-3.5" /> },
              ]}
            />
          </Row>

          <Row
            label={t("settings.fontSizeLabel")}
            description={t("settings.fontSizeDesc")}
          >
            <Choice<FontSize>
              value={fontSize}
              onChange={setFontSize}
              // Les trois « A » sont dessinés à leur propre taille : on choisit
              // ce qu'on voit, pas une étiquette qui le décrit.
              options={[
                { value: "small", label: "A", icon: null },
                { value: "medium", label: "A", icon: null },
                { value: "large", label: "A", icon: null },
              ]}
              sizes={["text-xs", "text-sm", "text-base"]}
            />
          </Row>
        </div>
      </Section>

      <Section
        icon={<Globe className="size-4" />}
        title={t("settings.languagesSection")}
      >
        <div className="space-y-4">
          <Row
            label={t("settings.interfaceLanguage")}
            description={t("settings.interfaceLanguageDesc")}
          >
            <LanguageSwitcher />
          </Row>

          <Row
            label={t("settings.germanLearningMode")}
            description={t("settings.germanLearningModeDesc")}
          >
            <Switch checked={germanMode} onCheckedChange={setGermanMode} />
          </Row>
        </div>
      </Section>

      <Section
        icon={<CreditCard className="size-4" />}
        title={t("settings.subscriptionSection")}
      >
        <Row label={t("settings.currentPlan")} description={plan}>
          <Link to="/pricing">
            <Button variant="outline" size="sm">
              {t("settings.managePlan")}
            </Button>
          </Link>
        </Row>
      </Section>

      <Section
        icon={<Download className="size-4" />}
        title={t("settings.dataSection")}
        description={t("settings.dataSectionDesc")}
      >
        <Row
          label={t("settings.exportData")}
          description={t("settings.exportDataDesc")}
        >
          <Button
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={() => void exportData()}
          >
            {exporting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t("settings.exportData")}
          </Button>
        </Row>
      </Section>

      <Section
        icon={<Trash2 className="size-4" />}
        title={t("settings.privacySection")}
        description={t("settings.privacyDesc")}
      >
        <div className="space-y-3">
          <p className="text-sm font-medium">{t("settings.deleteAccount")}</p>
          <p className="text-muted-foreground text-xs">
            {t("settings.deleteAccountDesc")}
          </p>

          {/* Le mot est exigé côté serveur ; on l'exige ici aussi, pour que le
              geste reste délibéré et que rien ne parte pour être refusé. */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="LÖSCHEN"
              aria-label={t("settings.deleteConfirmLabel")}
              className="h-9 max-w-[180px] font-mono"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={confirm !== "LÖSCHEN" || deleting}
              onClick={() => void deleteAccount()}
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              {deleting && <Loader2 className="mr-2 size-4 animate-spin" />}
              {t("settings.deleteAccount")}
            </Button>
          </div>
        </div>
      </Section>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Type className="size-3" />
        {t("settings.footnote")}
      </p>
    </div>
  );
}
