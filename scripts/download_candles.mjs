import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getHistoricRates, Timeframe, Instrument } from 'dukascopy-node';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cacheDir = path.join(__dirname, '../.dukascopy-cache');
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

// 14 symbols mapped to dukascopy enums
const INSTRUMENT_MAP = {
  xauusd: Instrument.xauusd,
  xagusd: Instrument.xagusd,
  eurusd: Instrument.eurusd,
  gbpusd: Instrument.gbpusd,
  usdcad: Instrument.usdcad,
  usdjpy: Instrument.usdjpy,
  nzdusd: Instrument.nzdusd,
  audusd: Instrument.audusd,
  usdchf: Instrument.usdchf,
  ethusd: Instrument.ethusd,
  btcusdt: Instrument.btcusd, // mapped to btcusd
  dxy: Instrument.dollaridxusd, // mapped to dollaridxusd
  usoil: Instrument.lightcmdusd, // mapped to lightcmdusd
  us100: Instrument.usatechidxusd, // mapped to usatechidxusd
};

// Decimal precision per instrument.
// Forex majors/minors: 5dp (1 pip = 0.0001, 1 point = 0.00001).
// JPY pairs: 3dp. Metals/crypto/indices: 2-3dp.
const PRICE_PRECISION = {
  eurusd: 5, gbpusd: 5, usdcad: 5, nzdusd: 5, audusd: 5, usdchf: 5,
  usdjpy: 3,
  xauusd: 2, xagusd: 3,
  ethusd: 2, btcusdt: 2,
  dxy: 3, usoil: 2, us100: 2,
};

// Parse command line arguments
const args = process.argv.slice(2);
let years = 10; // Default to 10 years
const yearsArgIdx = args.indexOf('--years');
if (yearsArgIdx !== -1 && args[yearsArgIdx + 1]) {
  years = parseInt(args[yearsArgIdx + 1], 10);
}

let symbols = Object.keys(INSTRUMENT_MAP);
const symbolArgIdx = args.indexOf('--symbol');
if (symbolArgIdx !== -1 && args[symbolArgIdx + 1]) {
  const sym = args[symbolArgIdx + 1].toLowerCase();
  if (INSTRUMENT_MAP[sym]) {
    symbols = [sym];
  } else {
    console.error(`Unknown symbol: ${sym}. Available symbols: ${Object.keys(INSTRUMENT_MAP).join(', ')}`);
    process.exit(1);
  }
}

// --force: overwrite existing CSV files (use when regenerating with corrected precision)
const forceOverwrite = args.includes('--force');

// Generate the list of months to download (up to 10 years back from today)
const today = new Date();
const endYear = today.getUTCFullYear();
const endMonth = today.getUTCMonth(); // May (indexed 4 in 2026)

const startYear = endYear - years;
const startMonth = endMonth + 1 > 11 ? 0 : endMonth + 1; // Start from next month 10 years ago to get exactly N years

console.log(`Starting batch download for ${symbols.length} symbol(s) covering ${years} years...`);
console.log(`Date range: ${startYear}-${String(startMonth + 1).padStart(2, '0')} to ${endYear}-${String(endMonth + 1).padStart(2, '0')}`);

for (const symbol of symbols) {
  console.log(`\n=========================================`);
  console.log(`PROCESSING SYMBOL: ${symbol.toUpperCase()}`);
  console.log(`=========================================`);

  const outputDir = path.join(__dirname, `../public/data/candles/${symbol}`);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate list of months for this run
  const months = [];
  let currentYear = startYear;
  let currentMonth = startMonth;

  while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
    months.push({ year: currentYear, month: currentMonth });
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
  }

  const dukascopyInst = INSTRUMENT_MAP[symbol];

  for (let i = 0; i < months.length; i++) {
    const { year, month } = months[i];
    const monthStr = String(month + 1).padStart(2, '0');
    const fileName = `${symbol}_${year}_${monthStr}.csv`;
    const filePath = path.join(outputDir, fileName);

    console.log(`[${symbol.toUpperCase()}] [${i + 1}/${months.length}] Processing ${year}-${monthStr}...`);

    if (fs.existsSync(filePath) && !forceOverwrite) {
      console.log(`  CSV file already exists, skipping.`);
      continue;
    }

    const fromDate = new Date(Date.UTC(year, month, 1));
    const toDate = new Date(Date.UTC(year, month + 1, 1));

    try {
      const raw = await getHistoricRates({
        instrument: dukascopyInst,
        dates: { from: fromDate, to: toDate },
        timeframe: Timeframe.m1,
        format: 'json',
        useCache: true,
        cacheFolderPath: cacheDir,
      });

      if (!raw || raw.length === 0) {
        console.warn(`  No data retrieved for ${symbol.toUpperCase()} in ${year}-${monthStr}`);
        continue;
      }

      // Format to CSV: time,open,high,low,close,volume
      // Use instrument-specific precision: forex pairs need 5dp so that
      // intra-minute moves (2-5 pips = 0.0002-0.0005) are not destroyed by rounding.
      const dp = PRICE_PRECISION[symbol] ?? 5;
      const sorted = raw.sort((a, b) => a.timestamp - b.timestamp);
      const csvLines = ['time,open,high,low,close,volume'];

      for (const c of sorted) {
        const timeSec = Math.floor(c.timestamp / 1000);
        const open = Number(c.open).toFixed(dp);
        const high = Number(c.high).toFixed(dp);
        const low = Number(c.low).toFixed(dp);
        const close = Number(c.close).toFixed(dp);
        const volume = Number(c.volume).toFixed(2);
        csvLines.push(`${timeSec},${open},${high},${low},${close},${volume}`);
      }

      fs.writeFileSync(filePath, csvLines.join('\n'));
      console.log(`  Saved ${sorted.length} candles to ${fileName}`);
    } catch (err) {
      console.error(`  Error downloading ${symbol.toUpperCase()} for ${year}-${monthStr}:`, err.message || err);
    }
  }
}

console.log('\n=========================================');
console.log('All downloads completed successfully!');
console.log('=========================================');
