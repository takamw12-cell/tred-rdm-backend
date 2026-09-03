import { useCallback, useEffect, useState } from "react";
import { Loader2, Ban, RotateCcw, Plus, Copy, Check, Flag } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Betreiberbereich: wer darf hinein, wer nicht.
 *
 * Bewusst schmucklos und ohne Übersetzungen — diese Seite sieht nur der
 * Betreiber, und sie soll auch dann noch bedienbar sein, wenn im Rest der
 * Anwendung etwas kaputt ist. Der Server prüft die Rolle ohnehin bei jedem
 * Aufruf; die Seite verlässt sich nicht darauf, versteckt zu sein.
 */

interface AdminUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  isActive: boolean;
  role: string;
  invitedWith: string | null;
}

/**
 * Un signalement de réponse du tuteur.
 *
 * `excerpt` est la copie du texte au moment du signalement : la conversation
 * peut avoir été supprimée depuis, et un rapport qui pointe vers du vide ne
 * sert ni à corriger le modèle, ni à répondre à Google.
 */
interface AdminReport {
  id: string;
  userId: string;
  conversationId: string | null;
  reason: string;
  excerpt: string;
  note: string;
  locale: string;
  createdAt: string;
}

/** Ce que le motif veut dire, en clair. Même ordre que routes/reports.ts. */
const REASON_LABEL: Record<string, string> = {
  harmful: "Gefährlich",
  wrong: "Fachlich falsch",
  offensive: "Unangemessen",
  other: "Sonstiges",
};

interface AdminCode {
  code: string;
  label: string;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  disabled: boolean;
}

const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "short" });

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [codes, setCodes] = useState<AdminCode[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState("1");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, i, r] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/invites"),
        fetch("/api/admin/reports"),
      ]);
      if (u.status === 403 || u.status === 401) {
        setDenied(true);
        return;
      }
      setUsers(((await u.json()) as { users: AdminUser[] }).users ?? []);
      setCodes(((await i.json()) as { codes: AdminCode[] }).codes ?? []);
      setReports(((await r.json()) as { reports: AdminReport[] }).reports ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleAccess(u: AdminUser) {
    setBusy(u.id);
    try {
      const res = await fetch("/api/admin/users/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: u.id, isActive: !u.isActive }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((x) => (x.id === u.id ? { ...x, isActive: !u.isActive } : x)),
        );
      }
    } finally {
      setBusy(null);
    }
  }

  async function addCode() {
    setBusy("new-code");
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, maxUses: Number(maxUses) || 1 }),
      });
      if (res.ok) {
        setLabel("");
        setMaxUses("1");
        await load();
      }
    } finally {
      setBusy(null);
    }
  }

  async function toggleCode(c: AdminCode) {
    setBusy(c.code);
    try {
      await fetch("/api/admin/invites/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c.code, disabled: !c.disabled }),
      });
      setCodes((prev) =>
        prev.map((x) => (x.code === c.code ? { ...x, disabled: !c.disabled } : x)),
      );
    } finally {
      setBusy(null);
    }
  }

  /**
   * Marque un signalement comme traité.
   *
   * La ligne disparaît de l'écran avant la réponse du serveur : la liste ne
   * montre que ce qui reste à faire, et attendre un aller-retour pour voir
   * une ligne s'effacer donne l'impression d'un bouton qui ne marche pas.
   */
  async function resolveReport(id: string) {
    setBusy(id);
    setReports((prev) => prev.filter((r) => r.id !== id));
    try {
      await fetch("/api/admin/reports/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } finally {
      setBusy(null);
    }
  }

  function copy(code: string) {
    void navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  }

  if (denied) {
    return (
      <PageContainer>
        <PageHeader title="Kein Zugriff" subtitle="Dieser Bereich ist dem Betreiber vorbehalten." />
      </PageContainer>
    );
  }

  if (loading) {
    return (
      <PageContainer>
        <div className="text-muted-foreground flex items-center gap-2 py-20 text-sm">
          <Loader2 className="size-4 animate-spin" /> Lade …
        </div>
      </PageContainer>
    );
  }

  const active = users.filter((u) => u.isActive).length;

  return (
    <PageContainer>
      <PageHeader
        title="Zugang"
        subtitle={`${users.length} Konten · ${active} aktiv · ${users.length - active} gesperrt`}
      />

      {/* ── Gemeldete Antworten ───────────────────────────────────────── */}
      {/* En tête de page, et pas en bas : c'est la seule section qui appelle
          une action le jour même. Les codes d'invitation attendent. */}
      {reports.length > 0 && (
        <Card className="border-destructive/40 mb-6 p-5">
          <p className="label-tech mb-3 flex items-center gap-2">
            <Flag className="size-3.5" />
            Gemeldete Antworten · {reports.length}
          </p>

          <ul className="space-y-3">
            {reports.map((r) => (
              <li key={r.id} className="border-border rounded-lg border p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="bg-destructive/10 text-destructive rounded-full px-2 py-0.5 text-xs font-semibold">
                    {REASON_LABEL[r.reason] ?? r.reason}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {dateFmt.format(new Date(r.createdAt))} · {r.locale} ·{" "}
                    {r.userId.slice(0, 8)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto gap-1.5"
                    disabled={busy === r.id}
                    onClick={() => void resolveReport(r.id)}
                  >
                    <Check className="size-3.5" />
                    Erledigt
                  </Button>
                </div>

                {r.note && (
                  <p className="mb-2 text-sm font-medium">« {r.note} »</p>
                )}

                {/* `whitespace-pre-wrap` et non `truncate` : c'est le texte
                    reproché, il faut pouvoir le lire en entier. */}
                <p className="text-muted-foreground max-h-40 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap">
                  {r.excerpt}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Einladungscodes ───────────────────────────────────────────── */}
      <Card className="mb-6 p-5">
        <p className="label-tech mb-3">Einladungscodes</p>

        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <label className="label-tech mb-1 block" htmlFor="code-label">
              Bezeichnung
            </label>
            <Input
              id="code-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="FH Aachen TM2 WS26"
            />
          </div>
          <div className="w-24">
            <label className="label-tech mb-1 block" htmlFor="code-uses">
              Nutzungen
            </label>
            <Input
              id="code-uses"
              type="number"
              min={1}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
            />
          </div>
          <Button onClick={() => void addCode()} disabled={busy === "new-code"} className="gap-1.5">
            {busy === "new-code" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Code erstellen
          </Button>
        </div>

        {codes.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Noch kein Code. Ohne Code kann sich niemand registrieren.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {codes.map((c) => (
              <li key={c.code} className="flex flex-wrap items-center gap-3 py-2.5">
                <button
                  onClick={() => copy(c.code)}
                  className="font-mono hover:text-primary inline-flex items-center gap-1.5 text-sm font-semibold"
                  title="Kopieren"
                >
                  {c.code}
                  {copied === c.code ? (
                    <Check className="size-3.5 text-mastered" />
                  ) : (
                    <Copy className="size-3.5 opacity-50" />
                  )}
                </button>
                <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm">
                  {c.label || "—"}
                </span>
                <span className="label-tech shrink-0">
                  {c.usedCount}/{c.maxUses}
                </span>
                <Button
                  size="sm"
                  variant={c.disabled ? "outline" : "ghost"}
                  onClick={() => void toggleCode(c)}
                  disabled={busy === c.code}
                >
                  {c.disabled ? "Aktivieren" : "Deaktivieren"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── Konten ────────────────────────────────────────────────────── */}
      <Card className="p-5">
        <p className="label-tech mb-3">Konten</p>
        <ul className="divide-border divide-y">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 py-3">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  u.isActive ? "bg-mastered" : "bg-destructive",
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {u.name || "—"}
                  {u.role === "admin" && (
                    <span className="label-tech ml-2">Betreiber</span>
                  )}
                </p>
                <p className="text-muted-foreground truncate text-xs">{u.email}</p>
              </div>
              <span className="label-tech hidden shrink-0 sm:inline">
                {dateFmt.format(new Date(u.createdAt))}
                {u.invitedWith ? ` · ${u.invitedWith}` : ""}
              </span>
              <Button
                size="sm"
                variant={u.isActive ? "outline" : "default"}
                onClick={() => void toggleAccess(u)}
                disabled={busy === u.id || u.role === "admin"}
                className="gap-1.5"
              >
                {busy === u.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : u.isActive ? (
                  <Ban className="size-3.5" />
                ) : (
                  <RotateCcw className="size-3.5" />
                )}
                {u.isActive ? "Sperren" : "Freigeben"}
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </PageContainer>
  );
}
