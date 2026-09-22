/**
 * item 级几何分组事实检测（figma-item-facts）单测
 * golden 数据来自 mc-1790048059931-ee5c1c5f 真机实锤（2026-09-22）：
 *  - 摄像机卡 2:8438：icon(27x32) 左 + 文本列右（摄像机/(2/484) x=1557 对齐，y 递增）
 *  - ContentActive line1：总数:/56302 横排（x 递增 y 对齐）
 *  - icon 组内空 TEXT（0x3 装饰占位）不阻断纯资产判定
 */
import { describe, expect, it } from '@jest/globals';
import { buildItemLevelFacts } from '../figma-item-facts.js';

function txt(id, chars, x, y, w, h) {
  return { id, type: 'TEXT', name: chars, characters: chars, absoluteBoundingBox: { x, y, width: w, height: h } };
}
function grp(id, name, x, y, w, h, children = []) {
  return { id, type: 'GROUP', name, absoluteBoundingBox: { x, y, width: w, height: h }, children };
}
function vec(id, name, x, y, w, h) {
  return { id, type: 'VECTOR', name, absoluteBoundingBox: { x, y, width: w, height: h } };
}

function cardFigmaRoot() {
  // 摄像机卡真值骨架（几何与 2:8438 一致）
  const card = grp('2:8438', 'card', 1518, 550, 117, 64, [
    grp('2:8439', 'bg', 1518, 550, 117, 64, [vec('2:8440', 'v1', 1518, 550, 117, 64)]),
    txt('2:8442', '摄像机', 1557, 563, 36, 18),
    txt('2:8443', '(2/484)', 1557, 585, 55, 21),
    grp('2:8444', 'icon', 1524, 566, 27, 32, [
      { id: '2:8445', type: 'RECTANGLE', name: 'r', absoluteBoundingBox: { x: 1524, y: 564, width: 26, height: 26 } },
      grp('2:8446', 'inner', 1524, 566, 27, 32, [
        vec('2:8447', 'v', 1524, 586, 27, 12),
        txt('2:8457', '', 1526, 582, 0, 3.16), // 空装饰 TEXT
      ]),
    ]),
  ]);
  return { document: { id: '0:0', type: 'DOCUMENT', name: 'root', children: [card] } };
}

function rowFigmaRoot() {
  // ContentActive line1 真值骨架：总数: 56302 横排
  const line = grp('2:8428', 'line1', 100, 200, 120, 18, [
    txt('2:8429', '总数:', 100, 200, 36, 18),
    txt('2:8430', '56302', 140, 200, 50, 18),
  ]);
  return { document: { id: '0:0', type: 'DOCUMENT', name: 'root', children: [line] } };
}

describe('buildItemLevelFacts', () => {
  it('纵排列：同父 TEXT x 对齐 y 递增 → textStack column（含 gap 与实测 box）', () => {
    const facts = buildItemLevelFacts(cardFigmaRoot());
    const f = facts['2:8438'];
    expect(f).toBeTruthy();
    expect(f.textStack.flexDirection).toBe('column');
    expect(f.textStack.texts.map((t) => t.characters)).toEqual(['摄像机', '(2/484)']);
    expect(f.textStack.gapPx).toBe(4);
  });

  it('icon 实测尺寸：纯资产组（含空 TEXT 装饰）→ siblingAssets 含 27x32 且 isIcon', () => {
    const facts = buildItemLevelFacts(cardFigmaRoot());
    const assets = facts['2:8438'].siblingAssets;
    expect(assets).toBeTruthy();
    const icon = assets.find((a) => a.name === 'icon');
    expect(icon).toBeTruthy();
    expect(icon.widthPx).toBe(27);
    expect(icon.heightPx).toBe(32);
    expect(icon.isIcon).toBe(true);
    // bg 铺满父容器 → isIcon false
    const bg = assets.find((a) => a.name === 'bg');
    expect(bg.isIcon).toBe(false);
  });

  it('横排行：x 递增 y 对齐 → textRow row（不误报 textStack）', () => {
    const facts = buildItemLevelFacts(rowFigmaRoot());
    const f = facts['2:8428'];
    expect(f.textRow).toBeTruthy();
    expect(f.textRow.flexDirection).toBe('row');
    expect(f.textStack).toBeUndefined();
  });

  it('空 / 非对象输入 → 空 map（fail-open）', () => {
    expect(buildItemLevelFacts(null)).toEqual({});
    expect(buildItemLevelFacts(undefined)).toEqual({});
    expect(buildItemLevelFacts(42)).toEqual({});
  });
});
