export const GROUPS = {
  FOREX: "Forex",
  METALS: "Metals",
  CRYPTO: "Crypto",
  CROSSES: "Crosses",
  INDICES: "Indices"
};

export const INSTRUMENTS = {
  // Group 1: Forex Majors
  eurusd: { id: "eurusd", name: "EUR/USD", group: GROUPS.FOREX, icon: "🇪🇺", type: "forex" },
  usdjpy: { id: "usdjpy", name: "USD/JPY", group: GROUPS.FOREX, icon: "🇯🇵", type: "jpy" },
  gbpusd: { id: "gbpusd", name: "GBP/USD", group: GROUPS.FOREX, icon: "🇬🇧", type: "forex" },
  usdchf: { id: "usdchf", name: "USD/CHF", group: GROUPS.FOREX, icon: "🇨🇭", type: "forex" },
  audusd: { id: "audusd", name: "AUD/USD", group: GROUPS.FOREX, icon: "🇦🇺", type: "forex" },
  usdcad: { id: "usdcad", name: "USD/CAD", group: GROUPS.FOREX, icon: "🇨🇦", type: "forex" },
  nzdusd: { id: "nzdusd", name: "NZD/USD", group: GROUPS.FOREX, icon: "🇳🇿", type: "forex" },

  // Group 2: Metals
  xauusd: { id: "xauusd", name: "Gold (XAU/USD)", group: GROUPS.METALS, icon: "👑", type: "gold" },
  xagusd: { id: "xagusd", name: "Silver (XAG/USD)", group: GROUPS.METALS, icon: "🥈", type: "silver" },
  xpdusd: { id: "xpdusd", name: "Palladium", group: GROUPS.METALS, icon: "⛓️", type: "metal" },
  xptusd: { id: "xptusd", name: "Platinum", group: GROUPS.METALS, icon: "💿", type: "metal" },

  // Group 3: Crypto
  btcusd: { id: "btcusd", name: "Bitcoin (BTC/USD)", group: GROUPS.CRYPTO, icon: "₿", type: "crypto_btc" },
  ethusd: { id: "ethusd", name: "Ethereum (ETH/USD)", group: GROUPS.CRYPTO, icon: "Ξ", type: "crypto_eth" },
  ltcusd: { id: "ltcusd", name: "Litecoin (LTC/USD)", group: GROUPS.CRYPTO, icon: "Ł", type: "crypto" },
  xrpusd: { id: "xrpusd", name: "Ripple (XRP/USD)", group: GROUPS.CRYPTO, icon: "✕", type: "crypto_alt" },
  bchusd: { id: "bchusd", name: "Bitcoin Cash", group: GROUPS.CRYPTO, icon: "฿", type: "crypto" },
  eosusd: { id: "eosusd", name: "EOS/USD", group: GROUPS.CRYPTO, icon: "ε", type: "crypto_alt" },
  xlmusd: { id: "xlmusd", name: "Stellar (XLM/USD)", group: GROUPS.CRYPTO, icon: "🚀", type: "crypto_alt" },
  adausd: { id: "adausd", name: "Cardano (ADA/USD)", group: GROUPS.CRYPTO, icon: "₳", type: "crypto_alt" },
  dotusd: { id: "dotusd", name: "Polkadot (DOT/USD)", group: GROUPS.CRYPTO, icon: "●", type: "crypto" },
  lnkusd: { id: "lnkusd", name: "Chainlink (LINK/USD)", group: GROUPS.CRYPTO, icon: "🔗", type: "crypto" },
  uniusd: { id: "uniusd", name: "Uniswap (UNI/USD)", group: GROUPS.CRYPTO, icon: "🦄", type: "crypto" },
  solusd: { id: "solusd", name: "Solana (SOL/USD)", group: GROUPS.CRYPTO, icon: "☀️", type: "crypto" },

  // Group 4: Forex Crosses
  eurgbp: { id: "eurgbp", name: "EUR/GBP", group: GROUPS.CROSSES, icon: "🇪🇺", type: "forex" },
  eurjpy: { id: "eurjpy", name: "EUR/JPY", group: GROUPS.CROSSES, icon: "🇪🇺", type: "jpy" },
  eurchf: { id: "eurchf", name: "EUR/CHF", group: GROUPS.CROSSES, icon: "🇪🇺", type: "forex" },
  euraud: { id: "euraud", name: "EUR/AUD", group: GROUPS.CROSSES, icon: "🇪🇺", type: "forex" },
  eurcad: { id: "eurcad", name: "EUR/CAD", group: GROUPS.CROSSES, icon: "🇪🇺", type: "forex" },
  eurnzd: { id: "eurnzd", name: "EUR/NZD", group: GROUPS.CROSSES, icon: "🇪🇺", type: "forex" },
  gbpjpy: { id: "gbpjpy", name: "GBP/JPY", group: GROUPS.CROSSES, icon: "🇬🇧", type: "jpy" },
  gbpchf: { id: "gbpchf", name: "GBP/CHF", group: GROUPS.CROSSES, icon: "🇬🇧", type: "forex" },
  gbpaud: { id: "gbpaud", name: "GBP/AUD", group: GROUPS.CROSSES, icon: "🇬🇧", type: "forex" },
  gbpcad: { id: "gbpcad", name: "GBP/CAD", group: GROUPS.CROSSES, icon: "🇬🇧", type: "forex" },
  gbpnzd: { id: "gbpnzd", name: "GBP/NZD", group: GROUPS.CROSSES, icon: "🇬🇧", type: "forex" },
  audjpy: { id: "audjpy", name: "AUD/JPY", group: GROUPS.CROSSES, icon: "🇦🇺", type: "jpy" },
  audchf: { id: "audchf", name: "AUD/CHF", group: GROUPS.CROSSES, icon: "🇦🇺", type: "forex" },
  audcad: { id: "audcad", name: "AUD/CAD", group: GROUPS.CROSSES, icon: "🇦🇺", type: "forex" },
  audnzd: { id: "audnzd", name: "AUD/NZD", group: GROUPS.CROSSES, icon: "🇦🇺", type: "forex" },
  cadjpy: { id: "cadjpy", name: "CAD/JPY", group: GROUPS.CROSSES, icon: "🇨🇦", type: "jpy" },
  chfjpy: { id: "chfjpy", name: "CHF/JPY", group: GROUPS.CROSSES, icon: "🇨🇭", type: "jpy" },
  nzdjpy: { id: "nzdjpy", name: "NZD/JPY", group: GROUPS.CROSSES, icon: "🇳🇿", type: "jpy" },

  // Group 5: Indices
  spx500: { id: "spx500", name: "S&P 500", group: GROUPS.INDICES, icon: "🇺🇸", type: "index" },
  nasusd: { id: "nasusd", name: "NASDAQ 100", group: GROUPS.INDICES, icon: "💻", type: "index" },
  wti: { id: "wti", name: "Crude Oil WTI", group: GROUPS.INDICES, icon: "🛢️", type: "commodity" },
  ukxusd: { id: "ukxusd", name: "FTSE 100", group: GROUPS.INDICES, icon: "🇬🇧", type: "index" },
  deuidxeur: { id: "deuidxeur", name: "DAX 40", group: GROUPS.INDICES, icon: "🇩🇪", type: "index" },
  fraidxeur: { id: "fraidxeur", name: "CAC 40", group: GROUPS.INDICES, icon: "🇫🇷", type: "index" },
  jpnidxjpy: { id: "jpnidxjpy", name: "Nikkei 225", group: GROUPS.INDICES, icon: "🇯🇵", type: "index_jpy" },
  hkgidxhkd: { id: "hkgidxhkd", name: "Hang Seng", group: GROUPS.INDICES, icon: "🇭🇰", type: "index" }
};

export const getInstrumentList = () => Object.values(INSTRUMENTS);

// Format prices correctly per instrument type
export function formatPrice(instrumentId, price) {
  if (price === undefined || price === null || isNaN(price)) return "—";
  
  const inst = INSTRUMENTS[instrumentId];
  if (!inst) return price.toFixed(5);

  switch (inst.type) {
    case "jpy":
    case "index_jpy":
      return price.toFixed(3);
    case "forex":
      return price.toFixed(5);
    case "gold":
    case "index":
    case "commodity":
      return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "crypto_btc":
    case "crypto_eth":
      return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "crypto":
      return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    case "crypto_alt":
      return price.toFixed(6);
    case "silver":
    case "metal":
      return price.toFixed(3);
    default:
      return price.toFixed(5);
  }
}

// Calculate pips / points spread
export function formatSpread(instrumentId, spread) {
  if (spread === undefined || spread === null || isNaN(spread)) return "—";
  
  const inst = INSTRUMENTS[instrumentId];
  if (!inst) return (spread * 10000).toFixed(1);

  switch (inst.type) {
    case "jpy":
    case "index_jpy":
      // JPY spread * 100
      return (spread * 100).toFixed(1);
    case "forex":
      // Standard FX spread * 10000
      return (spread * 10000).toFixed(1);
    case "gold":
    case "silver":
    case "metal":
    case "crypto_btc":
    case "crypto_eth":
    case "crypto":
    case "crypto_alt":
    case "index":
    case "commodity":
      // commodities/indices show direct difference
      return spread.toFixed(2);
    default:
      return (spread * 10000).toFixed(1);
  }
}
