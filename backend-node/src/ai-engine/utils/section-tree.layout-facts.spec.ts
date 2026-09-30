/**
 * Bug4-① 规格（2026-09-30 · 评审 §8.4 步骤 3 / §4.4）：
 *   `sections[].layout` **只认 A 类布局事实**（`figma-node-layout-facts#buildNodeLayoutFacts`）。
 *
 * 旧口径（B 类几何近似）`xSpread > ySpread` 被「子元素宽度差 / 水平偏移」污染
 * （§4.1 实锤 `598d88fc` 的 `2:3683`）⇒ 本 spec 用同一形态做回归锁。
 * 新值语义：`horizontal` / `vertical` / `grid`（新增）/ `null`（无事实，取消原默认 vertical）。
 */
import { deriveSectionsFromFigmaTree } from './section-tree.js';
import { buildNodeLayoutFacts } from './figma-node-layout-facts.js';

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

/** 构造「根 FRAME → 1 个容器 section（sec1）→ 若干子节点」的 Figma 树 */
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

/** 取 sec1 这个 section */
const sec1Of = (data: unknown, facts: unknown) => {
  const r: any = deriveSectionsFromFigmaTree(data, facts);
  expect(r).not.toBeNull();
  return r.sections.find((s: any) => s.id === 'sec1');
};

const TEXT = (id: string, x: number, y: number, w: number, h: number) => ({
  id,
  name: id,
  type: 'TEXT',
  absoluteBoundingBox: box(x, y, w, h),
  children: [],
});

describe('deriveSectionsFromFigmaTree · layout 只认 A 类布局事实（Bug4-①）', () => {
  it('A 类 row → section.layout = horizontal', () => {
    const data = treeWith([TEXT('a', 0, 0, 100, 100), TEXT('b', 120, 0, 100, 100)]);
    const facts: any = buildNodeLayoutFacts(data);
    expect(facts.sec1.flexDirection).toBe('row');
    expect(sec1Of(data, facts).layout).toBe('horizontal');
  });

  it('A 类 column → section.layout = vertical', () => {
    const data = treeWith([TEXT('a', 0, 0, 100, 100), TEXT('b', 0, 120, 100, 100)]);
    const facts: any = buildNodeLayoutFacts(data);
    expect(facts.sec1.flexDirection).toBe('column');
    expect(sec1Of(data, facts).layout).toBe('vertical');
  });

  it('A 类 grid → section.layout = grid（新增分支：旧 B 类完全无 grid 概念）', () => {
    const data = treeWith([
      TEXT('a', 0, 0, 50, 50),
      TEXT('b', 60, 0, 50, 50),
      TEXT('c', 0, 60, 50, 50),
      TEXT('d', 60, 60, 50, 50),
    ]);
    const facts: any = buildNodeLayoutFacts(data);
    expect(facts.sec1.display).toBe('grid');
    expect(sec1Of(data, facts).layout).toBe('grid');
  });

  it('不传 layoutFacts → layout = null（取消「无事实默认 vertical」）', () => {
    const data = treeWith([TEXT('a', 0, 0, 100, 100), TEXT('b', 0, 120, 100, 100)]);
    // 旧口径会返回 'vertical'（臆造）；新口径必须显式 null
    expect(sec1Of(data, null).layout).toBeNull();
    expect(sec1Of(data, {}).layout).toBeNull();
  });

  it('⭐ 回归锁（598d88fc 的 2:3683 形态）：宽度差 + 水平偏移不得再误判 horizontal', () => {
    // 标题宽 128 起于 x=64；数值宽 77 起于 x=115（右移 51px），y 上真值垂直堆叠
    const data = treeWith([TEXT('title', 64, 10, 128, 20), TEXT('value', 115, 34, 77, 24)]);
    // 旧口径：xSpread=51 > ySpread=24 ⇒ 误判 'horizontal'（该实现已删除）
    const xSpread = 115 - 64;
    const ySpread = 34 - 10;
    expect(xSpread > ySpread).toBe(true); // 复现旧口径的误判条件
    const facts: any = buildNodeLayoutFacts(data);
    expect(facts.sec1.flexDirection).toBe('column'); // A 类真值：y 无重叠 ⇒ 非 side-by-side
    expect(sec1Of(data, facts).layout).toBe('vertical'); // 新口径给出正确方向
  });

  it('所有 section 的 layout 均可由 A 类事实推出（端到端一致性）', () => {
    const data = treeWith([TEXT('a', 0, 0, 100, 100), TEXT('b', 120, 0, 100, 100)]);
    const facts: any = buildNodeLayoutFacts(data);
    const r: any = deriveSectionsFromFigmaTree(data, facts);
    const walk = (secs: any[]) => {
      for (const s of secs || []) {
        if (s.role === 'item') {
          walk(s.children);
          continue;
        }
        const f = facts[String(s.figmaNodeId || s.id)];
        if (!f) {
          expect(s.layout).toBeNull();
        } else if (f.display === 'grid') {
          expect(s.layout).toBe('grid');
        } else {
          expect(s.layout).toBe(f.flexDirection === 'row' ? 'horizontal' : 'vertical');
        }
        walk(s.children);
      }
    };
    walk(r.sections);
  });
});

/**
 * 🛡️ 2026-09-30 复审 P0-1：A 类事实的 `gridColumns` 此前被丢弃（`deriveChildLayout` 只取 `display`）。
 * 本 spec 锁「**只对容器下发**」这条护栏。
 *
 * ⚠️ 护栏理由已更正（2026-09-30 §8.6）——**不是**「叶子下发会点亮 `code-structure-validator` 的
 * LAYOUT-001（severity:'BLOCK'）而该门禁只扫 index.vue `<template>`」：该门禁今天是**死代码**
 * （守卫 `if (options?.layoutStructure?.sections)`，而真实结构为嵌套 `layoutStructure.layout.sections`
 * ⇒ 411/411 产物不可达、近 7 天日志 0 留痕），且它读的是 **vision 的 layoutStructure**，与本文件
 * sections 是**两条互不相通的数据链**。真实理由是「写产物侧仍走 LLM 手写路径
 * （`constraint-reinforcement` 的『内层栅格铁律』未撤 ⇒ 双写）+ 该门禁证据源尚未换成真实产物
 * （直接放开守卫/改递归 = 离线实测 24 条误 BLOCK）」⇒ 叶子侧暂不开，见 `deriveChildGridColumns` 注释。
 */
describe('deriveChildGridColumns · gridColumns 只对容器下发（P0-1）', () => {
  const FRAME = (
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    children: unknown[],
  ) => ({ id, name: id, type: 'FRAME', absoluteBoundingBox: box(x, y, w, h), children });

  /** 2×2 的四个 FRAME 子节点：A 类事实判 grid(2列)，且四个子节点都会被提升为嵌套 section */
  const gridContainerTree = () =>
    treeWith([
      FRAME('s1', 0, 0, 100, 100, [TEXT('t1', 10, 10, 40, 20)]),
      FRAME('s2', 120, 0, 100, 100, [TEXT('t2', 10, 10, 40, 20)]),
      FRAME('s3', 0, 120, 100, 100, [TEXT('t3', 10, 10, 40, 20)]),
      FRAME('s4', 120, 120, 100, 100, [TEXT('t4', 10, 10, 40, 20)]),
    ]);

  it('⭐ 容器（有嵌套 section 子节点）+ A 类 grid → 下发 gridColumns（此前被丢弃）', () => {
    const data = gridContainerTree();
    const facts: any = buildNodeLayoutFacts(data);
    expect(facts.sec1.display).toBe('grid');
    expect(facts.sec1.gridColumns).toBe(2);
    const sec1 = sec1Of(data, facts);
    expect(sec1.layout).toBe('grid');
    expect(sec1.isLayoutContainer).toBe(true);
    expect(sec1.gridColumns).toBe(2);
  });

  it('🔴 叶子（子节点全是 item，非容器）+ A 类 grid → **不下发** gridColumns（护栏：等手写路径撤销 + 门禁换证据源后再开）', () => {
    const data = treeWith([
      TEXT('a', 0, 0, 50, 50),
      TEXT('b', 60, 0, 50, 50),
      TEXT('c', 0, 60, 50, 50),
      TEXT('d', 60, 60, 50, 50),
    ]);
    const facts: any = buildNodeLayoutFacts(data);
    const sec1 = sec1Of(data, facts);
    expect(sec1.layout).toBe('grid');
    expect(sec1.isLayoutContainer).toBeUndefined(); // 叶子
    expect(sec1.gridColumns).toBeUndefined(); // 关键：叶子不下发
  });

  it('非 grid 的容器不下发 gridColumns（避免臆造列数）', () => {
    const data = treeWith([
      FRAME('s1', 0, 0, 100, 100, [TEXT('t1', 10, 10, 40, 20)]),
      FRAME('s2', 0, 120, 100, 100, [TEXT('t2', 10, 10, 40, 20)]),
    ]);
    const facts: any = buildNodeLayoutFacts(data);
    const sec1 = sec1Of(data, facts);
    expect(sec1.isLayoutContainer).toBe(true);
    expect(sec1.layout).toBe('vertical');
    expect(sec1.gridColumns).toBeUndefined();
  });
});
