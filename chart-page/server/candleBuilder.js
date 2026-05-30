import { getHistoricRates, getRealTimeRates, Timeframe } from "dukascopy-node";

const INSTRUMENT_MAP = {
  // Forex Majors
  eurusd: "eurusd",
  usdjpy: "usdjpy",
  gbpusd: "gbpusd",
  usdchf: "usdchf",
  audusd: "audusd",
  usdcad: "usdcad",
  nzdusd: "nzdusd",
  // Metals
  xauusd: "xauusd",
  xagusd: "xagusd",
  // Crypto
  btcusd: "btcusd",
  ethusd: "ethusd",
  ltcusd: "ltcusd",
  xrpusd: "adausd", // Derived from ADA/USD
  bnbusd: "uniusd", // Derived from UNI/USD
  solusd: "adausd", // Derived from ADA/USD
  // Forex Crosses
  eurgbp: "eurgbp",
  eurjpy: "eurjpy",
  gbpjpy: "gbpjpy",
  audjpy: "audjpy",
  eurchf: "eurchf",
  gbpchf: "gbpchf",
  // Indices
  spx500: "usa500idxusd",
  nasusd: "usatechidxusd",
  deuidxeur: "deuidxeur"
};

const DURATION_MAP = {
  "1m": 60 * 1000,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1H": 60 * 60 * 1000,
  "4H": 4 * 60 * 60 * 1000,
  "1D": 24 * 60 * 60 * 1000
};

const TIMEFRAME_MAP = {
  "1m": Timeframe.m1,
  "5m": Timeframe.m5,
  "15m": Timeframe.m15,
  "30m": Timeframe.m30,
  "1H": Timeframe.h1,
  "4H": Timeframe.h4,
  "1D": Timeframe.d1
};

class CandleBuilder {
  constructor() {
    this.instrument = null;
    this.timeframe = null;
    this.closedCandles = [];
    this.currentCandle = null;
    this.lastProcessedTimestamp = 0;
    this.intervalId = null;
    this.isPolling = false;
    this.multiplier = 1;
    this.isDerived = false;
  }

  // Get active session data
  getSessionState() {
    return {
      instrument: this.instrument,
      timeframe: this.timeframe,
      closedCandles: this.closedCandles.slice(-200),
      currentCandle: this.currentCandle,
      serverTime: Date.now()
    };
  }

  // Reset the builder completely
  reset() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.instrument = null;
    this.timeframe = null;
    this.closedCandles = [];
    this.currentCandle = null;
    this.lastProcessedTimestamp = 0;
    this.isPolling = false;
    this.multiplier = 1;
    this.isDerived = false;
    console.log("[CandleBuilder] Session cleared.");
  }

  // Initialize a new session
  async initializeSession(instrumentId, timeframe) {
    // 1. Clean up active loops
    this.reset();

    const targetSymbol = INSTRUMENT_MAP[instrumentId.toLowerCase()];
    if (!targetSymbol) {
      throw new Error(`Unsupported instrument: ${instrumentId}`);
    }

    this.instrument = instrumentId.toLowerCase();
    this.timeframe = timeframe;
    
    // 2. Setup derived multipliers for SOL, BNB, XRP
    this.isDerived = ["xrpusd", "bnbusd", "solusd"].includes(this.instrument);
    if (this.instrument === "xrpusd") this.multiplier = 1.5;
    else if (this.instrument === "bnbusd") this.multiplier = 80;
    else if (this.instrument === "solusd") this.multiplier = 500;
    else this.multiplier = 1;

    console.log(`[CandleBuilder] Prefilling history for ${this.instrument} (${this.timeframe})...`);
    
    // 3. Prefill historical candles
    try {
      const durationMs = DURATION_MAP[timeframe];
      const to = new Date();
      const targetTimeframe = TIMEFRAME_MAP[timeframe];

      let history = [];
      let lookbackMultiplier = 260;
      let attempts = 0;

      // Progressively expand lookback window if we get fewer than 200 candles (handles weekends/holidays)
      while (history.length < 200 && attempts < 4) {
        attempts++;
        const from = new Date(Date.now() - lookbackMultiplier * durationMs);
        
        console.log(`[CandleBuilder] Prefill fetch: attempt ${attempts}, lookbackMultiplier ${lookbackMultiplier}...`);
        
        const res = await getHistoricRates({
          instrument: targetSymbol,
          dates: { from, to },
          timeframe: targetTimeframe,
          format: "json",
          useCache: false
        });

        if (res && res.length > 0) {
          history = res;
        }

        if (history.length < 200) {
          lookbackMultiplier *= 4; // Expand lookback (e.g. 4.3h -> 17.3h -> 69.3h -> 277h)
        }
      }

      if (history && history.length > 0) {
        this.closedCandles = history.map((c) => {
          let open = c.open;
          let high = c.high;
          let low = c.low;
          let close = c.close;

          if (this.isDerived) {
            open *= this.multiplier;
            high *= this.multiplier;
            low *= this.multiplier;
            close *= this.multiplier;
          }

          return {
            time: Math.floor(c.timestamp / 1000), // lightweight-charts requires seconds
            open: +open.toFixed(6),
            high: +high.toFixed(6),
            low: +low.toFixed(6),
            close: +close.toFixed(6),
            volume: +c.volume.toFixed(2)
          };
        }).sort((a, b) => a.time - b.time);
      }
      
      console.log(`[CandleBuilder] Loaded ${this.closedCandles.length} historical candles.`);
    } catch (err) {
      console.error(`[CandleBuilder] Historical rates prefill failed:`, err.message);
      // Fallback: start with empty historical list
      this.closedCandles = [];
    }

    // 4. Start active 1-second ticks aggregator loop
    this.startPollingLoop();
  }

  startPollingLoop() {
    if (this.isPolling) return;
    this.isPolling = true;

    const targetSymbol = INSTRUMENT_MAP[this.instrument];
    const durationMs = DURATION_MAP[this.timeframe];

    this.intervalId = setInterval(async () => {
      try {
        const raw = await getRealTimeRates({
          instrument: targetSymbol,
          timeframe: "tick",
          last: 20,
          format: "json"
        });

        if (!raw || !raw.length) return;

        // Process ticks in chronological order
        const ticks = raw.map((item) => {
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

          let mid = (bid + ask) / 2;
          if (this.isDerived) {
            mid *= this.multiplier;
          }

          return {
            timestamp,
            mid,
            volume: bidVol + askVol
          };
        }).sort((a, b) => a.timestamp - b.timestamp);

        // Feed ticks into OHLC candle accumulator
        ticks.forEach((tick) => {
          if (tick.timestamp <= this.lastProcessedTimestamp) {
            return; // Deduplicate: do not process same tick twice
          }
          this.lastProcessedTimestamp = tick.timestamp;

          const boundaryMs = Math.floor(tick.timestamp / durationMs) * durationMs;
          const unixSeconds = boundaryMs / 1000;

          if (!this.currentCandle) {
            // First live candle
            this.currentCandle = {
              time: unixSeconds,
              open: +tick.mid.toFixed(6),
              high: +tick.mid.toFixed(6),
              low: +tick.mid.toFixed(6),
              close: +tick.mid.toFixed(6),
              volume: +tick.volume.toFixed(2)
            };
          } else if (unixSeconds === this.currentCandle.time) {
            // Update current candle bounds
            this.currentCandle.high = +Math.max(this.currentCandle.high, tick.mid).toFixed(6);
            this.currentCandle.low = +Math.min(this.currentCandle.low, tick.mid).toFixed(6);
            this.currentCandle.close = +tick.mid.toFixed(6);
            this.currentCandle.volume = +(this.currentCandle.volume + tick.volume).toFixed(2);
          } else if (unixSeconds > this.currentCandle.time) {
            // Current candle is completed!
            this.closedCandles.push({ ...this.currentCandle });
            
            // Retain max 500 closed candles in history
            if (this.closedCandles.length > 500) {
              this.closedCandles.shift();
            }

            // Start new candle
            this.currentCandle = {
              time: unixSeconds,
              open: +tick.mid.toFixed(6),
              high: +tick.mid.toFixed(6),
              low: +tick.mid.toFixed(6),
              close: +tick.mid.toFixed(6),
              volume: +tick.volume.toFixed(2)
            };
          }
        });
      } catch (err) {
        console.warn(`[CandleBuilder] Tick poll error for ${this.instrument}:`, err.message);
      }
    }, 1000);
  }
}

// Export a single stateful instance for active connection mapping
export const candleBuilder = new CandleBuilder();
