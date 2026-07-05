"use client";

// "Ask AI" scoped to one already-generated Filter News report — lets the
// user chat about the report's kept articles without leaving the report
// view. Grounded strictly in that report's news (+ live candles as additive
// context only, see app/api/news/filter-report/ask/route.ts).
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, X, Send, Loader2, AlertCircle } from "lucide-react";
import { MarkdownText } from "@/components/shared/markdown-text";
import type { FilterReportKeptItem } from "./news-display-shared";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function useReportAskAI(articles: FilterReportKeptItem[]) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setError(null);
    const next: ChatMessage[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await fetch("/api/news/filter-report/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, history: messages, articles }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to get a response");
      setMessages([...next, { role: "assistant", content: json.answer ?? "" }]);
    } catch (err) {
      setError((err as Error).message);
      setMessages((prev) => prev.slice(0, -1)); // remove the optimistic user message
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, articles]);

  return { open, setOpen, messages, input, setInput, loading, error, send };
}

export function ReportAskAI({
  open,
  onClose,
  messages,
  input,
  onInputChange,
  onSend,
  loading,
  error,
}: {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  input: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  loading: boolean;
  error: string | null;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative flex h-[70vh] w-full max-w-2xl flex-col rounded-2xl border border-white/[0.10] bg-[#0c0c0c] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 h-[2px]" style={{ background: "linear-gradient(90deg, transparent 0%, #059669 20%, #7c3aed 55%, #0891b2 80%, transparent 100%)", opacity: 0.8 }} />
        <div className="flex shrink-0 items-center justify-between gap-4 px-6 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{ background: "linear-gradient(135deg, #059669 0%, #7c3aed 60%, #0891b2 100%)" }}
            >
              <MessageSquare className="h-3.5 w-3.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white/90">Ask AI — This Report</p>
              <p className="text-[10px] text-white/30">Grounded in this report&apos;s news · live candles as additive context</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-white/40 hover:text-white hover:bg-white/[0.05] transition shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3.5">
          {messages.length === 0 && !loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <MessageSquare className="h-6 w-6 text-white/15" />
              <p className="text-xs text-white/30">Ask anything about the news in this report.</p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-white/[0.08] text-white"
                      : "bg-emerald-500/[0.06] border border-emerald-500/[0.15] text-white/85"
                  }`}
                >
                  {m.role === "assistant" ? <MarkdownText text={m.content} /> : m.content}
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/[0.15] bg-emerald-500/[0.06] px-3.5 py-2.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                <span className="text-xs text-white/40">Thinking…</span>
              </div>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-xs text-rose-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="flex shrink-0 items-end gap-2 border-t border-white/[0.06] px-4 py-3">
          <textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Ask about this report's news…"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-white/[0.10] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white/85 placeholder:text-white/25 focus:outline-none focus:border-emerald-500/30"
          />
          <button
            onClick={onSend}
            disabled={loading || !input.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #059669 0%, #7c3aed 60%, #0891b2 100%)" }}
          >
            <Send className="h-4 w-4 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
