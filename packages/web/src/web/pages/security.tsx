import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Ban, Eye, KeyRound, Lock, Scale, ShieldCheck, type LucideIcon } from "lucide-react";
import { LegalFooter } from "@/components/legal-footer";
import { Logo } from "@/components/logo";
import { useT } from "@/i18n";

/**
 * /security — « Sicherheit & Datenschutz », en clair.
 *
 * Publique (montée avant la connexion, app.tsx) : on doit pouvoir la lire
 * AVANT de créer un compte. Chaque phrase est vérifiable dans le code ou
 * dans la Datenschutzerklärung ; aucune certification n'est revendiquée.
 * La dernière section dit ce que nous ne promettons PAS — c'est elle qui
 * rend les autres crédibles.
 */

interface Block {
  icon: LucideIcon;
  title: string;
  points: string[];
}

const TEXT: Record<"de" | "en" | "fr", { title: string; lead: string; blocks: Block[]; honest: Block; more: string; back: string }> = {
  de: {
    title: "Sicherheit & Datenschutz",
    lead: "Was mit deinen Unterlagen passiert — kurz, ehrlich und überprüfbar.",
    blocks: [
      {
        icon: Lock,
        title: "Deine Dokumente sind verschlüsselt",
        points: [
          "Jede Verbindung zu TRED ist per HTTPS/TLS verschlüsselt — auch der Upload deiner Skripte.",
          "Originaldateien liegen im Objektspeicher Cloudflare R2 (Region EU), der alle Dateien im Ruhezustand mit AES-256 verschlüsselt; die Datenbank (Turso, EU) ebenso.",
          "Passwörter speichern wir nie im Klartext, nur als gesalzenen Hash (scrypt).",
          "Deine Dokumente sind privat: nur du siehst sie, außer du teilst ein Semester ausdrücklich.",
        ],
      },
      {
        icon: Ban,
        title: "Wir verkaufen keine Daten",
        points: [
          "Wir verkaufen, vermieten oder tauschen keine persönlichen Daten — an niemanden.",
          "Keine Werbenetzwerke, keine Tracking-Pixel. „Partner-Ressourcen“ sind einfache, als Anzeige gekennzeichnete Links; Partner erfahren nichts über dich.",
          "Nutzungsanalyse (PostHog, EU) nur, wenn du zustimmst — Chat, Tafel und Dokumente sind dabei immer ausgeblendet.",
          "Deine Fragen und Dokumente werden nicht zum Training von KI-Modellen verwendet (API-Bedingungen von Anthropic).",
        ],
      },
      {
        icon: Scale,
        title: "DSGVO — gebaut für Studierende in Deutschland",
        points: [
          "Hosting, Datenbank und Dateien in der EU. Wo ein Dienst außerhalb der EU sitzt (z. B. das Sprachmodell von Anthropic, USA), gelten die EU-Standardvertragsklauseln — alle Empfänger stehen in der Datenschutzerklärung.",
          "Datensparsam: für die KI-Antwort gehen nur deine Frage und die passenden Dokumentausschnitte raus, nie Name oder E-Mail.",
          "Deine Rechte per Klick: Daten exportieren (Art. 15/20) und Konto vollständig löschen (Art. 17) in den Einstellungen.",
        ],
      },
      {
        icon: KeyRound,
        title: "Du behältst die Kontrolle",
        points: [
          "E-Mail-Bestätigung bei der Registrierung — niemand eröffnet ein Konto auf deine Adresse.",
          "Analyse-Einwilligung jederzeit widerrufbar: Einstellungen → Datenschutz.",
          "Kontolöschung entfernt sofort Dokumente, Unterhaltungen, Übungen und Zähler.",
        ],
      },
    ],
    honest: {
      icon: Eye,
      title: "Was wir ehrlicherweise NICHT versprechen",
      points: [
        "Keine Ende-zu-Ende-Verschlüsselung: damit der Tutor antworten kann, muss der Server deine Dokumente lesen können.",
        "Keine offizielle Zertifizierung (ISO, TÜV …) — dafür ist TRED noch zu jung. Wir sagen dir lieber genau, was wir tun.",
        "Lade keine besonders sensiblen Daten hoch (Gesundheitsdaten, Ausweise). Und: auch eine KI kann sich irren — prüfe wichtige Ergebnisse mit deinem Skript.",
      ],
    },
    more: "Alle Details: Datenschutzerklärung",
    back: "Zurück",
  },
  en: {
    title: "Security & privacy",
    lead: "What happens to your course material — short, honest and verifiable.",
    blocks: [
      {
        icon: Lock,
        title: "Your documents are encrypted",
        points: [
          "Every connection to TRED is encrypted with HTTPS/TLS — including uploads.",
          "Original files are stored in Cloudflare R2 (EU region), which encrypts all files at rest with AES-256; the database (Turso, EU) too.",
          "Passwords are never stored in plain text, only as a salted hash (scrypt).",
          "Your documents are private: only you see them, unless you explicitly share a semester.",
        ],
      },
      {
        icon: Ban,
        title: "We don't sell data",
        points: [
          "We never sell, rent or trade personal data — to anyone.",
          "No ad networks, no tracking pixels. “Partner resources” are plain links marked as ads; partners learn nothing about you.",
          "Usage analytics (PostHog, EU) only with your consent — chat, board and documents are always hidden.",
          "Your questions and documents are not used to train AI models (Anthropic API terms).",
        ],
      },
      {
        icon: Scale,
        title: "GDPR — built for students in Germany",
        points: [
          "Hosting, database and files in the EU. Where a service sits outside the EU (e.g. Anthropic's language model, USA), EU Standard Contractual Clauses apply — every recipient is listed in the privacy policy.",
          "Data minimisation: only your question and the relevant document excerpts are sent for an AI answer, never your name or email.",
          "Your rights in one click: export your data (Art. 15/20) and delete your account (Art. 17) in Settings.",
        ],
      },
      {
        icon: KeyRound,
        title: "You stay in control",
        points: [
          "Email confirmation at sign-up — nobody can open an account with your address.",
          "Analytics consent can be revoked at any time: Settings → Privacy.",
          "Deleting your account immediately removes documents, chats, exercises and counters.",
        ],
      },
    ],
    honest: {
      icon: Eye,
      title: "What we honestly do NOT promise",
      points: [
        "No end-to-end encryption: for the tutor to answer, the server has to be able to read your documents.",
        "No official certification (ISO, TÜV …) yet — TRED is too young. We prefer to tell you exactly what we do.",
        "Don't upload highly sensitive data (health data, IDs). And: an AI can be wrong — check important results against your lecture notes.",
      ],
    },
    more: "Full details: privacy policy",
    back: "Back",
  },
  fr: {
    title: "Sécurité & confidentialité",
    lead: "Ce qui arrive à tes documents — court, honnête et vérifiable.",
    blocks: [
      {
        icon: Lock,
        title: "Tes documents sont chiffrés",
        points: [
          "Chaque connexion à TRED est chiffrée (HTTPS/TLS) — y compris l'envoi de tes cours.",
          "Les fichiers originaux sont stockés chez Cloudflare R2 (région UE), qui chiffre tous les fichiers au repos en AES-256 ; la base de données (Turso, UE) aussi.",
          "Les mots de passe ne sont jamais stockés en clair, seulement sous forme de hachage salé (scrypt).",
          "Tes documents sont privés : toi seul les vois, sauf si tu partages un semestre volontairement.",
        ],
      },
      {
        icon: Ban,
        title: "Nous ne vendons aucune donnée",
        points: [
          "Nous ne vendons, ne louons et n'échangeons aucune donnée personnelle — à personne.",
          "Aucune régie publicitaire, aucun pixel de suivi. Les « ressources partenaires » sont de simples liens marqués comme publicité ; les partenaires n'apprennent rien sur toi.",
          "Analyse d'usage (PostHog, UE) uniquement avec ton accord — le chat, le tableau et les documents restent toujours masqués.",
          "Tes questions et documents ne servent pas à entraîner des modèles d'IA (conditions de l'API d'Anthropic).",
        ],
      },
      {
        icon: Scale,
        title: "RGPD — pensé pour les étudiants en Allemagne",
        points: [
          "Hébergement, base de données et fichiers dans l'UE. Quand un service est hors UE (par ex. le modèle de langage d'Anthropic, USA), les clauses contractuelles types de l'UE s'appliquent — tous les destinataires figurent dans la politique de confidentialité.",
          "Minimisation : pour une réponse de l'IA, seuls ta question et les extraits utiles de tes documents sont envoyés, jamais ton nom ni ton e-mail.",
          "Tes droits en un clic : export de tes données (art. 15/20) et suppression du compte (art. 17) dans les réglages.",
        ],
      },
      {
        icon: KeyRound,
        title: "Tu gardes le contrôle",
        points: [
          "Confirmation par e-mail à l'inscription — personne ne peut ouvrir un compte avec ton adresse.",
          "Le consentement à l'analyse se retire à tout moment : Réglages → Confidentialité.",
          "La suppression du compte efface immédiatement documents, conversations, exercices et compteurs.",
        ],
      },
    ],
    honest: {
      icon: Eye,
      title: "Ce que nous ne promettons PAS, honnêtement",
      points: [
        "Pas de chiffrement de bout en bout : pour que le tuteur réponde, le serveur doit pouvoir lire tes documents.",
        "Pas de certification officielle (ISO, TÜV…) pour l'instant — TRED est trop jeune. Nous préférons te dire exactement ce que nous faisons.",
        "N'envoie pas de données très sensibles (santé, pièces d'identité). Et : une IA peut se tromper — vérifie les résultats importants avec ton cours.",
      ],
    },
    more: "Tous les détails : politique de confidentialité",
    back: "Retour",
  },
};

export default function SecurityPage() {
  const { locale } = useT();
  const tx = locale === "de" || locale === "fr" ? TEXT[locale] : TEXT.en;
  useEffect(() => {
    document.title = `${tx.title} · TRED`;
  }, [tx.title]);

  return (
    <div className="min-h-screen bg-[#0F172A] text-white">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[#0F172A]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-4 px-5">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-white/70 transition-colors hover:text-white">
            <ArrowLeft className="size-4" />
            {tx.back}
          </Link>
          <div className="ml-auto text-white">
            <Logo markClassName="text-white" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
          <ShieldCheck className="size-3.5" aria-hidden /> TRED
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{tx.title}</h1>
        <p className="mt-2 text-white/70">{tx.lead}</p>

        <div className="mt-8 grid gap-4">
          {tx.blocks.map((b) => (
            <Section key={b.title} block={b} />
          ))}
          <Section block={tx.honest} muted />
        </div>

        <p className="mt-8 text-sm">
          <Link to="/datenschutz" className="text-[#EAB308] underline underline-offset-2 hover:text-[#FACC15]">
            {tx.more}
          </Link>
        </p>
      </main>
      <LegalFooter className="pb-8 text-white/60" />
    </div>
  );
}

function Section({ block, muted }: { block: Block; muted?: boolean }) {
  const Icon = block.icon;
  return (
    <section
      className={
        muted
          ? "rounded-2xl border border-white/10 bg-transparent p-5"
          : "rounded-2xl border border-[#F1E7CF]/30 bg-white/[0.06] p-5 backdrop-blur-md"
      }
    >
      <h2 className="flex items-center gap-2.5 text-lg font-semibold">
        <span className={`grid size-8 place-items-center rounded-lg ${muted ? "bg-white/10 text-white/80" : "bg-emerald-400/15 text-emerald-300"}`}>
          <Icon className="size-4" aria-hidden />
        </span>
        {block.title}
      </h2>
      <ul className="mt-3 space-y-2 text-sm leading-relaxed text-white/80">
        {block.points.map((p) => (
          <li key={p} className="flex gap-2">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-[#EAB308]" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
