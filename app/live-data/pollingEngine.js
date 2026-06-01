import { INSTRUMENTS } from "./instrumentConfig.js";

class PollingEngine {
  constructor() {
    this.states = {};
    this.listeners = {}; // instrumentId -> Set of callbacks
    this.isRunning = false;
    this.cryptoIntervalId = null;
    this.dukascopyIntervalId = null;

    // Separate instruments by data source for different polling cadences
    this.cryptoInstruments = [];
    this.dukascopyInstruments = [];

    // Initialize state structure for all instruments
    Object.keys(INSTRUMENTS).forEach((id) => {
      const inst = INSTRUMENTS[id];
      this.states[id] = {
        id,
        bid: null,
        ask: null,
        mid: null,
        spread: null,
        change: 0,
        changePercent: 0,
        direction: "flat", // "up", "down", "flat"
        isStale: false,
        timestamp: null,
        ticks: [], // Holds rolling last 60 ticks
        initialMid: null,
        errorCount: 0,
        lastErrorTime: 0,
      };

      if (inst.source === "binance") {
        this.cryptoInstruments.push(id);
      } else {
        this.dukascopyInstruments.push(id);
      }
    });
  }

  // Get current state snapshot
  getState(instrumentId) {
    return this.states[instrumentId] || null;
  }

  // Register listener for an instrument
  subscribe(instrumentId, callback) {
    if (!this.listeners[instrumentId]) {
      this.listeners[instrumentId] = new Set();
    }
    this.listeners[instrumentId].add(callback);

    // Immediate callback of current snapshot
    callback({ ...this.states[instrumentId] });

    // Start background loop on first subscriber
    this.start();

    return () => {
      if (this.listeners[instrumentId]) {
        this.listeners[instrumentId].delete(callback);
        if (this.listeners[instrumentId].size === 0) {
          delete this.listeners[instrumentId];
        }
      }
      // Stop loop if no active components are listening
      if (Object.keys(this.listeners).length === 0) {
        this.stop();
      }
    };
  }

  notify(instrumentId) {
    if (this.listeners[instrumentId]) {
      const stateCopy = { ...this.states[instrumentId] };
      this.listeners[instrumentId].forEach((callback) => {
        try {
          callback(stateCopy);
        } catch (err) {
          console.error(`Error notifying listener for ${instrumentId}:`, err);
        }
      });
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Crypto sweep: fast, every 2 seconds (Binance responds in <100ms)
    this.sweepCrypto();
    this.cryptoIntervalId = setInterval(() => {
      this.sweepCrypto();
    }, 2000);

    // Dukascopy sweep: slower, every 4 seconds (each call takes 500ms-2s)
    this.sweepDukascopy();
    this.dukascopyIntervalId = setInterval(() => {
      this.sweepDukascopy();
    }, 4000);
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.cryptoIntervalId) {
      clearInterval(this.cryptoIntervalId);
      this.cryptoIntervalId = null;
    }
    if (this.dukascopyIntervalId) {
      clearInterval(this.dukascopyIntervalId);
      this.dukascopyIntervalId = null;
    }
  }

  // Crypto sweep — poll all crypto instruments in parallel (fast via Binance)
  async sweepCrypto() {
    if (!this.isRunning) return;

    const instrumentsToPoll = this.cryptoInstruments.filter((id) => {
      const state = this.states[id];
      // 5-second cooldown for errors
      if (state.isStale && Date.now() - state.lastErrorTime < 5000) return false;
      return true;
    });

    // Binance is fast — poll all crypto in parallel
    await Promise.all(instrumentsToPoll.map((id) => this.pollInstrument(id)));
  }

  // Dukascopy sweep — poll forex/metals/indices in small batches (slow API)
  async sweepDukascopy() {
    if (!this.isRunning) return;
    const now = Date.now();

    const instrumentsToPoll = this.dukascopyInstruments.filter((id) => {
      const state = this.states[id];
      // 15-second cooldown for Dukascopy errors (it's slow, don't hammer)
      if (state.isStale && now - state.lastErrorTime < 15000) return false;
      return true;
    });

    // Divide into batches of 3 (smaller batches = less overload on Dukascopy)
    const batchSize = 3;
    const batches = [];
    for (let i = 0; i < instrumentsToPoll.length; i += batchSize) {
      batches.push(instrumentsToPoll.slice(i, i + batchSize));
    }

    // Process batches with 500ms gap in between
    for (let i = 0; i < batches.length; i++) {
      if (!this.isRunning) break;

      const batch = batches[i];
      await Promise.all(batch.map((id) => this.pollInstrument(id)));

      // Delay 500ms before starting next batch (except after last batch)
      if (i < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  async pollInstrument(id) {
    const state = this.states[id];

    // Add 6-second request timeout via AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await fetch(`/api/live-price?instrument=${id}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }
      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const { bid, ask, mid, spread, timestamp } = data;
      const prevMid = state.mid;

      // Initialize session base reference on first success
      if (state.initialMid === null) {
        state.initialMid = mid;
      }

      state.bid = bid;
      state.ask = ask;
      state.mid = mid;
      state.spread = spread;
      state.timestamp = timestamp;
      state.isStale = false;
      state.errorCount = 0;

      // Determine price tick direction
      if (prevMid !== null) {
        if (mid > prevMid) {
          state.direction = "up";
        } else if (mid < prevMid) {
          state.direction = "down";
        } else {
          state.direction = "flat";
        }
      } else {
        state.direction = "flat";
      }

      // Calculate absolute and percentage change from session load base
      state.change = mid - state.initialMid;
      state.changePercent = state.initialMid !== 0 ? (state.change / state.initialMid) * 100 : 0;

      // Keep rolling history of last 60 ticks
      state.ticks = [...state.ticks, mid];
      if (state.ticks.length > 60) {
        state.ticks.shift();
      }

      this.notify(id);
    } catch (err) {
      clearTimeout(timeoutId);

      // Only log non-abort errors to avoid console spam
      if (err.name !== "AbortError") {
        console.warn(`Error polling rates for ${id}:`, err.message);
      } else {
        console.warn(`Timeout polling ${id} (6s exceeded)`);
      }

      state.isStale = true;
      state.direction = "flat";
      state.lastErrorTime = Date.now();
      state.errorCount += 1;

      this.notify(id);
    }
  }
}

// Export singleton instance
export const pollingEngine = new PollingEngine();
