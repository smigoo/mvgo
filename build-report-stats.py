# -*- coding: utf-8 -*-
import re, html, sys

SRC = "/Users/smigoo/Library/Containers/com.tencent.WeWorkMac/Data/Documents/Profiles/25560B9BECB94D5228204CAFAB00F712/Caches/Files/2026-09/ad4d11ba095e8a40cfb2c72a6b13830a/感智晓界用户注册统计报表.html"

src = open(SRC, encoding='utf-8').read()

# Mongo 直查真实名单（uid，2026-09-10 15:09 脚本实测输出）
CONFIGURED = {"zhjie","weil","liuqh","jiangjm","zhutianming","zhoutonga",
               "chenhj","chenyangb","qiaozhipeng","wangyang","lijunjie","lixye",
               "penglj","daibx","yangkun","duanyunhao","dujinyuan","dengqingbo"}
# 生成了组件（18 条记录；其中 1 条 creatorId 无对应用户名，不计入可识别名单）
GENERATED = CONFIGURED - {"chenhj","chenyangb"} | {"lius"}

# 各人配置的常用模型（来自 /api/admin/users config.plain，2026-09-10 15:10）
MODEL = {
    "zhjie":       "claude-sonnet-5 / claude-opus-4-8",
    "weil":        "z-ai/glm-5.3-flash",
    "liuqh":       "deepseek-v4-pro / qwen3.7-plus",
    "jiangjm":     "ark-code-latest",
    "zhutianming": "z-ai/glm-5.3-flash",
    "zhoutonga":   "qwen3.8-flash-next",
    "chenhj":      "qwen/qwen3.8-max",
    "chenyangb":   "qwen/qwen3.8-max",
    "qiaozhipeng": "z-ai/glm-5.3-flash",
    "wangyang":    "claude-4.6-sonnet",
    "lijunjie":    "z-ai/glm-5.3 / google/gemini-3.7-flash",
    "lixye":       "z-ai/glm-5.3-flash",
    "penglj":      "z-ai/glm-5.3",
    "daibx":       "glm-5-2-260617",
    "yangkun":     "deepseek/deepseek-v4-pro-202606",
    "duanyunhao":  "moonshotai/kimi-k2.7-code",
    "dujinyuan":   "deepseek-v4-flash",
    "dengqingbo":  "z-ai/glm-5.3",
}

def texts_of(tr):
    cells = re.findall(r'<t[hd][^>]*>(.*?)</t[hd]>', tr, re.S)
    return [html.unescape(re.sub(r'<[^>]+>', '', c)).strip() for c in cells]

tables = re.findall(r'(<table[^>]*>.*?</table>)', src, re.S)

agg = {}          # 门户部门 -> [reg, cfg, gen]
uid_name = {}     # uid -> 姓名

new_tables = []
for t in tables:
    head_match = re.search(r'<thead[^>]*>(.*?)</thead>', t, re.S)
    head_src = head_match.group(1) if head_match else t
    heads = texts_of(head_src)
    is_detail = ('用户名' in heads) and ('门户部门' in heads or '注册时间' in heads)
    if not is_detail:
        new_tables.append(t)
        continue

    ui = heads.index('用户名')
    di = heads.index('门户部门') if '门户部门' in heads else -1

    def proc(m):
        tr = m.group(0)
        if '<th' in tr:
            return tr.replace('</tr>', '<th class="r">已配置</th><th class="r">已生成</th><th>常用模型</th></tr>')
        vals = texts_of(tr)
        uid = vals[ui] if ui < len(vals) else ''
        dept = vals[di] if di != -1 and di < len(vals) else None
        cfg = 'Y' if uid in CONFIGURED else '—'
        gen = 'Y' if uid in GENERATED else '—'
        model = MODEL.get(uid, '') if cfg == 'Y' else ''
        if dept:
            a = agg.setdefault(dept, [0, 0, 0])
            a[0] += 1
            if cfg == 'Y': a[1] += 1
            if gen == 'Y': a[2] += 1
        if uid and uid != '—':
            nm = re.sub(r'\s*外协$', '', vals[0]) if vals else ''
            uid_name[uid] = nm
        return tr.replace('</tr>', f'<td class="r">{cfg}</td><td class="r">{gen}</td><td class="mono">{model}</td></tr>')

    t2 = re.sub(r'<tr[^>]*>.*?</tr>', proc, t, flags=re.S)
    new_tables.append(t2)

new_src = src
for old, new in zip(tables, new_tables):
    new_src = new_src.replace(old, new, 1)

# ---- 生成新卡片 ----
agg_rows = sorted(agg.items(), key=lambda kv: (-kv[1][0], kv[0]))
agg_html = ''.join(
    f'<tr><td>{d}</td><td class="r">{v[0]}</td><td class="r">{v[1]}</td><td class="r">{v[2]}</td></tr>'
    for d, v in agg_rows
)

both = sorted(CONFIGURED & GENERATED)          # 既配置又生成
only_gen = sorted(GENERATED - CONFIGURED)        # 仅生成未配置（lius）
only_cfg = sorted(CONFIGURED - GENERATED)        # 仅配置未生成（Mongo 直查=0）
has_cfg = sorted(CONFIGURED)

def names(uids):
    out = []
    for u in uids:
        nm = uid_name.get(u, u)
        m = MODEL.get(u, '')
        out.append(f"{nm}({u})" + (f" · {m}" if m else ""))
    return '、'.join(out) or '—'

# 模型家族分布（按主模型归类）
def fam(m):
    s = m.lower()
    if 'claude' in s: return 'Claude'
    if 'glm' in s: return 'GLM(智谱)'
    if 'qwen' in s: return 'Qwen(通义)'
    if 'deepseek' in s: return 'DeepSeek'
    if 'kimi' in s or 'moonshot' in s: return 'Kimi'
    if 'gemini' in s: return 'Gemini'
    if 'ark' in s: return 'Ark(火山)'
    return '其他'
fam_cnt = {}
for u in sorted(CONFIGURED):
    f = fam(MODEL.get(u, ''))
    fam_cnt[f] = fam_cnt.get(f, 0) + 1
fam_html = ''.join(f'<tr><td>{k}</td><td class="r">{v}</td></tr>' for k, v in sorted(fam_cnt.items(), key=lambda x: -x[1]))

card = f'''<div class="card">
<h2>三、晓界配置与组件生成情况 <span class="badge ok">数据快照 2026-09-10 15:09 · Mongo 直查</span></h2>
<div class="kpis">
<div class="kpi green"><div class="num">18</div><div class="lb">已配置晓界</div></div>
<div class="kpi blue"><div class="num">18</div><div class="lb">已测试组件生成</div></div>
<div class="kpi gray"><div class="num">16</div><div class="lb">既配置又生成</div></div>
<div class="kpi gray"><div class="num">2</div><div class="lb">仅配置未生成</div></div>
<div class="kpi gray"><div class="num">1</div><div class="lb">仅生成未配置</div></div>
</div>
<div class="sec"><div class="st">按门户部门统计（注册 / 已配置晓界 / 已测试生成）</div>
<table><thead><tr><th>门户部门</th><th class="r">已注册</th><th class="r">已配置晓界</th><th class="r">已测试生成</th></tr></thead><tbody>
{agg_html}</tbody></table></div>
<div class="sec"><div class="st">人员清单（按状态分组）</div>
<div class="note" style="background:#ecfdf5;border-color:#a7f3d0;color:#065f46;margin-top:0">
<b>① 既配置晓界又测试过组件生成（{len(both)} 人）：</b><br>{names(both)}
</div>
<div class="note" style="background:#fffbeb;border-color:#fde68a;color:#92400e;margin-top:8px">
<b>② 仅配置了晓界、尚未生成组件（{len(only_cfg)} 人）：</b><br>{names(only_cfg)}
</div>
<div class="note" style="background:#eff6ff;border-color:#bfdbfe;color:#1e40af;margin-top:8px">
<b>③ 未配置晓界但已生成组件（{len(only_gen)} 人）：</b><br>{names(only_gen)}<br>
<span style="color:#6b7280">另：components 集合中还有 1 条 creatorId=6a7e72f49014… 在 users 表无匹配（疑似已删/老UID脏数据），未计入上表。</span>
</div>
</div>
<div class="sec"><div class="st">常用模型分布（按已配置 18 人）</div>
<table><thead><tr><th>模型家族</th><th class="r">使用人数</th></tr></thead><tbody>
{fam_html}</tbody></table></div>
<div class="note">说明：① 配置/生成数据来自生产 Mongo（user_ai_configs / components）直查，与门户用户管理页统计口径独立；② 门户接口 /api/admin/users 当前 componentCount 全 0 系生产 Node 未部署新 dist（缺 admin-stats 路由），非真实值；③ lius(刘爽) 标识体系与配置侧不一致，导致"配置"未命中，已归入③。</div>
</div>'''

new_src = re.sub(r'(<h2[^>]*>二、分部门明细)', card + r'\1', new_src, count=1)

open(SRC, 'w', encoding='utf-8').write(new_src)
print("OK 写入完成")
print("聚合部门数:", len(agg))
print("既配置又生成:", len(both), "| 仅配置:", len(only_cfg), "| 仅生成:", len(only_gen))
print("有配置/生成的部门:")
for d, v in agg_rows:
    if v[1] or v[2]:
        print(f"  {d}: 注册{v[0]} 配置{v[1]} 生成{v[2]}")
