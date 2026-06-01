export const GROUPS = {
  FOREX: "Forex",
  METALS: "Metals",
  CRYPTO: "Crypto",
  CROSSES: "Crosses",
  INDICES: "Indices"
};

export const INSTRUMENTS = {
  // Group 1: Forex Majors — Dukascopy
  eurusd: { id: "eurusd", name: "EUR/USD", group: GROUPS.FOREX, icon: "🇪🇺", type: "forex", source: "dukascopy", dukascopySymbol: "eurusd" },
  usdjpy: { id: "usdjpy", name: "USD/JPY", group: GROUPS.FOREX, icon: "🇯🇵", type: "jpy", source: "dukascopy", dukascopySymbol: "usdjpy" },
  gbpusd: { id: "gbpusd", name: "GBP/USD", group: GROUPS.FOREX, icon: "🇬🇧", type: "forex", source: "dukascopy", dukascopySymbol: "gbpusd" },
  usdchf: { id: "usdchf", name: "USD/CHF", group: GROUPS.FOREX, icon: "🇨🇭", type: "forex", source: "dukascopy", dukascopySymbol: "usdchf" },
  audusd: { id: "audusd", name: "AUD/USD", group: GROUPS.FOREX, icon: "🇦🇺", type: "forex", source: "dukascopy", dukascopySymbol: "audusd" },
  usdcad: { id: "usdcad", name: "USD/CAD", group: GROUPS.FOREX, icon: "🇨🇦", type: "forex", source: "dukascopy", dukascopySymbol: "usdcad" },
  nzdusd: { id: "nzdusd", name: "NZD/USD", group: GROUPS.FOREX, icon: "🇳🇿", type: "forex", source: "dukascopy", dukascopySymbol: "nzdusd" },

  // Group 2: Metals — Dukascopy
  xauusd: { id: "xauusd", name: "Gold (XAU/USD)", group: GROUPS.METALS, icon: "👑", type: "gold", source: "dukascopy", dukascopySymbol: "xauusd" },
  xagusd: { id: "xagusd", name: "Silver (XAG/USD)", group: GROUPS.METALS, icon: "🥈", type: "silver", source: "dukascopy", dukascopySymbol: "xagusd" },
  xpdusd: { id: "xpdusd", name: "Palladium", group: GROUPS.METALS, icon: "⛓️", type: "metal", source: "dukascopy", dukascopySymbol: "xpdcmdusd" },
  xptusd: { id: "xptusd", name: "Platinum", group: GROUPS.METALS, icon: "💿", type: "metal", source: "dukascopy", dukascopySymbol: "xptcmdusd" },

  // Group 3: Crypto — Binance (real prices, no fake multipliers)
  btcusd: { id: "btcusd", name: "Bitcoin (BTC/USD)", group: GROUPS.CRYPTO, icon: "₿", type: "crypto_btc", source: "binance", binanceSymbol: "BTCUSDT" },
  ethusd: { id: "ethusd", name: "Ethereum (ETH/USD)", group: GROUPS.CRYPTO, icon: "Ξ", type: "crypto_eth", source: "binance", binanceSymbol: "ETHUSDT" },
  ltcusd: { id: "ltcusd", name: "Litecoin (LTC/USD)", group: GROUPS.CRYPTO, icon: "Ł", type: "crypto", source: "binance", binanceSymbol: "LTCUSDT" },
  xrpusd: { id: "xrpusd", name: "Ripple (XRP/USD)", group: GROUPS.CRYPTO, icon: "✕", type: "crypto_alt", source: "binance", binanceSymbol: "XRPUSDT" },
  bchusd: { id: "bchusd", name: "Bitcoin Cash", group: GROUPS.CRYPTO, icon: "฿", type: "crypto", source: "binance", binanceSymbol: "BCHUSDT" },
  eosusd: { id: "eosusd", name: "EOS/USD", group: GROUPS.CRYPTO, icon: "ε", type: "crypto_alt", source: "binance", binanceSymbol: "EOSUSDT" },
  xlmusd: { id: "xlmusd", name: "Stellar (XLM/USD)", group: GROUPS.CRYPTO, icon: "🚀", type: "crypto_alt", source: "binance", binanceSymbol: "XLMUSDT" },
  adausd: { id: "adausd", name: "Cardano (ADA/USD)", group: GROUPS.CRYPTO, icon: "₳", type: "crypto_alt", source: "binance", binanceSymbol: "ADAUSDT" },
  dotusd: { id: "dotusd", name: "Polkadot (DOT/USD)", group: GROUPS.CRYPTO, icon: "●", type: "crypto", source: "binance", binanceSymbol: "DOTUSDT" },
  lnkusd: { id: "lnkusd", name: "Chainlink (LINK/USD)", group: GROUPS.CRYPTO, icon: "🔗", type: "crypto", source: "binance", binanceSymbol: "LINKUSDT" },
  uniusd: { id: "uniusd", name: "Uniswap (UNI/USD)", group: GROUPS.CRYPTO, icon: "🦄", type: "crypto", source: "binance", binanceSymbol: "UNIUSDT" },
  solusd: { id: "solusd", name: "Solana (SOL/USD)", group: GROUPS.CRYPTO, icon: "☀️", type: "crypto", source: "binance", binanceSymbol: "SOLUSDT" },

  // Group 4: Forex Crosses — Dukascopy
  eurgbp: { id: "eurgbp", name: "EUR/GBP", group: GROUPS.CROSSES, icon: "🇪🇺", type: "forex", source: "dukascopy", dukascopySymbol: "eurgbp" },
  eurjpy: { id: "eurjpy", name: "EUR/JPY", group: GROUPS.CROSSES, icon: "🇪🇺", type: "jpy", source: "dukascopy", dukascopySymbol: "eurjpy" },
  eurchf: { id: "eurchf", name: "EUR/CHF", group: GROUPS.CROSSES, icon: "🇪🇺", type: "forex", source: "dukascopy", dukascopySymbol: "eurchf" },
  euraud: { id: "euraud", name: "EUR/AUD", group: GROUPS.CROSSES, icon: "🇪🇺", type: "forex", source: "dukascopy", dukascopySymbol: "euraud" },
  eurcad: { id: "eurcad", name: "EUR/CAD", group: GROUPS.CROSSES, icon: "🇪🇺", type: "forex", source: "dukascopy", dukascopySymbol: "eurcad" },
  eurnzd: { id: "eurnzd", name: "EUR/NZD", group: GROUPS.CROSSES, icon: "🇪🇺", type: "forex", source: "dukascopy", dukascopySymbol: "eurnzd" },
  gbpjpy: { id: "gbpjpy", name: "GBP/JPY", group: GROUPS.CROSSES, icon: "🇬🇧", type: "jpy", source: "dukascopy", dukascopySymbol: "gbpjpy" },
  gbpchf: { id: "gbpchf", name: "GBP/CHF", group: GROUPS.CROSSES, icon: "🇬🇧", type: "forex", source: "dukascopy", dukascopySymbol: "gbpchf" },
  gbpaud: { id: "gbpaud", name: "GBP/AUD", group: GROUPS.CROSSES, icon: "🇬🇧", type: "forex", source: "dukascopy", dukascopySymbol: "gbpaud" },
  gbpcad: { id: "gbpcad", name: "GBP/CAD", group: GROUPS.CROSSES, icon: "🇬🇧", type: "forex", source: "dukascopy", dukascopySymbol: "gbpcad" },
  gbpnzd: { id: "gbpnzd", name: "GBP/NZD", group: GROUPS.CROSSES, icon: "🇬🇧", type: "forex", source: "dukascopy", dukascopySymbol: "gbpnzd" },
  audjpy: { id: "audjpy", name: "AUD/JPY", group: GROUPS.CROSSES, icon: "🇦🇺", type: "jpy", source: "dukascopy", dukascopySymbol: "audjpy" },
  audchf: { id: "audchf", name: "AUD/CHF", group: GROUPS.CROSSES, icon: "🇦🇺", type: "forex", source: "dukascopy", dukascopySymbol: "audchf" },
  audcad: { id: "audcad", name: "AUD/CAD", group: GROUPS.CROSSES, icon: "🇦🇺", type: "forex", source: "dukascopy", dukascopySymbol: "audcad" },
  audnzd: { id: "audnzd", name: "AUD/NZD", group: GROUPS.CROSSES, icon: "🇦🇺", type: "forex", source: "dukascopy", dukascopySymbol: "audnzd" },
  cadjpy: { id: "cadjpy", name: "CAD/JPY", group: GROUPS.CROSSES, icon: "🇨🇦", type: "jpy", source: "dukascopy", dukascopySymbol: "cadjpy" },
  chfjpy: { id: "chfjpy", name: "CHF/JPY", group: GROUPS.CROSSES, icon: "🇨🇭", type: "jpy", source: "dukascopy", dukascopySymbol: "chfjpy" },
  nzdjpy: { id: "nzdjpy", name: "NZD/JPY", group: GROUPS.CROSSES, icon: "🇳🇿", type: "jpy", source: "dukascopy", dukascopySymbol: "nzdjpy" },

  // Group 5: Indices — Dukascopy
  spx500: { id: "spx500", name: "S&P 500", group: GROUPS.INDICES, icon: "🇺🇸", type: "index", source: "dukascopy", dukascopySymbol: "usa500idxusd" },
  nasusd: { id: "nasusd", name: "NASDAQ 100", group: GROUPS.INDICES, icon: "💻", type: "index", source: "dukascopy", dukascopySymbol: "usatechidxusd" },
  wti: { id: "wti", name: "Crude Oil WTI", group: GROUPS.INDICES, icon: "🛢️", type: "commodity", source: "dukascopy", dukascopySymbol: "lightcmdusd" },
  ukxusd: { id: "ukxusd", name: "FTSE 100", group: GROUPS.INDICES, icon: "🇬🇧", type: "index", source: "dukascopy", dukascopySymbol: "gbridxgbp" },
  deuidxeur: { id: "deuidxeur", name: "DAX 40", group: GROUPS.INDICES, icon: "🇩🇪", type: "index", source: "dukascopy", dukascopySymbol: "deuidxeur" },
  fraidxeur: { id: "fraidxeur", name: "CAC 40", group: GROUPS.INDICES, icon: "🇫🇷", type: "index", source: "dukascopy", dukascopySymbol: "fraidxeur" },
  jpnidxjpy: { id: "jpnidxjpy", name: "Nikkei 225", group: GROUPS.INDICES, icon: "🇯🇵", type: "index_jpy", source: "dukascopy", dukascopySymbol: "jpnidxjpy" },
  hkgidxhkd: { id: "hkgidxhkd", name: "Hang Seng", group: GROUPS.INDICES, icon: "🇭🇰", type: "index", source: "dukascopy", dukascopySymbol: "hkgidxhkd" }
};

export const getInstrumentList = () => Object.values(INSTRUMENTS);

// Helper to get instruments by source
export const getBinanceInstruments = () => Object.values(INSTRUMENTS).filter(i => i.source === "binance");
export const getDukascopyInstruments = () => Object.values(INSTRUMENTS).filter(i => i.source === "dukascopy");

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
