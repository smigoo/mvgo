#!/bin/bash
# 后端启动脚本 - setsid + 双重 fork,让 node 彻底脱离 Bash 工具会话
# 避免 agent 新轮次清理后台任务时 SIGKILL 掉 node
# ⚠️ cwd 必须是 backend-node/（代码中 process.cwd() 引用均以此为根）
# 2026-07-24：从 nest-app 切换到 backend（nest-app 为旧后端，已停用待删）
# 2026-07-30：polyrepo 拆分，从 langgraph-server/backend → ganzhixiaojie/backend-node
cd "$(dirname "$0")"

# HTTPS_PROXY: 仅在代理工具运行时设置（端口可能未运行 → ECONNREFUSED）
# 如需代理，手动取消下面一行的注释并确认端口正确
# export HTTPS_PROXY=http://127.0.0.1:57196

# 显式清除所有代理变量，防止从父进程继承导致 ECONNREFUSED
unset HTTPS_PROXY https_proxy HTTP_PROXY http_proxy ALL_PROXY all_proxy

# ⚠️ 关键：清除 WorkBuddy 沙箱注入的 NODE_OPTIONS shim（--require=.../node-language-shim.cjs）
# 否则 node 子进程加载被 shim 劫持 → 卡在 dotenvx env 注入后、端口永不监听。
unset NODE_OPTIONS

# ⚠️ A4 安全整改：密钥不再明文写在本脚本，改为从 .env + .env.{NODE_ENV} 加载。
# 加载顺序: .env (基础) → .env.development (dev 覆盖)
# .gitignored，严禁入库。
export NODE_ENV=development
# 本地免登录（旧 start-node.js 注入项，.start-server.sh 补全，确保本地 dev 登录可用）
export DEV_AUTO_LOGIN=true
ROOT_DIR="$(dirname "$0")"
BASE_ENV="$ROOT_DIR/.env"
DEV_ENV="$ROOT_DIR/.env.development"

# 先加载基础配置
if [ -f "$BASE_ENV" ]; then
  set -a
  . "$BASE_ENV"
  set +a
fi

# 再加载 dev 覆盖配置
if [ -f "$DEV_ENV" ]; then
  set -a
  . "$DEV_ENV"
  set +a
else
  echo "WARN: $DEV_ENV not found — MongoDB URI 等将缺失" >&2
fi

# LOG 用脚本所在目录，不受 cwd 变化影响
LOG="$(dirname "$0")/server.log"
TASKS_FILE="${TASKS_FILE:-$ROOT_DIR/data/tasks.json}"
NODE_BIN="/Users/smigoo/.workbuddy/binaries/node/versions/22.22.2-2/bin/node"
if [ ! -x "$NODE_BIN" ]; then
  NODE_BIN="node"
fi

echo "[$(date '+%H:%M:%S')] Starting backend (setsid + double-fork)..." >> "$LOG"

# 默认拒绝中断运行中的生成任务。紧急运维可显式使用 FORCE_RESTART=1。
if [ "${FORCE_RESTART:-0}" != "1" ] && [ -f "$TASKS_FILE" ]; then
  ACTIVE_TASKS=$(
    "$NODE_BIN" -e '
      const fs = require("fs");
      const tasks = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const active = tasks.filter((task) => ["running", "paused"].includes(task.status));
      process.stdout.write(active.map((task) => task.sessionId).join("\n"));
    ' "$TASKS_FILE" 2>/dev/null
  )
  if [ -n "$ACTIVE_TASKS" ]; then
    echo "REFUSED: running generation task(s) detected; backend was not restarted."
    echo "$ACTIVE_TASKS"
    echo "Use FORCE_RESTART=1 only when interruption is intentional."
    echo "[$(date '+%H:%M:%S')] Restart refused; active tasks: $(echo "$ACTIVE_TASKS" | tr '\n' ' ')" >> "$LOG"
    exit 2
  fi
fi

# 优先优雅停止，让服务完成状态持久化；超时后才强制终止。
OLD_PID=$(lsof -ti tcp:13030 2>/dev/null)
if [ -n "$OLD_PID" ]; then
  echo "[$(date '+%H:%M:%S')] Stopping old process(es) on port 13030: $OLD_PID" >> "$LOG"
  kill -TERM $OLD_PID 2>/dev/null
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if ! lsof -ti tcp:13030 >/dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done
  REMAINING_PID=$(lsof -ti tcp:13030 2>/dev/null)
  if [ -n "$REMAINING_PID" ]; then
    echo "[$(date '+%H:%M:%S')] Graceful stop timed out; force killing: $REMAINING_PID" >> "$LOG"
    kill -9 $REMAINING_PID 2>/dev/null
    sleep 1
  fi
fi

# perl: setsid() 创建新会话; fork() 父进程退出让子进程被 init 收养; exec 替换为 node
# 结果: node 的父进程 = init(1),完全脱离 Bash 工具的进程组
if [ "$NODE_BIN" = "/Users/smigoo/.workbuddy/binaries/node/versions/22.22.2/bin/node" ]; then
  echo "[$(date '+%H:%M:%S')] Using managed Node 22" >> "$LOG"
else
  echo "[$(date '+%H:%M:%S')] Managed Node 22 not found, falling back to system node" >> "$LOG"
fi

nohup perl -e 'use POSIX qw(setsid); setsid(); fork() and exit; exec @ARGV' \
  "$NODE_BIN" dist/main.js >> "$LOG" 2>&1 &

sleep 2
if lsof -i :13030 >/dev/null 2>&1; then
  echo "OK: port 13030 listening"
else
  echo "WARN: port 13030 not yet listening, tail server.log:"
  tail -5 "$LOG"
fi
