import type { NewsItem } from "./types";


// Synthesizes a companion "explain it simply" bento card from a News story's
// AI-generated ELI5 fields (simpleHeadline/whatHappened/whyItMatters/
// simpleImpacts, written by the same news-batch generation call) — inserted
// right after its parent story in the final batch, never a standalone
// generation of its own.
export function buildBentoCard(story: NewsItem): NewsItem {
  return {
    title: story.simpleHeadline || story.title,
    description: story.whatHappened || story.description,
    isBento: true,
    relatedTitle: story.title,
    simpleHeadline: story.simpleHeadline,
    simpleHeadlineHighlight: story.simpleHeadlineHighlight,
    whatHappened: story.whatHappened,
    whyItMatters: story.whyItMatters,
    simpleImpacts: story.simpleImpacts,
    sentiment: story.sentiment,
    // Carried over so the card can render the parent story's own photo as a
    // faint background echo — see drawBentoExplainerCard.
    imageUrl: story.imageUrl,
    imageFocusX: story.imageFocusX,
    imageFocusY: story.imageFocusY,
    imageZoom: story.imageZoom,
  };
}

// A Bento explainer card borrows its parent story's photo for its faint
// background (see drawBentoExplainerCard). buildBentoCard above copies that
// URL at construction time, but batches built before that existed — or
// hand-edited/pasted JSON — may still have a bento item with no imageUrl of
// its own. Fall back to the immediately preceding item (always the parent,
// per buildBentoCard's insertion order) at RENDER time instead, so the
// background shows up regardless of when/how the data was created.
export function withBentoImageFallback(activeData: any, items: unknown[]): any {
  if (!activeData?.isBento || activeData.imageUrl || !Array.isArray(items)) return activeData;
  const idx = items.indexOf(activeData);
  const parent = idx > 0 ? (items[idx - 1] as any) : null;
  if (!parent?.imageUrl) return activeData;
  return { ...activeData, imageUrl: parent.imageUrl, imageFocusX: parent.imageFocusX, imageFocusY: parent.imageFocusY, imageZoom: parent.imageZoom };
}
// ─── External-AI JSON import ────────────────────────────────────────────────
// The "Copy Prompt" / "Show Prompt" flows hand the user a system prompt that
// asks the AI to reply with a NESTED wrapper object — {summary,posters,outro}
// for News, {cover,facts,outro} for Facts, {concept,cover,slides,recap,outro}
// for Learnings — because that's the exact shape each batch route's own
// server-side OpenAI call parses. But the poster renderer only ever consumes
// a FLAT NewsItem[] array (that's what setNewsData/the JSON tab expect), so a
// pasted AI reply in the "correct" (per the prompt) nested shape used to
// silently fail to render. These functions convert the nested reply into the
// same flat, clamped/resolved shape each route already produces server-side,
// so a pasted external-AI JSON renders exactly like a normal generation.

export function importClampStr(v: unknown, max: number, fallback = ""): string {
  return typeof v === "string" ? v.trim().slice(0, max) : fallback;
}

export function importResolveHighlight(title: string, candidate: unknown): string {
  const c = typeof candidate === "string" ? candidate : "";
  if (c && title.includes(c)) return c;
  const words = title.split(" ").filter(Boolean);
  return words.slice(0, Math.min(3, words.length)).join(" ");
}

// Mirrors each route's resolveDescriptionHighlights — only keeps candidates
// that are genuine exact substrings of `text`, so nothing highlights text
// that was paraphrased instead of copy-pasted.
export function importResolveHighlightTerms(text: string, candidates: unknown, max = 5, maxLen = 60): string[] {
  if (!Array.isArray(candidates)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const term = c.trim();
    if (!term || term.length > maxLen || !text.includes(term) || seen.has(term)) continue;
    seen.add(term);
    out.push(term);
    if (out.length >= max) break;
  }
  return out;
}

export function importResolveStringArray(v: unknown, max: number, itemMax = 120): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is string => typeof s === "string" && !!s.trim())
    .slice(0, max)
    .map((s) => s.trim().slice(0, itemMax));
}

export const IMPORT_VALID_SENTIMENT = new Set(["Bullish", "Bearish", "Neutral"]);
export const IMPORT_VALID_DIRECTION = new Set(["up", "down", "neutral"]);
export const IMPORT_VALID_CATEGORY = new Set(["Macro", "Geopolitical", "Corporate", "Sentiment", "Systemic"]);
export const IMPORT_VALID_IMPACT = new Set(["High", "Medium", "Low"]);

// Same fixed brand set the automatic News Batch route always appends server-side
// (see COMMON_HASHTAGS in app/api/content-creator/news-batch/route.ts) — kept
// here too so a pasted external-AI reply gets the same brand-consistent tags.
export const IMPORT_BRAND_HASHTAGS = ["#Stratix", "#Trading", "#ForexTrading", "#TradingSignals", "#FinancialMarkets", "#MarketNews", "#TradingCommunity"];
export const IMPORT_HASHTAG_MAX = 30;

export function isImportValidHashtag(v: unknown): v is string {
  return typeof v === "string" && /^#[A-Za-z0-9_]{2,40}$/.test(v.trim());
}

// Mirrors the route's resolveHashtags: normalizes/validates the model's own
// tags and merges in the fixed brand set, deduping case-insensitively.
export function importResolveHashtags(candidates: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (tag: string) => {
    const key = tag.toLowerCase();
    if (seen.has(key) || out.length >= IMPORT_HASHTAG_MAX) return;
    seen.add(key);
    out.push(tag);
  };
  for (const tag of IMPORT_BRAND_HASHTAGS) add(tag);
  if (Array.isArray(candidates)) {
    for (const c of candidates) {
      const raw = typeof c === "string" ? c.trim() : "";
      const normalized = raw && !raw.startsWith("#") ? `#${raw}` : raw;
      if (isImportValidHashtag(normalized)) add(normalized);
    }
  }
  return out;
}

export function importResolveCaption(candidate: unknown, fallback: string): string {
  return importClampStr(candidate, 500) || fallback;
}

export function importResolveInstrumentImpacts(v: unknown): { symbol: string; sentiment: "Bullish" | "Bearish" | "Neutral" }[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
    .map((a) => ({
      symbol: importClampStr(a.symbol, 12).toUpperCase(),
      sentiment: (IMPORT_VALID_SENTIMENT.has(a.sentiment as string) ? a.sentiment : "Neutral") as "Bullish" | "Bearish" | "Neutral",
    }))
    .filter((a) => a.symbol)
    .slice(0, 4);
}

export function importResolveSimpleImpacts(v: unknown): { market: string; effect: string; direction: "up" | "down" | "neutral" }[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
    .map((a) => ({
      market: importClampStr(a.market, 40),
      effect: importClampStr(a.effect, 80),
      direction: (IMPORT_VALID_DIRECTION.has(a.direction as string) ? a.direction : "neutral") as "up" | "down" | "neutral",
    }))
    .filter((a) => a.market && a.effect)
    .slice(0, 4);
}

/** Strips a ```json fence if present, then parses — throws a user-facing message on failure. */
export function parsePastedAiJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Paste the AI's JSON reply first.");
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    throw new Error("That doesn't look like valid JSON — check for a missing comma/quote, or that you copied the AI's entire reply.");
  }
}

export function importNewsJson(raw: unknown): NewsItem[] {
  if (Array.isArray(raw)) {
    const items = raw
      .filter((p): p is Record<string, unknown> => !!p && typeof p === "object" && typeof p.title === "string")
      .map((p) => {
        const item = { ...p } as unknown as NewsItem;
        // Bento/outro cards have no Instagram caption concept (see
        // buildBentoCard) — only resolve it for posters and the cover, and
        // only here (not a full re-normalize) since a flat array may already
        // be a fully-shaped, previously-generated batch that just needs its
        // caption/hashtags backfilled or re-validated, not rebuilt.
        if (!item.isBento) {
          const title = importClampStr(p.title, 90) || String(p.title);
          const keyTakeaway = typeof p.keyTakeaway === "string" ? p.keyTakeaway : (typeof p.description === "string" ? p.description : "");
          item.caption = importResolveCaption(p.caption, `${title} — here's what it means for your trades. ${keyTakeaway}`.slice(0, 400));
          item.hashtags = importResolveHashtags(p.hashtags);
        }
        return item;
      });
    if (items.length === 0) throw new Error('That array has no valid poster objects — each needs at least a "title".');
    return items;
  }
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawPosters = Array.isArray(obj.posters) ? obj.posters : [];
  if (rawPosters.length === 0) {
    throw new Error('Expected an object with a "posters" array (the shape the News prompt asks for) — or a plain array of poster objects.');
  }

  const posters: NewsItem[] = rawPosters
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => {
      const title = importClampStr(p.title, 90);
      const description = importClampStr(p.description, 400);
      const sentiment = (IMPORT_VALID_SENTIMENT.has(p.sentiment as string) ? p.sentiment : "Neutral") as "Bullish" | "Bearish" | "Neutral";
      const simpleHeadline = importClampStr(p.simpleHeadline, 70) || title;
      const keyTakeaway = importClampStr(p.keyTakeaway, 240);
      return {
        title,
        highlightPhrase: importResolveHighlight(title, p.highlightPhrase),
        description,
        descriptionHighlights: importResolveHighlightTerms(description, p.descriptionHighlights),
        keyTakeaway,
        affectedAssets: importClampStr(p.affectedAssets, 80),
        instrumentImpacts: importResolveInstrumentImpacts(p.instrumentImpacts),
        impact: (IMPORT_VALID_IMPACT.has(p.impact as string) ? p.impact : "Medium") as "High" | "Medium" | "Low",
        sentiment,
        category: (IMPORT_VALID_CATEGORY.has(p.category as string) ? p.category : "Macro") as NewsItem["category"],
        source: importClampStr(p.source, 60, "Wire"),
        date: importClampStr(p.date, 30, new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })),
        imagePrompt: importClampStr(p.imagePrompt, 1200),
        imageUrl: "",
        simpleHeadline,
        simpleHeadlineHighlight: importResolveHighlight(simpleHeadline, p.simpleHeadlineHighlight),
        whatHappened: importClampStr(p.whatHappened, 400) || description,
        whyItMatters: importClampStr(p.whyItMatters, 240) || keyTakeaway,
        simpleImpacts: importResolveSimpleImpacts(p.simpleImpacts),
        caption: importResolveCaption(p.caption, `${title} — here's what it means for your trades. ${keyTakeaway}`.slice(0, 400)),
        hashtags: importResolveHashtags(p.hashtags),
      } as NewsItem;
    })
    .filter((p) => p.title && p.description);

  if (posters.length === 0) throw new Error("No usable posters found in the pasted JSON.");

  const rawSummary = (obj.summary && typeof obj.summary === "object" ? obj.summary : {}) as Record<string, unknown>;
  const coverOverview = importClampStr(rawSummary.overview, 420) ||
    "Top stories that matter for active traders — see the full breakdown in this carousel.";
  const coverAssets = importResolveInstrumentImpacts(rawSummary.topAssets);
  const topAssets = coverAssets.length > 0 ? coverAssets : Array.from(
    new Map(
      posters.flatMap((p) =>
        (p.affectedAssets || "").split(",").map((s) => s.trim()).filter(Boolean).map((symbol) => [symbol, p.sentiment ?? "Neutral"] as const)
      )
    ).entries()
  ).slice(0, 4).map(([symbol, sentiment]) => ({ symbol, sentiment }));
  const coverTitle = "News That Can Impact Your Trades";

  const cover: NewsItem = {
    title: coverTitle,
    highlightPhrase: importResolveHighlight(coverTitle, rawSummary.highlightPhrase),
    description: coverOverview,
    descriptionHighlights: importResolveHighlightTerms(coverOverview, rawSummary.overviewHighlights),
    keyTakeaway: importClampStr(rawSummary.marketBias, 240) || "Mixed cross-asset signals — check each story's affected instruments before positioning.",
    affectedAssets: topAssets.map((a) => a.symbol).join(", "),
    instrumentImpacts: topAssets,
    impact: "High",
    sentiment: topAssets[0]?.sentiment ?? "Neutral",
    source: "Stratix Desk",
    date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    imagePrompt: importClampStr(rawSummary.imagePrompt, 1200),
    imageUrl: "",
    isCover: true,
    topAssets,
    bulletHeadlines: importResolveStringArray(rawSummary.bulletHeadlines, 5).concat(posters.map((p) => p.title)).slice(0, 5),
    caption: importResolveCaption(rawSummary.caption, `${coverTitle} — ${coverOverview}`.slice(0, 400)),
    hashtags: importResolveHashtags(rawSummary.hashtags),
  };

  const rawOutro = (obj.outro && typeof obj.outro === "object" ? obj.outro : {}) as Record<string, unknown>;
  const outro: NewsItem = {
    title: importClampStr(rawOutro.headline, 60) || "We're Always Watching The Markets",
    description: importClampStr(rawOutro.subtext, 260) ||
      "We share real-time market news before every trading session. You might not find this page again — follow now to stay ahead.",
    cta: importClampStr(rawOutro.cta, 60) || "Follow for daily market briefings",
    imagePrompt: importClampStr(rawOutro.imagePrompt, 1200),
    imageUrl: "",
    isOutro: true,
  };

  const withBento = posters.flatMap((story) => [story, buildBentoCard(story)]);
  return [cover, ...withBento, outro];
}

export function importFactsJson(raw: unknown): NewsItem[] {
  if (Array.isArray(raw)) {
    const items = raw.filter((p): p is NewsItem => !!p && typeof p === "object" && typeof (p as Record<string, unknown>).title === "string");
    if (items.length === 0) throw new Error('That array has no valid fact card objects — each needs at least a "title".');
    return items;
  }
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawFacts = Array.isArray(obj.facts) ? obj.facts : [];
  if (rawFacts.length === 0) {
    throw new Error('Expected an object with a "facts" array (the shape the Facts prompt asks for) — or a plain array of fact objects.');
  }

  const facts: NewsItem[] = rawFacts
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => {
      const title = importClampStr(f.title, 90);
      return {
        title,
        highlightPhrase: importResolveHighlight(title, f.highlightPhrase),
        description: importClampStr(f.fact ?? f.description, 400),
        sourceNote: importClampStr(f.sourceNote, 160),
        imagePrompt: importClampStr(f.imagePrompt, 1200),
        imageUrl: "",
      } as NewsItem;
    })
    .filter((f) => f.title && f.description);

  if (facts.length === 0) throw new Error("No usable facts found in the pasted JSON.");

  const rawCover = (obj.cover && typeof obj.cover === "object" ? obj.cover : {}) as Record<string, unknown>;
  const coverOverview = importClampStr(rawCover.overview, 300) || "A quick round of verified facts about the instruments you trade.";
  const coverTitle = importClampStr(rawCover.title, 70) || `${facts.length} Things Every Trader Should Know Today`;
  const cover: NewsItem = {
    title: coverTitle,
    highlightPhrase: importResolveHighlight(coverTitle, rawCover.highlightPhrase),
    description: coverOverview,
    descriptionHighlights: importResolveHighlightTerms(coverOverview, rawCover.overviewHighlights, 3),
    bulletHeadlines: importResolveStringArray(rawCover.bulletHeadlines, 8).concat(facts.map((f) => f.title)).slice(0, 8),
    imagePrompt: importClampStr(rawCover.imagePrompt, 1200),
    imageUrl: "",
    isCover: true,
  };

  const rawOutro = (obj.outro && typeof obj.outro === "object" ? obj.outro : {}) as Record<string, unknown>;
  const outro: NewsItem = {
    title: importClampStr(rawOutro.headline, 60) || "We're Always Teaching The Markets",
    description: importClampStr(rawOutro.subtext, 200) || "Real, verified trading facts across Gold, Forex and Crypto — a little sharper every day.",
    cta: importClampStr(rawOutro.cta, 60) || "Follow for daily trading facts",
    imagePrompt: importClampStr(rawOutro.imagePrompt, 1200),
    imageUrl: "",
    isOutro: true,
  };

  return [cover, ...facts, outro];
}

export function importLearningsJson(raw: unknown): NewsItem[] {
  if (Array.isArray(raw)) {
    const items = raw.filter((p): p is NewsItem => !!p && typeof p === "object" && typeof (p as Record<string, unknown>).title === "string");
    if (items.length === 0) throw new Error('That array has no valid slide objects — each needs at least a "title".');
    return items;
  }
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawSlides = Array.isArray(obj.slides) ? obj.slides : [];
  if (rawSlides.length === 0) {
    throw new Error('Expected an object with a "slides" array (the shape the Learnings prompt asks for) — or a plain array of slide objects.');
  }
  const concept = importClampStr(obj.concept, 80) || "Trading Concept";

  const stepSlides = rawSlides
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({ heading: importClampStr(s.heading, 70), body: importClampStr(s.body, 360), imagePrompt: importClampStr(s.imagePrompt, 1200) }))
    .filter((s) => s.heading && s.body);

  if (stepSlides.length === 0) throw new Error("No usable slides found in the pasted JSON.");

  const rawRecap = (obj.recap && typeof obj.recap === "object" ? obj.recap : {}) as Record<string, unknown>;
  const recapBody = importClampStr(rawRecap.body, 360) || `${concept} — reviewed step by step. Save this slide as your quick-reference recap.`;
  const allSlides = [
    ...stepSlides,
    { heading: "Recap", body: recapBody, imagePrompt: importClampStr(rawRecap.imagePrompt, 1200) || stepSlides[stepSlides.length - 1]?.imagePrompt || "" },
  ];

  const slides: NewsItem[] = allSlides.map((s, i) => ({
    title: s.heading,
    description: s.body,
    concept,
    stepLabel: `Step ${i + 1} of ${allSlides.length}`,
    imagePrompt: s.imagePrompt,
    imageUrl: "",
  }));

  const rawCover = (obj.cover && typeof obj.cover === "object" ? obj.cover : {}) as Record<string, unknown>;
  const coverOverview = importClampStr(rawCover.overview, 300) || `A step-by-step walkthrough of ${concept}, explained the way a desk would teach it.`;
  const coverTitle = importClampStr(rawCover.title, 70) || `What You'll Learn: ${concept}`;
  const cover: NewsItem = {
    title: coverTitle,
    highlightPhrase: importResolveHighlight(coverTitle, rawCover.highlightPhrase),
    description: coverOverview,
    descriptionHighlights: importResolveHighlightTerms(coverOverview, rawCover.overviewHighlights, 3),
    concept,
    imagePrompt: importClampStr(rawCover.imagePrompt, 1200),
    imageUrl: "",
    isCover: true,
  };

  const rawOutro = (obj.outro && typeof obj.outro === "object" ? obj.outro : {}) as Record<string, unknown>;
  const outro: NewsItem = {
    title: importClampStr(rawOutro.headline, 60) || "We're Always Teaching The Markets",
    description: importClampStr(rawOutro.subtext, 200) || "Real trading concepts, taught clearly, across Gold, Forex and Crypto.",
    cta: importClampStr(rawOutro.cta, 60) || "Follow for daily lessons",
    imagePrompt: importClampStr(rawOutro.imagePrompt, 1200),
    imageUrl: "",
    isOutro: true,
  };

  return [cover, ...slides, outro];
}

/** Dispatches a pasted external-AI JSON payload (already `JSON.parse`d) to the right category transform. */
export function importAiJson(category: "news" | "facts" | "learnings", raw: unknown): NewsItem[] {
  if (category === "news") return importNewsJson(raw);
  if (category === "facts") return importFactsJson(raw);
  return importLearningsJson(raw);
}
