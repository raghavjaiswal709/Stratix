# Stratix WebSocket Server

A standalone Node.js WebSocket server that aggregates **free** real-time price
feeds and fans them out to the Stratix dashboard. Runs on the Oracle Cloud ARM
VM, completely separate from the Next.js app.

## Data sources (all free, ₹0/month)

| Source         | Symbols                                   | Auth          |
| -------------- | ----------------------------------------- | ------------- |
| Binance WS     | BTCUSD, ETHUSD                            | none          |
| Finnhub WS     | EURUSD, GBPUSD, USDJPY, USDCHF, USDCAD, AUDUSD | free API key |
| gold-api.com   | XAUUSD, XAGUSD (polled every 1s)         | none          |

Every tick is normalized to:

```json
{ "symbol": "XAUUSD", "price": 2345.67, "bid": 2345.5, "ask": 2345.84, "timestamp": 1718000000000, "source": "gold-api" }
```

## Local run

```bash
cd server
npm install
cp .env.example .env        # then fill in FINNHUB_API_KEY
npm start                   # listens on ws://localhost:8080
```

Quick smoke test (in another terminal):

```bash
node -e "const W=require('ws');const w=new W('ws://localhost:8080');w.on('message',m=>console.log(m.toString()));"
```

## Oracle VM Setup

1. SSH into your Oracle ARM VM
2. Install Node.js 20+:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs
   ```
3. Install PM2: `npm install -g pm2`
4. Clone repo or copy the `server/` folder to the VM
5. `cd server && npm install`
6. Copy `.env.example` to `.env` and fill in `FINNHUB_API_KEY`
   (and set `ALLOWED_ORIGINS` to your Vercel domain)
7. Start the server: `pm2 start ecosystem.config.js`
8. Save the PM2 process list: `pm2 save`
9. Set up PM2 startup: `pm2 startup` (follow the printed command)
10. Allow port 8080:
    ```bash
    sudo iptables -A INPUT -p tcp --dport 8080 -j ACCEPT
    ```
    Also open port 8080 in the Oracle Cloud **Security List / Network Security
    Group** (Ingress rule, source `0.0.0.0/0`, TCP 8080).

## Verify it's running

```bash
pm2 status
pm2 logs stratix-ws-server
```

## Notes

- Requires **Node 20+** (uses the global `fetch`).
- All three upstream connections auto-reconnect after 5s on failure; a single
  source going down never crashes the server.
- The server replays the last known price for every symbol to each newly
  connected client, so charts never start blank.
- For a production TLS endpoint (`wss://`), terminate TLS with a reverse proxy
  (Caddy/Nginx) in front of port 8080, or use Cloudflare. Browsers on an HTTPS
  Vercel page **cannot** connect to a plain `ws://` server — you need `wss://`.
