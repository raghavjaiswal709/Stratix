// Static 30-day / 3x-daily content calendar (News / Learnings / Facts), Jul 15
// 2026 -> Aug 13 2026 — transcribed from the source planning doc. News has no
// per-day topic (it always pulls from the latest live news-analysis report),
// Learnings and Facts each carry a specific topic the calendar assigns for
// that day, used as a generation "topicHint" and shown verbatim in the
// copy-prompt flow.

export type LearningsPillar = "SMC" | "Crypto" | "PF" | "Recap";

export interface CalendarDayPlan {
  day: number;
  /** ISO yyyy-mm-dd */
  date: string;
  /** e.g. "Wed, Jul 15" */
  dateLabel: string;
  news: { topic: string };
  learnings: { pillar: LearningsPillar; topic: string };
  facts: { topic: string };
  /** Optional flag for high-traffic days (FOMC/NFP) surfaced in the UI. */
  note?: string;
}

const RAW: Array<{
  day: number;
  date: string;
  learningsPillar: LearningsPillar;
  learningsTopic: string;
  factsTopic: string;
  note?: string;
}> = [
  { day: 1, date: "2026-07-15", learningsPillar: "SMC", learningsTopic: "Order Blocks + Fair Value Gap (FVG) — what they are, how to spot them on a chart", factsTopic: "How gold has historically performed during past recessions" },
  { day: 2, date: "2026-07-16", learningsPillar: "Crypto", learningsTopic: "Bitcoin vs. Ethereum — which one to focus on this cycle, and why", factsTopic: "Where the terms \"Bull\" and \"Bear\" market actually come from" },
  { day: 3, date: "2026-07-17", learningsPillar: "SMC", learningsTopic: "Liquidity concepts explained simply — equal highs/lows and liquidity sweeps", factsTopic: "How many satoshis make up 1 Bitcoin (and why it's divisible that way)" },
  { day: 4, date: "2026-07-18", learningsPillar: "PF", learningsTopic: "7 tax-saving options every salaried person should know (FY2026)", factsTopic: "The Rupee–Dollar exchange rate, how it's moved over the decades" },
  { day: 5, date: "2026-07-19", learningsPillar: "SMC", learningsTopic: "CHoCH (Change of Character) — how to actually trade it", factsTopic: "What \"Smart Money\" really refers to institutionally" },
  { day: 6, date: "2026-07-20", learningsPillar: "Crypto", learningsTopic: "How Bitcoin's halving cycle actually works, and why the market prices it in early", factsTopic: "The largest single-day stock market crashes in history" },
  { day: 7, date: "2026-07-21", learningsPillar: "SMC", learningsTopic: "Market Structure basics — BOS vs. CHoCH", factsTopic: "Why Bitcoin's total supply is capped at 21 million" },
  { day: 8, date: "2026-07-22", learningsPillar: "PF", learningsTopic: "\"I have ₹10,000/month to invest\" — a beginner allocation strategy", factsTopic: "Compound interest, illustrated with one simple example" },
  { day: 9, date: "2026-07-23", learningsPillar: "SMC", learningsTopic: "Multi-timeframe analysis — combining higher and lower timeframes", factsTopic: "Why gold is measured in troy ounces, not regular ounces" },
  { day: 10, date: "2026-07-24", learningsPillar: "Crypto", learningsTopic: "Wallet security basics — hot vs. cold wallets, and the common scams that catch people out", factsTopic: "How many companies make up the Nifty 50" },
  { day: 11, date: "2026-07-25", learningsPillar: "SMC", learningsTopic: "Risk management rules every day trader must follow", factsTopic: "The story behind the term \"Blue Chip\" stocks" },
  { day: 12, date: "2026-07-26", learningsPillar: "PF", learningsTopic: "Credit score explained simply + how to improve it fast", factsTopic: "What a \"Black Swan\" event actually means in finance" },
  { day: 13, date: "2026-07-27", learningsPillar: "SMC", learningsTopic: "Building a trading plan that actually works", factsTopic: "Where the crypto term \"HODL\" actually came from" },
  { day: 14, date: "2026-07-28", learningsPillar: "Crypto", learningsTopic: "Solana vs. Ethereum — which ecosystem is actually stronger right now", factsTopic: "The difference between RBI's repo rate and reverse repo rate", note: "FOMC meeting begins" },
  { day: 15, date: "2026-07-29", learningsPillar: "SMC", learningsTopic: "FVG + Order Block confluence setups", factsTopic: "Why silver is called \"the poor man's gold\"", note: "FOMC decision ~11:30 PM IST" },
  { day: 16, date: "2026-07-30", learningsPillar: "PF", learningsTopic: "Using credit cards smartly without falling into debt", factsTopic: "The history behind the Dow Jones Industrial Average's name" },
  { day: 17, date: "2026-07-31", learningsPillar: "SMC", learningsTopic: "Advanced Order Block trading, walked through with real examples", factsTopic: "The origin of candlestick charting (Japanese rice traders)" },
  { day: 18, date: "2026-08-01", learningsPillar: "Crypto", learningsTopic: "Reading on-chain data 101 — what exchange inflows/outflows actually tell you", factsTopic: "What \"FOMO\" and \"FUD\" mean and where they came from in trading culture" },
  { day: 19, date: "2026-08-02", learningsPillar: "SMC", learningsTopic: "Trading during high-impact news events without getting stopped out", factsTopic: "How central banks actually decide interest rates (simplified)" },
  { day: 20, date: "2026-08-03", learningsPillar: "PF", learningsTopic: "Step-by-step guide to opening a demat account", factsTopic: "The story of the world's first stock exchange (Amsterdam, 1602)" },
  { day: 21, date: "2026-08-04", learningsPillar: "SMC", learningsTopic: "Risk-to-reward ratio — how it's actually used, not just theory", factsTopic: "Why forex is the largest financial market in the world by daily volume" },
  { day: 22, date: "2026-08-05", learningsPillar: "Crypto", learningsTopic: "What \"altcoin season\" actually means, and the signs it's starting", factsTopic: "What \"liquidity\" really means in markets, beyond just the SMC term" },
  { day: 23, date: "2026-08-06", learningsPillar: "SMC", learningsTopic: "Why most traders don't keep a trading journal (and why it costs them)", factsTopic: "The Rule of 72 — how to estimate how fast your money doubles", note: "Day before NFP" },
  { day: 24, date: "2026-08-07", learningsPillar: "PF", learningsTopic: "How to teach kids about money, age-wise", factsTopic: "NFP just dropped — quick-fire reaction: how Gold, Forex, and Crypto moved (post after 6 PM IST)", note: "NFP — data drops ~6:00 PM IST" },
  { day: 25, date: "2026-08-08", learningsPillar: "SMC", learningsTopic: "False breakouts — how to avoid getting trapped by them", factsTopic: "Why India's markets have circuit-breaker rules" },
  { day: 26, date: "2026-08-09", learningsPillar: "Crypto", learningsTopic: "Stablecoins explained — how they actually maintain their peg", factsTopic: "Inflation vs. deflation, explained with a real-world example" },
  { day: 27, date: "2026-08-10", learningsPillar: "SMC", learningsTopic: "ICT concepts — kill zones & session timing (London/NY/Asian)", factsTopic: "How gold ETFs work vs. owning physical gold" },
  { day: 28, date: "2026-08-11", learningsPillar: "PF", learningsTopic: "Retirement planning — how much should you have saved by 30/35", factsTopic: "What percentage of retail day traders are actually profitable long-term (verify the real figure before posting)" },
  { day: 29, date: "2026-08-12", learningsPillar: "SMC", learningsTopic: "Combining SMC with price action for higher-accuracy entries", factsTopic: "Market order vs. limit order — the difference explained simply" },
  { day: 30, date: "2026-08-13", learningsPillar: "Recap", learningsTopic: "Month 1 recap — every SMC + crypto concept covered, compiled into one saveable reference carousel", factsTopic: "30 facts, 30 days — a quick-fire recap carousel of everything from this month", note: "Calendar finale" },
];

function dateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export const CALENDAR_PLAN: CalendarDayPlan[] = RAW.map((r) => ({
  day: r.day,
  date: r.date,
  dateLabel: dateLabel(r.date),
  news: { topic: "Realtime analysis from the News Analysis page — latest filtered report, no fixed topic." },
  learnings: { pillar: r.learningsPillar, topic: r.learningsTopic },
  facts: { topic: r.factsTopic },
  note: r.note,
}));

export function getCalendarDay(dateIso: string): CalendarDayPlan | undefined {
  return CALENDAR_PLAN.find((d) => d.date === dateIso);
}

export const CALENDAR_START = CALENDAR_PLAN[0].date;
export const CALENDAR_END = CALENDAR_PLAN[CALENDAR_PLAN.length - 1].date;
