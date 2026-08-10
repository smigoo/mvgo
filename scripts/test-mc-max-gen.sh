#!/bin/bash
# =============================================================================
# 微码 Max 组件生成测试脚本
# 用法: ./scripts/test-mc-max-gen.sh [figma_url_or_fileKey] [nodeId]
# 示例: ./scripts/test-mc-max-gen.sh "https://www.figma.com/design/1t7Dmmpsl5i0PC8BJt2QLf/?node-id=2:8417"
#   或: ./scripts/test-mc-max-gen.sh 1t7Dmmpsl5i0PC8BJt2QLf 2:8417
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_URL="http://localhost:13030"
FIGMA_URL="${1:-}"
NODE_ID="${2:-}"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# 解析 Figma URL
parse_figma_url() {
  local url="$1"
  if [[ "$url" =~ figma.com/design/([^/]+)/.*node-id=([^&]+) ]]; then
    FIGMA_KEY="${BASH_REMATCH[1]}"
    NODE_ID="${BASH_REMATCH[2]}"
    NODE_ID="${NODE_ID//-/:}"  # 把 node-id=2-8417 转成 2:8417
  elif [[ "$url" =~ figma.com/file/([^/]+)/.*node-id=([^&]+) ]]; then
    FIGMA_KEY="${BASH_REMATCH[1]}"
    NODE_ID="${BASH_REMATCH[2]}"
    NODE_ID="${NODE_ID//-/:}"
  fi
}

# 参数校验
if [[ -z "$FIGMA_URL" ]]; then
  echo -e "${RED}错误: 请提供 Figma URL 或 fileKey${NC}"
  echo "用法: $0 <figma_url_or_fileKey> [nodeId]"
  echo "示例: $0 https://www.figma.com/design/1t7Dmmpsl5i0PC8BJt2QLf/?node-id=2-8417"
  echo "  或: $0 1t7Dmmpsl5i0PC8BJt2QLf 2:8417"
  exit 1
fi

# 如果是 URL，解析
if [[ "$FIGMA_URL" =~ figma.com ]]; then
  parse_figma_url "$FIGMA_URL"
else
  FIGMA_KEY="$FIGMA_URL"
fi

if [[ -z "$FIGMA_KEY" || -z "$NODE_ID" ]]; then
  echo -e "${RED}错误: 无法解析 Figma URL 或参数不完整${NC}"
  echo "解析结果: fileKey=$FIGMA_KEY, nodeId=$NODE_ID"
  exit 1
fi

# 检查后端是否运行
echo -e "${CYAN}🔍 检查后端服务...${NC}"
if ! curl -s "$BACKEND_URL/health" > /dev/null 2>&1; then
  echo -e "${RED}✗ 后端未运行 ($BACKEND_URL)${NC}"
  echo "请先启动后端: cd backend-node && .start-server.sh"
  exit 1
fi
echo -e "${GREEN}✓ 后端已启动${NC}"

# 生成 sessionId（mc-max- 前缀表示微码 Max 测试）
TIMESTAMP=$(date +%s%3N)
RANDOM_SUFFIX=$(openssl rand -hex 4 2>/dev/null || echo $RANDOM$RANDOM | md5 | head -c 8)
SESSION_ID="mc-max-${TIMESTAMP}-${RANDOM_SUFFIX}"

# 测试参数
GROUP_ID="6a51f7caed28c5d5b13c61a5"
TARGET="microcode"

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}🚀 微码 Max 生成测试${NC}"
echo -e "${CYAN}========================================${NC}"
echo "  Figma Key:  $FIGMA_KEY"
echo "  Node ID:    $NODE_ID"
echo "  Session:    $SESSION_ID"
echo "  Group:      $GROUP_ID"
echo "  Target:     $TARGET"
echo -e "${CYAN}========================================${NC}"
echo ""

# 触发请求
echo -e "${YELLOW}▶ 触发 POST /api/phase2/generate ...${NC}"
RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/phase2/generate" \
  -H "Content-Type: application/json" \
  -d "{
    \"fileKey\": \"$FIGMA_KEY\",
    \"nodeId\": \"$NODE_ID\",
    \"groupId\": \"$GROUP_ID\",
    \"target\": \"$TARGET\",
    \"componentName\": \"$SESSION_ID\",
    \"panelType\": \"default-panel\"
  }")

# 解析响应
if echo "$RESPONSE" | grep -q '"success":true'; then
  RETURNED_SESSION=$(echo "$RESPONSE" | grep -o '"sessionId":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [[ -n "$RETURNED_SESSION" ]]; then
    SESSION_ID="$RETURNED_SESSION"
  fi
  echo -e "${GREEN}✓ 任务已启动${NC}"
  echo "  Session ID: $SESSION_ID"
  echo ""
else
  echo -e "${RED}✗ 请求失败${NC}"
  echo "$RESPONSE" | head -20
  exit 1
fi

# 输出路径
OUTPUT_DIR="$PROJECT_ROOT/temp-components/$GROUP_ID/$SESSION_ID"
echo -e "${CYAN}📁 产物目录:${NC} $OUTPUT_DIR"
echo ""

# 等待生成完成（轮询 tasks 接口）
echo -e "${YELLOW}⏳ 等待生成完成... (Ctrl+C 可中断，产物目录不变)${NC}"
echo ""

START_TIME=$(date +%s)
LAST_LOG_LINE=""

while true; do
  TASK_INFO=$(curl -s "$BACKEND_URL/api/tasks" 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    tasks = data.get('data', data) if isinstance(data, dict) else data
    if isinstance(tasks, list):
        for t in tasks:
            if t.get('sessionId') == '$SESSION_ID':
                print(json.dumps(t))
                sys.exit(0)
    print('{}')
except:
    print('{}')
" 2>/dev/null)

  if [[ -z "$TASK_INFO" || "$TASK_INFO" == "{}" ]]; then
    sleep 2
    continue
  fi

  STATUS=$(echo "$TASK_INFO" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','running'))" 2>/dev/null)
  PROGRESS=$(echo "$TASK_INFO" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('progress',''))" 2>/dev/null)
  ERROR_MSG=$(echo "$TASK_INFO" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error','')[:120])" 2>/dev/null)

  ELAPSED=$(( $(date +%s) - START_TIME ))

  # 进度显示
  if [[ "$PROGRESS" != "$LAST_LOG_LINE" ]]; then
    LAST_LOG_LINE="$PROGRESS"
    echo -e "  ${CYAN}[${ELAPSED}s]${NC} 状态: $STATUS | 进度: $PROGRESS"
  fi

  if [[ "$STATUS" == "completed" ]]; then
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✅ 生成完成!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo "  耗时: ${ELAPSED}s"
    echo "  产物: $OUTPUT_DIR"
    echo ""

    # 显示产物结构
    if [[ -d "$OUTPUT_DIR" ]]; then
      echo -e "${CYAN}📦 产物目录结构:${NC}"
      find "$OUTPUT_DIR" -maxdepth 2 -not -path '*/\.*' -not -path '*/node_modules/*' | sort | head -40
      echo ""

      # 检查关键文件
      echo -e "${CYAN}🔎 关键文件检查:${NC}"
      for f in "package/index.vue" "component.js" "declare.json"; do
        if [[ -f "$OUTPUT_DIR/$f" ]]; then
          SIZE=$(wc -c < "$OUTPUT_DIR/$f" | tr -d ' ')
          echo -e "  ${GREEN}✓${NC} $f (${SIZE} bytes)"
        else
          echo -e "  ${RED}✗${NC} $f (缺失)"
        fi
      done

      # 检查资源
      RESOURCES_DIR="$OUTPUT_DIR/resources"
      if [[ -d "$RESOURCES_DIR" ]]; then
        IMG_COUNT=$(find "$RESOURCES_DIR" -name "*.png" -o -name "*.jpg" -o -name "*.svg" 2>/dev/null | wc -l | tr -d ' ')
        echo -e "  ${CYAN}🖼 资源文件:${NC} $IMG_COUNT 个图片/SVG"
      fi
    else
      echo -e "${RED}✗ 产物目录不存在: $OUTPUT_DIR${NC}"
    fi

    # 显示前端预览命令
    echo ""
    echo -e "${CYAN}👀 前端预览:${NC}"
    echo "  浏览器打开: http://localhost:2610"
    echo "  或查看产物: $OUTPUT_DIR/package/index.vue"
    echo ""
    exit 0
  fi

  if [[ "$STATUS" == "failed" || "$STATUS" == "error" ]]; then
    echo ""
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}✗ 生成失败${NC}"
    echo -e "${RED}========================================${NC}"
    echo "  耗时: ${ELAPSED}s"
    echo "  错误: $ERROR_MSG"
    echo "  产物: $OUTPUT_DIR (可能部分生成)"
    echo ""

    # 显示错误日志
    if [[ -d "$OUTPUT_DIR" ]]; then
      echo -e "${RED}📋 已生成的文件:${NC}"
      find "$OUTPUT_DIR" -maxdepth 2 -not -path '*/\.*' | sort | head -20
    fi
    echo ""
    exit 1
  fi

  # 超时保护（10 分钟）
  if [[ $ELAPSED -gt 600 ]]; then
    echo ""
    echo -e "${YELLOW}⚠️  超时（10分钟），任务可能仍在运行${NC}"
    echo "  Session: $SESSION_ID"
    echo "  可手动查看: $OUTPUT_DIR"
    exit 1
  fi

  sleep 3
done
