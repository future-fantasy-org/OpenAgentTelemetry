#!/usr/bin/env bash
set -euo pipefail

# M13 Eval Jobs 验证脚本
# 前置：
#   1. 后端跑在 OAT_URL（默认 http://localhost:3001）
#   2. 已有 admin 账号 + 至少一个项目
#   3. 已设置 ENCRYPTION_KEY 环境变量（32 字节 base64）
#   4. 可选：OAT_LLM_BASE_URL / OAT_LLM_API_KEY / OAT_LLM_MODEL 用于真实 LLM 跑通端到端

OAT_URL="${OAT_URL:-http://localhost:3001}"
OAT_EMAIL="${OAT_EMAIL:-admin@oat.local}"
OAT_PASSWORD="${OAT_PASSWORD:-admin}"
OAT_LLM_BASE_URL="${OAT_LLM_BASE_URL:-}"
OAT_LLM_API_KEY="${OAT_LLM_API_KEY:-}"
OAT_LLM_MODEL="${OAT_LLM_MODEL:-gpt-4o-mini}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

echo "==> 1) 登录"
code=$(curl -s -o /dev/null -w '%{http_code}' -c "$COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$OAT_EMAIL\",\"password\":\"$OAT_PASSWORD\"}" \
  "$OAT_URL/api/auth/login")
[ "$code" = "200" ] || { echo "FAIL: 登录返回 $code"; exit 1; }
echo "    登录 OK"

echo "==> 2) 创建 LLM Provider"
PROVIDER_NAME="verify-m13-$(date +%s)"
provider_body=$(cat <<EOF
{"name":"$PROVIDER_NAME","provider":"custom","baseURL":"${OAT_LLM_BASE_URL:-https://api.openai.com/v1}","apiKey":"${OAT_LLM_API_KEY:-sk-verify-m13-fake}","defaultModel":"$OAT_LLM_MODEL"}
EOF
)
provider_resp=$(curl -s -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "$provider_body" "$OAT_URL/api/eval/providers")
provider_id=$(echo "$provider_resp" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null) || {
  echo "FAIL: 创建 Provider 失败"
  echo "$provider_resp" | head -c 400
  exit 1
}
echo "$provider_resp" | grep -q '"apiKeyPreview"' || { echo "FAIL: 响应缺少 apiKeyPreview"; exit 1; }
echo "$provider_resp" | grep -q '"apiKey"' && { echo "FAIL: 响应不应包含明文 apiKey"; exit 1; }
echo "    Provider 创建 OK（id=$provider_id，apiKeyPreview 已返回，明文 apiKey 已隐藏）"

echo "==> 3) 列出 Provider"
list_resp=$(curl -s -b "$COOKIE_JAR" "$OAT_URL/api/eval/providers")
echo "$list_resp" | grep -q "$provider_id" || { echo "FAIL: 列表未包含刚创建的 Provider"; exit 1; }
echo "    Provider 列表 OK"

echo "==> 4) 创建项目级 Evaluator（numeric_threshold）"
project_id=$(curl -s -b "$COOKIE_JAR" "$OAT_URL/api/projects" | python3 -c "import sys,json; print(json.load(sys.stdin)['projects'][0]['id'])" 2>/dev/null) || {
  echo "FAIL: 获取项目列表失败"; exit 1
}
eval_body=$(cat <<EOF
{"projectId":"$project_id","name":"latency_gate","type":"numeric_threshold","config":{"metric":"latency_ms","operator":"lte","threshold":60000,"passScore":1,"failScore":0}}
EOF
)
eval_resp=$(curl -s -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "$eval_body" "$OAT_URL/api/eval/evaluators")
evaluator_id=$(echo "$eval_resp" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null) || {
  echo "FAIL: 创建 Evaluator 失败"
  echo "$eval_resp" | head -c 400
  exit 1
}
echo "    Evaluator 创建 OK（id=$evaluator_id）"

echo "==> 5) 按 projectId 列出 Evaluator"
list_eval=$(curl -s -b "$COOKIE_JAR" "$OAT_URL/api/eval/evaluators?projectId=$project_id")
echo "$list_eval" | grep -q "$evaluator_id" || { echo "FAIL: 列表未包含刚创建的 Evaluator"; exit 1; }
echo "    Evaluator 列表 OK"

echo "==> 6) 参数校验：provider 字段非法应返回 400"
bad_body='{"name":"bad","provider":"anthropic","baseURL":"https://api.anthropic.com","apiKey":"k"}'
code=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" \
  -H 'Content-Type: application/json' -d "$bad_body" "$OAT_URL/api/eval/providers")
[ "$code" = "400" ] || { echo "FAIL: 预期 400，实际 $code"; exit 1; }
echo "    参数校验 OK"

echo "==> 7) 删除 Provider"
code=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" \
  -X DELETE "$OAT_URL/api/eval/providers/$provider_id")
[ "$code" = "204" ] || { echo "FAIL: 删除返回 $code"; exit 1; }
list_resp=$(curl -s -b "$COOKIE_JAR" "$OAT_URL/api/eval/providers")
echo "$list_resp" | grep -q "$provider_id" && { echo "FAIL: 删除后列表仍包含该 Provider"; exit 1; }
echo "    Provider 删除 OK"

if [ -n "$OAT_LLM_BASE_URL" ] && [ -n "$OAT_LLM_API_KEY" ]; then
  echo "==> 8) 端到端：创建真实 Provider + Dataset + Prompt + Job（需要真实 LLM）"
  provider_body=$(cat <<EOF
{"name":"e2e","provider":"custom","baseURL":"$OAT_LLM_BASE_URL","apiKey":"$OAT_LLM_API_KEY","defaultModel":"$OAT_LLM_MODEL"}
EOF
  )
  provider_id=$(curl -s -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
    -d "$provider_body" "$OAT_URL/api/eval/providers" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

  dataset_body=$(cat <<EOF
{"projectId":"$project_id","name":"e2e-dataset","description":"verify-m13"}
EOF
  )
  dataset_id=$(curl -s -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
    -d "$dataset_body" "$OAT_URL/api/datasets" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  curl -s -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
    -d '{"input":{"question":"1+1=?"},"expectedOutput":"2"}' \
    "$OAT_URL/api/datasets/$dataset_id/items" > /dev/null

  prompt_body=$(cat <<EOF
{"projectId":"$project_id","name":"e2e-prompt","template":"回答：{{question}}"}
EOF
  )
  prompt_id=$(curl -s -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
    -d "$prompt_body" "$OAT_URL/api/prompts" | python3 -c "import sys,json; print(json.load(sys.stdin)['promptId'])")

  job_body=$(cat <<EOF
{"projectId":"$project_id","name":"e2e-job","datasetId":"$dataset_id","promptId":"$prompt_id","promptVersion":1,"providerId":"$provider_id","model":"$OAT_LLM_MODEL","evaluatorIds":["$evaluator_id"]}
EOF
  )
  job_resp=$(curl -s -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
    -d "$job_body" "$OAT_URL/api/eval/jobs")
  job_id=$(echo "$job_resp" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null) || {
    echo "FAIL: 创建 Job 失败"; echo "$job_resp" | head -c 400; exit 1
  }
  echo "    Job 创建 OK（id=$job_id），等待执行..."

  for i in $(seq 1 30); do
    sleep 1
    status=$(curl -s -b "$COOKIE_JAR" "$OAT_URL/api/eval/jobs/$job_id" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
    if [ "$status" = "completed" ] || [ "$status" = "failed" ]; then
      break
    fi
  done

  final=$(curl -s -b "$COOKIE_JAR" "$OAT_URL/api/eval/jobs/$job_id")
  echo "$final" | grep -q '"status":"completed"' || {
    echo "FAIL: Job 未完成，最终状态："
    echo "$final" | python3 -m json.tool 2>/dev/null || echo "$final" | head -c 400
    exit 1
  }
  echo "$final" | grep -q '"summary"' && echo "    Job 完成，summary 已生成"
  echo "    端到端 OK"
else
  echo "==> 8) 端到端测试跳过（未设置 OAT_LLM_BASE_URL / OAT_LLM_API_KEY）"
fi

echo "==> 全部验证通过"
