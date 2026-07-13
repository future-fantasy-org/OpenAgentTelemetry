#!/usr/bin/env bash
set -euo pipefail

# M11 + M12 验证脚本
# 前置：后端跑在 OAT_URL（默认 http://localhost:3001），已有 admin 账号 + 至少一个项目

OAT_URL="${OAT_URL:-http://localhost:3001}"
OAT_EMAIL="${OAT_EMAIL:-admin@oat.local}"
OAT_PASSWORD="${OAT_PASSWORD:-admin}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

echo "==> 1) 登录并写一条审计日志"
code=$(curl -s -o /dev/null -w '%{http_code}' -c "$COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$OAT_EMAIL\",\"password\":\"$OAT_PASSWORD\"}" \
  "$OAT_URL/api/auth/login")
[ "$code" = "200" ] || { echo "FAIL: 登录返回 $code"; exit 1; }
echo "    登录 OK ($code)"

echo "==> 2) GET /api/audit/logs 应能取到刚刚的 auth.login.success"
sleep 0.3
body=$(curl -s -b "$COOKIE_JAR" "$OAT_URL/api/audit/logs?limit=5")
echo "$body" | grep -q '"action":"auth.login.success"' || {
  echo "FAIL: 审计日志里没找到 auth.login.success"
  echo "$body" | head -c 400
  exit 1
}
echo "    OK：审计列表含 auth.login.success"

echo "==> 3) action 筛选（auth.login.failed 应为空或不含 success）"
body=$(curl -s -b "$COOKIE_JAR" "$OAT_URL/api/audit/logs?action=auth.login.failed&limit=5")
if echo "$body" | grep -q '"action":"auth.login.success"'; then
  echo "FAIL: action=auth.login.failed 不应返回 success 记录"
  exit 1
fi
echo "    OK：action 筛选生效"

echo "==> 4) cursor 分页（limit=1 + cursor 取第二页）"
page1=$(curl -s -b "$COOKIE_JAR" "$OAT_URL/api/audit/logs?limit=1")
cursor=$(printf '%s' "$page1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('nextCursor') or '')" 2>/dev/null)
if [ -z "$cursor" ]; then
  echo "    SKIP：数据不足 2 条，跳过分页验证"
else
  encoded=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$cursor")
  page2=$(curl -s -b "$COOKIE_JAR" "$OAT_URL/api/audit/logs?limit=1&cursor=$encoded")
  same=$(python3 -c "
import sys, json
a = json.loads(sys.argv[1])
b = json.loads(sys.argv[2])
ia = a.get('logs', [{}])[0].get('id', '')
ib = b.get('logs', [{}])[0].get('id', '')
print('1' if ia and ib and ia == ib else '0')
" "$page1" "$page2" 2>/dev/null)
  if [ "$same" = "1" ]; then
    echo "FAIL: 两页返回了同一条记录"
    exit 1
  fi
  echo "    OK：cursor 分页生效（两页返回不同记录）"
fi

echo "==> 5) 未认证访问 SSE 应 401"
code=$(curl -s -o /dev/null -w '%{http_code}' \
  -H 'Accept: text/event-stream' \
  "$OAT_URL/api/stream/traces")
[ "$code" = "401" ] || { echo "FAIL: 预期 401，实际 $code"; exit 1; }
echo "    OK ($code)"

echo "==> 6) 已认证 SSE 握手返回 text/event-stream"
set +u
code=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" \
  --max-time 1 \
  -H 'Accept: text/event-stream' \
  "$OAT_URL/api/stream/traces" 2>/dev/null || true)
if [ "$code" != "200" ]; then
  echo "FAIL: 预期 200，实际 '$code'"
  exit 1
fi
ct=$(curl -s -o /dev/null -w '%{content_type}' -b "$COOKIE_JAR" \
  --max-time 1 \
  -H 'Accept: text/event-stream' \
  "$OAT_URL/api/stream/audit-logs" 2>/dev/null || true)
case "$ct" in
  *text/event-stream*) echo "    OK（content-type=$ct）" ;;
  *) echo "FAIL: content-type 不是 text/event-stream：'$ct'"; exit 1 ;;
esac
set -u

echo "==> 全部验证通过"
