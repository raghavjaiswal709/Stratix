import type { NewsItem } from "./types";
import { renderTemplate } from "@/lib/prompts/template";


export const buildCreatorNewsPrompt = (date: string, session: string, candles: any) => {
  const ts = new Date().toISOString();
  
  // Format candles nicely
  let candleBlock = "";
  if (candles) {
    const lines: string[] = ["=== REAL MARKET DATA CONTEXT (OHLCV) ==="];
    const symbols = ["XAUUSD", "XAGUSD", "BTCUSDT", "ETHUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF"];
    for (const sym of symbols) {
      const d = candles[sym.toLowerCase()];
      if (d && d.h1 && d.h1.length > 0) {
        lines.push(`\n${sym}:`);
        d.h1.slice(-5).forEach((c: any) => {
          const dt = new Date(c.t * 1000).toISOString().replace("T", " ").slice(0, 16);
          lines.push(`  ${dt} UTC: O:${c.o} H:${c.h} L:${c.l} C:${c.c}`);
        });
      }
    }
    candleBlock = lines.join("\n");
  } else {
    candleBlock = "=== REAL MARKET DATA CONTEXT ===\nNo live data summary available. Rely on real-world news sources.";
  }

  return `You are a world-class financial news analyst. Generate a valid JSON array of NewsItem items for the upcoming trading session.
  
================================================================
SESSION DETAILS:
================================================================
Date: ${date}
Session: ${session} (Asian | London | New York)
Generated At: ${ts}

================================================================
LIVE PRICE ACTION (REAL OHLCV):
================================================================
${candleBlock}

================================================================
INSTRUCTIONS:
================================================================
1. Extract or research the most important global macro events, central bank announcements, natural disasters, or geopolitical shocks for this date/session.
2. Produce a valid JSON array containing a batch of news items (at least 2-5 items).
3. Do NOT include markdown blocks, introductory texts, or code explanations. Return ONLY the JSON code block.
4. Each news item must have EXACTLY the following fields:
   - "title": A short, engaging headline (e.g. "US Inflation Cools Down to 2.8%")
   - "description": A highly detailed paragraph in Hinglish or simple English (100-150 words) mapping the transmission mechanism (Trigger -> Impact -> Ripple effect) with bold figures and italic contexts.
   - "imageUrl": A high-quality Unsplash image URL matching the theme of the headline (e.g. stock market, oil refinery, gold bars, bitcoin coin, central bank building). Use actual working Unsplash links.
   - "source": "Bloomberg" | "Reuters" | "CNBC" | etc.
   - "date": Date string (e.g. "June 27, 2026")
   - "impact": "High" | "Medium" | "Low"
   - "sentiment": "Bullish" | "Bearish" | "Neutral"
   - "affectedAssets": Comma-separated list of symbols (e.g. "USD, XAUUSD, US Equities")
   - "keyTakeaway": A concise summary (40-60 words) highlighting immediate trader action bias and technical levels.

================================================================
OUTPUT SCHEMA:
================================================================
\`\`\`json
[
  {
    "title": "US Inflation Cools Down to 2.8% in May",
    "description": "CPI data cools down to 2.8% vs expected 3.0%. Retail inflation is slowing down at a faster pace, which has fueled speculation of an early rate cut by the Federal Reserve.",
    "imageUrl": "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800",
    "source": "Bloomberg",
    "date": "June 27, 2026",
    "impact": "High",
    "sentiment": "Bearish",
    "affectedAssets": "USD, XAUUSD, US Equities",
    "keyTakeaway": "Treasury yields dropped immediately, weakening the DXY and providing a massive safety bid to Gold prices."
  }
]
\`\`\`
`;
};
export const SESSION_LABELS: Record<string, string> = {
  asian: "Asian",
  london: "London",
  new_york: "New York",
};
export const SESSION_ORDER = ["asian", "london", "new_york"] as const;

export const SYMBOL_META: Record<string, { label: string; assetClass: string; flag: string }> = {
  XAUUSD:  { label: "XAU/USD",  assetClass: "Metals", flag: "🥇" },
  XAGUSD:  { label: "XAG/USD",  assetClass: "Metals", flag: "🥈" },
  BTCUSDT: { label: "BTC/USDT", assetClass: "Crypto", flag: "₿"  },
  ETHUSD:  { label: "ETH/USD",  assetClass: "Crypto", flag: "Ξ"  },
  GBPUSD:  { label: "GBP/USD",  assetClass: "Forex",  flag: "🇬🇧" },
  EURUSD:  { label: "EUR/USD",  assetClass: "Forex",  flag: "🇪🇺" },
  USDJPY:  { label: "USD/JPY",  assetClass: "Forex",  flag: "🇯🇵" },
  AUDUSD:  { label: "AUD/USD",  assetClass: "Forex",  flag: "🇦🇺" },
  NZDUSD:  { label: "NZD/USD",  assetClass: "Forex",  flag: "🇳🇿" },
  USDCAD:  { label: "USD/CAD",  assetClass: "Forex",  flag: "🇨🇦" },
  USDCHF:  { label: "USD/CHF",  assetClass: "Forex",  flag: "🇨🇭" },
};
export const SYMBOL_DISPLAY_ORDER = [
  "XAUUSD", "XAGUSD", "BTCUSDT", "ETHUSD",
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF",
];

export const TIME_RANGE_OPTIONS = [
  { value: "3h",  label: "3h",     display: "Last 3 Hours",  hours: 3   },
  { value: "6h",  label: "6h",     display: "Last 6 Hours",  hours: 6   },
  { value: "12h", label: "12h",    display: "Last 12 Hours", hours: 12  },
  { value: "18h", label: "18h",    display: "Last 18 Hours", hours: 18  },
  { value: "24h", label: "24h",    display: "Last 24 Hours", hours: 24  },
  { value: "2d",  label: "2 Days", display: "Last 2 Days",   hours: 48  },
  { value: "3d",  label: "3 Days", display: "Last 3 Days",   hours: 72  },
  { value: "7d",  label: "1 Week", display: "Last 7 Days",   hours: 168 },
] as const;
export type TimeRange = typeof TIME_RANGE_OPTIONS[number]["value"];
export function formatToISTString(d: Date): string {
  const istDate = new Date(d.getTime() + (330 * 60 * 1000));
  const y = istDate.getUTCFullYear();
  const m = String(istDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(istDate.getUTCDate()).padStart(2, "0");
  const h = String(istDate.getUTCHours()).padStart(2, "0");
  const min = String(istDate.getUTCMinutes()).padStart(2, "0");
  const s = String(istDate.getUTCSeconds()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}:${s} IST`;
}

export function formatCandlesForNewsPrompt(data: any, selectedSymbols: string[]): string {
  if (!data) return "(candle data available nahi hai — general market knowledge use karo)";

  const syms = selectedSymbols.map(s => s.toLowerCase());
  const lines: string[] = ["=== REAL OHLCV CANDLE DATA (IST timestamps) ==="];

  for (const sym of syms) {
    const d = data[sym];
    if (!d) continue;
    lines.push(`\n${sym.toUpperCase()}:`);
    if (d.h4?.length) {
      lines.push("  H4 (last 7 din):");
      for (const c of d.h4) {
        const istDate = new Date((c.t * 1000) + (330 * 60 * 1000));
        const y = istDate.getUTCFullYear();
        const m = String(istDate.getUTCMonth() + 1).padStart(2, "0");
        const day = String(istDate.getUTCDate()).padStart(2, "0");
        const h = String(istDate.getUTCHours()).padStart(2, "0");
        const dt = `${y}-${m}-${day} ${h}:00 IST`;
        lines.push(`    ${dt}  O:${c.o}  H:${c.h}  L:${c.l}  C:${c.c}`);
      }
    }
    if (d.h1?.length) {
      lines.push("  H1 (last 48 ghante):");
      for (const c of d.h1) {
        const istDate = new Date((c.t * 1000) + (330 * 60 * 1000));
        const y = istDate.getUTCFullYear();
        const m = String(istDate.getUTCMonth() + 1).padStart(2, "0");
        const day = String(istDate.getUTCDate()).padStart(2, "0");
        const h = String(istDate.getUTCHours()).padStart(2, "0");
        const min = String(istDate.getUTCMinutes()).padStart(2, "0");
        const dt = `${y}-${m}-${day} ${h}:${min} IST`;
        lines.push(`    ${dt}  O:${c.o}  H:${c.h}  L:${c.l}  C:${c.c}`);
      }
    }
  }
  return lines.join("\n");
}
// ─── NewsItem[] format user message builders ──────────────────────────────────
// These produce the JSON format directly accepted by the content-creator
// news poster renderer: a flat NewsItem[] array.
//
// NewsItem fields:
//   title, description, imageUrl, source, date,
//   impact ("High"|"Medium"|"Low"), sentiment ("Bullish"|"Bearish"|"Neutral"),
//   affectedAssets, keyTakeaway

export const NEWS_POSTER_SCHEMA_EXAMPLE = JSON.stringify([
  {
    title: "US Inflation Cools Down to 2.8% in May",
    description: "**CPI** data cooled to **2.8%** vs *expected 3.0%*. Retail inflation is slowing faster than forecast, fuelling speculation of an early rate cut by the **Federal Reserve**.\n\n**Transmission:** *Softer inflation* → Treasury yields drop **-12bps** → **DXY** weakens → **XAUUSD** bid strengthens → safe-haven flows into Gold accelerate.\n\n**Cross-asset:** **US Equities** initially rallied *+0.8%* before reality check on growth outlook. *Risk-on sentiment* is fragile.",
    imageUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800",
    source: "Bloomberg",
    date: "June 27, 2026",
    impact: "High",
    sentiment: "Bearish",
    affectedAssets: "USD, XAUUSD, US Equities",
    keyTakeaway: "Treasury yields dropped immediately, weakening the DXY and providing a massive safety bid to Gold prices. Watch **$3,320** support — break below triggers acceleration.",
  },
  {
    title: "OPEC+ Surprises With Emergency 500k bpd Cut",
    description: "**OPEC+** announced an emergency supply cut of **500,000 bpd** effective immediately, catching markets off guard. *Analysts had expected no change* at this meeting.\n\n**Chain:** Supply cut → *WTI crude surges* **+$6.40/bbl** → Inflation expectations up → **USD** strengthens → **Commodity currencies** (CAD, NOK) outperform → Gold *caught between safe-haven demand and strong USD*.",
    imageUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800",
    source: "Reuters",
    date: "June 27, 2026",
    impact: "High",
    sentiment: "Bullish",
    affectedAssets: "USDCAD, Oil, XAUUSD, XAGUSD",
    keyTakeaway: "Energy sector strongly bid. USDCAD likely to reverse lower. Gold faces dual pressure — safe-haven bid vs stronger USD. Monitor **$85/bbl** resistance on WTI.",
  },
], null, 2);

// Default (unedited) user-message template — {{TOKENS}} filled in by buildNewsUserMessageV5.
// Mirrors lib/prompts/definitions/contentCreator.ts's "contentCreator.dailyAnalysisUser" default.
export const DEFAULT_DAILY_ANALYSIS_USER_TEMPLATE = `================================================================
CRITICAL INSTRUCTION — OUTPUT FORMAT
================================================================
Tera POORA response SIRF ek \`\`\`json ... \`\`\` code block hona chahiye.
Koi bhi text — upar, neeche, ya beech mein — STRICTLY FORBIDDEN.
Pehli line \`\`\`json, aakhri line \`\`\`, aur beech mein ONLY valid JSON ARRAY.
================================================================

Aaj ka IST date hai {{DATE}}. Aane wala session hai {{SESSION_LABEL}} Session.
Current IST time: {{TS_IST}}
Generated: {{TS}}

⏰ NEWS TIME WINDOW: {{FROM_TS_IST}} SE LEKAR {{TS_IST}} TAK ({{WINDOW_DISPLAY}})
STRICT RULE: Sirf is time window ke andar ki news cover karo. Older news strictly banned.

{{CANDLE_BLOCK}}

Upar diye gaye REAL H4 aur H1 candle data ko price context ke liye use karo.

═══════════════════════════════════════════════════════
TERA KAAM — TWITTER/X FEED STYLE NEWS POSTER BATCH
({{TIME_HINGLISH}} ki news — {{FROM_TS_IST}} ke baad ki)
Selected symbols: {{SYMBOL_LIST}}
═══════════════════════════════════════════════════════

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIMARY SOURCES — IN 3 TWITTER/X HANDLES KA FOCUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  @FirstSquawk      — breaking financial & market news alerts
  @investingLive_   — live investing, markets & macro news feed
  @ForexFactory     — forex calendar events, economic data releases

Agar real-time search tools available hain — in handles ki recent posts search karo.
Agar nahi — apni training knowledge se woh REAL events cover karo jo yeh handles report karte hain.

⚠️ NO-FABRICATION RULE — ABSOLUTE:
  ✗ Koi fake tweet mat banana
  ✗ Koi event INVENT mat karna jo factually known nahi
  ✓ Sirf REAL events jo tujhe actually pata hain
  ✓ Agar specific event is window mein nahi hua — correlation analysis likh
  ✓ Uncertain info ke liye: "⚠️ Market-Sensitive Rumor:" prefix use karo
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

================================================================
OUTPUT: NEWSITEM[] ARRAY — POSTER GENERATOR FORMAT
================================================================
Ek valid JSON ARRAY return karo jisme har element ek NewsItem object ho.
Minimum 4-8 items. Har item ek alag high-impact event ya symbol ya macro story cover kare.
Selected symbols ({{SYMBOL_LIST}}) ke liye individual items banana — har symbol ka ek dedicated poster.

HAR NEWSITEM MEIN YEH EXACT FIELDS MANDATORY HAIN:

• "title"          : Short, impactful headline in Hinglish (max 10 words)
• "description"    : 120-180 word Hinglish analysis — **Trigger → Mechanism → Market Impact → Ripple Effect** chain.
                     Har important number aur event ko **bold** karo.
                     Expected vs actual ko *italic* mein likhna.
                     Critical alerts ke liye ***bold italic*** use karo.
                     Paragraphs ke beech \\n\\n use karo.
• "imageUrl"       : Ek highly relevant, REAL, working Unsplash image URL (https://images.unsplash.com/photo-...).
                     Image is specific event/asset se visually match karni chahiye.
                     MANDATORY — koi placeholder nahi, koi empty string nahi.
• "source"         : "Bloomberg" | "Reuters" | "CNBC" | "@FirstSquawk" | "@investingLive_" | "@ForexFactory" | etc.
• "date"           : "{{HUMAN_DATE}}" (human-readable)
• "impact"         : EXACTLY one of: "High" | "Medium" | "Low" (case-sensitive, no other values)
• "sentiment"      : EXACTLY one of: "Bullish" | "Bearish" | "Neutral" (case-sensitive, no other values)
• "affectedAssets" : Comma-separated relevant symbols from: {{SYMBOL_LIST}}, USD, EUR, GBP, JPY, AUD, NZD, CAD, CHF, Oil, Gold, BTC, ETH, US Equities, Bonds
• "keyTakeaway"    : 40-60 word concise summary — immediate trader bias, key technical levels to watch. No SL/TP/entry.

OUTPUT SCHEMA EXAMPLE (follow this EXACT structure):
{{SCHEMA_EXAMPLE}}

ADDITIONAL RULES:
• Markdown **bold**, *italic*, ***bold italic*** sirf "description" aur "keyTakeaway" fields mein use karo.
• JSON strings mein actual newline characters NAHI — sirf \\n (escaped) use karo.
• Koi "...", koi placeholder, koi empty string — ZERO tolerance.
• Har field mein real, specific, factual Hinglish content.
• "imageUrl" ka URL must be a real Unsplash photo that renders (starts with https://images.unsplash.com/photo-).

================================================================
ABSOLUTE FINAL RULE — NO EXCEPTIONS
================================================================
RESPONSE = \`\`\`json\n[ ... array of NewsItem objects ... ]\n\`\`\`
NOTHING BEFORE THE FIRST BACKTICK.
NOTHING AFTER THE LAST BACKTICK.
NO INTRO. NO EXPLANATION. NO "Here is the JSON". NO "I hope this helps".
JUST. THE. JSON. ARRAY. CODE. BLOCK.
================================================================`;
export function buildNewsUserMessageV5(date: string, session: string, candles: any, timeRange: TimeRange = "24h", selectedSymbols: string[], userTemplate: string = DEFAULT_DAILY_ANALYSIS_USER_TEMPLATE): string {
  const ts = new Date().toISOString();
  const candleBlock = formatCandlesForNewsPrompt(candles, selectedSymbols);

  const opt = TIME_RANGE_OPTIONS.find(o => o.value === timeRange) ?? TIME_RANGE_OPTIONS[4];
  const hours = opt.hours;

  const now = new Date();
  const tsIST = formatToISTString(now);
  const fromDate = new Date(now.getTime() - hours * 60 * 60 * 1000);
  const fromTsIST = formatToISTString(fromDate);

  const timeHinglish =
    timeRange === "3h"  ? "pichle 3 ghante" :
    timeRange === "6h"  ? "pichle 6 ghante" :
    timeRange === "12h" ? "pichle 12 ghante" :
    timeRange === "18h" ? "pichle 18 ghante" :
    timeRange === "24h" ? "pichle 24 ghante" :
    timeRange === "2d"  ? "pichle 2 din" :
    timeRange === "3d"  ? "pichle 3 din" :
                          "pichle ek hafte";

  const symbolList = selectedSymbols.join(", ");

  return renderTemplate(userTemplate, {
    DATE: date,
    SESSION_LABEL: SESSION_LABELS[session] ?? session,
    TS_IST: tsIST,
    TS: ts,
    FROM_TS_IST: fromTsIST,
    WINDOW_DISPLAY: opt.display,
    CANDLE_BLOCK: candleBlock,
    TIME_HINGLISH: timeHinglish,
    SYMBOL_LIST: symbolList,
    HUMAN_DATE: new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    SCHEMA_EXAMPLE: NEWS_POSTER_SCHEMA_EXAMPLE,
  });
}

export function buildNewsUserMessage(date: string, session: string, candles: any, timeRange: TimeRange = "24h", selectedSymbols: string[], userTemplate: string = DEFAULT_DAILY_ANALYSIS_USER_TEMPLATE): string {
  // V1 (full internet) uses the same NewsItem[] poster format — same function, different system prompt
  return buildNewsUserMessageV5(date, session, candles, timeRange, selectedSymbols, userTemplate);
}

// Assembles a caption + hashtag list into one paste-ready Instagram block —
// blank "." lines between them is the standard creator trick that pushes
// the hashtag block below the "...more" fold instead of cluttering the
// caption's visible preview.
export function buildInstagramCopyText(caption: string, hashtags: string[]): string {
  const cap = caption.trim();
  const tags = hashtags.map((h) => h.trim()).filter(Boolean).join(" ");
  if (!cap && !tags) return "";
  if (!tags) return cap;
  if (!cap) return tags;
  return `${cap}\n.\n.\n.\n.\n.\n${tags}`;
}
export function mapNewsReportToItems(parsed: any): NewsItem[] {
  const items: NewsItem[] = [];

  // 1. Overall Macro summary
  if (parsed.all_news_section) {
    items.push({
      title: parsed.all_news_section.headline || "Macro Market Summary",
      source: "MACRO NEWS",
      description: parsed.all_news_section.summary || "",
      imageUrl: parsed.all_news_section.high_impact_events?.[0]?.imageUrl || "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800",
      impact: "High",
      sentiment: "Neutral",
      affectedAssets: "Global Markets",
      keyTakeaway: "Overall macro trend and market sentiment."
    });

    // 2. High Impact Events
    if (Array.isArray(parsed.all_news_section.high_impact_events)) {
      for (const ev of parsed.all_news_section.high_impact_events) {
        items.push({
          title: ev.event_name || "High Impact Event",
          source: "HIGH IMPACT",
          description: ev.impact_explanation || "",
          imageUrl: ev.imageUrl || "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800",
          impact: "High",
          sentiment: "Neutral",
          affectedAssets: ev.market_impact ? ev.market_impact.map((m: any) => `${m.symbol} (${m.effect})`).join(", ") : "",
          keyTakeaway: ev.impact_explanation ? ev.impact_explanation.slice(0, 150) : ""
        });
      }
    }
  }

  // 3. Symbol wise news
  if (parsed.symbol_wise_news && typeof parsed.symbol_wise_news === "object") {
    for (const [symbol, info] of Object.entries<any>(parsed.symbol_wise_news)) {
      items.push({
        title: symbol,
        source: "MARKET NEWS",
        description: info.detailed_breakdown || "",
        imageUrl: info.imageUrl || "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800",
        impact: "High",
        sentiment: (info.sniper_note?.news_bias === "Bullish" || info.sniper_note?.news_bias === "Bearish" || info.sniper_note?.news_bias === "Neutral") ? info.sniper_note.news_bias : "Neutral",
        affectedAssets: symbol,
        keyTakeaway: info.trader_alert || ""
      });
    }
  }

  return items;
}
