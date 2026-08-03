#!/usr/bin/env bash
set -euo pipefail

command -v jmeter >/dev/null || { echo "找不到 jmeter，請先安裝 Apache JMeter 5.6+。" >&2; exit 127; }

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESULT_DIR="${RESULT_DIR:-$ROOT_DIR/load-test/results/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$RESULT_DIR"

jmeter -n -t "$ROOT_DIR/load-test/jmeter-150-users.jmx" \
  -JUSERS="${USERS:-150}" -JRAMP_SECONDS="${RAMP_SECONDS:-30}" \
  -JLOOPS="${LOOPS:-1}" -JTHINK_TIME_MS="${THINK_TIME_MS:-1000}" \
  -JAPP_BASE_URL="${APP_BASE_URL:-http://localhost:8000}" \
  -JFIRESTORE_BASE_URL="${FIRESTORE_BASE_URL:-http://localhost:8080}" \
  -JPROJECT_ID="${PROJECT_ID:-demo-gis-fcu}" -JAPI_KEY_QUERY="${API_KEY_QUERY:-}" \
  -l "$RESULT_DIR/results.jtl" -e -o "$RESULT_DIR/report"

echo "測試完成：$RESULT_DIR/report/index.html"
