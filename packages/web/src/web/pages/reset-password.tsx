import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, CheckCircle2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/logo";
import { authClient } from "@/lib/auth";
import { useT } from "@/i18n";

/**
 * Page atteinte depuis le lien reçu par e-mail : `/reset-password?token=…`.
 *
 * Le jeton vit dans l'URL, jamais dans un état React persistant. Better Auth
 * l'invalide dès qu'il est consommé, donc un lien réutilisé échoue proprement
 * au lieu de laisser croire que le mot de passe a changé.
 */
export default function ResetPasswordPage() {
  const { t } = useT();
  const [, navigate] = useLocation();

  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token"));
  }, []);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = password.length >= 8 && password === confirm && !!token && !busy;

  async function submit() {
    if (!token) return;
    setError(null);
    setBusy(true);

    const { error: err } = await authClient.resetPassword({
      newPassword: password,
      token,
    });

    setBusy(false);

    if (err) {
      // Un lien périmé et un lien déjà utilisé produisent la même erreur côté
      // serveur, et c'est très bien : distinguer les deux renseignerait un
      // attaquant sur l'existence du compte.
      setError(t("auth.resetLinkInvalid"));
      return;
    }

    setDone(true);
    setTimeout(() => navigate("/login"), 2500);
  }

  /* ── Lien absent ou malformé ─────────────────────────────────────────── */
  if (token === null) {
    return (
      <Shell>
        <p className="text-muted-foreground text-sm">{t("auth.resetLinkInvalid")}</p>
        <Button className="mt-4 w-full" onClick={() => navigate("/login")}>
          {t("auth.backToLogin")}
        </Button>
      </Shell>
    );
  }

  /* ── Succès ──────────────────────────────────────────────────────────── */
  if (done) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-4">
          <CheckCircle2 className="text-success size-10" />
          <p className="text-center text-sm font-medium">{t("auth.resetDone")}</p>
        </div>
      </Shell>
    );
  }

  /* ── Formulaire ──────────────────────────────────────────────────────── */
  return (
    <Shell>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="pw">{t("auth.newPassword")}</Label>
          <Input
            id="pw"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {tooShort && (
            <p className="text-destructive text-xs">{t("auth.passwordTooShort")}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pw2">{t("auth.confirmPassword")}</Label>
          <Input
            id="pw2"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canSubmit && void submit()}
          />
          {mismatch && (
            <p className="text-destructive text-xs">{t("auth.passwordMismatch")}</p>
          )}
        </div>

        {error && <p className="text-destructive text-sm">{error}</p>}

        <Button className="w-full" disabled={!canSubmit} onClick={() => void submit()}>
          {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
          {t("auth.setNewPassword")}
        </Button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-6">
      <div className="border-border/50 bg-card w-full max-w-sm rounded-2xl border p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo variant="stacked" />
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <KeyRound className="size-4" />
            {t("auth.resetTitle")}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
