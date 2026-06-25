# Stratix WebSocket Server

Real-time price fan-out server. Deployed on **Koyeb** (Singapore, free forever, no card).

## Data sources

| Source | Symbols | Key |
|---|---|---|
| Binance WS `@bookTicker` | XAUUSD (via XAUT/PAXG), BTCUSD, ETHUSD | none |
| Finnhub WS (OANDA) | EURUSD, GBPUSD, USDJPY, USDCHF, USDCAD, AUDUSD | free key |
| open.er-api.com REST | All 6 forex pairs (10s fallback) | none |
| gold-api.com REST | XAGUSD silver (200ms poll) | none |

## Local dev

```bash
cp .env.example .env   # fill in FINNHUB_API_KEY
npm install
npm start              # ws://localhost:8080
```

Health check: `curl http://localhost:8080/health`

## Deploy to Koyeb (free, no card)

### Option A — Web Console (easiest)
See the step-by-step guide below.

### Option B — CLI (one command)
```bash
npm install -g koyeb-cli
koyeb login
bash deploy.sh "YOUR_FINNHUB_KEY" "https://your-app.vercel.app"
```

### Option C — GitHub Actions (auto-deploy on push)
Add these secrets to your GitHub repo settings:
- `KOYEB_TOKEN` — from Koyeb dashboard → API
- `FINNHUB_API_KEY` — your Finnhub key
- `VERCEL_URL` — your Vercel deployment URL

Every push to `master` that touches `server/` auto-deploys.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | Yes | Set to `8080` |
| `FINNHUB_API_KEY` | For forex | Free key from finnhub.io |
| `ALLOWED_ORIGINS` | Yes | Comma-separated list of allowed browser origins |
| `GOLD_API_BASE` | No | Default: `https://api.gold-api.com/price` |

## PM2 commands (if self-hosted)

```bash
pm2 status
pm2 logs stratix-ws
pm2 restart stratix-ws
```
