import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { Box, FlaskConical, Gamepad2, Layers, SlidersHorizontal } from "lucide-react";
import { atelierHref } from "@/lib/atelier";
import { PageContainer, PageHeader } from "@/components/page";
import { useT } from "@/i18n";
import { DISCIPLINES, EXPLORER_MODELS, MODEL_IDS, pick, type Discipline } from "@/lib/explorer-models";

/**
 * La bibliothèque de l'Explorateur (19 nov. 2026) : une carte par scène 3D,
 * filtrée par filière. Les scènes livrées (lib/explorer-models.ts) et les
 * fichiers .glb déposés dans public/models/<filière>/ (GET /api/explorer/catalog).
 * Une carte ouvre la scène ; une scène à repères propose « 3D Detective ».
 */
const ATELIER = {
  de: { title: "Atelier · Spannungsteiler", text: "Interaktiver Simulator: Regler bewegen, Strom und Formeln ändern sich sofort." },
  en: { title: "Workshop · Voltage divider", text: "Interactive simulator: move the sliders, current and formulas change at once." },
  fr: { title: "Atelier · Diviseur de tension", text: "Simulateur interactif : bouge les curseurs, le courant et les formules changent tout de suite." },
} as const;

const LABO = {
  de: { title: "Labo · Simulationen aus deinen Unterlagen", text: "Wähle ein Dokument und ein Konzept: TRED baut eine 3D-Simulation und prüft jede Formel." },
  en: { title: "Lab · Simulations from your documents", text: "Pick a document and a concept: TRED builds a 3D simulation and checks every formula." },
  fr: { title: "Labo · Simulations tirées de tes documents", text: "Choisis un document et un concept : TRED construit une simulation 3D et vérifie chaque formule." },
} as const;

type Card = { key: string; href: string; discipline: Discipline; name: string; intro: string; parts: number; poster: string | null; game: boolean };

export function ExplorerLibrary() {
  const { t, locale } = useT();
  const reduced = useReducedMotion();
  const [filter, setFilter] = useState<Discipline | "all">("all");
  const dropped = useQuery({
    queryKey: ["explorer", "catalog"],
    queryFn: async () => ((await (await fetch("/api/explorer/catalog")).json()) as { dropped: Array<{ name: string; discipline: Discipline }> }).dropped,
    staleTime: 5 * 60_000,
  });

  const cards = useMemo<Card[]>(() => {
    const builtIn = MODEL_IDS.map((id) => {
      const m = EXPLORER_MODELS[id];
      return { key: id, href: `/explorer?model=${id}`, discipline: m.discipline, name: pick(m.name, locale), intro: pick(m.intro, locale), parts: m.hotspots.length, poster: `/explorer/${id}.jpg`, game: m.hotspots.length >= 3 };
    });
    const files = (dropped.data ?? []).map((f) => ({
      key: f.name,
      href: `/explorer?glb=${encodeURIComponent(f.name)}`,
      discipline: f.discipline,
      name: f.name.split("/").pop()!.replace(/-/g, " "),
      intro: t("explorer.droppedIntro"),
      parts: 0,
      poster: null,
      game: false,
    }));
    return [...builtIn, ...files];
  }, [dropped.data, locale, t]);
  const shown = filter === "all" ? cards : cards.filter((c) => c.discipline === filter);

  return (
    <PageContainer className="max-w-7xl">
      <PageHeader title={t("explorer.title")} subtitle={t("explorer.librarySubtitle")} />
      {/* L'Atelier : les simulateurs à curseurs (components/atelier.tsx). */}
      <Link to={atelierHref("spannungsteiler")} data-testid="atelier-card" className="bg-card hover:border-primary/60 mb-4 flex items-center gap-4 rounded-2xl border p-4 transition-colors focus-visible:ring-2 focus-visible:outline-none">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#EAB308]/15 text-[#B45309]">
          <SlidersHorizontal className="size-6" />
        </span>
        <span className="min-w-0">
          <span className="block font-bold">{ATELIER[locale as keyof typeof ATELIER]?.title ?? ATELIER.en.title}</span>
          <span className="text-muted-foreground block text-sm">{ATELIER[locale as keyof typeof ATELIER]?.text ?? ATELIER.en.text}</span>
        </span>
      </Link>
      {/* Le Labo : les simulations 3D vérifiées, construites à partir d'un document (components/labo.tsx). */}
      <Link to="/explorer?labo=1" data-testid="labo-card" className="bg-card hover:border-primary/60 mb-4 flex items-center gap-4 rounded-2xl border p-4 transition-colors focus-visible:ring-2 focus-visible:outline-none">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#34D399]/15 text-[#047857]">
          <FlaskConical className="size-6" />
        </span>
        <span className="min-w-0">
          <span className="block font-bold">{LABO[locale as keyof typeof LABO]?.title ?? LABO.en.title}</span>
          <span className="text-muted-foreground block text-sm">{LABO[locale as keyof typeof LABO]?.text ?? LABO.en.text}</span>
        </span>
      </Link>
      <div className="rounded-3xl bg-[#0B0F19] p-4 text-white shadow-[0_30px_80px_-40px_rgba(124,58,237,0.6)] ring-1 ring-white/10 sm:p-6" data-testid="explorer-library">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <label htmlFor="explorer-category" className="text-sm font-semibold text-white/80">
            {t("explorer.category")}
          </label>
          <select
            id="explorer-category"
            value={filter}
            onChange={(e) => setFilter(e.target.value as Discipline | "all")}
            data-testid="explorer-category"
            className="min-h-10 rounded-xl bg-white/[0.06] px-3 text-sm text-white ring-1 ring-white/15 backdrop-blur focus-visible:ring-2 focus-visible:ring-[#EAB308] focus-visible:outline-none [&>option]:text-[#0F172A]"
          >
            <option value="all">{t("explorer.allCategories")}</option>
            {DISCIPLINES.map((d) => (
              <option key={d.id} value={d.id}>
                {pick(d.name, locale)}
              </option>
            ))}
          </select>
          <span className="text-xs text-white/55">{t("explorer.count", { n: shown.length })}</span>
        </div>

        {shown.length === 0 ? (
          <p className="rounded-2xl bg-white/[0.04] p-6 text-sm text-white/75 ring-1 ring-white/10" data-testid="explorer-library-empty">
            {t("explorer.emptyCategory")}
          </p>
        ) : (
          <motion.ul
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            initial="hidden"
            animate="show"
            key={filter}
            variants={{ show: { transition: { staggerChildren: reduced ? 0 : 0.06 } } }}
          >
            {shown.map((c) => (
              <motion.li key={c.key} variants={{ hidden: reduced ? {} : { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } }}>
                <Link
                  to={c.href}
                  data-testid={`explorer-card-${c.key.replace("/", "-")}`}
                  className="group block overflow-hidden rounded-2xl bg-white/[0.05] ring-1 ring-white/10 backdrop-blur transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[0_18px_40px_-16px_rgba(34,211,238,0.45)] focus-visible:ring-2 focus-visible:ring-[#EAB308] focus-visible:outline-none"
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-[radial-gradient(ellipse_at_35%_20%,#1A2233_0%,#07090E_68%)]">
                    {c.poster ? (
                      <img src={c.poster} alt="" loading="lazy" className="absolute inset-0 size-full scale-[1.08] object-cover transition-transform duration-300 group-hover:scale-[1.12]" />
                    ) : (
                      <Box className="absolute inset-0 m-auto size-14 text-white/30" />
                    )}
                    <span className="absolute top-3 left-3 rounded-full bg-[#0F172A]/80 px-2.5 py-1 text-[11px] font-semibold text-white/90 ring-1 ring-white/15">
                      {pick(DISCIPLINES.find((d) => d.id === c.discipline)!.name, locale)}
                    </span>
                    {c.game && (
                      <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-[#EAB308]/90 px-2.5 py-1 text-[11px] font-bold text-[#0F172A]">
                        <Gamepad2 className="size-3.5" />
                        {t("explorer.playable")}
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <h2 className="font-semibold">{c.name}</h2>
                    <p className="mt-1 line-clamp-2 text-sm text-white/70">{c.intro}</p>
                    {c.parts > 0 && (
                      <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#67E8F9]">
                        <Layers className="size-3.5" />
                        {t("explorer.partsCount", { n: c.parts })}
                      </p>
                    )}
                  </div>
                </Link>
              </motion.li>
            ))}
          </motion.ul>
        )}
        <p className="mt-5 text-xs text-white/50">{t("explorer.dropHint")}</p>
      </div>
    </PageContainer>
  );
}
