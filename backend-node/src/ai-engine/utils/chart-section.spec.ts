import fs from 'node:fs';
import path from 'node:path';
import {
  detectChartSignal,
  injectChartSectionIfMissing,
} from './chart-section.js';
import { collectLeafSections } from './section-tree.js';

/**
 * 图表 section 兜底注入（2026-09-16 扩展，c-d7334a-d7334a67 实锤）。
 * 验证「vision 顶层 charts[] 有真值但 Figma 节点无 @echarts 标记」时也能触发注入。
 */

describe('detectChartSignal：charts[] 真值也作为信号（2026-09-16 扩展）', () => {
  it('charts[] 有真值 → true（无需 @echarts 标记）', () => {
    expect(detectChartSignal({ charts: [{ type: 'doughnut', series: ['A', 'B'] }] })).toBe(true);
  });
  it('figmaNodeData 有 @echarts 标记 → true（原信号）', () => {
    const figmaNodeData = { name: 'root', children: [{ name: '@echarts/pie', id: '1:1' }] };
    expect(detectChartSignal({ figmaNodeData })).toBe(true);
  });
  it('两者皆空 → false', () => {
    expect(detectChartSignal({})).toBe(false);
    expect(detectChartSignal({ charts: [], figmaNodeData: { name: 'root', children: [] } })).toBe(false);
  });
});

describe('injectChartSectionIfMissing：G07 视觉真值单一来源（2026-11-14 契约变更）', () => {
  const doughnutTruth = [
    {
      section: '2:200',
      type: 'doughnut',
      series: ['交通事故', '车辆故障', '施工养护', '恶劣天气'],
      legend: [],
      seriesColors: ['#ff6262', '#f8bd1f', '#06acd3', '#13cad1'],
    },
  ];

  // 🛡️ G02 决策 2（sectionUnresolved 绝对禁令）：视觉 charts[] 已声明图表时，
  // 下游**零注入、零重新解释**。原 ② 分支（造 chart-truth-* 根级重复段）会造成
  // 双渲染 + 假绿，12:34 失败件实锤：4 个 chartSpec=null 的 chart-component
  // 直接触发 microcode-engineer.js:1740 的 `cs is not defined`。
  it('[旧契约已废] charts 有真值 → 零注入，且真值原样保留（不再造根级重复段）', () => {
    const plan = { effectiveSections: [{ id: 's1', type: 'header' }], isForced: false };
    const out = injectChartSectionIfMissing(plan, true, { charts: doughnutTruth });
    expect(out).toBe(plan);
    expect(out.effectiveSections.find((s) => s.type === 'chart')).toBeFalsy();
    expect(out.effectiveSections).toHaveLength(1);
  });

  it('已有 chart section 时不重复注入（视觉真值存在 → 早返回，与措辞判据无关）', () => {
    const plan = {
      effectiveSections: [
        { id: 's1', type: 'header' },
        { id: 'chart-1', type: 'chart', chartType: 'pie' },
      ],
      isForced: false,
    };
    const out = injectChartSectionIfMissing(plan, true, { charts: doughnutTruth });
    expect(out).toBe(plan);
  });

  it('chartSignal=false 时不注入', () => {
    const plan = { effectiveSections: [{ id: 's1', type: 'header' }] };
    const out = injectChartSectionIfMissing(plan, false, { charts: doughnutTruth });
    expect(out).toBe(plan);
  });

  // 🛡️ 缓存命中路径 P0 防线：视觉诊断族存在「顶层空、layoutStructure 内层为真」形态，
  // 只读顶层 charts 会误判真值缺失 → Figma 兜底复活 → 臆造图表复发。
  it('顶层 charts 为空但 layoutStructure.charts 有真值 → 仍零注入', () => {
    const plan = { effectiveSections: [{ id: 's1', type: 'header' }], isForced: false };
    const out = injectChartSectionIfMissing(plan, true, {
      charts: [], layoutStructure: { charts: doughnutTruth },
    });
    expect(out).toBe(plan);
  });

  it('视觉真值存在时，即使 Figma 有 5 个 @echarts 节点也零注入（阳性对照：不是恒返回）', () => {
    const figmaNodeData = {
      name: 'root',
      children: [0, 1, 2, 3, 4].map((i) => ({
        name: '@echarts/pie', id: `9:${i}`, absoluteBoundingBox: { y: i * 100, height: 90 },
      })),
    };
    const plan = { effectiveSections: [{ id: 's1', type: 'header' }], isForced: false };
    const out = injectChartSectionIfMissing(plan, true, {
      charts: doughnutTruth, figmaNodeData, allowFigmaFallback: true,
    });
    expect(out).toBe(plan);
  });

  // 真错仍 FAIL：视觉真值**完全缺失**时 Figma 兜底必须仍工作，且带 source 记账。
  it('@echarts 标记节点兜底仍生效（视觉真值缺失，原逻辑不回退）', () => {
    const figmaNodeData = {
      name: 'root',
      children: [{ name: '@echarts/pie', id: '1:9', absoluteBoundingBox: { y: 10, height: 200 } }],
    };
    const plan = { effectiveSections: [{ id: 's1', type: 'header' }], isForced: false };
    const out = injectChartSectionIfMissing(plan, true, { figmaNodeData, charts: [] });
    const chart = out.effectiveSections.find((s) => s.type === 'chart');
    expect(chart).toBeTruthy();
    expect(chart.sourceNodeIds).toEqual(['1:9']);
    expect(chart.source).toBe('figma-fallback');
  });

  it('视觉真值缺失 + 显式关闭 fallback → 零注入且不抛（真错不漏检）', () => {
    const figmaNodeData = {
      name: 'root',
      children: [{ name: '@echarts/pie', id: '1:9', absoluteBoundingBox: { y: 10, height: 200 } }],
    };
    const plan = { effectiveSections: [{ id: 's1', type: 'header' }], isForced: false };
    const out = injectChartSectionIfMissing(plan, true, {
      figmaNodeData, charts: [], allowFigmaFallback: false,
    });
    expect(out).toBe(plan);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 🛡️ 消重（2026-09-26 · mc-max-1790430725365-1652d1b7 / mc-max-1790420477334 实锤）
// @echarts 节点已以「同 id 的容器 section」存在于树中 → 必须**就地替换**，
// 否则同一图表区被产成两个 echarts 组件（2 个图表），且注入项被追加到根 → tabs 比例被压扁。
// ══════════════════════════════════════════════════════════════════════════
describe('injectChartSectionIfMissing：@echarts 节点已存在于树中 → 就地替换（消重）', () => {
  // 真机树形（env-monitor，node 2:7879）：89:41 > [89:42(tabs 条), 2:7898(@echarts/line > 2:7899)]
  const envFigma = () => ({
    name: 'root', id: '2:7879',
    children: [
      {
        name: 'con', id: '89:41', absoluteBoundingBox: { x: 0, y: 880, width: 400, height: 145 },
        children: [
          {
            name: 'sub-t', id: '89:42', absoluteBoundingBox: { x: 0, y: 898, width: 400, height: 32 },
            children: [{ name: 'tabs-icon', id: '89:43', absoluteBoundingBox: { x: 0, y: 898, width: 40, height: 32 }, children: [] }],
          },
          {
            name: '@echarts/line', id: '2:7898', absoluteBoundingBox: { x: 0, y: 930, width: 400, height: 113 },
            children: [{ name: 'Group 2136637691', id: '2:7899', absoluteBoundingBox: { x: 0, y: 930, width: 400, height: 113 }, children: [] }],
          },
        ],
      },
    ],
  })

  const envPlan = () => ({
    isForced: true,
    effectiveSections: [
      {
        id: '89:41', type: 'container', isLayoutContainer: true, layout: 'vertical',
        title: 'con', sourceNodeIds: [],
        children: [
          {
            id: '89:42', type: 'container', isLayoutContainer: true, layout: 'horizontal',
            title: 'sub-t', sourceNodeIds: [],
            children: [{ id: '89:43', type: 'tabs', title: 'tabs-icon', elementCount: 8, sourceNodeIds: ['89:43'] }],
          },
          {
            id: '2:7898', type: 'container', isLayoutContainer: true, layout: 'horizontal',
            title: '@echarts/line', sourceNodeIds: [],
            children: [{ id: '2:7899', type: 'undefined', title: 'Group 2136637691', elementCount: 35, sourceNodeIds: ['2:7899'] }],
          },
        ],
      },
    ],
  })

  it('同 id 容器存在 → 就地替换（唯一的 chart leaf 落在 89:41 内、89:42 之后），不追加到根', () => {
    const plan = envPlan()
    const out = injectChartSectionIfMissing(plan, true, { figmaNodeData: envFigma() })

    const charts = collectLeafSections(out.effectiveSections).filter((s) => s.type === 'chart')
    expect(charts).toHaveLength(1)
    expect(charts[0].id).toBe('chart-2:7898')

    // 位置：仍在 89:41 内，且排在 89:42（tabs 条）之后 → tabs 在前，比例 32:113 不失真
    const root89 = out.effectiveSections[0]
    expect(root89.id).toBe('89:41')
    expect(root89.children.map((c) => c.id)).toEqual(['89:42', 'chart-2:7898'])
    // 被替换掉的通用叶子不再存在（否则会产出第二个 echarts 组件）
    expect(collectLeafSections(out.effectiveSections).some((s) => s.id === '2:7899')).toBe(false)
    // 原计划对象未被污染
    expect(plan.effectiveSections[0].children).toHaveLength(2)
  })

  it('@echarts 节点不在树中（vision 真造）→ 维持旧的根级追加（零回归）', () => {
    const plan = { effectiveSections: [{ id: 's1', type: 'header' }], isForced: false }
    const out = injectChartSectionIfMissing(plan, true, {
      figmaNodeData: { name: 'root', children: [{ name: '@echarts/pie', id: '9:9', children: [] }] },
    })
    expect(out.effectiveSections.map((s) => s.id)).toEqual(['s1', 'chart-9:9'])
  })
})

// ──────────────────────────────────────────────────────────────────────────
// 🛡️ 宿主语义守卫（2026-09-26 · 全语料审计结论固化）
// @echarts 分支 68 例撞 id 的宿主 100% 是图表容器 → 就地替换安全；
// 但 chartsTruth 分支的 sourceNodeIds[0] 来自 vision 复用的 c.section（不唯一），
// 若撞上真实**非图表** section，无校验的替换会连带删掉其子树 → 必须守卫。
// ──────────────────────────────────────────────────────────────────────────
describe('injectChartSectionIfMissing：宿主语义守卫（防误删真实内容）', () => {
  it('宿主 id 撞车但语义非图表 → 不替换，改为根级追加，原子树不丢', () => {
    const plan = {
      isForced: false,
      effectiveSections: [
        {
          id: '426:807', type: 'container', isLayoutContainer: true, layout: 'vertical',
          title: 'con', sourceNodeIds: [],
          children: [{ id: 'x1', type: 'stats', title: '统计数据', elementCount: 3, sourceNodeIds: ['x1'] }],
        },
      ],
    };
    // vision 复用了同一个 id（真机形态：同节点可承载多个不同图表）
    const figma = { name: 'root', children: [{ name: '@echarts/line', id: '426:807', children: [] }] };
    const out = injectChartSectionIfMissing(plan, true, { figmaNodeData: figma, charts: [] });
    expect(out.effectiveSections.map((s) => s.id)).toEqual(['426:807', 'chart-426:807']);
    // 原容器及其子树完好
    expect(collectLeafSections(out.effectiveSections).some((s) => s.id === 'x1')).toBe(true);
  });

  it('宿主语义是图表 → 仍就地替换（审计已证 68/68 安全，行为不回退）', () => {
    const plan = {
      isForced: false,
      effectiveSections: [
        {
          id: '2:7898', type: 'container', isLayoutContainer: true, layout: 'horizontal',
          title: '@echarts/line', sourceNodeIds: [],
          children: [{ id: '2:7899', type: 'content', title: 'Group', elementCount: 35, sourceNodeIds: ['2:7899'] }],
        },
      ],
    };
    const figma = { name: 'root', children: [{ name: '@echarts/line', id: '2:7898', children: [] }] };
    const out = injectChartSectionIfMissing(plan, true, { figmaNodeData: figma, charts: [] });
    expect(out.effectiveSections.map((s) => s.id)).toEqual(['chart-2:7898']);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 🛡️ 步骤 1/2（2026-11-15 · mc-max-1794752955560-c0cb00f1 实锤）：**早返回 ⇒ 逐条判据**接线。
// 断点：`if (truthDecision.source !== 'figma-fallback') return plan` 把「视觉侧有没有真值」
//   当成**整条 Figma 通道**的开关 ⇒ 本单视觉 3 条 chart 就把 `2:3604 @echarts/line-7`
//   （流量预测折线）整段吞掉。接线后改为逐条 `needsInjection` 过滤（本文件上方代码）。
// 本节用**四支真实 checkpoint 夹具**（`__fixtures__/chart-truth/*`，与
//   `chart-truth-coverage.spec.ts` 同源）做阴阳对照，验证接线后行为逐条符合：
//   - 必红（`c0cb00f1` / `0fd2168a`）：恰好注入 1 个 `chart-2:3604`（`chartType='line'`），
//     不重复注入、走 `mode='per-node'` 口径；
//   - 必绿（`3cacdefb` / `9b2ecb41`）：逐条 0 命中 ⇒ `out===plan` 零注入（阳性对照，
//     证明不是「恒注入」）。
// 另附「视觉真值缺失 ⇒ 旧口径不回退」的镜像断言（与上方 line 92 呼应，此处直接以
//   `charts: []` + 真实夹具作对照，确保 `source==='figma-fallback'` 仍走全量兜底）。
// ══════════════════════════════════════════════════════════════════════════
describe('injectChartSectionIfMissing：视觉源逐条判据接线（2026-11-15 步骤 2）', () => {
  const FIXTURE_ROOT = path.join(__dirname, '__fixtures__', 'chart-truth');

  const loadCase = (name: string) => {
    const dir = path.join(FIXTURE_ROOT, name);
    const read = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    return {
      figmaRoot: read('figma.json'),
      sections: read('plan.json'),
      charts: read('vision-charts.json'),
    };
  };

  // 深搜产物里 id 命中（注入段可能落根尾、也可能挂宿主 internalSubcomponents / body.children）
  const findDeep = (node: unknown, id: string): any => {
    if (!node || typeof node !== 'object') return null;
    const rec = node as Record<string, any>;
    if (String(rec.id) === id) return rec;
    for (const key of Object.keys(rec)) {
      const v = rec[key];
      if (Array.isArray(v)) {
        for (const item of v) {
          const hit = findDeep(item, id);
          if (hit) return hit;
        }
      }
    }
    return null;
  };

  // 统计产物里 `chart-*` 形态注入段数量（防「重复注入 / 双渲染」）
  const countInjected = (node: unknown): number => {
    if (!node || typeof node !== 'object') return 0;
    const rec = node as Record<string, any>;
    let n = typeof rec.id === 'string' && /^chart-/.test(rec.id) ? 1 : 0;
    for (const key of Object.keys(rec)) {
      const v = rec[key];
      if (Array.isArray(v)) for (const item of v) n += countInjected(item);
    }
    return n;
  };

  const run = (name: string, chartsOverride?: any[]) => {
    const c = loadCase(name);
    const plan: any = { isForced: false, effectiveSections: c.sections };
    const logs: Array<[string, any]> = [];
    const out = injectChartSectionIfMissing(plan, true, {
      figmaNodeData: c.figmaRoot,
      charts: chartsOverride ?? c.charts,
      layoutStructure: null,
      allowFigmaFallback: true,
      logger: { info: (m: string, o: any) => logs.push([m, o]) },
    });
    return { plan, out, logs };
  };

  // ---- 必红：逐条判据精确定位并注入 `chart-2:3604` ----
  for (const name of ['c0cb00f1', '0fd2168a']) {
    it(`${name}（必红）→ 只注入 1 个 chart-2:3604（line），走 per-node 口径`, () => {
      const { plan, out, logs } = run(name);
      expect(out).not.toBe(plan); // 不再是早返回的「恒 plan」
      const injected = findDeep(out, 'chart-2:3604');
      expect(injected).toBeTruthy();
      expect(injected.chartType).toBe('line');
      expect(injected.sourceNodeIds).toEqual(['2:3604']);
      expect(countInjected(out)).toBe(1); // 不重复注入 / 无双渲染

      // 计数行恒打 + 走逐条口径（真机可观测可复算）
      const cov = logs.find(([m]) => m.includes('逐条覆盖'));
      expect(cov).toBeTruthy();
      expect(cov![1].mode).toBe('per-node');
      expect(cov![1].needsInjection).toBe(1);
      expect(cov![1].truthNodes).toBeGreaterThan(0);
    });
  }

  // ---- 必绿：逐条 0 命中 ⇒ 零注入（阳性对照：不是恒注入）----
  for (const name of ['3cacdefb', '9b2ecb41']) {
    it(`${name}（必绿）→ 逐条 0 命中，out===plan 零注入`, () => {
      const { plan, out, logs } = run(name);
      expect(out).toBe(plan);
      expect(countInjected(out)).toBe(0);
      const cov = logs.find(([m]) => m.includes('逐条覆盖'));
      expect(cov).toBeTruthy();
      expect(cov![1].mode).toBe('per-node');
      expect(cov![1].needsInjection).toBe(0);
      expect(cov![1].carried).toBeGreaterThan(0); // 真值节点确实存在、只是已承载
    });
  }

  // ---- 镜像：视觉真值缺失 ⇒ source='figma-fallback' ⇒ 仍走旧全量兜底（零回归红线）----
  it("视觉真值清空（charts:[]）⇒ 旧口径不回退：@echarts 真值节点仍被兜底并记账", () => {
    const { out, logs } = run('c0cb00f1', []);
    const cov = logs.find(([m]) => m.includes('逐条覆盖'));
    expect(cov![1].mode).toBe('legacy-all-uncovered'); // 走旧路，不进逐条判据
    expect(cov![1].truthNodes).toBe(0); // 视觉源关闭时逐条覆盖不参与
    // 兜底产物必须带 source='figma-fallback' 记账（禁止与视觉真值混淆）
    const firstInjected = (() => {
      const walk = (n: unknown): any => {
        if (!n || typeof n !== 'object') return null;
        const r = n as Record<string, any>;
        if (typeof r.id === 'string' && /^chart-/.test(r.id)) return r;
        for (const k of Object.keys(r)) {
          const v = r[k];
          if (Array.isArray(v)) for (const it of v) { const h = walk(it); if (h) return h; }
        }
        return null;
      };
      return walk(out);
    })();
    expect(firstInjected).toBeTruthy();
    expect(firstInjected.source).toBe('figma-fallback');
  });
});
