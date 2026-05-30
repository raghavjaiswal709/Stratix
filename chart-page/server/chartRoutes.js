import { NextResponse } from "next/server";
import { candleBuilder } from "./candleBuilder.js";

/**
 * GET /api/chart-candles?instrument=xauusd&timeframe=1m
 * Prefills closed historical candles once on load
 */
export async function handleChartCandles(request) {
  const { searchParams } = new URL(request.url);
  const instrument = searchParams.get("instrument") || "xauusd";
  const timeframe = searchParams.get("timeframe") || "1m";

  try {
    const state = candleBuilder.getSessionState();
    
    // Automatically initialize/switch session if requested instrument or timeframe differs
    if (state.instrument !== instrument.toLowerCase() || state.timeframe !== timeframe) {
      await candleBuilder.initializeSession(instrument, timeframe);
    }

    const latestState = candleBuilder.getSessionState();
    return NextResponse.json({
      closedCandles: latestState.closedCandles
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"
      }
    });
  } catch (err) {
    console.error(`[chartRoutes] Error prefilling closed candles:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/chart-tick?instrument=xauusd&timeframe=1m
 * Returns the current ticking candle and serverTime (called every 1s)
 */
export async function handleChartTick(request) {
  const { searchParams } = new URL(request.url);
  const instrument = searchParams.get("instrument") || "xauusd";
  const timeframe = searchParams.get("timeframe") || "1m";

  try {
    const state = candleBuilder.getSessionState();

    // Safe safeguard: if the current state doesn't match the client request (switching, etc),
    // return null until the client calls handleChartCandles to start the new session
    if (state.instrument !== instrument.toLowerCase() || state.timeframe !== timeframe) {
      return NextResponse.json({
        currentCandle: null,
        serverTime: Date.now()
      });
    }

    return NextResponse.json({
      currentCandle: state.currentCandle,
      serverTime: state.serverTime
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"
      }
    });
  } catch (err) {
    console.error(`[chartRoutes] Error getting live tick candle:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/chart-session
 * Halts active polling loops and clears global CandleBuilder memory state
 */
export async function handleChartSession(request) {
  try {
    candleBuilder.reset();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`[chartRoutes] Error terminating session:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
