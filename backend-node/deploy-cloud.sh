#!/bin/bash
# ============================================================
# 感智晓界 Node 后端 — 云端 ECS 部署脚本
# 适用：阿里云 ECS + 云数据库 MongoDB（VPC 内网访问）
# 用法：chmod +x deploy-cloud.sh && ./deploy-cloud.sh
# ============================================================

set -e

# ---------- 配置区（按需修改）----------
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="mvgo-backend-node"
PORT=13030

# 远程 MongoDB（VPC 内网地址，ECS 可达）
# ⚠️ 安全:切勿在脚本中硬编码数据库口令(会进入 git 历史,且当前为 root 超级账号)。
# 部署前请先 export MONGODB_URI(口令仅存在于你的 shell 环境,不落库/不进版本控制):
#   export MONGODB_URI='mongodb://<user>:<password>@<host>:3717/langgraph-server?replicaSet=mgset-102332332&authSource=admin'
if [ -z "${MONGODB_URI:-}" ]; then
  echo "错误: 未设置 MONGODB_URI 环境变量。禁止在脚本中硬编码口令,请先 export 后再部署。" >&2
  exit 1
fi

# Session 密钥（复用服务器已有值，避免每次部署全员登出）
# 读取服务器现有 .env.production 中的值；不存在才生成新随机串（仅首次部署）
EXISTING_SESSION_SECRET=""
if [ -f .env.production ]; then
  EXISTING_SESSION_SECRET=$(grep -E '^SESSION_SECRET=' .env.production 2>/dev/null | head -1 | cut -d= -f2-)
fi
if [ -n "${SESSION_SECRET:-}" ]; then
  echo "✅ 使用 export 的 SESSION_SECRET"
elif [ -n "${EXISTING_SESSION_SECRET:-}" ]; then
  SESSION_SECRET="$EXISTING_SESSION_SECRET"
  echo "✅ 复用服务器已有 SESSION_SECRET（不重新随机，避免全员登出）"
else
  SESSION_SECRET="$(openssl rand -hex 32)"
  echo "⚠️  未找到已有 SESSION_SECRET，已生成新随机串（仅首次部署）"
fi

# 字段加密密钥（AES-256-GCM，生产必须）
# ⚠️ 一旦设置不可更改，否则已加密数据（用户 AI 配置 / Git 凭证）永久无法解密。
# 策略：优先用 export 注入；否则复用服务器已有值；两者皆无则拒绝部署（绝不自动重新生成）。
EXISTING_FIELD_KEY=""
if [ -f .env.production ]; then
  EXISTING_FIELD_KEY=$(grep -E '^FIELD_ENCRYPTION_KEY=' .env.production 2>/dev/null | head -1 | cut -d= -f2-)
fi
if [ -n "${FIELD_ENCRYPTION_KEY:-}" ]; then
  echo "✅ 使用 export 的 FIELD_ENCRYPTION_KEY"
elif [ -n "${EXISTING_FIELD_KEY:-}" ]; then
  FIELD_ENCRYPTION_KEY="$EXISTING_FIELD_KEY"
  echo "✅ 复用服务器已有 FIELD_ENCRYPTION_KEY"
else
  echo "❌ 未设置 FIELD_ENCRYPTION_KEY，且服务器无已有值。该密钥不可自动生成（变更会令历史加密数据失效），请先 export 后再部署：export FIELD_ENCRYPTION_KEY='<64-hex>'" >&2
  exit 1
fi

# Node 版本
NODE_VERSION="22"

# 门户 API 基准地址（iframe 登录校验用，必须带 /portlet/api 前缀，否则 401）
# 2026-08-30 修正：原写死公网域名，ECS 上 Node 继承公司 HTTP_PROXY 会把门户校验请求塞进代理导致 5s 超时 401。
# 改为同机内网 portlet 地址（实测 2.4ms），彻底不依赖公网 egress；配合 auth.service.ts 的 axios proxy:false 双保险。
PORTAL_BASE_URL="http://192.168.112.1:39680/portlet/api"
# 真实预览页基准地址（前端真实根，截图器探测用）
MC_PREVIEW_BASE_URL="https://go.microvideo.cn/mvgo"
# 前端 workspace 绝对路径（生产必填）
FRONTEND_WORKSPACE="/home/mvbt/mvgo/frontend/workspace"
# Java 后端地址（操作日志 fire-and-forget 上报目标）
JAVA_BACKEND_URL="http://backend-java:8080/api"
# 系统管理员白名单（node 模式，逗号分隔的门户 uid；qs 模式可留空）
DEFAULT_ADMIN_UIDS="zhjie"

# 高保真还原质量参数（必须与本地严格值对齐，否则线上生成质量明显低于本地）
MAX_ITERATIONS=3
QUALITY_SCORE_THRESHOLD=90
VISUAL_SIMILARITY_THRESHOLD=95
MIN_ITERATIONS=1
# ----------------------------------------

echo "============================================"
echo "  感智晓界 Node 后端 — 云端部署"
echo "============================================"

# 0. 检查 Node
if ! command -v node &>/dev/null; then
    echo "❌ Node.js 未安装，开始安装 Node $NODE_VERSION ..."
    curl -fsSL "https://rpm.nodesource.com/setup_$NODE_VERSION.x" | bash -
    yum install -y nodejs
fi
echo "✅ Node: $(node -v)"

# 1. 工作目录
mkdir -p "$APP_DIR"/{workspace,data}
cd "$APP_DIR"
echo "✅ 工作目录: $APP_DIR"

# 2. 检查 dist/main.js
if [ ! -f dist/main.js ]; then
    echo "❌ dist/main.js 不存在！请先从本地 scp 上传："
    echo "   scp -r backend-node/dist backend-node/package*.json root@ECS_IP:$APP_DIR/"
    exit 1
fi
echo "✅ dist/main.js 存在"

# 3. 安装依赖（跳过 puppeteer 下载 Chromium，用系统 chromium）
echo "=== 安装生产依赖 ==="
export PUPPETEER_SKIP_DOWNLOAD=true
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
npm ci --omit=dev --legacy-peer-deps
echo "✅ 依赖安装完成"

# 3.5 检查/安装系统 Chromium
CHROME_BIN=""
for cmd in chromium chromium-browser google-chrome; do
  if command -v "$cmd" &>/dev/null; then CHROME_BIN="$(command -v "$cmd")"; break; fi
done
if [ -z "$CHROME_BIN" ]; then
  echo "=== 安装系统 Chromium ==="
  if command -v yum &>/dev/null; then
    yum install -y chromium || echo "⚠️  yum 装 chromium 失败，截图功能暂不可用"
  elif command -v apt &>/dev/null; then
    apt install -y chromium-browser || apt install -y chromium || echo "⚠️  apt 装 chromium 失败"
  fi
  for cmd in chromium chromium-browser google-chrome; do
    if command -v "$cmd" &>/dev/null; then CHROME_BIN="$(command -v "$cmd")"; break; fi
  done
fi
if [ -n "$CHROME_BIN" ]; then
  echo "✅ Chromium: $CHROME_BIN"
else
  echo "⚠️  未找到 Chromium，AI 截图功能暂不可用（服务可正常启动）"
fi

# 4. 写 .env (基础) + .env.production (prod 覆盖)
echo "=== 生成 .env + .env.production ==="
cat > .env.production << EOF
NODE_ENV=production
MONGODB_URI=$MONGODB_URI
SESSION_SECRET=$SESSION_SECRET
LOG_LEVEL=info
PUPPETEER_EXECUTABLE_PATH=$CHROME_BIN
PORTAL_BASE_URL=$PORTAL_BASE_URL
MC_PREVIEW_BASE_URL=$MC_PREVIEW_BASE_URL
FRONTEND_WORKSPACE=$FRONTEND_WORKSPACE
JAVA_BACKEND_URL=$JAVA_BACKEND_URL
FIELD_ENCRYPTION_KEY=$FIELD_ENCRYPTION_KEY
DEFAULT_ADMIN_UIDS=$DEFAULT_ADMIN_UIDS
MAX_ITERATIONS=$MAX_ITERATIONS
QUALITY_SCORE_THRESHOLD=$QUALITY_SCORE_THRESHOLD
VISUAL_SIMILARITY_THRESHOLD=$VISUAL_SIMILARITY_THRESHOLD
MIN_ITERATIONS=$MIN_ITERATIONS
EOF
# 基础 .env 只需 NODE_ENV 指向 production（触发 .env.production 加载）
echo "NODE_ENV=production" > .env
echo "✅ .env + .env.production 已生成"

# 5. 测试 MongoDB 连接
echo "=== 测试 MongoDB 连通性 ==="
MONGODB_URI="$MONGODB_URI" node -e "
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 })
  .then(() => { console.log('✅ MongoDB 连接成功'); process.exit(0); })
  .catch(e => { console.error('❌ MongoDB 连接失败:', e.message); process.exit(1); });
" || { echo "❌ MongoDB 连不上，检查白名单/VPC/密码"; exit 1; }

# 6. 进程管理说明：本脚本不再依赖 pm2。
#    线上 Node 进程由 setsid 双重 fork 脱离会话启动（跨调用存活），
#    重启时按「端口真实持有者」杀掉再拉起，兼容 pm2 / setsid 两种历史拉起方式。

# 7. 停旧进程：按端口真实持有者杀掉（兼容 pm2 / setsid 两种历史拉起方式）
echo "=== 停止旧进程 (端口 $PORT) ==="
# 7a. 若历史上由 pm2 托管，先 delete 避免其自动重启拉起新副本
pm2 delete "$APP_NAME" 2>/dev/null || true
# 7b. 探测并杀掉真正占用端口的进程
PIDS=""
if command -v lsof &>/dev/null; then
  PIDS=$(lsof -ti:"$PORT" 2>/dev/null || true)
elif command -v ss &>/dev/null; then
  PIDS=$(ss -ltnp "sport = :$PORT" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 || true)
fi
if [ -n "$PIDS" ]; then
  echo "   发现占用 $PORT 的进程: $PIDS，终止中..."
  # 先 TERM，给 node 优雅退出时间；残留再 KILL
  kill $PIDS 2>/dev/null || true
  sleep 2
  PIDS_LEFT=""
  if command -v lsof &>/dev/null; then PIDS_LEFT=$(lsof -ti:"$PORT" 2>/dev/null || true); fi
  if [ -n "$PIDS_LEFT" ]; then
    echo "   仍有残留，强制 KILL: $PIDS_LEFT"
    kill -9 $PIDS_LEFT 2>/dev/null || true
    sleep 1
  fi
else
  echo "   端口 $PORT 当前无占用"
fi

# 8. 启动：perl 双重 fork + setsid 脱离会话（跨调用存活，已验证；不依赖 pm2）
echo "=== 启动应用 (setsid + NODE_ENV=production) ==="
LOG_FILE="$APP_DIR/server.log"
: > "$LOG_FILE"
perl -e 'use POSIX qw(setsid); setsid(); fork() and exit; exec @ARGV' \
  env NODE_ENV=production node dist/main.js >> "$LOG_FILE" 2>&1 < /dev/null &
echo "   已后台启动，日志: $LOG_FILE"

# 9. 验证
sleep 3
if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/api/" | grep -q "200\|404\|302"; then
    echo "✅ 服务启动成功: http://localhost:$PORT"
else
    echo "⚠️  端口未响应，查看日志：tail -f $LOG_FILE"
fi

echo ""
echo "============================================"
echo "  部署完成！"
echo "============================================"
echo "  应用目录: $APP_DIR"
echo "  端口: $PORT"
  echo "  进程管理: lsof -ti:${PORT} | xargs ps -o pid,ppid,cmd -p (查看)"
  echo "  停止进程: OLD=\$(lsof -ti:${PORT}); [ -n \"\$OLD\" ] && kill \$OLD"
  echo "  (本脚本不再使用 pm2；进程由 setsid 脱离会话启动，重启已自动兼容端口持有者)"
echo "  MongoDB: $MONGODB_URI"
echo "============================================"
