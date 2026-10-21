/**
 * P2 spec（2026-10-21 · 07ae49a2 实锤）：E1 派生子项必须按**阅读序**（y → x）落位，
 * 而不是 Figma `children` 的 z-order（绘制序）。
 *
 * 事故形态：统计卡容器真值子节点 icon(51496) / `合作厂商`(51496) / `33`(51522)，
 * 但 z-order 把 `33` 排在 `合作厂商` 之前 ⇒ 产物「33 在上、合作厂商在下」，与设计稿相反。
 */
import { deriveSectionsFromFigmaTree, compareReadingOrder } from '../section-tree.js';

/** 造节点：TEXT / GROUP 按需 */
const T = (id, name, characters, x, y, w = 64, h = 24) => ({
  id,
  name,
  type: 'TEXT',
  characters,
  absoluteBoundingBox: { x, y, width: w, height: h },
});
const G = (id, name, x, y, w, h, children = []) => ({
  id,
  name,
  type: 'GROUP',
  absoluteBoundingBox: { x, y, width: w, height: h },
  children,
});

/**
 * 卡容器 1:1 复刻真机几何（只保留与顺序相关的节点）：
 *   card(x=50,y=100) 的子节点 z-order = [icon, `33`, `合作厂商`]，但 `合作厂商` 的 y 更小。
 */
const buildTree = () => ({
  document: {
    id: 'root',
    name: 'panel',
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 600 },
    children: [
      G('card', 'Group card', 50, 100, 265, 76, [
        G('icon', 'icon', 70, 113, 53, 55, [
          T('icon-glyph', 'g', '·', 72, 130, 10, 10),
        ]),
        T('v', '33', '33', 147, 139, 28, 28),
        T('l', '合作厂商', '合作厂商', 148, 113, 64, 24),
      ]),
    ],
  },
});

const findSection = (secs, id) => {
  for (const s of secs || []) {
    if (String(s.id) === id) return s;
    const r = findSection(s.children, id);
    if (r) return r;
  }
  return null;
};

/** 子项可见文本序列（裸 TEXT item 用 text，补回段用 name；两者都是人能看见的文案） */
const textsOf = (sec) => (sec.children || []).map((c) => String(c.text ?? c.name ?? ''));

describe('E1 阅读序（P2）', () => {
  it('① 卡内子项顺序 = y 升序（合作厂商 在 33 之前），不是 z-order', () => {
    const d = deriveSectionsFromFigmaTree(buildTree(), null);
    const card = findSection(d.sections, 'card');
    expect(card).toBeTruthy();
    expect(textsOf(card)).toEqual(['icon', '合作厂商', '33']);
  });

  it('② 阴性对照：z-order 与几何同序时结果一致（不制造位移）', () => {
    const tree = buildTree();
    // 把 z-order 改成几何序 ⇒ 排序应为恒等
    tree.document.children[0].children = [
      tree.document.children[0].children[0],
      tree.document.children[0].children[2],
      tree.document.children[0].children[1],
    ];
    const d = deriveSectionsFromFigmaTree(tree, null);
    const card = findSection(d.sections, 'card');
    expect(textsOf(card)).toEqual(['icon', '合作厂商', '33']);
  });

  it('③ 同 y 时按 x 从左到右（横排阅读序）', () => {
    const tree = {
      document: {
        id: 'root',
        name: 'panel',
        type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: 600, height: 400 },
        children: [
          G('row', 'Group row', 20, 40, 500, 60, [
            T('right', 'B', 'B', 300, 50, 80, 24),
            T('left', 'A', 'A', 40, 50, 80, 24),
          ]),
        ],
      },
    };
    const d = deriveSectionsFromFigmaTree(tree, null);
    const row = findSection(d.sections, 'row');
    expect(textsOf(row)).toEqual(['A', 'B']);
  });

  it('④ compareReadingOrder：缺 bbox 的兄弟排末尾（不臆造几何）', () => {
    const withBox = { absoluteBoundingBox: { x: 0, y: 100 } };
    const noBox = {};
    expect([noBox, withBox].sort(compareReadingOrder)).toEqual([withBox, noBox]);
    expect(compareReadingOrder(withBox, noBox)).toBeLessThan(0);
  });
});
