import { collectChartTruthBearingSectionIds } from './chart-truth-bearing.js'

/**
 * 图表真值承载段（2026-11-16）· 锚定事实优先。
 *
 * 阴阳对照：
 *   - 必红（必须命中，否则会被 isPanelHeader 删段）：`2:3604`（本身是 @echarts 节点，
 *     实单 B 的形态：`headerRelation=title-itself` 但已 `reanchoredFrom=2:3565` 锚到真值）；
 *   - 必绿（必须不命中，维持原删除行为）：纯标题行 `2:3439`、普通统计段 `2:3660`。
 * 另覆盖祖先与内容轨两条通道，以及无 Figma 数据时的零影响。
 */

const FIGMA = {
  document: {
    id: '2:9778',
    type: 'FRAME',
    name: 'cp-流量监测',
    children: [
      {
        id: '1744:125',
        type: 'FRAME',
        name: 'slot-con',
        children: [
          { id: '2:3660', type: 'FRAME', name: '1统计', children: [{ id: '2:3559', type: 'FRAME', name: 'card' }] },
          { id: '2:3439', type: 'GROUP', name: '4sub-header', children: [{ id: '2:3440', type: 'TEXT', name: 'tit' }] },
          {
            id: '1744:127',
            type: 'FRAME',
            name: '隧道流量图',
            children: [{ id: '2:7625', type: 'GROUP', name: '@echarts/bar-1' }],
          },
          { id: '2:3604', type: 'GROUP', name: '@echarts/line-7' },
        ],
      },
    ],
  },
}

describe('collectChartTruthBearingSectionIds：锚定事实优先（2026-11-16）', () => {
  it('段本身是 @echarts 真值节点 ⇒ 命中（B 单必红场景）', () => {
    const res = collectChartTruthBearingSectionIds([{ id: '2:3604', headerRelation: 'title-itself' }], FIGMA);
    expect(res.ids.has('2:3604')).toBe(true);
    expect(res.details[0]).toEqual({ sectionId: '2:3604', via: 'self', chartId: '2:3604' });
  });

  it('纯标题行 / 普通统计段 ⇒ 不命中（维持原 chrome 过滤行为）', () => {
    const res = collectChartTruthBearingSectionIds(
      [
        { id: '2:3439', headerRelation: 'title-itself', body: { children: [{ id: '2:3440', role: 'text' }] } },
        { id: '2:3660', headerRelation: 'content-below-title', body: { children: [{ id: '2:3559', role: 'stat-card' }] } },
      ],
      FIGMA,
    );
    expect(res.ids.size).toBe(0);
    expect(res.details).toHaveLength(0);
  });

  it('段是图表真值节点的祖先 ⇒ 命中（段盒包住图表）', () => {
    const res = collectChartTruthBearingSectionIds([{ id: '1744:127' }], FIGMA);
    expect(res.ids.has('1744:127')).toBe(true);
    expect(res.details[0].via).toBe('ancestor');
    expect(res.details[0].chartId).toBe('2:7625');
  });

  it('段内容轨引用图表真值节点 ⇒ 命中', () => {
    const res = collectChartTruthBearingSectionIds(
      [{ id: '1263:38', body: { children: [{ id: '2:3604', role: 'chart', type: 'line' }] } }],
      FIGMA,
    );
    expect(res.ids.has('1263:38')).toBe(true);
    expect(res.details[0].via).toBe('content');
    expect(res.details[0].chartId).toBe('2:3604');
  });

  it('无 figmaNodeData / 空 sections ⇒ 空集（零影响，可与现状逐字等价）', () => {
    expect(collectChartTruthBearingSectionIds([{ id: '2:3604' }], null).ids.size).toBe(0);
    expect(collectChartTruthBearingSectionIds([], FIGMA).ids.size).toBe(0);
    expect(collectChartTruthBearingSectionIds([{ id: '2:3604' }], { document: { id: 'x', children: [] } }).ids.size).toBe(0);
  });

  it('不误伤：编造的图表 id（2:3565-chart）不算真值', () => {
    const res = collectChartTruthBearingSectionIds(
      [{ id: '2:3604', body: { children: [{ id: '2:3565-chart', role: 'chart', type: 'line' }] } }],
      FIGMA,
    );
    // 段 id 自身是真值 ⇒ 命中；但绝不能因为假 id 而额外命中别的段
    expect(res.ids.has('2:3565-chart')).toBe(false);
    const other = collectChartTruthBearingSectionIds([{ id: '2:3565' }], FIGMA);
    expect(other.ids.has('2:3565')).toBe(false);
  });
});
