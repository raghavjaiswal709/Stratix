// Shared news report schema validation rules

export function validateReportSchema(data: any): string | null {
  if (!data || typeof data !== "object") return "Data must be a JSON object";
  
  // 1. Meta check
  if (!data.meta || typeof data.meta !== "object") return "meta section is missing or invalid";
  if (typeof data.meta.date !== "string" || !data.meta.date.trim()) return "meta.date must be a non-empty string";
  if (typeof data.meta.session !== "string" || !data.meta.session.trim()) return "meta.session must be a non-empty string";
  if (typeof data.meta.generated_at !== "string" || !data.meta.generated_at.trim()) return "meta.generated_at must be a non-empty string";
  if (typeof data.meta.language !== "string" || !data.meta.language.trim()) return "meta.language must be a non-empty string";

  // 2. All News Section check
  if (!data.all_news_section || typeof data.all_news_section !== "object") return "all_news_section is missing or invalid";
  if (typeof data.all_news_section.headline !== "string" || !data.all_news_section.headline.trim()) {
    return "all_news_section.headline must be a non-empty string";
  }
  if (typeof data.all_news_section.summary !== "string" || !data.all_news_section.summary.trim()) {
    return "all_news_section.summary must be a non-empty string";
  }
  
  if (!Array.isArray(data.all_news_section.high_impact_events)) {
    return "all_news_section.high_impact_events must be an array";
  }
  for (let i = 0; i < data.all_news_section.high_impact_events.length; i++) {
    const ev = data.all_news_section.high_impact_events[i];
    if (!ev || typeof ev !== "object") return `high_impact_events[${i}] must be an object`;
    if (typeof ev.event_name !== "string" || !ev.event_name.trim()) return `high_impact_events[${i}].event_name must be a non-empty string`;
    if (typeof ev.impact_explanation !== "string" || !ev.impact_explanation.trim()) return `high_impact_events[${i}].impact_explanation must be a non-empty string`;
    if (!Array.isArray(ev.market_impact)) return `high_impact_events[${i}].market_impact must be an array`;
    for (let j = 0; j < ev.market_impact.length; j++) {
      const imp = ev.market_impact[j];
      if (!imp || typeof imp !== "object") return `high_impact_events[${i}].market_impact[${j}] must be an object`;
      if (typeof imp.symbol !== "string" || !imp.symbol.trim()) return `high_impact_events[${i}].market_impact[${j}].symbol must be a non-empty string`;
      if (typeof imp.effect !== "string" || !["bullish", "bearish", "neutral"].includes(imp.effect.toLowerCase())) {
        return `high_impact_events[${i}].market_impact[${j}].effect must be 'bullish', 'bearish', or 'neutral'`;
      }
    }
  }

  // 3. Symbol wise news check
  if (!data.symbol_wise_news || typeof data.symbol_wise_news !== "object") return "symbol_wise_news is missing or invalid";
  const symbolsInPayload = Object.keys(data.symbol_wise_news);
  if (symbolsInPayload.length === 0) return "symbol_wise_news must contain at least one entry";
  for (const sym of symbolsInPayload) {
    const sNews = data.symbol_wise_news[sym];
    if (!sNews) return `symbol_wise_news is missing entry for required symbol '${sym}'`;
    if (typeof sNews !== "object") return `symbol_wise_news.${sym} must be an object`;
    
    if (!Array.isArray(sNews.latest_headlines) || sNews.latest_headlines.length === 0) {
      return `symbol_wise_news.${sym}.latest_headlines must be a non-empty array`;
    }
    for (let i = 0; i < sNews.latest_headlines.length; i++) {
      if (typeof sNews.latest_headlines[i] !== "string" || !sNews.latest_headlines[i].trim()) {
        return `symbol_wise_news.${sym}.latest_headlines[${i}] must be a non-empty string`;
      }
    }
    if (typeof sNews.detailed_breakdown !== "string" || !sNews.detailed_breakdown.trim()) {
      return `symbol_wise_news.${sym}.detailed_breakdown must be a non-empty string`;
    }
    if (typeof sNews.trader_alert !== "string" || !sNews.trader_alert.trim()) {
      return `symbol_wise_news.${sym}.trader_alert must be a non-empty string`;
    }
    
    // Sniper note check
    if (!sNews.sniper_note || typeof sNews.sniper_note !== "object") return `symbol_wise_news.${sym}.sniper_note is missing or invalid`;
    
    const bias = sNews.sniper_note.news_bias;
    if (typeof bias !== "string" || !["bullish", "bearish", "neutral"].includes(bias.toLowerCase())) {
      return `symbol_wise_news.${sym}.sniper_note.news_bias must be 'Bullish', 'Bearish', or 'Neutral'`;
    }
    if (typeof sNews.sniper_note.key_catalyst !== "string" || !sNews.sniper_note.key_catalyst.trim()) {
      return `symbol_wise_news.${sym}.sniper_note.key_catalyst must be a non-empty string`;
    }
    if (typeof sNews.sniper_note.key_levels_watch !== "string" || !sNews.sniper_note.key_levels_watch.trim()) {
      return `symbol_wise_news.${sym}.sniper_note.key_levels_watch must be a non-empty string`;
    }
    if (typeof sNews.sniper_note.session_expectation !== "string" || !sNews.sniper_note.session_expectation.trim()) {
      return `symbol_wise_news.${sym}.sniper_note.session_expectation must be a non-empty string`;
    }
  }

  return null;
}
