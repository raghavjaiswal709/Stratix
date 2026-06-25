const { getHistoricRates } = require('dukascopy-node');

async function test() {
  const to = new Date();
  const from = new Date(to.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
  
  console.log(`Fetching 3 days of EURUSD... From: ${from.toISOString()} To: ${to.toISOString()}`);
  try {
    const rates = await getHistoricRates({
      instrument: 'eurusd',
      dates: { from, to },
      timeframe: 'm1',
      format: 'json',
      useCache: false,
      batchSize: 10,
      pauseBetweenBatchesMs: 100
    });
    console.log("SUCCESS:", rates.length, "candles");
    if (rates.length > 0) {
      console.log("First:", new Date(rates[0].timestamp).toISOString());
      console.log("Last:", new Date(rates[rates.length - 1].timestamp).toISOString());
    }
  } catch (err) {
    console.error("FAILED:", err.stack || err.message);
  }
}

test();
