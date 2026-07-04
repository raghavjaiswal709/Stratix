"use client";

import { format } from "date-fns";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  User,
  Clock,
  Newspaper,
  Lightbulb,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Sentiment = "Bullish" | "Bearish" | "Neutral";

interface InstrumentSentiment {
  symbol: string;
  sentiment: Sentiment;
  confidence: number;
  summary: string;
  key_drivers: string[];
}

interface AnalyzedNewsItem {
  headline: string;
  source: string;
  pubDate: string;
  impact: "High" | "Medium" | "Low";
  affected_instruments: { symbol: string; sentiment: Sentiment }[];
}

export interface SentimentReportData {
  overall_sentiment: { risk_tone: "Risk-On" | "Risk-Off" | "Neutral"; summary: string };
  instrument_sentiment: InstrumentSentiment[];
  analyzed_news: AnalyzedNewsItem[];
  key_themes: string[];
}

export interface SentimentReport {
  _id: string;
  hours: number;
  timeRangeLabel: string;
  newsAnalyzedCount: number;
  generatedBy: string;
  generatedByName?: string;
  generatedAt: string;
  data: SentimentReportData;
}

const SENTIMENT_STYLES: Record<Sentiment, { text: string; bg: string; border: string; icon: typeof TrendingUp }> = {
  Bullish: { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/25", icon: TrendingUp },
  Bearish: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/25", icon: TrendingDown },
  Neutral: { text: "text-white/60", bg: "bg-white/5", border: "border-white/15", icon: Minus },
};

const RISK_TONE_STYLES: Record<string, { text: string; bg: string; border: string; icon: typeof TrendingUp }> = {
  "Risk-On": { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/25", icon: TrendingUp },
  "Risk-Off": { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/25", icon: TrendingDown },
  Neutral: { text: "text-white/60", bg: "bg-white/5", border: "border-white/15", icon: Minus },
};

function SentimentBadge({ sentiment, size = "sm" }: { sentiment: Sentiment; size?: "sm" | "md" }) {
  const s = SENTIMENT_STYLES[sentiment];
  const Icon = s.icon;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border font-bold uppercase tracking-wide",
      s.text, s.bg, s.border,
      size === "sm" ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-1 text-[10px]"
    )}>
      <Icon className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {sentiment}
    </span>
  );
}

function ConfidenceBar({ value, sentiment }: { value: number; sentiment: Sentiment }) {
  const color = sentiment === "Bullish" ? "bg-emerald-500" : sentiment === "Bearish" ? "bg-red-500" : "bg-white/40";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-white/8 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <span className="text-[10px] font-semibold text-white/40 tabular-nums w-8 text-right">{value}%</span>
    </div>
  );
}

function InstrumentCard({ inst }: { inst: InstrumentSentiment }) {
  const s = SENTIMENT_STYLES[inst.sentiment];

  return (
    <div className={cn("rounded-xl border overflow-hidden transition break-inside-avoid mb-3", s.border, s.bg)}>
      <div className="p-3.5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-bold text-white">{inst.symbol}</span>
          <SentimentBadge sentiment={inst.sentiment} />
        </div>
        <ConfidenceBar value={inst.confidence} sentiment={inst.sentiment} />
        <p className="text-[11px] text-white/60 leading-relaxed mt-2.5">
          {inst.summary}
        </p>
        {inst.key_drivers.length > 0 && (
          <ul className="mt-2.5 space-y-1.5 border-t border-white/5 pt-2.5">
            {inst.key_drivers.map((d, i) => (
              <li key={i} className="text-[10px] text-white/45 flex gap-1.5 leading-relaxed">
                <span className="shrink-0">•</span>{d}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function SentimentReportDashboard({ report, onClose, title = "News Sentiment Report" }: { report: SentimentReport; onClose?: () => void; title?: string }) {
  const d = report.data;
  const riskStyle = RISK_TONE_STYLES[d.overall_sentiment.risk_tone] ?? RISK_TONE_STYLES.Neutral;
  const RiskIcon = riskStyle.icon;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[#0c0e14] border-b border-white/7">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4 text-white/70" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[16px] font-bold text-white truncate">{title}</h2>
            <div className="flex items-center gap-1.5 text-[11px] text-white/35 flex-wrap">
              <span>{report.timeRangeLabel}</span>
              <span className="text-white/15">·</span>
              <span>{report.newsAnalyzedCount} news analyzed</span>
              <span className="text-white/15">·</span>
              <span className="flex items-center gap-1"><User className="h-2.5 w-2.5" />{report.generatedByName || report.generatedBy}</span>
              <span className="text-white/15">·</span>
              <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{format(new Date(report.generatedAt), "MMM d, HH:mm")}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <span className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold", riskStyle.text, riskStyle.bg, riskStyle.border)}>
            <RiskIcon className="h-3.5 w-3.5" />
            {d.overall_sentiment.risk_tone}
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white/50 hover:text-white transition"
              aria-label="Close report"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="px-6 py-5 space-y-5 max-w-5xl mx-auto">
        {/* Overall summary */}
        <div className="rounded-xl border border-white/7 p-4">
          <p className="text-[13px] text-white/75 leading-relaxed whitespace-pre-wrap">{d.overall_sentiment.summary}</p>
        </div>

        {/* Instrument grid */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-white/55" />
            <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Instrument Sentiment</span>
            <span className="ml-auto text-[10px] text-white/25">{d.instrument_sentiment.length} instruments</span>
          </div>
          <div className="columns-1 sm:columns-2 xl:columns-3 gap-3">
            {d.instrument_sentiment.map((inst) => (
              <InstrumentCard key={inst.symbol} inst={inst} />
            ))}
          </div>
        </div>

        {/* Key themes */}
        {d.key_themes.length > 0 && (
          <div className="rounded-xl border border-white/7 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
              <Lightbulb className="h-4 w-4 text-amber-400/80" />
              <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Key Themes</span>
            </div>
            <div className="p-4">
              <ul className="space-y-2">
                {d.key_themes.map((theme, i) => (
                  <li key={i} className="text-[12px] text-white/70 flex gap-2.5">
                    <span className="h-5 w-5 shrink-0 rounded-full bg-white/8 text-white/50 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                    {theme}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Analyzed news feed */}
        <div className="rounded-xl border border-white/7 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
            <Newspaper className="h-4 w-4 text-white/55" />
            <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Analyzed News</span>
            <span className="ml-auto text-[10px] text-white/25">{d.analyzed_news.length} items</span>
          </div>
          <div className="divide-y divide-white/5">
            {d.analyzed_news.map((item, i) => (
              <div key={i} className="p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[12px] text-white/80 leading-snug flex-1">{item.headline}</p>
                  <span className={cn(
                    "shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full border uppercase",
                    item.impact === "High" ? "text-red-400 bg-red-500/10 border-red-500/25"
                      : item.impact === "Medium" ? "text-amber-400 bg-amber-500/10 border-amber-500/25"
                      : "text-white/40 bg-white/5 border-white/10"
                  )}>
                    {item.impact}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span className="text-[10px] text-white/30">{item.source}</span>
                  <span className="text-white/15">·</span>
                  <span className="text-[10px] text-white/30">{item.pubDate ? format(new Date(item.pubDate), "MMM d, HH:mm") : ""}</span>
                  {item.affected_instruments.map((ai) => (
                    <span
                      key={ai.symbol}
                      className={cn(
                        "text-[9px] font-semibold px-1.5 py-0.5 rounded border",
                        SENTIMENT_STYLES[ai.sentiment].text, SENTIMENT_STYLES[ai.sentiment].bg, SENTIMENT_STYLES[ai.sentiment].border
                      )}
                    >
                      {ai.symbol}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
