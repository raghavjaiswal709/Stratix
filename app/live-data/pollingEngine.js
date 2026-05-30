import { INSTRUMENTS } from "./instrumentConfig.js";

class PollingEngine {
  constructor() {
    this.states = {};
    this.listeners = {}; // instrumentId -> Set of callbacks
    this.isRunning = false;
    this.intervalId = null;
    this.instrumentsList = Object.keys(INSTRUMENTS);

    // Initialize state structure for all 43 instruments
    this.instrumentsList.forEach((id) => {
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
    
    // Execute immediate poll sweep
    this.sweep();

    // Trigger sweep every 2 seconds
    this.intervalId = setInterval(() => {
      this.sweep();
    }, 2000);
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async sweep() {
    const now = Date.now();
    
    // Filter out instruments currently under 10-second error cooldown
    const instrumentsToPoll = this.instrumentsList.filter((id) => {
      const state = this.states[id];
      if (state.isStale && now - state.lastErrorTime < 10000) {
        return false; // Skip, inside cooldown period
      }
      return true;
    });

    // Divide instruments into batches of 5
    const batchSize = 5;
    const batches = [];
    for (let i = 0; i < instrumentsToPoll.length; i += batchSize) {
      batches.push(instrumentsToPoll.slice(i, i + batchSize));
    }

    // Process batches with 300ms gap in between
    for (let i = 0; i < batches.length; i++) {
      if (!this.isRunning) break;
      
      const batch = batches[i];
      
      // Execute this batch concurrently
      await Promise.all(batch.map((id) => this.pollInstrument(id)));
      
      // Delay 300ms before starting next batch (except after last batch)
      if (i < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
  }

  async pollInstrument(id) {
    const state = this.states[id];
    
    try {
      const res = await fetch(`/api/live-price?instrument=${id}`);
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
      console.warn(`Error polling rates for ${id}:`, err.message);
      
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
