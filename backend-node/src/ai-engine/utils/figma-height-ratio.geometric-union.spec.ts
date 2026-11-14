/**
 * 🛡️ P0-8（2026-11-14 · mc-max-1794651114530-9ed088e3 实锤）：**几何并集段高**判据。
 *
 * 真机病灶（设计稿 tree 与截图一致）：
 *   1744:125 slot-con (426×745)
 *     ├─ 88:32  0sub-header  30   ← 段「当日总流量」的标题行（含 24 高 GROUP 2:3559）
 *     ├─ 2:3660 1统计        91   ← 两张统计卡（34,620 / 82,379）**是它的兄弟，没人认领**
 *     ├─ 1744:127/128 charts 131  ← 段（已认领）
 *     ├─ 2:3439 4sub-header  24   ← 「车型分布」副标题（兄弟）
 *     ├─ 1263:38 5cards      114  ← 段（已认领）
 *     ├─ 2:3565 6sub-header  24   ← 「流量预测」副标题（兄弟）
 *     └─ 2:3604 @echarts/line 141 ← 段（已认领）
 *
 * 旧行为：段「当日总流量」锚点 = 2:3559（h=24），三条上溯全 miss（`slot-<段名>` 命名不存在、
 *   stat-card 不进 body.items 并集、V-6 拿不到虚拟 id 真值盒）⇒ 段高 24 ⇒ 模型只画一个标题。
 *
 * 新判据：锚点往上 ≤2 跳，收集父容器下**未认领且子树含 TEXT**的兄弟，按「y 间隙最小」归属到
 *   唯一段（防止 6sub-header 同时被 5cards 与 line 争走），再并上「父内无其它已认领段」的父容器。
 *   全程只看 bbox / 父子关系 / 节点类型，**不看任何图层名**。
 */
import { applyFigmaSectionRatios } from './figma-height-ratio.js';

const bb = (x, y, width, height) => ({ x, y, width, height });
const text = (id, name, box) => ({ id, name, type: 'TEXT', characters: name, absoluteBoundingBox: bb(...box) });
const box = (id, name, type, boxArr, children = []) => ({
  id,
  name,
  type,
  absoluteBoundingBox: bb(...boxArr),
  children,
});

/** 复刻 9ed088e3 的结构（命名刻意改成 0sub-header/1统计/5cards 这类"不规范"名字） */
function makeFigma() {
  const root = box('2:9778', 'cp-流量监测', 'FRAME', [0, 0, 426, 807], [
    box('2:3436', 'bg-[m]', 'RECTANGLE', [0, 0, 420, 807]),
    box('2:3550', 'header-', 'GROUP', [23, 0, 380, 33], [
      text('2:3557', '流量监测', [23, 7, 64, 19]),
    ]),
    box('1744:125', 'slot-con', 'FRAME', [0, 46, 426, 745], [
      box('88:32', '0sub-header', 'GROUP', [23, 46, 380, 30], [
        box('2:3559', '标题', 'GROUP', [23, 49, 147, 24], [text('2:3560', '当日总流量', [23, 53, 80, 16])]),
        box('2:3545', '时间范围选择', 'GROUP', [300, 49, 90, 24], [text('2:7674', '24小时', [320, 53, 50, 16])]),
      ]),
      box('2:3660', '1统计', 'FRAME', [0, 76, 426, 91], [
        text('2:3661', '34,620', [40, 100, 70, 28]),
        text('2:3662', '82,379', [240, 100, 70, 28]),
      ]),
      box('1744:127', '2charts', 'FRAME', [23, 177, 379, 131], [text('2:7626', '隧道流量', [40, 190, 80, 16])]),
      box('1744:128', '3charts', 'FRAME', [23, 328, 379, 131], [text('2:7795', '大桥流量', [40, 340, 80, 16])]),
      box('2:3439', '4sub-header', 'GROUP', [20, 476, 86, 24], [text('2:3440', '车型分布', [44, 480, 60, 16])]),
      box('1263:38', '5cards', 'FRAME', [20, 500, 387, 114], [
        text('2:3447', '江阴靖江长江隧道', [40, 520, 120, 13]),
      ]),
      box('2:3565', '6sub-header', 'GROUP', [20, 630, 378, 24], [
        text('2:3572', '流量预测', [20, 634, 60, 16]),
        text('2:3573', '节假日预测', [320, 634, 70, 16]),
      ]),
      box('2:3604', '@echarts/line-7', 'GROUP', [20, 654, 363, 141], [text('2:3637', '实际流量', [40, 660, 60, 16])]),
    ]),
  ]);
  return { document: root };
}

/** 段：id 用真值节点 id；刻意不写 figmaNodeId（真机就是这种形态，走 id 直配路径） */
function makeSections() {
  const mk = (id, name) => ({ id, name, role: '常驻', header: { title: name, controls: [] }, children: [] });
  return [mk('2:3559', '当日总流量'), mk('1744:127', '隧道柱图'), mk('1744:128', '大桥柱图'), mk('1263:38', '车型分布'), mk('2:3604', '流量预测')];
}

const hOf = (sections, id) => {
  const s = sections.find((x) => String(x.id) === id);
  return s ? Number(s.geometryPx?.h ?? s.styles?.figmaHeightPx) : NaN;
};

describe('P0-8 几何并集段高（不看图层名）', () => {
  it('标题锚点段：并上未认领的统计块兄弟 ⇒ 24 升到 121', () => {
    const sections = makeSections();
    const stats = {};
    applyFigmaSectionRatios(sections, makeFigma(), stats);
    // 0sub-header(30) 与 1统计(91) 在 y 上相邻 ⇒ 46..167 = 121
    expect(hOf(sections, '2:3559')).toBe(121);
    expect(stats.geometricUnion).toBeGreaterThanOrEqual(1);
  });

  it('卡片段：并上上方副标题条 ⇒ 114 升到 138（不被下方 line 抢走）', () => {
    const sections = makeSections();
    applyFigmaSectionRatios(sections, makeFigma(), {});
    // 4sub-header(476..500) + 5cards(500..614) = 138
    expect(hOf(sections, '1263:38')).toBe(138);
  });

  it('图表段：并上自己的副标题条 ⇒ 141 升到 165', () => {
    const sections = makeSections();
    applyFigmaSectionRatios(sections, makeFigma(), {});
    // 6sub-header(630..654) + line(654..795) = 165
    expect(hOf(sections, '2:3604')).toBe(165);
  });

  it('副标题条只归属唯一段：6sub-header 不会同时抬高 5cards 与 line 之外的其它段', () => {
    const sections = makeSections();
    applyFigmaSectionRatios(sections, makeFigma(), {});
    // 两个 charts 段没有相邻的未认领兄弟 ⇒ 保持自身高度 131
    expect(hOf(sections, '1744:127')).toBe(131);
    expect(hOf(sections, '1744:128')).toBe(131);
  });

  it('技术标记子树（@echarts）不被当背景条吞进：名称改成 @ant/chart 也不并入', () => {
    const figma = makeFigma();
    const slot = figma.document.children.find((c) => c.id === '1744:125');
    // 在「当日总流量」段下方紧邻位置放一个 @ 开头的技术块（含 TEXT）
    slot.children.push(
      box('99:1', '@ant/chart', 'FRAME', [0, 76, 426, 91], [text('99:2', '假数据', [10, 80, 40, 14])]),
    );
    const sections = makeSections();
    applyFigmaSectionRatios(sections, figma, {});
    // 归属裁决会让 99:1 归给最近段，但技术标记必须被排除 ⇒ 仍是 121
    expect(hOf(sections, '2:3559')).toBe(121);
  });


  it('混合配对补全（P0-8c）：部分段有 figmaNodeId、部分只有 id ⇒ 两者都进并集', () => {
    const sections = makeSections();
    // 模拟真机形态：图表/卡片段带 figmaNodeId，标题段只有 id
    sections.find((x) => x.id === '1744:127').figmaNodeId = '1744:127';
    sections.find((x) => x.id === '1263:38').figmaNodeId = '1263:38';
    sections.find((x) => x.id === '2:3604').figmaNodeId = '2:3604';
    const stats = {};
    applyFigmaSectionRatios(sections, makeFigma(), stats);
    // 只有 id 的标题段依然要拿到并集高度（旧实现会整块跳过 ⇒ 恒 24）
    expect(hOf(sections, '2:3559')).toBe(121);
    expect(stats.idDirectPartial).toBeGreaterThanOrEqual(1);
  });

  it('fail-open：无 bbox 时不做任何修正（保持原值）', () => {
    const sections = [
      { id: 'x', name: 'x', styles: { figmaHeightPx: 24 }, children: [] },
      { id: 'y', name: 'y', styles: { figmaHeightPx: 100 }, children: [] },
    ];
    const figma = { document: { id: 'root', name: 'root', type: 'FRAME', children: [] } };
    expect(() => applyFigmaSectionRatios(sections, figma, {})).not.toThrow();
    expect(Number(sections[0].styles.figmaHeightPx)).toBe(24);
  });
});
