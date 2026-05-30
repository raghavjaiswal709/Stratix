/**
 * Premium, dynamic price and volume formatter tailored per asset class/magnitude.
 * @param {string} instrumentId 
 * @param {number} price 
 * @returns {string} Formatted output
 */
export function formatPrice(instrumentId, price) {
  if (price === undefined || price === null || isNaN(price)) return "—";

  const key = instrumentId.toLowerCase();

  // 1. JPY Pairs (FX Crosses / Majors containing JPY)
  if (key.includes("jpy")) {
    return price.toFixed(3);
  }

  // 2. Standard Forex Pairs (5 decimal points)
  const forexPairs = [
    "eurusd", "gbpusd", "usdchf", "audusd", "usdcad", "nzdusd",
    "eurgbp", "eurchf", "euraud", "eurcad", "eurnzd",
    "gbpchf", "gbpaud", "gbpcad", "gbpnzd",
    "audchf", "audcad", "audnzd"
  ];
  if (forexPairs.includes(key)) {
    return price.toFixed(5);
  }

  // 3. Metals
  if (key === "xauusd") {
    // Gold: comma separators + 2 decimals
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (key === "xagusd") {
    // Silver: 3 decimals
    return price.toFixed(3);
  }

  // 4. Cryptocurrencies
  if (key === "btcusd") {
    // Bitcoin: comma separators + 2 decimals
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const altcoins = ["ethusd", "ltcusd", "xrpusd", "bnbusd", "solusd"];
  if (altcoins.includes(key)) {
    if (price > 100) {
      return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (price > 1) {
      return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    }
    // High-resolution altcoins
    return price.toFixed(6);
  }

  // 5. Indices & commodities
  return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
