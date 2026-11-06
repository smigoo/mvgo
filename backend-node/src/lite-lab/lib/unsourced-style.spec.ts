/**
 * 闸④ · 无源样式检测 spec（2026-11-06）
 *
 * 判据设计原则：
 *   - `delete` 只在「查过且为空」时给出，绝不在「没采到」时给出（后者会误删真值）
 *   - 每个阳性用例都配阴性对照，防止判据过宽把有真值的样式删掉
 *
 * 真机依据：
 *   - 741c9eed `.c-equipment-monitor-stat-card`：GROUP 无 fill/stroke/圆角，
 *     子 VECTOR 承载 265×76 渐变 → 背景其实**有**真值来源，只有圆角/阴影无源。
 *   - 11a0ef5f `.c-deployment-node-overview-card`：6 个实例 fill 不一致
 *     （1×#A6CEFF + 5×#FFFFFF@43%）→ 单实例样式被泛化成全部。
 */

import {
  collectNodeStyleTruth,
  detectUnsourcedStyles,
  isAutoApplicable,
  countAutoApplicable,
} from './unsourced-style';
import type { E2nMap } from './e2n-map';

// ───────────────────────── 构造助手 ─────────────────────────

const solid = (r: number, g: number, b: number, a = 1, visible = true) => ({
  type: 'SOLID', visible, blendMode: 'NORMAL', color: { r, g, b, a },
});
const gradient = () => ({
  type: 'GRADIENT_LINEAR',
  gradientHandlePositions: [{ x: 0.5, y: 0 }, { x: 0.5, y: 1 }, { x: 0, y: 0 }],
  gradientStops: [
    { color: { r: 0.831, g: 0.890, b: 0.996, a: 1 }, position: 0 },
    { color: { r: 0, g: 0.517, b: 1, a: 1 }, position: 0.5 },
  ],
});
const bb = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

/** 极简 E2N：只填本闸消费的 nodes / prodNodes */
function makeE2n(edges: Array<{ figmaId: string; classes: string[] }>): E2nMap {
  return {
    seeds: [],
    nodes: edges.map((e) => ({
      figmaId: e.figmaId,
      figmaType: 'GROUP',
      figmaName: `node-${e.figmaId}`,
      prodKey: 'k',
      prodPath: 'div',
      classes: e.classes,
      how: 'vvt-unit' as never,
      matched: 1,
      instCount: 1,
      unique: true,
    })),
    multi: [],
    unmapped: [],
    prodNodes: edges.flatMap((e) =>
      e.classes.map((c) => ({
        key: `k-${c}`, path: 'div', tag: 'div', classes: [c], start: 0, end: 4,
        ownStatic: [], ownInterp: [], ownInterpSingle: [], renderTexts: [], instanceTexts: [],
        vforCount: 1, instTextNodes: 0,
      })),
    ),
    stats: {
      prodNodes: edges.length, figmaTexts: 0, seeds: 0, ambiguousSeeds: 0, partialSeeds: 0,
      missSeeds: 0, nodes: edges.length, multi: 0, depthResolved: 0, figmaContainers: edges.length,
    },
  };
}

// 模板里带上 class，让「产物真实类名白名单」有内容（与真机 SFC 一致）
const style = (body: string) => [
  {
    path: 'package/index.vue',
    content: `<template><div class="card unmapped-card"></div></template>\n<style lang="less">\n${body}\n</style>`,
  },
];

// ───────────────────────── 用例 ─────────────────────────

describe('collectNodeStyleTruth · 真值采集（含形状层下钻）', () => {
  it('GROUP 自身无 fill，但子 RECTANGLE 覆盖父容器 ⇒ hasFill=true（否则会把所有卡片误判成臆造）', () => {
    const root = {
      id: 'root', type: 'FRAME', absoluteBoundingBox: bb(0, 0, 470, 72),
      children: [{
        id: 'card', type: 'GROUP', name: 'card', absoluteBoundingBox: bb(0, 0, 470, 72),
        fills: [],
        children: [{
          id: 'bg-rect', type: 'RECTANGLE', absoluteBoundingBox: bb(0, 0, 470, 72),
          fills: [solid(0.651, 0.807, 1)], cornerRadius: 6, strokes: [],
        }],
      }],
    };
    const t = collectNodeStyleTruth(root, 'card');
    expect(t?.hasFill).toBe(true);
    expect(t?.cornerRadius).toBe(6);
    expect(t?.sourceNodeId).toBe('bg-rect');
    expect(t?.hasStroke).toBe(false);
  });

  it('fill 全 visible:false ⇒ hasFill=false（741c9eed 三个 dot 的 FRAME 形态）', () => {
    const root = {
      id: 'root', type: 'FRAME',
      children: [{
        id: 'n1', type: 'FRAME', name: 'icon-战略厂商', absoluteBoundingBox: bb(0, 0, 16, 16),
        fills: [solid(1, 1, 1, 1, false)], children: [],
      }],
    };
    expect(collectNodeStyleTruth(root, 'n1')?.hasFill).toBe(false);
  });

  it('形状层尺寸不匹配父容器 ⇒ 不下钻（避免把图标内部形状当背景）', () => {
    const root = {
      id: 'root', type: 'FRAME',
      children: [{
        id: 'n1', type: 'GROUP', absoluteBoundingBox: bb(0, 0, 200, 200), fills: [],
        children: [{
          id: 'icon-ish', type: 'VECTOR', absoluteBoundingBox: bb(90, 90, 16, 16), fills: [solid(1, 0, 0)],
        }],
      }],
    };
    expect(collectNodeStyleTruth(root, 'n1')?.hasFill).toBe(false);
  });

  it('细长填充形状 ⇒ hasRuleShape=true（LLM 用 border 表达 Figma 线条，不该判臆造）', () => {
    const root = {
      id: 'root', type: 'FRAME',
      children: [{
        id: 'header', type: 'GROUP', absoluteBoundingBox: bb(0, 0, 470, 30), fills: [],
        children: [{
          id: 'rule', type: 'VECTOR', absoluteBoundingBox: bb(0, 28, 452, 2), fills: [gradient()],
        }],
      }],
    };
    const t = collectNodeStyleTruth(root, 'header');
    expect(t?.hasRuleShape).toBe(true);
    expect(t?.hasStroke).toBe(false);
  });
});

describe('detectUnsourcedStyles · 判定', () => {
  const figmaRoot = {
    id: 'root', type: 'FRAME',
    children: [{
      id: 'card', type: 'GROUP', name: 'card', absoluteBoundingBox: bb(0, 0, 470, 72), fills: [],
      children: [{
        id: 'card-bg', type: 'RECTANGLE', absoluteBoundingBox: bb(0, 0, 470, 72),
        fills: [solid(0.651, 0.807, 1)], cornerRadius: 6, strokes: [], effects: [],
      }],
    }],
  };
  const e2n = makeE2n([{ figmaId: 'card', classes: ['card'] }]);

  it('阳性：box-shadow 无对应 effect ⇒ delete', () => {
    const r = detectUnsourcedStyles({
      figmaRoot, e2n,
      prodFiles: style('.card { box-shadow: 0 1px 3px rgba(0,0,0,.08); }'),
    });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ prop: 'box-shadow', verdict: 'delete' });
    expect(r.findings[0].evidence).toContain('DROP_SHADOW');
  });

  it('阳性：cornerRadius 6 而产物 8px ⇒ override', () => {
    const r = detectUnsourcedStyles({
      figmaRoot, e2n,
      prodFiles: style('.card { border-radius: 8px; }'),
    });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ prop: 'border-radius', verdict: 'override' });
    expect(r.findings[0].evidence).toContain('cornerRadius=6px');
  });

  it('阴性：圆角与真值一致 ⇒ 不报', () => {
    const r = detectUnsourcedStyles({ figmaRoot, e2n, prodFiles: style('.card { border-radius: 6px; }') });
    expect(r.findings).toHaveLength(0);
  });

  it('阳性：strokes 为空且无细长形状 ⇒ border delete', () => {
    const r = detectUnsourcedStyles({
      figmaRoot, e2n,
      prodFiles: style('.card { border: 1px solid rgba(255,255,255,.8); }'),
    });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ prop: 'border', verdict: 'delete' });
  });

  it('阴性：背景已交给 bg 通道（url / var / 渐变）⇒ 不参与本闸', () => {
    for (const v of ['url(../images/bg.png)', 'var(--bg)', 'linear-gradient(#fff, #eee)', 'transparent']) {
      const r = detectUnsourcedStyles({ figmaRoot, e2n, prodFiles: style(`.card { background: ${v}; }`) });
      expect(r.findings).toHaveLength(0);
    }
  });

  it('阳性：多实例 fill 不一致 ⇒ fanout（11a0ef5f 单实例样式被泛化）', () => {
    const root = {
      id: 'root', type: 'FRAME',
      children: [
        { id: 'c1', type: 'GROUP', absoluteBoundingBox: bb(0, 0, 470, 72), fills: [], children: [
          { id: 'c1-bg', type: 'RECTANGLE', absoluteBoundingBox: bb(0, 0, 470, 72), fills: [solid(0.651, 0.807, 1)] },
        ] },
        { id: 'c2', type: 'GROUP', absoluteBoundingBox: bb(0, 80, 470, 72), fills: [], children: [
          { id: 'c2-bg', type: 'RECTANGLE', absoluteBoundingBox: bb(0, 80, 470, 72), fills: [solid(1, 1, 1, 0.43)] },
        ] },
      ],
    };
    const r = detectUnsourcedStyles({
      figmaRoot: root,
      e2n: makeE2n([
        { figmaId: 'c1', classes: ['card'] },
        { figmaId: 'c2', classes: ['card'] },
      ]),
      prodFiles: style('.card { background: #a6ceff; }'),
    });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ prop: 'background', verdict: 'fanout' });
    expect(r.findings[0].evidence).toContain('fill 不一致');
  });

  it('阴性：多实例 fill 一致 ⇒ 不报 fanout', () => {
    const root = {
      id: 'root', type: 'FRAME',
      children: ['c1', 'c2'].map((id, i) => ({
        id, type: 'GROUP', absoluteBoundingBox: bb(0, i * 80, 470, 72), fills: [],
        children: [{ id: `${id}-bg`, type: 'RECTANGLE', absoluteBoundingBox: bb(0, i * 80, 470, 72), fills: [solid(1, 1, 1, 0.43)] }],
      })),
    };
    const r = detectUnsourcedStyles({
      figmaRoot: root,
      e2n: makeE2n([{ figmaId: 'c1', classes: ['card'] }, { figmaId: 'c2', classes: ['card'] }]),
      prodFiles: style('.card { background: rgba(255,255,255,.43); }'),
    });
    expect(r.findings).toHaveLength(0);
  });

  it('同一 class 多个 figmaId 时取「面积最大的容器」而非第一条（否则查到内层内容组，真值全空）', () => {
    const root = {
      id: 'root', type: 'FRAME',
      children: [{
        id: 'card', type: 'GROUP', absoluteBoundingBox: bb(0, 0, 470, 72), fills: [],
        children: [
          // 内层内容组：无 fill，先出现在 e2n 里
          {
            id: 'inner', type: 'GROUP', absoluteBoundingBox: bb(10, 10, 430, 41), fills: [],
            children: [{ id: 'inner-bg', type: 'RECTANGLE', absoluteBoundingBox: bb(10, 10, 430, 41), fills: [solid(1, 1, 1)] }],
          },
          { id: 'card-bg', type: 'RECTANGLE', absoluteBoundingBox: bb(0, 0, 470, 72), fills: [solid(0.651, 0.807, 1)], cornerRadius: 6 },
        ],
      }],
    };
    const r = detectUnsourcedStyles({
      figmaRoot: root,
      e2n: makeE2n([
        { figmaId: 'inner', classes: ['card'] },
        { figmaId: 'card', classes: ['card'] },
      ]),
      prodFiles: style('.card { border-radius: 8px; }'),
    });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].figmaId).toBe('card');
    expect(r.findings[0].evidence).toContain('cornerRadius=6px');
  });

  it('盲区可见：无 e2n 映射的类名进 unmappedRiskClasses（防 findings=0 被误读成「干净」）', () => {
    const r = detectUnsourcedStyles({
      figmaRoot, e2n,
      prodFiles: style('.card { border-radius: 6px; }\n.unmapped-card { box-shadow: 0 1px 2px #000; }'),
    });
    expect(r.findings).toHaveLength(0);
    expect(r.stats.unmappedRiskClasses).toContain('unmapped-card');
    expect(r.stats.unmappedRiskClasses).not.toContain('card');
  });

  it('无 e2n 映射时直接返回空（不崩、不产生假阳性）', () => {
    const r = detectUnsourcedStyles({ figmaRoot, prodFiles: style('.card { border-radius: 8px; }') });
    expect(r.findings).toHaveLength(0);
    expect(r.stats.classesScanned).toBe(0);
  });

  it('统计按属性/按判定分桶正确', () => {
    const r = detectUnsourcedStyles({
      figmaRoot, e2n,
      prodFiles: style('.card { border-radius: 8px; box-shadow: 0 1px 2px #000; }'),
    });
    expect(r.stats.findings).toBe(2);
    expect(r.stats.override).toBe(1);
    expect(r.stats.delete).toBe(1);
    expect(r.stats.byProp['border-radius']).toBe(1);
    expect(r.stats.byProp['box-shadow']).toBe(1);
  });
});

/**
 * 闸③ 的前置：finding 必须自带**可定位**与**可写值**。
 * 这三组字段缺任何一组，落地就只能靠「重新解析一遍再猜」，那是另一套判据（双源必分叉）。
 */
describe('闸③ 前置：finding 的定位信息与真值', () => {
  const figmaRoot = {
    id: 'root', type: 'FRAME',
    children: [{
      id: 'card', type: 'GROUP', name: 'card', absoluteBoundingBox: bb(0, 0, 470, 72), fills: [],
      children: [{
        id: 'card-bg', type: 'RECTANGLE', absoluteBoundingBox: bb(0, 0, 470, 72),
        fills: [solid(0.651, 0.807, 1)], cornerRadius: 6, strokes: [], effects: [],
      }],
    }],
  };
  const e2n = makeE2n([{ figmaId: 'card', classes: ['card'] }]);

  it('rawProp 保留长手属性名（不被压平成 border）', () => {
    const r = detectUnsourcedStyles({
      figmaRoot, e2n,
      prodFiles: style('.card { border-bottom: 1px solid #fff; }'),
    });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].prop).toBe('border');
    expect(r.findings[0].rawProp).toBe('border-bottom');
  });

  it('偏移自证：decl 切片含原声明+分号，value 切片恰为原值', () => {
    const files = style('.card { border-radius: 8px; }');
    const f = detectUnsourcedStyles({ figmaRoot, e2n, prodFiles: files }).findings[0];
    const c = files[0].content;
    expect(c.slice(f.declStart, f.declEnd)).toContain('border-radius: 8px;');
    expect(c.slice(f.valueStart, f.valueEnd)).toBe('8px');
  });

  it('同规则多声明：各条偏移互不重叠，且都能切回原文', () => {
    const files = style('.card { border-radius: 8px; box-shadow: 0 1px 2px #000; }');
    const fs = detectUnsourcedStyles({ figmaRoot, e2n, prodFiles: files }).findings;
    const c = files[0].content;
    expect(fs).toHaveLength(2);
    for (const f of fs) {
      expect(c.slice(f.declStart, f.declEnd)).toContain(f.rawProp);
      expect(c.slice(f.valueStart, f.valueEnd)).toBe(f.value);
    }
    const [a, b] = fs.slice().sort((x, y) => x.declStart - y.declStart);
    expect(a.declEnd).toBeLessThanOrEqual(b.declStart);
  });

  it('换行声明：declStart 吃掉前导换行（删完不留空行）', () => {
    const files = style('.card {\n  width: 100%;\n  box-shadow: 0 1px 2px #000;\n  height: 40px;\n}');
    const f = detectUnsourcedStyles({ figmaRoot, e2n, prodFiles: files }).findings[0];
    const c = files[0].content;
    // declStart 指向前导换行本身 ⇒ 删除后不会留下一行空白
    expect(c[f.declStart]).toBe('\n');
    expect(c.slice(f.declStart, f.declEnd)).toBe('\n  box-shadow: 0 1px 2px #000;');
  });

  it('override 携带 CSS 可写真值 truthValue', () => {
    const f = detectUnsourcedStyles({
      figmaRoot, e2n,
      prodFiles: style('.card { border-radius: 8px; }'),
    }).findings[0];
    expect(f.verdict).toBe('override');
    expect(f.truthValue).toBe('6px');
  });

  it('delete 不携带 truthValue（「无真值」就是没有可写值，不能编一个 0）', () => {
    const f = detectUnsourcedStyles({
      figmaRoot, e2n,
      prodFiles: style('.card { box-shadow: 0 1px 2px #000; }'),
    }).findings[0];
    expect(f.verdict).toBe('delete');
    expect(f.truthValue).toBeUndefined();
  });

  it('isAutoApplicable 判据矩阵（单一来源，apply 与收敛断言共用）', () => {
    const base = {
      file: 'a.vue', selector: '.x', cls: 'x', figmaId: '1', figmaName: 'n',
      rawProp: 'p', value: 'v', evidence: 'e',
      bodyStart: 0, bodyEnd: 10, declStart: 0, declEnd: 5, valueStart: 2, valueEnd: 3,
    } as const;

    // 只落地两类
    expect(isAutoApplicable({ ...base, prop: 'box-shadow', verdict: 'delete' } as never)).toBe(true);
    expect(
      isAutoApplicable({ ...base, prop: 'border-radius', verdict: 'override', truthValue: '6px' } as never),
    ).toBe(true);

    // fanout 永不落地
    expect(isAutoApplicable({ ...base, prop: 'box-shadow', verdict: 'fanout' } as never)).toBe(false);
    // 背景/边框删除不落地
    expect(isAutoApplicable({ ...base, prop: 'background', verdict: 'delete' } as never)).toBe(false);
    expect(isAutoApplicable({ ...base, prop: 'border', verdict: 'delete' } as never)).toBe(false);
    // override 无真值不落地
    expect(isAutoApplicable({ ...base, prop: 'border-radius', verdict: 'override' } as never)).toBe(false);

    expect(
      countAutoApplicable([
        { ...base, prop: 'box-shadow', verdict: 'delete' } as never,
        { ...base, prop: 'background', verdict: 'delete' } as never,
      ]),
    ).toBe(1);
  });
});
