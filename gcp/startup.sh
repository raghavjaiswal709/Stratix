#!/bin/bash
# =============================================================================
# Stratix WS Server — GCP e2-micro VM Startup Script
# Runs automatically on first boot when the VM is created.
# Do NOT run this manually — it is passed to the VM via --metadata.
# =============================================================================

set -e
LOG="/var/log/stratix-startup.log"
exec > >(tee -a "$LOG") 2>&1
echo "========================================="
echo " Stratix startup: $(date)"
echo "========================================="

# ── 1. Read config passed via instance metadata ───────────────────────────────
META="http://metadata.google.internal/computeMetadata/v1/instance/attributes"
H='Metadata-Flavor: Google'
FINNHUB_KEY=$(curl -sf "$META/finnhub-key"   -H "$H" || echo "")
VERCEL_URL=$(curl -sf  "$META/vercel-url"    -H "$H" || echo "https://your-app.vercel.app")
DUCKDNS_SUB=$(curl -sf "$META/duckdns-sub"  -H "$H" || echo "")
DUCKDNS_TOK=$(curl -sf "$META/duckdns-tok"  -H "$H" || echo "")

echo "vercel_url : $VERCEL_URL"
echo "duckdns    : ${DUCKDNS_SUB}.duckdns.org"

# ── 2. System packages ────────────────────────────────────────────────────────
apt-get update -qq
apt-get install -y -qq git curl ca-certificates gnupg lsb-release netfilter-persistent iptables-persistent

# ── 3. Node.js 20 ─────────────────────────────────────────────────────────────
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null
apt-get install -y nodejs
echo "Node: $(node --version)  npm: $(npm --version)"

# ── 4. PM2 ────────────────────────────────────────────────────────────────────
npm install -g pm2 > /dev/null

# ── 5. Clone / update repo ────────────────────────────────────────────────────
if [ -d /opt/stratix/.git ]; then
  git -C /opt/stratix pull --ff-only
else
  git clone https://github.com/raghavjaiswal709/Stratix.git /opt/stratix
fi

# ── 6. Install server dependencies ───────────────────────────────────────────
cd /opt/stratix/server
npm ci --only=production > /dev/null
echo "npm install done"

# ── 7. Write .env ────────────────────────────────────────────────────────────
cat > /opt/stratix/server/.env << ENV
FINNHUB_API_KEY=${FINNHUB_KEY}
PORT=8080
ALLOWED_ORIGINS=${VERCEL_URL},http://localhost:3000
GOLD_API_BASE=https://api.gold-api.com/price
NODE_ENV=production
ENV

# ── 8. Caddy (WSS / SSL) ─────────────────────────────────────────────────────
apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
apt-get update -qq && apt-get install -y -qq caddy
echo "Caddy: $(caddy version)"

# ── 9. DuckDNS: point subdomain to this VM's public IP ───────────────────────
PUBLIC_IP=$(curl -sf https://api.ipify.org)
echo "Public IP: $PUBLIC_IP"

if [ -n "$DUCKDNS_SUB" ] && [ -n "$DUCKDNS_TOK" ]; then
  # Update now
  curl -sf "https://www.duckdns.org/update?domains=${DUCKDNS_SUB}&token=${DUCKDNS_TOK}&ip=${PUBLIC_IP}" \
    -o /var/log/duckdns-update.log
  echo "DuckDNS updated → ${DUCKDNS_SUB}.duckdns.org = $PUBLIC_IP"

  # Cron: keep DuckDNS fresh every 5 minutes (GCP ephemeral IPs rarely change)
  cat > /etc/cron.d/duckdns << CRON
*/5 * * * * root curl -sf "https://www.duckdns.org/update?domains=${DUCKDNS_SUB}&token=${DUCKDNS_TOK}&ip=\$(curl -sf https://api.ipify.org)" >> /var/log/duckdns-update.log
CRON

  # Caddy config: reverse-proxy to the Node.js WS server
  # Caddy auto-fetches a free Let's Encrypt certificate for the domain.
  cat > /etc/caddy/Caddyfile << CADDY
${DUCKDNS_SUB}.duckdns.org {
    reverse_proxy localhost:8080
}
CADDY
  systemctl reload caddy || systemctl restart caddy
  echo "Caddy configured for wss://${DUCKDNS_SUB}.duckdns.org"
fi

# ── 10. Open OS-level firewall ports ─────────────────────────────────────────
# (GCP also has a network-level firewall rule created by deploy.sh)
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80  -j ACCEPT
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 8080 -j ACCEPT
netfilter-persistent save

# ── 11. Start server with PM2 ────────────────────────────────────────────────
pm2 start /opt/stratix/server/index.js --name stratix-ws
pm2 save

# Make PM2 restart on reboot
env PATH="$PATH:/usr/bin" pm2 startup systemd -u root --hp /root | tail -1 | bash

echo "========================================="
echo " ✓ Startup complete: $(date)"
echo " Server: http://${PUBLIC_IP}:8080/health"
if [ -n "$DUCKDNS_SUB" ]; then
  echo " WSS URL: wss://${DUCKDNS_SUB}.duckdns.org"
fi
echo "========================================="
