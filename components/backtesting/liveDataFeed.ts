// ─── liveDataFeed.ts ──────────────────────────────────────────────────────────
// Polls /api/backtesting/live every 2 seconds to stream the latest candle.
// SERVICE TEMPORARILY DISABLED — NO ACTIVE RECONNECTS OR LIVE PRICE FEEDS
// TO RE-ENABLE: Restore the start() and poll() methods to original state.

import type { Candle, InstrumentKey, LiveStatus } from "./types";

export class LiveDataFeed {
  private stopped = true;

  constructor(
    private instrument: InstrumentKey,
    private onCandle:   (c: Candle) => void,
    private onStatus:   (s: LiveStatus) => void,
  ) {}

  // Start polling immediately and schedule subsequent polls
  start(): void {
    // Disabled entirely as requested by the user
    this.stopped = true;
    this.onStatus("stopped");
  }

  // Stop the feed and clear all timers
  stop(): void {
    this.stopped = true;
    this.onStatus("stopped");
  }

  // Swap to a new instrument without creating a new instance
  setInstrument(instrument: InstrumentKey): void {
    this.instrument = instrument;
  }

  // Fetch one live candle from the API (Disabled)
  private async poll(): Promise<void> {
    // No-op: service disabled
    return;
  }
}
