const { getHistoricRates } = require('dukascopy-node');

async function test() {
  const to = new Date("2026-06-24T23:59:59.000Z");
  const from = new Date(to.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days before yesterday
  
  console.log(`Fetching 3 days of EURUSD ending yesterday... From: ${from.toISOString()} To: ${to.toISOString()}`);
  
  const startTime = Date.now();
  try {
    const rates = await getHistoricRates({
      instrument: 'eurusd',
      dates: { from, to },
      timeframe: 'm1',
      format: 'json',
      useCache: false
    });
    console.log(`SUCCESS: ${rates.length} candles in ${Date.now() - startTime}ms`);
    if (rates.length > 0) {
      console.log("First:", new Date(rates[0].timestamp).toISOString());
      console.log("Last:", new Date(rates[rates.length - 1].timestamp).toISOString());
    }
  } catch (err) {
    console.error("FAILED:", err.stack || err.message);
  }
}

test();
