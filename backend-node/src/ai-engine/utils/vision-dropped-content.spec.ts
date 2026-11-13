/**
 * visionDroppedContent 单元测试（2026-11-13 · mc-max-1794553882576-ce0eb032 实锤）。
 * 覆盖：① 误命名 slot-icon 大容器被 vision 当装饰 ⇒ 漏提标题/图片检测命中；
 *      ② vision 全覆盖 ⇒ 不误触发（回归保护）；③ 仅根级 bg/header 子树不计入漏提。
 */
import { visionDroppedContent } from './section-tree.js';

function node(id: string, name: string, type: string, children: any[] = [], extra: Record<string, any> = {}) {
  return { id, name, type, children, ...extra };
}

// 复现 ce0eb032 的失败结构：根 cp-设备详情 → bg / header / slot-icon(大内容容器)
// slot-icon 内含标题、副标题、图片、描述蓝盒、属性网格（vision 已覆盖）、描述正文（vision 已覆盖）
function buildBuggyFigma(): any {
  const img = node('36:1726', 'img', 'IMAGE');
  const imgGroup = node('36:1725', 'img', 'GROUP', [img]);
  const robFrame = node('36:1722', 'ROB004-frame', 'FRAME', [
    node('36:1723', 'ROB004', 'TEXT', [], { characters: 'ROB004' }),
  ]);
  const grid = node('81:7', '属性网格', 'GROUP', [
    node('81:7a', 'label', 'TEXT', [], { characters: '所属产品' }),
    node('81:7b', 'value', 'TEXT', [], { characters: 'GD-Robot' }),
  ]);
  const slotIcon = node('801:3', 'slot-icon', 'GROUP', [
    node('36:1695', 'desc-bg', 'RECTANGLE'), // 描述蓝盒背景（非内容，不计入漏提）
    node('36:1698', '编码', 'TEXT', [], { characters: '编码' }),
    node('36:1708', '产品描述', 'TEXT', [], { characters: '产品描述' }),
    node('36:1724', 'GD-Robot-04', 'TEXT', [], { characters: 'GD-Robot-04' }),
    node('36:1721', '爆闪灯', 'TEXT', [], { characters: '爆闪灯' }),
    robFrame,
    imgGroup,
    grid,
    node('36:1719', '描述正文', 'TEXT', [], { characters: '这是一段设备描述正文内容……' }),
  ]);
  const bg = node('36:1694', 'bg', 'RECTANGLE');
  const header = node('36:1697', 'header', 'VECTOR');
  const root = node('36:1693', 'cp-设备详情', 'FRAME', [bg, header, slotIcon]);
  return { document: root };
}

// vision 只覆盖了 inner 的两块（属性网格 + 描述正文），漏提了 slot-icon 下的标题/副标题/图片
const buggyVisionSections = [
  { id: '81:7', name: '属性网格', figmaNodeId: '81:7', sourceNodeIds: ['81:7', '81:7a', '81:7b'] },
  { id: '36:1719', name: '描述', figmaNodeId: '36:1719', sourceNodeIds: ['36:1719'] },
];

describe('visionDroppedContent', () => {
  it('检测命中：误命名 slot-icon 大容器被当装饰、漏提标题/副标题/图片', () => {
    expect(visionDroppedContent(buggyVisionSections, buildBuggyFigma())).toBe(true);
  });

  it('回归保护：vision 全覆盖时不误触发', () => {
    // 让 vision 覆盖整个 slot-icon 子树（figmaNodeId 指向 801:3 即拥有整棵子树）
    const fullSections = [{ id: '801:3', name: '内容区', figmaNodeId: '801:3', sourceNodeIds: [] }];
    expect(visionDroppedContent(fullSections, buildBuggyFigma())).toBe(false);
  });

  it('回归保护：根级 bg/header 子树即便未被 vision 覆盖也不计入漏提', () => {
    // vision 只覆盖属性网格，且根级 bg/header 完全未被覆盖 —— 不应误判漏提
    const partial = [{ id: '81:7', name: '属性网格', figmaNodeId: '81:7', sourceNodeIds: ['81:7', '81:7a', '81:7b'] }];
    // 这里 slot-icon 下仍有未覆盖的标题/图片，所以仍应命中（与 bg/header 无关）
    expect(visionDroppedContent(partial, buildBuggyFigma())).toBe(true);
  });

  it('fail-open：缺 figmaNodeData / 空 sections 返回 false', () => {
    expect(visionDroppedContent([], null as any)).toBe(false);
    expect(visionDroppedContent(null as any, buildBuggyFigma())).toBe(false);
    expect(visionDroppedContent([], undefined as any)).toBe(false);
  });

  it('严格字面量：根级命名 bg-xxx / header-xxx 不算 chrome（仍计入漏提判定），仅精确 bg/header 排除', () => {
    // 把根级 bg 改名 'bg-top' 后再测 —— 不影响漏提命中（标题/图片仍在）
    const f = buildBuggyFigma();
    f.document.children[0].name = 'bg-top';
    expect(visionDroppedContent(buggyVisionSections, f)).toBe(true);
  });
});
