import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";

/**
 * La porte de l'administration, côté navigateur.
 *
 * La vraie protection est sur le serveur (api/lib/admin-guard.ts) : il
 * refuse la page et chaque donnée. Cette porte évite seulement qu'un
 * étudiant qui tape /admin dans l'app voie une coquille vide : tant que le
 * serveur n'a pas répondu « oui », RIEN de l'administration n'est monté —
 * ni page, ni requête de données, ni même le code des pages (chargé à la
 * demande, après la réponse).
 *
 * Refus : la même page « introuvable » que pour une adresse qui n'existe pas.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"pending" | "admin" | "denied">("pending");

  useEffect(() => {
    let live = true;
    fetch("/api/admin/session", { credentials: "same-origin", cache: "no-store" })
      .then((res) => live && setState(res.ok ? "admin" : "denied"))
      .catch(() => live && setState("denied"));
    return () => {
      live = false;
    };
  }, []);

  if (state === "pending") return null;
  if (state === "denied") return <NotFound />;
  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="font-display text-5xl font-extrabold tracking-tight">404</p>
      <Link href="/dashboard" className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4">
        TRED
      </Link>
    </div>
  );
}
