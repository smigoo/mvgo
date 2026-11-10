#!/bin/bash
# Cursor Talk to Figma MCP —— node 版一键启动（等价 bun socket）
# 用法: ./start.sh   停止: Ctrl+C
cd "$(dirname "$0")"
echo "[talk-to-figma] starting WebSocket relay on :3055 ..."
exec node socket-server.mjs
