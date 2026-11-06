#!/bin/bash
# 为 gzxj.conf 补齐「Node 13030 直连」location —— 近两天新增的 Node 前缀
#
# 背景（两层独立开关，勿混）：
#   Nginx location /api/<prefix>（直连 Node 13030）
#     → 兜底 location /api（Java 8080）→ Java NodeProxyController 匹配前缀 → 转发 Node 13030
#   ·「缺 Java 前缀」⇒ 落到 Java 自己的控制器 ⇒ 500（**必须修**，已随 Java 门面补 8 前缀修掉）
#   ·「缺 Nginx location」⇒ 多走一跳 Java→Node，**仍可用**（本轮前缀均不含 SSE；
#      全仓 SSE 只有 /api/progress 一处，Nginx 早已直连）
#   本脚本把 Nginx 这一层也补齐（省一跳），并顺带补会议纪要 /api/meeting/。
#
# 幂等：已存在的 location 自动跳过（按去尾斜杠比较）。
# 安全：实改前备份；`nginx -t` 不通过则自动还原备份并退出（非零）。
# 格式：新块的**格式从现有 Node location 块复制**（仅替换路径），避免与生产风格漂移；
#       若找不到可作为模板的块，才回退到内置默认块。
# 🔴 但**注释文案不继承模板**：生产 20 处的文案是「Java 无此路由，必须先于 location /api 匹配」，
#    而本清单前 8 条（announcements/workbench/task-stats/meeting-asr/v3/lite-lab/agent-builder/recipes）
#    Java 的 NodeProxyController **本就有**代理路由 ⇒ 照抄等于写进一句假话。
#    故新块统一自带「先于兜底 location /api 匹配」——只陈述真正成立的理由（前缀更长者优先命中）。
#    （纯前缀 location 由「最长前缀」决定命中，与书写顺序无关；顺序只对正则 location 有意义。）
#    2026-11-06 生产已按此文案落地 4 条（meeting-asr/v3/lite-lab/meeting），脚本与生产逐字一致。
#
# 用法（生产 ECS 上执行）：
#   DRY_RUN=1 bash scripts/add-nginx-node-prefixes.sh    # 先看将改什么（不写盘）
#   bash scripts/add-nginx-node-prefixes.sh              # 实改 + nginx -t + reload
#
# 可用 NGINX_CONF / NGINX_EXEC 覆盖（默认 /home/mvbt/nginx/vhost/gzxj.conf、
# `docker exec nginx nginx` —— 生产的 Nginx 在 docker 容器内，宿主无 sbin）。

set -e

export CONF="${NGINX_CONF:-/home/mvbt/nginx/vhost/gzxj.conf}"
export DRY_RUN="${DRY_RUN:-0}"
# 备份路径两边同源（python 在写盘前 cp，bash 在校验失败时 cp 回来），不靠 ls -t 解析
export BAK="${CONF}.bak.$(date +%Y%m%d_%H%M%S)"
# 🔴 生产 Nginx 跑在 docker 容器里（2026-11-06 实测）：
#    · 宿主**没有** /home/mvbt/nginx/sbin/nginx（早期脚本假设有，已在生产上失效）
#    · 容器 nginx:1.30.4-alpine，挂载 /home/mvbt/nginx/vhost -> /etc/nginx/vhost
#    · 校验/reload 必须走 docker exec；用宿主 sbin 会打到不存在的二进制或另一个 master
NGINX_EXEC="${NGINX_EXEC:-docker exec nginx nginx}"

if [ ! -f "$CONF" ]; then
  echo "❌ 找不到配置文件：$CONF"
  echo "   用 NGINX_CONF=/path/to/gzxj.conf 覆盖。"
  echo "   定位宿主源：grep -rl 'listen 8888' /home/mvbt/nginx/"
  exit 1
fi

echo "=== 目标配置：$CONF"
echo "=== DRY_RUN = $DRY_RUN （1=只打印不写盘）"
echo

# 生产核对：先列出当前实际已有的 /api location，便于人眼比对
echo "--- 当前已有的 /api location（去重）---"
grep -oE 'location[[:space:]]+/api[A-Za-z0-9/_-]*' "$CONF" | sed 's/location[[:space:]]*//' | sort -u
echo

echo
echo "--- reload 目标核对（★ 必看）---"
echo "  NGINX_EXEC = $NGINX_EXEC"
$NGINX_EXEC -v 2>&1 | sed 's/^/  ver:  /' || true
if command -v docker >/dev/null 2>&1; then
  docker ps --format '  cont: {{.Names}}  {{.Image}}  {{.Status}}' 2>/dev/null | grep -i nginx || echo "  cont: （无 nginx 容器）"
  docker exec nginx ls -l /etc/nginx/vhost/gzxj.conf 2>/dev/null | sed 's/^/  mnt:  /' || true
else
  echo "  cont: （本机无 docker 命令）"
fi
echo

set +e   # 需要拿到 python 的原始退出码（含「无改动」专用码 3），故临时关 errexit
python3 << 'PY'
import os, re, sys

conf = os.environ['CONF']
dry  = os.environ.get('DRY_RUN', '0') == '1'
src  = open(conf, encoding='utf-8').read()

# (路径, 说明) —— 前 8 条 = Java 门面 2026-11-06 补的 8 前缀；第 9 条 = 会议纪要专需
# （与 backend-java NodeProxyController @RequestMapping 对齐；Nginx 侧同一份清单）
TARGETS = [
    ('/api/announcements/', '公告'),
    ('/api/workbench/',     '工作台'),
    ('/api/task-stats/',    '任务统计'),
    ('/api/meeting-asr/',   '会议 ASR'),
    ('/api/v3/',            'v3 项目管线'),
    ('/api/lite-lab/',      'lab 实验'),
    ('/api/agent-builder/', 'Agent 构建器'),
    ('/api/recipes/',       '配方'),
    ('/api/meeting/',       '会议纪要'),
]

def norm(p):
    return p.rstrip('/')

loc_paths = re.findall(r'location\s+(\S+)\s*\{', src)
existing  = {norm(p) for p in loc_paths}

def find_block(text, path):
    """返回 location <path> { ... } 块的 (start, end_exclusive)，按花括号配平。

    🔴 正则前置 `([ \\t]*)` 是为了让切片**从行首缩进开始**；否则 m.start() 落在
    `location` 字面量上，切出的模板块天然缺前导 4 空格，复制出的新块会顶格。
    """
    m = re.search(r'([ \t]*)location\s+' + re.escape(path) + r'\s*\{', text)
    if not m:
        return None
    i = m.end() - 1
    depth = 0
    while i < len(text):
        c = text[i]
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return (m.start(), i + 1)
        i += 1
    return None

# 找一个路由到 13030 的**标准普通块**当模板（保证新块格式与生产一致）。
#
# 🔴 判据来自 2026-11-06 生产实测（26 个 13030 块形态统计）：
#    · 21 个是同构标准块：`proxy_pass http://<ip>:13030;`（bare，不带 URI）+ 4 空格缩进
#      + 15 行 + 全套 header（含 Cookie/Token）+ proxy_buffering off + 三个 180s 超时
#    · 1 个 SSE 块（/api/progress）：真正标志是 chunked_transfer_encoding / proxy_cache off /
#      Connection ''，**不是** proxy_buffering off —— 后者是生产 Node 块的常态，
#      早先把 proxy_buffering 当 SSE 标志会把 21 个标准块全部排除，只剩简化块
#    · 1 个简化异类（/api/task-stats）：仅 6 行、无超时无 Cookie/Token，**不可作模板**
#    · 5 个带 URI 的块（progress/demo/admin/component/mc-spec）：proxy_pass 带路径，
#      复制给新前缀会出现路径拼接风险 ⇒ 只作备选
def is_sse(body):
    return ('chunked_transfer_encoding' in body
            or 'proxy_cache off' in body
            or "Connection ''" in body
            or 'Connection ""' in body)

candidates = []
for p in loc_paths:
    b = find_block(src, p)
    if not b:
        continue
    body = src[b[0]:b[1]]
    if '13030' not in body or is_sse(body):
        continue
    bare = re.search(r'proxy_pass\s+https?://[^;\s]+:13030\s*;', body) is not None
    score = (
        1 if bare else 0,                              # bare ⇒ 路径原样透传，对新前缀最安全
        1 if 'proxy_connect_timeout' in body else 0,  # 有完整超时
        1 if 'proxy_set_header Cookie' in body else 0,
        len(body),                                    # 同分取最长（最完整）
    )
    candidates.append((score, p, body))

template, template_path = None, None
if candidates:
    candidates.sort(key=lambda x: x[0], reverse=True)
    _, template_path, template = candidates[0]

def default_block(path):
    # 与生产 21 个标准块同构（bare proxy_pass ⇒ 路径原样透传，不做 URI 拼接）
    return (
        "    location %s {\n"
        "        proxy_pass http://192.168.112.1:13030;\n"
        "        proxy_http_version 1.1;\n"
        "        proxy_set_header Host $host:$server_port;\n"
        "        proxy_set_header X-Real-IP $remote_addr;\n"
        "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n"
        "        proxy_set_header X-Forwarded-Proto $scheme;\n"
        "        proxy_set_header SourceHost $remote_addr;\n"
        "        proxy_set_header Cookie $http_cookie;\n"
        "        proxy_set_header Token $http_token;\n"
        "        proxy_buffering off;\n"
        "        proxy_connect_timeout 180s;\n"
        "        proxy_send_timeout 180s;\n"
        "        proxy_read_timeout 180s;\n"
        "    }" % path
    )

def make_block(path):
    if template is None:
        b = default_block(path)
    else:
        # 复制模板并把其中的旧路径替换为新路径（仅 location 行命中）
        b = template.replace(template_path, path)
    # 补一行注释，与生产既有块的注释风格对齐；**内容须准确**——本清单前 8 条 Java
    # 其实有代理路由，不能照抄生产的「Java 无此路由」（详见文件头说明）。
    lead = re.match(r'[ \t]*', b).group(0)
    return '%s# Node 13030（先于兜底 location /api 匹配）\n%s' % (lead, b)

# 找兜底 location /api（排除 /api/... 更长的前缀）的插入锚点
anchor = re.search(r'\n([ \t]*)location\s+/api\s*\{', src)
if not anchor:
    print('❌ 未找到兜底 `location /api {`，无法确定插入位置（请人工插入）。')
    sys.exit(2)

to_add, skipped = [], []
for path, note in TARGETS:
    if norm(path) in existing:
        skipped.append((path, note))
    else:
        to_add.append((path, note))

print('--- 计划 ---')
for path, note in to_add:
    print('  + 新增 %-22s %s' % (path, note))
for path, note in skipped:
    print('  = 已存在，跳过 %-14s %s' % (path, note))
print('  合计：新增 %d 条，跳过 %d 条' % (len(to_add), len(skipped)))

if template is not None:
    print('  （块模板取自现有：location %s）' % template_path)
else:
    print('  ⚠️ 未找到 13030 模板块，将使用内置默认块')
print()

if not to_add:
    print('✅ 无需修改（全部已存在）。')
    sys.exit(3)   # 专用码：让 bash 侧短路，不备份、不校验、不 reload

# 生成插入文本：每条块之间空一行，整体插到 `location /api {` 之前
indent = anchor.group(1)
blocks = []
for p, _ in to_add:
    # 生产 26 个块一律无尾斜杠 ⇒ 生成时去掉，保持完全同构
    # （清单里带尾斜杠只是为了让 norm() 的幂等比较能吃掉两种写法）
    b = make_block(p.rstrip('/'))
    # 若模板块缩进与兜底锚点不同，按锚点缩进重排首行以外不动（保持生产原有内部缩进）
    if indent and not b.startswith(indent):
        b = indent + b.lstrip(' \t')
    blocks.append(b.rstrip())
insert = '\n\n'.join(blocks) + '\n\n'
pos = anchor.start() + 1  # 保留锚点前的换行；insert 自带行首缩进与行尾空行
new_src = src[:pos] + insert + src[pos:]

if dry:
    print('=== DRY_RUN：将插入以下内容（未写盘）===')
    print(insert.rstrip())
    sys.exit(0)

# 🔴 备份必须**先于**写盘：否则 nginx -t 失败时「还原」会把改后内容写回，
#    等于没还原，磁盘停在坏配置上（下一次 reload/重启即炸）。已实测踩过。
import shutil
bak = os.environ['BAK']
shutil.copy2(conf, bak)
print('✅ 已备份原配置：%s' % bak)

open(conf, 'w', encoding='utf-8').write(new_src)
print('✅ 已写入 %d 条 location（原文件 %d 字节 → %d 字节）' % (len(to_add), len(src), len(new_src)))
PY

PY_RC=$?
set -e

if [ "$PY_RC" = "3" ]; then
  echo
  echo "⏭  无改动，跳过备份 / 校验 / reload。"
  exit 0
fi
if [ "$PY_RC" != "0" ]; then
  echo
  echo "❌ 生成阶段失败（exit $PY_RC），配置文件未被改动。"
  exit "$PY_RC"
fi

if [ "$DRY_RUN" = "1" ]; then
  echo
  echo "（DRY_RUN 模式：未备份、未校验、未 reload）"
  exit 0
fi

echo
echo "=== 校验 Nginx 配置（容器内）==="
if ! $NGINX_EXEC -t; then
  echo "❌ nginx -t 不通过 → 从本次备份还原"
  cp "$BAK" "$CONF"
  if cmp -s "$BAK" "$CONF"; then
    echo "   已还原：${CONF} （与备份逐字节一致）"
  else
    echo "   ⚠️ 还原后校验未通过，请人工处理：cp $BAK $CONF"
  fi
  echo "   运行时仍是旧配置（未 reload），但磁盘已恢复。请检查后再重试。"
  exit 1
fi
echo "✅ 配置校验通过"

echo
echo "=== reload ==="
$NGINX_EXEC -s reload
echo "✅ 已 reload"

echo
echo "=== 复核（应含新增前缀）==="
grep -oE 'location[[:space:]]+/api[A-Za-z0-9/_-]*' "$CONF" | sed 's/location[[:space:]]*//' | sort -u
echo
echo "🎉 完成。若某些前缀仍缺，说明它们本就存在或清单需调整。"
