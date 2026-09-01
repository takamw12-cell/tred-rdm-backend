import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { MarkdownContent } from "@/components/markdown-content";
import { LegalFooter } from "@/components/legal-footer";
import { Logo } from "@/components/logo";
import {
  LEGAL,
  LEGAL_TITLE,
  missingFields,
  type LegalDoc,
} from "@/data/legal";

/**
 * Page des mentions légales.
 *
 * **Publique par construction.** § 5 DDG exige que l'Impressum soit
 * « unmittelbar erreichbar » — joignable sans détour, donc sans connexion. La
 * route est pour cette raison montée AVANT la barrière d'authentification, dans
 * app.tsx. Une page légale derrière un mur de connexion ne remplit pas
 * l'obligation, et c'est l'un des motifs d'avertissement les plus courants.
 *
 * La page ne dépend ni de la session, ni d'une requête réseau : les textes sont
 * dans le paquet. Elle s'affiche donc même si l'API est en panne — ce qui est
 * précisément le moment où quelqu'un cherche à savoir qui tu es.
 */

/**
 * Le document est passé en propriété par la route, pas déduit de l'URL : une
 * route explicite par document rend impossible l'affichage d'une page vide sur
 * une adresse inattendue.
 */
export default function LegalPage({ doc }: { doc: LegalDoc }) {
  useEffect(() => {
    document.title = `${LEGAL_TITLE[doc]} · TRED`;
  }, [doc]);

  // Les emplacements non remplis ne sont signalés qu'en développement : un
  // bandeau rouge « modèle non complété » vu par un visiteur ferait plus de
  // dégâts que le manque lui-même. C'est `bun run legal` qui te les rappelle
  // avant le déploiement.
  const missing = import.meta.env.DEV ? missingFields(doc) : [];

  return (
    <div className="bg-background min-h-screen">
      <header className="border-border bg-background/80 sticky top-0 z-10 border-b backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-4 px-5">
          <Link
            to="/"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm transition-colors"
          >
            <ArrowLeft className="size-4" />
            Zurück
          </Link>
          <div className="ml-auto">
            <Logo />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="font-display mb-8 text-3xl font-bold tracking-tight">
          {LEGAL_TITLE[doc]}
        </h1>

        {missing.length > 0 && (
          <div className="border-signature/40 bg-signature/10 mb-8 rounded-xl border p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="size-4 shrink-0" />
              {missing.length} Platzhalter noch offen
            </p>
            <p className="text-muted-foreground mt-1.5 text-xs">
              Nur in der Entwicklung sichtbar. Zu ergänzen in{" "}
              <code>src/web/data/legal.ts</code>:
            </p>
            <p className="text-muted-foreground mt-2 font-mono text-xs break-words">
              {missing.join("  ·  ")}
            </p>
          </div>
        )}

        {/* `whitespace-pre-line` : les textes juridiques utilisent des sauts de
            ligne simples qui portent du sens — une adresse postale ne doit pas
            être recollée en un paragraphe. */}
        <MarkdownContent
          content={LEGAL[doc]}
          className="text-[15px] leading-relaxed [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-5 [&_h3]:mb-1 [&_h3]:text-base [&_hr]:my-6 [&_p]:whitespace-pre-line"
        />

        <div className="border-border mt-14 border-t pt-6">
          <LegalFooter />
        </div>
      </main>
    </div>
  );
}
