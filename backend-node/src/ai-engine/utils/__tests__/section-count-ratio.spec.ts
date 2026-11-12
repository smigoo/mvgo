/**
 * A1 段数比门禁（2026-11-11 · 方案 docs/2026-11-11-A1段数比门禁方案.md）
 *
 * 判据：ratio = leafSections / max(figmaTop, visionSections)
 *   ≤4 pass / >4 trim（保内容合并）/ >8 blocked / 缺真值 fail-open
 *
 * 阳性对照（真机形态锁定）：
 *   - 417bde2c：26 叶 / base=3（figmaTop=3）⇒ ratio 8.67 ⇒ blocked
 *   - d30c05b4：26 叶 / base=2（vision=2）⇒ ratio 13 ⇒ blocked
 *   - 0fa7f33d：4 叶 / base=3（figmaTop=3）⇒ ratio 1.33 ⇒ pass
 *   - ce412a37：8 叶 / base=3 ⇒ ratio 2.67 ⇒ pass
 *   - 中间带：10 叶 / base=2 ⇒ ratio 5 ⇒ trim
 */
import {
  auditSectionCountRatio,
  SECTION_COUNT_RATIO_LIMIT,
  SECTION_COUNT_RATIO_HARD,
} from '../section-plan-coverage.js';

const mkLeaf = (id, elementCount = 1) => ({ id, elementCount, body: { items: [{ text: `t-${id}` }] } });
// 🛡️ 容器段须带 isLayoutContainer:true，否则 collectLeafSections 不会递归其 children（与 planner 真实结构一致）
const mkContainer = (id, children) => ({ id, children, isLayoutContainer: true });

describe('A1 段数比门禁 auditSectionCountRatio', () => {
  it('⭐ 阳性（417bde2c 形态）：26 叶 / base=3 ⇒ 软阻断（裁剪，**不打断任务**）', () => {
    const leaves = Array.from({ length: 26 }, (_, i) => mkLeaf(`s-${i}`, 3));
    const r = auditSectionCountRatio({ leafSections: 26, figmaTop: 3, visionSections: 2, sections: [mkContainer('root', leaves)] });
    expect(r.evaluated).toBe(true);
    expect(r.base).toBe(3);
    // 🛡️ 2026-11-13 放宽：硬阻断已取消 ⇒ verdict 由 'blocked' 降为 'trim'（裁剪不丢内容），
    //   质量裁决移交下游 acceptance。旧行为抛 PlanningGateError 打死整个任务。
    expect(r.verdict).toBe('trim');
    expect(r.softBlocked).toBe(true);
    expect(r.ratio).toBeCloseTo(26 / 3, 1);
  });

  it('⭐ 阳性（d30c05b4 形态）：26 叶 / base=2（vision 赢）⇒ 软阻断', () => {
    const r = auditSectionCountRatio({ leafSections: 26, figmaTop: 1, visionSections: 2 });
    expect(r.base).toBe(2);
    expect(r.verdict).toBe('trim');
    expect(r.softBlocked).toBe(true);
  });

  it('⭐ 合理深嵌套 ratio 在 4-8 且无碎片 ⇒ pass（不裁剪，避免误伤）', () => {
    // 10 叶 / base=2 ⇒ ratio=5（4-8 区间），但段都合理大（ec 1-10，仅 2 个 ec<3，碎片占比 0.2<0.3）⇒ 过拆不显著 ⇒ pass 不裁剪
    const leaves = Array.from({ length: 10 }, (_, i) => mkLeaf(`s-${i}`, i + 1));
    const r = auditSectionCountRatio({
      leafSections: 10,
      figmaTop: 2,
      visionSections: 1,
      sections: [mkContainer('host', leaves)],
    });
    expect(r.verdict).toBe('pass');
    expect(r.base).toBe(2);
    expect(r.fragmentRatio).toBeLessThan(0.3);
    expect(r.trimmed).toHaveLength(0);
  });

  it('⭐ 阴性（0fa7f33d 形态）：4 叶 / base=3 ⇒ pass（ratio 1.33）', () => {
    const r = auditSectionCountRatio({ leafSections: 4, figmaTop: 3, visionSections: 2 });
    expect(r.verdict).toBe('pass');
    expect(r.trimmed).toHaveLength(0);
  });

  it('⭐ 阴性（ce412a37 形态）：8 叶 / base=3 ⇒ pass（ratio 2.67 < LIMIT 4）', () => {
    const r = auditSectionCountRatio({ leafSections: 8, figmaTop: 3 });
    expect(r.verdict).toBe('pass');
  });

  it('fail-open：无真值基准（figmaTop=0 且 vision=0）⇒ 不拦截', () => {
    const r = auditSectionCountRatio({ leafSections: 50, figmaTop: 0, visionSections: 0 });
    expect(r.evaluated).toBe(false);
    expect(r.skippedReason).toBe('no-truth-baseline');
    expect(r.verdict).toBe('pass');
  });

  it('fail-open：无叶子段 ⇒ 不拦截', () => {
    const r = auditSectionCountRatio({ leafSections: 0, figmaTop: 3 });
    expect(r.evaluated).toBe(false);
    expect(r.verdict).toBe('pass');
  });

  it('阈值常量与方案文档一致（LIMIT=4 / HARD=8）', () => {
    expect(SECTION_COUNT_RATIO_LIMIT).toBe(4);
    expect(SECTION_COUNT_RATIO_HARD).toBe(8);
  });

  it('临界：ratio 恰等于 LIMIT（8/2=4）⇒ pass（判据是严格大于）', () => {
    const r = auditSectionCountRatio({ leafSections: 8, figmaTop: 2 });
    expect(r.verdict).toBe('pass');
  });

  it('临界：ratio 恰等于 HARD（16/2=8）且段合理大 ⇒ pass（判据是严格大于，且过拆不显著不裁剪）', () => {
    const leaves = Array.from({ length: 16 }, (_, i) => mkLeaf(`s-${i}`, i + 1));
    const r = auditSectionCountRatio({
      leafSections: 16,
      figmaTop: 2,
      sections: [mkContainer('host', leaves)],
    });
    expect(r.verdict).toBe('pass');
  });
});

describe('A1 段数比门禁·2026-11-12 量纲修正与精准判定', () => {
  it('⭐ 真值递归叶 base 生效：深嵌套 18叶/truthLeaf=18 ⇒ pass（不再误伤合理深嵌套）', () => {
    const r = auditSectionCountRatio({
      leafSections: 18,
      figmaTop: 3,
      visionSections: 2,
      truthLeafSections: 18,
    });
    expect(r.base).toBe(18);
    expect(r.baseIsTopLevel).toBe(false);
    expect(r.ratio).toBeCloseTo(1, 1);
    expect(r.verdict).toBe('pass');
  });

  it('⭐ 真值叶 base + 真过拆碎片 ⇒ 软阻断裁剪（bbf827f0 真实形态：truthLeaf=2, leaf=27, 碎片占比高）', () => {
    const leaves = Array.from({ length: 27 }, (_, i) =>
      mkLeaf(i % 2 === 0 ? `2:878${i}-tail-text` : `2:879${i}`, 1),
    );
    const r = auditSectionCountRatio({
      leafSections: 27,
      figmaTop: 3,
      visionSections: 2,
      truthLeafSections: 2, // 真实 visual.json 仅 2 顶层扁平段
      sections: [mkContainer('root', leaves)],
    });
    expect(r.base).toBe(2);
    expect(r.ratio).toBeCloseTo(13.5, 1);
    expect(r.fragmentRatio).toBeGreaterThan(0.3);
    // 🛡️ 2026-11-13 放宽：真过拆**仍被处理**（裁剪），只是不再打死任务 ⇒ 交 acceptance 裁决
    expect(r.verdict).toBe('trim');
    expect(r.softBlocked).toBe(true);
    expect(r.trimmed.length).toBeGreaterThan(0);
  });

  it('⭐ 过拆碎片在 trim 带（4<ratio≤8）⇒ trim（保留 base×LIMIT 叶子，内容并回宿主）', () => {
    // truthLeaf=2, leaf=10(含 tail-text 碎片) ⇒ ratio=5，过拆显著 ⇒ 裁剪到 base×LIMIT=8
    const leaves = Array.from({ length: 10 }, (_, i) =>
      mkLeaf(i < 4 ? `2:878${i}-tail-text` : `2:879${i}`, 1),
    );
    const r = auditSectionCountRatio({
      leafSections: 10,
      figmaTop: 2,
      visionSections: 1,
      truthLeafSections: 2,
      sections: [mkContainer('root', leaves)],
    });
    expect(r.verdict).toBe('trim');
    expect(r.base).toBe(2);
    const kept = r.sections[0].children.filter(Boolean);
    expect(kept.length).toBe(8);
    expect(r.trimmed.length).toBe(2);
    expect(r.trimmed.every((t) => t.mergedInto === 'root')).toBe(true);
  });

  it('⭐ 真值叶 base 准 + 深嵌套大段（过拆不显著, ratio>8）⇒ pass（不阻断不裁剪）', () => {
    // 段都合理大（ec=5, 无 tail-text），真值叶=3 但 planner 产出 30 个大段 ⇒ ratio=10
    const leaves = Array.from({ length: 30 }, (_, i) => mkLeaf(`big-${i}`, 5));
    const r = auditSectionCountRatio({
      leafSections: 30,
      figmaTop: 3,
      visionSections: 2,
      truthLeafSections: 3,
      sections: [mkContainer('root', leaves)],
    });
    expect(r.baseIsTopLevel).toBe(false);
    expect(r.fragmentRatio).toBe(0);
    expect(r.avgElementCount).toBe(5);
    expect(r.verdict).toBe('pass'); // 过拆不显著 ⇒ 视为合理深嵌套，不阻断不裁剪
  });

  it('⭐ 欠生成观测：leaf=2 明显 < figmaTop=18 ⇒ underGenerated=true（不阻断，仍 pass）', () => {
    const r = auditSectionCountRatio({
      leafSections: 2,
      figmaTop: 18,
      visionSections: 10,
      truthLeafSections: 18,
    });
    expect(r.underGenerated).toBe(true);
    expect(r.ratio).toBeCloseTo(2 / 18, 2);
    expect(r.verdict).toBe('pass'); // 欠生成不阻断，交下游 acceptance
  });

  it('⭐ 顶层降级回退：无 truthLeafSections ⇒ base=max(figmaTop,vision)，baseIsTopLevel=true（软阻断）', () => {
    const r = auditSectionCountRatio({
      leafSections: 26,
      figmaTop: 3,
      visionSections: 2,
      sections: [mkContainer('root', Array.from({ length: 26 }, (_, i) => mkLeaf(`s-${i}`)))],
    });
    expect(r.base).toBe(3);
    expect(r.baseIsTopLevel).toBe(true);
    expect(r.baseSource).toBe('top-level');
    expect(r.verdict).toBe('trim');
    expect(r.softBlocked).toBe(true);
  });
});

/**
 * 🛡️ 2026-11-13 治本（生产实锤 mc-max-1794459907233-547bfb75 · 13:05:52「段数比门禁阻断」）
 *
 * 病灶：`Number(s.elementCount) || 0` 把「元素**未计量**」与「计量为 **0**」压成同一个 0
 * ⇒ 未计量段被当成碎片段（frag=1.00）且拉低均值（avgEc=0.0）⇒ overSplitSignificant=true
 * ⇒ ratio>8 时直接 blocked ⇒ 生产任务 ratio=15 必败。
 *
 * 指纹对照（判别依据）：
 *   - 真过拆 bbf827f0：碎片段 elementCount=1（**计量到 1**，小但已计量）；
 *   - 本次生产：avgEc **精确 0.0**（15/15 段均无计数）⇒ 0 是「未计量」的指纹。
 *   根因：V-5 局部展开（deriveSectionsFromFigmaTree）产的段**根本不产 elementCount 字段**。
 */
describe('A1 段数比门禁·2026-11-13 未计量≠计量为0', () => {
  // Figma 树派生段的真实形态：无 elementCount 字段，带 _expandedFrom 溯源标记
  const mkFigmaDerivedLeaf = (id) => ({ id, _expandedFrom: '1:486' });

  it('⭐ 生产实况：15 段全未计量（Figma 派生段）⇒ 不再误杀（pass），ratio 仍>8', () => {
    const leaves = Array.from({ length: 15 }, (_, i) => mkFigmaDerivedLeaf(`1:${500 + i}`));
    const r = auditSectionCountRatio({
      leafSections: 15,
      figmaTop: 3,
      visionSections: 1,
      truthLeafSections: 1,
      sections: [mkContainer('root', leaves)],
    });
    expect(r.evaluated).toBe(true);
    expect(r.base).toBe(1);
    expect(r.ratio).toBeCloseTo(15, 1);
    // 指纹：全部未计量
    expect(r.measuredLeafCount).toBe(0);
    expect(r.unmeasuredLeafCount).toBe(15);
    expect(r.featuresUnmeasured).toBe(true);
    expect(r.avgElementCount).toBe(0);
    expect(r.fragmentRatio).toBe(0);
    // 关键断言：ratio 仍 > HARD 8，但不再 blocked（不因「未计量」误杀）
    expect(r.verdict).toBe('pass');
    expect(r.trimmed).toHaveLength(0);
  });

  it('⭐ 真过拆不被放过：已计量段为碎片（ec=1）+ 部分未计量 ⇒ 仍软阻断裁剪', () => {
    const leaves = [
      ...Array.from({ length: 3 }, (_, i) => ({ id: `2:878${i}`, elementCount: 1 })),
      ...Array.from({ length: 12 }, (_, i) => mkFigmaDerivedLeaf(`1:${600 + i}`)),
    ];
    const r = auditSectionCountRatio({
      leafSections: 15,
      figmaTop: 3,
      visionSections: 1,
      truthLeafSections: 1,
      sections: [mkContainer('root', leaves)],
    });
    expect(r.measuredLeafCount).toBe(3);
    expect(r.unmeasuredLeafCount).toBe(12);
    expect(r.featuresUnmeasured).toBe(false);
    expect(r.fragmentRatio).toBe(1); // 3/3 已计量段全是碎片
    expect(r.verdict).toBe('trim');
    expect(r.softBlocked).toBe(true);
  });

  it('⭐ 「计量为 0」≠「未计量」：显式 elementCount=0 的段仍算碎片（不豁免）', () => {
    const leaves = Array.from({ length: 10 }, (_, i) => ({ id: `s-${i}`, elementCount: 0 }));
    const r = auditSectionCountRatio({
      leafSections: 10,
      figmaTop: 2,
      visionSections: 1,
      truthLeafSections: 2,
      sections: [mkContainer('root', leaves)],
    });
    expect(r.measuredLeafCount).toBe(10);
    expect(r.unmeasuredLeafCount).toBe(0);
    expect(r.fragmentRatio).toBe(1); // ec=0 < 3 ⇒ 全部碎片
    expect(r.verdict).toBe('trim'); // ratio=5 ⇒ 裁剪（内容并回宿主，不丢）
  });

  it('⭐ sections 未提供 ⇒ 仍保守判过拆显著（软阻断，不打死任务）', () => {
    const r = auditSectionCountRatio({ leafSections: 26, figmaTop: 1, visionSections: 2 });
    expect(r.measuredLeafCount).toBe(0);
    expect(r.unmeasuredLeafCount).toBe(0);
    expect(r.featuresUnmeasured).toBe(false); // sections 未提供 ≠ 全未计量
    expect(r.verdict).toBe('trim');
    expect(r.softBlocked).toBe(true);
  });
});

/**
 * 🛡️ 2026-11-13 治本·层2 + 放宽（181 个真实任务语料标定）
 *
 * 根治层2：**base 改用「Figma 真值层段数」** —— 分子分母同源同层。
 *   分子 = 规划产出树的叶子数；分母 = 设计稿真值层（deriveSectionsFromFigmaTree 全树）的叶子数。
 *   旧口径分母取「展开前」的量纲（vision 递归叶 / Figma 顶层块），分子却是「展开后」的量纲
 *   ⇒ V-5 把 1 个粗段换成 N 个真值段时比值必然暴涨（生产实锤 ratio=15 打死正常任务）。
 *
 * 放宽：硬阻断取消 ⇒ 超阈值降级为「裁剪 + 强告警」，质量裁决交下游 acceptance。
 */
describe('A1 段数比门禁·2026-11-13 真值层 base + 取消硬阻断', () => {
  const mkFigmaDerivedLeaf = (id) => ({ id, _expandedFrom: '1:486' });

  it('⭐ 真值层 base 优先于 vision 递归叶（分子分母同层）', () => {
    const r = auditSectionCountRatio({
      leafSections: 15,
      figmaTop: 3,
      visionSections: 1,
      truthLeafSections: 1,      // vision 口径（展开前）
      truthLayerSections: 15,    // 真值口径（展开后）—— 应优先
    });
    expect(r.base).toBe(15);
    expect(r.baseSource).toBe('truth-layer');
    expect(r.baseIsTopLevel).toBe(false);
    expect(r.ratio).toBeCloseTo(1, 2); // 规划段数 == 真值段数 ⇒ 正常
    expect(r.verdict).toBe('pass');
  });

  it('⭐ 生产实况 2.0：真值层 15 / 规划叶子 15 ⇒ ratio=1.00（pass，绝不误杀）', () => {
    const leaves = Array.from({ length: 15 }, (_, i) => mkFigmaDerivedLeaf(`1:${500 + i}`));
    const r = auditSectionCountRatio({
      leafSections: 15,
      figmaTop: 3,
      visionSections: 1,
      truthLeafSections: 1,
      truthLayerSections: 15,
      sections: [mkContainer('root', leaves)],
    });
    expect(r.base).toBe(15);
    expect(r.ratio).toBeCloseTo(1, 2);
    expect(r.verdict).toBe('pass');
    expect(r.softBlocked).toBe(false);
    expect(r.trimmed).toHaveLength(0);
  });

  it('⭐ 真过拆仍被裁剪处理：真值层 5 / 规划叶子 24 ⇒ ratio=4.8 ⇒ trim（内容不丢）', () => {
    // 语料实锤 417bde2c：truth=5, plan=24, status=failed
    const leaves = Array.from({ length: 24 }, (_, i) => ({ id: `s-${i}`, elementCount: 1 }));
    const r = auditSectionCountRatio({
      leafSections: 24,
      figmaTop: 3,
      visionSections: 2,
      truthLeafSections: 2,
      truthLayerSections: 5,
      sections: [mkContainer('root', leaves)],
    });
    expect(r.base).toBe(5);
    expect(r.baseSource).toBe('truth-layer');
    expect(r.ratio).toBeCloseTo(4.8, 1);
    expect(r.verdict).toBe('trim');
    expect(r.trimmed.length).toBeGreaterThan(0);
  });

  it('⭐ 硬阻断永不出现：verdict 只可能是 pass / trim（门禁不再打死任务）', () => {
    const cases = [
      { leafSections: 26, figmaTop: 3, visionSections: 2 },
      { leafSections: 27, figmaTop: 3, visionSections: 2, truthLeafSections: 2 },
      { leafSections: 50, figmaTop: 0, visionSections: 0 },
      { leafSections: 15, figmaTop: 3, visionSections: 1, truthLeafSections: 1, truthLayerSections: 1 },
    ];
    for (const c of cases) {
      const r = auditSectionCountRatio({ ...c, sections: [mkContainer('root', Array.from({ length: c.leafSections }, (_, i) => mkLeaf(`s-${i}`, 1)))] });
      expect(['pass', 'trim']).toContain(r.verdict);
    }
  });
});
