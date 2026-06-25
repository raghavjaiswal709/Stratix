#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Stratix WS Server — First-time Fly.io Deploy Script
#
# Run this ONCE from the server/ directory after:
#   1. Signing up at fly.io (free, click "Sign in with GitHub")
#   2. Running:  curl -L https://fly.io/install.sh | sh
#               flyctl auth login
#
# Usage:
#   cd server
#   bash deploy.sh <YOUR_VERCEL_URL>
#
# Example:
#   bash deploy.sh https://stratix-app.vercel.app
# ─────────────────────────────────────────────────────────────────────────────

set -e

VERCEL_URL="${1:-https://your-app.vercel.app}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Stratix WS Server → Fly.io Deploy"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1. Check flyctl is installed ──────────────────────────────────────────────
if ! command -v flyctl &> /dev/null; then
  echo "❌  flyctl not found. Install it:"
  echo "    curl -L https://fly.io/install.sh | sh"
  echo "    then: flyctl auth login"
  exit 1
fi

echo "✓  flyctl found: $(flyctl version | head -1)"

# ── 2. Check logged in ────────────────────────────────────────────────────────
if ! flyctl auth whoami &> /dev/null; then
  echo "❌  Not logged in. Run: flyctl auth login"
  exit 1
fi

echo "✓  Logged in as: $(flyctl auth whoami)"

# ── 3. Create the Fly app (first time only) ───────────────────────────────────
APP_NAME="stratix-ws-server"
echo ""
echo "→  Creating Fly.io app: $APP_NAME  (region: bom = Mumbai)"

# Launch without deploying (--no-deploy), use existing fly.toml
flyctl launch \
  --name "$APP_NAME" \
  --region bom \
  --no-deploy \
  --copy-config \
  --yes 2>/dev/null || echo "   (app may already exist — continuing)"

# ── 4. Read secrets from .env ─────────────────────────────────────────────────
echo ""
echo "→  Reading FINNHUB_API_KEY from .env..."

FINNHUB_KEY=""
if [ -f ".env" ]; then
  FINNHUB_KEY=$(grep "^FINNHUB_API_KEY=" .env | cut -d= -f2)
fi

if [ -z "$FINNHUB_KEY" ] || [ "$FINNHUB_KEY" = "your_finnhub_free_api_key_here" ]; then
  echo ""
  echo "⚠   FINNHUB_API_KEY not set in .env"
  read -rp "    Enter your Finnhub API key (or press Enter to skip): " FINNHUB_KEY
fi

# ── 5. Set all secrets on Fly ─────────────────────────────────────────────────
echo ""
echo "→  Setting secrets on Fly.io..."

SECRETS_CMD="flyctl secrets set"
SECRETS_CMD="$SECRETS_CMD PORT=8080"
SECRETS_CMD="$SECRETS_CMD NODE_ENV=production"
SECRETS_CMD="$SECRETS_CMD ALLOWED_ORIGINS=${VERCEL_URL},http://localhost:3000"
SECRETS_CMD="$SECRETS_CMD GOLD_API_BASE=https://api.gold-api.com/price"

if [ -n "$FINNHUB_KEY" ] && [ "$FINNHUB_KEY" != "your_finnhub_free_api_key_here" ]; then
  SECRETS_CMD="$SECRETS_CMD FINNHUB_API_KEY=${FINNHUB_KEY}"
  echo "   ✓ FINNHUB_API_KEY set"
else
  echo "   ⚠  FINNHUB_API_KEY skipped (forex will use er-api fallback)"
fi

eval "$SECRETS_CMD" --app "$APP_NAME"

# ── 6. Deploy ─────────────────────────────────────────────────────────────────
echo ""
echo "→  Deploying to Fly.io Mumbai..."
flyctl deploy --remote-only --ha=false --app "$APP_NAME"

# ── 7. Get the URL ────────────────────────────────────────────────────────────
echo ""
FLY_URL="wss://${APP_NAME}.fly.dev"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅  DEPLOYED SUCCESSFULLY"
echo ""
echo "  WebSocket URL:  $FLY_URL"
echo ""
echo "  Next step — set this in Vercel:"
echo "    NEXT_PUBLIC_WS_URL = $FLY_URL"
echo ""
echo "  Or set it locally in .env.local:"
echo "    echo 'NEXT_PUBLIC_WS_URL=$FLY_URL' >> ../.env.local"
echo ""
echo "  Verify it's working:"
echo "    curl https://${APP_NAME}.fly.dev/health"
echo ""
echo "  Watch live logs:"
echo "    flyctl logs --app $APP_NAME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 8. Auto-update .env.local in the Next.js project ─────────────────────────
ENVLOCAL="../.env.local"
if [ -f "$ENVLOCAL" ]; then
  # Remove old WS_URL line and add new one
  grep -v "^NEXT_PUBLIC_WS_URL=" "$ENVLOCAL" > "${ENVLOCAL}.tmp" && mv "${ENVLOCAL}.tmp" "$ENVLOCAL"
  echo "NEXT_PUBLIC_WS_URL=$FLY_URL" >> "$ENVLOCAL"
  echo "  ✓  .env.local updated automatically"
fi

echo ""
echo "  For GitHub Actions auto-deploy, add this secret to your repo:"
echo "  https://github.com/raghavjaiswal709/Stratix/settings/secrets/actions"
echo "  Secret name:  FLY_API_TOKEN"
echo "  Secret value: $(flyctl auth token 2>/dev/null || echo '<run: flyctl auth token>')"
echo ""
