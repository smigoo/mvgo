import { reconcileSectionLayoutWithFacts } from './layout-geom-facts.js';
import { inferLayoutFacts } from './layout-geom-facts.js';
import fs from 'fs';

const VISION_CACHE = '/Users/smigoo/工作/mvgo/frontend/workspace/custom-components/c-traffic-monitor-cc0eddc6/.mc-gen/cache/vision-cache/vision_1t7Dmmpsl5i0PC8BJt2QLf_2:9778_microcode.json';

function loadRealLayoutStructure() {
  const raw = JSON.parse(fs.readFileSync(VISION_CACHE, 'utf8'));
  return raw.layoutStructure;
}

describe('reconcileSectionLayoutWithFacts（S2 方向对账拦截）', () => {
  it('① 真实 cc0eddc6：当日总流量 horizontal 被 bbox free-overlay 纠正为 vertical，且 headerRelation 同步修正', () => {
    const ls = loadRealLayoutStructure();
    const before = ls.layout.sections.find((s) => s.id === '2:3660');
    expect(before.layout).toBe('horizontal');
    expect(before.headerRelation).toBe('title-same-row');

    const rec = reconcileSectionLayoutWithFacts(ls);

    const after = ls.layout.sections.find((s) => s.id === '2:3660');
    expect(after.layout).toBe('vertical');
    expect(after.headerRelation).toBe('content-below-title');
    expect(rec.overridden).toBeGreaterThanOrEqual(1);
    expect(rec.overrides.some((o) => o.id === '2:3660' && o.bboxMode === 'free-overlay')).toBe(true);
    expect(Array.isArray(ls.layoutFactsAudit)).toBe(true);
    expect(ls.layoutFactsAudit.some((a) => a.kind === 'section-layout-reconcile')).toBe(true);
  });

  it('② 真实 cc0eddc6：车型分布 horizontal 因 bbox row 与 vision 一致 → 保留（不误伤合法横排）', () => {
    const ls = loadRealLayoutStructure();
    const vt = ls.layout.sections.find((s) => s.id === '1263:38');
    expect(vt.layout).toBe('horizontal');
    const rec = reconcileSectionLayoutWithFacts(ls);
    const vtAfter = ls.layout.sections.find((s) => s.id === '1263:38');
    expect(vtAfter.layout).toBe('horizontal'); // 未被改
  });

  it('③ 真实 cc0eddc6：vision 已记 vertical 的 section 一律不动', () => {
    const ls = loadRealLayoutStructure();
    const target = ls.layout.sections.find((s) => s.name === '流量预测');
    expect(target.layout).toBe('vertical');
    const layoutBefore = target.layout;
    reconcileSectionLayoutWithFacts(ls);
    expect(target.layout).toBe(layoutBefore);
  });

  // ── 合成用例：覆盖各 mode 分支 ──
  const mkLs = (sections, facts) => ({ layout: { sections }, layoutFacts: facts });

  it('④ bbox column → horizontal 纠正为 vertical', () => {
    const ls = mkLs(
      [{ id: 'A', name: 'A', layout: 'horizontal', headerRelation: 'title-same-row' }],
      { A: { mode: 'column', gap: 12 } },
    );
    const rec = reconcileSectionLayoutWithFacts(ls);
    expect(ls.layout.sections[0].layout).toBe('vertical');
    expect(rec.overridden).toBe(1);
  });

  it('⑤ bbox free-overlay → horizontal 纠正为 vertical', () => {
    const ls = mkLs(
      [{ id: 'A', name: 'A', layout: 'horizontal', headerRelation: 'title-same-row' }],
      { A: { mode: 'free-overlay' } },
    );
    const rec = reconcileSectionLayoutWithFacts(ls);
    expect(ls.layout.sections[0].layout).toBe('vertical');
    expect(ls.layout.sections[0].headerRelation).toBe('content-below-title');
    expect(rec.overridden).toBe(1);
  });

  it('⑥ bbox row-between → 与 vision horizontal 一致 → 保留（不误伤）', () => {
    const ls = mkLs(
      [{ id: 'A', name: 'A', layout: 'horizontal', headerRelation: 'content-below-title' }],
      { A: { mode: 'row-between', gap: 8 } },
    );
    const rec = reconcileSectionLayoutWithFacts(ls);
    expect(ls.layout.sections[0].layout).toBe('horizontal');
    expect(rec.overridden).toBe(0);
  });

  it('⑦ 无 headerRelation → 即使 bbox 矛盾也不动（防过度纠正 headerless section）', () => {
    const ls = mkLs(
      [{ id: 'A', name: 'A', layout: 'horizontal' }], // 无 headerRelation
      { A: { mode: 'column' } },
    );
    const rec = reconcileSectionLayoutWithFacts(ls);
    expect(ls.layout.sections[0].layout).toBe('horizontal');
    expect(rec.overridden).toBe(0);
  });

  it('⑧ 缺失 layoutFacts / 空 sections → 安全返回，不抛', () => {
    expect(reconcileSectionLayoutWithFacts(null).overridden).toBe(0);
    expect(reconcileSectionLayoutWithFacts({ layout: { sections: [] } }).overridden).toBe(0);
    expect(reconcileSectionLayoutWithFacts({ layoutFacts: {} }).overridden).toBe(0);
  });

  it('⑨ 与 inferLayoutFacts 真值联动：bbox 两轴重叠 ⇒ free-overlay ⇒ horizontal 被纠正为 vertical', () => {
    // root 容器含两个互相重叠（x、y 均交叠）的子节点 ⇒ inferLayoutFacts 判定 free-overlay
    const figmaData = {
      document: {
        id: 'root',
        absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 200 },
        children: [
          { id: 'hdr', absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 40 } },
          { id: 'body', absoluteBoundingBox: { x: 0, y: 20, width: 400, height: 140 } }, // 与 hdr 在 x、y 均交叠
        ],
      },
    };
    const facts = inferLayoutFacts(figmaData);
    expect(facts['root']?.mode).toBe('free-overlay');
    const ls = mkLs(
      [{ id: 'root', name: 'root', layout: 'horizontal', headerRelation: 'title-same-row' }],
      facts,
    );
    const rec = reconcileSectionLayoutWithFacts(ls);
    expect(ls.layout.sections[0].layout).toBe('vertical');
    expect(rec.overridden).toBe(1);
  });
});
