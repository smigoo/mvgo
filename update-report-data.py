# -*- coding: utf-8 -*-
"""
用 ECS 全量查询结果（85 人）更新报表，保留原有 HTML 结构与样式。
- 只覆盖「已配置 / 已生成」两列 + 各部门汇总 + 总览 + KPI
- 追加 3 名新注册用户（koujx / chenjuntaoa / maz）
- 常用模型列：新晋配置用户无采集数据，保持 —
从 .bak3 恢复后单次执行（幂等靠恢复，不是靠脚本）。
"""
import re
import html as H

P = '/Users/smigoo/Library/Containers/com.tencent.WeWorkMac/Data/Documents/Profiles/25560B9BECB94D5228204CAFAB00F712/Caches/Files/2026-09/ad4d11ba095e8a40cfb2c72a6b13830a/感智晓界用户注册统计报表.html'

DEPTS = ['软件研发中心', '综管事业部', '视频事业部', '收费事业部',
         '养护运维事业部', '桥隧事业部', '智慧交通研究中心', '基础研发部']

# ECS query-all-users.cjs 全量结果：username -> (已配置, 已生成)
LATEST = {
    'koujx': (0, 0), 'chenjuntaoa': (0, 0), 'maz': (0, 0), 'baohj': (0, 0),
    'zhangsj': (0, 0), 'zhuzx': (0, 0), 'fengxf': (0, 0), 'tianbaoyin': (0, 0),
    'dengqingbo': (1, 1), 'buhd': (0, 0), 'xingjianfeng': (0, 0), 'yansihan': (0, 0),
    'zhuxiaodong': (0, 0), 'shimingfeng': (0, 0), 'lizhengzheng': (0, 0),
    'dujinyuan': (1, 1), 'wangyib': (0, 0), 'duanyunhao': (1, 1), 'yangkun': (1, 1),
    'renwenxiang': (0, 0), 'xujq': (0, 0), 'huangyouy': (0, 0), 'huangyuhuan': (0, 0),
    'guoqian': (0, 0), 'mengcheng': (0, 0), 'daibx': (1, 1), 'luh': (0, 0),
    'xuxh': (0, 0), 'penglj': (1, 1), 'wuxw': (0, 0), 'huangjiarong': (0, 0),
    'yangxuemei': (0, 0), 'zhangcongmeia': (1, 0), 'panqiang': (1, 0),
    'lixye': (1, 1), 'lijunjie': (1, 1), 'wangyang': (1, 1), 'liuhb': (0, 0),
    'leishihao': (0, 0), 'zhanghaoa': (0, 0), 'zhangwq': (0, 0), 'lyu': (0, 0),
    'macg': (0, 0), 'luguanyua': (0, 0), 'weibenquan': (1, 0), 'zhull': (0, 0),
    'hejingyuan': (0, 0), 'liuxr': (0, 0), 'lisp': (1, 1),
    'zhangweicheng': (0, 0), 'peidou': (0, 0), 'lihb': (0, 0), 'cheneq': (0, 0),
    'mapeng': (0, 0), 'qiaozhipeng': (1, 1), 'liyuw': (0, 0),
    'huangxiaofei': (0, 0), 'dongfei': (0, 0), 'xushengjie': (0, 0),
    'chenhj': (1, 0), 'liyan': (0, 0), 'chenyangb': (1, 0), 'wangtao': (0, 0),
    'duanbc': (0, 0), 'zhuq': (1, 0), 'zhouyi': (0, 0), 'wsc': (0, 0),
    'baosulei': (0, 0), 'shitianliang': (0, 0), 'jiangxinquan': (0, 0),
    'wangxushenga': (0, 0), 'wangqf': (0, 0), 'zhoutonga': (1, 1),
    'zhutianming': (1, 1), 'wangtongt': (0, 0), 'linxs': (0, 0),
    'jiangjm': (1, 1), 'liuqh': (1, 1), 'weil': (1, 1), 'lius': (0, 1),
    'wangpeng': (0, 0), 'yujings': (0, 0), 'zhouzhifan': (0, 0), 'mxin': (0, 0),
    'zhjie': (1, 1),
}

# 新增注册用户（UTC+8 换算）：(归属大部门, 姓名, 岗位, username, 注册时间, 门户部门)
NEW_USERS = [
    ('综管事业部', '寇佳鑫', '—', 'koujx', '2026-09-08 14:21', '综管研发一组'),
    ('软件研发中心', '陈俊涛', '—', 'chenjuntaoa', '2026-09-08 14:12', '产品部'),
    ('视频事业部', '马证', '—', 'maz', '2026-09-08 10:21', '基础研发部(视频)'),
]

# 业务确认覆盖：这些部门【已配置】的人全部计入「已测试生成」（不依赖 components.creatorId 命中）。
# 未配置的人（如基础研发部冯旭峰 fengxf）不覆盖，保持原值。
FORCE_TESTED_DEPTS = {'基础研发部'}


def txt(x):
    return H.unescape(re.sub(r'<[^>]+>', '', x)).strip()


def set_td(td, inner):
    return re.sub(r'^(<td[^>]*>).*?(</td>)$',
                  lambda m: m.group(1) + inner + m.group(2), td, flags=re.S)


def badge(ok):
    return '<span class="badge ok">Y</span>' if ok else '<span class="badge gray">—</span>'


def esc(v):
    return H.escape(str(v), quote=False)


s = open(P, encoding='utf-8').read()
spans = [m.span() for m in re.finditer(r'<tbody>(.*?)</tbody>', s, re.S)]
assert len(spans) == 9, 'tbody 数量异常: %d' % len(spans)

stats = {}          # 部门 -> (注册, 配置, 生成)
pieces = []         # 从后往前拼，避免偏移
prev_end = len(s)

# ---------- 1) 部门明细 tbody（1..8），倒序处理 ----------
for i in range(8, 0, -1):
    dept = DEPTS[i - 1]
    a, b = spans[i]
    body = s[a:b]

    reg = cfg = gen = 0
    seen = set()
    acc = {'reg': 0, 'cfg': 0, 'gen': 0}

    def rep_tr(m):
        tr = m.group(0)
        tds = re.findall(r'<td[^>]*>.*?</td>', tr, re.S)
        if len(tds) < 7:
            return tr
        uname = txt(tds[2])
        seen.add(uname)
        acc['reg'] += 1
        c, g = LATEST.get(uname, (0, 0))
        if dept in FORCE_TESTED_DEPTS and c:
            g = 1
        acc['cfg'] += c
        acc['gen'] += g
        tds[5] = set_td(tds[5], badge(c))
        tds[6] = set_td(tds[6], badge(g))
        return '<tr>' + ''.join(tds) + '</tr>'

    new_body = re.sub(r'<tr>.*?</tr>', rep_tr, body, flags=re.S)

    # 追加本部门新用户
    adds = [u for u in NEW_USERS if u[0] == dept]
    for _, name, post, uname, tm, pdept in adds:
        if uname in seen:
            continue
        acc['reg'] += 1
        c, g = LATEST[uname]
        if dept in FORCE_TESTED_DEPTS and c:
            g = 1
        acc['cfg'] += c
        acc['gen'] += g
        new_body = new_body.replace('</tbody>', (
            '<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td>'
            '<td class="r">%s</td><td class="r">%s</td><td>—</td></tr></tbody>'
        ) % (esc(name), esc(post), esc(uname), esc(tm), esc(pdept), badge(c), badge(g)))

    reg, cfg, gen = acc['reg'], acc['cfg'], acc['gen']
    stats[dept] = (reg, cfg, gen)
    pieces.append(s[b:prev_end])
    pieces.append(new_body)
    prev_end = a

# ---------- 2) 总览 tbody(0) ----------
a0, b0 = spans[0]
ov = s[a0:b0]

tot_r = sum(v[0] for v in stats.values())
tot_c = sum(v[1] for v in stats.values())
tot_g = sum(v[2] for v in stats.values())


def rep_ov(m):
    tr = m.group(0)
    tds = re.findall(r'<td[^>]*>.*?</td>', tr, re.S)
    if len(tds) < 4:
        return tr
    d = txt(tds[0])
    if d not in stats:
        return tr
    r, c, g = stats[d]
    tds[1] = set_td(tds[1], str(r))
    tds[2] = set_td(tds[2], str(c))
    tds[3] = set_td(tds[3], str(g))
    return '<tr>' + ''.join(tds) + '</tr>'


new_ov = re.sub(r'<tr>.*?</tr>', rep_ov, ov, flags=re.S)
pieces.append(s[b0:prev_end])
pieces.append(new_ov)
pieces.append(s[:a0])

s = ''.join(reversed(pieces))

# ---------- 3) 部门汇总行 st ----------
for d in DEPTS:
    r, c, g = stats[d]
    s = re.sub(r'(<div class="st">%s) · 共注册 \d+ 人 · 已配置 \d+ 人 · 已生成 \d+ 人' % d,
               lambda m: '%s · 共注册 %d 人 · 已配置 %d 人 · 已生成 %d 人' % (m.group(1), r, c, g),
               s)

# ---------- 4) KPI ----------
def set_kpi(s, label, val):
    def rep(m):
        blk = m.group(0)
        if label not in blk:
            return blk
        return re.sub(r'(<div class="num">)[^<]*', lambda x: x.group(1) + str(val), blk)
    return re.sub(r'<div class="kpi[^"]*">.*?</div>\s*</div>', rep, s, flags=re.S)


s = set_kpi(s, '已注册用户', tot_r)
s = set_kpi(s, '已配置晓界', tot_c)
s = set_kpi(s, '已生成组件', tot_g)

# ---------- 4.5) 文案：已生成 -> 已测试生成 ----------
s = s.replace('已生成', '已测试生成')

# ---------- 5) 脚注 ----------
NOTE = (
    '<div class="note">数据截至 2026-09-08，来源生产 MongoDB：'
    '注册=users 集合全量（85 人）；已配置=user_ai_configs 命中（含 ObjectId / 门户 UID 双形态匹配）；'
    '已测试生成=components.creatorId 命中。'
    '刘爽（lius）有组件生成记录但库中无配置记录（疑似配置以门户 UID 形态写入、'
    '被 admin.service.ts 的 configMap 单一 ObjectId 键漏匹配），本表按查询原值计为未配置；'
    '如按旧数据计入已配置，则配置人数为 24 人。基础研发部已配置的 5 人经业务确认已全部完成测试生成，'
    '不依赖 components.creatorId 命中；该部门未配置人员不计入。</div>'
)
if '数据截至' not in s:
    s = re.sub(r'(二、分部门明细.*?</div>)\s*(</div>\s*</div>|\Z)',
               lambda m: m.group(1) + NOTE + m.group(2), s, flags=re.S, count=1)

open(P, 'w', encoding='utf-8').write(s)

print('部门汇总:')
for d in DEPTS:
    r, c, g = stats[d]
    print('  %-10s 注册 %2d | 配置 %2d | 生成 %2d' % (d, r, c, g))
print('合计: 注册 %d | 配置 %d | 生成 %d' % (tot_r, tot_c, tot_g))
print('bytes', len(s.encode('utf-8')))
