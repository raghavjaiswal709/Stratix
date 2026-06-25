const { getHistoricRates } = require('dukascopy-node');

async function testRange(fromStr, toStr) {
  const fromDate = new Date(fromStr);
  const toDate = new Date(toStr);
  
  try {
    console.log(`Fetching from ${fromStr} to ${toStr}...`);
    const rates = await getHistoricRates({
      instrument: 'eurusd',
      dates: { from: fromDate, to: toDate },
      timeframe: 'm1',
      format: 'json',
      useCache: false
    });
    console.log(`SUCCESS: returned ${rates.length} rows`);
    if (rates.length > 0) {
      console.log(`First: ${new Date(rates[0].timestamp).toISOString()}`);
      console.log(`Last: ${new Date(rates[rates.length - 1].timestamp).toISOString()}`);
    }
  } catch (err) {
    console.error(`FAILED: ${err.message}`);
  }
}

async function run() {
  const now = new Date();
  console.log("Current time:", now.toISOString());
  
  // 1. Try to fetch the current hour up to 10 minutes ago
  const tenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000);
  const startOfHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getUTCHours(), 0, 0, 0);
  
  console.log("\n--- Test 1: Start of current hour to 10 mins ago ---");
  await testRange(startOfHour.toISOString(), tenMinsAgo.toISOString());

  // 2. Try to fetch the current hour up to now
  console.log("\n--- Test 2: Start of current hour to now ---");
  await testRange(startOfHour.toISOString(), now.toISOString());
}

run();
