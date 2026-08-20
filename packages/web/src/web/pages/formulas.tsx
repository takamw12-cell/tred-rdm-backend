import { useRef, useState } from "react";
import { Loader2, Sigma, Download } from "lucide-react";
import { PageContainer, PageHeader, Reveal } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownContent } from "@/components/markdown-content";
import { printElement } from "@/lib/pdf-print";
import { useSemesterStore } from "@/stores/semester";
import { useT } from "@/i18n";

type GeneratedFormulas = { title: string; content: string };

// Same NDJSON stream contract as /api/agent/exercise: heartbeats, then a
// final {"type":"result"} or {"type":"error"} line.
async function generate(body: Record<string, unknown>): Promise<GeneratedFormulas> {
  const res = await fetch("/api/agent/formulas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error("generation_failed");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let final: GeneratedFormulas | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg: { type?: string } & Partial<GeneratedFormulas>;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.type === "heartbeat" || msg.type === "ping") continue;
      if (msg.type === "error") throw new Error("generation_failed");
      if (msg.type === "result") {
        final = {
          title: String(msg.title ?? ""),
          content: String(msg.content ?? ""),
        };
      }
    }
  }
  if (!final) throw new Error("generation_failed");
  return final;
}

export default function FormulasPage() {
  const { t, locale } = useT();
  const semesterId = useSemesterStore((s) => s.activeId);

  const [subject, setSubject] = useState("");
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [result, setResult] = useState<GeneratedFormulas | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const r = await generate({ subject, focus, semesterId, locale });
      setResult(r);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  function exportPdf() {
    if (!printRef.current || !result) return;
    printElement(printRef.current, { title: result.title || t("formulas.title") });
  }

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title={t("formulas.title")} subtitle={t("formulas.subtitle")} />

      <Reveal>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("formulas.subject")}</label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={t("formulas.subjectPh")}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("formulas.focus")}</label>
                <Input
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                  placeholder={t("formulas.focusPh")}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void run()} disabled={busy} className="gap-2">
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sigma className="size-4" />
                )}
                {busy ? t("formulas.generating") : t("formulas.generate")}
              </Button>
              {result && !busy && (
                <Button variant="outline" onClick={exportPdf} className="gap-2">
                  <Download className="size-4" />
                  {t("formulas.exportPdf")}
                </Button>
              )}
            </div>

            {error && <p className="text-destructive text-sm">{t("formulas.error")}</p>}
            {!result && !busy && (
              <p className="text-muted-foreground text-sm">{t("formulas.emptyHint")}</p>
            )}
          </CardContent>
        </Card>
      </Reveal>

      {result && (
        <Reveal>
          <Card className="mt-6">
            <CardContent className="pt-6">
              <div ref={printRef} className="reading-scalable">
                {result.title && (
                  <h2 className="font-display mb-4 text-xl font-bold">{result.title}</h2>
                )}
                <MarkdownContent content={result.content} />
              </div>
            </CardContent>
          </Card>
        </Reveal>
      )}
    </PageContainer>
  );
}
