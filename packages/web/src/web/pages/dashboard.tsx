import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessagesSquare,
  BookMarked,
  Network,
  Dumbbell,
  Upload,
  Plus,
  FileText,
  BookOpen,
  ClipboardList,
  FileCheck,
  File,
  Layers,
  Trash2,
  ArrowRight,
  Loader2,
  Eye,
  Share2,
  Ticket,
  Copy,
  Check,
} from "lucide-react";
import { PageContainer, Reveal } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { MemoryCard } from "@/components/memory-card";
import { ReviewCard } from "@/components/review-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal } from "@/components/modal";
import { useT } from "@/i18n";
import { useUserStore } from "@/stores/user";
import { useSemesterStore } from "@/stores/semester";
import { useLocaleStore } from "@/stores/locale";
import {
  semestersListOptions,
  semestersListKey,
  semesterCreateOptions,
  semesterRemoveOptions,
} from "@/queries/semesters";
import {
  documentsListOptions,
  documentsListKey,
  documentRemoveOptions,
  documentRemoveManyOptions,
} from "@/queries/documents";
import { DocumentViewer } from "@/components/document-viewer";
import { client } from "@/lib/api";
import { cn } from "@/lib/utils";

type DocKind = "vorlesung" | "uebung" | "klausur" | "other";

const KIND_ICON: Record<DocKind, typeof BookOpen> = {
  vorlesung: BookOpen,
  uebung: ClipboardList,
  klausur: FileCheck,
  other: File,
};

export default function DashboardPage() {
  const { t } = useT();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const profile = useUserStore((s) => s.profile);
  const locale = useLocaleStore((s) => s.locale);
  const activeId = useSemesterStore((s) => s.activeId);
  const setActive = useSemesterStore((s) => s.setActive);

  const { data: sems = [], isLoading: semsLoading } = useQuery(semestersListOptions());
  const { data: docs = [], isLoading: docsLoading } = useQuery(
    documentsListOptions(activeId),
  );

  const createMut = useMutation(semesterCreateOptions());
  const removeMut = useMutation(semesterRemoveOptions());
  const removeDocMut = useMutation(documentRemoveOptions());
  const removeManyDocMut = useMutation(documentRemoveManyOptions());

  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [program, setProgram] = useState(profile.degree ?? "");
  const [number, setNumber] = useState(profile.semester ?? "");

  // Document management (delete single / bulk).
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const [viewerDocId, setViewerDocId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemState, setRedeemState] = useState<
    { kind: "idle" } | { kind: "invalid" } | { kind: "done"; name: string; count: number }
  >({ kind: "idle" });
  const [confirmBulk, setConfirmBulk] = useState(false);

  function toggleDoc(id: string) {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function invalidateDocs() {
    await qc.invalidateQueries({ queryKey: documentsListKey() });
    await qc.invalidateQueries({ queryKey: semestersListKey() });
  }

  async function confirmDeleteDoc() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    await removeDocMut.mutateAsync({ id });
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setPendingDelete(null);
    await invalidateDocs();
  }

  async function confirmDeleteBulk() {
    const ids = [...selectedDocs];
    if (!ids.length) return;
    await removeManyDocMut.mutateAsync({ ids });
    setSelectedDocs(new Set());
    setConfirmBulk(false);
    await invalidateDocs();
  }

  function fmtDate(value: string | number | Date): string {
    try {
      return new Date(value).toLocaleDateString(locale, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "";
    }
  }

  const activeSem = sems.find((s) => s.id === activeId) ?? null;

  // Real, calculable metrics — no fabricated progress.
  const stats = useMemo(() => {
    const pages = docs.reduce((sum, d) => sum + (d.pageCount ?? 0), 0);
    const byKind = { vorlesung: 0, uebung: 0, klausur: 0, other: 0 } as Record<
      DocKind,
      number
    >;
    for (const d of docs) byKind[(d.kind as DocKind) ?? "other"]++;
    return { docs: docs.length, pages, byKind };
  }, [docs]);

  async function handleCreate() {
    if (!name.trim()) return;
    const n = parseInt(number, 10);
    const { id } = await createMut.mutateAsync({
      name: name.trim(),
      university: profile.university || undefined,
      program: program.trim() || undefined,
      semesterNumber: Number.isFinite(n) ? n : undefined,
    });
    await qc.invalidateQueries({ queryKey: semestersListKey() });
    setActive(id);
    setModalOpen(false);
    setName("");
  }

  async function handleRemove(id: string) {
    if (!confirm(t("dashboard.deleteSemesterConfirm"))) return;
    await removeMut.mutateAsync({ id });
    if (activeId === id) setActive(null);
    await qc.invalidateQueries({ queryKey: semestersListKey() });
    await qc.invalidateQueries({ queryKey: documentsListKey() });
  }

  async function openShare() {
    if (!activeId) return;
    setShareOpen(true);
    setShareCode(null);
    setShareCopied(false);
    try {
      const r = await client.semesters.shareCreate({ id: activeId });
      setShareCode(r.code);
    } catch {
      setShareOpen(false);
    }
  }

  function copyShareCode() {
    if (!shareCode) return;
    void navigator.clipboard.writeText(shareCode).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1500);
    });
  }

  async function handleRedeem() {
    const code = redeemCode.trim().toUpperCase();
    if (code.length < 4 || redeemBusy) return;
    setRedeemBusy(true);
    setRedeemState({ kind: "idle" });
    try {
      const info = await client.semesters.shareInfo({ code });
      if (!info.found) {
        setRedeemState({ kind: "invalid" });
        return;
      }
      const r = await client.semesters.shareRedeem({ code });
      setRedeemState({ kind: "done", name: info.name, count: r.docCount });
      setRedeemCode("");
      await qc.invalidateQueries({ queryKey: semestersListKey() });
      await qc.invalidateQueries({ queryKey: documentsListKey() });
    } catch {
      setRedeemState({ kind: "invalid" });
    } finally {
      setRedeemBusy(false);
    }
  }

  const quick = [
    { to: "/chat", icon: MessagesSquare, key: "nav.chat" },
    { to: "/dictionary", icon: BookMarked, key: "nav.dictionary" },
    { to: "/dna", icon: Network, key: "nav.dna" },
    { to: "/exam", icon: Dumbbell, key: "dashboard.exercises" },
  ];

  return (
    <PageContainer>
      <Reveal className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            {t("dashboard.greeting", { name: profile.firstName })}
          </h1>
          <p className="text-muted-foreground mt-1.5">{t("dashboard.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/chat")}>
            <Upload className="size-4" />
            {t("dashboard.importDocs")}
          </Button>
          <Button
            size="sm"
            className="brand-gradient text-white"
            onClick={() => setModalOpen(true)}
          >
            <Plus className="size-4" />
            {t("dashboard.newSemester")}
          </Button>
        </div>
      </Reveal>

      {/* Semester selector */}
      <Reveal className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <SemesterChip
            active={activeId === null}
            label={t("dashboard.allCourses")}
            onClick={() => setActive(null)}
          />
          {semsLoading ? (
            <span className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" />
            </span>
          ) : (
            sems.map((s) => (
              <SemesterChip
                key={s.id}
                active={activeId === s.id}
                label={s.name}
                sub={t("dashboard.docsCount", { count: s.docCount })}
                onClick={() => setActive(s.id)}
                onDelete={() => handleRemove(s.id)}
              />
            ))
          )}
          {activeId !== null && (
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void openShare()}>
              <Share2 className="size-4" />
              {t("share.button")}
            </Button>
          )}
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => { setRedeemOpen(true); setRedeemState({ kind: "idle" }); }}>
            <Ticket className="size-4" />
            {t("share.redeemTitle")}
          </Button>
        </div>
      </Reveal>

      {/* Real stats */}
      <Reveal className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={<Layers className="text-primary size-4" />} value={String(stats.docs)} label={t("dashboard.materials")} />
        <StatCard icon={<FileText className="text-learning size-4" />} value={String(stats.pages)} label={t("dashboard.pages")} />
        <StatCard icon={<BookOpen className="text-mastered size-4" />} value={String(stats.byKind.vorlesung)} label={t("library.kindVorlesung")} />
        <StatCard icon={<FileCheck className="text-primary size-4" />} value={String(stats.byKind.klausur)} label={t("library.kindKlausur")} />
      </Reveal>

      {/* La révision passe AVANT la mémoire : l'une demande une action du
          jour, l'autre montre un état. L'action se place là où l'œil arrive. */}
      <Reveal className="mb-6">
        <ReviewCard />
      </Reveal>

      <Reveal className="mb-6">
        <MemoryCard />
      </Reveal>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Materials of the selected scope */}
        <Reveal className="lg:col-span-2">
          <Card>
            <CardContent className="pt-0">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">
                  {t("dashboard.myDocuments")}
                </h2>
                <Link to="/chat">
                  <Button variant="ghost" size="sm">
                    {t("dashboard.importDocs")}
                    <ArrowRight className="size-4" />
                  </Button>
                </Link>
              </div>

              {/* Bulk-delete bar — appears once at least one doc is selected. */}
              {selectedDocs.size > 0 && (
                <div className="border-primary/30 bg-primary/5 mb-3 flex items-center justify-between gap-2 rounded-xl border px-3 py-2">
                  <span className="text-sm font-medium">
                    {t("dashboard.docsSelected", { n: selectedDocs.size })}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedDocs(new Set())}>
                      {t("common.cancel")}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setConfirmBulk(true)}
                    >
                      <Trash2 className="size-4" />
                      {t("dashboard.deleteSelected")}
                    </Button>
                  </div>
                </div>
              )}

              {docsLoading ? (
                <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  {t("common.loading")}
                </div>
              ) : docs.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-center">
                  <span className="bg-secondary text-muted-foreground mb-3 grid size-12 place-items-center rounded-2xl">
                    <FileText className="size-6" />
                  </span>
                  <p className="text-muted-foreground max-w-xs text-sm">
                    {t("dashboard.noMaterials")}
                  </p>
                  <Link to="/chat">
                    <Button size="sm" className="brand-gradient mt-4 text-white">
                      <Upload className="size-4" />
                      {t("dashboard.importDocs")}
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {docs.map((d) => {
                    const Icon = KIND_ICON[(d.kind as DocKind) ?? "other"] ?? File;
                    const checked = selectedDocs.has(d.id);
                    return (
                      <div
                        key={d.id}
                        className={cn(
                          "group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                          checked
                            ? "border-primary/50 bg-primary/5"
                            : "border-border hover:bg-accent",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleDoc(d.id)}
                          aria-label={t("dashboard.selectDoc")}
                        />
                        <button
                          onClick={() => setViewerDocId(d.id)}
                          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                        >
                          <span className="bg-secondary text-muted-foreground grid size-9 shrink-0 place-items-center rounded-lg">
                            <Icon className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{d.title}</p>
                            <p className="text-muted-foreground text-xs">
                              {t(`library.kind${cap(d.kind)}`)} ·{" "}
                              {t("library.pages", { count: d.pageCount })}
                              {d.createdAt ? ` · ${fmtDate(d.createdAt)}` : ""}
                            </p>
                          </div>
                        </button>
                        <button
                          onClick={() => setViewerDocId(d.id)}
                          className="text-muted-foreground hover:text-foreground shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                          aria-label={t("library.view")}
                          title={t("library.view")}
                        >
                          <Eye className="size-4" />
                        </button>
                        <button
                          onClick={() => setPendingDelete({ id: d.id, title: d.title })}
                          className="text-muted-foreground hover:text-destructive shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                          aria-label={t("library.delete")}
                          title={t("library.delete")}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </Reveal>

        {/* Continue / start learning */}
        <Reveal className="space-y-6">
          <Card className="brand-gradient border-0 text-white">
            <CardContent className="pt-0">
              <p className="text-xs font-semibold tracking-wide text-white/80 uppercase">
                {t("dashboard.continueTitle")}
              </p>
              <p className="mt-2 text-sm leading-snug font-semibold">
                {docs.length > 0
                  ? t("dashboard.startFromScope", {
                      scope: activeSem ? activeSem.name : t("dashboard.allCourses"),
                    })
                  : t("dashboard.startGeneral")}
              </p>
              <Link to="/chat">
                <Button size="sm" className="text-primary mt-4 bg-white hover:bg-white/90">
                  <MessagesSquare className="size-4" />
                  {t("nav.chat")}
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-0">
              <h2 className="font-display mb-3 text-lg font-bold">{t("dashboard.quickAccess")}</h2>
              <div className="grid grid-cols-2 gap-2">
                {quick.map(({ to, icon: Icon, key }) => (
                  <Link key={key + to} to={to}>
                    <div className="border-border hover:bg-accent flex cursor-pointer items-center gap-2 rounded-xl border p-3 transition-colors">
                      <span className="bg-primary/10 text-primary grid size-8 place-items-center rounded-lg">
                        <Icon className="size-4" />
                      </span>
                      <span className="text-xs font-semibold">{t(key)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </Reveal>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t("dashboard.newSemester")}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sem-name">{t("dashboard.semesterName")}</Label>
            <Input
              id="sem-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("dashboard.semesterNamePlaceholder")}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sem-num">{t("dashboard.semesterNumber")}</Label>
              <Input
                id="sem-num"
                type="number"
                min={1}
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="3"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sem-prog">{t("dashboard.program")}</Label>
              <Input
                id="sem-prog"
                value={program}
                onChange={(e) => setProgram(e.target.value)}
                placeholder="Luft- und Raumfahrttechnik"
              />
            </div>
          </div>
          <Button
            className="brand-gradient w-full text-white"
            onClick={handleCreate}
            disabled={!name.trim() || createMut.isPending}
          >
            {createMut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            {t("dashboard.createSemester")}
          </Button>
        </div>
      </Modal>

      {/* Single document delete confirmation */}
      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title={t("dashboard.deleteDocTitle")}
      >
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            {t("dashboard.deleteDocConfirm", { name: pendingDelete?.title ?? "" })}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteDoc}
              disabled={removeDocMut.isPending}
            >
              {removeDocMut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              {t("dashboard.confirmDelete")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk document delete confirmation */}
      <Modal
        open={confirmBulk}
        onClose={() => setConfirmBulk(false)}
        title={t("dashboard.deleteDocTitle")}
      >
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            {t("dashboard.deleteBulkConfirm", { n: selectedDocs.size })}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmBulk(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteBulk}
              disabled={removeManyDocMut.isPending}
            >
              {removeManyDocMut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              {t("dashboard.confirmDelete")}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title={t("share.title")}>
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">{t("share.desc")}</p>
          {shareCode ? (
            <div className="flex items-center gap-2">
              <code className="bg-secondary flex-1 rounded-lg px-4 py-3 text-center font-mono text-xl font-bold tracking-[0.3em]">
                {shareCode}
              </code>
              <Button variant="outline" onClick={copyShareCode} className="gap-1.5">
                {shareCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {shareCopied ? t("share.copied") : t("share.copy")}
              </Button>
            </div>
          ) : (
            <div className="text-muted-foreground flex items-center justify-center gap-2 py-4 text-sm">
              <Loader2 className="size-4 animate-spin" />
            </div>
          )}
        </div>
      </Modal>

      <Modal open={redeemOpen} onClose={() => setRedeemOpen(false)} title={t("share.redeemTitle")}>
        <div className="space-y-4">
          {redeemState.kind === "done" ? (
            <>
              <p className="text-sm font-medium">{t("share.redeemOk")}</p>
              <p className="text-muted-foreground text-sm">
                {t("share.preview", { name: redeemState.name, count: redeemState.count })}
              </p>
              <Button onClick={() => setRedeemOpen(false)}>{t("share.close")}</Button>
            </>
          ) : (
            <>
              <Input
                value={redeemCode}
                onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                placeholder={t("share.redeemPh")}
                className="text-center font-mono text-lg tracking-[0.25em]"
                maxLength={8}
              />
              {redeemState.kind === "invalid" && (
                <p className="text-destructive text-sm">{t("share.invalid")}</p>
              )}
              <Button onClick={() => void handleRedeem()} disabled={redeemBusy} className="gap-2">
                {redeemBusy && <Loader2 className="size-4 animate-spin" />}
                {t("share.redeemBtn")}
              </Button>
            </>
          )}
        </div>
      </Modal>

      <DocumentViewer docId={viewerDocId} onClose={() => setViewerDocId(null)} />
    </PageContainer>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function SemesterChip({
  active,
  label,
  sub,
  onClick,
  onDelete,
}: {
  active: boolean;
  label: string;
  sub?: string;
  onClick: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
        active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border hover:bg-accent cursor-pointer",
      )}
    >
      <button onClick={onClick} className="flex items-center gap-1.5">
        <span className="font-medium">{label}</span>
        {sub && <span className="text-muted-foreground text-xs">· {sub}</span>}
      </button>
      {onDelete && (
        <button
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive opacity-0 transition-opacity group-hover:opacity-100"
          aria-label="delete"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <Card className="py-0">
      <CardContent className="flex items-center gap-3 p-4">
        <span className="bg-secondary grid size-10 shrink-0 place-items-center rounded-xl">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="font-display text-xl leading-none font-extrabold tabular-nums">{value}</p>
          <p className="text-muted-foreground mt-1 truncate text-xs">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
