/**
 * 方向感知兄弟序 + 行内图元豁免（2026-11-17 · 73:3「list 内 icon 脱离行」根治）。
 *
 * 病灶（两条同源，均以 A 类布局事实为**单一判据来源**，零硬编码、命名无关）：
 *   ① 兄弟排序恒为 **y 主序**（`compareReadingOrder`）——其注释称「这正是横向 flex-flow 的
 *      自然序」，**该论断有误**：横向流的主轴是 x，y 主序只在兄弟同 y 时与 x 主序等价。
 *      真实设计稿行内元素**垂直居中且高度不等**（73:3 `1:377` 行：icon `1:385` 28×28 居中
 *      y=221；同级 TEXT `1:384/1:387` y=214 高 43）⇒ y 主序把 icon 排到行尾（右侧）。
 *   ② 图标容器（`1:385`，含 1 个 VECTOR）满足「有子节点」⇒ 被 `shouldPromoteToSection`
 *      提升为**独立嵌套 section**，脱离所属行的真实兄弟结构 ⇒ 下游按段切分，icon 与文本
 *      被拆到不同结构单元（真机产物 `index.vue`：`ContentTailText` + 独立 `ContentSection`）。
 *
 * 判据（见 `section-tree.js#isRowParent` / `#isInlineGraphicAtom`）：
 *   · 方向感知排序：父级 **横排且 high** ⇒ x 主序（同 x 回退 y）；其余（column/grid/无事实/
 *     **low**）⇒ 既有 y 主序，逐字不变。限定 high 与注入器 T2 闸
 *     （`layout-facts-injector#LOW_SKIP_SOURCES`）**同一纪律**（low 存在「多行带被几何误判成
 *     一行」的实锤形态 `30:1091`）。
 *   · 行内图元豁免三条**同时**满足方生效：① 子树无可读文本（纯图形）② 面积 < 父级 15%
 *     ③ 父级横排且 high。
 *   · 「降级不丢弃」：豁免后同一谓词兜底 —— 与已提升兄弟重叠 >50% ⇒ 吸收为其 inline item；
 *     否则并入孤儿带 ⇒ **全树渲染态零净丢失**。
 */
import { deriveSectionsFromFigmaTree } from './section-tree.js';
import { buildNodeLayoutFacts } from './figma-node-layout-facts.js';

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

const VECTOR = (id: string, x: number, y: number, w: number, h: number) => ({
  id,
  name: id,
  type: 'VECTOR',
  absoluteBoundingBox: box(x, y, w, h),
  children: [],
});

const TEXT = (id: string, x: number, y: number, w: number, h: number, characters: string) => ({
  id,
  name: id,
  type: 'TEXT',
  characters,
  absoluteBoundingBox: box(x, y, w, h),
  children: [],
});

const FRAME = (id: string, x: number, y: number, w: number, h: number, children: unknown[]) => ({
  id,
  name: id,
  type: 'FRAME',
  absoluteBoundingBox: box(x, y, w, h),
  children,
});

/** 构造「根 FRAME → 1 个容器 section（sec1，指定 bbox）→ 若干子节点」的 Figma 树 */
const treeWithBox = (secBox: unknown, children: unknown[]) => ({
  document: {
    id: 'root',
    name: 'cp-x',
    type: 'FRAME',
    absoluteBoundingBox: box(0, 0, 400, 300),
    children: [{ id: 'sec1', name: 'slot-a', type: 'FRAME', absoluteBoundingBox: secBox, children }],
  },
});

const sec1Of = (data: unknown, facts: unknown): any => {
  const r: any = deriveSectionsFromFigmaTree(data, facts);
  expect(r).not.toBeNull();
  return r.sections.find((s: any) => s.id === 'sec1');
};

const idsOf = (node: any): string[] => ((node?.children || []) as any[]).map((c) => String(c.id));

/** 渲染态 id 集合（排除 `-tail-text` / `-orphan-text-N` 合成段的 id，它们不是 Figma 节点） */
const renderedIds = (secs: any[], out: string[] = []): string[] => {
  for (const s of secs || []) {
    const id = String(s?.id || '');
    if (id && !/-tail-text$|-orphan-text-\d+$/.test(id)) out.push(id);
    renderedIds(s?.children, out);
  }
  return out;
};

/** 手造 A 类事实的合法字段口径（与 `deriveChildLayout` 读取的键一致） */
const ROW_HIGH = { sec1: { display: 'flex', flexDirection: 'row', confidence: 'high' } };
const ROW_LOW = { sec1: { display: 'flex', flexDirection: 'row', confidence: 'low' } };
const COL_HIGH = { sec1: { display: 'flex', flexDirection: 'column', confidence: 'high' } };

/**
 * 73:3 `1:377` 行的等价形态：386×50 的横排行，含 28×28 纯图形图标（占父级 4.06%）
 * 与两个高 43 的文本（垂直居中 ⇒ y 比图标**更靠上**）。
 */
const warningRowTree = () =>
  treeWithBox(box(0, 0, 386, 50), [
    FRAME('1:385', 0, 11, 28, 28, [VECTOR('1:386', 2, 4, 24.375, 20.625)]),
    TEXT('1:384', 40, 3, 150, 43, '环境温度'),
    TEXT('1:387', 200, 3, 150, 43, '正常'),
  ]);

describe('deriveSectionsFromFigmaTree · 方向感知兄弟序（2026-11-17 · A 类事实为唯一判据）', () => {
  /** y 序与 x 序**相反**的横排行：left(x=0,y=12) / right(x=200,y=0) */
  const yxOppositeTree = () =>
    treeWithBox(box(0, 0, 386, 50), [
      FRAME('right', 200, 0, 150, 50, [TEXT('rt', 210, 10, 120, 20, '右侧块')]),
      FRAME('left', 0, 12, 150, 38, [TEXT('lt', 10, 10, 120, 20, '左侧块')]),
    ]);

  it('⭐ 横排 + high 父级 ⇒ x 主序（纠正 y 主序把左块排到右块之后的旧行为）', () => {
    const data = yxOppositeTree();
    const facts: any = buildNodeLayoutFacts(data);
    // 前提（阳性对照）：A 类事实确实是横排 high
    expect(facts.sec1.flexDirection).toBe('row');
    expect(facts.sec1.confidence).toBe('high');
    // 旧口径（y 主序）会给出 ['right','left']（right y=0 < left y=12）
    expect(idsOf(sec1Of(data, facts))).toEqual(['left', 'right']);
  });

  it('横排但 low 置信 ⇒ 退回 y 主序（与注入器 T2 闸同纪律，避免多行带被交错）', () => {
    const data = yxOppositeTree();
    expect(idsOf(sec1Of(data, ROW_LOW))).toEqual(['right', 'left']);
  });

  it('纵排 + high ⇒ y 主序（逐字不变）', () => {
    const data = yxOppositeTree();
    expect(idsOf(sec1Of(data, COL_HIGH))).toEqual(['right', 'left']);
  });

  it('无布局事实 ⇒ y 主序（不臆造方向）', () => {
    const data = yxOppositeTree();
    expect(idsOf(sec1Of(data, null))).toEqual(['right', 'left']);
    expect(idsOf(sec1Of(data, {}))).toEqual(['right', 'left']);
  });
});

describe('deriveSectionsFromFigmaTree · 行内图元豁免（2026-11-17 · 73:3 list 内 icon 脱离行）', () => {
  it('⭐ 行内纯图形原子（无文本 ∧ 4.06% 面积 ∧ 横排 high）⇒ 不提升，作为同级 item 留在行内原位', () => {
    const data = warningRowTree();
    const facts: any = buildNodeLayoutFacts(data);
    expect(facts.sec1.flexDirection).toBe('row');
    expect(facts.sec1.confidence).toBe('high');
    const sec1 = sec1Of(data, facts);
    // 三兄弟全部 item 化（图标不再是独立 section），且绿化后按 x 主序：icon 在最左
    expect(idsOf(sec1)).toEqual(['1:385', '1:384', '1:387']);
    for (const c of sec1.children) expect(c.role).toBe('item');
    // 图标保留自身子树（VECTOR 真值不丢）
    const icon = sec1.children.find((c: any) => c.id === '1:385');
    expect(icon.role).toBe('item');
    expect(idsOf(icon)).toEqual(['1:386']);
  });

  it('阴性① 父级非 high（low）⇒ 维持既有提升行为（爆炸半径收敛到 high 横排）', () => {
    const sec1 = sec1Of(warningRowTree(), ROW_LOW);
    const icon = sec1.children.find((c: any) => c.id === '1:385');
    expect(icon).toBeDefined();
    expect(icon.role).not.toBe('item'); // 仍被提升为嵌套 section
    expect(icon.isNestedSection).toBe(true);
  });

  it('阴性② 父级纵排 ⇒ 不豁免（图元不在行内流）', () => {
    const sec1 = sec1Of(warningRowTree(), COL_HIGH);
    const icon = sec1.children.find((c: any) => c.id === '1:385');
    expect(icon).toBeDefined();
    expect(icon.role).not.toBe('item');
  });

  it('阴性③ 原子子树含 ≥2 字可读文本 ⇒ 不豁免（承载文本的容器是内容，不是图元）', () => {
    const data = treeWithBox(box(0, 0, 386, 50), [
      FRAME('1:385', 0, 11, 28, 28, [TEXT('1:386', 2, 4, 24, 20, '温度')]),
      TEXT('1:384', 40, 3, 150, 43, '环境温度'),
      TEXT('1:387', 200, 3, 150, 43, '正常'),
    ]);
    const sec1 = sec1Of(data, ROW_HIGH);
    const icon = sec1.children.find((c: any) => c.id === '1:385');
    expect(icon).toBeDefined();
    expect(icon.role).not.toBe('item');
  });

  it('阴性④ 面积 ≥ 父级 15% ⇒ 不豁免（非行内小图元，是主体内容块）', () => {
    const data = treeWithBox(box(0, 0, 386, 50), [
      FRAME('big', 0, 0, 200, 40, [VECTOR('bv', 10, 10, 100, 20)]),
      TEXT('1:384', 210, 3, 150, 43, '环境温度'),
    ]);
    const sec1 = sec1Of(data, ROW_HIGH);
    const big = sec1.children.find((c: any) => c.id === 'big');
    expect(big).toBeDefined();
    expect(big.role).not.toBe('item');
  });
});

describe('deriveSectionsFromFigmaTree · 行内图元「降级不丢弃」（零净丢失）', () => {
  /** 豁免原子（ic）与已提升兄弟（card）几何重叠 100% */
  const overlappingAtomTree = () =>
    treeWithBox(box(0, 0, 386, 50), [
      FRAME('card', 0, 0, 200, 50, [TEXT('ct', 10, 10, 120, 20, '卡片标题')]),
      FRAME('ic', 10, 11, 28, 28, [VECTOR('iv', 2, 4, 24, 20)]),
      TEXT('1:387', 240, 3, 120, 43, '正常'),
    ]);

  /** 豁免原子（ic）与任何已提升兄弟都不重叠（card 在右、ic 在左） */
  const isolatedAtomTree = () =>
    treeWithBox(box(0, 0, 386, 50), [
      FRAME('card', 180, 0, 200, 50, [TEXT('ct', 190, 10, 120, 20, '卡片标题')]),
      FRAME('ic', 0, 11, 28, 28, [VECTOR('iv', 2, 4, 24, 20)]),
      TEXT('1:387', 40, 3, 120, 43, '正常'),
    ]);

  it('⭐ 重叠 >50% 已提升兄弟 ⇒ 吸收为该兄弟 inline item（不新建段、兄弟 bbox 不动）', () => {
    const sec1 = sec1Of(overlappingAtomTree(), ROW_HIGH);
    const card = sec1.children.find((c: any) => c.id === 'card');
    expect(card).toBeDefined();
    expect(idsOf(card)).toEqual(['ct', 'ic']); // 吸收为 inline item
    expect(card.sourceNodeIds).toContain('ic'); // 资源归属可见
    // 不在 sec1 层重复出现（零双渲）
    expect(sec1.children.filter((c: any) => c.id === 'ic')).toHaveLength(0);
  });

  it('⭐ 不与任何兄弟重叠 ⇒ 并入孤儿带（sourceNodeIds / children 均含之）', () => {
    const sec1 = sec1Of(isolatedAtomTree(), ROW_HIGH);
    const band = sec1.children.find((c: any) => c.orphanTailText === true);
    expect(band).toBeDefined();
    expect(band.sourceNodeIds).toContain('ic');
    expect(idsOf(band)).toContain('ic');
  });

  it('⭐ 两种归宿下全树渲染态**零净丢失**（原子及其子树均可达）', () => {
    for (const [label, tree] of [
      ['absorb', overlappingAtomTree()],
      ['orphan', isolatedAtomTree()],
    ] as const) {
      const sec1 = sec1Of(tree, ROW_HIGH);
      const all = renderedIds([sec1]);
      for (const must of ['sec1', 'ic', 'iv']) {
        expect({ label, id: must, present: all.includes(must) }).toEqual({ label, id: must, present: true });
      }
    }
  });
});
