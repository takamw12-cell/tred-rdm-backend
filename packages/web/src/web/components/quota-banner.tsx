import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, Wallet, X } from "lucide-react";

import { creditsMeOptions } from "@/queries/credits";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Le bandeau de quota — ce que l'étudiant doit savoir AVANT de taper.
 *
 * ── Le défaut qu'il corrige ───────────────────────────────────────────────
 *
 * Jusqu'ici, la seule façon d'apprendre qu'on approchait de sa limite était
 * d'ouvrir `/pricing` — une page qu'on n'ouvre pas tant que rien ne va mal. On
 * découvrait donc son quota en heurtant le mur, typiquement la veille d'une
 * Klausur. Une limite qui ne se voit qu'au moment où elle bloque n'est pas une
 * limite, c'est un piège.
 *
 * ── Le reçu est un ÉTAT, pas un événement ─────────────────────────────────
 *
 * Quand le quota mensuel est épuisé, `consume()` bascule silencieusement sur
 * les crédits achetés. Annoncer « tu viens de payer » APRÈS coup serait déjà
 * mieux que rien, mais c'est encore trop tard : l'argent est parti.
 *
 * Ce bandeau annonce donc l'état AVANT la question suivante — « les prochaines
 * questions sont payées sur ton solde, il t'en reste 12 ». Le même fait, dit
 * pendant qu'il est encore possible d'en tenir compte.
 *
 * ── Ce qui se ferme et ce qui ne se ferme pas ─────────────────────────────
 *
 * L'avertissement à 80 % se ferme : c'est une information utile qui ne doit
 * pas devenir du mobilier. L'état « je dépense ton argent » ne se ferme pas —
 * masquer une dépense en cours parce que l'utilisateur a cliqué sur une croix
 * une fois serait exactement le comportement qu'on cherche à supprimer.
 */

/** En dessous de ce reste, on prévient. Un cinquième du forfait. */
const SEUIL = 0.2;

export function QuotaBanner() {
  const { t } = useT();
  const { data } = useQuery(creditsMeOptions());
  const [ferme, setFerme] = useState(false);

  if (!data) return null;

  const { monthlyRemaining, monthlyLimit, purchasedCredits } = data;

  // ── Le quota est épuisé, mais il reste des crédits ──────────────────────
  // Le cas qui coûte de l'argent sans le dire. Non masquable.
  if (monthlyRemaining <= 0 && purchasedCredits > 0) {
    return (
      <Bandeau
        ton="credits"
        icone={<Wallet className="size-4 shrink-0" />}
        texte={t("quota.payingFromCredits", { count: purchasedCredits })}
        lien={{ href: "/credits", libelle: t("quota.topUp") }}
      />
    );
  }

  // ── Plus rien du tout ───────────────────────────────────────────────────
  // Le dire ici évite de laisser l'étudiant rédiger une longue question pour
  // la voir refusée à l'envoi.
  if (monthlyRemaining <= 0 && purchasedCredits <= 0) {
    return (
      <Bandeau
        ton="vide"
        icone={<AlertTriangle className="size-4 shrink-0" />}
        texte={t("quota.exhausted")}
        lien={{ href: "/credits", libelle: t("quota.topUp") }}
      />
    );
  }

  // ── L'avertissement ─────────────────────────────────────────────────────
  const proche = monthlyLimit > 0 && monthlyRemaining / monthlyLimit <= SEUIL;
  if (!proche || ferme) return null;

  return (
    <Bandeau
      ton="alerte"
      icone={<AlertTriangle className="size-4 shrink-0" />}
      texte={t("quota.nearLimit", { count: monthlyRemaining, limit: monthlyLimit })}
      lien={{ href: "/credits", libelle: t("quota.topUp") }}
      onFermer={() => setFerme(true)}
      libelleFermer={t("common.close")}
    />
  );
}

function Bandeau({
  ton,
  icone,
  texte,
  lien,
  onFermer,
  libelleFermer,
}: {
  ton: "alerte" | "credits" | "vide";
  icone: React.ReactNode;
  texte: string;
  lien: { href: string; libelle: string };
  onFermer?: () => void;
  libelleFermer?: string;
}) {
  return (
    /* Un <output> plutôt qu'un div avec role="status" : le rôle est implicite
       et les lecteurs d'écran annoncent le changement sans qu'on l'annote. */
    <output
      className={cn(
        "mb-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-[13px]",
        ton === "alerte" && "border-signature/40 bg-signature/10 text-foreground",
        ton === "credits" && "border-border bg-muted text-foreground",
        ton === "vide" && "border-destructive/40 bg-destructive/10 text-foreground",
      )}
    >
      <span className={cn(ton === "vide" ? "text-destructive" : "text-signature")}>
        {icone}
      </span>
      <p className="min-w-0 flex-1">{texte}</p>
      <Link
        href={lien.href}
        className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
      >
        {lien.libelle}
      </Link>
      {onFermer && (
        <button
          type="button"
          onClick={onFermer}
          aria-label={libelleFermer}
          className="text-muted-foreground hover:text-foreground shrink-0"
        >
          <X className="size-4" />
        </button>
      )}
    </output>
  );
}
