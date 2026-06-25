#!/usr/bin/env bash
# =============================================================================
# Stratix WS Server — Koyeb First-Time Deploy
#
# Pre-requisites (run once):
#   npm install -g koyeb-cli
#   koyeb login
#
# Usage:
#   cd server
#   bash deploy.sh <FINNHUB_KEY> <VERCEL_URL>
#
# Example:
#   bash deploy.sh "cpXXXXXXXXXX" "https://stratix-app.vercel.app"
# =============================================================================
set -e

FINNHUB_KEY="${1:-}"
VERCEL_URL="${2:-https://your-app.vercel.app}"
APP="stratix-ws"
SERVICE="ws-server"
REGION="sin"   # Singapore — closest free region to India

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Stratix WS Server → Koyeb (Singapore)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check koyeb CLI
if ! command -v koyeb &> /dev/null; then
  echo "❌ koyeb CLI not found. Install:"
  echo "   npm install -g koyeb-cli"
  echo "   koyeb login"
  exit 1
fi

# Create app (safe to run even if it exists)
echo "→ Creating app: $APP"
koyeb app create "$APP" 2>/dev/null || echo "   (app already exists)"

# Deploy service from GitHub repo
echo "→ Deploying service from GitHub..."
koyeb service create "$SERVICE" \
  --app "$APP" \
  --git "github.com/raghavjaiswal709/Stratix" \
  --git-branch "master" \
  --git-workdir "server" \
  --dockerfile "Dockerfile" \
  --port "8080:http" \
  --region "$REGION" \
  --instance-type "nano" \
  --env "PORT=8080" \
  --env "NODE_ENV=production" \
  --env "FINNHUB_API_KEY=${FINNHUB_KEY}" \
  --env "GOLD_API_BASE=https://api.gold-api.com/price" \
  --env "ALLOWED_ORIGINS=${VERCEL_URL},http://localhost:3000" \
  2>/dev/null || \
koyeb service update "$SERVICE" \
  --app "$APP" \
  --env "FINNHUB_API_KEY=${FINNHUB_KEY}" \
  --env "ALLOWED_ORIGINS=${VERCEL_URL},http://localhost:3000"

# Get public URL
echo ""
sleep 5
DOMAIN=$(koyeb service get "$SERVICE" --app "$APP" -o json 2>/dev/null \
  | grep -o '"public_domain":"[^"]*"' | cut -d'"' -f4 || echo "")

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Deployed!"
if [ -n "$DOMAIN" ]; then
  echo "  WSS URL: wss://${DOMAIN}"
  echo ""
  echo "  Add to Vercel environment variables:"
  echo "  NEXT_PUBLIC_WS_URL=wss://${DOMAIN}"
  # Auto-update local .env.local
  if [ -f "../.env.local" ]; then
    grep -v "^NEXT_PUBLIC_WS_URL=" "../.env.local" > "/tmp/.env.local.tmp"
    echo "NEXT_PUBLIC_WS_URL=wss://${DOMAIN}" >> "/tmp/.env.local.tmp"
    mv "/tmp/.env.local.tmp" "../.env.local"
    echo "  ✓ .env.local updated"
  fi
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
