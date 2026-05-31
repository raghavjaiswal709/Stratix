import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getHistoricRates, Timeframe, Instrument } from 'dukascopy-node';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Target folder: public/data/candles/xauusd
const outputDir = path.join(__dirname, '../public/data/candles/xauusd');
const cacheDir = path.join(__dirname, '../.dukascopy-cache');

// Ensure output and cache directories exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

// Generate the list of months to download: June 2024 to May 2026
const startYear = 2024;
const startMonth = 5; // 0-indexed, so 5 = June
const endYear = 2026;
const endMonth = 4; // 0-indexed, so 4 = May

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

console.log(`Starting download of ${months.length} months of XAUUSD 1m candle data...`);

for (let i = 0; i < months.length; i++) {
  const { year, month } = months[i];
  const monthStr = String(month + 1).padStart(2, '0');
  const fileName = `xauusd_${year}_${monthStr}.csv`;
  const filePath = path.join(outputDir, fileName);

  console.log(`[${i + 1}/${months.length}] Processing ${year}-${monthStr}...`);

  if (fs.existsSync(filePath)) {
    console.log(`  CSV file already exists, skipping.`);
    continue;
  }

  const fromDate = new Date(Date.UTC(year, month, 1));
  const toDate = new Date(Date.UTC(year, month + 1, 1)); // first day of next month

  try {
    const raw = await getHistoricRates({
      instrument: Instrument.xauusd,
      dates: { from: fromDate, to: toDate },
      timeframe: Timeframe.m1,
      format: 'json',
      useCache: true,
      cacheFolderPath: cacheDir,
    });

    if (!raw || raw.length === 0) {
      console.warn(`  No data retrieved for ${year}-${monthStr}`);
      continue;
    }

    // Format to CSV: time,open,high,low,close,volume
    // Sort by timestamp to be absolutely sure they are chronological
    const sorted = raw.sort((a, b) => a.timestamp - b.timestamp);
    const csvLines = ['time,open,high,low,close,volume'];

    for (const c of sorted) {
      const timeSec = Math.floor(c.timestamp / 1000);
      const open = Number(c.open).toFixed(3);
      const high = Number(c.high).toFixed(3);
      const low = Number(c.low).toFixed(3);
      const close = Number(c.close).toFixed(3);
      const volume = Number(c.volume).toFixed(2);
      csvLines.push(`${timeSec},${open},${high},${low},${close},${volume}`);
    }

    fs.writeFileSync(filePath, csvLines.join('\n'));
    console.log(`  Saved ${sorted.length} candles to ${fileName}`);
  } catch (err) {
    console.error(`  Error downloading data for ${year}-${monthStr}:`, err.message || err);
  }
}

console.log('All downloads completed!');
