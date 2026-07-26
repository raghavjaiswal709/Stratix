"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Quote as QuoteIcon, Search, Plus, Trash2, Loader2, AlertCircle, Check, X,
} from "lucide-react";
import { invalidateApiCache } from "@/lib/api-cache";

interface QuoteEntry {
  _id: string;
  text: string;
  author: string;
}

export default function AdminQuotesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [quotes, setQuotes] = useState<QuoteEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  // Add-quote form
  const [newText, setNewText] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (!session || session.user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [session, status, router]);

  const loadQuotes = () => {
    setLoading(true);
    fetch("/api/admin/quotes")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setQuotes(data.quotes))
      .catch(() => router.replace("/dashboard"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (session?.user.role !== "admin") return;
    loadQuotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const filtered = useMemo(() => {
    if (!quotes) return [];
    const q = search.trim().toLowerCase();
    if (!q) return quotes;
    return quotes.filter(
      (item) => item.text.toLowerCase().includes(q) || item.author.toLowerCase().includes(q)
    );
  }, [quotes, search]);

  async function handleAdd() {
    const text = newText.trim();
    const author = newAuthor.trim();
    if (!text || !author) return;

    setAdding(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, author }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);

      setQuotes((prev) => (prev ? [...prev, body.quote] : [body.quote]));
      invalidateApiCache("/api/quotes");
      setNewText("");
      setNewAuthor("");
      setMessage({ type: "ok", msg: "Quote added." });
    } catch (e) {
      setMessage({ type: "err", msg: e instanceof Error ? e.message : "Failed to add quote" });
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setConfirmId(null);
    try {
      const res = await fetch(`/api/admin/quotes/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setQuotes((prev) => (prev ? prev.filter((q) => q._id !== id) : prev));
      invalidateApiCache("/api/quotes");
    } catch (e) {
      setMessage({ type: "err", msg: e instanceof Error ? e.message : "Delete failed" });
    } finally {
      setDeletingId(null);
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-5 w-5 rounded-full border-[1.5px] border-white/20 border-t-white/70 animate-spin" />
      </div>
    );
  }

  if (!quotes) return null;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] border border-white/[0.10] hover:bg-white/[0.10] transition-colors shrink-0"
        >
          <ArrowLeft className="h-4 w-4 text-white/60" />
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] border border-white/[0.10] shrink-0">
          <QuoteIcon className="h-4.5 w-4.5 text-white/60" />
        </div>
        <div>
          <h1 className="text-[18px] font-bold">Quote Management</h1>
          <p className="text-[12px] text-muted-foreground">{quotes.length} quotes shown on the dashboard overlay</p>
        </div>
      </div>

      {/* Add quote */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-[13px] font-semibold text-white/80">Add a quote</h2>
        <Textarea
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="Quote text…"
          className="min-h-[70px] text-[13px] bg-white/[0.03] border-white/[0.08] resize-y"
        />
        <div className="flex items-center gap-2">
          <Input
            value={newAuthor}
            onChange={(e) => setNewAuthor(e.target.value)}
            placeholder="Author"
            className="h-9 text-[13px] bg-white/[0.03] border-white/[0.08] flex-1"
          />
          <Button size="sm" onClick={handleAdd} disabled={adding || !newText.trim() || !newAuthor.trim()}>
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add Quote
          </Button>
        </div>
        {message && (
          <div
            className={`flex items-center gap-1.5 text-[11.5px] ${
              message.type === "ok" ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {message.type === "ok" ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
            {message.msg}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by text or author…"
          className="pl-9 h-9 text-[12px] bg-white/[0.03] border-white/[0.08]"
        />
      </div>

      {/* List */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-[12px] text-muted-foreground text-center py-8">
            {quotes.length === 0 ? "No quotes yet." : "No quotes match your search."}
          </p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-border/50">
            {filtered.map((q) => (
              <div key={q._id} className="flex items-start gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-white/85 leading-relaxed">&ldquo;{q.text}&rdquo;</p>
                  <p className="text-[11px] text-white/40 mt-1">— {q.author}</p>
                </div>

                {confirmId === q._id ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleDelete(q._id)}
                      disabled={deletingId === q._id}
                      className="px-2 py-1 rounded-md bg-red-500/15 border border-red-500/25 text-[11px] font-medium text-red-400 hover:bg-red-500/25 transition"
                    >
                      {deletingId === q._id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirm"}
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmId(q._id)}
                    className="p-1.5 rounded-md text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10 transition shrink-0"
                    title="Remove quote"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
