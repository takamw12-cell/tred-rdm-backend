import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProfessorPortrait } from "@/components/professor-portrait";
import { useT } from "@/i18n";
import { orpc, client } from "@/lib/api";
import { PROFESSORS, PROFESSOR_IDS, professorText, useProfessor, type ProfessorId } from "@/lib/professors";
import { useLocaleStore } from "@/stores/locale";
import { checkProfessorName, PROFESSOR_NAME_MAX } from "../../api/lib/professor-name";

/**
 * « Dein Professor » : le prénom et la voix du professeur, en plus du
 * personnage choisi dans le vestiaire. Le prénom passe par le même filtre
 * que le serveur (api/lib/professor-name.ts) pendant la saisie ; le serveur
 * redécide à l'enregistrement.
 *
 * « Stimme testen » joue une phrase d'accueil courte dans la voix choisie
 * (POST /api/tts). La même phrase n'est payée qu'une fois (api/tts/cache.ts).
 */
export function ProfessorCustom() {
  const saved = useQuery(orpc.account.getProfessor.queryOptions());
  if (!saved.data) return <Loader2 className="text-muted-foreground size-5 animate-spin" aria-hidden />;
  // Les valeurs enregistrées remplissent le formulaire à l'ouverture.
  return <ProfessorCustomForm savedName={saved.data.customName} savedVoice={saved.data.customVoice} />;
}

function ProfessorCustomForm({ savedName, savedVoice }: { savedName: string | null; savedVoice: ProfessorId | null }) {
  const { t } = useT();
  const locale = useLocaleStore((s) => s.locale);
  const qc = useQueryClient();
  const professor = useProfessor();
  const [name, setName] = useState(savedName ?? "");
  const [voice, setVoice] = useState<ProfessorId | "">(savedVoice ?? "");
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [testing, setTesting] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => audio.current?.pause(), []);

  const shownName = name.trim() || PROFESSORS[professor.id].name;
  const check = name.trim() ? checkProfessorName(name) : null;
  const nameError = check && !check.ok ? t(`profCustom.refused.${check.reason}`) : null;
  const slot: ProfessorId = voice || professor.id;

  const save = useMutation({
    mutationFn: () => client.account.setProfessorCustom({ name: name.trim() || null, voice: voice || null }),
    onSuccess: (res) => {
      if (res.ok) {
        setNotice({ tone: "ok", text: t("profCustom.saved", { name: res.custom.name ?? PROFESSORS[professor.id].name }) });
        void qc.invalidateQueries({ queryKey: orpc.account.getProfessor.key() });
      } else setNotice({ tone: "error", text: t(`profCustom.refused.${res.reason}`) });
    },
    onError: () => setNotice({ tone: "error", text: t("profCustom.saveError") }),
  });

  async function testVoice() {
    if (playing) {
      audio.current?.pause();
      setPlaying(false);
      return;
    }
    setNotice(null);
    setTesting(true);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t("profCustom.greeting", { name: shownName }), locale, voice: slot }),
      });
      if (!res.ok) {
        setNotice({ tone: "error", text: res.status === 429 ? t("profCustom.testLimit") : res.status === 503 ? t("profCustom.testUnavailable") : t("profCustom.testError") });
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      audio.current?.pause();
      const a = new Audio(url);
      audio.current = a;
      a.onended = () => {
        setPlaying(false);
        URL.revokeObjectURL(url);
      };
      setPlaying(true);
      await a.play();
    } catch {
      setPlaying(false);
      setNotice({ tone: "error", text: t("profCustom.testError") });
    } finally {
      setTesting(false);
    }
  }

  const voiceLabel = (id: ProfessorId) => `${PROFESSORS[id].name} · ${professorText(PROFESSORS[id].title, locale)}`;
  const dirty = (name.trim() || null) !== savedName || (voice || null) !== savedVoice;

  return (
    <div className="grid gap-6 rounded-2xl bg-[#0B0F19] p-5 text-white shadow-[0_24px_60px_-30px_rgba(124,58,237,0.55)] ring-1 ring-white/10 md:grid-cols-[11rem_1fr] sm:p-6" data-testid="professor-custom">
      {/* L'aperçu : le personnage choisi, avec le prénom tel qu'il apparaîtra dans le Hörsaal. */}
      <div className="flex flex-col items-center gap-3 text-center md:items-start md:text-left">
        <div className="size-28 overflow-hidden rounded-2xl ring-2 ring-[#EAB308]/70">
          <ProfessorPortrait professor={PROFESSORS[professor.id]} eager />
        </div>
        <div>
          <p className="font-display text-lg font-bold leading-tight" data-testid="professor-custom-preview">{shownName}</p>
          <p className="text-xs text-white/60">{professorText(PROFESSORS[professor.id].title, locale)}</p>
        </div>
      </div>

      <div className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="prof-name" className="text-sm font-semibold">{t("profCustom.nameLabel")}</label>
          <Input
            id="prof-name"
            value={name}
            maxLength={PROFESSOR_NAME_MAX + 6}
            onChange={(e) => {
              setName(e.target.value);
              setNotice(null);
            }}
            placeholder={PROFESSORS[professor.id].name}
            aria-invalid={nameError ? true : undefined}
            aria-describedby="prof-name-help"
            className="max-w-sm border-white/15 bg-white/[0.06] text-white placeholder:text-white/40 focus-visible:ring-[#EAB308]"
            data-testid="professor-name-input"
          />
          <p id="prof-name-help" className={nameError ? "text-xs font-medium text-[#FCA5A5]" : "text-xs text-white/60"} data-testid="professor-name-help">
            {nameError ?? t("profCustom.nameHelp", { max: PROFESSOR_NAME_MAX })}
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="prof-voice" className="text-sm font-semibold">{t("profCustom.voiceLabel")}</label>
          <div className="flex flex-wrap items-center gap-2">
            {/* appearance-none : Safari ignore le fond d'un menu natif (blanc sur blanc sinon). */}
            <div className="relative w-full max-w-sm">
            <select
              id="prof-voice"
              value={voice}
              onChange={(e) => {
                audio.current?.pause();
                setPlaying(false);
                setVoice(e.target.value as ProfessorId | "");
              }}
              className="h-10 w-full appearance-none rounded-xl border border-white/15 bg-[#151B2B] pr-9 pl-3 text-sm text-white [&>option]:bg-white [&>option]:text-[#0F172A]"
              data-testid="professor-voice-select"
            >
              <option value="">{t("profCustom.voiceDefault", { name: PROFESSORS[professor.id].name })}</option>
              {PROFESSOR_IDS.map((id) => (
                <option key={id} value={id}>{voiceLabel(id)}</option>
              ))}
            </select>
            <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-white/70" />
            </div>
            <Button type="button" variant="outline" className="h-10 rounded-xl border-white/20 bg-white/[0.06] text-white hover:bg-white/[0.12] hover:text-white" onClick={() => void testVoice()} disabled={testing || Boolean(nameError)} data-testid="professor-voice-test">
              {testing ? <Loader2 className="size-4 animate-spin" /> : playing ? <Square className="size-4" /> : <Play className="size-4" />}
              {playing ? t("profCustom.stop") : t("profCustom.test")}
            </Button>
          </div>
          <p className="text-xs text-white/60">{t("profCustom.voiceHelp")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" className="bg-[#EAB308] font-semibold text-[#0F172A] hover:bg-[#FACC15]" onClick={() => save.mutate()} disabled={!dirty || Boolean(nameError) || save.isPending} data-testid="professor-custom-save">
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {t("profCustom.save")}
          </Button>
          {notice && (
            <output className={notice.tone === "ok" ? "text-sm font-medium text-[#86EFAC]" : "text-sm font-medium text-[#FCA5A5]"} data-testid="professor-custom-notice">
              {notice.text}
            </output>
          )}
        </div>
      </div>
    </div>
  );
}
