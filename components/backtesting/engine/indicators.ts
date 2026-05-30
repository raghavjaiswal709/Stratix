// ─── Technical indicator calculations (pure functions, no side effects) ───────

/**
 * Simple Moving Average over an array of values.
 * Returns null for indices where there aren't enough samples yet.
 */
export function calcSMA(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  let windowSum = 0;

  for (let i = 0; i < values.length; i++) {
    windowSum += values[i];
    if (i >= period) windowSum -= values[i - period];

    if (i < period - 1) {
      result.push(null);
    } else {
      result.push(windowSum / period);
    }
  }
  return result;
}

/**
 * Wilder-smoothed RSI (matches TradingView's RSI implementation).
 * Returns null for the first `period` values.
 */
export function calcRSI(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return result;

  // Seed with simple average of first `period` gains/losses
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < closes.length; i++) {
    if (i > period) {
      const diff = closes[i] - closes[i - 1];
      avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    }
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    result[i] = 100 - 100 / (1 + rs);
  }

  return result;
}

/**
 * Rolling N-bar high over an array of values.
 * Returns null for the first `period - 1` indices.
 */
export function calcRollingHigh(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      result.push(Math.max(...values.slice(i - period + 1, i + 1)));
    }
  }
  return result;
}

/**
 * Rolling N-bar low over an array of values.
 * Returns null for the first `period - 1` indices.
 */
export function calcRollingLow(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      result.push(Math.min(...values.slice(i - period + 1, i + 1)));
    }
  }
  return result;
}
