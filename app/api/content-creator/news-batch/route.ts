import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { NewsFilterReportModel } from "@/lib/models/NewsFilterReport";
import type { FilteredNewsItem } from "@/lib/news/news-filter";
import { fetchLiveContext } from "@/lib/content-creator/live-prices";

export const runtime = "nodejs";
export const maxDuration = 180;

// How many of the filter report's top items we show the curator model.
// Sorted by impact_score first, so this is "the best 120", not "the first 120".
// Raised alongside MIN_POSTERS below — a 15+ story floor needs a wider
// candidate pool to cluster from, or the model runs out of genuinely
// distinct stories before it hits the floor.
const MAX_CANDIDATES = 120;
const CURATOR_MODEL = "gpt-5.5-2026-04-23";
// Content cards only — the cover and outro are synthesized/parsed outside
// this range, so a full batch is MIN_POSTERS+2 to MAX_POSTERS+2 cards.
// 15 is a hard floor, not a suggestion — still curation-sized in spirit
// (duplicates still cluster into one card), but the batch must not ship
// thin. Only the "candidate pool genuinely has fewer than 15 non-duplicate
// stories" escape hatch in PART 1 allows falling short of it.
const MIN_POSTERS = 15;
const MAX_POSTERS = 20;

type PosterCategory = "Macro" | "Geopolitical" | "Corporate" | "Sentiment" | "Systemic";
const VALID_CATEGORIES = new Set<PosterCategory>(["Macro", "Geopolitical", "Corporate", "Sentiment", "Systemic"]);

interface InstrumentImpact {
  symbol: string;
  sentiment: "Bullish" | "Bearish" | "Neutral";
}

interface SimpleImpact {
  market: string;
  effect: string;
  direction: "up" | "down" | "neutral";
}

interface PosterCopy {
  title: string;
  description: string;
  keyTakeaway: string;
  affectedAssets: string;
  impact: "High" | "Medium" | "Low";
  sentiment: "Bullish" | "Bearish" | "Neutral";
  source: string;
  date: string;
  imagePrompt: string;
  imageUrl: string;
  /** Exact substring of `title` to highlight on the poster (the punchiest hook). */
  highlightPhrase: string;
  /** Exact substrings of `description` to color-highlight — the numbers/entities a trader's eye should catch first. */
  descriptionHighlights: string[];
  /** Per-instrument direction, independently tagged — rendered as chips on the poster. */
  instrumentImpacts: InstrumentImpact[];
  /** Which of the 5 market-driver categories this story belongs to — powers the selection UI. */
  category: PosterCategory;
  isCover?: false;
  /** ELI5 companion card — a kid-simple headline for the same story. */
  simpleHeadline: string;
  /** ELI5 companion card — exact substring of simpleHeadline to highlight. */
  simpleHeadlineHighlight: string;
  /** ELI5 companion card — 2-4 kid-simple sentences: what actually happened. */
  whatHappened: string;
  /** ELI5 companion card — 1-3 kid-simple sentences: why it matters, in plain terms. */
  whyItMatters: string;
  /** ELI5 companion card — which markets are affected and how, in plain language. */
  simpleImpacts: SimpleImpact[];
  /** Instagram-ready caption for THIS story posted on its own — distinct voice from the on-poster "description". */
  caption: string;
  /** 25+ hashtags: a fixed brand set (appended in code, not model-authored) plus deeply-researched, story-specific trending/relevant tags. */
  hashtags: string[];
}

interface CoverCopy {
  title: string;
  description: string;
  keyTakeaway: string;
  affectedAssets: string;
  impact: "High";
  sentiment: "Bullish" | "Bearish" | "Neutral";
  source: string;
  date: string;
  imagePrompt: string;
  imageUrl: string;
  highlightPhrase: string;
  descriptionHighlights: string[];
  instrumentImpacts: InstrumentImpact[];
  isCover: true;
  topAssets: InstrumentImpact[];
  bulletHeadlines: string[];
  /** Instagram-ready caption for the WHOLE carousel (this is slide 1). */
  caption: string;
  /** 25+ hashtags for the whole carousel — same brand-set + researched-tags composition as each story's. */
  hashtags: string[];
}

interface OutroCopy {
  title: string;
  description: string;
  cta: string;
  imagePrompt: string;
  imageUrl: string;
  isOutro: true;
}

// The whole feature lives or dies on this prompt: it must (1) curate like an
// editor, not summarize like an intern, and (2) produce image prompts specific
// enough that a text-to-image model returns a poster-ready editorial visual
// for THIS story, not generic "stock market" wallpaper.
function buildSystemPrompt(todayLabel: string, windowLabel: string, liveContext: string): string {
  return `You are the news curation and copywriting engine for "Stratix", a professional trading-education brand — covering Gold (XAUUSD), Silver (XAGUSD), major Forex pairs, Bitcoin, Ethereum, major indices, and macro/central-bank policy. You write like a working financial journalist on deadline, not like a template being filled in. Your Instagram/X news posters reach serious forex, gold, index and crypto traders who decide in under a second whether a post is worth stopping for.

You will receive a machine-pre-filtered market news feed (each item already tagged with tier 1-3, an impact_score 0-100, topic tags, and per-instrument sentiment). The feed covers: ${windowLabel}. Today is ${todayLabel}.

=== LIVE VERIFIED PRICES (ground truth — do not contradict) ===
${liveContext}
=== END LIVE VERIFIED PRICES ===

The quality bar for every part below is "front page of a top-tier financial desk", curated like a senior editor — not transcribed like an intern copying headlines.

━━━ PART 1 — CURATE (dedupe and cluster, do not transcribe) ━━━
YOUR JOB IS CURATION, NOT TRANSCRIPTION. Never output one card per headline you happen to see. Multiple headlines about the same underlying event or theme (five different articles about the same CPI print, four different angles on the same Bitcoin selloff, four stories all about the same Hormuz/oil escalation) must be CLUSTERED into a single card, or at most two cards if the theme is genuinely large enough to need a "cause" card and a separate "market reaction" card.

Select ${MIN_POSTERS}-${MAX_POSTERS} DISTINCT stories, spanning the last 24 hours — no two cards may share the same core catalyst. ${MIN_POSTERS} IS A HARD FLOOR, NOT A TARGET: this batch must ship with at least ${MIN_POSTERS} cards. If clustering leaves you short, widen your net before cutting the count — pull in Medium and Low-impact stories you'd otherwise skip, split a genuinely two-sided theme into its "cause" and "market reaction" cards per the clustering rule below, and cover every one of the 5 categories rather than stopping once the obvious headline stories are used up. Before including a card, apply this test: if this card were removed, would the reader lose real new information, or just see a rephrasing of a card they already saw? If it's just a rephrasing, cut it or fold its extra numbers into the existing card's description instead of giving it its own slot. Only go below ${MIN_POSTERS} in the genuinely rare case where the candidate pool contains fewer than ${MIN_POSTERS} non-duplicate, real-consequence stories total after merging — not because the top stories ran out first.

CLUSTERING EXAMPLE (apply this exact logic): if the feed contains "CPI Lands As Fed Hike Bets Climb", "Waller Warns Hot CPI Could Force Hike", "BofA Flags CPI Risk In EUR/JPY", and "Goldman Warns On More Rate Hikes" — these are ONE story (hot CPI raising hike odds) told four times. Merge into a single card: title built around the CPI print itself, with the Fed-speaker warnings and bank calls folded into the description as supporting color, not spun into their own separate cards. Apply the same discipline to any other cluster (a selloff reported by four different angles, a geopolitical event reported by four different consequences).

Every story MUST be classified into exactly one of these 5 market-driver categories (this becomes the "category" field per poster) — and your selection must actively cover multiple categories when the candidate pool contains genuine examples of each, not just cluster around 1-2 categories:

1. MACRO — interest rate decisions, inflation (CPI/PPI), GDP, employment data (NFP, unemployment), currency/FX moves, commodity prices (oil, gold, copper).
2. GEOPOLITICAL — wars/armed conflicts, trade wars/tariffs, elections/political instability, sanctions, international agreements (climate, trade).
3. CORPORATE — earnings reports, M&A, leadership changes, product launches/innovation (AI chips, drug trials), scandals/lawsuits/regulatory fines.
4. SENTIMENT — fear/greed swings, analyst upgrades/downgrades from major banks, retail-driven moves (social-media-coordinated squeezes), consumer confidence surveys.
5. SYSTEMIC — algorithmic/HFT-driven volatility or flash-crash-style moves, options/derivatives expiration events, liquidity crunches, natural disasters or pandemics disrupting markets.

Selection rules, in priority order:
1. Real market consequence first: rate decisions, inflation/jobs surprises, central-bank guidance shifts, geopolitical escalations with market transmission, major crypto/regulatory rulings, earnings surprises, systemic liquidity events — over noise, previews, and opinion pieces. Cut low-impact filler entirely (a single-company lawsuit rated Low impact, a small-business sentiment survey, a minor product note) rather than including it to pad the count.
2. MERGE duplicates per the clustering rule above — this is the single most important rule in this section. Never output two cards about the same event.
3. Category coverage: hunt through the candidate pool for genuine examples of each category before finalizing — prioritize diversity over piling up a 5th near-duplicate Macro story.
4. Theme diversity within a category: no more than 2 cards on the exact same narrow theme even after clustering, so the batch reads like a balanced front page, not one obsession replayed twice.
5. Prefer stories carrying concrete numbers (bps, %, price levels, dates) and near-term catalysts a trader can position around — but see the NUMBER-ACCURACY RULE below before citing any of them.
6. NEVER invent or pad with filler to hit the count — every card must trace back to a real item in the candidate feed. But do not stop early either: ${MIN_POSTERS} genuinely distinct stories is the floor, so if the obvious high-impact headlines run out before ${MIN_POSTERS}, keep going into Medium and Low-impact real stories rather than shipping a thin batch.
Order the final array by trader importance, most important first.

━━━ NUMBER-ACCURACY RULE (non-negotiable, applies to every card and the cover) ━━━
The LIVE VERIFIED PRICES block above is pulled live from Binance (BTC/ETH), gold-api.com (XAUUSD/XAGUSD), and open.er-api.com (forex majors) — it is the source of truth, not a scraped headline's number. Never state a specific price level, percentage move, or dollar figure for gold, silver, forex majors, BTC, or ETH unless it is consistent with that block. If a candidate item's number conflicts with the live block, prefer the live block or omit the figure. If a number (a price level, a specific level for an instrument not in the live block) can't be verified against either the live block or a clearly-dated data release in the candidate feed (CPI print, NFP number, a stated bps decision), omit it or phrase the point without it instead of estimating or carrying over an unverified figure.

━━━ PART 2 — POSTER COPY (per selected story) ━━━

VOICE — sound like a person who filed this five minutes ago, not a model:
BANNED WORDS/PHRASES (if you catch yourself writing these, stop and rewrite the sentence): "in today's [x] landscape," "it's important to note/remember," "furthermore," "moreover," "additionally" as a sentence-opener, "boasts," "showcases," "underscores," "highlights," "plays a crucial/key role," "navigate the complexities of," "unprecedented," "leverage" as a verb, "robust," "seamless," "dynamic," "cutting-edge," "delve into," "dive into," "realm," "testament to," "when it comes to," "in conclusion." Also banned: "in a significant development," "experts/analysts believe," "this comes amid/as," "sent shockwaves," "market participants," "only time will tell." These are the words every AI model reaches for by default — banning them forces an actual choice instead of an autocomplete.
RHYTHM: vary sentence length hard. A 4-word sentence next to an 18-word one reads like a person thinking. Three sentences in a row of similar length and structure is the single biggest tell that something was templated — if that happens, break the pattern.
VERBS DO THE WORK: never use a flat verb where a precise one exists. Not "prices declined" — "gold slid," "oil ripped higher," "the dollar stalled," "bitcoin buckled." One sharp, accurate verb beats three adjectives stacked in front of a boring one.
NO HEDGE-STACKING: one hedge per sentence, maximum. "This may potentially suggest a possible shift" is three hedges doing the work of zero — pick the single most honest level of certainty and state it plainly. Confidence about the *fact*, appropriate uncertainty only about the *outcome* — "Brent broke $86" is a fact, state it flatly; "this keeps oil biased higher" is a read, hedge that part only.
THE DUPLICATE TEST: before finalizing a card, ask — could this exact sentence appear unchanged in a Bloomberg alert, a Reuters wire, and a random finance newsletter, all on the same day? If yes, it's generic filler — cut it or make it specific to today's actual number, name, or event. Specificity is the opposite of AI-flatness.
ADAPT TONE TO THE STORY: a Fed testimony reads differently than a tanker strike — never force every story through the same sentence template. And never open a card with a phrase or sentence shape you'd reach for by default on every batch — vary the opening move story to story so the batch doesn't read like one voice repeating itself.
- "title": ≤ 60 characters. Punchy headline case. Lead with the actor or the number ("Fed Holds at 5.50%, Signals One Cut"). No clickbait, no emoji, no ALL-CAPS words. Read it out loud — if it sounds like a headline generator wrote it, cut the filler words and lead harder with the number or the verb.
- "highlightPhrase": the single most attention-grabbing chunk of "title" — the actor, the number, or the shock word (e.g. for title "Fed Holds at 5.50%, Signals One Cut" → highlightPhrase "Fed Holds at 5.50%"). MUST be an exact, case-sensitive, contiguous substring of "title" (copy-paste it out of the title, don't paraphrase). Keep it short: 1-4 words, never the whole title.
- "description": 2-3 sentences, ≤ 320 characters, wire-service tone, written as the trader-relevant EXPLANATION that renders directly on the poster below the headline — this is not filler, it is the single paragraph that tells a trader everything they need in 5 seconds. Concrete facts and numbers only: what happened, the key figure vs expectation/prior, and the immediate market reaction if known. No hype words ("massive", "shocking").
- "descriptionHighlights": array of 2-5 SHORT exact substrings copied verbatim, character-for-character, out of "description" — the numbers, percentages, price levels, and key entity/instrument names a trader's eye should snag on first while skimming (e.g. ["18,200 jobs", "6.5%", "10,000 expected", "Bank of Canada"]). Never a full sentence, never the whole description. Each string MUST appear exactly as written inside "description".
- "keyTakeaway": exactly ONE sentence — the "so what" for a trader: direction, asset, and the catalyst or level to watch. Written as desk guidance, e.g. "Dollar strength pressures Gold below 2,350 while real yields hold above 2%."
- "affectedAssets": comma-separated instrument symbols, most affected first, e.g. "XAUUSD, DXY, US500". 1-4 symbols.
- "category": exactly one of "Macro" | "Geopolitical" | "Corporate" | "Sentiment" | "Systemic" — from the taxonomy in PART 1. Pick the single best fit even if a story could arguably span two.
- "instrumentImpacts": array of {"symbol": one of the affectedAssets symbols, "sentiment": "Bullish"|"Bearish"|"Neutral"} — EVERY symbol in affectedAssets, each independently tagged for how THIS specific story moves it (never a lazy copy of one sentiment across all — a USD-positive story is typically XAUUSD-negative, not both Bullish). This renders as a colored chip row on the poster, so accuracy here is directly user-facing.
- "impact": "High" | "Medium" | "Low" — from the story's real market consequence.
- "sentiment": "Bullish" | "Bearish" | "Neutral" — for the FIRST asset in affectedAssets specifically (must match its entry in instrumentImpacts). This also drives the poster's overall color treatment — "Bearish" renders in red as a risk warning, so only mark Bearish when the news is genuinely adverse for that instrument's long side.
- "source": the original source name.
- "date": human-readable publish date like "Jul 10, 2026" (derive from the item's pubDate; fall back to today).

━━━ PART 2.5 — BENTO EXPLAINER (per selected story, companion card) ━━━
Every story ALSO gets a "explain it simply" companion card — a bento-grid layout a total beginner (genuinely, a curious 10-year-old) could read and fully understand, with zero trading jargon. This is not a dumbed-down repeat of the same sentences — translate the mechanic itself into plain cause-and-effect language.
RULES: no jargon left unexplained (if you must use a term like "interest rate" or "inflation", define it in the same breath in one plain clause); short sentences; concrete everyday comparisons where they help ("like a store raising prices"); never condescending, never baby-talk, never emoji-stuffed — just genuinely simple, clear English. Still 100% accurate to the real story — simplifying the language, never the facts.
- "simpleHeadline": ≤ 60 characters, the story in plain words a kid would say out loud, e.g. "Prices Are Going Up Faster Than Expected". No jargon, no ticker symbols.
- "simpleHeadlineHighlight": the punchiest 1-4 word exact substring of "simpleHeadline".
- "whatHappened": 2-4 short sentences explaining, in plain language, what actually happened — as if explaining to someone who has never heard of this before today.
- "whyItMatters": 1-3 short sentences on why this is a big deal, in real-world terms (jobs, prices, savings, everyday money) rather than trader terms.
- "simpleImpacts": array of 2-4 {"market": plain-English name of a market or thing people know, e.g. "Gold", "The US Dollar", "Stock Prices", "Bitcoin" — not a ticker symbol; "effect": one short plain-language phrase of what this means for it, e.g. "may become more expensive to buy"; "direction": "up"|"down"|"neutral"} — must be consistent with the story's real instrumentImpacts/sentiment above, just re-explained in plain words.

━━━ PART 2.6 — INSTAGRAM CAPTION + HASHTAGS (per selected story) ━━━
Every story ALSO ships a ready-to-post Instagram package — a caption and a hashtag set — written for the caption field of an actual Instagram post, NOT a repeat of the on-poster "description" (that one is wire-service tone for the image itself; this one is social-voice for the text underneath it).

"caption" — write like a trader who actually has followers, not a press release:
- Open with a hook in the first 1-2 lines. Instagram truncates captions after roughly 125 characters before showing "more" — the hook must land before that cut, so front-load the single most interesting fact or question, never a throat-clearing intro.
- 2-4 short sentences, conversational, first-or-second-person voice ("Here's what just happened...", "This is why your gold trades might move today") — not the same formal tone as the poster copy above.
- Reference the concrete fact or number from the story so the caption stands on its own without needing the image.
- At most 2-3 well-placed emoji, and only if they genuinely fit the story's tone — omit them entirely for a serious or bearish story rather than forcing one in.
- End with exactly ONE soft engagement line — a question, a "save this for later", a light opinion prompt — never a hard sales pitch, never guaranteed-outcome language.
- Do NOT put hashtags inside "caption" — they belong only in the separate "hashtags" field below.

"hashtags" — do a genuine deep-research pass, like a social-media growth strategist planning reach for a finance/trading account posting about this exact story right now, not a lazy copy-paste of #trading #crypto #forex on every card. Produce 18-22 hashtags for THIS story specifically, thinking through three tiers and blending all three (never just dump 20 broad tags):
1. BROAD reach tags (4-6) — high-volume, high-competition finance/trading tags relevant to the story's asset class (e.g. #Trading, #StockMarket, #Crypto, #Forex, #Gold, #Investing) — pick whichever actually fit THIS story's instruments, not a fixed list repeated every time.
2. NICHE/MID tags (8-10) — more targeted, lower-competition tags a real trader account would reach for on this specific theme (e.g. #ForexTrader, #GoldTrading, #CryptoNews, #DayTrading, #SwingTrading, #MacroEconomics) — matched to the story's actual category and instruments.
3. STORY-SPECIFIC / TRENDING-NOW tags (4-6) — tied to the exact event, instrument, or entity named in this story (e.g. #FOMC, #CPIReport, #XAUUSD, #BTC, #FederalReserve, #NFP, #OOTT — whatever this headline is actually about). These are what separate a real hashtag strategy from a template — they must change story to story, never reused verbatim across cards.
Formatting rules: every tag starts with "#", no spaces inside a tag, no punctuation besides the tag text itself, CamelCase or lowercase (whichever reads cleanest), no duplicates, and never a spammy engagement-bait tag (#follow4follow, #likeforlike, #f4f and equivalents are forbidden). Do not invent a fixed brand hashtag block yourself — a consistent brand hashtag set is appended automatically outside your output, so spend the full 18-22 on tags that are genuinely researched and specific to this story.

━━━ PART 3 — "imagePrompt" (THE MOST IMPORTANT FIELD) ━━━
Write a self-contained prompt for an AI image generator (Grok Imagine) that produces a BOLD, scroll-stopping, high-energy social poster background for THIS story — think viral finance-Instagram thumbnail, not a moody corporate-thriller still. The single biggest failure mode is a desaturated, tucked-in-the-corner, "premium editorial photography" image that reads as calm stock photography — that is WRONG. Every image must be immediately, unmistakably about THIS story's actual subject, rendered BIG, CENTERED, VIVID, and SATURATED. Build every prompt with this exact formula, as ONE flowing paragraph of 60-90 words:
1. SUBJECT — one concrete, instantly recognizable visual anchor for the STORY ITSELF, filling the frame as the hero, not a small prop in a corner. Prefer a bold physical object or symbol over an establishing shot: for crypto → a giant photorealistic Bitcoin/Ethereum coin catching hard light, rendered like a 3D product shot, not a distant object on a table; for gold/metals → a massive stack of gold bars or a single bar filling most of the frame, light blazing off the edges; for forex/currency → a dramatic close-up of banknotes fanned or torn, or a national flag rendered bold and graphic; for oil → a supertanker or rig shot from a dramatic low angle filling the frame, or a barrel with liquid catching hard light; for central-bank/policy stories → the institution's building shot dramatically from below with bold sky contrast, or its official seal/currency rendered large and graphic; for a company story → that company's real product or logo-bearing storefront, shot big and bold. NEVER a real, named, identifiable public figure's face or likeness (no depicting Fed officials, politicians, CEOs, or any specific real person) — use the institution, object, or symbol instead, every time.
2. GRAPHIC PUNCH (MANDATORY) — treat this like a bold piece of finance-content design, not a quiet photograph: allow a large graphic device when it fits — a giant "▲"/"▼" direction arrow, a bold stamp-style graphic (e.g. a red "ALERT" or "BREAKING" seal shape, no literal legible letters though — see rule 8), a dramatic light burst or glow radiating from the subject, a stock-chart line rendered as a bold glowing 3D ribbon arcing through the frame. Use at least one such device per image tied to the story's actual direction/sentiment.
3. SETTING & MOOD — punchy and immediate: dramatic, urgent, exciting, or ominous — never calm, never "premium magazine," never a quiet establishing shot.
4. LIGHTING — high-contrast and dramatic: hard rim light, a single blazing highlight, or saturated colored gel light (emerald for bullish, red for bearish) raking across the subject.
5. COLOR GRADE — SATURATED, not muted: bullish → vivid emerald-green glow and warm gold; bearish → vivid blood-red glow and dark steel; neutral/policy → bold amber and graphite with real contrast, never flat gray. Colors should pop the way a thumbnail needs to, not fade into the background.
6. COMPOSITION — subject fills 60-80% of the frame, close and bold, not a small object in a big empty scene; some clean negative space only at the very top for a headline overlay; 4:5 portrait framing.
7. STYLE — "hyper-detailed 3D render or dramatic photorealistic product photography, bold studio lighting, vivid color, ultra-detailed, 8k" — favor whichever suits the subject (a coin/gold bar/product reads best as a dramatic 3D render; a building/tanker/vehicle reads best as bold photography).
8. ALWAYS end with exactly: "No real people, no faces, no legible text, no words, no letters, no numbers, no logos, no watermarks."
Every imagePrompt must be UNIQUE to its story, and no two consecutive image prompts in the batch may reuse the same subject type or composition — if two prompts could be swapped between posters without anyone noticing, they are too generic. Rewrite until each one could only belong to its own headline.

━━━ PART 4 — COVER SLIDE ("summary") ━━━
This is the FIRST slide of the carousel — a masthead, not a social graphic. It should read like a magazine cover: clean, premium, uncluttered, over a calm cinematic financial/economic background. Write:
- "title": the masthead is fixed — it always renders as "News That Can Impact Your Trades" with today's date beneath it, so you don't need to write this field at all (any value you provide is ignored).
- "highlightPhrase": the punchiest 1-3 word exact substring of "News That Can Impact Your Trades" to highlight — e.g. "Impact Your Trades".
- "overview": 2-3 sentences synthesizing the THROUGHLINE across the selected stories — the dominant macro narrative of the window (e.g. "risk-off tone dominates as..."), not a list restating each headline. This renders on the poster as the trader-relevant explanation, so it must be information-dense, not vague.
- "overviewHighlights": array of 2-5 SHORT exact substrings copied verbatim out of "overview" — same rule as descriptionHighlights below: the concrete numbers/entities a trader should catch first.
- "marketBias": one sentence on the market's overall state right now — the net directional read across majors/gold/crypto, e.g. "Dollar firm, Gold pressured, risk assets cautious into the weekend."
- "topAssets": array of up to 4 {"symbol": one of the affectedAssets symbols used across your selected posters, "sentiment": "Bullish"|"Bearish"|"Neutral"} — the instruments most in play right now, ranked by relevance, independently tagged (not all the same sentiment unless genuinely true).
- "bulletHeadlines": 3-5 bullets MAXIMUM (never more), framed as "key moments to watch before you trade today" — each a genuinely distinct catalyst (no two near-duplicates of each other), ranked by how much it could move price today. This is a curated shortlist, not a restatement of every card in the batch.
- "imagePrompt": follow the same bold formula as Part 3 — one single, huge, striking global-markets symbol filling most of the frame: a giant glowing 3D globe with financial-hub cities connected by bold light-trails, a massive stack of gold bars and banknotes fanned dramatically, or an oversized glowing stock-chart ribbon arcing across the frame. Vivid and saturated, not a calm skyline photo — this is the masthead's visual hook, so it must hit as hard as any story card. Same "no real people" rule, color grade tied to the overall marketBias (bullish emerald glow / bearish red glow / neutral bold amber), NOT tied to any single story.
- "caption": the Instagram caption for the WHOLE carousel (this cover is slide 1 of the post) — same voice/hook/length/emoji/engagement-line rules as PART 2.6's "caption", but synthesizing the batch's overall throughline instead of one story, e.g. "Five stories moved markets in the last 24 hours — here's what actually matters before the next session." No hashtags inside it.
- "hashtags": 18-22 hashtags for the WHOLE carousel, same three-tier deep-research method and formatting rules as PART 2.6 — broad market-wide tags plus the batch's dominant themes/instruments, not any single story's niche tags. Same "no fixed brand block, no spammy tags" rules apply.

━━━ PART 5 — OUTRO SLIDE ("outro") ━━━
This is the LAST slide of the carousel, after every story card — a calm, confident sign-off, not another news item. It must NOT continue the tense/crisis mood of the story cards. Tone: professional, trustworthy, confident — not salesy, no exclamation-mark energy, no guaranteed-outcome language. Write:
- "subtext": ≤ 240 characters total. Must include, close to verbatim, both of these two lines in this order: "We share real-time market news before every trading session." and "You might not find this page again — follow now to stay ahead." Those two lines alone already run ~130 characters — add AT MOST one short clause of fresh supporting copy (5-10 words, not a full extra sentence) between or around them, drawing on a different angle each batch (why following matters before the open, the educational value, staying consistently informed, sharper market awareness). Keep it tight: the two required lines must always survive intact, never get crowded out by supporting copy. No guaranteed-return or advice-like language ("you will profit", "guaranteed gains" are banned).
- "headline": a short line (≤ 50 characters) that leads naturally into the two lines above — vary the angle and wording every time this prompt runs, don't reuse the same phrase batch to batch.
- "cta": a single short action phrase, rotating batch to batch rather than always the same one — pick ONE of: "Follow for daily market briefings", "Save this post for your next session", "Turn on notifications so you never miss a move", or an equivalent fresh phrase in that spirit.
- "imagePrompt": follow the same bold formula as Part 3, but confident and triumphant rather than tense — NOT a crisis scene. Think: a huge glowing chart-line ribbon sweeping upward and out of frame like a comet trail, a giant gold bar or Bitcoin coin bathed in warm victorious light, a bold sunrise-colored globe — still big, vivid, and saturated, just a "we've got this" mood instead of alarm. Warm amber/emerald color grade, same "no real people" rule, same composition and closing sentence as Part 3.

━━━ OUTPUT ━━━
Return STRICTLY a JSON object of this exact shape — no markdown fences, no commentary, no extra keys:
{
  "summary": { "title": "...", "highlightPhrase": "...", "overview": "...", "overviewHighlights": ["..."], "marketBias": "...", "topAssets": [{"symbol":"...","sentiment":"..."}], "bulletHeadlines": ["..."], "imagePrompt": "...", "caption": "...", "hashtags": ["#...", "#..."] },
  "posters": [ { "title": "...", "highlightPhrase": "...", "description": "...", "descriptionHighlights": ["..."], "keyTakeaway": "...", "affectedAssets": "...", "instrumentImpacts": [{"symbol":"...","sentiment":"..."}], "impact": "...", "sentiment": "...", "source": "...", "date": "...", "imagePrompt": "...", "category": "...", "simpleHeadline": "...", "simpleHeadlineHighlight": "...", "whatHappened": "...", "whyItMatters": "...", "simpleImpacts": [{"market":"...","effect":"...","direction":"..."}], "caption": "...", "hashtags": ["#...", "#..."] } ],
  "outro": { "headline": "...", "subtext": "...", "cta": "...", "imagePrompt": "..." }
}`;
}

function clampStr(v: unknown, max: number, fallback = ""): string {
  return typeof v === "string" ? v.trim().slice(0, max) : fallback;
}

// The model is instructed to copy-paste highlightPhrase out of title, but
// LLMs occasionally paraphrase anyway — if it isn't a real substring, the
// poster renderer has nothing to highlight, so fall back to leading words.
function resolveHighlight(title: string, candidate: string): string {
  if (candidate && title.includes(candidate)) return candidate;
  const words = title.split(" ");
  return words.slice(0, Math.min(3, words.length)).join(" ");
}

// Same idea for the paragraph-level highlight terms, but there can be
// several — silently drop any the model paraphrased instead of copy-pasting,
// rather than rendering a highlight for text that doesn't actually appear.
function resolveDescriptionHighlights(text: string, candidates: unknown): string[] {
  if (!Array.isArray(candidates)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const term = c.trim();
    if (!term || term.length > 60 || !text.includes(term) || seen.has(term)) continue;
    seen.add(term);
    out.push(term);
    if (out.length >= 5) break;
  }
  return out;
}

function resolveInstrumentImpacts(candidates: unknown, validSentiments: Set<string>, fallbackAssets: string, fallbackSentiment: string): InstrumentImpact[] {
  const fromModel = Array.isArray(candidates)
    ? (candidates as unknown[])
        .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
        .map((a) => ({
          symbol: clampStr(a.symbol, 12).toUpperCase(),
          sentiment: validSentiments.has(a.sentiment as string) ? (a.sentiment as InstrumentImpact["sentiment"]) : "Neutral",
        }))
        .filter((a) => a.symbol)
        .slice(0, 4)
    : [];
  if (fromModel.length > 0) return fromModel;

  // Fallback: derive from the comma-separated affectedAssets string, all
  // tagged with the story's single overall sentiment.
  return fallbackAssets
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 4)
    .map((symbol) => ({ symbol, sentiment: (validSentiments.has(fallbackSentiment) ? fallbackSentiment : "Neutral") as InstrumentImpact["sentiment"] }));
}

const VALID_DIRECTION = new Set(["up", "down", "neutral"]);

// Same "model output, else derive from the real fields" pattern as
// resolveInstrumentImpacts above — the bento card must never contradict the
// story's actual sentiment, just re-explain it in plain words.
function resolveSimpleImpacts(candidates: unknown, fallbackAssets: string, fallbackSentiment: string): SimpleImpact[] {
  const fromModel = Array.isArray(candidates)
    ? (candidates as unknown[])
        .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
        .map((a) => ({
          market: clampStr(a.market, 40),
          effect: clampStr(a.effect, 80),
          direction: VALID_DIRECTION.has(a.direction as string) ? (a.direction as SimpleImpact["direction"]) : "neutral",
        }))
        .filter((a) => a.market && a.effect)
        .slice(0, 4)
    : [];
  if (fromModel.length > 0) return fromModel;

  const direction: SimpleImpact["direction"] = fallbackSentiment === "Bullish" ? "up" : fallbackSentiment === "Bearish" ? "down" : "neutral";
  const effect = direction === "up" ? "may become more valuable" : direction === "down" ? "may lose some value" : "may not move much";
  return fallbackAssets
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((symbol) => ({ market: symbol, effect, direction }));
}

// Fixed, always-included brand hashtags — guarantees every poster's set
// stays brand-consistent even though the model's own 18-22 tags are
// researched fresh per story (see PART 2.6 of the system prompt above).
const COMMON_HASHTAGS = ["#Stratix", "#Trading", "#ForexTrading", "#TradingSignals", "#FinancialMarkets", "#MarketNews", "#TradingCommunity"];

// Pads a story up to the 25+ hashtag floor if the model's own count came in
// short — keyed by the same 5-category taxonomy PART 1 uses, so even the
// fallback path stays topically relevant rather than generic filler.
const CATEGORY_HASHTAG_POOL: Record<PosterCategory, string[]> = {
  Macro: ["#Inflation", "#InterestRates", "#FederalReserve", "#Economy", "#USD", "#Gold", "#XAUUSD", "#Forex", "#CentralBank", "#Recession"],
  Geopolitical: ["#Geopolitics", "#OilPrices", "#Sanctions", "#GlobalMarkets", "#Crude", "#SafeHaven", "#RiskOff", "#EnergyMarkets", "#WarRisk", "#GoldPrice"],
  Corporate: ["#Earnings", "#StockMarket", "#WallStreet", "#Stocks", "#Investing", "#CorporateNews", "#EquityMarkets", "#NYSE", "#Nasdaq", "#MarketMovers"],
  Sentiment: ["#RiskSentiment", "#MarketSentiment", "#TraderPsychology", "#BullMarket", "#BearMarket", "#RetailTraders", "#MarketMood", "#FearAndGreed", "#SmartMoney", "#PriceAction"],
  Systemic: ["#Volatility", "#Liquidity", "#Options", "#Derivatives", "#MarketRisk", "#FlashCrash", "#AlgoTrading", "#SystemicRisk", "#MarketStructure", "#TradingRisk"],
};
const GENERIC_HASHTAG_POOL = ["#Trading", "#Crypto", "#Forex", "#Investing", "#StockMarket", "#Bitcoin", "#Gold", "#FinancialNews", "#TradingLife", "#MoneyMoves"];

const HASHTAG_TARGET = 25;
const HASHTAG_MAX = 30;

// A model-provided tag must start with "#", contain no internal whitespace
// or stray punctuation, and be a sane length — anything else is dropped
// rather than rendered broken.
function isValidHashtag(v: unknown): v is string {
  return typeof v === "string" && /^#[A-Za-z0-9_]{2,40}$/.test(v.trim());
}

// Merges the model's researched, story-specific hashtags with the fixed
// brand set, dedupes case-insensitively, and pads with topically-relevant
// fallbacks if the model came in short of the 25+ floor — a guarantee the
// prompt's instructions alone can't make reliably across a whole batch.
function resolveHashtags(candidates: unknown, category?: PosterCategory): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (tag: string) => {
    const key = tag.toLowerCase();
    if (seen.has(key) || out.length >= HASHTAG_MAX) return;
    seen.add(key);
    out.push(tag);
  };

  for (const tag of COMMON_HASHTAGS) add(tag);

  if (Array.isArray(candidates)) {
    for (const c of candidates) {
      const raw = typeof c === "string" ? c.trim() : "";
      const normalized = raw && !raw.startsWith("#") ? `#${raw}` : raw;
      if (isValidHashtag(normalized)) add(normalized);
    }
  }

  const pool = (category && CATEGORY_HASHTAG_POOL[category]) || GENERIC_HASHTAG_POOL;
  for (const tag of [...pool, ...GENERIC_HASHTAG_POOL]) {
    if (out.length >= HASHTAG_TARGET) break;
    add(tag);
  }

  return out;
}

function resolveCaption(candidate: unknown, fallback: string): string {
  return clampStr(candidate, 500) || fallback;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  let body: { reportId?: string; previewOnly?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body is fine — use latest report */ }

  // Kick off the live-price snapshot alongside the DB report fetch — it's
  // pure network I/O with no dependency on the report, so there's no reason
  // to serialize it after the DB round trip.
  const liveContextPromise = fetchLiveContext();

  await dbConnect();
  const report = body.reportId
    ? await NewsFilterReportModel.findById(body.reportId).lean()
    : await NewsFilterReportModel.findOne({}).sort({ generatedAt: -1 }).lean();

  if (!report) {
    return NextResponse.json(
      { error: "No filtered news report found. Generate one on the News Sentiment page (Filter tab) first." },
      { status: 404 }
    );
  }

  const analyzed: FilteredNewsItem[] = Array.isArray((report as { data?: { analyzed_news?: FilteredNewsItem[] } }).data?.analyzed_news)
    ? (report as { data: { analyzed_news: FilteredNewsItem[] } }).data.analyzed_news
    : [];
  if (analyzed.length === 0) {
    return NextResponse.json({ error: "The latest filter report contains no kept news items." }, { status: 400 });
  }

  // Feed the curator only the strongest candidates — impact-sorted, trimmed to
  // the fields it needs, so 300 kept headlines never blow the token budget.
  const candidates = [...analyzed]
    .sort((a, b) => (b.impact_score ?? 0) - (a.impact_score ?? 0))
    .slice(0, MAX_CANDIDATES)
    .map((n) => ({
      headline: n.headline,
      source: n.source,
      pubDate: n.pubDate,
      tier: n.tier,
      tags: n.tags,
      impact_score: n.impact_score,
      affected_instruments: n.affected_instruments,
    }));

  const todayLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const windowLabel = (report as { timeRangeLabel?: string }).timeRangeLabel ?? "recent market news";
  const liveContext = await liveContextPromise;
  const systemPrompt = buildSystemPrompt(todayLabel, windowLabel, liveContext);
  const userMessage = `Here are the ${candidates.length} strongest pre-filtered news items. Curate, write the poster copy, and craft the image prompts:\n${JSON.stringify(candidates)}`;

  if (body?.previewOnly) {
    return NextResponse.json({ systemPrompt, userMessage });
  }

  const openai = new OpenAI({ apiKey });
  let raw = "";
  try {
    const response = await openai.chat.completions.create({
      model: CURATOR_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: userMessage,
        },
      ],
      // No `temperature` override — this model only supports its default (1).
      // 60000 covers a 15-20 card batch (each card now also carries the full
      // ELI5 bento field set) plus cover/outro copy, with headroom for this
      // reasoning-tier model's internal reasoning tokens before it ever
      // writes the response.
      max_completion_tokens: 60000,
      response_format: { type: "json_object" },
    });
    raw = response.choices[0]?.message?.content ?? "";
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI curation call failed" },
      { status: 502 }
    );
  }

  let parsed: { posters?: unknown; summary?: unknown; outro?: unknown };
  try {
    const fence = raw.match(/```json\s*([\s\S]*?)```/);
    parsed = JSON.parse(fence ? fence[1].trim() : raw);
  } catch {
    return NextResponse.json({ error: "AI returned unparseable JSON — try again." }, { status: 502 });
  }

  const rawPosters = Array.isArray(parsed.posters) ? parsed.posters : [];
  const VALID_IMPACT = new Set(["High", "Medium", "Low"]);
  const VALID_SENTIMENT = new Set(["Bullish", "Bearish", "Neutral"]);

  const posters: PosterCopy[] = rawPosters
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => {
      const title = clampStr(p.title, 90);
      const description = clampStr(p.description, 400);
      const sentiment = VALID_SENTIMENT.has(p.sentiment as string) ? (p.sentiment as PosterCopy["sentiment"]) : "Neutral";
      const affectedAssets = clampStr(p.affectedAssets, 80);
      const keyTakeaway = clampStr(p.keyTakeaway, 240);
      const simpleHeadline = clampStr(p.simpleHeadline, 70) || title;
      const category: PosterCategory = VALID_CATEGORIES.has(p.category as PosterCategory) ? (p.category as PosterCategory) : "Macro";
      return {
        title,
        highlightPhrase: resolveHighlight(title, clampStr(p.highlightPhrase, 60)),
        description,
        descriptionHighlights: resolveDescriptionHighlights(description, p.descriptionHighlights),
        keyTakeaway,
        affectedAssets,
        instrumentImpacts: resolveInstrumentImpacts(p.instrumentImpacts, VALID_SENTIMENT, affectedAssets, sentiment),
        impact: VALID_IMPACT.has(p.impact as string) ? (p.impact as PosterCopy["impact"]) : "Medium",
        sentiment,
        category,
        source: clampStr(p.source, 60, "Wire"),
        date: clampStr(p.date, 30, todayLabel),
        imagePrompt: clampStr(p.imagePrompt, 1200),
        // Left empty on purpose: the user generates the image externally from
        // imagePrompt, then attaches it via the file picker on the poster.
        imageUrl: "",
        simpleHeadline,
        simpleHeadlineHighlight: resolveHighlight(simpleHeadline, clampStr(p.simpleHeadlineHighlight, 50)),
        whatHappened: clampStr(p.whatHappened, 400) || description,
        whyItMatters: clampStr(p.whyItMatters, 240) || keyTakeaway,
        simpleImpacts: resolveSimpleImpacts(p.simpleImpacts, affectedAssets, sentiment),
        caption: resolveCaption(p.caption, `${title} — here's what it means for your trades. ${keyTakeaway}`.slice(0, 400)),
        hashtags: resolveHashtags(p.hashtags, category),
      } as PosterCopy;
    })
    .filter((p) => p.title && p.description)
    .slice(0, MAX_POSTERS);

  if (posters.length === 0) {
    return NextResponse.json({ error: "AI returned no usable posters — try again." }, { status: 502 });
  }

  // Build the cover slide — falls back to a locally-synthesized roundup
  // (from the posters we already validated) if the model's summary block is
  // missing or malformed, so the batch never ships without a cover.
  const rawSummary = (parsed.summary && typeof parsed.summary === "object" ? parsed.summary : {}) as Record<string, unknown>;
  // Fixed masthead line, not left to the model — the prompt asks for this
  // exact title too, but pinning it here guarantees the cover never drifts.
  const coverTitle = "News That Can Impact Your Trades";
  const coverOverview = clampStr(rawSummary.overview, 420) || `Top stories from ${windowLabel} that matter for active traders — see the full breakdown in this carousel.`;
  const coverAssetsFromModel = Array.isArray(rawSummary.topAssets)
    ? (rawSummary.topAssets as unknown[])
        .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
        .map((a) => ({
          symbol: clampStr(a.symbol, 12).toUpperCase(),
          sentiment: VALID_SENTIMENT.has(a.sentiment as string) ? (a.sentiment as InstrumentImpact["sentiment"]) : "Neutral",
        }))
        .filter((a) => a.symbol)
        .slice(0, 4)
    : [];
  const topAssets: InstrumentImpact[] = coverAssetsFromModel.length > 0
    ? coverAssetsFromModel
    : Array.from(
        new Map(
          posters
            .flatMap((p) => p.affectedAssets.split(",").map((s) => s.trim()).filter(Boolean).map((symbol) => [symbol, p.sentiment] as const))
        ).entries()
      ).slice(0, 4).map(([symbol, sentiment]) => ({ symbol, sentiment }));

  const cover: CoverCopy = {
    title: coverTitle,
    highlightPhrase: resolveHighlight(coverTitle, clampStr(rawSummary.highlightPhrase, 60)),
    description: coverOverview,
    descriptionHighlights: resolveDescriptionHighlights(coverOverview, rawSummary.overviewHighlights),
    keyTakeaway: clampStr(rawSummary.marketBias, 240) || "Mixed cross-asset signals — check each story's affected instruments before positioning.",
    affectedAssets: topAssets.map((a) => a.symbol).join(", "),
    instrumentImpacts: topAssets,
    impact: "High",
    sentiment: topAssets[0]?.sentiment ?? "Neutral",
    source: "Stratix Desk",
    date: todayLabel,
    imagePrompt: clampStr(rawSummary.imagePrompt, 1200) ||
      "A massive glowing 3D globe filling most of the frame, financial-hub cities connected by bold vivid light-trails arcing across continents, dramatic and saturated, hard rim light with a warm amber and emerald glow, subject filling 70% of the frame with clean negative space only at the very top for a headline overlay, hyper-detailed 3D render, bold studio lighting, vivid color, ultra-detailed, 8k. No real people, no faces, no legible text, no words, no letters, no numbers, no logos, no watermarks.",
    imageUrl: "",
    isCover: true,
    topAssets,
    bulletHeadlines: (Array.isArray(rawSummary.bulletHeadlines)
      ? (rawSummary.bulletHeadlines as unknown[]).filter((h): h is string => typeof h === "string" && !!h.trim()).slice(0, 5)
      : []
    ).concat(posters.map((p) => p.title)).slice(0, 5),
    caption: resolveCaption(rawSummary.caption, `${coverTitle} — ${coverOverview}`.slice(0, 400)),
    hashtags: resolveHashtags(rawSummary.hashtags),
  };

  // Build the outro slide — same "model output, else local fallback" pattern
  // as the cover above, so a batch never ships without one. The fallback
  // pool rotates by time so back-to-back generations (model failure on both)
  // still don't repeat verbatim.
  const OUTRO_FALLBACKS = [
    { headline: "We're Always Watching The Markets", cta: "Follow for daily market briefings" },
    { headline: "Markets Don't Sleep. Neither Do We.", cta: "Turn on notifications so you never miss a move" },
    { headline: "Never Miss A Move That Matters", cta: "Save this post for your next session" },
  ];
  const rawOutro = (parsed.outro && typeof parsed.outro === "object" ? parsed.outro : {}) as Record<string, unknown>;
  const outroFallback = OUTRO_FALLBACKS[Math.floor(Date.now() / 60000) % OUTRO_FALLBACKS.length];
  const outro: OutroCopy = {
    title: clampStr(rawOutro.headline, 60) || outroFallback.headline,
    description: clampStr(rawOutro.subtext, 260) ||
      "We share real-time market news before every trading session. You might not find this page again — follow now to stay ahead.",
    cta: clampStr(rawOutro.cta, 60) || outroFallback.cta,
    imagePrompt: clampStr(rawOutro.imagePrompt, 1200) ||
      "A huge glowing chart-line ribbon sweeping upward across the frame like a comet trail, a single massive gold bar bathed in warm triumphant light in the foreground, vivid and saturated, warm amber and emerald glow on deep charcoal, subject filling most of the frame with clean negative space only at the top, hyper-detailed 3D render, bold studio lighting, vivid color, ultra-detailed, 8k. No real people, no faces, no legible text, no words, no letters, no numbers, no logos, no watermarks.",
    imageUrl: "",
    isOutro: true,
  };

  return NextResponse.json({
    posters: [cover, ...posters, outro],
    reportId: String((report as { _id: unknown })._id),
    timeRangeLabel: windowLabel,
    reportGeneratedAt: (report as { generatedAt?: Date }).generatedAt ?? null,
    candidateCount: candidates.length,
  });
}
