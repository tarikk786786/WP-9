#!/usr/bin/env bash
# Install operator CLIs from GitHub releases into tools/bin.
# Idempotent. Requires curl + tar.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/tools/bin"
mkdir -p "$BIN"

os="$(uname -s)"
arch="$(uname -m)"

github_tag() {
  local repo="$1"
  curl -fsSI "https://github.com/${repo}/releases/latest" \
    | tr -d '\r' \
    | awk 'BEGIN{IGNORECASE=1} /^location:/{print $2}' \
    | sed 's|.*/tag/||' \
    | tail -1
}

download() {
  local url="$1"
  local dest="$2"
  echo "→ $url"
  curl -fsSL --retry 3 --retry-delay 2 -o "$dest" "$url"
}

install_cloudflared() {
  local asset=""
  case "${os}-${arch}" in
    Linux-x86_64|Linux-amd64) asset="cloudflared-linux-amd64" ;;
    Linux-aarch64|Linux-arm64) asset="cloudflared-linux-arm64" ;;
    Darwin-x86_64) asset="cloudflared-darwin-amd64.tgz" ;;
    Darwin-arm64) asset="cloudflared-darwin-arm64.tgz" ;;
    *) echo "skip cloudflared: unsupported ${os}-${arch}"; return 0 ;;
  esac
  local tmp
  tmp="$(mktemp -d)"
  download "https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}" "$tmp/$asset"
  if [[ "$asset" == *.tgz ]]; then
    tar -xzf "$tmp/$asset" -C "$tmp"
    mv "$tmp/cloudflared" "$BIN/cloudflared"
  else
    mv "$tmp/$asset" "$BIN/cloudflared"
  fi
  chmod +x "$BIN/cloudflared"
  rm -rf "$tmp"
  "$BIN/cloudflared" --version
}

install_flyctl() {
  local tag version asset tmp
  tag="$(github_tag superfly/flyctl)"
  version="${tag#v}"
  case "${os}-${arch}" in
    Linux-x86_64|Linux-amd64) asset="flyctl_${version}_Linux_x86_64.tar.gz" ;;
    Linux-aarch64|Linux-arm64) asset="flyctl_${version}_Linux_arm64.tar.gz" ;;
    Darwin-x86_64) asset="flyctl_${version}_macOS_x86_64.tar.gz" ;;
    Darwin-arm64) asset="flyctl_${version}_macOS_arm64.tar.gz" ;;
    *) echo "skip flyctl: unsupported ${os}-${arch}"; return 0 ;;
  esac
  tmp="$(mktemp -d)"
  download "https://github.com/superfly/flyctl/releases/download/${tag}/${asset}" "$tmp/fly.tgz"
  tar -xzf "$tmp/fly.tgz" -C "$tmp"
  mv "$tmp/flyctl" "$BIN/flyctl"
  chmod +x "$BIN/flyctl"
  rm -rf "$tmp"
  "$BIN/flyctl" version
}

install_railway() {
  local tag asset tmp
  tag="$(github_tag railwayapp/cli)"
  case "${os}-${arch}" in
    Linux-x86_64|Linux-amd64) asset="railway-${tag}-x86_64-unknown-linux-gnu.tar.gz" ;;
    Linux-aarch64|Linux-arm64) asset="railway-${tag}-aarch64-unknown-linux-musl.tar.gz" ;;
    Darwin-x86_64) asset="railway-${tag}-x86_64-apple-darwin.tar.gz" ;;
    Darwin-arm64) asset="railway-${tag}-aarch64-apple-darwin.tar.gz" ;;
    *) echo "skip railway: unsupported ${os}-${arch}"; return 0 ;;
  esac
  tmp="$(mktemp -d)"
  download "https://github.com/railwayapp/cli/releases/download/${tag}/${asset}" "$tmp/rw.tgz"
  tar -xzf "$tmp/rw.tgz" -C "$tmp"
  local found
  found="$(find "$tmp" -type f -name 'railway' | head -1)"
  mv "$found" "$BIN/railway"
  chmod +x "$BIN/railway"
  rm -rf "$tmp"
  "$BIN/railway" --version
}

echo "Installing GitHub release tools into $BIN"
install_cloudflared
install_flyctl
install_railway
echo "Done. Add to PATH: export PATH=\"$BIN:\$PATH\""
