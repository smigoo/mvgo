#!/bin/bash
# 一键重启三大后端服务

echo "🔧 重启三大后端服务..."

# 停止旧进程
pkill -f "node dist/main.js" 2>/dev/null
pkill -f "mvgo-app-1.0.0-SNAPSHOT.jar" 2>/dev/null
sleep 2

# 重启 Node 后端
cd backend-node
NODE_ENV=development DEV_AUTO_LOGIN=true PORT=13030 node dist/main.js > ../node-backend.log 2>&1 &
disown
echo "✅ Node 后端已启动 (PID: $!)"

# 重启 Java 后端
cd ../backend-java
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export PATH=$JAVA_HOME/bin:$PATH
java -jar mvgo-app/target/mvgo-app-1.0.0-SNAPSHOT.jar --spring.profiles.active=dev > ../java-backend.log 2>&1 &
disown
echo "✅ Java 后端已启动 (PID: $!)"

# 等待启动
echo "⏳ 等待服务启动..."
sleep 5

# 检查状态
echo ""
echo "📊 服务状态:"
for p in 13030 8080; do
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:$p/api/health 2>/dev/null | grep -q "200"; then
        echo "  ✅ 端口 $p: 运行中"
    else
        echo "  ❌ 端口 $p: 未响应或启动中"
    fi
done

echo ""
echo "📝 日志文件:"
echo "  - node-backend.log (Node 后端)"
echo "  - java-backend.log (Java 后端)"
