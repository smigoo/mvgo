#!/usr/bin/env bash
# ============================================================
# 感智晓界 Java 后端 — 云端 ECS 部署脚本
# 用途：在 ECS 上独立启动/重启 mvgo Java 后端（方式 A：不影响现有 Node/前端链路）
# 运行位置：/home/mvbt/mvgo/backend-java/
# 前置条件：已把 fat jar 放到本目录（mvn clean package -pl mvgo-app -am -DskipTests）
# ============================================================

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=8080
LOG_FILE="$APP_DIR/server.log"
JAR_DEFAULT_NAME="mvgo-app-1.0.0-SNAPSHOT.jar"

# ---------- 配置区（按需修改）----------
# 远程 MongoDB（VPC 内网，ECS 可达）。切勿硬编码口令进 git，部署前 export。
if [ -z "${MONGODB_URI:-}" ]; then
  echo "ERROR: 未设置 MONGODB_URI。请先 export 后再部署：" >&2
  echo "  export MONGODB_URI='mongodb://<user>:<pwd>@<host>:3717/langgraph-server?replicaSet=mgset-xxx&authSource=admin'" >&2
  exit 1
fi

# 门户 API 基准地址（Java SessionGuard 验 token 用）。
# 必须带 /portlet/api，否则 401。优先用内网同机 portlet（实测 2.4ms，免公网 egress）。
PORTAL_BASE_URL="${PORTAL_BASE_URL:-http://192.168.112.1:39680/portlet/api}"
# Java 反代目标：同机 Node（内网 IP，非 localhost，避免容器/网络命名歧义）
NODE_BACKEND_URL="${NODE_BACKEND_URL:-http://192.168.112.1:13030/api}"
# 字段加密密钥（与 Node 的 FIELD_ENCRYPTION_KEY 同 key，解密 user_ai_configs.configEnc 必需；
# 未设置时 Java 降级开发派生密钥，/api/admin/ai-configs 返回列表但配置解密为空，并打启动 warn）
FIELD_ENCRYPTION_KEY="${FIELD_ENCRYPTION_KEY:-}"
# ----------------------------------------

echo "============================================"
echo "  感智晓界 Java 后端 — 云端部署"
echo "============================================"

# 0. 检测 fat jar
JAR_PATH="$APP_DIR/$JAR_DEFAULT_NAME"
if [ ! -f "$JAR_PATH" ]; then
  # 退路：目录下任意非 .original 的 jar
  JAR_PATH=$(ls "$APP_DIR"/*.jar 2>/dev/null | grep -v '\.original$' | head -1)
fi
if [ -z "$JAR_PATH" ] || [ ! -f "$JAR_PATH" ]; then
  echo "ERROR: 未找到 fat jar（期望 $APP_DIR/$JAR_DEFAULT_NAME）。请先 mvn 打 jar 并 scp 上来。" >&2
  exit 1
fi
echo "✅ JAR: $(basename "$JAR_PATH")"

# 0.5 校验 jar 完整性（防止传输截断导致 'Invalid or corrupt jarfile'）
# 仅用 unzip 读中央目录；损坏多为 scp / 编辑器拖拽截断，提前报清原因。
if command -v unzip >/dev/null 2>&1; then
  if ! unzip -lq "$JAR_PATH" >/dev/null 2>&1; then
    echo "❌ JAR 损坏：中央目录校验失败（多为 scp / VS Code 拖拽传输截断）。" >&2
    echo "   请重新上传并比对校验和：" >&2
    echo "     scp backend-java/mvgo-app/target/mvgo-app-1.0.0-SNAPSHOT.jar root@ECS_IP:$APP_DIR/" >&2
    echo "     # 两端分别 sha256sum 该 jar，必须一致" >&2
    exit 1
  fi
  echo "✅ JAR 完整性校验通过（中央目录可读）"
else
  echo "⚠️  无 unzip，跳过 jar 完整性校验（部署后若报 corrupt 请手动校验）"
fi

# 1. Java 可执行文件
JAVA_BIN="${JAVA_BIN:-java}"
if ! command -v "$JAVA_BIN" >/dev/null 2>&1; then
  echo "ERROR: java 未找到（JAVA_BIN=$JAVA_BIN）。请装 JDK17+ 或用 JAVA_BIN=/path/to/java 指定。" >&2
  exit 1
fi
echo "✅ Java: $("$JAVA_BIN" -version 2>&1 | head -1)"

# 2. 防 SERVER__PORT=0 陷阱（CI/沙箱注入会让 Spring 随机端口）
unset SERVER__PORT
export SERVER__PORT=8080
export SPRING_PROFILES_ACTIVE=prod

# 3. Mongo 连通性预检（可选，但能早暴露白名单/密码问题）
echo "=== 测试 MongoDB 连通性 ==="
if command -v node >/dev/null 2>&1; then
  MONGODB_URI="$MONGODB_URI" node -e "
    const m=require('mongoose');
    m.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000})
      .then(()=>{console.log('✅ MongoDB 连接成功');process.exit(0);})
      .catch(e=>{console.error('❌ MongoDB 连接失败:',e.message);process.exit(1);});
  " || echo "⚠️  Mongo 预检跳过/失败，启动时再观察"
else
  echo "⚠️  无 node，跳过 Mongo 预检"
fi

# 4. 停旧进程：按端口真实持有者杀（兼容 setsid/nohup/其它方式拉起）
echo "=== 停止旧进程 (端口 $PORT) ==="
PIDS=""
if command -v lsof >/dev/null 2>&1; then
  PIDS=$(lsof -ti:"$PORT" 2>/dev/null || true)
elif command -v ss >/dev/null 2>&1; then
  PIDS=$(ss -ltnp "sport = :$PORT" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 || true)
fi
if [ -n "$PIDS" ]; then
  echo "   发现占用 $PORT 的进程: $PIDS，终止中..."
  kill $PIDS 2>/dev/null || true
  sleep 3
  PIDS_LEFT=""
  [ -x "$(command -v lsof)" ] && PIDS_LEFT=$(lsof -ti:"$PORT" 2>/dev/null || true)
  if [ -n "$PIDS_LEFT" ]; then
    echo "   仍有残留，强制 KILL: $PIDS_LEFT"
    kill -9 $PIDS_LEFT 2>/dev/null || true
    sleep 1
  fi
else
  echo "   端口 $PORT 当前无占用"
fi

# 5. 启动：perl 双重 fork + setsid 脱离会话（跨调用/跨会话存活，不留中间 PID 文件）
echo "=== 启动应用 (setsid + SPRING_PROFILES_ACTIVE=prod) ==="
: > "$LOG_FILE"
perl -e 'use POSIX qw(setsid); setsid(); fork() and exit; exec @ARGV' \
  env SERVER__PORT=8080 SPRING_PROFILES_ACTIVE=prod \
      MONGODB_URI="$MONGODB_URI" \
      PORTAL_BASE_URL="$PORTAL_BASE_URL" \
      NODE_BACKEND_URL="$NODE_BACKEND_URL" \
      FIELD_ENCRYPTION_KEY="$FIELD_ENCRYPTION_KEY" \
  "$JAVA_BIN" -jar "$JAR_PATH" >> "$LOG_FILE" 2>&1 < /dev/null &
echo "   已后台启动，日志: $LOG_FILE"

# 6. 健康检查（Spring Boot 冷启常需 30~60s）
echo "=== 健康检查 (最多等 90s) ==="
for i in $(seq 1 45); do
  sleep 2
  CODE=$(curl -s -m 5 -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/api/health" 2>/dev/null || true)
  if [ "$CODE" = "200" ]; then
    echo "✅ Java 启动成功: http://127.0.0.1:$PORT/api/health ($CODE)"
    break
  fi
  if [ "$i" -eq 45 ]; then
    echo "❌ 健康检查超时，最后 60 行日志："
    tail -n 60 "$LOG_FILE"
    exit 1
  fi
done

echo ""
echo "============================================"
echo "  部署完成！"
echo "============================================"
echo "  应用目录: $APP_DIR"
echo "  端口:     $PORT"
echo "  进程查看: lsof -ti:$PORT | xargs ps -o pid,ppid,cmd -p 2>/dev/null"
echo "  停止进程: OLD=\$(lsof -ti:$PORT); [ -n \"\$OLD\" ] && kill \$OLD"
echo "  门户校验: PORTAL_BASE_URL=$PORTAL_BASE_URL"
echo "  Node回源: NODE_BACKEND_URL=$NODE_BACKEND_URL"
echo "  MongoDB : $MONGODB_URI"
echo "============================================"
