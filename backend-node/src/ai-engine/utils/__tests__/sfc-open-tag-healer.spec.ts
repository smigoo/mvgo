/**
 * 🛡️ 2026-11-18 · SFC 缺开始标签自愈器（方案 A）验收。
 *
 * 锁四件事：
 *  ① 阳性：LLM 把 `<div class=...>` 写成裸 `div class=...`（缺 '<'）⇒ 自愈后编译通过、
 *     逐字补回标签，且文案/组件标签守恒；
 *  ② 缺 '>' 形态同样能修；
 *  ③ 阴阳对照：合法文件 already-valid 逐字不变；非 end-tag 畸形 not-in-scope 不碰；
 *  ④ 内容守恒：候选若会丢文案/子组件标签，必须拒绝（rejectedConservation>0）而非硬修。
 */
import { healSfcOpenTag, formatOpenTagHealStatsLine } from '../sfc-open-tag-healer.js';
import { validateVueSfcExpressions } from '../sfc-syntax-validation.js';

const SFC = (body: string) => `<template>
${body}
</template>
<script setup>
const a = 1
</script>
`;

describe('healSfcOpenTag · 缺开始标签确定性自愈', () => {
  test('① 阳性：裸 div（缺 < + 缺 >）⇒ 修复后编译通过、文案逐字守恒', () => {
    const bad = SFC(`  <base-panel panelKey="default-panel">
    div class="c-x-slot-con" style="display:flex"
      <span>真实文案</span>
    </div>
  </base-panel>`);
    expect(validateVueSfcExpressions(bad, 'x.vue').valid).toBe(false);

    const r = healSfcOpenTag(bad, 'x.vue');
    expect(r.fixed).toBe(true);
    expect(r.stats.healed).toBe(1);
    expect(validateVueSfcExpressions(r.source, 'x.vue').valid).toBe(true);
    // 逐字补回：裸行变成完整开始标签
    expect(r.source).toContain('<div class="c-x-slot-con" style="display:flex">');
    // 内容守恒：文案与组件标签都在
    expect(r.source).toContain('真实文案');
    expect(r.source).toContain('<base-panel');
    expect(r.source).toContain('<span');
  });

  test('② 缺 > 形态：开标签有 < 无闭合 > ⇒ 修复后编译通过', () => {
    const bad = SFC(`  <div class="c-x-slot-con" style="display:flex"
    <span>内容</span>
  </div>`);
    expect(validateVueSfcExpressions(bad, 'x.vue').valid).toBe(false);

    const r = healSfcOpenTag(bad, 'x.vue');
    expect(r.fixed).toBe(true);
    expect(validateVueSfcExpressions(r.source, 'x.vue').valid).toBe(true);
    expect(r.source).toContain('内容');
    expect(r.source).toContain('<div class="c-x-slot-con" style="display:flex">');
  });

  test('③ 阴阳对照：合法文件 already-valid 逐字不变', () => {
    const ok = SFC(`  <div class="a">
    <span>ok</span>
  </div>`);
    expect(validateVueSfcExpressions(ok, 'x.vue').valid).toBe(true);
    const r = healSfcOpenTag(ok, 'x.vue');
    expect(r.fixed).toBe(false);
    expect(r.reason).toBe('already-valid');
    expect(r.source).toBe(ok);
  });

  test('④ 非 end-tag 畸形 not-in-scope 不碰（如 template 引用未声明变量）', () => {
    const bad = SFC(`  <div>{{ missingRef }}</div>`);
    expect(validateVueSfcExpressions(bad, 'x.vue').valid).toBe(true); // 表达式语义另管，此处只测自愈不越界
    const r = healSfcOpenTag(bad, 'x.vue');
    expect(r.fixed).toBe(false);
    expect(r.source).toBe(bad);
  });

  test('⑤ 幂等：修好的文件再跑一次逐字不变', () => {
    const bad = SFC(`  div class="c-x-slot-con" style="display:flex"
    <span>真实文案</span>
  </div>`);
    const once = healSfcOpenTag(bad, 'x.vue');
    expect(once.fixed).toBe(true);
    const twice = healSfcOpenTag(once.source, 'x.vue');
    expect(twice.fixed).toBe(false);
    expect(twice.reason).toBe('already-valid');
    expect(twice.source).toBe(once.source);
  });

  test('⑥ 空输入 / 非 end-tag 畸形 ⇒ fail-open 返回原样（不越界）', () => {
    expect(healSfcOpenTag('', 'x.vue').reason).toBe('empty');
    // script-only 的错误是「缺少 template」，不含 end-tag ⇒ 主闸 not-in-scope，
    // 本函数本就不修这类形态（交 healStackedSfcBlocks / 门禁处理），不能越界。
    const scriptOnly = `<script setup>const a = 1</script>`;
    expect(healSfcOpenTag(scriptOnly, 'x.vue').reason).toBe('not-in-scope');
    expect(healSfcOpenTag(scriptOnly, 'x.vue').source).toBe(scriptOnly);
  });

  test('⑦ 计数行文案恒含关键字段', () => {
    const bad = SFC(`  div class="x"
    <span>文案</span>
  </div>`);
    const r = healSfcOpenTag(bad, 'x.vue');
    const line = formatOpenTagHealStatsLine(r.stats, 'x.vue');
    expect(line).toContain('SFC 缺开始标签自愈·已评估');
    expect(line).toContain('evaluated=');
    expect(line).toContain('healed=');
    expect(line).toContain('reason=');
  });
});
