import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { TradeEntryModel } from "@/lib/models/TradeEntry";
import { getContractSize } from "@/lib/contract-sizes";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// MT5 CSV formats we accept
//
// FORMAT A — "History" report from MT5 mobile (most common):
//   Ticket, Open Time, Type, Size, Symbol, Price, S/L, T/P,
//   Close Time, Close Price, Commission, Swap, Profit
//
// FORMAT B — MT5 desktop "Account History" (also exported by mobile):
//   #, Time, Deal, Symbol, Type, Direction, Volume, Price, Order,
//   Commission, Swap, Profit, Balance, Comment
//
// FORMAT C — MT5 desktop detailed report:
//   Open Time, Ticket, Symbol, Type, Volume, Open Price, S/L, T/P,
//   Close Time, Close Price, Commission, Taxes, Swap, Profit
//
// We normalise all three into a common structure.
// ---------------------------------------------------------------------------

interface ParsedTrade {
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

function num(v: string | undefined): number {
  if (!v) return 0;
  const n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function parseDate(v: string | undefined): Date | undefined {
  if (!v || v.trim() === "" || v === "0" || v === "-") return undefined;
  // MT5 uses "YYYY.MM.DD HH:MM:SS" or "YYYY-MM-DD HH:MM:SS"
  const normalised = v.trim().replace(/\./g, "-").replace(" ", "T") + (v.includes("T") ? "" : "Z");
  const d = new Date(normalised);
  return isNaN(d.getTime()) ? undefined : d;
}

function normaliseHeaders(raw: string[]): string[] {
  return raw.map((h) =>
    h
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
  );
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  // Find the header row — skip rows that are section headers / summary lines
  let headerIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const lower = lines[i].toLowerCase();
    if (
      lower.includes("ticket") ||
      lower.includes("open time") ||
      lower.includes("time") ||
      lower.includes("symbol")
    ) {
      headerIdx = i;
      break;
    }
  }

  const headers = normaliseHeaders(lines[headerIdx].split(","));
  const rows: Record<string, string>[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    // Skip summary/blank rows — they usually have very few non-empty cells
    const nonEmpty = cells.filter((c) => c.trim() !== "").length;
    if (nonEmpty < 4) continue;
    // Skip rows that look like section titles (no numbers at all)
    if (!/\d/.test(lines[i])) continue;

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] ?? "").trim();
    });
    rows.push(row);
  }

  return rows;
}

function detectDirection(typeStr: string): "buy" | "sell" {
  const t = typeStr.toLowerCase();
  if (t.includes("buy") || t === "in" || t === "0") return "buy";
  if (t.includes("sell") || t === "out" || t === "1") return "sell";
  return "buy";
}

function mapRow(row: Record<string, string>): ParsedTrade | null {
  const h = row;

  // ── Detect format ──────────────────────────────────────────────────────────

  // Format A / C — has "ticket" or "#" as first field
  const ticket = h["ticket"] ?? h["#"] ?? h["order"] ?? h["deal"] ?? "";
  const symbol = (h["symbol"] ?? "").toUpperCase();
  if (!symbol || symbol === "BALANCE" || symbol === "CREDIT") return null;

  const typeStr = h["type"] ?? h["direction"] ?? "";
  const direction = detectDirection(typeStr);

  // Lots / volume
  const lots = num(h["size"] ?? h["volume"] ?? h["lots"] ?? "0");

  // Entry
  const entryPrice = num(h["price"] ?? h["openprice"] ?? h["open"] ?? "0");
  const entryTime = parseDate(h["opentime"] ?? h["time"] ?? h["open"]);
  if (!entryTime) return null;
  if (entryPrice === 0) return null;

  // Exit
  const exitPrice = num(h["closeprice"] ?? h["close"] ?? "0") || undefined;
  const exitTime = parseDate(h["closetime"] ?? h["close"]);

  const stopLoss = num(h["sl"] ?? h["stoploss"] ?? h["s/l"] ?? "0") || undefined;
  const takeProfit = num(h["tp"] ?? h["takeprofit"] ?? h["t/p"] ?? "0") || undefined;
  const profit = num(h["profit"] ?? "0");
  const swap = num(h["swap"] ?? "0");
  const commission = num(h["commission"] ?? "0");

  const status: "open" | "closed" = exitPrice && exitTime ? "closed" : "open";

  return {
    ticket: ticket || `csv-${entryTime.getTime()}-${symbol}`,
    symbol,
    direction,
    lots: lots || 1,
    entryPrice,
    exitPrice: status === "closed" ? exitPrice : undefined,
    entryTime,
    exitTime: status === "closed" ? exitTime : undefined,
    stopLoss,
    takeProfit,
    profit,
    swap,
    commission,
    status,
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let csvText: string;
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    csvText = await (file as File).text();
  } else {
    // Raw text/csv body
    csvText = await req.text();
  }

  if (!csvText.trim()) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }

  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Could not parse CSV — check it matches MT5 history export format" },
      { status: 422 }
    );
  }

  const parsed: ParsedTrade[] = [];
  const skipped: number[] = [];

  rows.forEach((row, idx) => {
    const trade = mapRow(row);
    if (trade) parsed.push(trade);
    else skipped.push(idx + 1);
  });

  if (parsed.length === 0) {
    return NextResponse.json(
      { error: "No valid trades found. Make sure you export from MT5 → History → Report." },
      { status: 422 }
    );
  }

  await dbConnect();
  const userId = session.user.id;
  const now = new Date();
  const leverage = 100;

  const ops = parsed.map((t) => {
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
    total: parsed.length,
    skippedRows: skipped.length,
  });
}
