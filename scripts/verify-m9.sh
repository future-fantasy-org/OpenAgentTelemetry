#!/usr/bin/env bash
set -euo pipefail

OAT_URL="${OAT_URL:-http://localhost:3001}"
OAT_EMAIL="${OAT_EMAIL:-admin@oat.local}"
OAT_PASSWORD="${OAT_PASSWORD:-admin}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

echo "==> 1) 未登录访问 /api/projects 应 401"
code=$(curl -s -o /dev/null -w '%{http_code}' "$OAT_URL/api/projects")
[ "$code" = "401" ] || { echo "FAIL: 预期 401，实际 $code"; exit 1; }
echo "    OK ($code)"

echo "==> 2) 登录拿 session cookie"
code=$(curl -s -o /dev/null -w '%{http_code}' -c "$COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$OAT_EMAIL\",\"password\":\"$OAT_PASSWORD\"}" \
  "$OAT_URL/api/auth/login")
[ "$code" = "200" ] || { echo "FAIL: 登录返回 $code"; exit 1; }
echo "    OK ($code)"

echo "==> 3) 带 cookie 取 /api/projects"
code=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$OAT_URL/api/projects")
[ "$code" = "200" ] || { echo "FAIL: 预期 200，实际 $code"; exit 1; }
echo "    OK ($code)"

echo "==> 4) 取第一个项目的 traces"
pid=$(curl -s -b "$COOKIE_JAR" "$OAT_URL/api/projects" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -n1)
if [ -z "$pid" ]; then
  echo "    (无项目，跳过 traces 验证)"
else
  code=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$OAT_URL/api/traces?projectId=$pid")
  [ "$code" = "200" ] || { echo "FAIL: traces 返回 $code"; exit 1; }
  echo "    OK ($code, projectId=$pid)"
fi

echo "==> 全部验证通过"
