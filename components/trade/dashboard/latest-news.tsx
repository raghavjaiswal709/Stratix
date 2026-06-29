"use client";

import { useEffect, useState } from "react";
import { Newspaper, Zap, AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface MarketImpactTag {
  symbol: string;
  effect: "bullish" | "bearish" | "neutral";
}

interface HighImpactEvent {
  event_name: string;
  impact_explanation: string;
  market_impact?: MarketImpactTag[];
}

interface NewsReport {
  meta: { date: string; session: string; generated_at: string; generated_by?: string };
  all_news_section: {
    headline: string;
    summary: string;
    high_impact_events: HighImpactEvent[];
  };
}

const SESSION_LABELS: Record<string, string> = {
  asian: "Asian", london: "London", new_york: "New York",
};

function renderMarkdown(raw: string): string {
  return raw
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*\*([\s\S]+?)\*\*\*/g, '<strong style="font-weight:700;font-style:italic">$1</strong>')
    .replace(/\*\*([\s\S]+?)\*\*/g, '<strong style="font-weight:700">$1</strong>')
    .replace(/\*([\s\S]+?)\*/g, '<em style="font-style:italic">$1</em>')
    .replace(/\n/g, "<br/>");
}

function ImpactTag({ tag }: { tag: MarketImpactTag }) {
  const bull = tag.effect === "bullish";
  const bear = tag.effect === "bearish";
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border",
      bull ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
      bear ? "bg-red-500/10 text-red-400 border-red-500/20" :
      "bg-white/[0.04] text-white/40 border-white/[0.07]",
    )}>
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", bull ? "bg-emerald-400" : bear ? "bg-red-400" : "bg-white/40")} />
      {tag.symbol}
    </span>
  );
}

export function LatestNewsWidget() {
  const [report, setReport] = useState<NewsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Fetch the index and load the most recent report
    fetch("/api/news-reports")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(async (entries: { date: string; session: string }[]) => {
        if (!entries?.length) { setLoading(false); return; }
        const latest = entries[0];
        const res = await fetch(
          `/api/news-reports?date=${encodeURIComponent(latest.date)}&session=${encodeURIComponent(latest.session)}`
        );
        if (!res.ok) throw new Error();
        setReport(await res.json());
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Newspaper className="h-4 w-4 text-white/40" />
          <h2 className="text-sm font-semibold">Latest News Report</h2>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Loading…</span>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="flex items-center gap-2">
            <Newspaper className="h-4 w-4 text-white/40" />
            <h2 className="text-sm font-semibold">Latest News Report</h2>
          </div>
          <Link href="/news-analysis" className="text-xs text-white/40 hover:text-white/70 flex items-center gap-1 transition">
            Open <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          {error ? "Could not load news report." : "No reports yet — generate one from News Analysis."}
        </p>
      </div>
    );
  }

  const events = report.all_news_section?.high_impact_events?.slice(0, 4) ?? [];
  const sessionLabel = SESSION_LABELS[report.meta?.session?.toLowerCase().replace(/\s+/g, "_") ?? ""] ?? report.meta?.session ?? "";

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-white/40 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold leading-none">Latest News Report</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {report.meta?.date} · {sessionLabel} Session
            </p>
          </div>
        </div>
        <Link
          href="/news-analysis"
          className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition shrink-0"
        >
          Full report <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* Headline */}
      <div className="rounded-lg bg-white/[0.03] border border-white/[0.07] px-4 py-3">
        <p className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-1.5">Top Headline</p>
        <p
          className="text-sm text-white/80 leading-relaxed"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: renderMarkdown(report.all_news_section?.headline ?? "") }}
        />
      </div>

      {/* High impact events */}
      {events.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-white/25 uppercase tracking-widest mb-2.5">Key Events</p>
          <div className="space-y-2.5">
            {events.map((ev, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/[0.06] border border-white/[0.08]">
                  <Zap className="h-3 w-3 text-white/40" />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-xs text-white/70 font-medium leading-snug mb-1"
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(ev.event_name ?? "") }}
                  />
                  {ev.market_impact && ev.market_impact.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {ev.market_impact.slice(0, 5).map((tag, j) => (
                        <ImpactTag key={j} tag={tag} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generate link */}
      <div className="pt-1 border-t border-white/[0.05] flex items-center justify-between">
        <p className="text-[11px] text-white/20">
          Generated {report.meta?.generated_by ? `by ${report.meta.generated_by.split("@")[0]}` : ""}
        </p>
        <Link
          href="/news-analysis"
          className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400/70 hover:text-emerald-400 transition"
        >
          <Zap className="h-3 w-3" /> Generate new
        </Link>
      </div>
    </div>
  );
}
