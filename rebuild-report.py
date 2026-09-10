# -*- coding: utf-8 -*-
import re, html

BAK = "/Users/smigoo/Library/Containers/com.tencent.WeWorkMac/Data/Documents/Profiles/25560B9BECB94D5228204CAFAB00F712/Caches/Files/2026-09/ad4d11ba095e8a40cfb2c72a6b13830a/感智晓界用户注册统计报表.html.bak"
OUT = BAK[:-4]

# 已配置晓界（含 lius 刘爽：旧数据，经确认也是已配置）
CONFIGURED = {
    "zhjie","weil","liuqh","jiangjm","zhutianming","zhoutonga",
    "chenhj","chenyangb","qiaozhipeng","wangyang","lijunjie","lixye",
    "penglj","daibx","yangkun","duanyunhao","dujinyuan","dengqingbo","lius",
}
# 已生成组件（chenhj / chenyangb 仅配置未生成）
GENERATED = CONFIGURED - {"chenhj", "chenyangb"}

# 各人配置的常用模型（来自 /api/admin/users 的 config.plain；lius 为旧数据未采集）
MODEL = {
    "zhjie": "claude-sonnet-5 / claude-opus-4-8",
    "weil": "z-ai/glm-5.3-flash",
    "liuqh": "deepseek-v4-pro / qwen3.7-plus",
    "jiangjm": "ark-code-latest",
    "zhutianming": "z-ai/glm-5.3-flash",
    "zhoutonga": "qwen3.8-flash-next",
    "chenhj": "qwen/qwen3.8-max",
    "chenyangb": "qwen/qwen3.8-max",
    "qiaozhipeng": "z-ai/glm-5.3-flash",
    "wangyang": "claude-4.6-sonnet",
    "lijunjie": "z-ai/glm-5.3 / gemini-3.7-flash",
    "lixye": "z-ai/glm-5.3-flash",
    "penglj": "z-ai/glm-5.3",
    "daibx": "glm-5-2-260617",
    "yangkun": "deepseek-v4-pro-202606",
    "duanyunhao": "kimi-k2.7-code",
    "dujinyuan": "deepseek-v4-flash",
    "dengqingbo": "z-ai/glm-5.3",
    # lius(刘爽) 旧数据，user_ai_configs 无记录 → 显示 —
}

DEPTS = ["软件研发中心","综管事业部","视频事业部","收费事业部",
         "养护运维事业部","桥隧事业部","智慧交通研究中心","基础研发部"]

src = open(BAK, encoding='utf-8').read()

# 文案修正：简化应注册说明
src = src.replace('综管事业部名单 12 人中寇佳鑫「激活=否」不计入应注册；其余 57 人已全部注册。',
                  '综管事业部名单 12 人中寇佳鑫「激活=否」。')
src = src.replace('数据快照：2026-09-05 21:36~21:37 · 用户管理页全量数据 · 按公司部门归属统计 · 应注册名单 = 前端技能 58 人（57 激活=是 + 1 激活=否）',
                  '数据快照：2026-09-10 · 生产 Mongo 直查 · 按公司部门归属统计 · 仅统计已注册用户')

seg = src[src.find('二、分部门明细'):]
pairs = re.findall(r'<div class="st"[^>]*>(.*?)</div>\s*<table[^>]*>(.*?)</table>', seg, re.S)
print("解析到 sec 块:", len(pairs))

def parse(tbl):
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', tbl, re.S)
    out = []
    for r in rows:
        cs = re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', r, re.S)
        if cs:
            out.append([html.unescape(re.sub(r'<[^>]+>', '', c)).strip() for c in cs])
    return out

def to_users(rows):
    if not rows: return []
    head = rows[0]
    def ci(n): return head.index(n) if n in head else -1
    ni, pi, ui, ti, di = ci('姓名'), ci('岗位'), ci('用户名'), ci('注册时间'), ci('门户部门')
    res = []
    for r in rows[1:]:
        uid = r[ui] if 0 <= ui < len(r) else ''
        active = bool(re.fullmatch(r'[A-Za-z0-9_.\-]+', uid or ''))
        res.append({
            'name': r[ni] if 0 <= ni < len(r) else '',
            'post': r[pi] if 0 <= pi < len(r) else '',
            'uid': uid,
            'time': r[ti] if 0 <= ti < len(r) else '',
            'dept': r[di] if 0 <= di < len(r) else '',
            'active': active,
        })
    return res

# 动态分组：遇到"应注册前端"开新部门，遇到"非前端已注册"并入当前部门
groups = []
cur = None
for st, tbl in pairs:
    stext = html.unescape(re.sub(r'<[^>]+>', '', st)).strip()
    if '应注册前端' in stext:
        cur = {'front': to_users(parse(tbl)), 'non': []}
        groups.append(cur)
    elif '非前端已注册' in stext:
        if cur is not None:
            cur['non'] = to_users(parse(tbl))

groups = [(DEPTS[i], g['front'] + g['non']) for i, g in enumerate(groups)]
print("分组部门数:", len(groups))

print("\n=== 校验（部门 / 注册 / 配置 / 生成）===")
tot_r = tot_c = tot_g = 0
for d, us in groups:
    r = sum(1 for u in us if u['active'])
    c = sum(1 for u in us if u['uid'] in CONFIGURED)
    g = sum(1 for u in us if u['uid'] in GENERATED)
    tot_r += r; tot_c += c; tot_g += g
    print(f"{d}: 注册{r} 配置{c} 生成{g}")
print(f"合计: 注册{tot_r} 配置{tot_c} 生成{tot_g}")

# ============ 重建 HTML ============
def esc(s): return html.escape(s, quote=False)

def badge(ok):
    return '<span class="badge ok">Y</span>' if ok else '<span class="badge gray">—</span>'

# 1) KPI
kpi_new = f'''<div class="kpis" data-page-node-id="phYsG9C9SjqbCk4W3ZXPVg">
<div class="kpi green"><div class="num">{tot_r}</div><div class="lb">已注册用户</div></div>
<div class="kpi blue"><div class="num">{tot_c}</div><div class="lb">已配置晓界</div></div>
<div class="kpi gray"><div class="num">{tot_g}</div><div class="lb">已生成组件</div></div>
</div>'''
src = re.sub(r'<div class="kpis"[^>]*>.*?</div>\s*</div>\s*(?=<div class="card")',
             kpi_new + '\n', src, count=1, flags=re.S)

# 2) 一、按部门总览：只留 部门|已注册|已配置|已生成
rows_ov = ''.join(
    f'<tr><td>{d}</td><td class="r">{sum(1 for u in us if u["active"])}</td>'
    f'<td class="r">{sum(1 for u in us if u["uid"] in CONFIGURED)}</td>'
    f'<td class="r">{sum(1 for u in us if u["uid"] in GENERATED)}</td></tr>'
    for d, us in groups
)
rows_ov += (f'<tr style="font-weight:700;background:#f9fafb"><td>合计</td>'
            f'<td class="r">{tot_r}</td><td class="r">{tot_c}</td><td class="r">{tot_g}</td></tr>')
tbl_ov = ('<table><thead><tr><th>部门</th><th class="r">已注册</th>'
          '<th class="r">已配置</th><th class="r">已生成</th></tr></thead><tbody>'
          + rows_ov + '</tbody></table>')

src = re.sub(r'(<h2[^>]*>一、按部门总览.*?</h2>).*?(?=<div class="card")',
             lambda m: m.group(1) + tbl_ov, src, count=1, flags=re.S)

# 3) 二、分部门明细：重建（每部门一张表 + 汇总行）
blocks = []
for d, us in groups:
    reg = sum(1 for u in us if u['active'])
    cfg = sum(1 for u in us if u['uid'] in CONFIGURED)
    gen = sum(1 for u in us if u['uid'] in GENERATED)
    body = ''
    for u in us:
        if not u['active']:
            continue
        ptxt = f'<td>{esc(u["post"])}</td>' if u['post'] else '<td>—</td>'
        model = MODEL.get(u["uid"], '—')
        mtxt = f'<td class="mono">{esc(model)}</td>' if model != '—' else '<td>—</td>'
        body += (f'<tr><td>{esc(u["name"])}</td>{ptxt}<td class="mono">{esc(u["uid"])}</td>'
                 f'<td>{esc(u["time"])}</td><td>{esc(u["dept"])}</td>'
                 f'<td class="r">{badge(u["uid"] in CONFIGURED)}</td>'
                 f'<td class="r">{badge(u["uid"] in GENERATED)}</td>{mtxt}</tr>')
    blocks.append(f'''<div class="sec"><div class="st">{esc(d)} · 共注册 {reg} 人 · 已配置 {cfg} 人 · 已生成 {gen} 人</div>
<table><thead><tr><th>姓名</th><th>岗位</th><th>用户名</th><th>注册时间</th><th>门户部门</th><th class="r">已配置</th><th class="r">已生成</th><th>常用模型</th></tr></thead>
<tbody>{body}</tbody></table></div>''')

detail = '<div class="card"><h2>二、分部门明细 <span class="badge">已注册用户 · 配置/生成状态</span></h2>' + ''.join(blocks) + '</div>'

# 把从 "二、分部门明细" 的 card 到文件末尾 </div> 之前整段替换
start = src.find('二、分部门明细')
start = src.rfind('<div class="card"', 0, start)
# 三、章节已被删除（从 bak 重建所以本来就没有）；找结尾
end = src.rfind('</div>')  # wrap 收尾
src = src[:start] + detail + src[end:]

# 清理旧口径残留：注册率 100% badge（占比口径已废弃）
src = re.sub(r'\s*<span class="badge ok"[^>]*>注册率\s*100%</span>', '', src)

open(OUT, 'w', encoding='utf-8').write(src)
print("\n✅ 已重建:", OUT, len(src), "bytes")


