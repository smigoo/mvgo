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
const mkContainer = (id, children) => ({ id, children });

describe('A1 段数比门禁 auditSectionCountRatio', () => {
  it('⭐ 阳性（417bde2c 形态）：26 叶 / base=3 ⇒ blocked（ratio 8.67 > HARD 8）', () => {
    const leaves = Array.from({ length: 26 }, (_, i) => mkLeaf(`s-${i}`, 3));
    const r = auditSectionCountRatio({ leafSections: 26, figmaTop: 3, visionSections: 2, sections: [mkContainer('root', leaves)] });
    expect(r.evaluated).toBe(true);
    expect(r.base).toBe(3);
    expect(r.verdict).toBe('blocked');
    expect(r.ratio).toBeCloseTo(26 / 3, 1);
  });

  it('⭐ 阳性（d30c05b4 形态）：26 叶 / base=2（vision 赢）⇒ blocked', () => {
    const r = auditSectionCountRatio({ leafSections: 26, figmaTop: 1, visionSections: 2 });
    expect(r.base).toBe(2);
    expect(r.verdict).toBe('blocked');
  });

  it('⭐ 中间带：10 叶 / base=2 ⇒ trim（保留 base×LIMIT 个叶子，内容并回宿主）', () => {
    const leaves = Array.from({ length: 10 }, (_, i) => mkLeaf(`s-${i}`, i + 1));
    const r = auditSectionCountRatio({
      leafSections: 10,
      figmaTop: 2,
      visionSections: 1,
      sections: [mkContainer('host', leaves)],
    });
    expect(r.verdict).toBe('trim');
    expect(r.base).toBe(2);
    // 保留 base×LIMIT = 2×4 = 8 个叶子
    const kept = r.sections[0].children.filter(Boolean);
    expect(kept.length).toBe(8);
    // 被裁的是 elementCount 最小的 2 个（s-0/s-1）
    const keptIds = kept.map((s) => s.id);
    expect(keptIds).not.toContain('s-0');
    expect(keptIds).not.toContain('s-1');
    // 宿主容器吸收被裁叶子的 items（内容不丢）
    expect(r.trimmed.length).toBe(2);
    expect(r.trimmed.every((t) => t.mergedInto === 'host')).toBe(true);
    expect(r.sections[0].children.some((s) => s?.body?.items?.length > 0) || r.trimmed.every((t) => t.mergedInto === 'host')).toBe(true);
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

  it('临界：ratio 恰等于 HARD（16/2=8）⇒ trim（判据是严格大于）', () => {
    const leaves = Array.from({ length: 16 }, (_, i) => mkLeaf(`s-${i}`, i + 1));
    const r = auditSectionCountRatio({
      leafSections: 16,
      figmaTop: 2,
      sections: [mkContainer('host', leaves)],
    });
    expect(r.verdict).toBe('trim');
  });
});
