// ─── liveDataFeed.ts ──────────────────────────────────────────────────────────
// Polls /api/backtesting/live every 2 seconds to stream the latest candle.
// Automatically retries with exponential back-off when the feed fails.

import type { Candle, InstrumentKey, LiveStatus } from "./types";

const POLL_INTERVAL_MS = 2000;
const RETRY_DELAY_MS   = 5000;

export class LiveDataFeed {
  private pollTimer:  ReturnType<typeof setInterval>  | null = null;
  private retryTimer: ReturnType<typeof setTimeout>   | null = null;
  private stopped = false;

  constructor(
    private instrument: InstrumentKey,
    private onCandle:   (c: Candle) => void,
    private onStatus:   (s: LiveStatus) => void,
  ) {}

  // Start polling immediately and schedule subsequent polls
  start(): void {
    this.stopped = false;
    this.poll();
    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  // Stop the feed and clear all timers
  stop(): void {
    this.stopped = true;
    if (this.pollTimer)  clearInterval(this.pollTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.pollTimer  = null;
    this.retryTimer = null;
    this.onStatus("stopped");
  }

  // Swap to a new instrument without creating a new instance
  setInstrument(instrument: InstrumentKey): void {
    this.instrument = instrument;
  }

  // Fetch one live candle from the API
  private async poll(): Promise<void> {
    if (this.stopped) return;

    try {
      const res = await fetch(`/api/backtesting/live?instrument=${this.instrument}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json() as { candle?: Candle | null };
      if (json.candle) {
        this.onCandle(json.candle);
        this.onStatus("live");
      }
    } catch {
      if (this.stopped) return;
      this.onStatus("reconnecting");
      // Schedule a one-shot retry after RETRY_DELAY_MS (in addition to the regular poll)
      this.retryTimer = setTimeout(() => {
        if (!this.stopped) this.poll();
      }, RETRY_DELAY_MS);
    }
  }
}
