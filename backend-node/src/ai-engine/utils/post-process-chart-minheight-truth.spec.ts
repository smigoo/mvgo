/**
 * 🛡️ 刀C（P3）图表 min-height 真值解析 —— 单元测试。
 *
 * 断言只用直接构造的 section fixture 与数值比较，不复用 resolveChartMinHeightTruth
 * 内部遍历逻辑（改者/验者分离）。
 */
import { resolveChartMinHeightTruth } from './post-process.js';

const SEC_CHART_8941 = {
  id: '89:41',
  styles: { figmaHeightPx: 145 },
  internalGeometry: [
    { x: 0, y: 0, w: 295, h: 27 }, // tabs 容器（无 text）
    { x: 0, y: 32, w: 380, h: 113 }, // 图表容器（无 text）
  ],
};

describe('resolveChartMinHeightTruth (刀C · P3)', () => {
  test('① 图表盒真值：internalGeometry 非文本条目 h 最大者（tabs 27 vs 图表 113）', () => {
    const r = resolveChartMinHeightTruth([SEC_CHART_8941], '89:41');
    expect(r.chartBoxH).toBe(113);
    expect(r.sectionH).toBe(145);
    expect(r.isOnlyChild).toBe(false);
  });

  test('带 text 的条目不参与图表盒判定', () => {
    const sec = {
      id: 'a:1',
      styles: { figmaHeightPx: 200 },
      internalGeometry: [
        { x: 0, y: 0, w: 380, h: 180, text: '标题文本占大头' },
        { x: 0, y: 40, w: 380, h: 120 }, // 图表
      ],
    };
    const r = resolveChartMinHeightTruth([sec], 'a:1');
    expect(r.chartBoxH).toBe(120);
  });

  test('② 段真值 + 唯一子项：internalGeometry 恰 1 条 → isOnlyChild', () => {
    const sec = {
      id: 'b:2',
      styles: { figmaHeightPx: 90 },
      internalGeometry: [{ x: 0, y: 0, w: 380, h: 88 }],
    };
    const r = resolveChartMinHeightTruth([sec], 'b:2');
    expect(r.isOnlyChild).toBe(true);
    expect(r.chartBoxH).toBe(88);
    expect(r.sectionH).toBe(90);
  });

  test('非文本条目 h 平票 → 不猜（chartBoxH=0，fail-open）', () => {
    const sec = {
      id: 'c:3',
      styles: { figmaHeightPx: 160 },
      internalGeometry: [
        { x: 0, y: 0, w: 180, h: 100 },
        { x: 200, y: 0, w: 180, h: 100 },
      ],
    };
    const r = resolveChartMinHeightTruth([sec], 'c:3');
    expect(r.chartBoxH).toBe(0);
    expect(r.sectionH).toBe(160);
  });

  test('🛡️ 比例校验：最大非文本盒 < 段高 1/3 → 弃权（小图标段防塌缩，真机 2:8069 形态）', () => {
    const sec = {
      id: 'f:6',
      styles: { figmaHeightPx: 145 },
      internalGeometry: [
        { x: 0, y: 0, w: 8, h: 8 },
        { x: 20, y: 0, w: 40, h: 18 }, // 最大非文本盒仅 18px（0.12 < 1/3）
      ],
    };
    const r = resolveChartMinHeightTruth([sec], 'f:6');
    expect(r.chartBoxH).toBe(0); // 回落兜底，不被压到 18
    expect(r.sectionH).toBe(145);
  });

  test('比例校验阳性：113/145=0.78 ≥ 1/3 → 命中（真机 89:44 形态）', () => {
    const sec = {
      id: '89:44',
      styles: { figmaHeightPx: 145 },
      internalGeometry: [
        { x: 0, y: 0, w: 295, h: 27 },
        { x: 0, y: 32, w: 380, h: 113 },
      ],
    };
    const r = resolveChartMinHeightTruth([sec], '89:44');
    expect(r.chartBoxH).toBe(113);
  });

  test('figmaHeightPx 缺失时退 figmaBox.height；两者都缺 → sectionH=0', () => {
    const secBox = { id: 'd:4', figmaBox: { width: 380, height: 145 }, internalGeometry: [{ h: 113 }] };
    expect(resolveChartMinHeightTruth([secBox], 'd:4').sectionH).toBe(145);
    const secNone = { id: 'e:5', internalGeometry: [] };
    const r = resolveChartMinHeightTruth([secNone], 'e:5');
    expect(r.sectionH).toBe(0);
    expect(r.chartBoxH).toBe(0);
  });

  test('段在 children 深层也能递归命中；id 不匹配 → 全 0', () => {
    const root = {
      id: 'root',
      children: [{ id: 'mid', body: { children: [SEC_CHART_8941] } }],
    };
    const hit = resolveChartMinHeightTruth([root], '89:41');
    expect(hit.chartBoxH).toBe(113);
    const miss = resolveChartMinHeightTruth([root], '99:99');
    expect(miss.chartBoxH).toBe(0);
    expect(miss.sectionH).toBe(0);
  });

  test('无效入参（空 sections / 空 id）→ 全 0（fail-open）', () => {
    expect(resolveChartMinHeightTruth([], '89:41').sectionH).toBe(0);
    expect(resolveChartMinHeightTruth([SEC_CHART_8941], '').sectionH).toBe(0);
    expect(resolveChartMinHeightTruth(null, '89:41').sectionH).toBe(0);
  });

  test('调用方封顶数学（直接断言，不经 resolve）：min(160,113)=113；clamp min(160,145)=145', () => {
    // ①档：兜底 160 > 图表盒 113 → 取 113
    expect(Math.min(160, 113)).toBe(113);
    // clamp：走②/③档兜底 160 > 段 145 → 压到 145
    expect(Math.min(160, 145)).toBe(145);
    // 紧凑图兜底 100 < 段 145 → 不动（flex 拉伸补足）
    expect(Math.min(100, 145)).toBe(100);
  });
});
