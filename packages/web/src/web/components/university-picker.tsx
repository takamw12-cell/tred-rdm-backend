import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { useUserStore } from "@/stores/user";
import { useLocaleStore } from "@/stores/locale";
import { Modal } from "@/components/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  BUNDESLAENDER,
  findUniversity,
  flagUrl,
  groupByLand,
  searchUniversities,
  type LandCode,
  type University,
} from "@/lib/universities";
import { cn } from "@/lib/utils";

/**
 * Hochschule — réglages. Une modale : recherche, Hochschulen groupées par
 * Land avec le drapeau du Land, et « andere Hochschule » en texte libre.
 * Écrit `profile.university` (nom officiel), que lit aussi la recherche de
 * cours du Dashboard.
 */

const COPY = {
  de: { choose: "Hochschule wählen", change: "Ändern", search: "Hochschule, Stadt oder Bundesland …", other: "Andere Hochschule", otherHint: "Nicht in der Liste? Gib den Namen ein:", save: "Übernehmen", none: "Keine Treffer.", title: "Deine Hochschule" },
  fr: { choose: "Choisir ton établissement", change: "Modifier", search: "Établissement, ville ou Land …", other: "Autre établissement", otherHint: "Pas dans la liste ? Saisis son nom :", save: "Valider", none: "Aucun résultat.", title: "Ton établissement" },
  en: { choose: "Choose your university", change: "Change", search: "University, city or state …", other: "Other university", otherHint: "Not listed? Type its name:", save: "Apply", none: "No matches.", title: "Your university" },
};
export function universityCopy(locale: string) {
  return locale === "de" ? COPY.de : locale === "fr" ? COPY.fr : COPY.en;
}

/** Petit drapeau du Land en « pill » : 5:3, coins arrondis, liseré discret (clair et sombre). */
export function LandFlag({ land, className }: { land: LandCode; className?: string }) {
  return (
    <img
      src={flagUrl(land)}
      alt={BUNDESLAENDER[land]}
      title={BUNDESLAENDER[land]}
      width={20}
      height={12}
      loading="lazy"
      decoding="async"
      className={cn(
        "inline-block h-3 w-5 shrink-0 rounded-[3px] object-cover",
        "shadow-[0_0_0_1px_rgb(15_23_42/0.12)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.18)]",
        className,
      )}
    />
  );
}

/** Monogramme à la place du logo (les logos sont des marques protégées). */
export function UniMonogram({ u, className }: { u: University; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-8 min-w-8 shrink-0 place-items-center rounded-lg px-1.5 text-[10px] leading-none font-bold tracking-tight",
        "bg-[#0F172A] text-[#EAB308] dark:bg-[#EAB308]/15",
        className,
      )}
    >
      {u.short}
    </span>
  );
}

export function UniversityPicker() {
  const locale = useLocaleStore((s) => s.locale);
  const c = universityCopy(locale);
  const profile = useUserStore((s) => s.profile);
  const setProfile = useUserStore((s) => s.setProfile);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [other, setOther] = useState("");

  const current = findUniversity(profile.university);
  const groups = useMemo(() => groupByLand(searchUniversities(query)), [query]);

  const choose = (name: string) => {
    setProfile({ ...profile, university: name });
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOther(current ? "" : profile.university);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        className="border-input bg-background hover:bg-accent flex w-72 max-w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors"
      >
        {current ? <LandFlag land={current.land} /> : null}
        <span className="min-w-0 flex-1 truncate">{current?.name ?? (profile.university || c.choose)}</span>
        <ChevronDown className="text-muted-foreground size-4 shrink-0" aria-hidden />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={c.title}>
        <div className="relative mb-3">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={c.search} aria-label={c.search} className="pl-9" />
        </div>

        <div className="-mx-2 max-h-[55vh] overflow-y-auto px-2">
          {groups.length === 0 && <p className="text-muted-foreground py-4 text-center text-sm">{c.none}</p>}
          {groups.map(({ land, items }) => (
            <section key={land} className="mb-3">
              <h3 className="text-muted-foreground mb-1.5 flex items-center gap-2 font-sans text-[11px] font-semibold tracking-wide uppercase">
                <LandFlag land={land} />
                {BUNDESLAENDER[land]}
              </h3>
              <ul className="space-y-1">
                {items.map((u) => {
                  const selected = current?.id === u.id;
                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => choose(u.name)}
                        aria-pressed={selected}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition-colors",
                          selected ? "border-[#EAB308] bg-[#EAB308]/10" : "hover:bg-accent border-transparent",
                        )}
                      >
                        <UniMonogram u={u} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{u.name}</span>
                          <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                            <LandFlag land={u.land} className="h-2.5 w-4" />
                            {u.city}
                          </span>
                        </span>
                        {selected && <Check className="size-4 shrink-0 text-[#EAB308]" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <div className="border-border mt-3 border-t pt-3">
          <p className="text-muted-foreground mb-1.5 text-xs">{c.otherHint}</p>
          <div className="flex gap-2">
            <Input value={other} onChange={(e) => setOther(e.target.value)} placeholder={c.other} aria-label={c.other} />
            <Button type="button" disabled={other.trim().length < 2} onClick={() => choose(other.trim())}>
              {c.save}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** Drapeau + nom, en pastille — Dashboard (sur la photo sombre). */
export function UniversityBadge({ className }: { className?: string }) {
  const university = useUserStore((s) => s.profile.university);
  const u = findUniversity(university);
  if (!u) return null;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-full border border-white/20 bg-white/10 py-1 pr-3 pl-1.5 text-xs font-medium text-white backdrop-blur-md",
        className,
      )}
    >
      <LandFlag land={u.land} className="h-3.5 w-[22px] rounded-full shadow-[0_0_0_1px_rgb(255_255_255/0.35)]" />
      <span className="truncate">{u.name}</span>
      <span className="text-white/60">· {u.city}</span>
    </span>
  );
}
