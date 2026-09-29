#!/bin/bash
set -e
echo '=== 1. 部署 Node 后端 ==='
cd /home/mvbt/mvgo/backend-node
OLD=$(lsof -ti:13030 2>/dev/null || true)
if [ -n "$OLD" ]; then kill $OLD; sleep 3; echo "已杀旧 Node PID: $OLD"; fi
lsof -ti:13030 -sTCP:LISTEN 2>/dev/null && echo "端口 13030 未释放!" && exit 1 || echo "端口 13030 已释放"
perl -e 'use POSIX qw(setsid); setsid(); fork() and exit; exec @ARGV' env NODE_ENV=production node dist/main.js >> server.log 2>&1 < /dev/null &
sleep 3
pgrep -f "node.*dist/main.js" | head -1 | xargs -I{} echo "Node 已启动 PID: {}"

echo ''
echo '=== 2. 部署 Java 后端 ==='
export MONGODB_URI='mongodb://root:Microvideo%402026@dds-bp13ae3414783164.mongodb.rds.aliyuncs.com:3717/langgraph-server?replicaSet=mgset-102332332&authSource=admin'
export PORTAL_BASE_URL='https://go.microvideo.cn'
export NODE_BACKEND_URL='http://127.0.0.1:13030'
export FIELD_ENCRYPTION_KEY='dev-field-encryption-key'
export ADMIN_STATS_KEY='97e3986897905aab58e74c1ee3cba03a990b2d85f99fba35'
cd /home/mvbt/mvgo/backend-java
bash deploy-java.sh

echo ''
echo '=== 3. 部署前端 ==='
rsync -av --delete /home/mvbt/mvgo/frontend-dist/ /home/mvbt/nginx/www/mvgo/
echo '前端已部署'

echo ''
echo '=== 4. Reload Nginx ==='
docker exec nginx nginx -s reload
echo 'Nginx reloaded'

echo ''
echo '=== 5. 验证 ==='
sleep 5
curl -s -o /dev/null -w 'Node: %{http_code}\n' http://127.0.0.1:13030/api/
curl -s -o /dev/null -w 'Java: %{http_code}\n' http://127.0.0.1:8080/api/health
curl -s -o /dev/null -w 'Frontend: %{http_code}\n' http://127.0.0.1/mvgo/index.html
curl -s -o /dev/null -w 'Tasks-redirect: %{http_code}\n' http://127.0.0.1/tasks/test
echo '=== 部署完成 ==='
