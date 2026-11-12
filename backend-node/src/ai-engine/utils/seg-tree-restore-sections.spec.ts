/**
 * 🔴 B（2026-11-12 · mc-max-1794458950336-47b996c3 实锤）：F1a 丢段必须能**归因**，
 * 「缺了几段」≠「缺的是不是真缺口」。
 *
 * ## 病灶（真机）
 * vision 段树 3 段（`565:2` 头部区域 / `565:3` 内容区 / `48:5888` 底部汇总），
 * planner 出口只剩 1 段（`565:3`）：
 * - `565:2` 被 `isPureDecorationSection` 误删（body 只有「标题线 + 图标」两片装饰叶，
 *   而 `header.title='部署节点概览'`、`header.controls=['全国','关闭按钮']` 根本不在 body 扫描域内）
 *   ⇒ 该段**确凿可补建**（restorable）；
 * - `48:5888` 被 `section-header-merge` 作为「父段标题条」吞并（`ratio=0.028`）
 *   ⇒ 其 figma 父链落在出口段 `565:3` 内，内容由该段消费，**不可补建**（否则同一串渲染两次）。
 * 旧 F1a 只打 `missing=2` 一行 WARN（reportOnly），两种性质完全不同的缺口混为一谈。
 *
 * ## 判据（三分类 + 两类不可判）
 * - `skipIds` 命中 ⇒ `dedupeDropped`（合法去重收敛）；
 * - figma 祖先链命中出口段 ⇒ `absorbed`（内容由该段消费）；
 * - 其余顶层 ⇒ `restorable`（深拷贝补回）；
 * - 无 figma 索引 / 节点不存在 ⇒ `undecidable`；嵌套层缺口 ⇒ `nestedMissing`（均 fail-open 不拦）；
 * - `blocked = missingAfter > 0 || nestedMissing > 0`，其中 `missingAfter` 只统计
 *   **未被解释**的缺口（absorbed / dedupeDropped 已解释 ⇒ 不计）。
 *
 * ## 本文件守的回归锚
 * ① absorbed 不得计入 missingAfter（否则 `48:5888` 恒报缺口 ⇒ blocked 恒真 = 判据自我否定）；
 * ② 入参 `exitSections` 不得被原位修改（纯函数契约）；
 * ③ 插入位置按 vision 序、绝不整体重排。
 */
import { restoreMissingSections, auditSegTreeIntegrity } from './seg-tree-integrity.js';

/** 构造 figma 索引（与 indexFigmaNodes 同契约：`{parentId, rawNode}`）。 */
function makeFigmaIndex(pairs) {
  const index = new Map();
  for (const [id, parentId] of Object.entries(pairs)) {
    index.set(String(id), { id: String(id), parentId: parentId == null ? null : String(parentId), rawNode: { id: String(id) } });
  }
  return index;
}

/** vision 段最小形态（真机 visual.json 实测字段，无 type/items/title 扁平键）。 */
function visionSection(id, name, headerTitle) {
  return {
    id,
    name,
    role: '常驻',
    layout: 'horizontal',
    headerRelation: headerTitle ? 'title-same-row' : 'no-header',
    slotCandidate: null,
    ...(headerTitle ? { header: { title: headerTitle, controls: [] } } : {}),
    body: { layout: 'horizontal', children: [] },
    styles: {},
    geometryPx: { h: 30 },
  };
}

/** 出口段最小形态（planner 归一化后的扁平键）。 */
function exitSection(id, title) {
  return { id, title: title || null, type: null, body: { layout: 'horizontal', children: [] }, sourceNodeIds: [id] };
}

describe('restoreMissingSections（F1b 丢段归因）', () => {
  // ── ① restorable：确凿缺口，补建且形态为 vision 深拷贝 ──────────────────
  it('① 无 figma 祖先归属的丢段 ⇒ restorable，按 vision 序插回且 title 回退到 header.title', () => {
    const vision = [visionSection('565:2', '头部区域', '部署节点概览'), visionSection('565:3', '内容区')];
    const exit = [exitSection('565:3', '内容区')];
    const figmaIndex = makeFigmaIndex({ '565:2': '48:5796', '565:3': '48:5796', '48:5796': null });

    const r = restoreMissingSections(vision, exit, { figmaIndex, skipIds: [] });

    expect(r.restored).toHaveLength(1);
    expect(r.restored[0]).toMatchObject({ id: '565:2', at: 0, title: '部署节点概览' });
    expect(r.sections.map((s) => s.id)).toEqual(['565:2', '565:3']);
    expect(r.missingBefore).toBe(1);
    expect(r.missingAfter).toBe(0);
    expect(r.blocked).toBe(false);
  });

  // ── ② absorbed：figma 祖先链落在出口段内 ⇒ 不补建 ──────────────────────
  it('② figma 祖先链命中出口段 ⇒ absorbed，不补建（避免同一串渲染两次）', () => {
    const vision = [visionSection('565:3', '内容区'), visionSection('48:5888', '底部汇总')];
    const exit = [exitSection('565:3', '内容区')];
    // 真机原型：48:5888 的 figma 父节点就是 565:3
    const figmaIndex = makeFigmaIndex({ '565:3': '48:5796', '48:5888': '565:3', '48:5796': null });

    const r = restoreMissingSections(vision, exit, { figmaIndex, skipIds: [] });

    expect(r.restored).toHaveLength(0);
    expect(r.absorbed).toEqual([{ id: '48:5888', ancestor: '565:3' }]);
    expect(r.sections.map((s) => s.id)).toEqual(['565:3']);
  });

  // ── ③ 关键回归锚：absorbed 不得计入 missingAfter ────────────────────────
  it('③ absorbed 已解释缺口 ⇒ missingAfter=0、blocked=false（防判据自我否定）', () => {
    const vision = [visionSection('565:3', '内容区'), visionSection('48:5888', '底部汇总')];
    const exit = [exitSection('565:3', '内容区')];
    const figmaIndex = makeFigmaIndex({ '565:3': '48:5796', '48:5888': '565:3', '48:5796': null });

    const r = restoreMissingSections(vision, exit, { figmaIndex, skipIds: [] });

    // missingBefore 记 1（48:5888 确实不在出口），但缺口已被「吸收」解释 ⇒ 不得计入 after
    expect(r.missingBefore).toBe(1);
    expect(r.missingAfter).toBe(0);
    expect(r.blocked).toBe(false);
  });

  // ── ④ dedupeDropped：显式去重收敛，不得被补建推翻 ───────────────────────
  it('④ skipIds 命中 ⇒ dedupeDropped，不补建', () => {
    const vision = [visionSection('36:1642', '重复段', '重复标题'), visionSection('565:3', '内容区')];
    const exit = [exitSection('565:3', '内容区')];
    const figmaIndex = makeFigmaIndex({ '36:1642': '48:5796', '565:3': '48:5796', '48:5796': null });

    const r = restoreMissingSections(vision, exit, { figmaIndex, skipIds: ['36:1642'] });

    expect(r.restored).toHaveLength(0);
    expect(r.dedupeDropped).toEqual(['36:1642']);
    expect(r.sections.map((s) => s.id)).toEqual(['565:3']);
    expect(r.missingAfter).toBe(0); // dedupeDropped 同样是「已解释」缺口
    expect(r.blocked).toBe(false);
  });

  // ── ⑤ undecidable：观测能力缺失必须 fail-open，不得误拦 ──────────────────
  it('⑤ 无 figmaIndex ⇒ undecidable 且不拦（fail-open）', () => {
    const vision = [visionSection('565:2', '头部区域', '部署节点概览')];
    const exit = [];

    const r = restoreMissingSections(vision, exit, { figmaIndex: null, skipIds: [] });

    expect(r.restored).toHaveLength(0);
    expect(r.undecidable).toEqual([{ id: '565:2', reason: 'noFigmaIndex' }]);
    expect(r.blocked).toBe(false);
  });

  it('⑥ figma 索引里没有该节点 ⇒ undecidable:figmaNodeMissing（不拦）', () => {
    const vision = [visionSection('565:2', '头部区域', '部署节点概览')];
    const exit = [];
    const figmaIndex = makeFigmaIndex({ '565:3': '48:5796' });

    const r = restoreMissingSections(vision, exit, { figmaIndex, skipIds: [] });

    expect(r.undecidable).toEqual([{ id: '565:2', reason: 'figmaNodeMissing' }]);
    expect(r.restored).toHaveLength(0);
    expect(r.blocked).toBe(false);
  });

  // ── ⑦ nestedMissing：嵌套层不得跨层补建，但必须可拦 ──────────────────────
  it('⑦ 嵌套层缺口 ⇒ nestedMissing 只计数、不补建，且 blocked=true', () => {
    // 口径：collectSectionIdMap 按 `sec.children` 递归（不是 body.children），
    // 与 auditSegTreeIntegrity 同源；此处用同一字段构造，避免「spec 绿但真机口径不同」。
    const vision = [
      {
        id: '48:5796',
        name: '根',
        headerRelation: 'no-header',
        body: { layout: 'vertical', children: [] },
        children: [{ id: '99:1', name: '嵌套子段', headerRelation: 'no-header', body: { children: [] } }],
      },
    ];
    const exit = [exitSection('48:5796', '根')];
    const figmaIndex = makeFigmaIndex({ '48:5796': null, '99:1': '48:5796' });

    const r = restoreMissingSections(vision, exit, { figmaIndex, skipIds: [] });

    expect(r.restored).toHaveLength(0); // 顶层不补（它已在出口）
    expect(r.nestedMissing).toEqual(['99:1']); // 嵌套层只记账
    expect(r.blocked).toBe(true); // 嵌套缺口是确凿缺口 ⇒ 可拦
  });

  // ── ⑧ 纯函数契约：入参不得被原位修改 ────────────────────────────────────
  it('⑧ 不原位修改入参 exitSections（纯函数契约）', () => {
    const vision = [visionSection('565:2', '头部区域', '部署节点概览'), visionSection('565:3', '内容区')];
    const exit = [exitSection('565:3', '内容区')];
    const figmaIndex = makeFigmaIndex({ '565:2': '48:5796', '565:3': '48:5796', '48:5796': null });

    const r = restoreMissingSections(vision, exit, { figmaIndex, skipIds: [] });

    expect(exit).toHaveLength(1); // 入参长度不变
    expect(exit[0].id).toBe('565:3');
    expect(r.sections).not.toBe(exit); // 返回新数组
    expect(r.sections[0]).not.toBe(vision[0]); // 深拷贝，不是引用
  });

  // ── ⑨ 插入位置：绝不整体重排，只插到 vision 序对应位置 ────────────────────
  it('⑨ 中间段缺失 ⇒ 插到 vision 序下一个存活兄弟之前（不重排既有段）', () => {
    const vision = [
      visionSection('A', '首段'),
      visionSection('B', '中段'),
      visionSection('C', '末段'),
    ];
    const exit = [exitSection('A', '首段'), exitSection('C', '末段')];
    const figmaIndex = makeFigmaIndex({ A: 'root', B: 'root', C: 'root', root: null });

    const r = restoreMissingSections(vision, exit, { figmaIndex, skipIds: [] });

    expect(r.sections.map((s) => s.id)).toEqual(['A', 'B', 'C']);
    expect(r.restored[0]).toMatchObject({ id: 'B', at: 1 });
  });

  it('⑩ 无存活兄弟 ⇒ 追加末尾', () => {
    const vision = [visionSection('Z', '孤立段')];
    const exit = [exitSection('A', '首段')];
    const figmaIndex = makeFigmaIndex({ Z: 'root', A: 'root', root: null });

    const r = restoreMissingSections(vision, exit, { figmaIndex, skipIds: [] });

    expect(r.sections.map((s) => s.id)).toEqual(['A', 'Z']);
    expect(r.restored[0]).toMatchObject({ id: 'Z', at: 1 });
  });

  // ── ⑪ 真机语料端到端复刻（含 A/B 互锁）────────────────────────────────────
  it('⑪ 真机三段语料：565:2 restorable + 48:5888 absorbed ⇒ missingAfter=0、blocked=false', () => {
    const vision = [
      visionSection('565:2', '头部区域', '部署节点概览'),
      visionSection('565:3', '内容区'),
      visionSection('48:5888', '底部汇总'),
    ];
    // 修复前的真机出口：只有 565:3（565:2 被 decoration-filter 误删、48:5888 被 header-merge 吞并）
    const exit = [exitSection('565:3', '内容区')];
    const figmaIndex = makeFigmaIndex({
      '565:2': '48:5796',
      '565:3': '48:5796',
      '48:5888': '565:3',
      '48:5796': null,
    });

    const r = restoreMissingSections(vision, exit, { figmaIndex, skipIds: [] });

    expect(r.restored.map((x) => x.id)).toEqual(['565:2']);
    expect(r.absorbed).toEqual([{ id: '48:5888', ancestor: '565:3' }]);
    expect(r.sections.map((s) => s.id)).toEqual(['565:2', '565:3']);
    expect(r.missingBefore).toBe(2);
    expect(r.missingAfter).toBe(0);
    expect(r.blocked).toBe(false);
  });

  // ── ⑫ 与 F1a 同源：归因总数必须能对上 F1a 的 missing ──────────────────────
  it('⑫ restorable + absorbed + dedupeDropped + undecidable 之和 = F1a missing 数', () => {
    const vision = [
      visionSection('565:2', '头部区域', '部署节点概览'),
      visionSection('565:3', '内容区'),
      visionSection('48:5888', '底部汇总'),
      visionSection('99:9', '无索引段'),
    ];
    const exit = [exitSection('565:3', '内容区')];
    const figmaIndex = makeFigmaIndex({ '565:2': '48:5796', '565:3': '48:5796', '48:5888': '565:3', '48:5796': null });

    const f1a = auditSegTreeIntegrity(vision, exit);
    const r = restoreMissingSections(vision, exit, { figmaIndex, skipIds: [] });
    const classified =
      r.restored.length + r.absorbed.length + r.dedupeDropped.length + r.undecidable.length;

    expect(f1a.missing.length).toBe(3); // 565:2 / 48:5888 / 99:9
    expect(classified).toBe(3); // 三分类必须穷尽，不允许有段「无归因地消失」
  });
});
