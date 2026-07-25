import type { PromptDefinition } from "../types";
import { JOURNAL_PROMPTS } from "./journal";
import { NEWS_ANALYSIS_PROMPTS } from "./newsAnalysis";
import { NEWS_REPORTS_PROMPTS } from "./newsReports";
import { SENTIMENT_PROMPTS } from "./sentiment";
import { NEWS_FILTER_PROMPTS } from "./newsFilter";
import { ASK_AI_PROMPTS } from "./askAi";
import { AI_REPORT_PROMPTS } from "./aiReport";
import { CONTENT_CREATOR_PROMPTS } from "./contentCreator";
import { PORTFOLIO_ASSISTANT_PROMPTS } from "./portfolioAssistant";

export const PROMPT_DEFINITIONS: PromptDefinition[] = [
  ...JOURNAL_PROMPTS,
  ...NEWS_ANALYSIS_PROMPTS,
  ...NEWS_REPORTS_PROMPTS,
  ...SENTIMENT_PROMPTS,
  ...NEWS_FILTER_PROMPTS,
  ...ASK_AI_PROMPTS,
  ...AI_REPORT_PROMPTS,
  ...CONTENT_CREATOR_PROMPTS,
  ...PORTFOLIO_ASSISTANT_PROMPTS,
];

const PROMPT_DEFINITION_MAP = new Map(PROMPT_DEFINITIONS.map((d) => [d.key, d]));

export function getPromptDefinition(key: string): PromptDefinition {
  const def = PROMPT_DEFINITION_MAP.get(key);
  if (!def) throw new Error(`Unknown prompt key: ${key}`);
  return def;
}

export function hasPromptDefinition(key: string): boolean {
  return PROMPT_DEFINITION_MAP.has(key);
}

export const PROMPT_CATEGORY_ORDER = [
  "Journal",
  "News Analysis",
  "Ask AI",
  "Portfolio Assistant",
  "AI Report (CHoCH QLM)",
  "Content Creator",
];

export type { PromptDefinition, PromptVariable, PromptKind } from "../types";
