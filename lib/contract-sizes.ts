/**
 * Standard MT5 contract sizes (units per 1 standard lot).
 *
 * These determine the actual position size and P&L multiplier:
 *   profit = price_move × lots × contractSize
 *   margin = (entryPrice × lots × contractSize) / leverage
 *
 * XAUUSD  100  → 0.01 lot = 1 oz of gold
 * XAGUSD  5000 → 0.01 lot = 50 oz of silver
 * Forex   100,000 → standard forex lot (USD-quoted pairs give USD P&L directly)
 * Crypto  1    → 1 coin/token per lot
 */
export const CONTRACT_SIZES: Record<string, number> = {
  XAUUSD:  100,
  XAGUSD:  5000,
  GBPUSD:  100000,
  EURUSD:  100000,
  USDCAD:  100000,
  USDJPY:  100000,
  ETHUSD:  1,
  BTCUSDT: 1,
};

/**
 * Returns the contract size for a symbol.
 * Defaults to 1 for unknown/custom symbols.
 */
export function getContractSize(symbol: string): number {
  return CONTRACT_SIZES[symbol.toUpperCase()] ?? 1;
}
