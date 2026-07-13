#!/usr/bin/env bash
set -euo pipefail

OAT_URL="${OAT_URL:-http://localhost:3001}"
OAT_EMAIL="${OAT_EMAIL:-admin@oat.local}"
OAT_PASSWORD="${OAT_PASSWORD:-admin}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

echo "==> 1) 老明文 key 'demo-api-key' 上报 ingestion → 应 401"
code=$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST "$OAT_URL/api/public/ingestion" \
  -H "Authorization: Bearer demo-api-key" \
  -H "Content-Type: application/json" \
  -d '{"batch":[]}')
[ "$code" = "401" ] || { echo "FAIL: 预期 401，实际 $code"; exit 1; }
echo "    OK ($code)"

echo "==> 2) 不存在的 projectId 查 traces → 应 404"
code=$(curl -s -o /dev/null -w '%{http_code}' -c "$COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$OAT_EMAIL\",\"password\":\"$OAT_PASSWORD\"}" \
  "$OAT_URL/api/auth/login")
[ "$code" = "200" ] || { echo "FAIL: 登录返回 $code"; exit 1; }
echo "    登录 OK ($code)"

code=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" \
  "$OAT_URL/api/traces?projectId=00000000-0000-0000-0000-999999999999")
[ "$code" = "404" ] || { echo "FAIL: 预期 404，实际 $code"; exit 1; }
echo "    OK ($code)"

echo "==> 3) 连续 11 次 login → 第 11 次应 429"
for i in $(seq 1 11); do
  code=$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST "$OAT_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$OAT_EMAIL\",\"password\":\"wrong\"}")
  echo "    第 $i 次: $code"
  if [ "$i" -eq 11 ]; then
    [ "$code" = "429" ] || { echo "FAIL: 第 11 次预期 429，实际 $code"; exit 1; }
  fi
done

echo "==> 全部验证通过"
