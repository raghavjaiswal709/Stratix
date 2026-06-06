"""
Gemini-powered market analysis generator.
Called by .github/workflows/market_analysis.yml before each major trading session.
Reads config/gemini_instructions.txt and config/session_template.json, calls
Gemini 2.0 Flash, and writes the JSON report to public/reports/.
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
    system_prompt = _read("config/gemini_instructions.txt")
    template_raw  = _read("config/session_template.json")

    session_label = SESSION_LABELS.get(SESSION_NAME, "Asian")
    today         = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    generated_at  = datetime.now(timezone.utc).isoformat()

    user_message = (
        f"Today's UTC date is {today}. "
        f"The upcoming session is the {session_label} session.\n\n"
        "Analyze the past 24 hours of global events for the following instruments: "
        "XAUUSD, XAGUSD, BTCUSDT, ETHUSD, GBPUSD, EURUSD, USDJPY, "
        "AUDUSD, NZDUSD, USDCAD, USDCHF.\n\n"
        "Cover: major economic releases and their beat/miss vs consensus, central bank "
        "speeches, geopolitical developments, equity and bond market moves, "
        "DXY direction, commodity complex overview, ETF flows where applicable, "
        "CFTC positioning, options market signals, intermarket correlations, "
        "and the prevailing risk-on/risk-off regime.\n\n"
        "Output a single raw JSON object strictly matching this schema (populate every "
        "field with detailed institutional-grade content — no placeholders):\n\n"
        f"{template_raw}\n\n"
        f"Set meta.generated_at = \"{generated_at}\", "
        f"meta.date = \"{today}\", "
        f"meta.session = \"{session_label}\". "
        "Use arrays of 3–5 real price floats for key_levels.resistance and key_levels.support. "
        "Each session_outlook must be at least 150 words with specific entry zones, "
        "price targets, and invalidation levels."
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
            "temperature":       0.35,
            "maxOutputTokens":   8192,
            "responseMimeType":  "application/json",
        },
    }

    print(f"→ Calling Gemini API  session={session_label}  date={today}")
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

    # Strip any accidental markdown fences Gemini might add
    raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text.strip())
    raw_text = re.sub(r"\s*```$",          "", raw_text)

    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        print(f"[ERROR] Invalid JSON from Gemini: {exc}", file=sys.stderr)
        print(raw_text[:800], file=sys.stderr)
        sys.exit(1)

    os.makedirs("public/reports", exist_ok=True)
    filename = f"{today}_{SESSION_NAME}_session.json"
    filepath = os.path.join("public", "reports", filename)

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    symbols = list(data.get("symbols", {}).keys())
    print(f"✓ Saved {filepath}")
    print(f"  Session : {session_label}")
    print(f"  Symbols : {symbols}")


if __name__ == "__main__":
    main()
