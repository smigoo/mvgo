/**
 * R19 · 文本 run 真值（text-runs）单测
 *
 * 契约（两形态归一）：
 *   A 形态 = 同一行两个独立 TEXT 节点 ⇒ `lines.get(容器)` 产出 1 行 2 段，按 x 排序；
 *   B 形态 = 单 TEXT 内 per-char 分段   ⇒ `byNode.get(节点)` 产出多段，相邻同样式合并。
 * 零图层名参与；无 bbox / 叠字 / 无 fill 一律不臆造。
 */
import {
  extractTextRuns,
  linesForNode,
  hasMixedRunStyles,
  clusterTextLines,
  runsOfTextNode,
} from '../text-runs.js';

const solid = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return { type: 'SOLID', visible: true, color: { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 } };
};

const text = (id: string, characters: string, opts: any = {}) => ({
  id,
  type: 'TEXT',
  characters,
  fills: opts.fills === null ? [] : [solid(opts.color || '#333333')],
  style: { fontSize: opts.fontSize ?? 14, fontWeight: opts.fontWeight ?? 400 },
  absoluteBoundingBox: { x: opts.x ?? 0, y: opts.y ?? 0, width: opts.w ?? 60, height: opts.h ?? 20 },
  ...(opts.extra || {}),
});

describe('A 形态：同一行两个独立 TEXT 节点', () => {
  it('chip 容器 `38:3141` 形态 → 1 行 2 段，按 x 升序，色各自成立', () => {
    const chip = {
      id: '38:3141',
      type: 'FRAME',
      name: 'Frame 2136639903',
      children: [
        text('38:3142', '华为技术', { x: 20, y: 8, w: 56, h: 18, color: '#333333', fontSize: 14 }),
        text('38:3143', '8台', { x: 80, y: 8, w: 24, h: 18, color: '#b9a000', fontSize: 14 }),
      ],
    };
    const r = extractTextRuns({ id: 'root', type: 'FRAME', children: [chip] });
    const ls = r.lines.get('38:3141');
    expect(ls).toHaveLength(1);
    expect(ls[0].runs.map((x: any) => x.text)).toEqual(['华为技术', '8台']);
    expect(ls[0].runs.map((x: any) => x.color)).toEqual(['rgb(51,51,51)', 'rgb(185,160,0)']);
    expect(hasMixedRunStyles(ls[0].runs)).toBe(true);
    expect(r.stats.crossNodeLines).toBe(1);
  });

  it('x 顺序决定 run 顺序（不按数组序）', () => {
    const chip = {
      id: 'c',
      type: 'FRAME',
      children: [
        text('b', '8台', { x: 80, y: 0, w: 24, color: '#b9a000' }),
        text('a', '华为技术', { x: 20, y: 0, w: 56 }),
      ],
    };
    const r = extractTextRuns({ id: 'root', type: 'FRAME', children: [chip] });
    expect(r.lines.get('c')[0].runs.map((x: any) => x.text)).toEqual(['华为技术', '8台']);
  });

  it('y 不同 → 两行（不是一行两段）', () => {
    const box = {
      id: 'k',
      type: 'FRAME',
      children: [
        text('t1', '合作厂商', { y: 0, h: 24 }),
        text('t2', '在线设备', { y: 40, h: 24 }),
      ],
    };
    const r = extractTextRuns({ id: 'root', type: 'FRAME', children: [box] });
    expect(r.lines.get('k')).toHaveLength(2);
  });

  it('叠字（x 重叠 > 50% 较窄者）→ 该行不成立（不臆造）', () => {
    const box = {
      id: 'z',
      type: 'FRAME',
      children: [
        text('t1', 'ABC', { x: 0, y: 0, w: 40, h: 20 }),
        text('t2', 'DEF', { x: 10, y: 0, w: 40, h: 20 }),
      ],
    };
    const r = extractTextRuns({ id: 'root', type: 'FRAME', children: [box] });
    expect(r.lines.get('z')).toBeUndefined();
    // 节点自身真值仍在，不丢文本
    expect(r.byNode.get('t1')[0].text).toBe('ABC');
    expect(r.byNode.get('t2')[0].text).toBe('DEF');
  });

  it('无 bbox → 不产 line（不猜顺序）', () => {
    const box = {
      id: 'n',
      type: 'FRAME',
      children: [
        { id: 'x1', type: 'TEXT', characters: 'A', fills: [solid('#111111')], style: { fontSize: 12 } },
        { id: 'x2', type: 'TEXT', characters: 'B', fills: [solid('#222222')], style: { fontSize: 12 } },
      ],
    };
    const r = extractTextRuns({ id: 'root', type: 'FRAME', children: [box] });
    expect(r.lines.get('n')).toBeUndefined();
    expect(r.byNode.size).toBe(2);
  });
});

describe('B 形态：单 TEXT 内 per-char 分段', () => {
  const perChar = () => ({
    id: '2:8443',
    type: 'TEXT',
    characters: '(2/484)',
    fills: [solid('#1990ff')],
    style: { fontSize: 16, fontWeight: 500 },
    absoluteBoundingBox: { x: 0, y: 0, width: 80, height: 20 },
    characterStyleOverrides: [1, 2, 1, 1, 1, 1, 1],
    styleOverrideTable: {
      '0': { fontSize: 16, fontWeight: 500, fills: [solid('#1990ff')] },
      '1': { fontSize: 16, fontWeight: 500, fills: [solid('#1990ff')] },
      '2': { fontSize: 18, fontWeight: 600, fills: [solid('#e03434')] },
    },
  });

  it('逐字符求样式 + 相邻同样式合并 → 3 段', () => {
    const runs = runsOfTextNode(perChar());
    expect(runs.map((r: any) => r.text)).toEqual(['(', '2', '/484)']);
    expect(runs.map((r: any) => r.color)).toEqual([
      'rgb(25,144,255)',
      'rgb(224,52,52)',
      'rgb(25,144,255)',
    ]);
    expect(runs[1].fontSize).toBe(18);
    expect(runs[1].fontWeight).toBe(600);
  });

  it('同样式文本节点 → 1 段（不产伪分段）', () => {
    const runs = runsOfTextNode(text('s', '普通文本', { color: '#333333' }));
    expect(runs).toHaveLength(1);
    expect(hasMixedRunStyles(runs)).toBe(false);
  });

  it('无 fill → color 为 null（不臆造）', () => {
    const runs = runsOfTextNode(text('s', '无填充', { fills: null }));
    expect(runs[0].color).toBeNull();
  });

  it('per-char 节点作为行成员时按段展开（A+B 混排）', () => {
    const box = {
      id: 'mix',
      type: 'FRAME',
      children: [
        text('lbl', '在线设备', { x: 0, y: 0, w: 80, color: '#333333' }),
        { ...perChar(), id: 'val', absoluteBoundingBox: { x: 88, y: 0, width: 80, height: 20 } },
      ],
    };
    const r = extractTextRuns({ id: 'root', type: 'FRAME', children: [box] });
    const runs = r.lines.get('mix')[0].runs;
    expect(runs.map((x: any) => x.text)).toEqual(['在线设备', '(', '2', '/484)']);
  });
});

describe('输入契约与统计', () => {
  it('兼容 `{ document }` wrapper（历史两次静默失效的坑）', () => {
    const doc = { id: 'root', type: 'FRAME', children: [text('t', 'X', { color: '#123456' })] };
    const a = extractTextRuns(doc);
    const b = extractTextRuns({ fileKey: 'k', nodeId: 'n', document: doc } as any);
    expect(a.stats.textNodes).toBe(1);
    expect(b.stats.textNodes).toBe(1);
    expect(b.byNode.get('t')[0].color).toBe('rgb(18,52,86)');
  });

  it('空输入 → 空表，不抛', () => {
    const r = extractTextRuns(null as any);
    expect(r.byNode.size).toBe(0);
    expect(r.lines.size).toBe(0);
  });

  it('linesForNode：容器取行，TEXT 取单行包装', () => {
    const chip = {
      id: 'c1',
      type: 'FRAME',
      children: [text('a', 'A', { x: 0 }), text('b', 'B', { x: 40, color: '#ff0000' })],
    };
    const r = extractTextRuns({ id: 'root', type: 'FRAME', children: [chip] });
    expect(linesForNode(r, 'c1')).toHaveLength(1);
    expect(linesForNode(r, 'a')[0].runs[0].text).toBe('A');
    expect(linesForNode(r, 'missing')).toEqual([]);
  });

  it('clusterTextLines：y 中心容差按较矮者 0.4 倍（14px 文本 ±5.6px 内同列）', () => {
    const mk = (id: string, y: number, x = 0) => ({
      node: { id },
      box: { x, y, w: 10, h: 14 },
      runs: [{ text: id, color: null, fontSize: 14, fontWeight: 400, nodeId: id }],
    });
    expect(clusterTextLines([mk('a', 0, 0), mk('b', 4, 20)])[0].runs).toHaveLength(2);
    expect(clusterTextLines([mk('a', 0, 0), mk('b', 30, 0)])).toHaveLength(2);
  });
});
