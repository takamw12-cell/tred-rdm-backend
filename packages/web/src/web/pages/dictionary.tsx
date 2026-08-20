import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Check, Quote } from "lucide-react";
import { PageContainer, PageHeader, Reveal } from "@/components/page";
import { ConceptBadge } from "@/components/concept-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/i18n";
import { terms, categories } from "@/data/dictionary";
import { useLearningStore, type KnowState } from "@/stores/learning";
import { cn } from "@/lib/utils";

export default function DictionaryPage() {
  const { t, locale } = useT();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const termStates = useLearningStore((s) => s.termStates);
  const setTermState = useLearningStore((s) => s.setTermState);

  function stateOf(id: string, fallback: KnowState): KnowState {
    return termStates[id] ?? fallback;
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return terms.filter((term) => {
      const matchCat = category === "all" || term.category === category;
      const matchQ =
        !q ||
        term.term.toLowerCase().includes(q) ||
        term.translation[locale].toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [query, category, locale]);

  const known = terms.filter((term) => stateOf(term.id, term.defaultState) === "mastered").length;

  return (
    <PageContainer>
      <PageHeader title={t("dictionary.title")} subtitle={t("dictionary.subtitle")} />

      <Reveal className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("dictionary.searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder={t("dictionary.allCategories")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("dictionary.allCategories")}</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Reveal>

      <Reveal className="mb-6">
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="text-muted-foreground font-medium">
            {t("dictionary.progress", { known, total: terms.length })}
          </span>
        </div>
        <Progress value={(known / terms.length) * 100} />
      </Reveal>

      {filtered.length === 0 ? (
        <Reveal>
          <p className="text-muted-foreground py-10 text-center text-sm">{t("dictionary.noResults")}</p>
        </Reveal>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((term, i) => {
            const state = stateOf(term.id, term.defaultState);
            const isMastered = state === "mastered";
            return (
              <motion.div
                key={term.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.3), ease: [0.16, 1, 0.3, 1] }}
              >
                <Card className="h-full">
                  <CardContent className="flex h-full flex-col pt-0">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-display text-lg font-bold">{term.term}</h3>
                        <p className="text-primary text-sm font-medium capitalize">
                          {term.translation[locale]}
                        </p>
                      </div>
                      <ConceptBadge state={state} />
                    </div>
                    <span className="text-muted-foreground mb-3 text-xs font-medium">{term.category}</span>
                    <p className="reading-scalable text-sm leading-relaxed">{term.definition[locale]}</p>
                    <div className="text-muted-foreground bg-secondary/50 mt-3 flex gap-2 rounded-lg p-2.5 text-xs italic">
                      <Quote className="text-primary/60 size-3.5 shrink-0" />
                      <span>{term.example[locale]}</span>
                    </div>
                    <div className="mt-4 flex-1" />
                    <Button
                      variant={isMastered ? "secondary" : "outline"}
                      size="sm"
                      className={cn("mt-2 w-full", isMastered && "text-mastered")}
                      onClick={() => setTermState(term.id, isMastered ? "learning" : "mastered")}
                    >
                      <Check className="size-4" />
                      {t("dictionary.markKnown")}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
