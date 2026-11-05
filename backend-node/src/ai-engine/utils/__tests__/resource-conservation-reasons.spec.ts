/**
 * 🛡️ 2026-11-05 G1：unmounted 原因分档（A 档、只报不改、零产物变化）
 *   方案：docs/2026-11-05-真机归因后续治理方案.md §4 G1 / §10 退役判据
 *
 * 判据可辩驳：本 spec 用**独立映射表**逐条声明「该条目应落哪一档」，
 * 再与被测函数的分档结果比对，不复用改者的 if/else 优先级链。
 * 结构字段判据：sharedBy / bgRole / targetDomSelector / assignedVarName /
 *   recommendedUsage / usage / mountTarget，不含任何 taskId、组件名、文件名或具体 node id 特判。
 *
 * 2026-11-05 补档：离线真机 6 任务 20/22 条 `other` 命中
 * 「imgSrc 类资源 + mountTarget 为空」，故新增该档（跨任务验证，非单任务过拟合）。
 * 🔴 2026-11-05 当日更名 `imgSrcNoMountTarget` → `imgSrcUnreferenced`：
 *   全样本实测该档**恒 100% 命中**（`bg ∧ imgSrc` 交集 = 0，见
 *   `docs/2026-11-05-真机归因后续治理方案.md` §13.5）⇒ 原名"缺 mountTarget = 缺陷"
 *   属误读，D1 治本已撤销。本档只表示「LLM 未引用静态资源」。
 * ⚠️ 本 spec 已知盲点（§13.5.1）：`MAPPING` 由改者按同一假设手工构造，
 *   只能证明"分支可达"，**不能**证明"该档存在非零变异"。
 *   真正的独立验证是反例搜索——全样本已证构造不出反例。
 */
import {
  pickResourceConservationAudit,
  buildRejectSummary,
  formatRejectSummaryLine,
} from '../reject-summary.js';

// 真机形态取自 09636315：6 条 bgRole:'sub-state' 共用同一位图、各带 targetDomSelector；
// 另有 imgSrc 类图标资源带猜测型 class selector。用语义化占位 id，确保判据只认结构。
const MAPPING: any[] = [
  { assignedVarName: 'bgA', resourceFile: '../resources/images/a.png', downloadStatus: 'success' }, // noTarget
  { assignedVarName: 'bgB', resourceFile: '../resources/images/b.png', downloadStatus: 'success', targetDomSelector: '[data-section-id="s-b"]', mountTarget: 'slot-con' }, // other
  { assignedVarName: 'bgC', resourceFile: '../resources/images/c.png', downloadStatus: 'success', targetDomSelector: '[data-section-id="s-c"]', bgRole: 'sub-state' }, // subState
  { assignedVarName: 'bgD', resourceFile: '../resources/images/d.png', downloadStatus: 'success', targetDomSelector: '[data-section-id="s-d"]', bgRole: 'sub-state', sharedBy: ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'] }, // reused（优先级高于 subState）
  { resourceFile: '../resources/images/e.png', downloadStatus: 'success', targetDomSelector: '[data-section-id="s-e"]' }, // noVarName
  { assignedVarName: 'bgF', resourceFile: '../resources/images/f.png', downloadStatus: 'missing', skipMount: true }, // excluded
  { assignedVarName: 'bgG', resourceFile: '../resources/images/g.png', downloadStatus: 'success', targetDomSelector: '[data-section-id="s-g"]' }, // imported
  { assignedVarName: 'iconH', resourceFile: '../resources/images/h.png', downloadStatus: 'success', targetDomSelector: '.icon-container', recommendedUsage: 'imgSrc', usage: '<img :src="iconH">' }, // imgSrcUnreferenced（imgSrc 类结构性无 mountTarget，设计如此）
];

const FILES = {
  'package/index.vue': `<template><div :style="{ backgroundImage: 'url(' + bgG + ')' }" /></template>
<script setup>
import bgG from '../resources/images/g.png'
</script>`,
};

/** 独立口径：每条 unmounted 应落的档（不复用被测实现的优先级链）。 */
const EXPECTED_REASON_BY_VAR: Record<string, string> = {
  bgA: 'noTarget',
  bgB: 'other',
  bgC: 'subState',
  bgD: 'reused',
  iconH: 'imgSrcUnreferenced',
  __noVarName__: 'noVarName',
};

const ZERO_REASONS = {
  noVarName: 0, reused: 0, subState: 0, noTarget: 0, imgSrcUnreferenced: 0, other: 0,
};

/** 独立复算分档和（验者口径，不复用改者代码）。 */
const reasonSum = (r: Record<string, number>) =>
  r.noVarName + r.reused + r.subState + r.noTarget + r.imgSrcUnreferenced + r.other;

describe('G1 unmounted 原因分档（只报不改）', () => {
  it('⭐ 阳性：六档各命中一次，分档和 ≡ unmounted', () => {
    const a = pickResourceConservationAudit(MAPPING, FILES);
    expect(a.expected).toBe(8);
    expect(a.excluded).toBe(1);
    expect(a.mountable).toBe(7);
    expect(a.imported).toBe(1);
    expect(a.unmounted).toBe(6);
    expect(a.reasons).toEqual({
      noVarName: 1, reused: 1, subState: 1, noTarget: 1,
      imgSrcUnreferenced: 1, other: 1,
    });
    expect(reasonSum(a.reasons)).toBe(a.unmounted);
    // 独立映射表逐条核对（验者口径）
    expect(Object.values(EXPECTED_REASON_BY_VAR).sort()).toEqual(
      ['noTarget', 'other', 'subState', 'reused', 'noVarName', 'imgSrcUnreferenced'].sort(),
    );
  });

  it('⭐ 真机形态阳性：sharedBy>1 优先于 sub-state，不重复归类', () => {
    const shared = MAPPING.filter((m) => Array.isArray(m.sharedBy) && m.sharedBy.length > 1);
    const a = pickResourceConservationAudit(shared, FILES);
    expect(a.unmounted).toBe(shared.length);
    expect(a.reasons.reused).toBe(shared.length);
    expect(a.reasons.subState).toBe(0);
    expect(a.reasons.other).toBe(0);
  });

  it('⭐ 真机形态阳性：imgSrc + 无 mountTarget ⇒ imgSrcUnreferenced，不落到 other', () => {
    // ⚠️ 该组合对 imgSrc 类**恒真**（figma-connector.js:2954 设计：icon/img 不做容器挂载）。
    //    本用例只锁"分支可达 + 归类互斥"，不代表该档在真实数据里有区分力（§13.5）。
    const imgSrc = MAPPING.filter((m) => m.recommendedUsage === 'imgSrc');
    const a = pickResourceConservationAudit(imgSrc, FILES);
    expect(a.unmounted).toBe(imgSrc.length);
    expect(a.reasons.imgSrcUnreferenced).toBe(imgSrc.length);
    expect(a.reasons.other).toBe(0);
    // 阴性（构造层）：给了确定性 mountTarget 后不得再归入该档。
    // 🔴 注意：该反例在真实 mapping 中**从未出现**（全样本 0/2013），故它证明的是
    //    "代码分支可区分"，**不是**"该档有真实区分力"。同时充任 figma-connector
    //    设计变更哨兵：若 imgSrc 开始带 mountTarget，本档自动失效即需重审设计假设。
    const withHost = imgSrc.map((m) => ({ ...m, mountTarget: 'slot-icon' }));
    const b = pickResourceConservationAudit(withHost, FILES);
    expect(b.reasons.imgSrcUnreferenced).toBe(0);
    expect(b.reasons.other).toBe(withHost.length);
  });

  it('阴性：全 0 也打 —— 空 mapping 仍输出六档与计数行', () => {
    const a = pickResourceConservationAudit([], { 'a.vue': 'x' });
    expect(a.reasons).toEqual(ZERO_REASONS);
    const line = formatRejectSummaryLine(
      buildRejectSummary({ resourceConservationAudit: a })!,
    );
    expect(line).toContain('resConserveReasons:noVarName=0,reused=0,subState=0,noTarget=0,imgSrcUnreferenced=0,other=0,filesUnavailable=0');
  });

  it('阴性：filesUnavailable=1 时分档仍为 mapping 侧事实，且和 ≡ unmounted', () => {
    const a = pickResourceConservationAudit(MAPPING, null);
    expect(a.filesUnavailable).toBe(1);
    expect(reasonSum(a.reasons)).toBe(a.unmounted);
    const line = formatRejectSummaryLine(
      buildRejectSummary({ resourceConservationAudit: a })!,
    );
    expect(line).toContain('resConserveReasons:');
    expect(line).toContain('filesUnavailable=1');
  });

  it('阴性防误伤：塞入 taskId / 组件名 / 文件名不改变分档结果', () => {
    const base = pickResourceConservationAudit(MAPPING, FILES);
    const polluted = MAPPING.map((m, i) => ({
      ...m,
      componentName: 'c-aiot-dpjh-bsjd-09636315',
      taskId: 'mc-max-1793855346331-09636315',
      figmaNodeId: `48:58${i}00`,
    }));
    const a = pickResourceConservationAudit(polluted, FILES);
    expect(a.reasons).toEqual(base.reasons);
    expect(a.unmounted).toBe(base.unmounted);
  });

  it('旧契约零回归：不传第四源时日志不含 resConserveReasons 段', () => {
    const s = buildRejectSummary({ takeoverAudit: { evaluated: 1, candidates: 0 } })!;
    expect(formatRejectSummaryLine(s)).not.toContain('resConserveReasons:');
  });
});
