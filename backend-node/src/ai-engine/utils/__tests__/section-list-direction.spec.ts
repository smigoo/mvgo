import { describe, expect, it } from '@jest/globals';
import {
  resolveListMemberDirection,
  inferListGeometryDirection,
} from '../section-list-direction.js';

/**
 * 🔴 刀55（2026-11-03 · mc-max-1793668153798-e0bf38e9 实锤）回归锁：
 * 列表成员方向 —— **几何可证 ⇒ Figma 真值胜过声明/缺省**。
 *
 * 病灶：vision 段级 `layout:"vertical"` 描述「标题/内容堆叠轴」（136:122 今日累计 =
 * 标题在上），不是「重复成员轴」；三张统计卡横排（同 y、x 递增，几何完整可证）却被
 * `declared||'column'` 判成 column ⇒ 三卡纵向堆叠、整段布局尽毁。plan 折叠段还常丢
 * `body.layout` ⇒ 旧逻辑的双声明冲突仲裁分支根本进不去。
 */

/** e0bf38e9 真值三卡盒（figma 136:129/128/127：y 全同、x 递增） */
const ROW_BOXES = [
  { x: 37, y: 984, w: 140.48, h: 74.195 },
  { x: 166, y: 984, w: 120, h: 74.195 },
  { x: 274, y: 984, w: 141, h: 74.195 },
];

/** 真纵列（同 x、y 递增）—— 保证修复不把真 column 翻成 row */
const COLUMN_BOXES = [
  { x: 37, y: 100, w: 100, h: 30 },
  { x: 37, y: 140, w: 100, h: 30 },
  { x: 37, y: 180, w: 100, h: 30 },
];

describe('刀55 resolveListMemberDirection · 几何可证即真值', () => {
  it('病灶形态①：plan 丢 body.layout，段级 layout=vertical（vision 堆叠轴）⇒ 几何 row 胜出', () => {
    const r = resolveListMemberDirection({ id: '136:122', layout: 'vertical' }, { cardBoxes: ROW_BOXES });
    expect(r.direction).toBe('row');
    expect(r.directionSource).toBe('geometry-overrides-declared');
  });

  it('病灶形态②：折叠段无任何 layout 声明 ⇒ 旧逻辑 default column，现在几何 row 胜出', () => {
    const r = resolveListMemberDirection({ id: '136:122' }, { cardBoxes: ROW_BOXES });
    expect(r.direction).toBe('row');
    expect(r.directionSource).toBe('geometry-overrides-default');
  });

  it('零回归：几何与声明一致 ⇒ 仍走 declared（不产生新档位）', () => {
    const r = resolveListMemberDirection({ id: 'x', layout: 'horizontal' }, { cardBoxes: ROW_BOXES });
    expect(r.direction).toBe('row');
    expect(r.directionSource).toBe('declared');
  });

  it('零回归：几何不可证（缺盒）⇒ 声明仍胜（宁缺勿猜）', () => {
    const r = resolveListMemberDirection({ id: 'x', layout: 'vertical' }, { cardBoxes: [ROW_BOXES[0], null as any] });
    expect(r.direction).toBe('column');
    expect(r.directionSource).toBe('declared');
  });

  it('零回归：真纵列 + 段级 vertical ⇒ column 不被翻转', () => {
    const r = resolveListMemberDirection({ id: 'x', layout: 'vertical' }, { cardBoxes: COLUMN_BOXES });
    expect(r.direction).toBe('column');
    expect(r.directionSource).toBe('declared');
  });

  it('零回归：双声明冲突 ⇒ 原仲裁分支逐字不变', () => {
    const r = resolveListMemberDirection(
      { id: 'x', layout: 'vertical', body: { layout: 'horizontal-3-columns' } },
      { cardBoxes: ROW_BOXES },
    );
    expect(r.direction).toBe('row');
    expect(r.directionSource).toBe('geometry-conflict');
  });

  it('inferListGeometryDirection 保守性：两轴都变 ⇒ null（不猜）', () => {
    expect(
      inferListGeometryDirection([
        { x: 10, y: 10, w: 50, h: 20 },
        { x: 80, y: 90, w: 50, h: 20 },
      ]),
    ).toBeNull();
  });
});
