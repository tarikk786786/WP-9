# WP-9 — $0 Permanent Self-Healing Production Deployment Guide

> **Architecture Overview**
> - **Vercel**: Next.js Serverless Control Plane & Web CRM Dashboard
> - **Oracle Cloud Infrastructure (OCI) Always Free VM**: Persistent Ubuntu 24.04/22.04 LTS Compute Instance running WhatsApp Baileys Worker under `systemd`
> - **Cloudflare Named Tunnel (`cloudflared`)**: Encrypted zero-trust ingress mapping `worker.<your-domain>` to `http://127.0.0.1:8788` without opening inbound firewall ports
> - **Supabase Cloud**: PostgreSQL database, `pgvector` semantic memory, durable chat history, and credential backups
> - **Local Storage (`/app/data/baileys-auth`)**: Primary zero-latency session persistence across process restarts and VM reboots

---

## 1. Create Oracle Cloud Always Free VM

1. Log into your [Oracle Cloud Console](https://cloud.oracle.com/).
2. Navigate to **Compute** &rarr; **Instances** &rarr; **Create Instance**.
3. **Shape Options (Always Free Eligible)**:
   - **Recommended**: **Ampere ARM64** (`VM.Standard.A1.Flex`). You can allocate up to 4 OCPUs and 24 GB RAM for free (even 1-2 OCPUs and 6-12 GB RAM is plenty for WP-9).
   - **Fallback**: **AMD Micro** (`VM.Standard.E2.1.Micro`, 1 OCPU, 1 GB RAM).
   > **Note on Capacity**: If Oracle reports `Out of host capacity` for the ARM shape in your home region, either try different Availability Domains (AD-1, AD-2, AD-3), slightly reduce RAM/OCPU, or use the AMD Micro shape.
4. **Operating System**: Choose **Ubuntu 24.04 LTS** or **Ubuntu 22.04 LTS Minimal**.
5. **Networking**: Assign a public IPv4 address.
6. **SSH Keys**: Download your private key (`.key` or `.pem`) and save it safely.
7. Click **Create** and wait for the instance state to show **Running**.

---

## 2. SSH into Your Oracle VM

Open your local terminal and connect:

```bash
chmod 400 ~/.ssh/oracle_key.pem
ssh -i ~/.ssh/oracle_key.pem ubuntu@<YOUR_ORACLE_VM_PUBLIC_IP>
```

---

## 3. Install Node.js 22 LTS, npm, & Prerequisites

Run on the VM:

```bash
# Update Ubuntu package index
sudo apt-get update -y && sudo apt-get upgrade -y

# Install essential build tools & git
sudo apt-get install -y curl git ca-certificates build-essential ufw

# Install Node.js 22 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify versions
node -v # Should show v22.x
npm -v
```

---

## 4. Clone Repository & Setup Directories

```bash
# Create application directories
sudo mkdir -p /opt/wp9
sudo mkdir -p /app/data/baileys-auth
sudo mkdir -p /etc/wp9
sudo mkdir -p /etc/cloudflared

# Give ownership to the ubuntu user
sudo chown -R ubuntu:ubuntu /opt/wp9 /app/data /etc/wp9

# Clone the repository
git clone https://github.com/tarikk786786/WP-9.git /opt/wp9

# Install dependencies and build workspaces
cd /opt/wp9
npm ci
npm run build --workspaces --if-present
```

---

## 5. Configure Persistent Environment

Create `/etc/wp9/worker.env` with restricted permissions:

```bash
sudo nano /etc/wp9/worker.env
```

Paste your configuration:

```ini
NODE_ENV=production
HOST=0.0.0.0
PORT=8788
WORKER_PORT=8788

# Persistent auth directory on disk
BAILEYS_AUTH_DIR=/app/data/baileys-auth

# Secure timing-safe shared secret (Match with Vercel!)
WORKER_API_SECRET=wp9_sec_9114411026_daziai_crm

# Public worker tunnel URL
PUBLIC_WORKER_URL=https://worker.yourdomain.com

# Supabase Credentials
SUPABASE_URL=https://etxntbpzuaupvlpehpnb.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...

# AI Provider Keys
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIzaSy...
OPENAI_API_KEY=sk-proj-...
```

Lock down permissions:

```bash
sudo chmod 600 /etc/wp9/worker.env
sudo chown ubuntu:ubuntu /etc/wp9/worker.env
```

---

## 6. Install & Configure Cloudflare Named Tunnel

Do **NOT** use `trycloudflare.com` in production (temporary quick tunnels expire and disconnect). Use a permanent Cloudflare Named Tunnel.

### Step 6.1: Install `cloudflared` on Ubuntu

```bash
ARCH=$(dpkg --print-architecture)
if [ "$ARCH" = "arm64" ]; then
  curl -L --output /tmp/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64
else
  curl -L --output /tmp/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
fi

sudo install -m 0755 /tmp/cloudflared /usr/local/bin/cloudflared
rm -f /tmp/cloudflared

# Check version
cloudflared --version
```

### Step 6.2: Create Tunnel via Cloudflare Dashboard (Recommended $0 Method)

1. Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/).
2. Navigate to **Networks** &rarr; **Tunnels** &rarr; **Create a Tunnel**.
3. Choose **Cloudflared**.
4. Name the tunnel: `wp9-worker`.
5. Under **Install and run a connector**, select **Debian 64-bit / ARM64**.
6. Copy the **Tunnel Token** provided in the install command (the long string following `--token`).
7. Save the token into `/etc/cloudflared/tunnel.env`:

```bash
sudo tee /etc/cloudflared/tunnel.env > /dev/null <<EOF
TUNNEL_TOKEN=YOUR_COPIED_CLOUDFLARE_TUNNEL_TOKEN
EOF

sudo chmod 600 /etc/cloudflared/tunnel.env
```

8. In the Cloudflare Tunnel configuration tab, add a **Public Hostname**:
   - **Subdomain**: `worker`
   - **Domain**: `yourdomain.com` (Select your domain in Cloudflare)
   - **Service Type**: `HTTP`
   - **URL**: `127.0.0.1:8788`
9. Save hostname. Cloudflare will automatically configure the DNS CNAME record.

---

## 7. Install Systemd Services

WP-9 ships with pre-configured systemd service templates in `deploy/systemd/`.

```bash
# Copy systemd units
sudo cp /opt/wp9/deploy/systemd/wp9-worker.service /etc/systemd/system/wp9-worker.service
sudo cp /opt/wp9/deploy/systemd/cloudflared.service /etc/systemd/system/cloudflared.service

# Create cloudflared dedicated system user
sudo useradd -r -s /bin/false cloudflared || true
sudo chown cloudflared:cloudflared /etc/cloudflared/tunnel.env

# Reload systemd
sudo systemctl daemon-reload

# Enable services to auto-start on VM reboot
sudo systemctl enable wp9-worker.service
sudo systemctl enable cloudflared.service

# Start services now
sudo systemctl start wp9-worker.service
sudo systemctl start cloudflared.service
```

---

## 8. Verify Worker & Tunnel Status

Check service health:

```bash
# Worker status
sudo systemctl status wp9-worker

# Cloudflared status
sudo systemctl status cloudflared

# Test local worker liveness
curl http://127.0.0.1:8788/health/live
# Expected: {"ok":true,"service":"wp9-worker","status":"alive",...}

# Test public Cloudflare Tunnel URL from your computer
curl https://worker.yourdomain.com/health/live
# Expected: {"ok":true,"service":"wp9-worker","status":"alive",...}
```

---

## 9. Connect Vercel Control Plane to Worker

1. Open your [Vercel Project Dashboard](https://vercel.com/dashboard) &rarr; **Settings** &rarr; **Environment Variables**.
2. Configure or verify the following variables for **Production**:
   - `WORKER_API_URL` = `https://worker.yourdomain.com`
   - `WORKER_API_SECRET` = `wp9_sec_9114411026_daziai_crm`
   - `SUPABASE_URL` = `https://etxntbpzuaupvlpehpnb.supabase.co`
   - `SUPABASE_ANON_KEY` = `...`
   - `ADMIN_SECRET` = `...`
3. Click **Redeploy** on Vercel to pick up the updated `WORKER_API_URL`.

---

## 10. Link WhatsApp via Web Dashboard

1. Open your live Vercel domain: `https://daziai-whatsapp-crm.vercel.app`.
2. Login using your admin password.
3. Observe **System Operational Health**:
   - Process: **Running**
   - HTTP API: **Healthy**
   - WhatsApp Web: **Scan QR**
4. Click **Show QR** or enter phone number to generate pairing code.
5. On your phone, open **WhatsApp** &rarr; **Linked Devices** &rarr; **Link a Device** &rarr; Scan QR.
6. The dashboard will automatically update to:
   - Status: **Fully Live**
   - WhatsApp: **Linked (+919114411026)**
   - Database: **Supabase Cloud Healthy**

---

## 11. Resilience & Self-Healing Verification Tests

### Test A: Node Process Crash Recovery
Run on the Oracle VM:
```bash
# Kill the running worker process
sudo pkill -9 -f "npm run worker"

# Observe systemd restarting it within 3 seconds
sudo systemctl status wp9-worker
```
- **Result**: `systemd` immediately respawns the worker. Credentials load from `/app/data/baileys-auth`. WhatsApp reconnects within seconds without prompting for a new QR code.

### Test B: Cloudflare Tunnel Crash Recovery
Run on the Oracle VM:
```bash
sudo pkill -9 cloudflared
sudo systemctl status cloudflared
```
- **Result**: `systemd` restarts `cloudflared` within 5 seconds; public HTTPS traffic resumes immediately.

### Test C: Complete VM Reboot Test
Run on the Oracle VM:
```bash
sudo reboot
```
- Wait 60 seconds.
- Curl `https://worker.yourdomain.com/health/ready`.
- **Result**: HTTP 200 OK. Both `wp9-worker` and `cloudflared` booted automatically upon system startup. Your personal PC can remain completely powered off.

---

## 12. Troubleshooting Runbook

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| `WORKER_UNREACHABLE` on Vercel | Cloudflare Tunnel is down or `WORKER_API_URL` incorrect | Check `sudo systemctl status cloudflared` on VM; verify `WORKER_API_URL` in Vercel settings. |
| `WORKER_AUTH_FAILED` | Secret mismatch between Vercel and Worker | Ensure `WORKER_API_SECRET` in `/etc/wp9/worker.env` matches `WORKER_API_SECRET` in Vercel environment variables. |
| QR Code repeats on restart | Permissions issue on `/app/data/baileys-auth` | Run `sudo chown -R ubuntu:ubuntu /app/data` and verify `creds.json` exists in `/app/data/baileys-auth/`. |
| Oracle VM Out of Host Capacity | High demand in data center region | Switch to AMD Micro (`VM.Standard.E2.1.Micro`), test a different Availability Domain, or reduce ARM memory allocation. |
| WhatsApp says "Logged out" | Unlinked from phone settings | Re-scan QR code from dashboard; session keys will re-persist automatically. |
