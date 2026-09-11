#!/bin/bash
# 为所有路由到 Node 13030 的 location 块添加长超时配置
# 解决 AI 修复/生成等操作 504 Gateway Timeout 问题
# 使用方法：在生产服务器上执行此脚本
#
# 背景：Nginx 默认 proxy_read_timeout=60s，但 LLM 调用可能耗时 2-3 分钟
# Node 端 AI_FIX_RENDER_ERROR_TIMEOUT_MS=180s，Nginx 必须 >= 180s

set -e

NGINX_CONF="/home/mvbt/nginx/vhost/gzxj.conf"
NGINX_SBIN="/home/mvbt/nginx/sbin/nginx"

echo "=== 1. 备份原配置 ==="
cp "$NGINX_CONF" "${NGINX_CONF}.bak.$(date +%Y%m%d_%H%M%S)"
echo "✅ 备份完成: ${NGINX_CONF}.bak.*"

echo ""
echo "=== 2. 用 Python 统一添加超时配置 ==="

python3 << 'PYTHON_SCRIPT'
import re

conf_path = "/home/mvbt/nginx/vhost/gzxj.conf"

with open(conf_path, 'r') as f:
    content = f.read()

# 需要添加长超时的 location 块（路由到 Node 13030 的）
# 匹配 location /api/xxx { ... proxy_pass ... 13030 ... }
# 在这些块内的 proxy_set_header 最后一行之后、} 之前插入超时配置

TIMEOUT_BLOCK = """
        # 长超时配置（AI/LLM 操作可能耗时 2-3 分钟）
        proxy_connect_timeout 180s;
        proxy_send_timeout 180s;
        proxy_read_timeout 180s;"""

# 策略：找到所有 proxy_pass 到 13030 的 location 块，
# 如果块内没有 proxy_read_timeout，就在 } 前插入超时配置

# 匹配 location 块（支持嵌套花括号）
def find_location_blocks(text):
    """找到所有 location 块的起止位置"""
    blocks = []
    i = 0
    while i < len(text):
        match = re.search(r'location\s+\S+\s*\{', text[i:])
        if not match:
            break
        start = i + match.start()
        brace_start = i + match.end() - 1
        # 找到匹配的 }
        depth = 1
        j = brace_start + 1
        while j < len(text) and depth > 0:
            if text[j] == '{':
                depth += 1
            elif text[j] == '}':
                depth -= 1
            j += 1
        if depth == 0:
            blocks.append((start, j))
        i = j
    return blocks

blocks = find_location_blocks(content)
modified = False
new_content = content

# 从后往前修改，避免位置偏移
for start, end in reversed(blocks):
    block_text = new_content[start:end]
    
    # 只处理路由到 13030 的块
    if '13030' not in block_text:
        continue
    
    # 已经有超时配置就跳过
    if 'proxy_read_timeout' in block_text:
        continue
    
    # 在 } 前插入超时配置
    insert_pos = end - 1  # } 的位置
    new_content = new_content[:insert_pos] + TIMEOUT_BLOCK + "\n    " + new_content[insert_pos:]
    modified = True
    
    # 提取 location 路径用于日志
    loc_match = re.search(r'location\s+(\S+)', block_text)
    if loc_match:
        print(f"  ✅ {loc_match.group(1)} → 添加超时 180s")

if modified:
    with open(conf_path, 'w') as f:
        f.write(new_content)
    print("\n✅ 所有 Node 路由已添加长超时配置")
else:
    print("\n⚠️  没有需要修改的 location 块（可能已全部配置）")
PYTHON_SCRIPT

echo ""
echo "=== 3. 验证 Nginx 配置 ==="
$NGINX_SBIN -t
if [ $? -eq 0 ]; then
    echo "✅ 配置验证通过"
else
    echo "❌ 配置验证失败，请检查语法"
    echo "恢复备份: cp ${NGINX_CONF}.bak.* $NGINX_CONF"
    exit 1
fi

echo ""
echo "=== 4. 重载 Nginx ==="
$NGINX_SBIN -s reload
echo "✅ Nginx 已重载"

echo ""
echo "=== 5. 验证结果 ==="
echo "--- 所有 Node 路由的超时配置 ---"
grep -B 1 "proxy_read_timeout" "$NGINX_CONF" | grep -E "location|proxy_read_timeout"

echo ""
echo "🎉 完成！所有 Node 路由的 proxy_read_timeout 已设为 180s"
