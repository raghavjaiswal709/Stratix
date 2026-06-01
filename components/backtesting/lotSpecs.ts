// ─── lotSpecs.ts ──────────────────────────────────────────────────────────────
// MT5-accurate lot specifications and P&L calculation for every backtesting
// instrument. Matches real broker settings for retail trading accounts.
//
// P&L formula:
//   direct   → (exitPrice − entryPrice) × contractSize × lots × dir
//   indirect → (exitPrice − entryPrice) × contractSize × lots × dir ÷ exitPrice
//
// "indirect" = USD is the BASE currency (USDJPY, USDCAD, USDCHF). The quote
// currency P&L must be divided by the exit price to convert back to USD.

export type PnlType = "direct" | "indirect";

export interface LotSpec {
  minLot:       number;    // smallest allowed position (e.g. 0.01)
  maxLot:       number;    // largest allowed position
  lotStep:      number;    // increment/decrement step
  contractSize: number;    // units per 1.00 standard lot
  pnlType:      PnlType;
  pipSize:      number;    // one pip in price terms (for display only)
  label:        string;    // human-readable description
}

export const LOT_SPECS: Record<string, LotSpec> = {
  // ── Metals ──────────────────────────────────────────────────────────────────
  // XAUUSD: 1 lot = 100 troy oz. $1 move on 0.01 lot = $1.00
  xauusd: {
    minLot: 0.01, maxLot: 500, lotStep: 0.01,
    contractSize: 100, pnlType: "direct", pipSize: 0.01,
    label: "Gold (oz)",
  },
  // XAGUSD: 1 lot = 5 000 troy oz. $0.01 move on 0.01 lot = $0.50
  xagusd: {
    minLot: 0.01, maxLot: 500, lotStep: 0.01,
    contractSize: 5000, pnlType: "direct", pipSize: 0.001,
    label: "Silver (oz)",
  },

  // ── Forex — USD-quoted (profit directly in USD) ───────────────────────────
  // Standard lot = 100 000 units. 1 pip (0.0001) on 1 lot = $10.
  eurusd: {
    minLot: 0.01, maxLot: 500, lotStep: 0.01,
    contractSize: 100000, pnlType: "direct", pipSize: 0.0001,
    label: "EUR/USD",
  },
  gbpusd: {
    minLot: 0.01, maxLot: 500, lotStep: 0.01,
    contractSize: 100000, pnlType: "direct", pipSize: 0.0001,
    label: "GBP/USD",
  },
  audusd: {
    minLot: 0.01, maxLot: 500, lotStep: 0.01,
    contractSize: 100000, pnlType: "direct", pipSize: 0.0001,
    label: "AUD/USD",
  },
  nzdusd: {
    minLot: 0.01, maxLot: 500, lotStep: 0.01,
    contractSize: 100000, pnlType: "direct", pipSize: 0.0001,
    label: "NZD/USD",
  },

  // ── Forex — USD-base (P&L in quote currency → ÷ exitPrice for USD) ────────
  // USDJPY at 150: 1 pip (0.01) on 1 lot → ¥1 000 / 150 ≈ $6.67
  usdjpy: {
    minLot: 0.01, maxLot: 500, lotStep: 0.01,
    contractSize: 100000, pnlType: "indirect", pipSize: 0.01,
    label: "USD/JPY",
  },
  usdcad: {
    minLot: 0.01, maxLot: 500, lotStep: 0.01,
    contractSize: 100000, pnlType: "indirect", pipSize: 0.0001,
    label: "USD/CAD",
  },
  usdchf: {
    minLot: 0.01, maxLot: 500, lotStep: 0.01,
    contractSize: 100000, pnlType: "indirect", pipSize: 0.0001,
    label: "USD/CHF",
  },

  // ── Crypto ───────────────────────────────────────────────────────────────
  // 1 lot = 1 coin. $1 move on 0.01 lot = $0.01.
  btcusdt: {
    minLot: 0.01, maxLot: 100, lotStep: 0.01,
    contractSize: 1, pnlType: "direct", pipSize: 1,
    label: "Bitcoin",
  },
  ethusd: {
    minLot: 0.01, maxLot: 100, lotStep: 0.01,
    contractSize: 1, pnlType: "direct", pipSize: 0.01,
    label: "Ethereum",
  },

  // ── Indices ──────────────────────────────────────────────────────────────
  // US100 / NASDAQ-100: contract size 100. 0.1 lot, 1 point move = $10.
  us100: {
    minLot: 0.10, maxLot: 500, lotStep: 0.10,
    contractSize: 100, pnlType: "direct", pipSize: 1,
    label: "NASDAQ 100",
  },
  // DXY (Dollar Index): contract size 100. Mostly for analysis.
  dxy: {
    minLot: 0.10, maxLot: 500, lotStep: 0.10,
    contractSize: 100, pnlType: "direct", pipSize: 0.001,
    label: "DXY Index",
  },
  // WTI Crude Oil: contract size 1 000 barrels. 0.01 lot, $1 move = $10.
  usoil: {
    minLot: 0.01, maxLot: 500, lotStep: 0.01,
    contractSize: 1000, pnlType: "direct", pipSize: 0.01,
    label: "WTI Oil (bbl)",
  },
};

// Fallback for any unknown symbol
const DEFAULT_SPEC: LotSpec = {
  minLot: 0.01, maxLot: 500, lotStep: 0.01,
  contractSize: 1, pnlType: "direct", pipSize: 0.0001,
  label: "Unknown",
};

export function getLotSpec(symbol: string): LotSpec {
  return LOT_SPECS[symbol.toLowerCase()] ?? DEFAULT_SPEC;
}

// ── P&L calculation ───────────────────────────────────────────────────────────

/**
 * Realised P&L in USD for a closed trade.
 * @param direction "LONG" | "SHORT"
 * @param entryPrice price at open
 * @param exitPrice  price at close
 * @param lots       position size in lots
 * @param spec       instrument lot specification
 */
export function calcPnl(
  direction: "LONG" | "SHORT",
  entryPrice: number,
  exitPrice: number,
  lots: number,
  spec: LotSpec,
): number {
  const dir       = direction === "LONG" ? 1 : -1;
  const priceDiff = (exitPrice - entryPrice) * dir;
  const raw       = priceDiff * spec.contractSize * lots;
  // Indirect pairs: P&L is in quote currency, divide by exit price to get USD
  return spec.pnlType === "indirect" ? raw / exitPrice : raw;
}

/**
 * Unrealised P&L in USD for an open trade.
 */
export function calcUnrealisedPnl(
  direction: "LONG" | "SHORT",
  entryPrice: number,
  currentPrice: number,
  lots: number,
  spec: LotSpec,
): number {
  return calcPnl(direction, entryPrice, currentPrice, lots, spec);
}

/**
 * Round a lot value to the nearest valid step for an instrument.
 */
export function snapLot(lots: number, spec: LotSpec): number {
  const decimals = spec.lotStep < 0.1 ? 2 : 1;
  const snapped  = Math.round(lots / spec.lotStep) * spec.lotStep;
  return +Math.min(spec.maxLot, Math.max(spec.minLot, snapped)).toFixed(decimals);
}

/**
 * Return the $ value of one pip for a given lot size (for display in the UI).
 */
export function pipValue(spec: LotSpec, lots: number, price: number): number {
  const raw = spec.pipSize * spec.contractSize * lots;
  return spec.pnlType === "indirect" ? raw / price : raw;
}
