#!/bin/bash
# mvgo backend-node 启动（经 open -a Terminal 触发，脱离 WorkBuddy 会话进程树）
cd "$(dirname "$0")"
export PATH="/Users/smigoo/.workbuddy/binaries/node/versions/22.22.2-6/bin:/usr/local/bin:/usr/bin:/bin"
export HOME="/Users/smigoo"
echo "[start-backend.command] rename 探针..."
node backend-node/scripts/rename-probe.cjs || { echo "探针失败，10s 后退出"; sleep 10; exit 1; }
echo "[start-backend.command] 探针 OK，拉起 start-node.js（本窗口保持打开即服务在跑）"
node start-node.js
echo "[start-backend.command] 服务退出，窗口保留 600s 供查看"
sleep 600
