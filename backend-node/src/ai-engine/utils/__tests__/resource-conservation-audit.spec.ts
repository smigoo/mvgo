/**
 * 🛡️ 2026-11-05 C1 全资源守恒断言 + C2 R4-3a flex 观测
 *   方案：docs/2026-11-05-四任务样式各异根因修复方案.md §3.1 / §3.5
 *
 * 判据口径：验者按产物实际 import / 实际 CSS 值比对，不复用改者的扫描正则。
 * 第四源续接 resource-facts.js#buildResourceFacts 单一事实源；
 * 第五源续接 docs/2026-11-02-锚点真值同源与段完整性根治方案.md:131-139/180/183。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  pickResourceConservationAudit,
  pickFlexTruthAudit,
  buildRejectSummary,
  formatRejectSummaryLine,
  pickStyleTruthAudit,
} from '../reject-summary.js';

const GRAPHS = join(__dirname, '../../graphs');
const readGraph = (f: string) => readFileSync(join(GRAPHS, f), 'utf8');

const MAPPING = [
  { assignedVarName: 'bg1', resourceFile: '../resources/images/bg-1.png', downloadStatus: 'success' },
  { assignedVarName: 'icon2', resourceFile: '../resources/images/icon-2.png', downloadStatus: 'success' },
  { assignedVarName: 'bg3', resourceFile: '../resources/images/bg-3.png', downloadStatus: 'missing', skipMount: true },
  { resourceFile: '../resources/images/icon-4.png', downloadStatus: 'success' },
  { assignedVarName: 'icon9', resourceFile: '../resources/images/icon-9.png', downloadStatus: 'success' },
];

const FILES = {
  'package/index.vue': `<template>
  <div :style="{ backgroundImage: 'url(' + bg1 + ')' }"><img :src="icon2" /></div>
</template>
<script setup>
import bg1 from '../resources/images/bg-1.png'
import icon2 from '../resources/images/icon-2.png'
</script>`,
  'resources/styles/common.less': `.a { flex:1; } .b { flex:0.295; } .c { flex:1.793 1 0; }`,
};

describe('C1 全资源守恒断言（只报不改、0 也打）', () => {
  it('⭐ 阳性：应挂 5 / 合法排除 1 / 实挂 2 / 未挂归因分档正确', () => {
    const a = pickResourceConservationAudit(MAPPING, FILES);
    expect(a).toEqual({
      expected: 5,
      excluded: 1,
      mountable: 4,
      declaredVar: 4,
      imported: 2,
      unmounted: 2,
      noVarName: 1,
      notImported: 1,
      orphanImports: 0,
      filesUnavailable: 0,
      // G1（2026-11-05）契约扩展：unmounted 原因分档，和 ≡ unmounted。
      reasons: {
        noVarName: 1, reused: 0, subState: 0, noTarget: 1,
        imgSrcUnreferenced: 0, other: 0,
      },
    });
    const r = a.reasons;
    expect(r.noVarName + r.reused + r.subState + r.noTarget + r.imgSrcUnreferenced + r.other).toBe(a.unmounted);
  });

  it('阴性：空 mapping + 空产物 ⇒ 全 0 且 filesUnavailable=0', () => {
    const a = pickResourceConservationAudit([], { 'a.vue': 'x' });
    expect(a.expected).toBe(0);
    expect(a.unmounted).toBe(0);
    expect(a.filesUnavailable).toBe(0);
  });

  it('阴性：拿不到产物内容表 ⇒ filesUnavailable=1，不编造挂载结论', () => {
    const a = pickResourceConservationAudit(MAPPING, null);
    expect(a.filesUnavailable).toBe(1);
    expect(a.imported).toBe(0);
  });

  it('日志行：全 0 也打，且键齐全', () => {
    const line = formatRejectSummaryLine(
      buildRejectSummary({
        styleTruthAudit: pickStyleTruthAudit([]),
        resourceConservationAudit: pickResourceConservationAudit([], { 'a.vue': 'x' }),
        flexTruthAudit: pickFlexTruthAudit({ 'a.vue': 'x' }),
      })!,
    );
    expect(line).toContain('resConserve:expected=0,excluded=0,mountable=0,declared=0,imported=0,unmounted=0,noVarName=0,notImported=0,orphan=0,filesUnavailable=0');
    // G1：全 0 也打，键齐全。
    expect(line).toContain('resConserveReasons:noVarName=0,reused=0,subState=0,noTarget=0,imgSrcUnreferenced=0,other=0,filesUnavailable=0');
    expect(line).toContain('flexTruth:evaluated=0,flexFallback=0,truthed=0,mixedGrow=0,filesUnavailable=0');
  });

  it('旧契约零回归：不传新源时 summary 不含新键、日志不含新段', () => {
    const s = buildRejectSummary({ takeoverAudit: { evaluated: 1, candidates: 0 } })!;
    expect(s.resourceConservation).toBeUndefined();
    expect(s.flexTruth).toBeUndefined();
    expect(formatRejectSummaryLine(s)).not.toContain('resConserve:');
    expect(formatRejectSummaryLine(s)).not.toContain('flexTruth:');
    expect(buildRejectSummary({})).toBeNull();
  });

  it('双端接线断言：phase2 / vue3 同条件传入三源', () => {
    for (const f of ['mc-component-graph-phase2.js', 'mc-component-graph-vue3.js']) {
      const src = readGraph(f);
      expect(src).toContain('pickResourceConservationAudit');
      expect(src).toContain('pickFlexTruthAudit');
      expect(src).toContain('conservationFiles');
      expect(src).toContain('Array.isArray(styleTruthMapping) ? pickFlexTruthAudit(conservationFiles) : null');
    }
  });
});

describe('C2 R4-3a flex 来源分档（产物侧观测、不碰写入口）', () => {
  it('⭐ 阳性：flex:1 回退 / 真值比例 / 混合写法三档分别命中', () => {
    expect(pickFlexTruthAudit(FILES)).toEqual({
      evaluated: 3,
      flexFallback: 1,
      truthed: 1,
      mixedGrow: 1,
      filesUnavailable: 0,
    });
  });

  it('阴性：产物无 flex 声明 ⇒ evaluated=0 且 0 也打', () => {
    const a = pickFlexTruthAudit({ 'a.vue': '<template><div>x</div></template>' });
    expect(a.evaluated).toBe(0);
    expect(a.filesUnavailable).toBe(0);
  });

  it('阴性：files 不可用 ⇒ filesUnavailable=1', () => {
    expect(pickFlexTruthAudit(null).filesUnavailable).toBe(1);
  });

  it('不改写入口：code-generator.js 的 flexItemStyleFromHeights 逐字未动', () => {
    const src = readFileSync(join(__dirname, '../../roles/microcode/code-generator.js'), 'utf8');
    expect(src).toContain('return `flex:${(h / total).toFixed(3)};min-height:0;`');
    expect(src).toContain("return 'flex:1;min-height:0;'");
  });
});
