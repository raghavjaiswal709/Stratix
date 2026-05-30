/**
 * Indicators mathematical calculation utilities for client-side overlays.
 */

/**
 * Calculates Simple Moving Average (SMA)
 * @param {Array} candles [{ time, open, high, low, close, volume }]
 * @param {number} period 
 * @returns {Array} [{ time, value }]
 */
export function calculateSMA(candles, period) {
  if (!candles || candles.length < period) return [];

  const results = [];
  let sum = 0;

  // Initialize sum for first window
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }
  results.push({
    time: candles[period - 1].time,
    value: +(sum / period).toFixed(6)
  });

  // Slide window across remaining candles
  for (let i = period; i < candles.length; i++) {
    sum += candles[i].close - candles[i - period].close;
    results.push({
      time: candles[i].time,
      value: +(sum / period).toFixed(6)
    });
  }

  return results;
}

/**
 * Calculates Exponential Moving Average (EMA)
 * @param {Array} candles 
 * @param {number} period 
 * @returns {Array} [{ time, value }]
 */
export function calculateEMA(candles, period) {
  if (!candles || candles.length < period) return [];

  const results = [];
  
  // 1. First EMA is just standard SMA of first period
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }
  let currentEma = sum / period;
  
  results.push({
    time: candles[period - 1].time,
    value: +currentEma.toFixed(6)
  });

  const k = 2 / (period + 1);

  // 2. Compute subsequent EMA points
  for (let i = period; i < candles.length; i++) {
    currentEma = candles[i].close * k + currentEma * (1 - k);
    results.push({
      time: candles[i].time,
      value: +currentEma.toFixed(6)
    });
  }

  return results;
}

/**
 * Calculates Bollinger Bands (Upper, Middle/SMA, Lower)
 * @param {Array} candles 
 * @param {number} period Default 20
 * @param {number} stddevs Default 2
 * @returns {object} { upper: [], middle: [], lower: [] }
 */
export function calculateBollingerBands(candles, period = 20, stddevs = 2) {
  if (!candles || candles.length < period) {
    return { upper: [], middle: [], lower: [] };
  }

  const upper = [];
  const middle = [];
  const lower = [];

  for (let i = period - 1; i < candles.length; i++) {
    // 1. Calculate SMA (Middle Band)
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += candles[j].close;
    }
    const sma = sum / period;
    const time = candles[i].time;

    // 2. Calculate Standard Deviation
    let varianceSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      varianceSum += Math.pow(candles[j].close - sma, 2);
    }
    const standardDeviation = Math.sqrt(varianceSum / period);

    const devValue = stddevs * standardDeviation;
    
    middle.push({ time, value: +sma.toFixed(6) });
    upper.push({ time, value: +(sma + devValue).toFixed(6) });
    lower.push({ time, value: +(sma - devValue).toFixed(6) });
  }

  return { upper, middle, lower };
}

/**
 * Recalculates the single latest active value of each indicator for the current live tick.
 * Useful for real-time series updates of indicators without full history rebuild.
 */
export function calculateLatestIndicatorValue(candles, currentCandle, indicatorType, period, extraParam) {
  if (!candles || candles.length === 0 || !currentCandle) return null;

  // Append temporary current candle to close history to run window calculations
  const tempCandles = [...candles.slice(-(period + 1)), currentCandle];
  const length = tempCandles.length;

  if (length < period) return null;

  if (indicatorType === "SMA") {
    let sum = 0;
    for (let i = length - period; i < length; i++) {
      sum += tempCandles[i].close;
    }
    return { time: currentCandle.time, value: +(sum / period).toFixed(6) };
  }

  if (indicatorType === "EMA") {
    // Rely on previous closed candle's computed EMA value to derive the ticking current value
    const prevEmaValue = extraParam; // Pass in previously resolved EMA as context
    if (prevEmaValue === undefined || prevEmaValue === null) {
      // Fallback to simple SMA if context missing
      let sum = 0;
      for (let i = length - period; i < length; i++) {
        sum += tempCandles[i].close;
      }
      return { time: currentCandle.time, value: +(sum / period).toFixed(6) };
    }
    const k = 2 / (period + 1);
    const ema = currentCandle.close * k + prevEmaValue * (1 - k);
    return { time: currentCandle.time, value: +ema.toFixed(6) };
  }

  if (indicatorType === "BB") {
    let sum = 0;
    for (let i = length - period; i < length; i++) {
      sum += tempCandles[i].close;
    }
    const sma = sum / period;

    let varianceSum = 0;
    for (let i = length - period; i < length; i++) {
      varianceSum += Math.pow(tempCandles[i].close - sma, 2);
    }
    const stdDev = Math.sqrt(varianceSum / period);
    const devValue = (extraParam || 2) * stdDev;

    return {
      time: currentCandle.time,
      upper: +(sma + devValue).toFixed(6),
      middle: +(sma).toFixed(6),
      lower: +(sma - devValue).toFixed(6)
    };
  }

  return null;
}
