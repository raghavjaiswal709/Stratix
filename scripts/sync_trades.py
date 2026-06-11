"""
sync_trades.py — Fetches MT5 deal history via MetaApi and upserts into MongoDB
                 tradeentries collection (matches the Stratix TradeEntry schema).

Deals are paired by positionId (DEAL_ENTRY_IN + DEAL_ENTRY_OUT) to produce
complete trade records with entry/exit price, time, and P&L.

Modes:
  Single account:   ACCOUNT_ID env var is set (workflow_dispatch trigger)
  All users:        ACCOUNT_ID is empty/unset (scheduled run)

Collection written:
  tradeentries  — matches Mongoose TradeEntry model (userId + ticket as upsert key)
  sync_log      — one document per account per run

Required environment variables:
  METAAPI_TOKEN  — from app.metaapi.cloud
  MONGODB_URI    — MongoDB Atlas connection string (db name must be in URI)
  ACCOUNT_ID     — (optional) MetaApi account ID; if blank, all users are synced
"""

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

from metaapi_cloud_sdk import MetaApi
from pymongo import MongoClient, UpdateOne

METAAPI_TOKEN = os.environ["METAAPI_TOKEN"]
MONGODB_URI = os.environ["MONGODB_URI"]
ACCOUNT_ID = os.environ.get("ACCOUNT_ID", "").strip()

# Only these deal types represent real trades (filter out balance/credit/etc.)
TRADE_DEAL_TYPES = {"DEAL_TYPE_BUY", "DEAL_TYPE_SELL"}

# Default checklist items matching the Mongoose schema default
DEFAULT_CHECKLIST = [
    {"item": "A+ level", "checked": False},
    {"item": "Other Levels", "checked": False},
    {"item": "Confirmation", "checked": False},
    {"item": "RiskFree", "checked": False},
    {"item": "Risk Management", "checked": False},
    {"item": "News", "checked": False},
    {"item": "Multi timeframe analysis", "checked": False},
]


def _to_dict(obj) -> dict:
    """Convert a MetaApi SDK object to a plain dict if needed."""
    if isinstance(obj, dict):
        return obj
    return vars(obj) if hasattr(obj, "__dict__") else dict(obj)


def _resolve_user_id(db, account_id: str) -> str | None:
    """Look up the Stratix userId for a MetaApi account from mt5configs."""
    doc = db.mt5configs.find_one({"mt5AccountId": account_id}, {"userId": 1})
    return doc["userId"] if doc else None


def _parse_time(val) -> datetime | None:
    """Normalise MetaApi time values (datetime, ISO string, or None)."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val if val.tzinfo else val.replace(tzinfo=timezone.utc)
    try:
        dt = datetime.fromisoformat(str(val))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _build_trade_entries(deals: list[dict], user_id: str) -> list[dict]:
    """
    Pair DEAL_ENTRY_IN and DEAL_ENTRY_OUT deals by positionId to produce
    complete trade records matching the TradeEntry Mongoose schema.
    """
    opens: dict[str, dict] = {}   # positionId → opening deal
    closes: dict[str, dict] = {}  # positionId → closing deal

    for deal in deals:
        if deal.get("type") not in TRADE_DEAL_TYPES:
            continue
        pos_id = str(deal.get("positionId") or deal.get("id") or "")
        if not pos_id:
            continue
        entry_type = deal.get("entryType", "")
        if entry_type == "DEAL_ENTRY_IN":
            opens[pos_id] = deal
        elif entry_type in ("DEAL_ENTRY_OUT", "DEAL_ENTRY_INOUT", "DEAL_ENTRY_OUT_BY"):
            closes[pos_id] = deal

    now = datetime.now(timezone.utc)
    entries = []

    for pos_id, open_deal in opens.items():
        close_deal = closes.get(pos_id)

        direction = "buy" if open_deal.get("type") == "DEAL_TYPE_BUY" else "sell"
        lots = float(open_deal.get("volume") or 0)
        entry_price = float(open_deal.get("price") or 0)
        entry_time = _parse_time(open_deal.get("time")) or now
        stop_loss = open_deal.get("stopLoss") or None
        take_profit = open_deal.get("takeProfit") or None
        open_commission = float(open_deal.get("commission") or 0)

        if close_deal:
            exit_price = float(close_deal.get("price") or 0)
            exit_time = _parse_time(close_deal.get("time")) or now
            profit = float(close_deal.get("profit") or 0)
            swap = float(close_deal.get("swap") or 0)
            commission = open_commission + float(close_deal.get("commission") or 0)
            status = "closed"
        else:
            # Position still open — only entry side exists
            exit_price = None
            exit_time = None
            profit = 0.0
            swap = float(open_deal.get("swap") or 0)
            commission = open_commission
            status = "open"

        ticket = str(open_deal.get("id") or pos_id)
        leverage = 100
        margin = (entry_price * lots) / leverage if entry_price and lots else 0.0

        entries.append({
            "userId": user_id,
            "ticket": ticket,
            "symbol": (open_deal.get("symbol") or "").upper(),
            "direction": direction,
            "lots": lots,
            "entryPrice": entry_price,
            "exitPrice": exit_price,
            "entryTime": entry_time,
            "exitTime": exit_time,
            "stopLoss": stop_loss,
            "takeProfit": take_profit,
            "profit": profit,
            "swap": swap,
            "commission": commission,
            "leverage": leverage,
            "margin": margin,
            "status": status,
            "source": "mt5",
            "timeframe": "",
            "journaled": False,
            "executionChecklist": DEFAULT_CHECKLIST,
            "screenshots": [],
            "preTradeAnalysis": "",
            "postTradeReview": "",
            "riskRatio": 1,
            "rewardRatio": 2,
            "emotions": "",
            "lessonsLearned": "",
            "tags": [],
            "rating": 5,
            "updatedAt": now,
        })

    return entries


async def sync_account(api: MetaApi, db, account_id: str) -> None:
    """Sync a single MetaApi account into MongoDB tradeentries collection."""
    print(f"\n── Syncing account {account_id} ──")

    user_id = _resolve_user_id(db, account_id)
    if not user_id:
        print(f"  No userId found in mt5configs for account {account_id} — skipping.")
        return

    try:
        account = await api.metatrader_account_api.get_account(account_id)

        if account.state not in ("DEPLOYED", "DEPLOYING"):
            print(f"  Deploying account …")
            await account.deploy()

        print(f"  Waiting for account connection …")
        await account.wait_connected()

        connection = account.get_rpc_connection()
        await connection.connect()
        await connection.wait_synchronized()

        # ── Deal history (last 90 days) ──────────────────────────────────
        from_time = datetime.now(timezone.utc) - timedelta(days=90)
        to_time = datetime.now(timezone.utc)

        print(f"  Fetching deals {from_time.date()} → {to_time.date()} …")
        raw_deals = await connection.get_deals_by_time_range(from_time, to_time)
        await connection.close()

        deals = [_to_dict(d) for d in (raw_deals or [])]
        print(f"  Fetched {len(deals)} raw deals")

        # ── Map deals → TradeEntry documents and upsert ──────────────────
        entries = _build_trade_entries(deals, user_id)
        print(f"  Built {len(entries)} trade entries")

        inserted = updated = 0
        if entries:
            ops = [
                UpdateOne(
                    # Upsert key: userId + MT5 ticket (unique per trade)
                    {"userId": e["userId"], "ticket": e["ticket"]},
                    {
                        # Always overwrite trade data fields
                        "$set": {
                            k: v for k, v in e.items()
                            if k not in ("executionChecklist", "screenshots", "tags",
                                         "journaled", "preTradeAnalysis", "postTradeReview",
                                         "emotions", "lessonsLearned", "rating", "riskRatio",
                                         "rewardRatio", "timeframe")
                        },
                        # Only set journal fields on first insert (don't overwrite user edits)
                        "$setOnInsert": {
                            "executionChecklist": e["executionChecklist"],
                            "screenshots": [],
                            "tags": [],
                            "journaled": False,
                            "preTradeAnalysis": "",
                            "postTradeReview": "",
                            "emotions": "",
                            "lessonsLearned": "",
                            "riskRatio": 1,
                            "rewardRatio": 2,
                            "timeframe": "",
                            "rating": 5,
                            "createdAt": datetime.now(timezone.utc),
                        },
                    },
                    upsert=True,
                )
                for e in entries
                if e.get("ticket")
            ]
            if ops:
                result = db.tradeentries.bulk_write(ops, ordered=False)
                inserted = result.upserted_count
                updated = result.modified_count

        db.sync_log.insert_one({
            "status": "success",
            "accountId": account_id,
            "userId": user_id,
            "inserted": inserted,
            "updated": updated,
            "total": len(entries),
            "timestamp": datetime.now(timezone.utc),
        })
        print(f"  Done — inserted: {inserted}, updated: {updated}, total: {len(entries)}")

    except Exception as exc:  # noqa: BLE001
        print(f"  Sync failed: {exc}", file=sys.stderr)
        try:
            db.sync_log.insert_one({
                "status": "error",
                "accountId": account_id,
                "error": str(exc),
                "timestamp": datetime.now(timezone.utc),
            })
        except Exception:  # noqa: BLE001
            pass
        raise


async def main() -> None:
    api = MetaApi(METAAPI_TOKEN)
    client = MongoClient(MONGODB_URI)
    db = client.get_default_database()

    try:
        if ACCOUNT_ID:
            # Single-account mode (workflow_dispatch with account_id input)
            await sync_account(api, db, ACCOUNT_ID)
        else:
            # Scheduled mode: loop all users with connected MT5 accounts
            connected = list(
                db.mt5configs.find(
                    {"connected": True, "mt5AccountId": {"$exists": True, "$ne": ""}},
                    {"mt5AccountId": 1},
                )
            )
            print(f"Scheduled run: {len(connected)} connected account(s) found")
            if not connected:
                print("Nothing to sync.")
                return
            for doc in connected:
                acc_id = doc.get("mt5AccountId")
                if acc_id:
                    try:
                        await sync_account(api, db, acc_id)
                    except Exception:  # noqa: BLE001
                        pass  # Continue to next account
    finally:
        await api.close()
        client.close()


if __name__ == "__main__":
    asyncio.run(main())

