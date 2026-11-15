/**
 * 🛡️ P0-8b（2026-11-14 · mc-max-1794651114530-9ed088e3 实锤）：相邻 header 条并入判据。
 *
 * 真机：`4sub-header`(86×24) 与 `5cards`(114) 是兄弟、`6sub-header`(378×24) 与 `@echarts/line-7`(141) 是兄弟，
 *   副标题条不在任何段内 ⇒ 产物只有卡片和图表，「车型分布」「流量预测」两个副标题消失；
 *   「流量预测」的 tab 只能靠 S4-b 兜底注入组件根（压住面板标题）。
 *
 * 判据纯几何/类型（不看图层名）：未认领 + 高 ≤40 + 宽 ≥ 段锚点宽×0.5 + y 间隙 ≤32 +
 *   子树只含文字/矢量（排除卡片/统计块）。归属按「间隙最小」唯一裁决。
 */
import { mergeAdjacentHeaderStrips } from './section-plan-coverage.js';

const bb = (x, y, width, height) => ({ x, y, width, height });
const text = (id, name, box) => ({ id, name, type: 'TEXT', characters: name, absoluteBoundingBox: bb(...box) });
const box = (id, name, type, boxArr, children = []) => ({ id, name, type, absoluteBoundingBox: bb(...boxArr), children });

function makeFigma() {
  return {
    document: box('2:9778', 'cp-流量监测', 'FRAME', [0, 0, 426, 807], [
      box('1744:125', 'slot-con', 'FRAME', [0, 46, 426, 745], [
        box('88:32', '0sub-header', 'GROUP', [23, 46, 380, 30], [
          box('2:3559', '标题', 'GROUP', [23, 49, 147, 24], [text('2:3560', '当日总流量', [23, 53, 80, 16])]),
          box('2:3545', '时间范围选择', 'GROUP', [300, 49, 90, 24], [text('2:7674', '24小时', [320, 53, 50, 16])]),
        ]),
        box('2:3660', '1统计', 'FRAME', [0, 76, 426, 91], [text('2:3661', '34,620', [40, 100, 70, 28])]),
        box('1744:127', '2charts', 'FRAME', [23, 177, 379, 131], [text('2:7626', '隧道流量', [40, 190, 80, 16])]),
        box('2:3439', '4sub-header', 'GROUP', [20, 476, 386, 24], [text('2:3440', '车型分布', [44, 480, 60, 16])]),
        box('1263:38', '5cards', 'FRAME', [20, 500, 387, 114], [text('2:3447', '江阴靖江长江隧道', [40, 520, 120, 13])]),
        box('2:3565', '6sub-header', 'GROUP', [20, 630, 378, 24], [
          text('2:3572', '流量预测', [20, 634, 60, 16]),
          text('2:3573', '节假日预测', [320, 634, 70, 16]),
        ]),
        box('2:3604', '@echarts/line-7', 'GROUP', [20, 654, 363, 141], [text('2:3637', '实际流量', [40, 660, 60, 16])]),
      ]),
    ]),
  };
}

const mkSections = () =>
  ['2:3559', '1744:127', '1263:38', '2:3604'].map((id) => ({
    id,
    name: id,
    header: { title: '', controls: [] },
    children: [],
  }));

const secOf = (list, id) => list.find((s) => String(s.id) === id);

describe('P0-8b 相邻 header 条并入（不看图层名）', () => {
  it('车型分布：副标题条并入卡片段，标题上提到 section.header', () => {
    const sections = mkSections();
    const { stats } = mergeAdjacentHeaderStrips({ sections, figmaNodeData: makeFigma() });
    const s = secOf(sections, '1263:38');
    expect(s.header.title).toBe('车型分布');
    expect(s.sourceNodeIds).toContain('2:3439');
    expect(stats.merged).toBeGreaterThanOrEqual(1);
  });

  it('流量预测：副标题条并入图表段（且不被上方的卡片段抢走）', () => {
    const sections = mkSections();
    mergeAdjacentHeaderStrips({ sections, figmaNodeData: makeFigma() });
    const s = secOf(sections, '2:3604');
    expect(s.header.title).toBe('流量预测');
    expect(s.sourceNodeIds).toContain('2:3565');
    expect(secOf(sections, '1263:38').sourceNodeIds || []).not.toContain('2:3565');
  });

  it('统计块（91 高）不是 header 条 ⇒ 绝不并入', () => {
    const sections = mkSections();
    mergeAdjacentHeaderStrips({ sections, figmaNodeData: makeFigma() });
    for (const s of sections) {
      expect(s.sourceNodeIds || []).not.toContain('2:3660');
    }
  });

  it('锚点自身在 thin 祖先条里 ⇒ 该祖先并入本段（当日总流量 + 24小时下拉）', () => {
    const sections = mkSections();
    mergeAdjacentHeaderStrips({ sections, figmaNodeData: makeFigma() });
    const s = secOf(sections, '2:3559');
    expect(s.sourceNodeIds).toContain('88:32');
    expect(s.header.title).toBe('当日总流量');
  });

  it('幂等：连跑两次不重复追加 sourceNodeIds', () => {
    const sections = mkSections();
    mergeAdjacentHeaderStrips({ sections, figmaNodeData: makeFigma() });
    const first = JSON.parse(JSON.stringify(sections));
    mergeAdjacentHeaderStrips({ sections, figmaNodeData: makeFigma() });
    expect(sections).toEqual(first);
  });

  it('fail-open：无 Figma 树 ⇒ 原样返回', () => {
    const sections = mkSections();
    const before = JSON.parse(JSON.stringify(sections));
    const { stats } = mergeAdjacentHeaderStrips({ sections, figmaNodeData: null });
    expect(sections).toEqual(before);
    expect(stats.merged).toBe(0);
  });
});

/**
 * 🛡️ 高度同源抬升（2026-11-15 · mc-max-1794725297064-b532dc69 实锤）。
 *
 * 病灶：本函数只并语义不并高度 ⇒ 产物 `resolveSectionSize` 最高优先级读
 *   `styles.figmaHeightPx`（锚点原始 bbox，不带标题条）⇒ 段内缺一整行标题；
 *   刀16 又把「条 + 间隙」算成 `margin-top`（真机 42 = 14 + 24.3+3.7）。
 * 判据：条在锚点上方（间隙 ∈ [-1,32]）且「锚点底 − 条顶」> 现高 ⇒ 段盒上移到条顶。
 */
describe('D1 段盒同源抬升（标题条高度计入本段）', () => {
  it('车型分布：段盒顶移到条顶、高度含条与间隙', () => {
    const sections = mkSections();
    mergeAdjacentHeaderStrips({ sections, figmaNodeData: makeFigma() });
    const s = secOf(sections, '1263:38');
    // 条 2:3439 y=476 h=24；锚点 1263:38 y=500 h=114 ⇒ 抬升后 y=476 h=138
    expect(s.absoluteBoundingBox.y).toBe(476);
    expect(s.absoluteBoundingBox.height).toBe(138);
    expect(s.styles.figmaHeightPx).toBe(138);
  });

  it('同时写计数 stats.lifted（0 与 >0 可区分）', () => {
    const sections = mkSections();
    const { stats } = mergeAdjacentHeaderStrips({ sections, figmaNodeData: makeFigma() });
    expect(stats.lifted).toBeGreaterThanOrEqual(1);
  });

  it('只升不降：A4/并集已算出更高值时不覆盖', () => {
    const sections = mkSections();
    secOf(sections, '1263:38').styles = { figmaHeightPx: 200 };
    mergeAdjacentHeaderStrips({ sections, figmaNodeData: makeFigma() });
    const s = secOf(sections, '1263:38');
    expect(s.styles.figmaHeightPx).toBe(200);
    expect(s.absoluteBoundingBox).toBeUndefined();
  });

  it('幂等：抬升后再跑高度不变（不累加）', () => {
    const sections = mkSections();
    mergeAdjacentHeaderStrips({ sections, figmaNodeData: makeFigma() });
    const once = secOf(sections, '1263:38').styles.figmaHeightPx;
    mergeAdjacentHeaderStrips({ sections, figmaNodeData: makeFigma() });
    expect(secOf(sections, '1263:38').styles.figmaHeightPx).toBe(once);
  });

  it('间隙为 0 的紧邻段不动（隧道图无条 ⇒ 保持原高）', () => {
    const sections = mkSections();
    mergeAdjacentHeaderStrips({ sections, figmaNodeData: makeFigma() });
    const s = secOf(sections, '1744:127');
    expect(s.absoluteBoundingBox).toBeUndefined();
    expect(s.styles).toBeUndefined();
  });
});
