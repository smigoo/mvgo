import fs from 'node:fs';
import path from 'node:path';
import {
  CHART_TRUTH_COVERAGE_VERSION,
  buildChartTruthTree,
  chartTruthCoverageCounts,
  collectAllSections,
  collectEchartsTruthNodes,
  collectSectionContentTrack,
  collectTerminalSections,
  isChartCarried,
  resolveChartAnchor,
  resolveChartHost,
  resolveChartTruthCoverage,
  sectionTruthRef,
  visionCorroboratesHost,
} from './chart-truth-coverage.js';

/**
 * 图表真值**逐条**覆盖判定（步骤 1 · 2026-11-15）。
 *
 * 断点：`chart-section.js:368` 的 `if (truthDecision.source !== 'figma-fallback') return plan`
 * 用「视觉侧有没有真值」当**整条 Figma 通道**的开关 ⇒ 本单视觉 3 条 chart 就把
 * `2:3604 @echarts/line-7`（流量预测折线）整段吞掉。
 *
 * 本 spec 全部用**真实 checkpoint 夹具**（`__fixtures__/chart-truth/*`，取自
 * `workspace/custom-components` 下四支实单，已精简为 id/name/type/bbox/children 但
 * **结构与兄弟序逐字保留**，与全量数据裁决逐条一致），阴阳对照：
 *   - 必红：`c0cb00f1` / `0fd2168a` ⇒ 恰好 1 个节点 needsInjection，产物确无 line 图；
 *   - 必绿：`3cacdefb` / `9b2ecb41` ⇒ 0 个 needsInjection，产物已有折线图。
 */

const FIXTURE_ROOT = path.join(__dirname, '__fixtures__', 'chart-truth');

function loadCase(name: string) {
  const dir = path.join(FIXTURE_ROOT, name);
  const read = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  return {
    figmaRoot: read('figma.json'),
    plan: read('plan.json'),
    visionCharts: read('vision-charts.json'),
  };
}

describe('图表真值逐条覆盖：四支真实 checkpoint 阴阳对照', () => {
  const cases: Array<{
    name: string;
    expectNeeds: number;
    expectNodeId: string | null;
    expectHostName: string | null;
  }> = [
    // 必红：产物无 line 图（echarts.init 里没有 type:'line'），折线整段丢失
    { name: 'c0cb00f1', expectNeeds: 1, expectNodeId: '2:3604', expectHostName: '流量预测' },
    { name: '0fd2168a', expectNeeds: 1, expectNodeId: '2:3604', expectHostName: '流量预测' },
    // 必绿：产物已有折线图，段内容轨已声明 chart
    { name: '3cacdefb', expectNeeds: 0, expectNodeId: null, expectHostName: null },
    { name: '9b2ecb41', expectNeeds: 0, expectNodeId: null, expectHostName: null },
  ];

  for (const c of cases) {
    it(`${c.name} ⇒ needsInjection=${c.expectNeeds}`, () => {
      const { figmaRoot, plan, visionCharts } = loadCase(c.name);
      const coverage = resolveChartTruthCoverage({ figmaRoot, plan, visionCharts });

      expect(coverage.counts.truthNodes).toBe(5);
      expect(coverage.counts.needsInjection).toBe(c.expectNeeds);

      const flagged = coverage.nodes.filter((n: any) => n.needsInjection);
      if (c.expectNeeds === 0) {
        expect(flagged).toEqual([]);
      } else {
        expect(flagged.map((n: any) => n.nodeId)).toEqual([c.expectNodeId]);
        expect(flagged[0].hostSectionName).toBe(c.expectHostName);
        expect(flagged[0].chartType).toBe('line');
        expect(flagged[0].carried).toBe(false);
        expect(flagged[0].candidateCount).toBe(1);
      }
    });
  }

  it('必红单的其余 4 个节点全部判「已承载」，不得重复补', () => {
    const { figmaRoot, plan, visionCharts } = loadCase('c0cb00f1');
    const coverage = resolveChartTruthCoverage({ figmaRoot, plan, visionCharts });
    const others = coverage.nodes.filter((n: any) => n.nodeId !== '2:3604');
    expect(others).toHaveLength(4);
    for (const n of others) {
      expect(n.carried).toBe(true);
      expect(n.needsInjection).toBe(false);
    }
  });

  it('必绿单 3cacdefb：2:3604 的宿主段内容轨已声明 chart ⇒ carried=content-chart-shape', () => {
    const { figmaRoot, plan, visionCharts } = loadCase('3cacdefb');
    const coverage = resolveChartTruthCoverage({ figmaRoot, plan, visionCharts });
    const line = coverage.nodes.find((n: any) => n.nodeId === '2:3604');
    expect(line.hostSectionName).toBe('流量预测');
    expect(line.carried).toBe(true);
    expect(line.carriedHow).toBe('content-chart-shape');
    expect(line.needsInjection).toBe(false);
  });

  it('必绿单 9b2ecb41：2:3604 的宿主段内容轨已声明 chart ⇒ 不补', () => {
    const { figmaRoot, plan, visionCharts } = loadCase('9b2ecb41');
    const coverage = resolveChartTruthCoverage({ figmaRoot, plan, visionCharts });
    const line = coverage.nodes.find((n: any) => n.nodeId === '2:3604');
    expect(line.hostSectionName).toBe('流量预测');
    expect(line.carried).toBe(true);
    expect(line.needsInjection).toBe(false);
  });

  it('恒打计数行：六类互斥覆盖全部真值节点（0 也打，不省略）', () => {
    const { figmaRoot, plan, visionCharts } = loadCase('c0cb00f1');
    const coverage = resolveChartTruthCoverage({ figmaRoot, plan, visionCharts });
    const counts = chartTruthCoverageCounts(coverage);
    expect(counts.version).toBe(CHART_TRUTH_COVERAGE_VERSION);
    expect(Object.keys(counts).sort()).toEqual([
      'ambiguous', 'carried', 'needsInjection', 'noHost', 'noVisionEvidence',
      'planAvailable', 'truthNodes', 'version', 'visionCovered',
    ]);
    // needsInjection 是「有宿主 + 未承载 + 候选唯一 + 有视觉佐证 + 未被逐条认领」的**落项**，
    // 它不进前五类，所以恒等式必须把它作为第 6 项加回来（否则 truthNodes=5 而五类之和=4）。
    expect(
      counts.visionCovered + counts.carried + counts.noHost
        + counts.ambiguous + counts.noVisionEvidence + counts.needsInjection,
    ).toBe(counts.truthNodes);

    // 逐条复核（防重复计数假绿）：每个真值节点必须**恰好**落入一类
    const labelOf = (n: any) => (n.visionCovered ? 'visionCovered'
      : n.carried ? 'carried'
        : n.hostSectionId == null ? 'noHost'
          : n.candidateCount > 1 ? 'ambiguous'
            : n.visionEvidence === 'none' ? 'noVisionEvidence'
              : 'needsInjection');
    const tally: Record<string, number> = {
      visionCovered: 0, carried: 0, noHost: 0, ambiguous: 0, noVisionEvidence: 0, needsInjection: 0,
    };
    for (const n of coverage.nodes) {
      const label = labelOf(n);
      tally[label] += 1;
      // 落项与 needsInjection 必须同真同假，否则计数行会漂移
      if (label === 'needsInjection') expect(n.needsInjection).toBe(true);
      else expect(n.needsInjection).toBe(false);
    }
    expect(tally).toEqual({
      visionCovered: counts.visionCovered,
      carried: counts.carried,
      noHost: counts.noHost,
      ambiguous: counts.ambiguous,
      noVisionEvidence: counts.noVisionEvidence,
      needsInjection: counts.needsInjection,
    });
    expect(JSON.parse(JSON.stringify(counts))).toEqual(counts);
  });
});

// ── 以下为判据单元（合成小树，逐条可辩驳） ────────────────────────────────

const box = (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h });

describe('resolveChartAnchor：锚点取前兄弟，同父第 0 个退到父级', () => {
  const figmaRoot = {
    id: 'root', name: 'root', type: 'FRAME',
    children: [
      {
        id: 'P', name: 'panel', type: 'FRAME',
        children: [
          { id: 'H', name: 'header', type: 'FRAME' },
          { id: 'B', name: 'body', type: 'FRAME' },
          { id: 'E', name: '@echarts/line-7', type: 'FRAME' },
        ],
      },
      {
        id: 'Q', name: 'panel2', type: 'FRAME',
        children: [{ id: 'E2', name: '@echarts/pie', type: 'FRAME' }],
      },
    ],
  };
  const tree = buildChartTruthTree(figmaRoot);

  it('前兄弟存在 ⇒ via=prev-sibling', () => {
    expect(resolveChartAnchor('E', tree)).toEqual({ anchorId: 'B', via: 'prev-sibling' });
  });
  it('同父第 0 个 ⇒ via=parent', () => {
    expect(resolveChartAnchor('E2', tree)).toEqual({ anchorId: 'Q', via: 'parent' });
  });
  it('无父级 ⇒ 无锚点（不猜）', () => {
    expect(resolveChartAnchor('root', tree)).toEqual({ anchorId: null, via: 'no-parent' });
  });
});

describe('sectionTruthRef：sourceNodeIds[0] 优先，id 兜底', () => {
  it('sourceNodeIds 非空 ⇒ 取首项', () => {
    expect(sectionTruthRef({ id: '2:3559', sourceNodeIds: ['2:3660', '2:3565'] })).toBe('2:3660');
  });
  it('sourceNodeIds 空 ⇒ 退回 id', () => {
    expect(sectionTruthRef({ id: '2:3559', sourceNodeIds: [] })).toBe('2:3559');
  });
  it('两者皆无 ⇒ null', () => {
    expect(sectionTruthRef({})).toBeNull();
  });
});

describe('collectTerminalSections：只认真叶子（无子段）', () => {
  it('带子段的段不算真叶子', () => {
    const sections = [
      { id: 'a', children: [{ id: 'a1' }, { id: 'a2', children: [{ id: 'a2x' }] }] },
      { id: 'b' },
    ];
    expect(collectTerminalSections(sections).map((s: any) => s.id)).toEqual(['a1', 'a2x', 'b']);
  });
  it('collectAllSections 保留容器段', () => {
    const sections = [{ id: 'a', children: [{ id: 'a1' }] }];
    expect(collectAllSections(sections).map((s: any) => s.id)).toEqual(['a', 'a1']);
  });
});

describe('collectSectionContentTrack：规格 / 另一条轨不进内容轨（假绿防护）', () => {
  it('chartSpec 不算内容轨声明', () => {
    const track = collectSectionContentTrack({
      id: 's', body: { children: [{ id: 'x', chartSpec: { type: 'line' } }] },
    });
    expect(track.hasChartShape).toBe(false);
    expect(track.refs.has('x')).toBe(true);
  });
  it('internalSubcomponents 不算内容轨声明', () => {
    const track = collectSectionContentTrack({
      id: 's', body: { internalSubcomponents: [{ id: 'y', role: 'chart' }] },
    });
    expect(track.hasChartShape).toBe(false);
  });
  it('role=chart 与 type=line 都算内容轨声明', () => {
    expect(collectSectionContentTrack({ body: { children: [{ id: 'c1', role: 'chart' }] } }).hasChartShape)
      .toBe(true);
    expect(collectSectionContentTrack({ body: { children: [{ id: 'c2', type: 'line' }] } }).hasChartShape)
      .toBe(true);
  });
});

describe('isChartCarried：自宿主 / 内容轨引用祖先链 / 内容轨 chart 形态', () => {
  // `othersec` 与 `sec` 是兄弟 —— 它既不在 E 的祖先链也不在子树里，
  // 所以不会被 self-host 短路，能真正测到「内容轨」两个分支。
  const figmaRoot = {
    id: 'root', type: 'FRAME',
    children: [
      {
        id: 'sec', type: 'FRAME',
        children: [
          { id: 'title', type: 'FRAME' },
          { id: 'chartwrap', type: 'FRAME', children: [{ id: 'E', name: '@echarts/bar', type: 'FRAME' }] },
        ],
      },
      { id: 'othersec', type: 'FRAME' },
    ],
  };
  const tree = buildChartTruthTree(figmaRoot);

  it('段 ref 就是该节点 ⇒ self-host', () => {
    expect(isChartCarried({ host: {}, hostRef: 'E', nodeId: 'E', tree }))
      .toEqual({ carried: true, how: 'self-host' });
  });
  it('段 ref 是节点祖先 ⇒ self-host', () => {
    expect(isChartCarried({ host: {}, hostRef: 'chartwrap', nodeId: 'E', tree }))
      .toEqual({ carried: true, how: 'self-host' });
  });
  it('内容轨引用祖先链 id ⇒ content-ref', () => {
    const host = { body: { children: [{ id: 'chartwrap' }] } };
    expect(isChartCarried({ host, hostRef: 'othersec', nodeId: 'E', tree }))
      .toEqual({ carried: true, how: 'content-ref(chartwrap)' });
  });
  it('内容轨有 chart 形态节点 ⇒ content-chart-shape', () => {
    const host = { body: { children: [{ id: 'zzz', role: 'chart' }] } };
    expect(isChartCarried({ host, hostRef: 'othersec', nodeId: 'E', tree }))
      .toEqual({ carried: true, how: 'content-chart-shape' });
  });
  it('内容轨只有装饰节点 ⇒ 未承载', () => {
    const host = { body: { children: [{ id: 'deco', role: '装饰' }] } };
    expect(isChartCarried({ host, hostRef: 'othersec', nodeId: 'E', tree }))
      .toEqual({ carried: false, how: 'none' });
  });
  it('无宿主 ⇒ 未承载且不猜', () => {
    expect(isChartCarried({ host: null, hostRef: null, nodeId: 'E', tree }))
      .toEqual({ carried: false, how: 'no-host' });
  });
});

describe('visionCorroboratesHost：合成段 id 归一后比对区域', () => {
  const figmaRoot = {
    id: 'root', type: 'FRAME',
    children: [{
      id: 'sec', type: 'FRAME',
      children: [{ id: 'inner', type: 'FRAME' }],
    }],
  };
  const tree = buildChartTruthTree(figmaRoot);
  const idToRef = new Map([['chart-section', 'sec']]);

  it('视觉 section 是合成段 id ⇒ 归一后命中宿主自身', () => {
    expect(visionCorroboratesHost({
      hostRef: 'sec', tree, visionCharts: [{ section: 'chart-section' }], sectionIdToRef: idToRef,
    })).toEqual({ corroborates: true, by: 'section=sec' });
  });
  it('视觉 section 落在宿主子树 ⇒ 命中', () => {
    expect(visionCorroboratesHost({
      hostRef: 'sec', tree, visionCharts: [{ section: 'inner' }], sectionIdToRef: new Map(),
    })).toEqual({ corroborates: true, by: 'in-subtree(inner)' });
  });
  it('视觉 section 是宿主祖先 ⇒ 命中', () => {
    expect(visionCorroboratesHost({
      hostRef: 'inner', tree, visionCharts: [{ section: 'sec' }], sectionIdToRef: new Map(),
    })).toEqual({ corroborates: true, by: 'ancestor(sec)' });
  });
  it('视觉 section 与宿主无关 ⇒ 无佐证（不臆造）', () => {
    expect(visionCorroboratesHost({
      hostRef: 'sec', tree, visionCharts: [{ section: 'other:1' }], sectionIdToRef: new Map(),
    })).toEqual({ corroborates: false, by: 'none' });
  });
  it('视觉 charts 为空 ⇒ 无佐证', () => {
    expect(visionCorroboratesHost({
      hostRef: 'sec', tree, visionCharts: [], sectionIdToRef: new Map(),
    }).corroborates).toBe(false);
  });
});

describe('resolveChartHost：多候选一律不判（指空段 = 没给）', () => {
  // 形如真值：`@echarts` 的前兄弟是一个**容器**（真实单里是 `1744:125 slot-con`），
  // 容器内两个真叶子段都落进 closure ⇒ 必须判「多候选」，不许挑一个补。
  const figmaRoot = {
    id: 'root', type: 'FRAME',
    children: [{
      id: 'slot', type: 'FRAME', absoluteBoundingBox: box(0, 0, 400, 600),
      children: [
        {
          id: 'wrap', type: 'FRAME', absoluteBoundingBox: box(0, 0, 400, 500),
          children: [
            { id: 'big', type: 'FRAME', absoluteBoundingBox: box(0, 0, 400, 400) },
            { id: 'small', type: 'FRAME', absoluteBoundingBox: box(0, 400, 400, 100) },
          ],
        },
        { id: 'E', name: '@echarts/line', type: 'FRAME', absoluteBoundingBox: box(0, 500, 400, 100) },
      ],
    }],
  };
  const tree = buildChartTruthTree(figmaRoot);
  const sections = [
    { id: 's-big', sourceNodeIds: ['big'], body: { children: [{ id: 'deco', role: '装饰' }] } },
    { id: 's-small', sourceNodeIds: ['small'], body: { children: [{ id: 'deco2', role: '装饰' }] } },
  ];

  it('两个候选 ⇒ ambiguous=true，选面积最大者仅作观测', () => {
    const host = resolveChartHost({ nodeId: 'E', sections, tree });
    expect(host.anchorId).toBe('wrap');
    expect(host.candidateCount).toBe(2);
    expect(host.ambiguous).toBe(true);
    expect(host.host.id).toBe('s-big');
  });

  it('多候选 + 未承载 + 视觉佐证 ⇒ 仍然 needsInjection=false（不猜）', () => {
    const coverage = resolveChartTruthCoverage({
      figmaRoot,
      plan: sections,
      visionCharts: [{ section: 'big', type: 'line' }],
    });
    const line = coverage.nodes.find((n: any) => n.nodeId === 'E');
    expect(line.carried).toBe(false);
    expect(line.visionEvidence).not.toBe('none');
    expect(line.needsInjection).toBe(false);
    expect(coverage.counts.ambiguous).toBe(1);
    expect(coverage.counts.needsInjection).toBe(0);
  });

  it('单候选 + 未承载 + 视觉佐证 ⇒ needsInjection=true（阳性对照）', () => {
    const coverage = resolveChartTruthCoverage({
      figmaRoot,
      plan: [sections[0]],
      visionCharts: [{ section: 'big', type: 'line' }],
    });
    const line = coverage.nodes.find((n: any) => n.nodeId === 'E');
    expect(line.candidateCount).toBe(1);
    expect(line.needsInjection).toBe(true);
    expect(coverage.counts.needsInjection).toBe(1);
  });

  it('单候选 + 未承载 + 无视觉佐证 ⇒ 不补（视觉盲区另立判据，登记为次生缺口）', () => {
    const coverage = resolveChartTruthCoverage({
      figmaRoot, plan: [sections[0]], visionCharts: [],
    });
    expect(coverage.nodes[0].needsInjection).toBe(false);
    expect(coverage.counts.noVisionEvidence).toBe(1);
  });
});

describe('collectEchartsTruthNodes：命中即止，不递归子树', () => {
  it('@echarts 节点内部的子节点不重复计数', () => {
    const nodes = collectEchartsTruthNodes({
      id: 'root', type: 'FRAME',
      children: [{
        id: 'E', name: '@echarts/bar-1', type: 'FRAME',
        children: [{ id: 'E-child', name: '@echarts/pie', type: 'FRAME' }],
      }],
    });
    expect(nodes.map((n: any) => n.nodeId)).toEqual(['E']);
    expect(nodes[0].chartType).toBe('bar');
  });
  it('无 id 的标记节点被丢弃（不能指空段）', () => {
    expect(collectEchartsTruthNodes({ id: 'r', children: [{ name: '@echarts/line' }] })).toEqual([]);
  });
  it('无 @echarts 标记 ⇒ 空数组（不是 undefined）', () => {
    expect(collectEchartsTruthNodes({ id: 'r', children: [{ id: 'a', name: 'text' }] })).toEqual([]);
  });
});
