"""
Gemini-powered Hinglish news analysis generator with deep web scraping.

Pipeline:
  1. Scrape live financial news from FXStreet, InvestingLive, WorldMonitor.
  2. Feed scraped raw content to Gemini 2.0 Flash as grounding context.
  3. Gemini writes a structured Hinglish JSON with ≥25 high-impact events.
  4. Output saved to public/data/news/.

Called by .github/workflows/news_analysis.yml before each trading session.
"""

import json
import os
import re
import sys
import time
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

# ─── Config ───────────────────────────────────────────────────────────────────

GEMINI_API_KEY = os.environ.get(
    "GEMINI_API_KEY",
    "AIzaSyDxtiltuqItfIBIoEXaUDeXgd3Qlhm9dLw",
)
SESSION_NAME = os.environ.get("SESSION_NAME", "asian").strip().lower().replace(" ", "_")

SESSION_LABELS: dict[str, str] = {
    "asian":    "Asian",
    "london":   "London",
    "new_york": "New York",
}

# Use Gemini 2.5 Flash for 65 536 output-token budget — essential for 25+ events
GEMINI_MODEL = "gemini-2.5-flash-preview-05-20"
GEMINI_URL   = (
    "https://generativelanguage.googleapis.com/v1beta"
    f"/models/{GEMINI_MODEL}:generateContent"
    f"?key={GEMINI_API_KEY}"
)

# ─── Scraping helpers ─────────────────────────────────────────────────────────

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection":      "keep-alive",
    "DNT":             "1",
    "Upgrade-Insecure-Requests": "1",
    "Cache-Control":   "no-cache",
}


def _fetch(url: str, timeout: int = 25) -> str | None:
    """GET a URL with up to 3 retries. Returns HTML text or None."""
    for attempt in range(1, 4):
        try:
            resp = requests.get(url, headers=BROWSER_HEADERS, timeout=timeout)
            if resp.ok:
                return resp.text
            print(f"  [scrape] {url} → HTTP {resp.status_code} (attempt {attempt})", file=sys.stderr)
        except Exception as exc:
            print(f"  [scrape] {url} attempt {attempt} error: {exc}", file=sys.stderr)
        time.sleep(3 * attempt)
    return None


def _clean(text: str) -> str:
    """Collapse whitespace and strip."""
    return " ".join(text.split()).strip()


def _extract_articles(soup: BeautifulSoup, source: str, limit: int = 25) -> list[dict]:
    """Generic article extractor — tries broad selectors common to news sites."""
    items = []
    candidates = soup.select(
        "article, .article, .post, .entry, .news-item, .story, "
        "[class*='article'], [class*='post'], [class*='news'], [class*='story']"
    )
    for el in candidates[:limit * 2]:
        title_el = el.select_one(
            "h1, h2, h3, h4, "
            "[class*='title'], [class*='headline'], [class*='heading'], "
            ".entry-title, .post-title, .article-title"
        )
        body_el = el.select_one(
            "p, [class*='excerpt'], [class*='summary'], [class*='teaser'], "
            "[class*='description'], [class*='content'], "
            ".entry-summary, .post-excerpt"
        )
        if not title_el:
            continue
        title = _clean(title_el.get_text())
        if len(title) < 15:
            continue
        summary = _clean(body_el.get_text())[:500] if body_el else ""
        items.append({"source": source, "title": title, "summary": summary})
        if len(items) >= limit:
            break
    return items


# ─── Source-specific scrapers ─────────────────────────────────────────────────

def scrape_fxstreet_analysis() -> list[dict]:
    """Deep-scrape FXStreet /analysis/latest — expert analysis pieces."""
    html = _fetch("https://www.fxstreet.com/analysis/latest")
    if not html:
        return []
    soup = BeautifulSoup(html, "lxml")

    items = _extract_articles(soup, "FXStreet Analysis", limit=25)

    # FXStreet also uses a specific list format — capture those too
    for el in soup.select(".fxs_article, [class*='fxs_article'], [data-type='analysis']"):
        title_el = el.select_one("[class*='title'], [class*='headline'], h2, h3, a")
        if title_el:
            title = _clean(title_el.get_text())
            if len(title) > 15 and not any(i["title"] == title for i in items):
                items.append({"source": "FXStreet Analysis", "title": title, "summary": ""})

    return items[:25]


def scrape_fxstreet_news() -> list[dict]:
    """Deep-scrape FXStreet /news — breaking market news feed."""
    html = _fetch("https://www.fxstreet.com/news")
    if not html:
        return []
    soup = BeautifulSoup(html, "lxml")

    items = _extract_articles(soup, "FXStreet News", limit=25)

    # Additional FXStreet news list selectors
    for el in soup.select(".fxs_news_item, [class*='news_item'], [class*='newsItem'], [data-type='news']"):
        title_el = el.select_one("[class*='title'], h2, h3, h4, a")
        body_el  = el.select_one("[class*='excerpt'], [class*='summary'], p")
        if title_el:
            title = _clean(title_el.get_text())
            if len(title) > 15 and not any(i["title"] == title for i in items):
                summary = _clean(body_el.get_text())[:500] if body_el else ""
                items.append({"source": "FXStreet News", "title": title, "summary": summary})

    return items[:25]


def scrape_investinglive() -> list[dict]:
    """Deep-scrape InvestingLive /forex/ — forex-focused news feed."""
    html = _fetch("https://investinglive.com/forex/")
    if not html:
        return []
    soup = BeautifulSoup(html, "lxml")

    items = _extract_articles(soup, "InvestingLive Forex", limit=25)

    # InvestingLive may paginate — also grab any ticker/headline strips
    for el in soup.select(".td-module-thumb, .td-big-grid-post, .td-medium-pad, .td_module_flex"):
        title_el = el.select_one(".entry-title, .td-module-title, h3, h2, a")
        body_el  = el.select_one(".td-excerpt, p")
        if title_el:
            title = _clean(title_el.get_text())
            if len(title) > 15 and not any(i["title"] == title for i in items):
                summary = _clean(body_el.get_text())[:500] if body_el else ""
                items.append({"source": "InvestingLive Forex", "title": title, "summary": summary})

    return items[:25]


def scrape_forexfactory() -> list[dict]:
    """
    Deep-scrape ForexFactory /news — breaking market news with impact ratings.
    WorldMonitor (worldmonitor.app) is a fully JS-rendered SPA and cannot be
    scraped with static HTTP. ForexFactory provides equivalent real-time coverage
    (geopolitics, central banks, macro) and IS statically rendered.
    """
    html = _fetch("https://www.forexfactory.com/news")
    if not html:
        return []
    soup = BeautifulSoup(html, "lxml")
    items = []
    seen: set[str] = set()

    # ForexFactory primary news blocks
    for block in soup.select(".news-block__item, .news-block__content, [class*='news-block']"):
        title_el   = block.select_one(".news-block__title, [class*='title'], h2, h3, h4, a.darklink")
        details_el = block.select_one(".news-block__details, .news-block__preview, p, [class*='details']")
        if title_el:
            title = _clean(title_el.get_text())
            if len(title) > 15 and title not in seen:
                seen.add(title)
                summary = _clean(details_el.get_text())[:500] if details_el else ""
                items.append({"source": "ForexFactory (WorldMonitor coverage)", "title": title, "summary": summary})

    # Fallback: grab any standalone h-tags with financial keywords
    keywords = {"USD", "EUR", "GBP", "JPY", "gold", "oil", "Fed", "ECB", "BoJ", "CPI", "GDP",
                "OPEC", "rate", "inflation", "market", "dollar", "treasury", "yield", "crypto", "BTC"}
    for el in soup.select("h1, h2, h3, h4"):
        title = _clean(el.get_text())
        if (len(title) > 20 and title not in seen and
                any(kw.lower() in title.lower() for kw in keywords)):
            seen.add(title)
            items.append({"source": "ForexFactory (WorldMonitor coverage)", "title": title, "summary": ""})

    return items[:25]


# ─── Aggregator ───────────────────────────────────────────────────────────────

def collect_all_news() -> str:
    """
    Run all scrapers, merge results, and return a single formatted string
    to inject into the Gemini prompt as live grounding context.
    """
    print("→ Deep-scraping financial news sources…")

    sources = [
        ("FXStreet Analysis",               scrape_fxstreet_analysis),
        ("FXStreet News",                   scrape_fxstreet_news),
        ("InvestingLive Forex",             scrape_investinglive),
        # WorldMonitor (worldmonitor.app) is a JS SPA — scraping via ForexFactory
        # which covers the same domains: geopolitics, macro, central banks, FX, crypto
        ("ForexFactory (WorldMonitor data)", scrape_forexfactory),
    ]

    all_items: list[dict] = []
    for name, fn in sources:
        try:
            items = fn()
            print(f"  ✓ {name}: {len(items)} items")
            all_items.extend(items)
        except Exception as exc:
            print(f"  ✗ {name}: {exc}", file=sys.stderr)

    if not all_items:
        print("  ⚠ All scrapers returned empty — Gemini will rely on its own knowledge.",
              file=sys.stderr)
        return ""

    lines = [
        f"=== LIVE SCRAPED NEWS CONTEXT ({len(all_items)} items — FXStreet, InvestingLive, ForexFactory, WorldMonitor) ===",
        "Sources: fxstreet.com/analysis/latest | fxstreet.com/news | investinglive.com/forex/ | forexfactory.com/news (covers worldmonitor.app geopolitical & macro domains)",
        "Use ALL of the following real news items as your PRIMARY source of truth.",
        "Do NOT fabricate or hallucinate events — only use what is listed below + verified market knowledge.",
        "",
    ]
    for i, item in enumerate(all_items, 1):
        lines.append(f"{i}. [{item['source']}] {item['title']}")
        if item.get("summary"):
            lines.append(f"   → {item['summary']}")

    return "\n".join(lines)


# ─── File helpers ─────────────────────────────────────────────────────────────

def _read(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read().strip()


# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    system_prompt = _read("config/gemini_news_instructions.txt")
    template_raw  = _read("config/news_template.json")

    session_label = SESSION_LABELS.get(SESSION_NAME, "Asian")
    today         = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    generated_at  = datetime.now(timezone.utc).isoformat()

    # ── 1. Scrape live news ───────────────────────────────────────────────────
    scraped_context = collect_all_news()
    has_scraped     = bool(scraped_context)

    # ── 2. Build user message ─────────────────────────────────────────────────
    scrape_block = (
        f"\n\n{scraped_context}\n\n"
        "=== END OF SCRAPED CONTEXT ===\n"
        "Use the above scraped news as your PRIMARY source of truth. "
        "Cross-reference with your real-time knowledge to fill any gaps. "
        "Do NOT invent events — every high_impact_event must correspond to a real, verifiable news item.\n"
        if has_scraped else
        "\n\n[NOTE: Live scrapers returned no data. Use your most current knowledge of today's markets.]\n"
    )

    user_message = (
        f"Aaj ka UTC date hai {today}. "
        f"Aane wala session hai {session_label} Session.\n"
        f"{scrape_block}\n"
        "Ab pichle 24 ghante ki saari important global financial news analyze karo — "
        "major economic data releases (NFP, CPI, GDP, PMI, retail sales, trade balance), "
        "central bank decisions aur speeches (Fed, ECB, BoE, BoJ, RBA, RBNZ, SNB, BoC, PBoC, RBI), "
        "geopolitical developments, equity market moves, bond yield changes, "
        "commodity price swings, crypto market events, aur FX intervention risks.\n\n"
        "In symbols ke liye complete news breakdown chahiye: "
        "XAUUSD, XAGUSD, BTCUSDT, ETHUSD, GBPUSD, EURUSD, USDJPY, "
        "AUDUSD, NZDUSD, USDCAD, USDCHF.\n\n"
        "Saara content Hinglish mein likhna hai — English alphabet use karo "
        "lekin Hindi aur English ka natural, conversational mix rakhna. "
        "Jaise ek senior trader dost baat kar raha ho kisi retail trader se.\n\n"
        "Ek single valid JSON object output karo jo is schema ko exactly match kare:\n\n"
        f"{template_raw}\n\n"
        "══════════════════════════════════════════════════════════\n"
        "MANDATORY REQUIREMENTS — koi compromise nahi, koi exception nahi:\n"
        "══════════════════════════════════════════════════════════\n\n"
        f"meta.generated_at = \"{generated_at}\", "
        f"meta.date = \"{today}\", "
        f"meta.session = \"{session_label}\", "
        f"meta.language = \"Hinglish\".\n\n"
        "RULE 1 — MINIMUM 25 HIGH IMPACT EVENTS, STRICTLY:\n"
        "  all_news_section.high_impact_events mein EXACTLY 25 events dalne hain — "
        "ek bhi kum BILKUL acceptable nahi. Agar scraped data mein 25 se zyada news hain, "
        "sabse important 25 lo. Agar kam hain, apni knowledge se fill karo.\n\n"
        "RULE 2 — ALL DOMAINS MANDATORY (at least 2-3 events per domain):\n"
        "  (A) US macro data — NFP, CPI, PCE, GDP, retail sales, trade balance, ISM, PPI;\n"
        "  (B) Global central banks — Fed, ECB, BoE, BoJ, RBA, RBNZ, SNB, BoC, PBoC, RBI;\n"
        "  (C) Geopolitics — wars, sanctions, trade wars, elections, diplomacy;\n"
        "  (D) Equity markets — S&P 500, Nasdaq, DAX, Nikkei, Hang Seng, FTSE significant moves;\n"
        "  (E) Bond/yield markets — US 10Y, JGB, Bund, yield curve, credit spreads;\n"
        "  (F) Commodities — WTI/Brent crude, natural gas, copper, iron ore, wheat;\n"
        "  (G) Precious metals — Gold, Silver ETF flows, COMEX, central bank buying;\n"
        "  (H) Cryptocurrency — BTC, ETH, altcoins, spot ETF flows, regulatory news;\n"
        "  (I) Asia & Emerging markets — China, India, Japan, Korea, Australia specific data;\n"
        "  (J) FX-specific — intervention, carry trade, CFTC positioning, options expiry.\n\n"
        "RULE 3 — SORT BY IMPACT (descending):\n"
        "  Sabse pehle sabse zyada market-moving event — last mein least impactful.\n\n"
        "RULE 4 — REAL DATA ONLY:\n"
        "  Har event scraped URLs ya verified real-world news se lena hai. "
        "Koi placeholder, koi generic filler, koi hallucinated event nahi.\n\n"
        "RULE 5 — SYMBOL BREAKDOWNS:\n"
        "  Har symbol ke liye exactly 2 specific headlines, "
        "ek detailed breakdown (minimum 120 words), "
        "aur ek urgent trader alert likhna hai.\n\n"
        "Koi bhi field empty mat chhordo — har jagah real, substantive Hinglish content chahiye."
    )

    # ── 3. Call Gemini ────────────────────────────────────────────────────────
    payload = {
        "system_instruction": {
            "parts": [{"text": system_prompt}],
        },
        "contents": [
            {
                "role": "user",
                "parts": [{"text": user_message}],
            }
        ],
        "generationConfig": {
            "temperature":      0.4,    # lower = more factual, less hallucination
            "maxOutputTokens":  32768,  # 32k tokens for 25 events + 11 symbols
            "responseMimeType": "application/json",
        },
    }

    print(f"→ Calling Gemini ({GEMINI_MODEL})  session={session_label}  date={today}")
    print(f"  Scraped context: {'yes — ' + str(scraped_context.count(chr(10))) + ' lines' if has_scraped else 'no (scrapers empty)'}")

    resp = requests.post(GEMINI_URL, json=payload, timeout=240)

    if not resp.ok:
        print(f"[ERROR] HTTP {resp.status_code}: {resp.text[:600]}", file=sys.stderr)
        sys.exit(1)

    body = resp.json()

    try:
        raw_text = body["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as exc:
        print(f"[ERROR] Unexpected response shape: {exc}\n{body}", file=sys.stderr)
        sys.exit(1)

    # Strip any accidental markdown fences
    raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text.strip())
    raw_text = re.sub(r"\s*```$",          "", raw_text)

    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        print(f"[ERROR] Invalid JSON from Gemini: {exc}", file=sys.stderr)
        print(raw_text[:1000], file=sys.stderr)
        sys.exit(1)

    # ── 4. Validate event count ───────────────────────────────────────────────
    events = data.get("all_news_section", {}).get("high_impact_events", [])
    if len(events) < 25:
        print(
            f"[WARN] Gemini returned only {len(events)} high_impact_events (required ≥25). "
            "Consider re-running or increasing maxOutputTokens.",
            file=sys.stderr,
        )

    # ── 5. Save output ────────────────────────────────────────────────────────
    os.makedirs("public/data/news", exist_ok=True)
    filename = f"{today}_{SESSION_NAME}_news.json"
    filepath = os.path.join("public", "data", "news", filename)

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    symbols = list(data.get("symbol_wise_news", {}).keys())
    print(f"✓ Saved {filepath}")
    print(f"  Session        : {session_label}")
    print(f"  Language       : Hinglish")
    print(f"  Symbols        : {symbols}")
    print(f"  Impact events  : {len(events)} {'✓' if len(events) >= 25 else '⚠ BELOW 25'}")


if __name__ == "__main__":
    main()
