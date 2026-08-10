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

# ⚠️ A4 安全整改：密钥不再明文写在本脚本，改为从 .env + .env.{NODE_ENV} 加载。
# 加载顺序: .env (基础) → .env.development (dev 覆盖)
# .gitignored，严禁入库。
export NODE_ENV=development
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
echo "[$(date '+%H:%M:%S')] Starting backend (setsid + double-fork)..." >> "$LOG"

# 强制杀掉旧进程，防止端口占用导致"改了代码不生效"
OLD_PID=$(lsof -ti tcp:13030 2>/dev/null)
if [ -n "$OLD_PID" ]; then
  echo "[$(date '+%H:%M:%S')] Killing old process(es) on port 13030: $OLD_PID" >> "$LOG"
  kill -9 $OLD_PID 2>/dev/null
  sleep 1
fi

# perl: setsid() 创建新会话; fork() 父进程退出让子进程被 init 收养; exec 替换为 node
# 结果: node 的父进程 = init(1),完全脱离 Bash 工具的进程组
nohup perl -e 'use POSIX qw(setsid); setsid(); fork() and exit; exec @ARGV' \
  node dist/main.js >> "$LOG" 2>&1 &

sleep 2
if lsof -i :13030 >/dev/null 2>&1; then
  echo "OK: port 13030 listening"
else
  echo "WARN: port 13030 not yet listening, tail server.log:"
  tail -5 "$LOG"
fi
