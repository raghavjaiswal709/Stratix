"use client";

// "Ask Anything" — dashboard-wide portfolio Q&A. Grounded strictly in this
// user's own trades + missed trades + journal notes (see app/api/portfolio-ai/route.ts).
// Gemini-like sticky bottom-center chat box always visible on the dashboard.
// Focusing or typing in the text box opens the chat modal and keeps both connected.
// Features a self-contained rounded-head bouncy shooting star comet magnet engine.
// Supports click-outside and Escape key dismissal for both the modal and text widget.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { X, Trash2, ArrowUp, AlertCircle } from "lucide-react";
import { MarkdownText } from "@/components/shared/markdown-text";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SHOOTING_STAR_COUNT = 32;
const MAGNET_EASINGS = [
  "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
  "cubic-bezier(0.34, 1.56, 0.64, 1)",
  "cubic-bezier(0.25, 1, 0.5, 1)",
];

interface ShootingStarParticle {
  angle: string;
  radius: string;
  width: number;
  height: number;
  duration: string;
  delay: string;
  easing: string;
}

export function useShootingStars(): ShootingStarParticle[] {
  return useMemo(
    () =>
      Array.from({ length: SHOOTING_STAR_COUNT }, (_, i) => {
        const baseAngle = (i / SHOOTING_STAR_COUNT) * 360;
        const angleJitter = (Math.random() - 0.5) * 10;
        const angle = `${(baseAngle + angleJitter).toFixed(1)}deg`;
        const radius = `${(50 + Math.random() * 95).toFixed(1)}px`;
        const width = 1.0 + Math.random() * 0.8; // Ultra-thin razor particles: 1.0px - 1.8px
        const height = 22 + Math.random() * 18;
        const duration = `${(0.38 + Math.random() * 0.35).toFixed(2)}s`;
        const delay = `${(Math.random() * 0.52).toFixed(2)}s`;
        const easing = MAGNET_EASINGS[Math.floor(Math.random() * MAGNET_EASINGS.length)];

        return { angle, radius, width, height, duration, delay, easing };
      }),
    [],
  );
}

export function ShootingStarMagnet() {
  const stars = useShootingStars();
  return (
    <div className="pai-shooting-magnet flex items-center justify-center" aria-hidden="true">
      <style>{`
        /* REALISTIC PURE-WHITE ROUNDED BOUNCY SHOOTING STAR ENGINE */
        .pai-shooting-magnet {
          position: relative;
          width: 140px;
          height: 140px;
          flex-shrink: 0;
        }
        .pai-magnet-halo {
          position: absolute;
          top: 50%; left: 50%;
          width: 38px; height: 38px;
          margin: -19px 0 0 -19px;
          border-radius: 9999px;
          background: radial-gradient(circle, rgba(255, 255, 255, 0.25), transparent 70%);
          animation: pai-halo 0.75s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
        }
        .pai-magnet-core {
          position: absolute;
          top: 50%; left: 50%;
          width: 14px; height: 14px;
          margin: -7px 0 0 -7px;
          border-radius: 9999px;
          background: #ffffff;
          box-shadow: 0 0 14px rgba(255, 255, 255, 0.9);
          animation: pai-pulse 0.75s cubic-bezier(0.175, 0.885, 0.32, 1.275) infinite;
        }
        .pai-shooting-star {
          position: absolute;
          top: 50%; left: 50%;
          border-radius: 9999px;
          background: linear-gradient(0deg, #ffffff 0%, rgba(255, 255, 255, 0.7) 35%, rgba(255, 255, 255, 0.15) 80%, transparent 100%);
          transform-origin: 50% 100%;
          animation-name: pai-star-bounce-fly;
          animation-iteration-count: infinite;
        }

        @keyframes pai-halo {
          0%, 100% { transform: scale(0.8); opacity: 0.25; }
          50% { transform: scale(1.4); opacity: 0.75; }
        }
        @keyframes pai-pulse {
          0%, 100% { transform: scale(0.85); }
          50% { transform: scale(1.35); }
        }
        @keyframes pai-star-bounce-fly {
          0% {
            transform: rotate(var(--angle)) translateY(calc(var(--radius) * -1)) scaleY(0.4) scaleX(0.8);
            opacity: 0;
          }
          15% {
            opacity: 0.95;
            transform: rotate(var(--angle)) translateY(calc(var(--radius) * -0.85)) scaleY(1) scaleX(1);
          }
          75% {
            transform: rotate(var(--angle)) translateY(calc(var(--radius) * -0.15)) scaleY(1.2) scaleX(1.1);
            opacity: 1;
          }
          90% {
            transform: rotate(var(--angle)) translateY(0px) scaleY(1.45) scaleX(1.35);
            opacity: 1;
          }
          100% {
            transform: rotate(var(--angle)) translateY(0px) scale(0);
            opacity: 0;
          }
        }
      `}</style>
      <span className="pai-magnet-halo" />
      <span className="pai-magnet-core" />
      {stars.map((s, i) => (
        <span
          key={i}
          className="pai-shooting-star"
          style={{
            "--angle": s.angle,
            "--radius": s.radius,
            width: s.width,
            height: s.height,
            marginTop: -s.height,
            marginLeft: -s.width / 2,
            animationDuration: s.duration,
            animationDelay: s.delay,
            animationTimingFunction: s.easing,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

function PortfolioAIThinking() {
  return (
    <div className="flex flex-col items-center gap-4 text-center py-4">
      <ShootingStarMagnet />
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs font-semibold text-white/90 tracking-wide">
          Analyzing Portfolio &amp; P&amp;L Data…
        </span>
        <span className="text-[10px] text-white/40">Synthesizing stats, missed trades &amp; journal notes</span>
      </div>
    </div>
  );
}

const EXAMPLE_QUESTIONS = [
  "What's my total P&L & win rate?",
  "Which symbol is most profitable?",
  "What mistakes do I keep repeating?",
  "Show me my biggest losses & takeaways",
];

export function usePortfolioAI(profileId?: string) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async (override?: string) => {
    const q = (override ?? input).trim();
    if (!q || loading) return;
    setInput("");
    setError(null);
    const next: ChatMessage[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setLoading(true);
    setOpen(true);
    try {
      const res = await fetch("/api/portfolio-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, history: messages, profileId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to get a response");
      setMessages([...next, { role: "assistant", content: json.answer ?? "" }]);
    } catch (err) {
      setError((err as Error).message);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, profileId]);

  const ask = useCallback((q: string) => {
    setOpen(true);
    send(q);
  }, [send]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { open, setOpen, messages, input, setInput, loading, error, send, ask, clearMessages };
}

// ─── Gemini Sticky Chat Bar at Bottom Center (Connected & Rounded) ─────────
export function PortfolioAITrigger({
  input,
  onInputChange,
  onAsk,
  onOpen,
  isOpen,
  loading,
}: {
  input: string;
  onInputChange: (v: string) => void;
  onAsk: (q: string) => void;
  onOpen: () => void;
  isOpen?: boolean;
  loading?: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (input.trim() && !loading) {
          onAsk(input);
        }
      }}
      className={`flex items-center gap-3 rounded-full border border-white/[0.18] bg-[#0c0d12]/98 px-5 py-3 shadow-2xl transition-all duration-200 ${
        isOpen ? "border-white/40 ring-1 ring-white/15" : "hover:border-white/35"
      }`}
    >
      <input
        value={input}
        onChange={(e) => {
          onInputChange(e.target.value);
          if (!isOpen) onOpen();
        }}
        onFocus={() => {
          if (!isOpen) onOpen();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (input.trim() && !loading) {
              onAsk(input);
            }
          }
        }}
        placeholder="Ask anything about your trades, performance, or journal…"
        className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm text-white/90 placeholder:text-white/40 focus:outline-none py-0.5"
      />
      <button
        type="submit"
        disabled={loading || !input.trim()}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white hover:bg-white/90 active:scale-95 text-black font-semibold shadow-md transition-all disabled:opacity-30"
        title="Send query"
      >
        <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
      </button>
    </form>
  );
}

// ─── Bouncy Modal Panel (Attached Above Chat Bar, Rounded-3xl, Clean Header) ─
export function PortfolioAIModal({
  open,
  onClose,
  messages,
  loading,
  error,
  onClear,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  onClear?: () => void;
  onSend: (q?: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading, open]);

  if (!open) return null;

  return (
    <div
      className="pai-bouncy-panel-center absolute bottom-full left-0 mb-2.5 flex h-[520px] max-h-[70vh] w-full flex-col rounded-[28px] border border-white/[0.16] bg-[#0c0d12]/98 shadow-2xl overflow-hidden z-[75] pointer-events-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <style>{`
        @keyframes pai-bounce-in-center {
          0% {
            opacity: 0;
            transform: translateY(20px) scale(0.93);
          }
          60% {
            opacity: 1;
            transform: translateY(-6px) scale(1.015);
          }
          85% {
            transform: translateY(2px) scale(0.995);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .pai-bouncy-panel-center {
          transform-origin: bottom center;
          animation: pai-bounce-in-center 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
      `}</style>

      {/* Top subtle line */}
      <div className="shrink-0 h-[1px] bg-white/10" />

      {/* Header Bar — Minimal text only, no robot/star SVGs */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-3.5 border-b border-white/[0.08] bg-white/[0.02]">
        <div>
          <p className="text-xs font-bold text-white/95 tracking-tight">Portfolio AI Assistant</p>
          <p className="text-[10px] text-white/40">Grounded in your trades &amp; P&amp;L data</p>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && onClear && (
            <button
              onClick={onClear}
              className="rounded-lg p-1.5 text-white/40 hover:text-white hover:bg-white/[0.06] transition"
              title="Clear conversation"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/40 hover:text-white hover:bg-white/[0.06] transition"
            title="Close panel (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Message Body Container */}
      <div className="relative flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
        {messages.length === 0 && !loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-2">
            <div className="space-y-1">
              <p className="text-xs font-medium text-white/80">Ask anything about your portfolio &amp; P&amp;L</p>
              <p className="text-[11px] text-white/40 max-w-xs">
                Get insights on win rate, trade mistakes, top symbols, or recent performance trends.
              </p>
            </div>
            <div className="flex flex-col gap-1.5 w-full max-w-xs">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => onSend(q)}
                  className="text-left rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[11px] text-white/70 hover:text-white hover:border-white/25 hover:bg-white/10 transition"
                >
                  💡 {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-white text-black font-medium shadow-md"
                    : "bg-white/[0.05] border border-white/[0.08] text-white/90 shadow-sm"
                }`}
              >
                {m.role === "assistant" ? <MarkdownText text={m.content} /> : m.content}
              </div>
            </div>
          ))
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* 100% Fixed & Consistent Searching Animation Overlay */}
      {loading && (
        <div className="absolute inset-x-0 bottom-0 top-[53px] z-30 flex items-center justify-center bg-[#0c0d12]/85 backdrop-blur-md transition-opacity duration-200">
          <PortfolioAIThinking />
        </div>
      )}
    </div>
  );
}

// ─── Gemini Bottom-Center Sticky Widget ────────────────────────────────────
export function PortfolioAIWidget({
  profileId,
}: {
  profileId?: string;
}) {
  const ai = usePortfolioAI(profileId);
  const widgetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ai.open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        ai.setOpen(false);
      }
    };
    const handlePointerDown = (e: MouseEvent) => {
      if (widgetRef.current && !widgetRef.current.contains(e.target as Node)) {
        ai.setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [ai.open, ai.setOpen]);

  return (
    <div ref={widgetRef} className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] w-full max-w-xl px-4 pointer-events-auto">
      <div className="relative w-full">
        <PortfolioAIModal
          open={ai.open}
          onClose={() => ai.setOpen(false)}
          messages={ai.messages}
          loading={ai.loading}
          error={ai.error}
          onClear={ai.clearMessages}
          onSend={ai.send}
        />
        <PortfolioAITrigger
          input={ai.input}
          onInputChange={ai.setInput}
          onAsk={ai.ask}
          onOpen={() => ai.setOpen(true)}
          isOpen={ai.open}
          loading={ai.loading}
        />
      </div>
    </div>
  );
}
