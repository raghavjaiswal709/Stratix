#!/bin/bash
# =============================================================================
# Stratix WS Server — GCP Always Free Deploy Script
# Run this in GCP Cloud Shell (browser terminal — no local install needed)
#
# Usage:
#   bash deploy.sh \
#     <FINNHUB_KEY> \
#     <VERCEL_URL> \
#     <DUCKDNS_SUBDOMAIN> \
#     <DUCKDNS_TOKEN>
#
# Example:
#   bash deploy.sh \
#     "cpXXXXXXXXXXXXXX" \
#     "https://stratix-app.vercel.app" \
#     "stratix-raghav" \
#     "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
# =============================================================================

set -e

# ── Args ─────────────────────────────────────────────────────────────────────
FINNHUB_KEY="${1:-}"
VERCEL_URL="${2:-https://your-app.vercel.app}"
DUCKDNS_SUB="${3:-}"
DUCKDNS_TOK="${4:-}"

INSTANCE_NAME="stratix-ws-server"
ZONE="us-central1-a"          # Always Free zone (us-east1/us-west1/us-central1)
MACHINE_TYPE="e2-micro"       # The ONLY Always Free machine type
DISK_TYPE="pd-standard"       # Standard disk (not SSD) = free
DISK_SIZE="30GB"              # Max free tier disk
IMAGE_FAMILY="ubuntu-2204-lts"
IMAGE_PROJECT="ubuntu-os-cloud"
NETWORK_TAG="stratix-ws"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Stratix WS Server → GCP Always Free"
echo "  Machine : $MACHINE_TYPE in $ZONE"
echo "  Domain  : ${DUCKDNS_SUB}.duckdns.org"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1. Enable Compute Engine API ─────────────────────────────────────────────
echo "→ Enabling Compute Engine API..."
gcloud services enable compute.googleapis.com --quiet
echo "  ✓ Compute Engine enabled"

# ── 2. Create firewall rule ────────────────────────────────────────────────────
echo "→ Creating firewall rule (ports 80, 443, 8080)..."
gcloud compute firewall-rules create "allow-${NETWORK_TAG}" \
  --allow="tcp:80,tcp:443,tcp:8080" \
  --source-ranges="0.0.0.0/0" \
  --target-tags="$NETWORK_TAG" \
  --description="Stratix WS server — HTTP, HTTPS, WS" \
  --quiet 2>/dev/null || echo "  (firewall rule already exists)"
echo "  ✓ Firewall ready"

# ── 3. Create VM with startup script ─────────────────────────────────────────
echo "→ Creating e2-micro VM in $ZONE..."

# Get the startup script from this repo
STARTUP_URL="https://raw.githubusercontent.com/raghavjaiswal709/Stratix/master/gcp/startup.sh"
STARTUP_FILE="$(dirname "$0")/startup.sh"

# Use local file if available (Cloud Shell has the cloned repo),
# otherwise download from GitHub
if [ -f "$STARTUP_FILE" ]; then
  STARTUP_SRC="$STARTUP_FILE"
else
  STARTUP_SRC="/tmp/stratix-startup.sh"
  curl -sf "$STARTUP_URL" -o "$STARTUP_SRC"
fi

gcloud compute instances create "$INSTANCE_NAME" \
  --zone="$ZONE" \
  --machine-type="$MACHINE_TYPE" \
  --image-family="$IMAGE_FAMILY" \
  --image-project="$IMAGE_PROJECT" \
  --boot-disk-size="$DISK_SIZE" \
  --boot-disk-type="$DISK_TYPE" \
  --tags="$NETWORK_TAG" \
  --metadata="finnhub-key=${FINNHUB_KEY},vercel-url=${VERCEL_URL},duckdns-sub=${DUCKDNS_SUB},duckdns-tok=${DUCKDNS_TOK}" \
  --metadata-from-file=startup-script="$STARTUP_SRC" \
  --quiet

PUBLIC_IP=$(gcloud compute instances describe "$INSTANCE_NAME" \
  --zone="$ZONE" \
  --format="value(networkInterfaces[0].accessConfigs[0].natIP)")

echo "  ✓ VM created: $PUBLIC_IP"

# ── 4. Reserve a static IP (so it doesn't change on restart) ─────────────────
echo "→ Promoting to static IP..."
gcloud compute addresses create stratix-ws-ip \
  --addresses="$PUBLIC_IP" \
  --region="us-central1" \
  --quiet 2>/dev/null || echo "  (static IP may already exist)"
echo "  ✓ Static IP reserved: $PUBLIC_IP"

# ── 5. Done ───────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅  VM is booting and installing server..."
echo ""
echo "  Public IP   : $PUBLIC_IP"
echo "  Health URL  : http://$PUBLIC_IP:8080/health"
if [ -n "$DUCKDNS_SUB" ]; then
  echo "  WSS URL     : wss://${DUCKDNS_SUB}.duckdns.org"
fi
echo ""
echo "  Wait ~3 minutes for startup to complete, then:"
echo "  curl http://$PUBLIC_IP:8080/health"
echo ""
echo "  Watch startup logs (SSH):"
echo "  gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --command='tail -f /var/log/stratix-startup.log'"
echo ""
echo "  Set NEXT_PUBLIC_WS_URL in Vercel:"
if [ -n "$DUCKDNS_SUB" ]; then
  echo "  wss://${DUCKDNS_SUB}.duckdns.org"
else
  echo "  ws://$PUBLIC_IP:8080  (add DuckDNS for wss://)"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
