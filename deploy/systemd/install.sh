#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# WP-9 Production Host Setup Script (Oracle Cloud Always Free VM - Ubuntu)
# ==============================================================================

echo ">>> [1/7] Updating system packages & installing prerequisites..."
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg lsb-release git build-essential

echo ">>> [2/7] Installing Node.js 22 LTS..."
if ! command -v node &>/dev/null || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "Node version: $(node -v)"
echo "npm version:  $(npm -v)"

echo ">>> [3/7] Setting up persistent storage and directories..."
sudo mkdir -p /app/data/baileys-auth
sudo mkdir -p /opt/wp9
sudo mkdir -p /etc/wp9
sudo mkdir -p /etc/cloudflared

# Ensure ubuntu user has permissions
sudo chown -R ubuntu:ubuntu /app/data
sudo chown -R ubuntu:ubuntu /opt/wp9

echo ">>> [4/7] Installing Cloudflare Tunnel (cloudflared)..."
ARCH=$(dpkg --print-architecture)
if [[ "$ARCH" == "arm64" ]]; then
  CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
else
  CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
fi

if ! command -v cloudflared &>/dev/null; then
  curl -L --output /tmp/cloudflared "${CLOUDFLARED_URL}"
  sudo install -m 0755 /tmp/cloudflared /usr/local/bin/cloudflared
  rm -f /tmp/cloudflared
fi
echo "cloudflared version: $(cloudflared --version)"

# Create cloudflared dedicated user if not present
if ! id -u cloudflared &>/dev/null; then
  sudo useradd -r -s /bin/false cloudflared
fi

echo ">>> [5/7] Installing systemd service units..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sudo cp "${SCRIPT_DIR}/wp9-worker.service" /etc/systemd/system/wp9-worker.service
sudo cp "${SCRIPT_DIR}/cloudflared.service" /etc/systemd/system/cloudflared.service

sudo systemctl daemon-reload

echo ">>> [6/7] Creating environment templates if not present..."
if [ ! -f /etc/wp9/worker.env ]; then
  sudo tee /etc/wp9/worker.env > /dev/null <<'EOF'
NODE_ENV=production
HOST=0.0.0.0
WORKER_PORT=8788
PORT=8788
BAILEYS_AUTH_DIR=/app/data/baileys-auth
WORKER_API_SECRET=wp9_sec_9114411026_daziai_crm
PUBLIC_WORKER_URL=https://worker.yourdomain.com
SUPABASE_URL=https://etxntbpzuaupvlpehpnb.supabase.co
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GROQ_API_KEY=
GEMINI_API_KEY=
OPENAI_API_KEY=
EOF
  sudo chmod 600 /etc/wp9/worker.env
  sudo chown ubuntu:ubuntu /etc/wp9/worker.env
  echo "Created /etc/wp9/worker.env (Please update with your production secrets)."
fi

if [ ! -f /etc/cloudflared/tunnel.env ]; then
  sudo tee /etc/cloudflared/tunnel.env > /dev/null <<'EOF'
# Insert your Cloudflare Named Tunnel token below:
TUNNEL_TOKEN=YOUR_CLOUDFLARE_TUNNEL_TOKEN_HERE
EOF
  sudo chmod 600 /etc/cloudflared/tunnel.env
  sudo chown cloudflared:cloudflared /etc/cloudflared/tunnel.env
  echo "Created /etc/cloudflared/tunnel.env (Please update with your Cloudflare token)."
fi

echo ">>> [7/7] Enabling services to start on VM boot..."
sudo systemctl enable wp9-worker.service
sudo systemctl enable cloudflared.service

echo ""
echo "=========================================================================="
echo "WP-9 Installation Complete!"
echo "Next Steps:"
echo "1. Put repository code in /opt/wp9 and run: npm ci"
echo "2. Edit secrets: sudo nano /etc/wp9/worker.env"
echo "3. Edit Cloudflare token: sudo nano /etc/cloudflared/tunnel.env"
echo "4. Start services: sudo systemctl start wp9-worker cloudflared"
echo "5. Check status: sudo systemctl status wp9-worker"
echo "6. View logs: journalctl -u wp9-worker -f"
echo "=========================================================================="
