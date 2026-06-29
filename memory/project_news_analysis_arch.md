---
name: project-news-analysis-arch
description: Architecture of the redesigned /news-analysis page — single page, 3 modals, no tabs
metadata:
  type: project
---

The /news-analysis page was redesigned from a 3-tab layout (Generate | Live News | Analyse) into a single-page with modals.

**Why:** User wanted cleaner UX — no tabs, everything accessible via action buttons.

**How to apply:** Understand the new structure when making changes to this page.

## New Architecture (as of 2026-06-29)

**Default page content:** `MarketNews` component (live RSS news feed) always visible.

**Latest report banner:** Auto-shows at top if any session reports exist; clicking opens ReportViewModal.

**Header buttons (3):**
1. **Manual** → `ManualModal` (fullscreen `inset-3`): 3 tabs — Prompt, Add Report, Generate with AI
2. **AI News Analysis** (gradient: emerald→violet→cyan) → `AIAnalysisModal` (fullscreen `inset-3`): time range selector, instrument filter, Analyse with AI button, results/articles/prompt tabs. Header says "Claude Sonnet 4.6"
3. **History** → `GlobalHistoryDrawer` (side panel, right): shows all session reports + AI analysis reports, each tagged "✦ AI" or "Manual"

## Key components (all in app/news-analysis/page.tsx)
- `ReportViewModal` — shows full session report (symbol cards, events)
- `ManualModal` — wraps `PromptModal` (embedded) + `EditorModal` (embedded) + generate tab
- `AIAnalysisModal` — full analyse functionality; uses `AILoadingAnimation` (gradient blobs) while running
- `GlobalHistoryDrawer` — unified history: `NewsEntry[]` + `AnalyseHistoryEntry[]`
- `AILoadingAnimation` — emerald/violet/cyan animated blobs + shimmer bar

## API changes (same session)
- `lib/models/NewsReport.ts`: added `reportType: "ai" | "manual"` field (default "manual")
- `app/api/news-reports/route.ts`: returns `reportType` in history and index endpoints
- `app/api/news-reports/generate/route.ts`: sets `reportType: "ai"` when saving AI-generated reports

## Known pre-existing issue
`NEWS_SCHEMA_TEMPLATE` has a bad control character at position 3587 — `JSON.parse` fails silently in `buildNewsUserMessageV5`. Prompt still shows (just not dynamically filtered by selected symbols). Not introduced by the redesign.
