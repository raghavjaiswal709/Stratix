import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { TradeEntryModel } from "@/lib/models/TradeEntry";
import { getContractSize } from "@/lib/contract-sizes";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RawMT5Trade {
  openTime?: string;
  closeTime?: string;
  ticket?: string | number;
  type?: string;
  symbol?: string;
  volume?: number;
  openPrice?: number;
  closePrice?: number;
  sl?: number;
  tp?: number;
  profit?: number;
  commission?: number;
  swap?: number;
}

interface RawMT5Export {
  trades?: RawMT5Trade[];
  exportedAt?: string;
  source?: string;
}

interface NormalisedTrade {
  ticket: string;
  symbol: string;
  direction: "buy" | "sell";
  lots: number;
  entryPrice: number;
  exitPrice?: number;
  entryTime: Date;
  exitTime?: Date;
  stopLoss?: number;
  takeProfit?: number;
  profit: number;
  swap: number;
  commission: number;
  status: "open" | "closed";
}

export interface ConflictItem {
  ticket: string;
  symbol: string;
  current: {
    symbol: string;
    direction: string;
    lots: number;
    entryPrice: number;
    profit: number;
    status: string;
  };
  incoming: {
    symbol: string;
    direction: string;
    lots: number;
    entryPrice: number;
    profit: number;
    status: string;
  };
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

/**
 * Handles files containing one OR multiple top-level JSON objects
 * (e.g. two separate exports concatenated in one file).
 */
function parseMultiJson(text: string): RawMT5Export[] {
  const results: RawMT5Export[] = [];
  let depth = 0;
  let start = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          const obj = JSON.parse(text.slice(start, i + 1)) as RawMT5Export;
          if (obj && Array.isArray(obj.trades)) {
            results.push(obj);
          }
        } catch {
          // skip malformed chunk
        }
        start = -1;
      }
    }
  }

  return results;
}

/** MT5 uses "YYYY.MM.DD HH:MM:SS" */
function parseMt5Date(s: string | undefined): Date | undefined {
  if (!s || s.trim() === "") return undefined;
  const normalised = s.trim().replace(/\./g, "-").replace(" ", "T") + "Z";
  const d = new Date(normalised);
  return isNaN(d.getTime()) ? undefined : d;
}

/** Strip non-alphanumeric chars (e.g. trailing dot in "XAUUSD.") */
function cleanSymbol(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalise(raw: RawMT5Trade): NormalisedTrade | null {
  const entryTime = parseMt5Date(raw.openTime);
  if (!entryTime) return null;

  const symbol = cleanSymbol(raw.symbol ?? "");
  if (!symbol) return null;

  const direction: "buy" | "sell" = (raw.type ?? "").toLowerCase().includes("sell")
    ? "sell"
    : "buy";

  const ticket = String(raw.ticket ?? `gen-${entryTime.getTime()}-${symbol}`);
  const lots = raw.volume ?? 0.01;
  const entryPrice = raw.openPrice ?? 0;
  if (entryPrice === 0) return null;

  const exitPrice =
    raw.closePrice && raw.closePrice > 0 ? raw.closePrice : undefined;
  const exitTime = raw.closeTime ? parseMt5Date(raw.closeTime) : undefined;
  const status: "open" | "closed" =
    exitPrice !== undefined && exitTime !== undefined ? "closed" : "open";

  return {
    ticket,
    symbol,
    direction,
    lots,
    entryPrice,
    exitPrice: status === "closed" ? exitPrice : undefined,
    entryTime,
    exitTime: status === "closed" ? exitTime : undefined,
    stopLoss: raw.sl && raw.sl > 0 ? raw.sl : undefined,
    takeProfit: raw.tp && raw.tp > 0 ? raw.tp : undefined,
    profit: raw.profit ?? 0,
    swap: raw.swap ?? 0,
    commission: raw.commission ?? 0,
    status,
  };
}

/**
 * Merge all exports, de-duplicate by ticket.
 * When the same ticket appears more than once, prefer the record that has
 * closePrice (more complete) — typical when the user uploads multiple exports.
 */
function buildTradeMap(exports: RawMT5Export[]): Map<string, NormalisedTrade> {
  const map = new Map<string, NormalisedTrade>();

  for (const exp of exports) {
    for (const raw of exp.trades ?? []) {
      const t = normalise(raw);
      if (!t) continue;

      const existing = map.get(t.ticket);
      if (!existing) {
        map.set(t.ticket, t);
      } else {
        // Prefer the version with an exit price (closed trade)
        if (t.exitPrice !== undefined && existing.exitPrice === undefined) {
          map.set(t.ticket, t);
        }
      }
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolution = req.nextUrl.searchParams.get("resolution"); // "skip" | "replace" | null

  // --- Read file body ---
  let jsonText: string;
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    jsonText = await (file as File).text();
  } else {
    jsonText = await req.text();
  }

  if (!jsonText.trim()) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }

  // --- Parse ---
  const exports = parseMultiJson(jsonText);
  if (exports.length === 0) {
    return NextResponse.json(
      {
        error:
          "Could not parse file. Make sure it is an MT5 Trade Extractor JSON export.",
      },
      { status: 422 }
    );
  }

  const tradeMap = buildTradeMap(exports);
  const trades = Array.from(tradeMap.values());

  if (trades.length === 0) {
    return NextResponse.json(
      { error: "No valid trades found in the file." },
      { status: 422 }
    );
  }

  await dbConnect();
  const userId = session.user.id;
  const tickets = trades.map((t) => t.ticket);

  // --- Conflict detection (first call, no resolution) ---
  if (!resolution) {
    type ExistingDoc = {
      ticket: string;
      symbol: string;
      direction: string;
      lots: number;
      entryPrice: number;
      profit: number;
      status: string;
    };

    const existing = (await TradeEntryModel.find(
      { userId, ticket: { $in: tickets } },
      { ticket: 1, symbol: 1, direction: 1, lots: 1, entryPrice: 1, profit: 1, status: 1 }
    ).lean()) as ExistingDoc[];

    if (existing.length > 0) {
      const existingByTicket = new Map(existing.map((e) => [e.ticket, e]));

      const conflicts: ConflictItem[] = trades
        .filter((t) => existingByTicket.has(t.ticket))
        .map((t) => {
          const curr = existingByTicket.get(t.ticket)!;
          return {
            ticket: t.ticket,
            symbol: t.symbol,
            current: {
              symbol: curr.symbol,
              direction: curr.direction,
              lots: curr.lots,
              entryPrice: curr.entryPrice,
              profit: curr.profit,
              status: curr.status,
            },
            incoming: {
              symbol: t.symbol,
              direction: t.direction,
              lots: t.lots,
              entryPrice: t.entryPrice,
              profit: t.profit,
              status: t.status,
            },
          };
        });

      return NextResponse.json(
        {
          conflicts,
          total: trades.length,
          newCount: trades.length - conflicts.length,
          conflictCount: conflicts.length,
        },
        { status: 409 }
      );
    }
  }

  // --- Apply resolution ---
  let toProcess = trades;

  if (resolution === "skip") {
    // Re-query to be safe (state may have changed between two requests)
    const existing = (await TradeEntryModel.find(
      { userId, ticket: { $in: tickets } },
      { ticket: 1 }
    ).lean()) as { ticket: string }[];
    const existingSet = new Set(existing.map((e) => e.ticket));
    toProcess = trades.filter((t) => !existingSet.has(t.ticket));
  }
  // resolution === "replace" → toProcess = all trades (default already)

  if (toProcess.length === 0) {
    return NextResponse.json({
      ok: true,
      imported: 0,
      updated: 0,
      skipped: trades.length,
      total: trades.length,
    });
  }

  const now = new Date();
  const leverage = 100;

  const ops = toProcess.map((t) => {
    const contractSize = getContractSize(t.symbol);
    const margin = (t.entryPrice * t.lots * contractSize) / leverage;

    return {
      updateOne: {
        filter: { userId, ticket: t.ticket },
        update: {
          $set: {
            userId,
            ticket: t.ticket,
            symbol: t.symbol,
            direction: t.direction,
            lots: t.lots,
            entryPrice: t.entryPrice,
            exitPrice: t.exitPrice,
            entryTime: t.entryTime,
            exitTime: t.exitTime,
            stopLoss: t.stopLoss,
            takeProfit: t.takeProfit,
            profit: t.profit,
            swap: t.swap,
            commission: t.commission,
            leverage,
            margin,
            status: t.status,
            source: "mt5" as const,
            updatedAt: now,
          },
          $setOnInsert: {
            timeframe: "",
            journaled: false,
            executionChecklist: [
              { item: "Checked higher timeframe", checked: false },
              { item: "Risk within limits", checked: false },
              { item: "Fits my trading plan", checked: false },
              { item: "Key levels identified", checked: false },
              { item: "Economic calendar checked", checked: false },
            ],
            screenshots: [],
            preTradeAnalysis: "",
            postTradeReview: "",
            riskRatio: 1,
            rewardRatio: 2,
            emotions: "",
            lessonsLearned: "",
            tags: [],
            rating: 5,
            createdAt: now,
          },
        },
        upsert: true,
      },
    };
  });

  const result = await TradeEntryModel.bulkWrite(ops, { ordered: false });

  return NextResponse.json({
    ok: true,
    imported: result.upsertedCount,
    updated: result.modifiedCount,
    skipped: trades.length - toProcess.length,
    total: trades.length,
  });
}
