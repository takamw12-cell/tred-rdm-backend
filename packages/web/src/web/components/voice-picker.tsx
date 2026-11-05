import { useEffect, useState } from "react";
import { Loader2, Sparkles, Square, Volume2 } from "lucide-react";
import { useT } from "@/i18n";
import { PREMIUM_PREFIX, PROFESSOR_STYLE, VOICE_STYLES, type VoiceStyle } from "@/lib/speech";
import { useProfessor } from "@/lib/professors";
import { cn } from "@/lib/utils";
import {
  getPreferredVoice,
  getVoiceStyle,
  premiumVoices,
  setPreferredVoice,
  setVoiceStyle,
  speak,
  stopSpeaking,
  voicesFor,
  type PremiumVoice,
} from "@/lib/voice";

/**
 * La panoplie de voix (réglages).
 *
 *  • STIL — Calme / Énergique / Sévère, ou « automatique » = le caractère du
 *    professeur choisi (Sensei → calme, Dr. Aiko → sévère…).
 *  • STIMME — les voix premium ElevenLabs que le serveur propose (seulement
 *    celles réellement configurées), puis les voix de cet appareil.
 *
 * « Stimme testen » fait entendre EXACTEMENT la combinaison choisie.
 */

/** Textes (de / en / fr ; les autres langues lisent l'anglais). */
const UI = {
  de: {
    title: "Stimme des Professors",
    style: "Stil",
    styleAuto: "Wie mein Professor",
    styles: { calm: "Ruhig", energetic: "Energisch", strict: "Streng" },
    voice: "Stimme",
    auto: "Automatisch — beste verfügbare Stimme",
    premiumGroup: "Premium-Stimmen (ElevenLabs)",
    deviceGroup: "Stimmen dieses Geräts",
    slots: { senior: "Prof. Senior", junior: "Junger Prof", examiner: "Prüferin", standard: "Premium-Stimme" },
    test: "Stimme testen",
    stop: "Stopp",
    sample: "Hallo! Ich bin dein Professor. Heute rechnen wir zusammen das Kirchhoffsche Knotengesetz.",
    premium: "Premium-Stimmen verfügbar — beim Vorlesen wird der Text an ElevenLabs übermittelt.",
    none: "Dieser Browser bietet keine Sprachausgabe an.",
    hint: "Tipp: Gerätestimmen mit „Natural“, „Online“, „Google“ oder „Premium“ klingen am natürlichsten.",
  },
  en: {
    title: "Professor's voice",
    style: "Style",
    styleAuto: "Like my professor",
    styles: { calm: "Calm", energetic: "Energetic", strict: "Strict" },
    voice: "Voice",
    auto: "Automatic — best available voice",
    premiumGroup: "Premium voices (ElevenLabs)",
    deviceGroup: "Voices on this device",
    slots: { senior: "Senior Prof", junior: "Young Prof", examiner: "Examiner", standard: "Premium voice" },
    test: "Test voice",
    stop: "Stop",
    sample: "Hello! I'm your professor. Today we'll work through Kirchhoff's current law together.",
    premium: "Premium voices available — for read-aloud the text is sent to ElevenLabs.",
    none: "This browser has no speech synthesis.",
    hint: "Tip: device voices named “Natural”, “Online”, “Google” or “Premium” sound the most natural.",
  },
  fr: {
    title: "Voix du professeur",
    style: "Style",
    styleAuto: "Comme mon professeur",
    styles: { calm: "Calme", energetic: "Énergique", strict: "Sévère" },
    voice: "Voix",
    auto: "Automatique — la meilleure voix disponible",
    premiumGroup: "Voix premium (ElevenLabs)",
    deviceGroup: "Voix de cet appareil",
    slots: { senior: "Prof. Senior", junior: "Jeune Prof", examiner: "Examinatrice", standard: "Voix premium" },
    test: "Tester la voix",
    stop: "Arrêter",
    sample: "Bonjour ! Je suis ton professeur. Aujourd'hui, on applique ensemble la loi des nœuds de Kirchhoff.",
    premium: "Voix premium disponibles — pour la lecture, le texte est envoyé à ElevenLabs.",
    none: "Ce navigateur ne propose pas de synthèse vocale.",
    hint: "Astuce : les voix « Natural », « Online », « Google » ou « Premium » de l'appareil sont les plus naturelles.",
  },
} as const;

export function VoicePicker() {
  const { locale } = useT();
  const ui = locale === "de" || locale === "fr" ? UI[locale] : UI.en;
  const professor = useProfessor();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[] | null>(null);
  const [premium, setPremium] = useState<PremiumVoice[]>([]);
  const [chosen, setChosen] = useState<string>(() => getPreferredVoice() ?? "");
  const [style, setStyle] = useState<VoiceStyle | null>(() => getVoiceStyle());
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let alive = true;
    void voicesFor(locale).then((v) => alive && setVoices(v));
    void premiumVoices().then((p) => alive && setPremium(p));
    return () => {
      alive = false;
      stopSpeaking();
    };
  }, [locale]);

  function choose(uri: string) {
    setChosen(uri);
    setPreferredVoice(uri || null);
  }
  function chooseStyle(s: VoiceStyle | null) {
    setStyle(s);
    setVoiceStyle(s);
  }

  const professorStyle: VoiceStyle = PROFESSOR_STYLE[professor.id] ?? "calm";
  const effectiveStyle = style ?? professorStyle;

  function test() {
    if (playing) {
      stopSpeaking();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    void speak(ui.sample, locale, {
      voice: chosen,
      style: effectiveStyle,
      onEnd: () => setPlaying(false),
    }).then((ok) => !ok && setPlaying(false));
  }

  if (voices === null) {
    return <Loader2 className="text-muted-foreground size-4 animate-spin" />;
  }
  if (voices.length === 0 && premium.length === 0) {
    return <p className="text-muted-foreground text-sm">{ui.none}</p>;
  }

  const styleOptions: { value: VoiceStyle | null; label: string }[] = [
    { value: null, label: `${ui.styleAuto} (${ui.styles[professorStyle]})` },
    ...VOICE_STYLES.map((s) => ({ value: s, label: ui.styles[s] })),
  ];

  return (
    <div className="space-y-4">
      {premium.length > 0 && (
        <p className="flex items-center gap-2 rounded-xl bg-[#FEF3C7] px-3 py-2 text-sm text-[#92400E]">
          <Sparkles className="size-4 shrink-0" /> {ui.premium}
        </p>
      )}

      <div>
        <p className="mb-1.5 text-xs font-medium">{ui.style}</p>
        <div role="radiogroup" aria-label={ui.style} className="flex flex-wrap gap-1.5">
          {styleOptions.map((o) => {
            const active = style === o.value;
            return (
              <button
                key={o.value ?? "auto"}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => chooseStyle(o.value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  active
                    ? "border-[#0F172A] bg-[#0F172A] text-white"
                    : "border-border hover:bg-muted text-foreground",
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium">{ui.voice}</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            aria-label={ui.voice}
            value={chosen}
            onChange={(e) => choose(e.target.value)}
            className="border-border bg-background h-10 min-w-0 flex-1 rounded-xl border px-3 text-sm"
          >
            <option value="">{ui.auto}</option>
            {premium.length > 0 && (
              <optgroup label={ui.premiumGroup}>
                {premium.map((p) => (
                  <option key={p.id} value={`${PREMIUM_PREFIX}${p.id}`}>
                    {ui.slots[p.id as keyof typeof ui.slots] ?? p.id} · {ui.styles[p.style]}
                  </option>
                ))}
              </optgroup>
            )}
            {voices.length > 0 && (
              <optgroup label={ui.deviceGroup}>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <button
            type="button"
            onClick={test}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#0F172A] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#1E293B]"
          >
            {playing ? <Square className="size-4" /> : <Volume2 className="size-4" />}
            {playing ? ui.stop : ui.test}
          </button>
        </div>
      </div>
      <p className="text-muted-foreground text-xs">{ui.hint}</p>
    </div>
  );
}

export function voicePickerTitle(locale: string): string {
  return (locale === "de" || locale === "fr" ? UI[locale] : UI.en).title;
}
