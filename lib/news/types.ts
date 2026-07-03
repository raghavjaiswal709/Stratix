export interface RawItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  description?: string;
  fullContent?: string;
}

export interface ScoredItem extends RawItem {
  feedCategory: string;
  impactScore: number;
  scoreBreakdown: string[];
  isCalendarEvent?: boolean;
  isPrimarySource?: boolean;
}

export interface NewsArticle {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  sentiment: "Bullish" | "Bearish" | "Neutral";
  sentimentScore: number;
  marketImpact: string;
  category: string;
  impactScore: number;
  isPrimarySource?: boolean;
  isCalendarEvent?: boolean;
}

export interface CalendarEvent {
  title: string;
  country: string;
  date: string;
  impact: "High" | "Medium" | "Low" | "Holiday" | string;
  forecast: string;
  previous: string;
  actual?: string;
}
