import { getHistoricRates, getRealTimeRates, Timeframe } from "dukascopy-node";

// Binance REST API base URL (public, no auth required)
const BINANCE_API = "https://api.binance.com/api/v3";

// Binance symbols for crypto instruments
const BINANCE_SYMBOLS = {
  btcusd: "BTCUSDT",
  ethusd: "ETHUSDT",
  ltcusd: "LTCUSDT",
  xrpusd: "XRPUSDT",
  bchusd: "BCHUSDT",
  eosusd: "EOSUSDT",
  xlmusd: "XLMUSDT",
  adausd: "ADAUSDT",
  dotusd: "DOTUSDT",
  lnkusd: "LINKUSDT",
  uniusd: "UNIUSDT",
  solusd: "SOLUSDT",
};

// Dukascopy symbols for forex, metals, and indices
const DUKASCOPY_SYMBOLS = {
  eurusd: "eurusd",
  usdjpy: "usdjpy",
  gbpusd: "gbpusd",
  usdchf: "usdchf",
  audusd: "audusd",
  usdcad: "usdcad",
  nzdusd: "nzdusd",
  xauusd: "xauusd",
  xagusd: "xagusd",
  xpdusd: "xpdcmdusd",
  xptusd: "xptcmdusd",
  eurgbp: "eurgbp",
  eurjpy: "eurjpy",
  gbpjpy: "gbpjpy",
  audjpy: "audjpy",
  eurchf: "eurchf",
  gbpchf: "gbpchf",
  euraud: "euraud",
  eurcad: "eurcad",
  eurnzd: "eurnzd",
  gbpaud: "gbpaud",
  gbpcad: "gbpcad",
  gbpnzd: "gbpnzd",
  audchf: "audchf",
  audcad: "audcad",
  audnzd: "audnzd",
  cadjpy: "cadjpy",
  chfjpy: "chfjpy",
  nzdjpy: "nzdjpy",
  spx500: "usa500idxusd",
  nasusd: "usatechidxusd",
  deuidxeur: "deuidxeur",
  wti: "lightcmdusd",
  ukxusd: "gbridxgbp",
  fraidxeur: "fraidxeur",
  jpnidxjpy: "jpnidxjpy",
  hkgidxhkd: "hkgidxhkd",
};

const DURATION_MAP = {
  "1m": 60 * 1000,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1H": 60 * 60 * 1000,
  "4H": 4 * 60 * 60 * 1000,
  "1D": 24 * 60 * 60 * 1000,
};

const TIMEFRAME_MAP = {
  "1m": Timeframe.m1,
  "5m": Timeframe.m5,
  "15m": Timeframe.m15,
  "30m": Timeframe.m30,
  "1H": Timeframe.h1,
  "4H": Timeframe.h4,
  "1D": Timeframe.d1,
};

// Binance kline interval mapping
const BINANCE_INTERVAL_MAP = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1H": "1h",
  "4H": "4h",
  "1D": "1d",
};

class ChartSession {
  constructor(instrument, timeframe) {
    this.instrument = instrument.toLowerCase();
    this.timeframe = timeframe;
    this.closedCandles = [];
    this.currentCandle = null;
    this.lastProcessedTimestamp = 0;
    this.intervalId = null;
    this.isPolling = false;
    this.isBinance = this.instrument in BINANCE_SYMBOLS;
    this.lastAccessed = Date.now();
  }
}

class CandleBuilder {
  constructor() {
    this.sessions = {}; // key -> ChartSession
    this.lastActiveKey = null;
  }

  // Get active session data
  getSessionState(instrumentId, timeframe) {
    const key = (instrumentId && timeframe)
      ? `${instrumentId.toLowerCase()}_${timeframe}`
      : this.lastActiveKey;

    if (!key || !this.sessions[key]) {
      return {
        instrument: null,
        timeframe: null,
        closedCandles: [],
        currentCandle: null,
        serverTime: Date.now(),
      };
    }

    const sess = this.sessions[key];
    sess.lastAccessed = Date.now(); // update access time

    return {
      instrument: sess.instrument,
      timeframe: sess.timeframe,
      closedCandles: sess.closedCandles.slice(-200),
      currentCandle: sess.currentCandle,
      serverTime: Date.now(),
    };
  }

  // Reset the builder completely (stops all sessions)
  reset() {
    Object.keys(this.sessions).forEach((key) => {
      const sess = this.sessions[key];
      if (sess.intervalId) {
        clearInterval(sess.intervalId);
      }
    });
    this.sessions = {};
    this.lastActiveKey = null;
    console.log("[CandleBuilder] All sessions cleared.");
  }

  // Prune inactive sessions to prevent memory leak
  pruneOldSessions() {
    const now = Date.now();
    const maxInactiveMs = 5 * 60 * 1000; // 5 minutes

    Object.keys(this.sessions).forEach((key) => {
      const sess = this.sessions[key];
      if (now - sess.lastAccessed > maxInactiveMs) {
        console.log(`[CandleBuilder] Pruning inactive session: ${key}`);
        if (sess.intervalId) {
          clearInterval(sess.intervalId);
        }
        delete this.sessions[key];
      }
    });
  }

  // Initialize a new session
  async initializeSession(instrumentId, timeframe) {
    const instLower = instrumentId.toLowerCase();
    const isBinance = instLower in BINANCE_SYMBOLS;
    const isDukascopy = instLower in DUKASCOPY_SYMBOLS;

    if (!isBinance && !isDukascopy) {
      throw new Error(`Unsupported instrument: ${instrumentId}`);
    }

    // Automatically prune old inactive sessions first
    this.pruneOldSessions();

    const key = `${instLower}_${timeframe}`;

    if (this.sessions[key]) {
      // Re-use already initialized session
      this.sessions[key].lastAccessed = Date.now();
      this.lastActiveKey = key;
      console.log(`[CandleBuilder] Re-using active session for ${key}`);
      return;
    }

    // Create a new session
    const sess = new ChartSession(instrumentId, timeframe);
    this.sessions[key] = sess;
    this.lastActiveKey = key;

    console.log(
      `[CandleBuilder] Prefilling history for ${sess.instrument} (${sess.timeframe}) via ${sess.isBinance ? "Binance" : "Dukascopy"}...`
    );

    // Prefill historical candles
    try {
      if (sess.isBinance) {
        await this.prefillBinanceHistory(sess);
      } else {
        await this.prefillDukascopyHistory(sess);
      }
      console.log(
        `[CandleBuilder] Loaded ${sess.closedCandles.length} historical candles for ${key}.`
      );
    } catch (err) {
      console.error(
        `[CandleBuilder] Historical rates prefill failed for ${key}:`,
        err.message
      );
      sess.closedCandles = [];
    }

    // Start active ticks aggregator loop
    this.startPollingLoop(sess);
  }

  // ---------------------------------------------------------------------------
  // Binance historical candle prefill
  // ---------------------------------------------------------------------------
  async prefillBinanceHistory(sess) {
    const symbol = BINANCE_SYMBOLS[sess.instrument];
    const interval = BINANCE_INTERVAL_MAP[sess.timeframe];
    if (!symbol || !interval) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(
        `${BINANCE_API}/klines?symbol=${symbol}&interval=${interval}&limit=200`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`Binance klines HTTP ${res.status}`);

      const klines = await res.json();

      // Binance kline format: [openTime, open, high, low, close, volume, closeTime, ...]
      sess.closedCandles = klines
        .slice(0, -1) // Exclude the last (current/forming) candle
        .map((k) => ({
          time: Math.floor(k[0] / 1000), // openTime in seconds
          open: +parseFloat(k[1]).toFixed(8),
          high: +parseFloat(k[2]).toFixed(8),
          low: +parseFloat(k[3]).toFixed(8),
          close: +parseFloat(k[4]).toFixed(8),
          volume: +parseFloat(k[5]).toFixed(2),
        }))
        .sort((a, b) => a.time - b.time);
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Dukascopy historical candle prefill
  // ---------------------------------------------------------------------------
  async prefillDukascopyHistory(sess) {
    const targetSymbol = DUKASCOPY_SYMBOLS[sess.instrument];
    const durationMs = DURATION_MAP[sess.timeframe];
    const targetTimeframe = TIMEFRAME_MAP[sess.timeframe];

    if (!targetSymbol || !durationMs || !targetTimeframe) return;

    const to = new Date();
    let history = [];
    let lookbackMultiplier = 260;
    let attempts = 0;

    // Progressively expand lookback window if we get fewer than 200 candles
    while (history.length < 200 && attempts < 4) {
      attempts++;
      const from = new Date(Date.now() - lookbackMultiplier * durationMs);

      console.log(
        `[CandleBuilder] Prefill fetch for ${sess.instrument}: attempt ${attempts}, lookbackMultiplier ${lookbackMultiplier}...`
      );

      // Timeout protection for Dukascopy
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error("Dukascopy history timeout (12s)")),
          12000
        );
      });

      const fetchPromise = getHistoricRates({
        instrument: targetSymbol,
        dates: { from, to },
        timeframe: targetTimeframe,
        format: "json",
        useCache: false,
      });

      try {
        const res = await Promise.race([fetchPromise, timeoutPromise]);
        if (res && res.length > 0) {
          history = res;
        }
      } catch (err) {
        console.warn(
          `[CandleBuilder] Dukascopy prefill attempt ${attempts} failed for ${sess.instrument}:`,
          err.message
        );
      }

      if (history.length < 200) {
        lookbackMultiplier *= 4;
      }
    }

    if (history && history.length > 0) {
      sess.closedCandles = history
        .map((c) => ({
          time: Math.floor(c.timestamp / 1000),
          open: +c.open.toFixed(6),
          high: +c.high.toFixed(6),
          low: +c.low.toFixed(6),
          close: +c.close.toFixed(6),
          volume: +c.volume.toFixed(2),
        }))
        .sort((a, b) => a.time - b.time);
    }
  }

  // ---------------------------------------------------------------------------
  // Live tick polling loop
  // ---------------------------------------------------------------------------
  startPollingLoop(sess) {
    if (sess.isPolling) return;
    sess.isPolling = true;

    const pollInterval = sess.isBinance ? 1000 : 1500;

    sess.intervalId = setInterval(async () => {
      try {
        // Safe check: if session has been deleted, terminate interval
        const currentSess = this.sessions[`${sess.instrument}_${sess.timeframe}`];
        if (!currentSess || currentSess !== sess) {
          clearInterval(sess.intervalId);
          return;
        }

        if (sess.isBinance) {
          await this.pollBinanceTick(sess);
        } else {
          await this.pollDukascopyTick(sess);
        }
      } catch (err) {
        console.warn(
          `[CandleBuilder] Tick poll error for ${sess.instrument}:`,
          err.message
        );
      }
    }, pollInterval);
  }

  // ---------------------------------------------------------------------------
  // Binance live tick polling
  // ---------------------------------------------------------------------------
  async pollBinanceTick(sess) {
    const symbol = BINANCE_SYMBOLS[sess.instrument];
    if (!symbol) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(
        `${BINANCE_API}/ticker/bookTicker?symbol=${symbol}`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (!res.ok) return;

      const data = await res.json();
      let bid = parseFloat(data.bidPrice);
      let ask = parseFloat(data.askPrice);

      // Fallback: some pairs have empty order books — use ticker/price
      if (bid === 0 && ask === 0) {
        try {
          const fbRes = await fetch(
            `${BINANCE_API}/ticker/price?symbol=${symbol}`
          );
          if (fbRes.ok) {
            const fbData = await fbRes.json();
            const price = parseFloat(fbData.price);
            if (price > 0) {
              bid = price;
              ask = price;
            }
          }
        } catch { /* ignore fallback errors */ }
      }

      const mid = (bid + ask) / 2;
      if (mid === 0) return; // Skip if still no valid data

      const durationMs = DURATION_MAP[sess.timeframe];

      this.processTick(sess, {
        timestamp: Date.now(),
        mid,
        volume: 0,
      }, durationMs);
    } catch (err) {
      clearTimeout(timeout);
      if (err.name !== "AbortError") throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Dukascopy live tick polling
  // ---------------------------------------------------------------------------
  async pollDukascopyTick(sess) {
    const targetSymbol = DUKASCOPY_SYMBOLS[sess.instrument];
    if (!targetSymbol) return;

    const durationMs = DURATION_MAP[sess.timeframe];

    // Timeout protection
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Dukascopy tick timeout (5s)")), 5000);
    });

    const fetchPromise = getRealTimeRates({
      instrument: targetSymbol,
      timeframe: "tick",
      last: 20,
      format: "json",
    });

    const raw = await Promise.race([fetchPromise, timeoutPromise]);

    if (!raw || !raw.length) return;

    // Process ticks in chronological order
    const ticks = raw
      .map((item) => {
        let timestamp = Date.now();
        let bid = 0;
        let ask = 0;
        let bidVol = 0;
        let askVol = 0;

        if (Array.isArray(item)) {
          timestamp = item[0] || Date.now();
          const p1 = item[1] || 0;
          const p2 = item[2] || 0;
          bid = Math.min(p1, p2);
          ask = Math.max(p1, p2);
          bidVol = item[3] || 0;
          askVol = item[4] || 0;
        } else if (item && typeof item === "object") {
          timestamp = item.timestamp || Date.now();
          const p1 = item.askPrice !== undefined ? item.askPrice : 0;
          const p2 = item.bidPrice !== undefined ? item.bidPrice : 0;
          bid = Math.min(p1, p2);
          ask = Math.max(p1, p2);
          bidVol = item.bidVolume || 0;
          askVol = item.askVolume || 0;
        }

        const mid = (bid + ask) / 2;
        return { timestamp, mid, volume: bidVol + askVol };
      })
      .sort((a, b) => a.timestamp - b.timestamp);

    // Feed ticks into OHLC candle accumulator
    ticks.forEach((tick) => {
      if (tick.timestamp <= sess.lastProcessedTimestamp) return;
      this.processTick(sess, tick, durationMs);
    });
  }

  // ---------------------------------------------------------------------------
  // Shared tick → candle accumulator
  // ---------------------------------------------------------------------------
  processTick(sess, tick, durationMs) {
    if (tick.timestamp <= sess.lastProcessedTimestamp) return;
    sess.lastProcessedTimestamp = tick.timestamp;

    const boundaryMs = Math.floor(tick.timestamp / durationMs) * durationMs;
    const unixSeconds = boundaryMs / 1000;

    if (!sess.currentCandle) {
      // First live candle
      sess.currentCandle = {
        time: unixSeconds,
        open: +tick.mid.toFixed(8),
        high: +tick.mid.toFixed(8),
        low: +tick.mid.toFixed(8),
        close: +tick.mid.toFixed(8),
        volume: +(tick.volume || 0).toFixed(2),
      };
    } else if (unixSeconds === sess.currentCandle.time) {
      // Update current candle bounds
      sess.currentCandle.high = +Math.max(
        sess.currentCandle.high,
        tick.mid
      ).toFixed(8);
      sess.currentCandle.low = +Math.min(
        sess.currentCandle.low,
        tick.mid
      ).toFixed(8);
      sess.currentCandle.close = +tick.mid.toFixed(8);
      sess.currentCandle.volume = +(
        sess.currentCandle.volume + (tick.volume || 0)
      ).toFixed(2);
    } else if (unixSeconds > sess.currentCandle.time) {
      // Current candle is completed!
      sess.closedCandles.push({ ...sess.currentCandle });

      // Retain max 500 closed candles in history
      if (sess.closedCandles.length > 500) {
        sess.closedCandles.shift();
      }

      // Start new candle
      sess.currentCandle = {
        time: unixSeconds,
        open: +tick.mid.toFixed(8),
        high: +tick.mid.toFixed(8),
        low: +tick.mid.toFixed(8),
        close: +tick.mid.toFixed(8),
        volume: +(tick.volume || 0).toFixed(2),
      };
    }
  }
}

// Export a single stateful instance for active connection mapping
export const candleBuilder = new CandleBuilder();
