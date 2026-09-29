#!/bin/bash
# 修复 Nginx 前端 SPA 路由 500 问题
# 根因：/tasks/... 缺少 /mvgo/ 前缀，落到 location / 产生 redirect cycle

CONF="/home/mvbt/nginx/vhost/gzxj.conf"
BACKUP="${CONF}.bak.$(date +%Y%m%d_%H%M%S)"

# 备份
cp "$CONF" "$BACKUP"
echo "已备份到 $BACKUP"

# 在 location /preview/ 块之后插入 SPA 路由重定向
# 使用 awk 在 "location /preview/" 块的结束 } 之后插入
awk '
/location \/preview\// { in_preview=1 }
in_preview && /^}/ {
    print
    print ""
    print "    # ── 前端 SPA 路由重定向（缺少 /mvgo/ 前缀时自动补全）──"
    print "    location ~ ^/tasks(/.*)?$ { return 301 /mvgo/tasks$1; }"
    print "    location ~ ^/generator(/.*)?$ { return 301 /mvgo/generator$1; }"
    print "    location ~ ^/generate-component(/.*)?$ { return 301 /mvgo/generator/components; }"
    print "    location ~ ^/generate-page(/.*)?$ { return 301 /mvgo/generator/page; }"
    print "    location ~ ^/generate-api(/.*)?$ { return 301 /mvgo/generator/api; }"
    print "    location ~ ^/workbench(/.*)?$ { return 301 /mvgo/workbench$1; }"
    print "    location ~ ^/screen(/.*)?$ { return 301 /mvgo/screen$1; }"
    print "    location ~ ^/playground(/.*)?$ { return 301 /mvgo/playground$1; }"
    print "    location ~ ^/mc-generator(/.*)?$ { return 301 /mvgo/mc-generator$1; }"
    print "    location ~ ^/help(/.*)?$ { return 301 /mvgo/help$1; }"
    print "    location ~ ^/components(/.*)?$ { return 301 /mvgo/components$1; }"
    print ""
    in_preview=0
    next
}
{ print }
' "$BACKUP" > "$CONF"

echo "已更新 Nginx 配置"

# 测试配置
docker exec nginx nginx -t
if [ $? -ne 0 ]; then
    echo "❌ Nginx 配置测试失败，恢复备份"
    cp "$BACKUP" "$CONF"
    exit 1
fi

echo "✅ Nginx 配置测试通过"

# Reload
docker exec nginx nginx -s reload
echo "✅ Nginx 已 reload"

# 验证
sleep 1
echo ""
echo "=== 验证 ==="
curl -sI http://127.0.0.1/tasks/mv-lite-test | head -3
echo ""
curl -sI http://127.0.0.1/mvgo/tasks/mv-lite-test | head -3
