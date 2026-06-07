"""
Gemini-powered Hinglish news analysis generator.
Called by .github/workflows/news_analysis.yml before each major trading session.
Reads config/gemini_news_instructions.txt + config/news_template.json,
calls Gemini 2.0 Flash, and writes Hinglish JSON to public/data/news/.
"""

import json
import os
import re
import sys
from datetime import datetime, timezone

import requests

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

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta"
    "/models/gemini-2.0-flash:generateContent"
    f"?key={GEMINI_API_KEY}"
)


def _read(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read().strip()


def main() -> None:
    system_prompt = _read("config/gemini_news_instructions.txt")
    template_raw  = _read("config/news_template.json")

    session_label = SESSION_LABELS.get(SESSION_NAME, "Asian")
    today         = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    generated_at  = datetime.now(timezone.utc).isoformat()

    user_message = (
        f"Aaj ka UTC date hai {today}. "
        f"Aane wala session hai {session_label} Session.\n\n"
        "Pichle 24 ghante ki saari important global financial news analyze karo: "
        "major economic data releases (NFP, CPI, GDP, PMI, retail sales), "
        "central bank decisions aur speeches (Fed, ECB, BoE, BoJ, RBA, RBNZ, SNB, BoC), "
        "geopolitical developments, equity market moves, bond yield changes, "
        "commodity price swings, aur crypto market events.\n\n"
        "In symbols ke liye complete news breakdown chahiye: "
        "XAUUSD, XAGUSD, BTCUSDT, ETHUSD, GBPUSD, EURUSD, USDJPY, "
        "AUDUSD, NZDUSD, USDCAD, USDCHF.\n\n"
        "Saara content Hinglish mein likhna hai — English alphabet use karo "
        "lekin Hindi aur English ka natural, conversational mix rakhna. "
        "Jaise ek senior trader dost baat kar raha ho kisi retail trader se.\n\n"
        "Ek single valid JSON object output karo jo is schema ko exactly match kare:\n\n"
        f"{template_raw}\n\n"
        f"Yeh fields zaroor set karo: "
        f"meta.generated_at = \"{generated_at}\", "
        f"meta.date = \"{today}\", "
        f"meta.session = \"{session_label}\", "
        f"meta.language = \"Hinglish\". "
        "CRITICAL REQUIREMENT — all_news_section ke high_impact_events mein STRICTLY 10 se 12 "
        "events dalne zaroori hain — koi bhi kami BILKUL acceptable nahi. "
        "Yeh events SAARE major global domains se cover karne hain, ek bhi domain skip mat karo: "
        "(1) US macro data — NFP, CPI, PCE, GDP, retail sales, ISM/PMI; "
        "(2) Global central bank actions aur speeches — Fed, ECB, BoE, BoJ, RBA, RBNZ, SNB, BoC, PBoC; "
        "(3) Geopolitical events — wars, sanctions, diplomatic developments, trade wars; "
        "(4) Equity markets — S&P 500, Nasdaq, DAX, Nikkei, Hang Seng ke significant moves; "
        "(5) Bond markets — US 10Y yield, JGB, Bund moves aur yield curve changes; "
        "(6) Commodities — crude oil (WTI/Brent), natural gas, iron ore, copper ke price moves; "
        "(7) Precious metals — Gold aur Silver ke ETF flows, COMEX positioning, demand drivers; "
        "(8) Cryptocurrency — BTC, ETH, regulatory news, spot ETF inflows/outflows; "
        "(9) Asia & Emerging markets — China PMI/trade/PBoC, India, Japan specific data; "
        "(10) FX market developments — intervention warnings, carry trade flows, CFTC positioning. "
        "MANDATORY SORTING: Sabse pehle sabse zyada market-moving event likhna hai — "
        "high to low impact ke order mein sort karo. "
        "Yeh sab real, verified news se lena hai — koi procrastination nahi, "
        "koi filler events nahi — minimum 10 events aur maximum 12 events, strict hai yeh. "
        "Har symbol ke liye exactly 2 headlines, ek detailed breakdown (min 100 words), "
        "aur ek specific trader alert dalna hai. "
        "Koi placeholder, empty string, ya template text nahi chahiye — "
        "har field mein real, substantive Hinglish content hona chahiye."
    )

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
            "temperature":      0.55,
            "maxOutputTokens":  8192,
            "responseMimeType": "application/json",
        },
    }

    print(f"→ Calling Gemini API  session={session_label}  date={today}  lang=Hinglish")
    resp = requests.post(GEMINI_URL, json=payload, timeout=180)

    if not resp.ok:
        print(f"[ERROR] HTTP {resp.status_code}: {resp.text[:400]}", file=sys.stderr)
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
        print(raw_text[:800], file=sys.stderr)
        sys.exit(1)

    os.makedirs("public/data/news", exist_ok=True)
    filename = f"{today}_{SESSION_NAME}_news.json"
    filepath = os.path.join("public", "data", "news", filename)

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    symbols = list(data.get("symbol_wise_news", {}).keys())
    events  = len(data.get("all_news_section", {}).get("high_impact_events", []))
    print(f"✓ Saved {filepath}")
    print(f"  Session        : {session_label}")
    print(f"  Language       : Hinglish")
    print(f"  Symbols        : {symbols}")
    print(f"  Impact events  : {events}")


if __name__ == "__main__":
    main()
