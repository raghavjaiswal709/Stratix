const fs = require('fs');
const path = require('path');

const CSV_DIRS = {
  EURUSD: "eurusd", GBPUSD: "gbpusd", USDJPY: "usdjpy", USDCHF: "usdchf",
  USDCAD: "usdcad", AUDUSD: "audusd", XAUUSD: "xauusd", XAGUSD: "xagusd",
  BTCUSD: "btcusdt", ETHUSD: "ethusd",
};

function recentMonthFiles(dir, n) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${dir}_${d.getFullYear()}_${m}.csv`;
  });
}

function resample(rows, bucketSec) {
  const buckets = new Map();
  for (const row of rows) {
    const p = row.split(",");
    if (p.length < 6) continue;
    const ts = parseInt(p[0], 10);
    if (!Number.isFinite(ts)) continue;
    const o = parseFloat(p[1]), h = parseFloat(p[2]);
    const l = parseFloat(p[3]), c = parseFloat(p[4]);
    const v = parseFloat(p[5]) || 0;
    if (!Number.isFinite(o)) continue;
    const bucket = Math.floor(ts / bucketSec) * bucketSec;
    const b = buckets.get(bucket);
    if (!b) {
      buckets.set(bucket, { time: bucket, open: o, high: h, low: l, close: c, volume: v });
    } else {
      b.high = Math.max(b.high, h); b.low = Math.min(b.low, l);
      b.close = c; b.volume += v;
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

async function loadFromCsv(symbol, intervalSec, limit) {
  const dir = CSV_DIRS[symbol];
  if (!dir) return [];
  const months = Math.max(2, Math.ceil((limit * intervalSec) / (30 * 86400)) + 1);
  const files = recentMonthFiles(dir, months);
  console.log(`Files to read for ${symbol}:`, files);

  const chunks = await Promise.all(
    files.map(async (file) => {
      try {
        const filePath = path.join(__dirname, "../public/data/candles", dir, file);
        if (!fs.existsSync(filePath)) {
          console.warn(`File not found: ${file}`);
          return [];
        }
        const text = await fs.promises.readFile(filePath, "utf-8");
        const lines = text.split("\n").filter((l) => l.trim() && !l.startsWith("time"));
        console.log(`Read ${lines.length} lines from ${file}`);
        return lines;
      } catch (err) {
        console.error(`Error reading ${file}:`, err.message);
        return [];
      }
    })
  );
  return resample(chunks.flat(), intervalSec);
}

async function run() {
  const symbol = "EURUSD";
  const intervalSec = 60; // 1m
  const limit = 500;
  
  console.log(`Testing loadFromCsv for ${symbol}...`);
  const start = Date.now();
  const candles = await loadFromCsv(symbol, intervalSec, limit);
  console.log(`SUCCESS: loaded ${candles.length} candles in ${Date.now() - start}ms`);
  if (candles.length > 0) {
    console.log("First candle time:", new Date(candles[0].time * 1000).toISOString());
    console.log("Last candle time:", new Date(candles[candles.length - 1].time * 1000).toISOString());
  }
}

run();
