#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL="${1:-}"
if [[ -z "$URL" && -f "$ROOT/tools/tunnel-url.txt" ]]; then
  URL="$(tr -d '[:space:]' < "$ROOT/tools/tunnel-url.txt")"
fi
if [[ ! "$URL" =~ ^https:// ]]; then
  echo "sync-worker-url: need an https worker URL" >&2
  exit 1
fi
if [[ -z "${VERCEL_TOKEN:-}" ]]; then
  echo "sync-worker-url: VERCEL_TOKEN missing" >&2
  exit 1
fi

SCOPE="${VERCEL_SCOPE:-pg-c6b2}"
PROJECT="${VERCEL_PROJECT:-relay-whatsapp}"

cd "$ROOT"
npx --yes vercel link --yes --project "$PROJECT" --scope "$SCOPE" --token "$VERCEL_TOKEN" >/dev/null

upsert() {
  local env_name="$1"
  npx --yes vercel env rm WORKER_API_URL "$env_name" --yes --token "$VERCEL_TOKEN" --scope "$SCOPE" >/dev/null 2>&1 || true
  printf '%s' "$URL" | npx --yes vercel env add WORKER_API_URL "$env_name" --token "$VERCEL_TOKEN" --scope "$SCOPE"
}
echo "sync-worker-url: $URL"
upsert production
upsert preview
