const { getHistoricRates } = require('dukascopy-node');

async function check() {
  const fromDate = new Date("2026-06-25T06:00:00.000Z");
  const toDate = new Date("2026-06-25T06:59:00.000Z");
  
  console.log("Fetching only Hour 6 UTC...");
  try {
    const rates = await getHistoricRates({
      instrument: 'eurusd',
      dates: { from: fromDate, to: toDate },
      timeframe: 'm1',
      format: 'json',
      useCache: false
    });
    console.log("SUCCESS:", rates.length, "rows");
  } catch (err) {
    console.error("FAILED:", err.message);
  }
}

check();
