/**
 * 🎯 阶段 B（2026-09-15）：高置信统计型 inline-row 的确定性成员装配。
 *
 * 正例：2:3660 统计行（每个成员「1 标题 + 1 数值」，x 可解析、唯一、严格递增）→ high。
 * 负例：88:32 sub-header（成员无数值配对）、标题/数值重复、x 缺失/重叠、带图片资源、非横向。
 */
import {
  assessStatRowConfidence,
  assembleStatRowMembers,
  healStatRowMemberPairing,
} from './inline-row-assembler.js';

/** 构造最小 figma 树节点 */
function node(id, name, type, x, y, children = [], extra = {}) {
  return {
    id,
    name,
    type,
    absoluteBoundingBox: { x, y, width: 10, height: 10 },
    children,
    ...extra,
  };
}
function text(id, name, x, y) {
  return node(id, name, 'TEXT', x, y);
}

/** 2:3660 真实形态：两个统计卡片，各「1 标题 + 1 数值」 */
function statRowFigma() {
  return {
    document: {
      id: 'root',
      name: 'root',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 400 },
      children: [
        node('2:3660', 'Group 2136636802', 'GROUP', 10, 196, [
          node('m1', 'm1', 'GROUP', 42.8, 196, [
            text('m1t', 't-隧道', 42.8, 196),
            text('m1d', 'd-34,620', 42.8, 210),
          ]),
          node('m2', 'm2', 'GROUP', 271.8, 196, [
            text('m2t', 't-江阴大桥', 271.8, 196),
            text('m2d', 'd-82,379', 271.8, 210),
          ]),
        ]),
      ],
    },
  };
}

function horizSection(id, ids) {
  return { id, title: id, body: { layout: 'horizontal' }, sourceNodeIds: ids, children: [] };
}

describe('assessStatRowConfidence · 高置信统计行判定与确定性装配', () => {
  test('正例 2:3660：两卡片「1标题+1数值」→ high，按 x 升序配对', () => {
    const fig = statRowFigma();
    const r = assessStatRowConfidence(
      horizSection('2:3660', ['2:3660', 'm1', 'm2']),
      fig.document,
    );
    expect(r.verdict).toBe('high');
    expect(r.members).toEqual([
      { figmaNodeId: 'm1', title: '隧道', value: '34,620', x: 42.8 },
      { figmaNodeId: 'm2', title: '江阴大桥', value: '82,379', x: 271.8 },
    ]);
  });

  test('正例：sourceNodeIds 反序（右→左）→ 仍按 x 升序输出（确定性排序）', () => {
    const fig = statRowFigma();
    const r = assessStatRowConfidence(
      horizSection('2:3660', ['2:3660', 'm2', 'm1']),
      fig.document,
    );
    expect(r.verdict).toBe('high');
    expect(r.members.map((m) => m.title)).toEqual(['隧道', '江阴大桥']);
  });

  test('正例：layoutSource=inline-row 且无 body.layout 也判横向', () => {
    const fig = statRowFigma();
    const sec = { id: '2:3660', layoutSource: 'inline-row', sourceNodeIds: ['2:3660', 'm1', 'm2'] };
    expect(assessStatRowConfidence(sec, fig.document).verdict).toBe('high');
  });

  test('负例 88:32：sub-header 成员无数值配对 → fallback(member-shape-mismatch)', () => {
    const fig = {
      document: {
        id: 'root',
        name: 'root',
        type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        children: [
          node('88:32', 'sub-header', 'FRAME', 35.83, 158.69, [
            node('h1', 'h1', 'GROUP', 42, 158, [text('h1t', 't-24小时', 42, 158)]),
            node('h2', 'h2', 'GROUP', 200, 158, [text('h2t', 't-当日总流量', 200, 158)]),
          ]),
        ],
      },
    };
    const r = assessStatRowConfidence(
      horizSection('88:32', ['88:32', 'h1', 'h2']),
      fig.document,
    );
    expect(r.verdict).toBe('fallback');
    expect(r.reason).toMatch(/member-shape-mismatch/);
  });

  test('负例：成员标题跨成员重复 → fallback(duplicate-title)', () => {
    const fig = {
      document: {
        id: 'root',
        name: 'root',
        type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        children: [
          node('s1', 's1', 'FRAME', 0, 0, [
            node('g1', 'g1', 'GROUP', 40, 0, [text('a', 't-隧道', 40, 0), text('b', 'd-1', 40, 0)]),
            node('g2', 'g2', 'GROUP', 260, 0, [text('c', 't-隧道', 260, 0), text('d', 'd-2', 260, 0)]),
          ]),
        ],
      },
    };
    const r = assessStatRowConfidence(
      horizSection('s1', ['s1', 'g1', 'g2']),
      fig.document,
    );
    expect(r.verdict).toBe('fallback');
    expect(r.reason).toBe('duplicate-title');
  });

  test('负例：成员 x 不可解析 → fallback(unresolved-x)', () => {
    const fig = {
      document: {
        id: 'root',
        name: 'root',
        type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        children: [
          node('s1', 's1', 'FRAME', 0, 0, [
            { id: 'g1', name: 'g1', type: 'GROUP', children: [text('a', 't-a', 40, 0), text('b', 'd-1', 40, 0)] }, // 无 bbox
            node('g2', 'g2', 'GROUP', 260, 0, [text('c', 't-b', 260, 0), text('d', 'd-2', 260, 0)]),
          ]),
        ],
      },
    };
    const r = assessStatRowConfidence(
      horizSection('s1', ['s1', 'g1', 'g2']),
      fig.document,
    );
    expect(r.verdict).toBe('fallback');
    expect(r.reason).toMatch(/unresolved-x/);
  });

  test('负例：成员 x 重叠（同 x）→ fallback(ambiguous-x-order)', () => {
    const fig = {
      document: {
        id: 'root',
        name: 'root',
        type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        children: [
          node('s1', 's1', 'FRAME', 0, 0, [
            node('g1', 'g1', 'GROUP', 100, 0, [text('a', 't-a', 100, 0), text('b', 'd-1', 100, 0)]),
            node('g2', 'g2', 'GROUP', 100, 0, [text('c', 't-b', 100, 0), text('d', 'd-2', 100, 0)]),
          ]),
        ],
      },
    };
    const r = assessStatRowConfidence(
      horizSection('s1', ['s1', 'g1', 'g2']),
      fig.document,
    );
    expect(r.verdict).toBe('fallback');
    expect(r.reason).toBe('ambiguous-x-order');
  });

  test('负例：成员带图片资源 → fallback(resource-owner-conflict)', () => {
    const fig = {
      document: {
        id: 'root',
        name: 'root',
        type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        children: [
          node('s1', 's1', 'FRAME', 0, 0, [
            node('g1', 'g1', 'GROUP', 40, 0, [
              node('img', 'img', 'IMAGE', 40, 0),
              text('a', 't-a', 40, 0),
              text('b', 'd-1', 40, 0),
            ]),
            node('g2', 'g2', 'GROUP', 260, 0, [text('c', 't-b', 260, 0), text('d', 'd-2', 260, 0)]),
          ]),
        ],
      },
    };
    const r = assessStatRowConfidence(
      horizSection('s1', ['s1', 'g1', 'g2']),
      fig.document,
    );
    expect(r.verdict).toBe('fallback');
    expect(r.reason).toMatch(/resource-owner-conflict/);
  });

  test('负例：非横向 section → fallback(not-horizontal)', () => {
    const fig = statRowFigma();
    const sec = { id: '2:3660', body: { layout: 'vertical' }, sourceNodeIds: ['2:3660', 'm1', 'm2'] };
    expect(assessStatRowConfidence(sec, fig.document).verdict).toBe('fallback');
  });

  test('负例：成员不足 2 → fallback(too-few-members)', () => {
    const fig = statRowFigma();
    const sec = { id: '2:3660', body: { layout: 'horizontal' }, sourceNodeIds: ['2:3660', 'm1'] };
    expect(assessStatRowConfidence(sec, fig.document).verdict).toBe('fallback');
  });

  test('无 figmaRoot / 空 section → fail-open fallback，不抛错', () => {
    expect(assessStatRowConfidence(null, null).verdict).toBe('fallback');
    expect(
      assessStatRowConfidence(horizSection('s1', ['s1', 'a', 'b']), null).verdict,
    ).toBe('fallback');
  });
});

describe('assembleStatRowMembers · 装配结果收口', () => {
  test('high → 返回配对成员数组；fallback → 返回 null（整节回退 LLM）', () => {
    const fig = statRowFigma();
    const high = assembleStatRowMembers(
      horizSection('2:3660', ['2:3660', 'm1', 'm2']),
      fig.document,
    );
    expect(high).toEqual([
      { figmaNodeId: 'm1', title: '隧道', value: '34,620', x: 42.8 },
      { figmaNodeId: 'm2', title: '江阴大桥', value: '82,379', x: 271.8 },
    ]);

    // 负例 88:32（无数值配对）→ null
    const low = assembleStatRowMembers(
      horizSection('88:32', ['88:32', 'h1', 'h2']),
      {
        document: {
          id: 'root',
          name: 'root',
          type: 'FRAME',
          absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
          children: [
            node('88:32', 'sub-header', 'FRAME', 0, 0, [
              node('h1', 'h1', 'GROUP', 42, 0, [text('h1t', 't-24小时', 42, 0)]),
              node('h2', 'h2', 'GROUP', 200, 0, [text('h2t', 't-当日总流量', 200, 0)]),
            ]),
          ],
        },
      },
    );
    expect(low).toBeNull();
  });
});

describe('healStatRowMemberPairing · 确定性统计行 DOM 配对对齐（结构层接管）', () => {
  // 真机产物（mc-1789429951534 / mc-1789431675679）：两轮都「左右反」（隧道应在左、大桥应在右）。
  // 内容驱动算法按 x 升序重排标题/数值槽位文本，修复左右反；不依赖 class 名（stat-name/stat-label 均兼容）。
  const members = [
    { title: '江阴靖江长江隧道', value: '34,620', x: 42.8 },
    { title: '江阴大桥', value: '82,379', x: 271.8 },
  ];

  test('左右反（stat-label 形态）→ 修复为按 x 升序', () => {
    const sfc = `<template>
  <div class="c-x-stat-label">江阴大桥</div>
  <div class="c-x-stat-value">82,379</div>
  <div class="c-x-stat-label">江阴靖江长江隧道</div>
  <div class="c-x-stat-value">34,620</div>
</template>`;
    const r = healStatRowMemberPairing(sfc, members);
    expect(r.changed).toBe(true);
    // 标题槽位按 x 升序：隧道在前、大桥在后
    const tunnelIdx = r.content.indexOf('江阴靖江长江隧道');
    const bridgeIdx = r.content.indexOf('江阴大桥');
    expect(tunnelIdx).toBeGreaterThan(-1);
    expect(bridgeIdx).toBeGreaterThan(-1);
    expect(tunnelIdx).toBeLessThan(bridgeIdx);
    // 数值槽位按 x 升序：34,620 在前、82,379 在后
    expect(r.content.indexOf('34,620')).toBeLessThan(r.content.indexOf('82,379'));
  });

  test('左右反 + 卡片内 class 互换 → 修复左右反，文字内容正确（class 错位为已知残留）', () => {
    const sfc = `<template>
  <div class="c-x-stat-name">江阴大桥</div>
  <div class="c-x-stat-value">82,379</div>
  <div class="c-x-stat-value">江阴靖江长江隧道</div>
  <div class="c-x-stat-name">34,620</div>
</template>`;
    const r = healStatRowMemberPairing(sfc, members);
    expect(r.changed).toBe(true);
    // 左右序修复：隧道(左) 在 大桥(右) 之前
    expect(r.content.indexOf('江阴靖江长江隧道')).toBeLessThan(r.content.indexOf('江阴大桥'));
    // 数值序修复：34,620(左) 在 82,379(右) 之前
    expect(r.content.indexOf('34,620')).toBeLessThan(r.content.indexOf('82,379'));
  });

  test('已正确配对 → no-op（changed=false，内容不变）', () => {
    const sfc = `<template>
  <div class="c-x-stat-name">江阴靖江长江隧道</div>
  <div class="c-x-stat-value">34,620</div>
  <div class="c-x-stat-name">江阴大桥</div>
  <div class="c-x-stat-value">82,379</div>
</template>`;
    const r = healStatRowMemberPairing(sfc, members);
    expect(r.changed).toBe(false);
    expect(r.content).toBe(sfc);
  });

  test('数量不匹配（缺一个标题文本）→ no-op，不误伤', () => {
    const sfc = `<template>
  <div class="c-x-stat-name">江阴大桥</div>
  <div class="c-x-stat-value">82,379</div>
  <div class="c-x-stat-value">34,620</div>
</template>`;
    const r = healStatRowMemberPairing(sfc, members);
    expect(r.changed).toBe(false);
  });

  test('文本集合不一致（出现未知文本）→ no-op，不误伤', () => {
    const sfc = `<template>
  <div class="c-x-stat-name">江阴大桥</div>
  <div class="c-x-stat-value">82,379</div>
  <div class="c-x-stat-name">未知标题</div>
  <div class="c-x-stat-value">34,620</div>
</template>`;
    const r = healStatRowMemberPairing(sfc, members);
    expect(r.changed).toBe(false);
  });

  test('无标题/数值文本 → no-op', () => {
    const sfc = `<template><div>普通内容</div></template>`;
    expect(healStatRowMemberPairing(sfc, members).changed).toBe(false);
  });

  test('空内容 / 空 members → no-op，不抛错', () => {
    expect(healStatRowMemberPairing('', members).changed).toBe(false);
    expect(healStatRowMemberPairing(null as any, members).changed).toBe(false);
    expect(healStatRowMemberPairing('<div>x</div>', []).changed).toBe(false);
  });

  test('P1-1：标题/数值含 $ 特殊字符（$&）→ 回调替换不误解释', () => {
    const moneyMembers = [
      { title: '隧道', value: '$&费', x: 10 },
      { title: '大桥', value: '$&费2', x: 20 },
    ];
    const sfc = `<template>
  <div class="c-x-stat-name">大桥</div>
  <div class="c-x-stat-value">$&费2</div>
  <div class="c-x-stat-name">隧道</div>
  <div class="c-x-stat-value">$&费</div>
</template>`;
    const r = healStatRowMemberPairing(sfc, moneyMembers);
    expect(r.changed).toBe(true);
    // $& 不被 String.replace 特殊解释成「匹配串」（否则会拼出 $&费2费 这类错值）
    expect(r.content).toContain('$&费');
    expect(r.content).toContain('$&费2');
    expect(r.content).not.toContain('$&费2费');
    // 左右序修复：隧道(左) 在 大桥(右) 前
    expect(r.content.indexOf('隧道')).toBeLessThan(r.content.indexOf('大桥'));
  });

  test('P1-2：<script> 段里的同文本 HTML 字符串不被误伤', () => {
    const sfc = `<template>
  <div class="c-x-stat-name">江阴大桥</div>
  <div class="c-x-stat-value">82,379</div>
  <div class="c-x-stat-name">江阴靖江长江隧道</div>
  <div class="c-x-stat-value">34,620</div>
</template>
<script setup>
const html = '<div>江阴大桥</div>';
</script>`;
    const r = healStatRowMemberPairing(sfc, members);
    expect(r.changed).toBe(true);
    // 只改 template 段，script 里的字符串保持不变
    expect(r.content).toContain("const html = '<div>江阴大桥</div>';");
    // template 段左右序修复
    expect(r.content.indexOf('江阴靖江长江隧道')).toBeLessThan(r.content.indexOf('江阴大桥'));
  });
});
