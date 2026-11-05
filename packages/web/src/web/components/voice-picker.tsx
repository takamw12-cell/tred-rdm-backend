import { useEffect, useState } from "react";
import { Loader2, Sparkles, Square, Volume2 } from "lucide-react";
import { useT } from "@/i18n";
import {
  getPreferredVoice,
  premiumVoiceAvailable,
  setPreferredVoice,
  speak,
  stopSpeaking,
  voicesFor,
} from "@/lib/voice";

/** Textes (de / en / fr ; les autres langues lisent l'anglais). */
const UI = {
  de: {
    title: "Stimme des Professors",
    auto: "Automatisch — natürlichste Stimme dieses Geräts",
    test: "Stimme testen",
    stop: "Stopp",
    sample: "Hallo! Ich bin dein Professor. Heute rechnen wir zusammen das Kirchhoffsche Knotengesetz.",
    premium: "Premium-Stimme (ElevenLabs) aktiv — sie ersetzt beim Vorlesen die Gerätestimme.",
    none: "Dieser Browser bietet keine Sprachausgabe an.",
    hint: "Tipp: Stimmen mit „Natural“, „Online“, „Google“ oder „Premium“ klingen am natürlichsten.",
  },
  en: {
    title: "Professor's voice",
    auto: "Automatic — most natural voice on this device",
    test: "Test voice",
    stop: "Stop",
    sample: "Hello! I'm your professor. Today we'll work through Kirchhoff's current law together.",
    premium: "Premium voice (ElevenLabs) active — it replaces the device voice for read-aloud.",
    none: "This browser has no speech synthesis.",
    hint: "Tip: voices named “Natural”, “Online”, “Google” or “Premium” sound the most natural.",
  },
  fr: {
    title: "Voix du professeur",
    auto: "Automatique — la voix la plus naturelle de cet appareil",
    test: "Tester la voix",
    stop: "Arrêter",
    sample: "Bonjour ! Je suis ton professeur. Aujourd'hui, on applique ensemble la loi des nœuds de Kirchhoff.",
    premium: "Voix premium (ElevenLabs) active — elle remplace la voix de l'appareil à la lecture.",
    none: "Ce navigateur ne propose pas de synthèse vocale.",
    hint: "Astuce : les voix « Natural », « Online », « Google » ou « Premium » sont les plus naturelles.",
  },
} as const;

export function VoicePicker() {
  const { locale } = useT();
  const ui = locale === "de" || locale === "fr" ? UI[locale] : UI.en;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[] | null>(null);
  const [chosen, setChosen] = useState<string>(() => getPreferredVoice() ?? "");
  const [premium, setPremium] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let alive = true;
    void voicesFor(locale).then((v) => alive && setVoices(v));
    void premiumVoiceAvailable().then((p) => alive && setPremium(p));
    return () => {
      alive = false;
      stopSpeaking();
    };
  }, [locale]);

  function choose(uri: string) {
    setChosen(uri);
    setPreferredVoice(uri || null);
  }

  function test() {
    if (playing) {
      stopSpeaking();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    // Le test fait entendre la voix de l'APPAREIL choisie ici, même si la
    // voix premium est active : c'est ce réglage-là qu'on évalue.
    void speak(ui.sample, locale, {
      voiceURI: chosen || null,
      onEnd: () => setPlaying(false),
    }).then((ok) => !ok && setPlaying(false));
  }

  if (voices === null) {
    return <Loader2 className="text-muted-foreground size-4 animate-spin" />;
  }
  if (voices.length === 0) {
    return <p className="text-muted-foreground text-sm">{ui.none}</p>;
  }

  return (
    <div className="space-y-3">
      {premium && (
        <p className="flex items-center gap-2 rounded-xl bg-[#FEF3C7] px-3 py-2 text-sm text-[#92400E]">
          <Sparkles className="size-4 shrink-0" /> {ui.premium}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          aria-label={ui.title}
          value={chosen}
          onChange={(e) => choose(e.target.value)}
          className="border-border bg-background h-10 min-w-0 flex-1 rounded-xl border px-3 text-sm"
        >
          <option value="">{ui.auto}</option>
          {voices.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name} ({v.lang})
            </option>
          ))}
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
      <p className="text-muted-foreground text-xs">{ui.hint}</p>
    </div>
  );
}

export function voicePickerTitle(locale: string): string {
  return (locale === "de" || locale === "fr" ? UI[locale] : UI.en).title;
}
