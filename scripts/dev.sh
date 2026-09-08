#!/usr/bin/env bash
set -euo pipefail
npm run dev:worker &
npm run dev:web
