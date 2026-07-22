"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, MessageSquareText, Search, RotateCcw, Save, Check,
  AlertCircle, FileCode, Loader2,
} from "lucide-react";

interface PromptVariable { name: string; description: string }

interface PromptEntry {
  key: string;
  label: string;
  category: string;
  kind: "system" | "user" | "template";
  file: string;
  description: string;
  variables: PromptVariable[];
  default: string;
  current: string;
  isOverridden: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

const CATEGORY_ORDER = ["Journal", "News Analysis", "Ask AI", "AI Report (CHoCH QLM)", "Content Creator"];

const KIND_LABEL: Record<PromptEntry["kind"], string> = {
  system: "SYSTEM",
  user: "USER",
  template: "COPY TEMPLATE",
};

export default function AdminPromptsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [prompts, setPrompts] = useState<PromptEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [status_, setStatus_] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (!session || session.user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [session, status, router]);

  const loadPrompts = () => {
    setLoading(true);
    fetch("/api/admin/prompts")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const list: PromptEntry[] = data.prompts;
        setPrompts(list);
        setSelectedKey((prev) => prev ?? list[0]?.key ?? null);
      })
      .catch(() => router.replace("/dashboard"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (session?.user.role !== "admin") return;
    loadPrompts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const selected = useMemo(
    () => prompts?.find((p) => p.key === selectedKey) ?? null,
    [prompts, selectedKey]
  );

  useEffect(() => {
    if (selected) setDraft(selected.current);
    setStatus_(null);
  }, [selected]);

  const grouped = useMemo(() => {
    if (!prompts) return [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? prompts.filter(
          (p) =>
            p.label.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            p.file.toLowerCase().includes(q) ||
            p.key.toLowerCase().includes(q)
        )
      : prompts;

    const byCategory = new Map<string, PromptEntry[]>();
    for (const p of filtered) {
      if (!byCategory.has(p.category)) byCategory.set(p.category, []);
      byCategory.get(p.category)!.push(p);
    }
    const cats = [...byCategory.keys()].sort(
      (a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b)
    );
    return cats.map((c) => ({ category: c, items: byCategory.get(c)! }));
  }, [prompts, search]);

  const isDirty = !!selected && draft !== selected.current;

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setStatus_(null);
    try {
      const res = await fetch(`/api/admin/prompts/${encodeURIComponent(selected.key)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setPrompts((prev) =>
        prev
          ? prev.map((p) =>
              p.key === selected.key
                ? { ...p, current: draft, isOverridden: true, updatedAt: new Date().toISOString() }
                : p
            )
          : prev
      );
      setStatus_({ type: "ok", msg: "Saved — the feature will use this prompt on its next run." });
    } catch (e) {
      setStatus_({ type: "err", msg: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!selected) return;
    setResetting(true);
    setStatus_(null);
    try {
      const res = await fetch(`/api/admin/prompts/${encodeURIComponent(selected.key)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setPrompts((prev) =>
        prev
          ? prev.map((p) =>
              p.key === selected.key
                ? { ...p, current: p.default, isOverridden: false, updatedAt: undefined, updatedBy: undefined }
                : p
            )
          : prev
      );
      setDraft(selected.default);
      setStatus_({ type: "ok", msg: "Reverted to the built-in default." });
    } catch (e) {
      setStatus_({ type: "err", msg: e instanceof Error ? e.message : "Reset failed" });
    } finally {
      setResetting(false);
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-5 w-5 rounded-full border-[1.5px] border-white/20 border-t-white/70 animate-spin" />
      </div>
    );
  }

  if (!prompts) return null;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/admin"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] border border-white/[0.10] hover:bg-white/[0.10] transition-colors shrink-0"
        >
          <ArrowLeft className="h-4 w-4 text-white/60" />
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] border border-white/[0.10] shrink-0">
          <MessageSquareText className="h-4.5 w-4.5 text-white/60" />
        </div>
        <div>
          <h1 className="text-[18px] font-bold">Prompt Management</h1>
          <p className="text-[12px] text-muted-foreground">
            {prompts.length} prompts · {prompts.filter((p) => p.isOverridden).length} edited
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* Sidebar */}
        <div className="rounded-xl border border-border bg-card overflow-hidden lg:h-[calc(100vh-140px)] flex flex-col">
          <div className="p-2.5 border-b border-border/50 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search prompts..."
                className="pl-8 h-8 text-[12px] bg-white/[0.03] border-white/[0.08]"
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1 p-2 space-y-3">
            {grouped.map(({ category, items }) => (
              <div key={category}>
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-white/25">
                  {category}
                </p>
                <div className="space-y-0.5">
                  {items.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => setSelectedKey(p.key)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg transition-colors flex items-start gap-1.5 ${
                        selectedKey === p.key
                          ? "bg-white/[0.09] text-white border border-white/[0.12]"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent"
                      }`}
                    >
                      <span className="text-[12px] leading-tight flex-1 min-w-0">{p.label}</span>
                      {p.isOverridden && (
                        <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" title="Edited" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {grouped.length === 0 && (
              <p className="text-[12px] text-muted-foreground text-center py-6">No prompts match your search.</p>
            )}
          </div>
        </div>

        {/* Editor */}
        {selected && (
          <div className="rounded-xl border border-border bg-card p-4 md:p-5 space-y-4 min-w-0">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-[15px] font-semibold text-white/90">{selected.label}</h2>
                  <Badge className="text-[9px] px-1.5 py-0 bg-white/[0.08] text-white/55 border-white/[0.12]">
                    {KIND_LABEL[selected.kind]}
                  </Badge>
                  {selected.isOverridden && (
                    <Badge className="text-[9px] px-1.5 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                      EDITED
                    </Badge>
                  )}
                </div>
                <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{selected.description}</p>
                <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-white/30">
                  <FileCode className="h-3 w-3" />
                  <code className="font-mono">{selected.file}</code>
                </div>
                {selected.isOverridden && selected.updatedAt && (
                  <p className="text-[10.5px] text-white/25 mt-1">
                    Last edited {new Date(selected.updatedAt).toLocaleString()}
                    {selected.updatedBy ? ` by ${selected.updatedBy}` : ""}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  disabled={!selected.isOverridden || resetting || saving}
                >
                  {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  Reset to default
                </Button>
                <Button size="sm" onClick={handleSave} disabled={!isDirty || saving || resetting}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save
                </Button>
              </div>
            </div>

            {selected.variables.length > 0 && (
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-2">
                  Available variables — keep these {"{{TOKENS}}"} in the text so the live data still gets inserted
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.variables.map((v) => (
                    <span
                      key={v.name}
                      title={v.description}
                      className="text-[10.5px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-white/50"
                    >
                      {"{{" + v.name + "}}"}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              className="min-h-[50vh] font-mono text-[12.5px] leading-relaxed bg-black/20 border-white/[0.08] resize-y"
            />

            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] text-white/30">
                {draft.length.toLocaleString()} characters
                {isDirty && <span className="text-amber-400/70"> · unsaved changes</span>}
              </div>
              {status_ && (
                <div
                  className={`flex items-center gap-1.5 text-[11.5px] ${
                    status_.type === "ok" ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {status_.type === "ok" ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                  {status_.msg}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
