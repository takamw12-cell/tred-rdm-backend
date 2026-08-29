import { useMemo, useState } from "react";
import { ChevronRight, BookOpen, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Course Structure Navigator — le sommaire d'un cours.
 *
 * Remplace les arbres mermaid, qui rendaient mal une hiérarchie : un graphe
 * s'étale horizontalement, illisible dès trois niveaux et impossible à lire
 * sur un téléphone. Un sommaire, lui, est vertical comme un écran de
 * téléphone, se replie, et se lit à la vitesse d'une table des matières.
 *
 * Le modèle n'émet plus que des DONNÉES (un bloc ```json). Le dessin est fait
 * ici, en React — donc identique à chaque fois, contrairement à un SVG
 * réinventé à chaque réponse.
 */

export interface CurriculumModule {
  title: string;
  description?: string;
  sections?: string[];
  status?: "active" | "done" | "inactive";
}

export interface CurriculumData {
  type: "curriculum";
  title?: string;
  modules: CurriculumModule[];
}

/**
 * Analyse tolérante : le modèle produit parfois du JSON presque valide.
 * Renvoie `null` si ce n'est pas un curriculum — l'appelant retombe alors sur
 * l'affichage normal du bloc de code.
 */
export function parseCurriculum(raw: string): CurriculumData | null {
  try {
    const parsed = JSON.parse(raw.trim()) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    if (o.type !== "curriculum" || !Array.isArray(o.modules)) return null;

    const modules: CurriculumModule[] = [];
    for (const entry of o.modules) {
      if (!entry || typeof entry !== "object") continue;
      const m = entry as Record<string, unknown>;
      const title = typeof m.title === "string" ? m.title.trim() : "";
      if (!title) continue;
      modules.push({
        title,
        description:
          typeof m.description === "string" && m.description.trim()
            ? m.description.trim()
            : undefined,
        sections: Array.isArray(m.sections)
          ? m.sections.filter((s): s is string => typeof s === "string" && !!s.trim())
          : undefined,
        status:
          m.status === "active" || m.status === "done" ? m.status : "inactive",
      });
    }

    if (modules.length === 0) return null;
    return {
      type: "curriculum",
      title: typeof o.title === "string" ? o.title : undefined,
      modules,
    };
  } catch {
    return null;
  }
}

function ModuleRow({
  module,
  index,
  defaultOpen,
}: {
  module: CurriculumModule;
  index: number;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasSections = !!module.sections?.length;
  const active = module.status === "active";
  const done = module.status === "done";

  const body = (
    <div className="flex items-start gap-3 p-3.5 text-left sm:p-4">
      {/* Numéro de module — repère stable quand on parcourt la liste. */}
      <span
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums transition-colors",
          active
            ? "bg-primary text-primary-foreground"
            : done
              ? "bg-success/15 text-success"
              : "bg-secondary text-muted-foreground",
        )}
        aria-hidden
      >
        {String(index + 1).padStart(2, "0")}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4
            className={cn(
              "truncate text-sm font-semibold",
              active ? "text-primary" : "text-foreground",
            )}
          >
            {module.title}
          </h4>
          {active && (
            <span className="bg-primary/10 text-primary shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase">
              <CircleDot className="mr-1 inline size-2.5" aria-hidden />
              aktuell
            </span>
          )}
        </div>

        {module.description && (
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            {module.description}
          </p>
        )}

        {hasSections && !open && (
          <p className="text-muted-foreground/80 mt-1.5 text-[11px]">
            {module.sections!.length} Abschnitte
          </p>
        )}
      </div>

      {hasSections && (
        <ChevronRight
          className={cn(
            "text-muted-foreground mt-1 size-4 shrink-0 transition-transform duration-200",
            open && "rotate-90",
          )}
          aria-hidden
        />
      )}
    </div>
  );

  return (
    <li
      className={cn(
        "border-border/50 overflow-hidden rounded-xl border shadow-sm transition-colors",
        active ? "bg-primary/5 border-primary/30" : "bg-card",
      )}
    >
      {hasSections ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="hover:bg-accent/40 focus-visible:ring-ring/50 w-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          {body}
        </button>
      ) : (
        body
      )}

      {/* La grille 0fr → 1fr anime la hauteur sans la connaître à l'avance.
          `max-height` obligerait à deviner une valeur, qui serait fausse pour
          un module de dix sections. */}
      {hasSections && (
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-200 ease-out",
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden">
            <ul className="border-border/50 ml-[26px] space-y-0.5 border-l py-1 pr-3 pb-3 pl-4 sm:ml-[30px]">
              {module.sections!.map((section, i) => (
                <li
                  key={`${section}-${i}`}
                  className="text-muted-foreground hover:text-foreground flex items-start gap-2 py-1 text-xs transition-colors"
                >
                  <span className="bg-border mt-[7px] size-1 shrink-0 rounded-full" aria-hidden />
                  <span className="leading-relaxed">{section}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </li>
  );
}

export function Curriculum({ data }: { data: CurriculumData }) {
  // Le module actif s'ouvre tout seul : c'est celui que l'étudiant cherche.
  const activeIndex = useMemo(
    () => data.modules.findIndex((m) => m.status === "active"),
    [data.modules],
  );

  return (
    <section className="my-4" aria-label={data.title ?? "Kursstruktur"}>
      {data.title && (
        <div className="mb-3 flex items-center gap-2">
          <BookOpen className="text-primary size-4 shrink-0" aria-hidden />
          <h3 className="text-sm font-bold">{data.title}</h3>
        </div>
      )}

      <ol className="space-y-2">
        {data.modules.map((module, i) => (
          <ModuleRow
            key={`${module.title}-${i}`}
            module={module}
            index={i}
            defaultOpen={i === activeIndex}
          />
        ))}
      </ol>
    </section>
  );
}
