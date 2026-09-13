/**
 * 刀 4（2026-09-13）：assignedVarName 视觉序编号。
 * 根因：vehicle 三卡背景文档序 3→2→1（右→左），旧实现按 mapping 遍历序编号 → bg1 落最右卡，
 * LLM「bg1=第一张卡从左往右」装配 → DOM 右→左颠倒。
 * 治本：同 role 内先按 figmaBox.y（行间，取整抗抖动）再按 x（行内）升序 → bg1=视觉最左。
 */
import { assignVisualOrderVarNames } from '../../utils/visual-order-assign.js';

const mk = (role, x, y) => ({
  previewAnalysisRole: role,
  figmaBox: { x, y, width: 100, height: 40 },
});

describe('assignVisualOrderVarNames（视觉序编号）', () => {
  test('vehicle 三卡：文档序 右→左，编号后 bg1=最左', () => {
    // 文档遍历序 3→2→1（右→左）：x=274(右超高)、x=166(中重型)、x=37(左危化)
    const items = [
      { m: mk('bg', 274, 100), role: 'bg' }, // 右 超高 19
      { m: mk('bg', 166, 100), role: 'bg' }, // 中 重型 2
      { m: mk('bg', 37, 100), role: 'bg' }, // 左 危化 51
    ];
    assignVisualOrderVarNames(items);
    expect(items[0].m.assignedVarName).toBe('bg3'); // 最右
    expect(items[1].m.assignedVarName).toBe('bg2'); // 中
    expect(items[2].m.assignedVarName).toBe('bg1'); // 最左
  });

  test('纵向多行：按 y 升序，bg1=最上', () => {
    const items = [
      { m: mk('bg', 10, 300), role: 'bg' },
      { m: mk('bg', 10, 100), role: 'bg' },
      { m: mk('bg', 10, 200), role: 'bg' },
    ];
    assignVisualOrderVarNames(items);
    const byY = [...items].sort((a, b) => a.m.figmaBox.y - b.m.figmaBox.y);
    expect(byY.map((i) => i.m.assignedVarName)).toEqual(['bg1', 'bg2', 'bg3']);
  });

  test('同 y 微抖动（<0.5px）抗抖动：仍按 x 行内排序', () => {
    const items = [
      { m: mk('bg', 274, 100.3), role: 'bg' },
      { m: mk('bg', 37, 100.1), role: 'bg' },
      { m: mk('bg', 166, 100.4), role: 'bg' },
    ];
    assignVisualOrderVarNames(items);
    const byX = [...items].sort((a, b) => a.m.figmaBox.x - b.m.figmaBox.x);
    expect(byX.map((i) => i.m.assignedVarName)).toEqual(['bg1', 'bg2', 'bg3']);
  });

  test('bg / icon 分桶独立编号，互不干扰', () => {
    const items = [
      { m: mk('icon', 90, 100), role: 'icon' },
      { m: mk('bg', 37, 100), role: 'bg' },
      { m: mk('icon', 20, 100), role: 'icon' },
      { m: mk('bg', 274, 100), role: 'bg' },
    ];
    assignVisualOrderVarNames(items);
    // 按原始插入索引断言（编号是就地改写，不重排数组）
    expect(items[1].m.assignedVarName).toBe('bg1'); // bg(37) 最左
    expect(items[3].m.assignedVarName).toBe('bg2'); // bg(274)
    expect(items[2].m.assignedVarName).toBe('icon1'); // icon(20) 最左
    expect(items[0].m.assignedVarName).toBe('icon2'); // icon(90)
  });

  test('非 bg/icon/img 角色不参与编号（保持无 assignedVarName）', () => {
    const other = { previewAnalysisRole: 'unknown', figmaBox: { x: 0, y: 0 } };
    const items = [{ m: other, role: 'unknown' }];
    assignVisualOrderVarNames(items);
    expect(other.assignedVarName).toBeUndefined();
  });

  test('空数组 / 非数组 → 安全返回', () => {
    expect(assignVisualOrderVarNames([])).toEqual([]);
    expect(assignVisualOrderVarNames(null)).toEqual([]);
  });
});
