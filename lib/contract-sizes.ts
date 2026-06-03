/**
 * Standard MT5 contract sizes (units per 1 standard lot).
 *
 * These determine the actual position size and P&L multiplier:
 *   profit = price_move × lots × contractSize
 *   margin = (entryPrice × lots × contractSize) / leverage
 *
 * XAUUSD  100      → 0.01 lot = 1 oz of gold
 * XAGUSD  5000     → 0.01 lot = 50 oz of silver
 * Forex   100,000  → standard forex lot (USD-quoted pairs give USD P&L directly)
 * Crypto  1        → 1 coin/token per lot
 * Indices 1        → CFD index, $1 per point per lot (broker-dependent)
 */
export const CONTRACT_SIZES: Record<string, number> = {
  // ── Metals ──────────────────────────────────────────────────────────────
  XAUUSD:  100,
  XAGUSD:  5000,

  // ── Forex majors & minors (100k standard lot) ────────────────────────────
  EURUSD:  100000,
  GBPUSD:  100000,
  AUDUSD:  100000,
  NZDUSD:  100000,
  USDCAD:  100000,
  USDJPY:  100000,
  USDCHF:  100000,
  EURGBP:  100000,
  EURJPY:  100000,
  GBPJPY:  100000,
  AUDJPY:  100000,
  EURAUD:  100000,
  EURCAD:  100000,
  GBPCAD:  100000,
  AUDCAD:  100000,
  AUDNZD:  100000,
  CADJPY:  100000,
  CHFJPY:  100000,
  NZDJPY:  100000,

  // ── Crypto (1 coin/token per lot) ─────────────────────────────────────────
  BTCUSD:  1,
  BTCUSDT: 1,
  ETHUSD:  1,
  ETHUSDT: 1,
  XRPUSD:  1,
  SOLUSD:  1,
  LTCUSD:  1,

  // ── Indices (CFD: $1 per point per lot on most brokers) ───────────────────
  US30:    1,
  US500:   1,
  US100:   1,
  NAS100:  1,
  NASDAQ:  1,
  SPX500:  1,
  GER40:   1,
  GER30:   1,
  UK100:   1,
  JP225:   1,

  // ── Energy ────────────────────────────────────────────────────────────────
  USOIL:   1000,
  UKOIL:   1000,
  XTIUSD:  1000,
};

// A 6-letter symbol made of two 3-letter currency codes is a forex pair.
const FOREX_RE = /^(AUD|CAD|CHF|EUR|GBP|JPY|NZD|USD|SGD|HKD|NOK|SEK|MXN|ZAR|TRY|PLN|CNH)(AUD|CAD|CHF|EUR|GBP|JPY|NZD|USD|SGD|HKD|NOK|SEK|MXN|ZAR|TRY|PLN|CNH)$/;

/**
 * Returns the contract size for a symbol.
 * Falls back to the standard 100,000 forex lot when an unknown symbol still
 * looks like a currency pair (e.g. EURNZD), otherwise defaults to 1.
 */
export function getContractSize(symbol: string): number {
  const key = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (CONTRACT_SIZES[key] != null) return CONTRACT_SIZES[key];
  if (FOREX_RE.test(key)) return 100000;
  return 1;
}
