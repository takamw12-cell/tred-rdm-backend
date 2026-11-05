import { Route, Switch, Redirect, useSearch } from "wouter";
import LegalPage from "@/pages/legal";
import SecurityPage from "@/pages/security";
import LandingPage from "@/pages/landing";
import ResetPasswordPage from "@/pages/reset-password";
import { ErrorBoundary, installGlobalErrorReporting } from "@/components/error-boundary";
import { Loader2 } from "lucide-react";
import { Provider } from "./components/provider";
import { AppLayout } from "./components/layout";
import { useUserStore } from "./stores/user";
import { authClient } from "./lib/auth";
import { LogoMark } from "./components/logo";
import OnboardingPage from "./pages/onboarding";
import LoginPage from "./pages/login";
import DashboardPage from "./pages/dashboard";
import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { identifyUser } from "./lib/analytics";
import { AnalyticsConsent } from "./components/analytics-consent";

/**
 * Performance (audit du 5 nov. 2026) : seules les pages d'entrée — Dashboard,
 * connexion, onboarding, landing, mentions légales — sont dans le bundle
 * initial. Les autres se chargent à la première visite. Avant, le chat
 * (2 200 lignes), l'admin et l'examen pesaient sur l'ouverture du Dashboard.
 */
function lazyPage<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  const Page = lazy(load);
  return function LazyPage(props: P) {
    return (
      <Suspense fallback={<PageFallback />}>
        <Page {...props} />
      </Suspense>
    );
  };
}

function PageFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="text-muted-foreground size-6 animate-spin" />
    </div>
  );
}

const VirtualClassroom = lazyPage(() => import("@/components/virtual-classroom"));
const ChatPage = lazyPage(() => import("./pages/chat"));
const DictionaryPage = lazyPage(() => import("./pages/dictionary"));
const DnaPage = lazyPage(() => import("./pages/dna"));
const ExercisesPage = lazyPage(() => import("./pages/exercises"));
const FormulasPage = lazyPage(() => import("./pages/formulas"));
const ExamPage = lazyPage(() => import("./pages/exam"));
const SettingsPage = lazyPage(() => import("./pages/settings"));
const PricingPage = lazyPage(() => import("./pages/pricing"));
const CreditsPage = lazyPage(() => import("./pages/credits"));
const CoursesPage = lazyPage(() => import("./pages/courses"));
const AdminPage = lazyPage(() => import("./pages/admin"));
const AdminAnalyticsPage = lazyPage(() => import("./pages/admin-analytics"));
const ProfessorsPage = lazyPage(() => import("./pages/professors"));

function RootRedirect() {
  const onboarded = useUserStore((s) => s.onboarded);
  return <Redirect to={onboarded ? "/dashboard" : "/onboarding"} />;
}

/**
 * /login?redirect=/landing : la page de connexion est rendue par <Gate /> tant
 * qu'il n'y a pas de session. Dès que la session existe, on arrive ici et on
 * renvoie vers `redirect`. Chemin interne uniquement (« /x », jamais « //x »
 * ni « /\x ») : sinon n'importe quel lien pourrait rediriger hors du site.
 */
function LoginRedirect() {
  const target = new URLSearchParams(useSearch()).get("redirect");
  const safe = !!target && target.startsWith("/") && !/^\/[/\\]/.test(target);
  return safe ? <Redirect to={target} /> : <RootRedirect />;
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <LogoMark className="size-12 animate-pulse" />
      <Loader2 className="text-muted-foreground size-5 animate-spin" />
    </div>
  );
}

function AuthedApp() {
  return (
    <Switch>
      <Route path="/" component={RootRedirect} />
      <Route path="/login" component={LoginRedirect} />
      <Route path="/onboarding" component={OnboardingPage} />
      <Route path="/exam" component={ExamPage} />
      <Route>
        <ErrorBoundary area="app">
        <AppLayout>
          <Switch>
            <Route path="/dashboard" component={DashboardPage} />
            <Route path="/chat" component={ChatPage} />
            <Route path="/dictionary" component={DictionaryPage} />
            <Route path="/dna" component={DnaPage} />
            <Route path="/exercises" component={ExercisesPage} />
            <Route path="/formulas" component={FormulasPage} />
            <Route path="/settings" component={SettingsPage} />
            <Route path="/pricing" component={PricingPage} />
            {/* Séparée de /pricing : le mur du quota tombe sur quelqu'un qui
                révise, et qui veut dix questions ce soir — pas un abonnement. */}
            <Route path="/credits" component={CreditsPage} />
            <Route path="/courses" component={CoursesPage} />
            <Route path="/professors" component={ProfessorsPage} />
            {/* Serverseitig durch die Admin-Rolle geschützt, nicht durch Verstecken. */}
            <Route path="/admin/analytics" component={AdminAnalyticsPage} />
            <Route path="/admin" component={AdminPage} />
            <Route component={RootRedirect} />
          </Switch>
        </AppLayout>
        </ErrorBoundary>
      </Route>
    </Switch>
  );
}

function Gate() {
  const { data: session, isPending } = authClient.useSession();
  // ID pseudonyme pour l'analyse (no-op sans consentement). Jamais l'e-mail.
  const userId = session?.user.id;
  useEffect(() => identifyUser(userId), [userId]);
  if (isPending) return <LoadingScreen />;
  if (!session) return <LoginPage />;
  return <AuthedApp />;
}

installGlobalErrorReporting();

function App() {
  return (
    <Provider>
      {/* ── Routes publiques ────────────────────────────────────────────────
          Montées AVANT <Gate />, qui renvoie l'écran de connexion dès qu'il
          n'y a pas de session.

          • Les mentions légales : § 5 DDG exige que l'Impressum soit
            « unmittelbar erreichbar » — joignable sans détour, donc sans
            connexion. Derrière un mur de connexion, l'obligation n'est pas
            remplie.

          • La réinitialisation du mot de passe : on arrive dessus DÉCONNECTÉ,
            par un lien reçu par e-mail. Placée dans la zone authentifiée, elle
            ne s'ouvrait jamais — le lien renvoyait à la page de connexion, et
            personne ne pouvait changer son mot de passe. */}
      <Switch>
        <Route path="/impressum">{() => <LegalPage doc="impressum" />}</Route>
        <Route path="/datenschutz">{() => <LegalPage doc="datenschutz" />}</Route>
        <Route path="/widerruf">{() => <LegalPage doc="widerruf" />}</Route>
        <Route path="/agb">{() => <LegalPage doc="agb" />}</Route>
        {/* Sécurité & RGPD : lisible AVANT de créer un compte. */}
        <Route path="/security" component={SecurityPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        {/* Page de vente : publique, un visiteur sans compte doit la voir. */}
        <Route path="/landing" component={LandingPage} />
        {/* TEMPORAIRE : maquette « Digitaler Hörsaal », sans données. */}
        <Route path="/classroom" component={VirtualClassroom} />
        <Route>
          <Gate />
        </Route>
      </Switch>
      <AnalyticsConsent />
    </Provider>
  );
}

export default App;
