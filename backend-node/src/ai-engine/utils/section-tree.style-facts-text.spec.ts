/**
 * 🛡️ 2026-10-19 治本（mc-max-1792373861220-5160a2ec「全国」漏收实锤）
 *
 * 事故：`buildSectionStyleFacts` 的样式条目是「**深度优先 + 单一配额闸门**」
 *   （`itemCount >= maxItemsPerSection`），header 段 12 条配额被
 *   `标题img / 标题-线 / Rectangle ×7 / Group 11` 等**装饰图元**耗光 ⇒
 *   排在后面的 TEXT（`48:5902`「全国」）**静默丢失** ⇒ 产物 HeaderSection.vue
 *   **零文本节点**，「全国」选择器整块消失。
 *   实测：配额 12 ⇒ 无「全国」；配额 40 ⇒ 有「全国」。
 *
 * 危害面：**不是某个组件/某条文案的特例**——全量语料 123 份组件审计中
 *   **119 份**的文本真值数因此偏少（0 份变少）。文本只有本通道下发，最易被静默吃掉。
 *
 * 本 spec 锁两条：
 *   ① 纯函数 `pickTextPriorityLines`：文本优先 + **顺序不重排**（顺序本身是真值）；
 *   ② 集成：尾部 TEXT 不再被装饰挤掉（阳性对照 = 本例「全国」形态）。
 */
import { buildSectionStyleFacts, pickTextPriorityLines } from './section-tree.js';

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

/** 构造「根 → 1 个 section（sec1）→ 若干子节点」的 Figma 树 */
const treeWith = (children: unknown[]) => ({
  document: {
    id: 'root',
    name: 'cp-x',
    type: 'FRAME',
    absoluteBoundingBox: box(0, 0, 400, 300),
    children: [
      {
        id: 'sec1',
        name: 'slot-a',
        type: 'FRAME',
        absoluteBoundingBox: box(0, 0, 400, 300),
        children,
      },
    ],
  },
});

const RECT = (id: string, y: number) => ({
  id,
  name: id,
  type: 'RECTANGLE',
  absoluteBoundingBox: box(0, y, 40, 40),
  fills: [{ type: 'SOLID', color: { r: 0, g: 0.4, b: 1 }, opacity: 1 }],
  children: [],
});

const TEXT = (id: string, chars: string, y: number) => ({
  id,
  name: id,
  type: 'TEXT',
  characters: chars,
  absoluteBoundingBox: box(0, y, 100, 20),
  fills: [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 }, opacity: 1 }],
  style: { fontSize: 16 },
  children: [],
});

/** 有效 section（buildSectionStyleFacts 直接吃 planner 的 effectiveSections 形态） */
const sectionsOf = (id: string) => [
  { id, title: 'header', type: 'header', sourceNodeIds: [id] },
];

describe('pickTextPriorityLines · 文本优先裁剪（2026-10-19 治本）', () => {
  it('① 配额不足时：装饰让位，文本全保留', () => {
    const lines = ['d1', 't1', 'd2', 'd3', 't2'];
    const flags = [false, true, false, false, true];
    const r = pickTextPriorityLines(lines, flags, 3);
    // 文本 2 条全留 + 余 1 个配额给最靠前的装饰；输出按原始序（d1 在最前）
    expect(r.lines).toEqual(['d1', 't1', 't2']);
    expect(r.droppedText).toBe(0);
    expect(r.droppedDeco).toBe(2);
  });

  it('② 顺序不重排：输出仍按 Figma 原始序（顺序本身是真值）', () => {
    const lines = ['d1', 't1', 'd2', 't2', 'd3'];
    const flags = [false, true, false, true, false];
    const r = pickTextPriorityLines(lines, flags, 4);
    expect(r.lines).toEqual(['d1', 't1', 'd2', 't2']);
  });

  it('③ 未超配额：原样返回、零丢弃', () => {
    const lines = ['d1', 't1'];
    const r = pickTextPriorityLines(lines, [false, true], 12);
    expect(r.lines).toEqual(lines);
    expect(r.droppedText).toBe(0);
    expect(r.droppedDeco).toBe(0);
  });

  it('④ 文本本身超配额：按序截断并如实报 droppedText（不静默）', () => {
    const lines = ['t1', 't2', 't3', 'd1'];
    const flags = [true, true, true, false];
    const r = pickTextPriorityLines(lines, flags, 2);
    expect(r.lines).toEqual(['t1', 't2']);
    expect(r.droppedText).toBe(1);
  });

  it('⑤ 空/非法输入 fail-open（不抛、不丢）', () => {
    expect(pickTextPriorityLines([], [], 12).lines).toEqual([]);
    expect(pickTextPriorityLines(undefined as any, undefined as any, 12).lines).toEqual([]);
    expect(pickTextPriorityLines(['a'], [true], 0).lines).toEqual(['a']);
  });
});

describe('buildSectionStyleFacts · 尾部 TEXT 不被装饰挤掉（阳性对照：5160a2ec「全国」）', () => {
  // 形态复刻本例 header：11 个装饰矩形在前、2 条 TEXT 在最后（第二条 = 「全国」）
  const data = treeWith([
    ...Array.from({ length: 11 }, (_, i) => RECT(`r${i}`, i * 5)),
    TEXT('t-title', '部署节点概览', 60),
    TEXT('t-region', '全国', 90),
  ]);

  it('🔴 阳性对照：配额 12 被装饰占满时，「全国」仍必须在真值表里', () => {
    const out = buildSectionStyleFacts(sectionsOf('sec1') as any, data as any);
    expect(out).toContain('文字「全国」');
    expect(out).toContain('文字「部署节点概览」');
  });

  it('旧行为（collectCap=12，收集阶段即截断）会丢文本 ⇒ 证明本用例不是假绿', () => {
    const before = buildSectionStyleFacts(sectionsOf('sec1') as any, data as any, {
      collectCap: 12,
    });
    // 旧行为：装饰先占满 12 条 ⇒ 两条 TEXT 全丢（这就是「全国」消失的成因）
    expect(before).not.toContain('文字「全国」');
  });

  it('零文本丢失：onTextTruncated 不被触发', () => {
    let truncated = 0;
    buildSectionStyleFacts(sectionsOf('sec1') as any, data as any, {
      onTextTruncated: () => {
        truncated += 1;
      },
    });
    expect(truncated).toBe(0);
  });
});
