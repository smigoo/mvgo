/**
 * C 降级交付判据分级 spec（2026-11-12 · mc-max-1794458950336-47b996c3 实锤）
 *
 * 病灶：C1b 判「3 条真值文本未物化」**判据正确**，两轮定向修复未修好 ⇒ 旧出口
 *   `throw 拒绝交付坏结构` ⇒ 用户看到「生成失败」，而磁盘产物能打开、只差 3 处文本。
 * 治法：**只放宽交付策略、不放宽判据** —— 可降级码 ⇒ 交付 + 待补清单；
 *   阻断码（Dangling 等产物打不开）与一切**未登记码** ⇒ 维持 fail-closed。
 *
 * 本 spec 守两件事：
 *   ① 分级口径唯一（阳性可降级 / 阴性阻断 / 未知码 fail-closed）；
 *   ② 待补清单文案只取判据自带真值（C1b.missingLabels 原文），不臆造、不丢条。
 */
import {
  classifyAcceptanceFails,
  formatDeliveryWarnings,
  DELIVERABLE_DEGRADABLE_CODES,
  DELIVERABLE_BLOCKING_CODES,
} from './index.js';

/** 真机 47b996c3 实况形态：C1b 缺 3 条文本（部署节点概览 / 共 6 个节点 / 接入设备 10810） */
const REAL_C1B_FAIL = {
  code: 'C1b',
  detail:
    '3 个真值标签文本在产物中完全缺席（如「部署节点概览」、「共 6 个节点」、「接入设备 10810」）——真值有文本而产物为空（空 span/空胶囊）= 标签未物化，补齐承载或修背景注入',
  files: ['package/components/HeaderSection.vue', 'package/index.vue'],
  missingLabels: [
    { text: '部署节点概览', count: '', file: 'package/components/HeaderSection.vue', sectionId: '565:2' },
    { text: '共 6 个节点', count: '6', file: 'package/index.vue', sectionId: '48:5888' },
    { text: '接入设备 10810', count: '10810', file: 'package/index.vue', sectionId: '48:5888' },
  ],
};

describe('classifyAcceptanceFails（可降级 / 阻断 分级单一来源）', () => {
  it('阳性：真机 C1b ⇒ 全部可降级，无阻断', () => {
    const { degradable, blocking } = classifyAcceptanceFails([REAL_C1B_FAIL]);
    expect(blocking).toHaveLength(0);
    expect(degradable).toHaveLength(1);
    expect(degradable[0].code).toBe('C1b');
  });

  it('阴性：Dangling（产物打不开）⇒ 阻断', () => {
    const { degradable, blocking } = classifyAcceptanceFails([
      { code: 'Dangling', detail: 'index 引用的 ./components/X.vue 未落盘（悬空引用）' },
    ]);
    expect(degradable).toHaveLength(0);
    expect(blocking.map((f: any) => f.code)).toEqual(['Dangling']);
  });

  it('阴性：未登记码 ⇒ fail-closed 阻断（白名单制，新增判据不会被动降级）', () => {
    const { degradable, blocking } = classifyAcceptanceFails([
      { code: 'SOME-FUTURE-CHECK', detail: '尚未登记的新判据' },
    ]);
    expect(degradable).toHaveLength(0);
    expect(blocking).toHaveLength(1);
  });

  it('混合：C1b（可降级）+ Dangling（阻断）⇒ 阻断优先，整体不可降级', () => {
    const { degradable, blocking } = classifyAcceptanceFails([
      REAL_C1B_FAIL,
      { code: 'Dangling', detail: '悬空引用' },
    ]);
    expect(degradable.map((f: any) => f.code)).toEqual(['C1b']);
    expect(blocking.map((f: any) => f.code)).toEqual(['Dangling']);
    // 调用方判据：blocking.length === 0 才可降级 ⇒ 此例必须走拒绝交付
    expect(blocking.length === 0).toBe(false);
  });

  it('空/脏入参不炸且不误降级', () => {
    expect(classifyAcceptanceFails([])).toEqual({ degradable: [], blocking: [] });
    expect(classifyAcceptanceFails(null as any)).toEqual({ degradable: [], blocking: [] });
    expect(classifyAcceptanceFails([null, undefined] as any)).toEqual({ degradable: [], blocking: [] });
  });

  it('码清单自身一致：可降级与阻断无交集，Dangling 登记在阻断清单', () => {
    expect(DELIVERABLE_BLOCKING_CODES).toContain('Dangling');
    const overlap = DELIVERABLE_DEGRADABLE_CODES.filter((c) => DELIVERABLE_BLOCKING_CODES.includes(c));
    expect(overlap).toEqual([]);
  });
});

describe('formatDeliveryWarnings（一次性列出待补内容）', () => {
  it('真机形态：3 条待补文本逐条列出，不臆造、不丢条', () => {
    const { degradable } = classifyAcceptanceFails([REAL_C1B_FAIL]);
    const w = formatDeliveryWarnings(degradable);
    expect(w.codes).toEqual(['C1b']);
    expect(w.missingTexts).toEqual(['部署节点概览', '共 6 个节点', '接入设备 10810']);
    expect(w.text).toContain('3 处真值文本尚未物化');
    expect(w.text).toContain('「部署节点概览」');
    expect(w.text).toContain('「接入设备 10810」');
    // 明细保留 code + detail 供任务详情展示
    expect(w.items[0].code).toBe('C1b');
    expect(w.items[0].detail).toContain('标签未物化');
  });

  it('多条 C1b fail 的待补文本合并去重（保序）', () => {
    const a = { code: 'C1b', detail: 'a', missingLabels: [{ text: 'A' }, { text: 'B' }] };
    const b = { code: 'C1b', detail: 'b', missingLabels: [{ text: 'B' }, { text: 'C' }] };
    const w = formatDeliveryWarnings([a, b]);
    expect(w.missingTexts).toEqual(['A', 'B', 'C']);
    expect(w.codes).toEqual(['C1b']);
  });

  it('超过 30 条截断但保留总数（防刷屏，不撒谎）', () => {
    const labels = Array.from({ length: 35 }, (_, i) => ({ text: `T${i}` }));
    const w = formatDeliveryWarnings([{ code: 'C1b', detail: 'x', missingLabels: labels }]);
    expect(w.missingTexts).toHaveLength(35);
    expect(w.text).toContain('35 处真值文本尚未物化');
    expect(w.text).toContain('等 35 处');
  });

  it('「缺标题」显式提示（用户明确保留项）：G-SLOT 必须点名标题缺失', () => {
    const w = formatDeliveryWarnings([
      { code: 'G-SLOT', detail: '面板标题元素已被剥离，但 index.vue 未挂载 title-left slot 内容' },
    ]);
    expect(w.codes).toEqual(['G-SLOT']);
    expect(w.text).toContain('标题');
    expect(w.text).toContain('标题缺失');
  });

  it('无待补文本也无标题问题时给出兜底文案（不产出空串）', () => {
    const w = formatDeliveryWarnings([{ code: 'E3-v4', detail: '背景挂错祖先容器' }]);
    expect(w.text.trim().length).toBeGreaterThan(0);
    expect(w.text).toContain('结构性缺失');
  });
});
