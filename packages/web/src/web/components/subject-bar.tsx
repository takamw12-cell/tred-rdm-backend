import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Check, FolderOpen } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { documentsListKey } from "@/queries/documents";
import {
  subjectsListOptions,
  subjectsListKey,
  subjectCreateOptions,
  subjectRemoveOptions,
} from "@/queries/subjects";

/**
 * La rangée des Fächer d'un semestre.
 *
 * ── Ce qu'elle règle ──────────────────────────────────────────────────────
 *
 * La hiérarchie s'arrêtait à Semester → Documents. Un étudiant de six matières
 * voyait trente fichiers en vrac et finissait par créer un « semestre » nommé
 * « elektrotechnik ». Le Fach est le niveau qui manquait.
 *
 * ── Pourquoi le filtre est local ──────────────────────────────────────────
 *
 * Les documents du semestre sont déjà chargés. Filtrer côté serveur ajouterait
 * un aller-retour à chaque clic sur une puce, pour trier une liste qu'on a
 * sous la main. Le filtre est donc instantané, et la requête ne repart que
 * quand le semestre change.
 *
 * ── « Nicht zugeordnet » n'apparaît que s'il y en a ───────────────────────
 *
 * Une case permanente et toujours vide finit par être lue comme un défaut.
 */

/** Les six teintes de `SUBJECT_COLORS`, rendues ici. Le serveur ne connaît
 *  que les noms — lui faire porter des valeurs CSS le lierait au thème. */
const TEINTE: Record<string, string> = {
  slate: "bg-muted-foreground",
  blue: "bg-primary",
  green: "bg-mastered",
  amber: "bg-learning",
  violet: "bg-violet-500",
  rose: "bg-rose-500",
};

export function SubjectBar({
  semesterId,
  active,
  onChange,
}: {
  semesterId: string;
  /** null = tous les Fächer · "none" = les non classés · sinon un id */
  active: string | null;
  onChange: (value: string | null) => void;
}) {
  const { t } = useT();
  const qc = useQueryClient();

  const { data } = useQuery(subjectsListOptions(semesterId));
  const subjects = data?.subjects ?? [];
  const unassigned = data?.unassigned ?? 0;

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  /**
   * Le champ prend le focus quand il apparaît.
   *
   * Par un ref et non `autoFocus` : la règle jsx-a11y interdit l'attribut, à
   * juste titre — un champ qui capture le focus au chargement d'une page
   * désoriente. Ici le champ n'existe qu'après un clic délibéré sur « Neues
   * Fach », et ne pas y placer le curseur obligerait à cliquer deux fois.
   */
  const champ = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (creating) champ.current?.focus();
  }, [creating]);

  const create = useMutation(subjectCreateOptions());
  const remove = useMutation(subjectRemoveOptions());

  async function rafraichir() {
    await qc.invalidateQueries({ queryKey: subjectsListKey() });
    await qc.invalidateQueries({ queryKey: documentsListKey() });
  }

  async function ajouter() {
    const valeur = name.trim();
    if (!valeur || create.isPending) return;
    // La teinte suit le rang de création : six Fächer d'affilée sortent en six
    // couleurs différentes sans que personne n'ait à choisir.
    const teintes = Object.keys(TEINTE);
    await create.mutateAsync({
      semesterId,
      name: valeur,
      color: teintes[subjects.length % teintes.length] as "slate",
    });
    setName("");
    setCreating(false);
    await rafraichir();
  }

  async function supprimer(id: string, libelle: string) {
    const r = await remove.mutateAsync({ id });
    if (active === id) onChange(null);
    await rafraichir();
    // On dit combien de documents sont revenus en « non classé ». Sans ce
    // nombre, supprimer un Fach ressemble à supprimer son contenu.
    if (r.released > 0) {
      window.setTimeout(
        () => alert(t("subjects.removedNotice", { name: libelle, n: r.released })),
        0,
      );
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Puce active={active === null} onClick={() => onChange(null)}>
        {t("subjects.all")}
      </Puce>

      {subjects.map((s) => (
        <Puce
          key={s.id}
          active={active === s.id}
          onClick={() => onChange(s.id)}
          onDelete={() => void supprimer(s.id, s.name)}
          deleteLabel={t("subjects.remove", { name: s.name })}
        >
          <span className={cn("size-2 rounded-full", TEINTE[s.color] ?? TEINTE.slate)} />
          {s.name}
          <span className="text-muted-foreground tabular-nums">{s.documentCount}</span>
        </Puce>
      ))}

      {unassigned > 0 && (
        <Puce active={active === "none"} onClick={() => onChange("none")}>
          <FolderOpen className="size-3.5" />
          {t("subjects.unassigned")}
          <span className="text-muted-foreground tabular-nums">{unassigned}</span>
        </Puce>
      )}

      {creating ? (
        <span className="flex items-center gap-1.5">
          <Input
            ref={champ}
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void ajouter();
              if (e.key === "Escape") {
                setCreating(false);
                setName("");
              }
            }}
            placeholder={t("subjects.namePlaceholder")}
            aria-label={t("subjects.new")}
            className="h-8 w-44 text-sm"
          />
          <Button size="sm" className="h-8 px-2" disabled={!name.trim()} onClick={() => void ajouter()}>
            <Check className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2"
            onClick={() => {
              setCreating(false);
              setName("");
            }}
          >
            <X className="size-4" />
          </Button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="text-muted-foreground hover:text-primary hover:border-primary/50 border-border flex items-center gap-1.5 rounded-full border border-dashed px-2.5 py-1 text-xs font-medium transition-colors"
        >
          <Plus className="size-3.5" />
          {t("subjects.new")}
        </button>
      )}
    </div>
  );
}

/** Une puce de Fach. La croix n'apparaît qu'au survol : six croix visibles en
 *  permanence transforment une barre de navigation en champ de mines. */
function Puce({
  active,
  onClick,
  onDelete,
  deleteLabel,
  children,
}: {
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(
          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
          active
            ? "border-primary bg-primary/10 text-primary"
            : "border-border text-foreground hover:border-primary/40",
        )}
      >
        {children}
      </button>
      {onDelete && (
        <button
          type="button"
          aria-label={deleteLabel}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="bg-background border-border text-muted-foreground hover:text-destructive hover:border-destructive absolute -top-1.5 -right-1.5 hidden size-4 place-items-center rounded-full border group-hover:grid group-focus-within:grid"
        >
          <X className="size-2.5" />
        </button>
      )}
    </span>
  );
}
