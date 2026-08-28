#!/usr/bin/env bash
# ============================================================
# 感智晓界 mvgo 一键重启脚本（整合 setsid 持久进程模式）
# 用法：bash /Users/smigoo/工作/mvgo/restart-all.sh
# 说明：Bash 工具/终端里只有「perl setsid + 双重 fork」脱离会话的进程能跨调用存活
#       （macOS 无 setsid 二进制，普通 nohup & 会被回收，故用 perl POSIX::setsid 兜底）。
# ============================================================
set -u

ROOT="/Users/smigoo/工作/mvgo"
NODE_DIR="$ROOT/backend-node"
JAVA_DIR="$ROOT/backend-java"
FE_DIR="$ROOT/frontend"
LOG_DIR="$ROOT"

export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export PATH="$JAVA_HOME/bin:$PATH"
# 清掉可能让 Spring 随机端口的环境变量（SERVER__PORT=0 会导致 8080 探活失败）
unset SERVER__PORT
# dev 自动登录开关：Java SessionAuthService 的 dev 兜底依赖此变量（默认 false）。
# 仅 dev profile 生效；prod profile 下 Java 强制禁用兜底（isProdProfile 校验），安全。
export DEV_AUTO_LOGIN=true

# 等待端口释放（最多 20s），否则强制 kill
wait_port_free() {
  local p=$1
  local pid
  pid=$(lsof -ti:"$p" 2>/dev/null)
  if [ -n "$pid" ]; then
    echo "  端口 $p 被占用 (PID $pid)，先 kill 旧进程"
    echo "$pid" | xargs -r kill -9
  fi
  for _ in $(seq 1 10); do
    if [ -z "$(lsof -ti:"$p" 2>/dev/null)" ]; then return 0; fi
    sleep 1
  done
  echo "  ⚠️ 端口 $p 10s 内仍被占用"
}

# 脱离会话启动（跨调用存活）：macOS 无 setsid 二进制，改用 perl 的 POSIX::setsid + 双重 fork，
# 与 backend-node/.start-server.sh 同一已验证模式。+ disown 防 SIGHUP + < /dev/null 防 stdin 阻塞。
start_detached() {
  local name="$1"; local cmd="$2"
  nohup perl -e 'use POSIX qw(setsid); setsid(); fork() and exit; exec @ARGV' \
    bash -c "$cmd" > "$LOG_DIR/$name.log" 2>&1 < /dev/null &
  disown
  echo "  ✅ $name 已下发启动 (日志: $LOG_DIR/$name.log)"
}

# 阻塞等待端口监听（最多 max 秒），用于慢启动服务（Java）
# 让 setsid 进程在脚本存活期间完成 bind，避免脚本退出瞬间被回收
wait_for_listen() {
  local p=$1 max=$2
  for _ in $(seq 1 "$max"); do
    if [ -n "$(lsof -ti:"$p" 2>/dev/null)" ]; then echo "  ✅ 端口 $p 已监听"; return 0; fi
    sleep 1
  done
  echo "  ⚠️ 端口 $p 在 ${max}s 内未监听，请查 $LOG_DIR/java-backend.log"
}

echo "========== [1/3] Node 后端 (13030) =========="
wait_port_free 13030
cd "$NODE_DIR" && bash ./.start-server.sh   # 自带 setsid + 加载 dev env + 清旧进程

echo "========== [2/3] 前端 Vite (2610) =========="
wait_port_free 2610
start_detached "frontend-dev" "cd '$FE_DIR' && exec npm run dev -- --host --port 2610"

echo "========== [3/3] Java 后端 (8080) =========="
wait_port_free 8080
start_detached "java-backend" "cd '$JAVA_DIR' && exec java -jar mvgo-app/target/mvgo-app-1.0.0-SNAPSHOT.jar --spring.profiles.active=dev"

echo ""
echo "========== 等待 Java 冷启动就绪（最多 90s） =========="
wait_for_listen 8080 90

echo ""
echo "✅ 三服务重启完成。"
echo "   探活请用: for p in 13030 2610 8080; do echo \$p \$(lsof -ti:\$p 2>/dev/null||echo 未监听); done"
echo "   前端直连需绕代理: curl --noproxy '*' -o /dev/null -w '%{http_code}' http://127.0.0.1:2610/"
