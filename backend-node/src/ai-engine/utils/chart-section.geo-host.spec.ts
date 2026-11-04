/**
 * 🛡️ 几何宿主归属 + 根级按 Y 归并（2026-11-04 · mc-max-1793771678347-18544d9c 实锤）。
 *
 * 病灶：vision sections 无 children、charts[] 无 id → planner 扁平 3 段 → 兜底把 5 个
 *   未覆盖 @echarts 节点「追加到根末尾」：顺序撕碎 + 刀16b 间距错补偿（421px）+ 与宿主
 *   自绘双渲染（ContentForecast vs ChartChart5）。
 * 治本：有几何宿主（节点中心 ∈ 叶子 section Figma 盒，取最小盒）→ 挂宿主
 *   internalSubcomponents（R1 同款），不做根级注入；无宿主 → 根级按视觉 Y 归并插入。
 */
import { injectChartSectionIfMissing } from './chart-section.js';

const box = (x, y, width, height) => ({ x, y, width, height });

/** 造一棵含 @echarts 标记节点的 Figma 树 */
const figmaTree = (nodes) => ({
  document: {
    id: '0:1',
    name: 'root',
    children: nodes.map((n) => ({
      id: n.id,
      name: n.name,
      absoluteBoundingBox: n.bbox,
      children: [],
    })),
  },
});

describe('injectChartSectionIfMissing：几何宿主归属（R1-geo）', () => {
  it('节点中心落在叶子 section 盒内 → 挂宿主 internalSubcomponents，不做根级注入', () => {
    const plan = {
      effectiveSections: [
        { id: '2:3550', title: '当日总流量', type: 'content', figmaBox: box(0, 119, 380, 100) },
        { id: '2:3438', title: '车型分布', type: 'content', figmaBox: box(0, 573, 380, 160) },
        { id: '83:30', title: '流量预测', type: 'content', figmaBox: box(0, 750, 380, 200) },
      ],
      isForced: false,
      internalSubcomponents: [],
    };
    const figmaNodeData = figmaTree([
      { id: '2:7459', name: '@echarts/bar', bbox: box(10, 130, 360, 80) }, // 中心 (190,170) ∈ 2:3550
      { id: '246:30', name: '@echarts', bbox: box(10, 600, 175, 100) }, // 中心 ∈ 2:3438
    ]);
    const out = injectChartSectionIfMissing(plan, true, { figmaNodeData });

    // 根级仍是原 3 段（无 chart section 注入）
    expect(out.effectiveSections.map((s) => s.id)).toEqual(['2:3550', '2:3438', '83:30']);

    // 宿主 section 级挂载
    const hostA = out.effectiveSections.find((s) => s.id === '2:3550');
    const hostB = out.effectiveSections.find((s) => s.id === '2:3438');
    expect(hostA.internalSubcomponents).toHaveLength(1);
    expect(hostA.internalSubcomponents[0]).toMatchObject({
      type: 'chart-component',
      id: 'chart-2:7459',
      chartType: 'bar',
    });
    expect(hostB.internalSubcomponents[0].id).toBe('chart-246:30');

    // plan 级记账（prompt 按 parentSectionId 分组消费）
    expect(out.internalSubcomponents).toHaveLength(2);
    expect(out.internalSubcomponents.map((s) => s.parentSectionId).sort()).toEqual(['2:3438', '2:3550']);

    // minFiles 计入内部子组件（与 planner R1 口径一致；叶子 3 ≥ 3 → 强制）
    expect(out.isForced).toBe(true);
    expect(out.minFiles).toBe(3 + 2);
  });

  it('多候选宿主取最小盒（最内层）', () => {
    const plan = {
      effectiveSections: [
        { id: 'outer', title: '整卡', type: 'content', figmaBox: box(0, 0, 400, 400) },
        { id: 'inner', title: '内层卡', type: 'content', figmaBox: box(0, 100, 400, 120) },
      ],
      isForced: true,
    };
    const figmaNodeData = figmaTree([
      { id: '9:1', name: '@echarts/pie', bbox: box(10, 110, 380, 100) },
    ]);
    const out = injectChartSectionIfMissing(plan, true, { figmaNodeData });
    const inner = out.effectiveSections.find((s) => s.id === 'inner');
    const outer = out.effectiveSections.find((s) => s.id === 'outer');
    expect(inner.internalSubcomponents).toHaveLength(1);
    expect(outer.internalSubcomponents || []).toHaveLength(0);
  });

  it('chart section 自身不当宿主', () => {
    const plan = {
      effectiveSections: [
        { id: 'chart-1', type: 'chart', title: '图表', figmaBox: box(0, 0, 380, 400) },
      ],
      isForced: true,
    };
    const figmaNodeData = figmaTree([
      { id: '9:2', name: '@echarts/bar', bbox: box(10, 100, 360, 100) },
    ]);
    const out = injectChartSectionIfMissing(plan, true, { figmaNodeData });
    // 无合法宿主 → 根级归并（只剩自己 + 1 chart）
    expect(out.effectiveSections.map((s) => s.id)).toEqual(['chart-1', 'chart-9:2']);
  });
});

describe('injectChartSectionIfMissing：无宿主 → 根级按视觉 Y 归并（不再 append 末尾）', () => {
  it('孤儿 chart 按 Y 插入到正确相邻位置', () => {
    const plan = {
      effectiveSections: [
        // 注意：列表顺序故意与视觉序相反，验证归并按 Y 而非按输入序
        { id: 'sec-B', title: 'B段', type: 'content', figmaBox: box(0, 300, 380, 80) },
        { id: 'sec-A', title: 'A段', type: 'content', figmaBox: box(0, 0, 380, 80) },
      ],
      isForced: true,
    };
    const figmaNodeData = figmaTree([
      { id: '9:10', name: '@echarts/bar', bbox: box(0, 100, 380, 150) }, // 应在 A、B 之间
    ]);
    const out = injectChartSectionIfMissing(plan, true, { figmaNodeData });
    expect(out.effectiveSections.map((s) => s.id)).toEqual(['sec-A', 'chart-9:10', 'sec-B']);
    // 无 internalSubcomponents 键（没有宿主）
    expect(out.internalSubcomponents).toBeUndefined();
  });

  it('宿主 section 盒按 Figma 树回查（section 自身无 box 字段）', () => {
    const plan = {
      effectiveSections: [
        { id: '2:3550', title: '当日总流量', type: 'content', sourceNodeIds: ['2:3550'] },
        { id: '2:3438', title: '车型分布', type: 'content', sourceNodeIds: ['2:3438'] },
      ],
      isForced: false,
    };
    const figmaNodeData = {
      document: {
        id: '0:1',
        children: [
          { id: '2:3550', name: 'header-', absoluteBoundingBox: box(0, 119, 380, 100), children: [] },
          { id: '2:3438', name: 'slot-车型分布', absoluteBoundingBox: box(0, 573, 380, 160), children: [] },
          { id: '2:7459', name: '@echarts/bar', absoluteBoundingBox: box(10, 130, 360, 80), children: [] },
        ],
      },
    };
    const out = injectChartSectionIfMissing(plan, true, { figmaNodeData });
    const host = out.effectiveSections.find((s) => s.id === '2:3550');
    expect(host.internalSubcomponents).toHaveLength(1);
    expect(host.internalSubcomponents[0].id).toBe('chart-2:7459');
  });

  it('几何事实全缺 → fail-open 等价旧 append（稳定顺序，无 internalSubcomponents）', () => {
    const plan = {
      effectiveSections: [
        { id: 's1', title: '段一', type: 'content' },
        { id: 's2', title: '段二', type: 'content' },
      ],
      isForced: true,
    };
    const figmaNodeData = figmaTree([
      { id: '9:99', name: '@echarts/bar', bbox: null },
    ]);
    const out = injectChartSectionIfMissing(plan, true, { figmaNodeData });
    expect(out.effectiveSections.map((s) => s.id)).toEqual(['s1', 's2', 'chart-9:99']);
    expect(out.internalSubcomponents).toBeUndefined();
  });
});

describe('injectChartSectionIfMissing：既有行为零回归', () => {
  it('同 id 图表语义宿主 → 就地替换路径不受影响（不生 internalSubcomponents）', () => {
    const plan = {
      effectiveSections: [
        { id: '2:7459', title: '@echarts/bar 容器', type: 'chart', figmaBox: box(0, 100, 380, 150) },
        { id: 's2', title: '段二', type: 'content', figmaBox: box(0, 300, 380, 80) },
      ],
      isForced: true,
    };
    const figmaNodeData = figmaTree([
      { id: '2:7459', name: '@echarts/bar', bbox: box(0, 100, 380, 150) },
    ]);
    const out = injectChartSectionIfMissing(plan, true, { figmaNodeData });
    // 就地替换 = 用合成 chart section 替换同 id 宿主（id 变为 chart-2:7459），位置保持
    expect(out.effectiveSections.map((s) => s.id)).toEqual(['chart-2:7459', 's2']);
    expect(out.internalSubcomponents).toBeUndefined();
  });

  it('chartSignal=false → 原样返回', () => {
    const plan = { effectiveSections: [{ id: 's1' }], isForced: false };
    expect(injectChartSectionIfMissing(plan, false, {})).toBe(plan);
  });
});
