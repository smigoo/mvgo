/**
 * 🛡️ P0-8c（2026-11-17 · mc-max-1794870462702-5401e49e 实锤）：同层重叠文本归属判据。
 *
 * 真机：弹窗顶部「两统计卡横向并排（各 265×76 同 y）」，卡面文本「33/合作厂商」「66/在线设备」
 *   是父容器（slot-icon）**直接子级裸 TEXT**——E1 孤儿吸收轨不跑（vision 锚完备）、
 *   P0-8b 不收数字（宽 28<40）、标题条与两卡 y 重叠 gap 平手先到先得
 *   ⇒ 右卡错挂左卡标题、全部卡面文本丢失 ⇒ LLM 两卡同文「合作厂商 33」。
 *
 * 判据：TEXT 与段锚点盒重叠 >50% 且恰好一个段命中 ⇒ 精确归属（0/1 分布无平手）；
 *   处置：header.title（无标题时取 y 最小文本）+ sourceNodeIds 追加 + body.items（阅读序 ≤8 项）。
 */
import { absorbSiblingTextsIntoSections } from './section-plan-coverage.js';

const bb = (x, y, width, height) => ({ x, y, width, height });
const text = (id, chars, boxArr) => ({
  id,
  name: chars,
  type: 'TEXT',
  characters: chars,
  absoluteBoundingBox: bb(...boxArr),
});
const box = (id, name, type, boxArr, children = []) => ({
  id,
  name,
  type,
  absoluteBoundingBox: bb(...boxArr),
  children,
});

/** 5401e49e 形态复刻：slot-icon(796:3) 下 5 GROUP + 4 裸 TEXT 同层 */
function make5401Figma() {
  return {
    document: box('38:3134', 'cp-合作厂商弹窗', 'FRAME', [0, 0, 660, 868], [
      box('38:3135', 'bg', 'RECTANGLE', [0, 0, 660, 868]),
      box('38:3136', 'header', 'VECTOR', [628, 20, 10, 10]),
      box('796:3', 'slot-icon', 'GROUP', [28, 52, 604, 787], [
        box('38:3137', 'Group 2136638432', 'GROUP', [28, 161, 604, 161], [
          text('38:3139', '战略合作厂商', [48, 186, 96, 16]),
        ]),
        box('38:3162', 'Group 2136638433', 'GROUP', [28, 342, 604, 212], [
          text('38:3166', '优质厂商', [48, 367, 64, 16]),
        ]),
        box('38:3206', 'Group 2136638434', 'GROUP', [28, 574, 604, 265], [
          text('38:3210', '普通厂商', [48, 599, 64, 16]),
        ]),
        // 左统计卡 GROUP（子树只有背景+icon，无文本）
        box('38:3260', 'Group 2136638431', 'GROUP', [34, 52, 265, 76], [
          box('38:3261', 'Rectangle 346241391', 'VECTOR', [34, 52, 265, 76]),
          box('187:262', 'icon', 'GROUP', [54, 65, 53, 55]),
        ]),
        // 右统计卡 GROUP
        box('38:3282', 'Group 2136638435', 'GROUP', [363, 52, 265, 76], [
          box('38:3283', 'Rectangle 346241391', 'VECTOR', [363, 52, 265, 76]),
          box('187:263', 'icon', 'GROUP', [383, 65, 53, 55]),
        ]),
        // 四个裸 TEXT：卡面文本，与卡 GROUP 同层（父 = slot-icon）
        text('38:3262', '33', [131, 90, 28, 28]),
        text('38:3263', '合作厂商', [131, 65, 64, 24]),
        text('38:3284', '66', [460, 90, 28, 28]),
        text('38:3285', '在线设备', [460, 65, 64, 24]),
      ]),
    ]),
  };
}

const mkSections = () => [
  { id: '38:3282', type: 'stats', sourceNodeIds: ['38:3282', '38:3288'], children: [] },
  { id: '38:3260', type: 'stats', sourceNodeIds: ['38:3260', '38:3281'], children: [] },
  { id: '38:3137', type: 'table', sourceNodeIds: ['38:3137'], children: [] },
  { id: '38:3162', type: 'table', sourceNodeIds: ['38:3162'], children: [] },
  { id: '38:3206', type: 'table', sourceNodeIds: ['38:3206'], children: [] },
];

describe('P0-8c 同层重叠文本归属', () => {
  it('⭐ 阳性（5401e49e 复刻）：两卡各自精确归属标题+数字，天然无平手', () => {
    const sections = mkSections();
    const r = absorbSiblingTextsIntoSections({ sections, figmaNodeData: make5401Figma() });
    expect(r.stats.absorbed).toBeGreaterThanOrEqual(4);

    const right = sections.find((s) => s.id === '38:3282')!;
    const left = sections.find((s) => s.id === '38:3260')!;
    // 右卡：在线设备 + 66（真值归属，不再是「合作厂商」）
    expect(right.header?.title).toBe('在线设备');
    expect(right.sourceNodeIds).toContain('38:3284');
    expect(right.sourceNodeIds).toContain('38:3285');
    // 左卡：合作厂商 + 33
    expect(left.header?.title).toBe('合作厂商');
    expect(left.sourceNodeIds).toContain('38:3262');
    expect(left.sourceNodeIds).toContain('38:3263');
    // 交叉错挂消失：右卡不得含左卡文本 id
    expect(right.sourceNodeIds).not.toContain('38:3263');
    expect(left.sourceNodeIds).not.toContain('38:3285');
  });

  it('body.items 通道：无 items 的段补阅读序文本项（≤8 项）', () => {
    const sections = mkSections();
    absorbSiblingTextsIntoSections({ sections, figmaNodeData: make5401Figma() });
    const left = sections.find((s) => s.id === '38:3260')!;
    const items = left.body?.items;
    expect(Array.isArray(items)).toBe(true);
    // 阅读序：标题（y=65）在数字（y=90）之前
    expect(items![0].text).toBe('合作厂商');
    expect(items![1].text).toBe('33');
  });

  it('不覆盖 vision 已有 header.title / body.items（幂等且不越权）', () => {
    const sections = mkSections();
    const right = sections.find((s) => s.id === '38:3282')!;
    right.header = { title: '既有真值' };
    right.body = { items: [{ text: '既有文本' }] };
    absorbSiblingTextsIntoSections({ sections, figmaNodeData: make5401Figma() });
    expect(right.header.title).toBe('既有真值');
    expect(right.body.items).toEqual([{ text: '既有文本' }]);
  });

  it('骑缝文本（≥2 段都 >50% 重叠）fail-open 不归属', () => {
    const figma = {
      document: box('r', 'root', 'FRAME', [0, 0, 400, 200], [
        // 两段完全重叠的脏数据 + 一条骑缝文本
        box('a', 'A', 'GROUP', [0, 0, 200, 100], []),
        box('b', 'B', 'GROUP', [0, 0, 200, 100], []),
        text('t1', '骑缝', [50, 40, 100, 20]),
      ]),
    };
    const sections = [
      { id: 'a', type: 'card', sourceNodeIds: ['a'], children: [] },
      { id: 'b', type: 'card', sourceNodeIds: ['b'], children: [] },
    ];
    const r = absorbSiblingTextsIntoSections({ sections, figmaNodeData: figma });
    expect(r.stats.absorbed).toBe(0);
  });

  it('fail-open：无树/无段 ⇒ 原样返回', () => {
    const sections = mkSections();
    expect(
      absorbSiblingTextsIntoSections({ sections, figmaNodeData: null }).stats.absorbed,
    ).toBe(0);
    expect(
      absorbSiblingTextsIntoSections({ sections: [], figmaNodeData: make5401Figma() }).stats
        .absorbed,
    ).toBe(0);
  });
});
