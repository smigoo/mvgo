#!/bin/bash
# mvgo-figma-structure —— node 版一键启动（等价 bun socket）
# 用法: ./start.sh   停止: Ctrl+C
cd "$(dirname "$0")"
echo "[mvgo-figma-structure] starting WebSocket relay on :3055 ..."
exec node socket-server.mjs
