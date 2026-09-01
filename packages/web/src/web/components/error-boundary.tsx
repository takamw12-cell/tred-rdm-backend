import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Filet de sécurité contre la page blanche.
 *
 * Sans lui, une seule erreur de rendu — un `undefined.map`, une réponse d'API
 * d'une forme inattendue — vide tout l'écran. L'utilisateur ne voit rien, ne
 * comprend rien, et ferme l'onglet. Toi, tu n'en sauras jamais rien.
 *
 * Il doit rester une CLASSE : React n'expose `componentDidCatch` que là. Il
 * n'existe aucun équivalent en hook, et ce n'est pas près de changer.
 *
 * Deux limites à connaître :
 *   • il n'attrape PAS les erreurs asynchrones (promesses rejetées, callbacks
 *     de setTimeout) — d'où le `window.onunhandledrejection` plus bas ;
 *   • il n'attrape pas les erreurs des gestionnaires d'événements.
 */

interface Props {
  children: ReactNode;
  /** Nom de la zone, pour distinguer les rapports. */
  area?: string;
}

interface State {
  error: Error | null;
}

/** Envoie le rapport au serveur. Ne lève jamais : au pire, on perd un rapport. */
function report(payload: Record<string, unknown>): void {
  try {
    const body = JSON.stringify({
      ...payload,
      url: window.location.pathname + window.location.search,
      userAgent: navigator.userAgent.slice(0, 200),
      at: new Date().toISOString(),
    });

    // `sendBeacon` survit à la fermeture de l'onglet, ce qui est exactement le
    // cas ici : l'utilisateur voit un écran cassé et s'en va. Un `fetch`
    // ordinaire serait annulé au déchargement de la page.
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/errors", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* un rapport perdu ne doit pas provoquer une seconde erreur */
  }
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[boundary]", error, info.componentStack);
    report({
      kind: "render",
      area: this.props.area ?? "app",
      message: error.message,
      stack: error.stack?.slice(0, 2000),
      componentStack: info.componentStack?.slice(0, 1000),
    });
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="bg-background flex min-h-[60vh] items-center justify-center p-6">
        <div className="border-border/50 bg-card w-full max-w-md rounded-2xl border p-8 text-center shadow-sm">
          <AlertTriangle className="text-warning mx-auto size-8" />

          <h2 className="mt-4 text-base font-semibold">Etwas ist schiefgelaufen</h2>

          {/* Le message technique est offert, pas imposé : un étudiant n'a
              rien à en faire, mais celui qui te le signale peut le copier. */}
          <p className="text-muted-foreground mt-2 text-sm">
            Diese Seite konnte nicht angezeigt werden. Der Fehler wurde gemeldet.
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="bg-primary text-primary-foreground inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
            >
              <RotateCcw className="size-4" />
              Erneut versuchen
            </button>
            <button
              type="button"
              onClick={() => (window.location.href = "/dashboard")}
              className="text-muted-foreground hover:text-foreground rounded-lg px-4 py-2 text-sm transition-colors"
            >
              Zum Dashboard
            </button>
          </div>

          <details className="mt-6 text-left">
            <summary className="text-muted-foreground cursor-pointer text-xs">
              Technische Details
            </summary>
            <pre className="text-muted-foreground mt-2 max-h-40 overflow-auto rounded-lg bg-secondary p-3 text-[11px] whitespace-pre-wrap">
              {error.message}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}

/**
 * Attrape ce que la barrière ne voit pas : promesses rejetées et erreurs
 * globales. À appeler UNE fois, au démarrage.
 */
let installed = false;
export function installGlobalErrorReporting(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason as { message?: string; stack?: string } | undefined;
    report({
      kind: "unhandledrejection",
      message: String(reason?.message ?? e.reason ?? "inconnu").slice(0, 500),
      stack: reason?.stack?.slice(0, 2000),
    });
  });

  window.addEventListener("error", (e) => {
    // Les erreurs de chargement de ressource (image, script) remontent ici
    // sans objet Error. Elles polluent le journal sans rien apprendre.
    if (!e.error) return;
    report({
      kind: "window",
      message: String(e.message).slice(0, 500),
      stack: e.error?.stack?.slice(0, 2000),
    });
  });
}
