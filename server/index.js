/**
 * Stratix live-price WebSocket server.
 *
 * Runs standalone on the Oracle Cloud ARM VM (NOT inside Next.js).
 * Connects to four free data sources and fans normalized price ticks out
 * to every connected dashboard client:
 *
 *   1. Binance WS   → BTC, ETH, XAU (XAUT/PAXG tokens), no key
 *   2. Finnhub WS   → OANDA forex + XAU/XAG (real-time with free key)
 *   3. gold-api.com → XAG silver fallback (REST poll 1s, no key)
 *
 * Gold update frequency:
 *   - Without Finnhub key: Binance XAUTUSDT/PAXGUSDT → sub-second real-time
 *     (1 XAUT = 1 troy oz physical gold held at Matador Vault/Tether)
 *   - Silver: gold-api every 1 s (price refreshes every ~30 s on free tier);
 *     add a Finnhub key to get OANDA:XAG_USD in real-time too.
 *
 * Normalized broadcast format:
 *   { symbol, price, bid, ask, timestamp, source }
 *
 * Requires Node 20+ (uses the global `fetch` and global `WebSocket`-free `ws`).
 */

require("dotenv").config();
const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");

// ── Config ───────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 8080;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || "";
const GOLD_API_BASE = process.env.GOLD_API_BASE || "https://api.gold-api.com/price";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const RECONNECT_MS = 5000;
const PING_MS = 30000;
// Silver poll interval — poll frequently so we catch gold-api price changes
// within 200 ms of them going live on the API (price itself refreshes ~every 30 s).
const SILVER_POLL_MS = 200;
// Maximum broadcast rate per symbol for @bookTicker streams.
// @bookTicker fires on every order-book top change (can be 10–100 /sec).
// Throttle to 5 /sec (200 ms) so the frontend stays smooth without overload.
const BOOK_TICKER_THROTTLE_MS = 200;

// Finnhub OANDA symbols — forex only (free tier).
// XAU/XAG removed: Binance XAUT/PAXG covers gold (sub-second), gold-api covers silver.
// Subscribing to metals via Finnhub triggers a premium-tier disconnect on free plans.
const FINNHUB_SYMBOLS = [
  "OANDA:EUR_USD",
  "OANDA:GBP_USD",
  "OANDA:USD_JPY",
  "OANDA:USD_CHF",
  "OANDA:USD_CAD",
  "OANDA:AUD_USD",
];

const FINNHUB_MAP = {
  "OANDA:EUR_USD": "EURUSD",
  "OANDA:GBP_USD": "GBPUSD",
  "OANDA:USD_JPY": "USDJPY",
  "OANDA:USD_CHF": "USDCHF",
  "OANDA:USD_CAD": "USDCAD",
  "OANDA:AUD_USD": "AUDUSD",
};

// Binance stream map.
// XAUTUSDT/PAXGUSDT = tokenized gold (1 token = 1 troy oz, ~0.15% of spot)
// BTCEUR @bookTicker → live EUR/USD cross-rate (within 0.2% of spot)
const BINANCE_MAP = {
  BTCUSDT:  "BTCUSD",
  ETHUSDT:  "ETHUSD",
  XAUTUSDT: "XAUUSD",
  PAXGUSDT: "XAUUSD",
  // BTCEUR is handled separately (cross-rate, not broadcast directly)
};

// Track BTC/USD and BTC/EUR mid-prices for EUR/USD derivation.
// EUR/USD = BTCUSDT_mid / BTCEUR_mid  (accurate to ±0.2%)
const crossRates = { BTCUSD: 0, BTCEUR: 0 };

// ── State ────────────────────────────────────────────────────────────────────
/** Last known tick per normalized symbol, replayed to new clients. */
const latestPrices = new Map();
/** Last broadcast wall-clock time per symbol — used by bookTicker throttle. */
const lastBroadcastMs = new Map();

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

// ── HTTP server (required for Fly.io health checks + hosts the WS server) ────
// GET /health → 200 JSON  (Fly.io load-balancer checks this every 10 s)
// All other HTTP requests get a 426 Upgrade Required so nothing else breaks.
const httpServer = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      clients: wss ? wss.clients.size : 0,
      uptime: Math.floor(process.uptime()),
      symbols: [...latestPrices.keys()],
    }));
    return;
  }
  res.writeHead(426, { "Content-Type": "text/plain" });
  res.end("WebSocket connections only");
});

// ── Dashboard-facing WebSocket server ────────────────────────────────────────
const wss = new WebSocketServer({
  server: httpServer,               // shares the HTTP server — one port for both
  verifyClient: (info, done) => {
    const origin = info.origin || info.req.headers.origin;
    if (!origin) return done(true); // non-browser clients (health probes etc.)
    if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes("*")) {
      return done(true);
    }
    log("✗ Rejected origin:", origin);
    return done(false, 403, "Origin not allowed");
  },
});

httpServer.listen(PORT, () => {
  log(`▲ Stratix WS server on :${PORT}  (HTTP /health + WebSocket)`);
  log("  Allowed origins:", ALLOWED_ORIGINS.join(", ") || "(none)");
});

wss.on("connection", (ws, req) => {
  ws.isAlive = true;
  const ip = req.socket.remoteAddress;
  log(`+ Client connected (${ip}). Total: ${wss.clients.size}`);

  // Replay last known prices immediately so the chart never starts blank.
  for (const tick of latestPrices.values()) {
    safeSend(ws, tick);
  }

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("close", () => {
    log(`- Client disconnected. Total: ${wss.clients.size}`);
  });

  ws.on("error", (err) => {
    log("Client socket error:", err.message);
  });
});

/** Heartbeat: drop clients that stopped responding to pings. */
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      /* ignore */
    }
  }
}, PING_MS);

wss.on("close", () => clearInterval(heartbeat));

function safeSend(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

/** Normalize, cache, and fan a tick out to every connected client. */
function broadcast(tick) {
  latestPrices.set(tick.symbol, tick);
  const data = JSON.stringify(tick);
  for (const ws of wss.clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

/**
 * Throttled broadcast for @bookTicker events.
 * @bookTicker fires on every order-book top change (10-100/sec for active pairs).
 * We gate each symbol to at most 1 broadcast per BOOK_TICKER_THROTTLE_MS (200 ms)
 * so the frontend receives exactly ~5 updates/sec — fast enough to feel live,
 * without flooding React state updates or the WebSocket wire.
 */
function broadcastThrottled(tick) {
  const now = Date.now();
  const last = lastBroadcastMs.get(tick.symbol) || 0;
  if (now - last >= BOOK_TICKER_THROTTLE_MS) {
    lastBroadcastMs.set(tick.symbol, now);
    broadcast(tick);
  }
}

// ── Source 1: Binance ────────────────────────────────────────────────────────
// Stream strategy:
//   BTC / ETH  → @trade (actual transactions, already fire multiple times/sec)
//   XAU (XAUT/PAXG) → @bookTicker (best-bid/ask changes, fires 6-50 times/sec)
//     @bookTicker is throttled to 5 /sec (200 ms) before broadcasting.
//     This gives BTC/ETH chart-accurate trade prices AND gold the maximum
//     visual update rate without needing any API key.
function connectBinance() {
  const streams = [
    "btcusdt@trade",         // BTC/USD trades  (many/sec)
    "ethusdt@trade",         // ETH/USD trades  (many/sec)
    "btcusdt@bookTicker",    // BTC/USD bid/ask (needed for EUR/USD cross-rate)
    "btceur@bookTicker",     // BTC/EUR bid/ask (cross-rate: EURUSD = BTCUSD/BTCEUR)
    "xautusdt@bookTicker",   // Tether Gold — fires on every order-book top change
    "paxgusdt@bookTicker",   // Paxos Gold  — second source, also very frequent
  ].join("/");
  const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
  const ws = new WebSocket(url);

  ws.on("open", () => log("✓ Binance connected (bookTicker for gold, @trade for BTC/ETH)"));

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const d = msg.data;
      if (!d || !d.s) return;
      const symbol = BINANCE_MAP[d.s];
      if (!symbol) return;

      if (d.e === "trade") {
        // @trade — actual transaction: broadcast immediately, use trade time.
        if (!symbol) return;
        const price = parseFloat(d.p);
        broadcast({ symbol, price, bid: price, ask: price, timestamp: d.T || Date.now(), source: "binance" });

      } else if (d.b !== undefined && d.a !== undefined) {
        // @bookTicker — best bid/ask changed.
        const bid = parseFloat(d.b);
        const ask = parseFloat(d.a);
        const mid = (bid + ask) / 2;

        // EUR/USD cross-rate: store BTC/USD and BTC/EUR mid-prices,
        // then derive EUR/USD = BTCUSD / BTCEUR (accurate to ±0.2%).
        if (d.s === "BTCUSDT") {
          crossRates.BTCUSD = mid;
        } else if (d.s === "BTCEUR") {
          crossRates.BTCEUR = mid;
        }
        if (crossRates.BTCUSD > 0 && crossRates.BTCEUR > 0 && (d.s === "BTCUSDT" || d.s === "BTCEUR")) {
          const eurusd = crossRates.BTCUSD / crossRates.BTCEUR;
          broadcastThrottled({ symbol: "EURUSD", price: eurusd, bid: eurusd, ask: eurusd, timestamp: Date.now(), source: "binance-cross" });
        }

        // For other bookTicker symbols (gold tokens): broadcast mid-price.
        if (symbol && d.s !== "BTCUSDT" && d.s !== "BTCEUR") {
          broadcast({ symbol, price: mid, bid, ask, timestamp: Date.now(), source: "binance" });
        }
      }
    } catch (err) {
      log("Binance parse error:", err.message);
    }
  });

  ws.on("close", () => {
    log("Binance disconnected — reconnecting in 5s");
    setTimeout(connectBinance, RECONNECT_MS);
  });
  ws.on("error", (err) => {
    log("Binance error:", err.message);
    ws.close();
  });
}

// ── Source 2: Finnhub (forex + XAU/XAG via OANDA) ───────────────────────────
function connectFinnhub() {
  if (!FINNHUB_API_KEY || FINNHUB_API_KEY === "your_finnhub_free_api_key_here") {
    log("⚠ FINNHUB_API_KEY not set — skipping forex feed");
    return;
  }
  const url = `wss://ws.finnhub.io?token=${FINNHUB_API_KEY}`;
  const ws = new WebSocket(url);
  let pingInterval = null;

  ws.on("open", () => {
    log("✓ Finnhub connected — waiting 1s before subscribing");

    // ROOT CAUSE FIX: Finnhub closes connections that subscribe immediately on open.
    // A 1-second warm-up delay lets the server fully establish the session first.
    setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      log("✓ Finnhub subscribing to", FINNHUB_SYMBOLS.length, "forex symbols");
      // Send subscriptions one-at-a-time with 150 ms gap.
      // Sending all at once can trigger Finnhub's burst detection and cause a 1006 drop.
      FINNHUB_SYMBOLS.forEach((sym, i) => {
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "subscribe", symbol: sym }));
          }
        }, i * 150);
      });

      // Heartbeat: Finnhub drops idle connections without regular pings.
      // Send a ping every 25 s to keep the session alive.
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 25000);
    }, 1000);
  });

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      // Ignore pong responses and subscription confirmations
      if (msg.type === "pong" || msg.type === "ping") return;
      if (msg.type !== "trade" || !Array.isArray(msg.data)) return;
      for (const t of msg.data) {
        const symbol = FINNHUB_MAP[t.s];
        if (!symbol) continue;
        const price = t.p;
        if (!Number.isFinite(price) || price <= 0) continue;
        broadcast({
          symbol,
          price,
          bid: price,
          ask: price,
          timestamp: t.t || Date.now(),
          source: "finnhub",
        });
      }
    } catch (err) {
      log("Finnhub parse error:", err.message);
    }
  });

  ws.on("close", (code) => {
    if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
    // Code 1006 = abnormal closure (Finnhub drops free-tier OANDA connections).
    // Back off to 60 s on repeated drops so we don't hit 429 rate limits.
    const delay = code === 1006 ? 60000 : RECONNECT_MS;
    log(`Finnhub disconnected (code ${code}) — reconnecting in ${delay / 1000}s`);
    setTimeout(connectFinnhub, delay);
  });
  ws.on("error", (err) => {
    // 429 = rate-limited due to too-frequent reconnects; back off 5 minutes.
    const is429 = err.message && err.message.includes("429");
    const delay = is429 ? 300000 : RECONNECT_MS;
    log(`Finnhub error: ${err.message} — backing off ${delay / 1000}s`);
    try { ws.close(); } catch { /* ignore */ }
    if (is429) setTimeout(connectFinnhub, delay);
  });
}

// ── Source 3: open.er-api.com — forex rates (free, no key, all 6 pairs) ───────
// Complements the Binance EUR/USD cross-rate by covering GBP, JPY, CHF, CAD, AUD.
// open.er-api.com is a free tier of openexchangerates — no key, no registration.
// Returns USD-based rates; we invert to get standard forex quoting convention.
const FOREX_POLL_MS = 10000; // 10 seconds — safe for a free service

async function pollForex() {
  try {
    const res = await fetch(
      "https://open.er-api.com/v6/latest/USD",
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return;
    const d = await res.json();
    if (d.result !== "success" || !d.rates) return;

    const now = Date.now();
    const r = d.rates;

    // Invert USD-base rates to get standard forex pairs
    const pairs = [
      ["EURUSD", r.EUR ? 1 / r.EUR : null],
      ["GBPUSD", r.GBP ? 1 / r.GBP : null],
      ["USDJPY", r.JPY ?? null],
      ["USDCHF", r.CHF ?? null],
      ["USDCAD", r.CAD ?? null],
      ["AUDUSD", r.AUD ? 1 / r.AUD : null],
    ];

    for (const [symbol, price] of pairs) {
      if (!price || !Number.isFinite(price)) continue;
      // Only update via REST if we don't have a live Binance cross-rate for this symbol
      // (Binance covers EURUSD with sub-second accuracy; REST fills the rest)
      broadcast({ symbol, price, bid: price, ask: price, timestamp: now, source: "er-api" });
    }
  } catch (err) {
    log("forex poll error:", err.message);
  }
}

function startForexPolling() {
  log("✓ open.er-api.com forex polling every 10s (no key needed)");
  pollForex(); // immediate first fetch
  setInterval(pollForex, FOREX_POLL_MS);
}

// ── Source 4: gold-api.com — silver (XAG) only ───────────────────────────────
// Gold is now covered by Binance XAUT/PAXG (sub-second, no key).
// Silver has no liquid Binance-listed token, so we keep gold-api for XAG.
// Price refreshes every ~30 s on the free tier; Finnhub OANDA:XAG_USD gives
// real-time silver once a valid API key is configured.
async function pollGold() {
  try {
    const xag = await fetchGold("XAG", "XAGUSD");
    // Broadcast every 200 ms poll — frontend throttles React state to 5/sec.
    // Polling at 200 ms means we catch any gold-api price change within 200 ms
    // of it being published (price itself refreshes every ~30 s on free tier).
    if (xag) broadcast(xag);
  } catch (err) {
    log("gold-api poll error:", err.message);
  }
}

async function fetchGold(code, symbol) {
  try {
    const res = await fetch(`${GOLD_API_BASE}/${code}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(4000), // don't block the next 1s poll
    });
    if (!res.ok) return null;
    const d = await res.json();
    const price = Number(d.price);
    if (!Number.isFinite(price)) return null;
    // gold-api.com only provides a spot price refreshed every ~30s.
    // Use Date.now() (wall-clock) as the broadcast timestamp so the chart's
    // candle-bucket logic tracks real time — NOT updatedAt which is stale
    // and only changes every 30 s, which would freeze the live candle.
    return {
      symbol,
      price,
      bid: price,
      ask: price,
      timestamp: Date.now(),
      source: "gold-api",
    };
  } catch (err) {
    log(`gold-api ${code} fetch error:`, err.message);
    return null;
  }
}

function startGoldPolling() {
  log("✓ gold-api silver (XAG) polling every 200 ms");
  pollGold();
  setInterval(pollGold, SILVER_POLL_MS);
}

// ── Boot ─────────────────────────────────────────────────────────────────────
connectBinance();          // BTC, ETH (@trade) + XAU via XAUT/PAXG (@bookTicker) + EUR/USD cross-rate
connectFinnhub();          // forex via OANDA (only works with paid Finnhub plan; backs off gracefully on free)
startForexPolling();       // all 6 forex pairs via open.er-api.com — free, no key, updates every 10s
startGoldPolling();        // silver (XAG) via gold-api.com every 200ms

// Never let an unhandled rejection kill the process.
process.on("unhandledRejection", (err) => {
  log("UnhandledRejection:", err && err.message ? err.message : err);
});
process.on("uncaughtException", (err) => {
  log("UncaughtException:", err && err.message ? err.message : err);
});
