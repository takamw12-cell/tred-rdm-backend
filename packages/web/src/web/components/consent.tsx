import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Case de consentement — jamais précochée.
 *
 * Ce détail décide de la validité juridique. Une case cochée d'avance n'est
 * pas un consentement en droit allemand : ni pour la renonciation au droit de
 * rétractation (§ 356 Abs. 5 BGB), ni au sens du RGPD. Le composant n'expose
 * donc aucune valeur par défaut — l'état vient de l'appelant, qui doit partir
 * de `false`.
 */
export function Consent({
  checked,
  onChange,
  children,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2.5 text-left select-none"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
          "peer-focus-visible:ring-ring/50 peer-focus-visible:ring-2",
          checked
            ? "bg-primary border-primary text-primary-foreground"
            : "border-border bg-background",
        )}
      >
        {checked && <Check className="size-3" strokeWidth={3} />}
      </span>
      <span className="text-muted-foreground text-xs leading-relaxed">{children}</span>
    </label>
  );
}

/**
 * Le bloc complet à placer au-dessus du bouton d'abonnement.
 *
 * Les deux affirmations sont DISTINCTES et doivent le rester : la première est
 * la demande d'exécution anticipée, la seconde la reconnaissance de sa
 * conséquence. Les fusionner en une seule case annulerait l'effet — c'est
 * précisément ce que la jurisprudence sanctionne.
 */
export function WithdrawalConsent({
  start,
  lose,
  onStart,
  onLose,
  error,
}: {
  start: boolean;
  lose: boolean;
  onStart: (v: boolean) => void;
  onLose: (v: boolean) => void;
  error?: boolean;
}) {
  return (
    <div
      className={cn(
        "mt-4 space-y-2.5 rounded-xl border p-3 transition-colors",
        error ? "border-destructive/50 bg-destructive/5" : "border-border/50 bg-secondary/30",
      )}
    >
      <Consent id="consent-start" checked={start} onChange={onStart}>
        Ich verlange ausdrücklich, dass ihr vor Ablauf der Widerrufsfrist mit
        der Leistung beginnt.
      </Consent>

      <Consent id="consent-lose" checked={lose} onChange={onLose}>
        Mir ist bekannt, dass ich mit dem Beginn der Leistung mein
        Widerrufsrecht verliere (§ 356 Abs. 5 BGB).
      </Consent>

      {error && (
        <p className="text-destructive pt-1 text-xs">
          Bitte bestätige beide Punkte, um fortzufahren.
        </p>
      )}
    </div>
  );
}
