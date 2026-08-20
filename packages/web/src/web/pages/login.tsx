import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { authClient, googleAuthEnabled, appleAuthEnabled } from "@/lib/auth";
import { useT } from "@/i18n";

export default function LoginPage() {
  const { t } = useT();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState("");
  // Der Server entscheidet, ob überhaupt registriert werden darf. Bis die
  // Antwort da ist, gilt "geschlossen" — so blitzt das Formular nicht kurz auf.
  const [inviteRequired, setInviteRequired] = useState(true);

  useEffect(() => {
    void fetch("/api/config")
      .then((r) => r.json())
      .then((d: { inviteRequired?: boolean }) => setInviteRequired(d.inviteRequired !== false))
      .catch(() => setInviteRequired(true));
  }, []);

  const isSignup = mode === "signup";

  async function handleGoogle() {
    setError(null);
    const result = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/dashboard",
    });
    if (result.error) {
      setError(result.error.message ?? t("auth.errorGeneric"));
    }
  }

  async function handleApple() {
    setError(null);
    const result = await authClient.signIn.social({
      provider: "apple",
      callbackURL: "/dashboard",
    });
    if (result.error) {
      setError(result.error.message ?? t("auth.errorGeneric"));
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = isSignup
        ? await authClient.signUp.email({
            email,
            password,
            name: name || email,
            // Reist im Rumpf mit und wird serverseitig vor der Anlage geprüft.
            ...(invite ? ({ inviteCode: invite.trim() } as Record<string, string>) : {}),
          })
        : await authClient.signIn.email({ email, password });
      if (res.error) {
        const code = (res.error as { code?: string; status?: number }).status;
        setError(
          code === 403 ? t("auth.inviteInvalid") : res.error.message ?? t("auth.errorGeneric"),
        );
      }
    } catch {
      setError(t("auth.errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="paper-grid relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* Millimeterpapier statt Farbwolken: der Hintergrund ist der
          Arbeitsuntergrund, nicht Dekoration. */}

      <div className="absolute right-4 top-4 flex items-center gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="border-border bg-card w-full max-w-md rounded-lg border p-8 shadow-[0_1px_2px_rgb(20_24_27/0.04),0_12px_32px_-12px_rgb(20_24_27/0.12)]"
      >
        <div className="mb-7 flex flex-col items-center text-center">
          <Logo variant="stacked" tagline={t("brand.claim")} />
          <div className="rule-hairline mt-7 w-full" />
          <h1 className="font-display mt-6 text-2xl font-semibold tracking-tight">
            {isSignup ? t("auth.signUpTitle") : t("auth.signInTitle")}
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            {isSignup ? t("auth.signUpSubtitle") : t("auth.signInSubtitle")}
          </p>
        </div>

        {(googleAuthEnabled || appleAuthEnabled) && (
          <>
            <div className="space-y-2.5">
              {googleAuthEnabled && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full gap-2.5 text-sm font-semibold"
                  onClick={handleGoogle}
                >
                  <GoogleIcon />
                  {t("auth.google")}
                </Button>
              )}
              {appleAuthEnabled && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full gap-2.5 text-sm font-semibold"
                  onClick={handleApple}
                >
                  <AppleIcon />
                  {t("auth.apple")}
                </Button>
              )}
            </div>

            <div className="my-5 flex items-center gap-3">
              <div className="bg-border h-px flex-1" />
              <span className="text-muted-foreground text-xs uppercase tracking-wide">
                {t("auth.or")}
              </span>
              <div className="bg-border h-px flex-1" />
            </div>
          </>
        )}

        <form onSubmit={handleEmail} className="space-y-4">
          {isSignup && inviteRequired && (
            <div className="space-y-1.5">
              <Label htmlFor="invite">{t("auth.inviteCode")}</Label>
              <Input
                id="invite"
                required
                value={invite}
                onChange={(e) => setInvite(e.target.value.toUpperCase())}
                placeholder="XXXXXXXX"
                autoComplete="off"
                spellCheck={false}
                className="font-mono tracking-[0.2em]"
              />
              <p className="text-muted-foreground text-xs">{t("auth.inviteHint")}</p>
            </div>
          )}
          {isSignup && (
            <div className="space-y-1.5">
              <Label htmlFor="name">{t("auth.name")}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">{t("common.email")}</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{t("common.password")}</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignup ? "new-password" : "current-password"}
            />
          </div>

          {error && (
            <p className="text-destructive text-sm font-medium">{error}</p>
          )}

          <Button
            type="submit"
            disabled={busy}
            className="h-11 w-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {isSignup ? t("auth.signUpBtn") : t("auth.signInBtn")}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(isSignup ? "signin" : "signup");
            setError(null);
          }}
          className="text-muted-foreground hover:text-foreground mt-5 w-full text-center text-sm transition-colors"
        >
          {isSignup ? t("auth.toSignIn") : t("auth.toSignUp")}
        </button>
      </motion.div>
    </div>
  );
}

function AppleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.365 1.43c0 1.14-.417 2.06-1.25 2.767-.833.706-1.79 1.116-2.87 1.03-.087-1.093.36-2.05 1.19-2.87.83-.82 1.86-1.283 3.09-1.39.006.153.01.307.01.463h-.17ZM20.99 17.02c-.36.84-.53 1.21-.99 1.95-.64 1.03-1.55 2.31-2.67 2.32-1 .01-1.26-.65-2.61-.64-1.35.01-1.63.65-2.63.64-1.12-.01-1.98-1.17-2.62-2.2C6.66 16.86 6.2 13.5 7.5 11.36c.66-1.08 1.85-1.77 3.13-1.79 1.02-.02 1.98.68 2.61.68.62 0 1.79-.84 3.02-.72.51.02 1.96.21 2.89 1.57-.08.05-1.72 1.01-1.7 3 .02 2.38 2.09 3.17 2.11 3.18-.02.05-.33 1.13-1.08 2.24l.51-.5Z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.39 14.97.36 12 .36A11 11 0 0 0 2.18 7.06L5.84 9.9C6.71 7.3 9.14 4.75 12 4.75Z"
      />
    </svg>
  );
}
