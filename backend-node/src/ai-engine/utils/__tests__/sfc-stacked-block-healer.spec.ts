/**
 * 模型犯错后的确定性自修复（2026-11-16 · mc-max-1794761757056-0d15ab1b 实锤）。
 *
 * 阴：真机 3985B「外层 <template> 包住内层 <template> + 第一组 script/style，外层闭合后
 *     再挂第二组 script/style」⇒ 纯文本归一成完整合法入口（不赌 LLM 重生成）。
 *     872B script-only 碎片 ⇒ 不造 template，交配方化回灌。
 * 阳：合法单 SFC / 嵌套 <template #slot> / 多 <style> 块 ⇒ 逐字不变（不误伤）。
 *
 * 改者≠验者：归一结果另用独立 `@vue/compiler-sfc` 复编对账，不只用自家判据。
 */
import { describe, it, expect } from '@jest/globals'
import { createRequire } from 'node:module'
import {
  healStackedSfcBlocks,
  formatHealStatsLine,
  buildSfcStructureRecipe,
} from '../sfc-stacked-block-healer.js'
import {
  validateVueSfc,
  validateVueSfcExpressions,
  inspectSfcRenderableTemplate,
} from '../sfc-syntax-validation.js'

const nodeRequire = createRequire(__filename)
const vueSfc = nodeRequire('@vue/compiler-sfc')

const INNER_TEMPLATE = `<template>
  <base-panel panelKey="default-panel">
    <div class="c-demo-root">
      <ContentSection />
      <ChartTrend />
    </div>
  </base-panel>
</template>`

const SCRIPT = `<script setup>
const title = 'demo'
</script>`

const STYLE = `<style lang="less" scoped>
@import '../resources/styles/index.less';
.c-demo-root { color: #fff; }
</style>`

/** 真机同形态：整份 SFC 被外层 template 包住，外面再挂第二组 */
const STACKED = `<template>
${INNER_TEMPLATE}
${SCRIPT}
${STYLE}
</template>
${SCRIPT}
${STYLE}`

const SCRIPT_ONLY = `<script setup>
const title = 'demo'
</script>`

const GOOD_VUE = `${INNER_TEMPLATE}
${SCRIPT}
${STYLE}`

const NESTED_SLOT = `<template>
  <div class="c-demo-root">
    <a-table :columns="cols">
      <template #headerCell="{ column }"><span>{{ column.title }}</span></template>
      <template #bodyCell="{ record }"><span>{{ record.name }}</span></template>
    </a-table>
  </div>
</template>
${SCRIPT}`

const MULTI_STYLE = `${INNER_TEMPLATE}
${SCRIPT}
${STYLE}
<style scoped>
.c-demo-root { display: flex; }
</style>`

function independentCompile(src: string) {
  const { descriptor, errors } = vueSfc.parse(src, { filename: 'package/index.vue' })
  const tplErrors = descriptor.template
    ? vueSfc.compileTemplate({
        source: descriptor.template.content,
        filename: 'package/index.vue',
        id: 'verify',
      }).errors
    : []
  return { parseErrors: errors.length, hasTemplate: !!descriptor.template, tplErrors }
}

describe('healStackedSfcBlocks：真机叠加畸形确定性归一', () => {
  it('阴性·叠加坏版 ⇒ 救回完整合法入口（独立编译器复编 0 错、6 类守恒）', () => {
    expect(validateVueSfcExpressions(STACKED, 'package/index.vue').valid).toBe(false)

    const r = healStackedSfcBlocks(STACKED, 'package/index.vue')

    expect(r.fixed).toBe(true)
    expect(r.reason).toBe('healed')
    expect(r.strategy).toBe('stacked-blocks-normalized')
    expect(r.stats.healed).toBe(1)
    expect(r.stats.conservedTags).toBe(2)
    expect(r.stats.templateBlocks).toBe(2)
    expect(r.stats.scriptBlocks).toBe(2)
    expect(r.stats.styleBlocks).toBe(2)
    // 归一后必须同时过两条同源判据
    expect(validateVueSfcExpressions(r.source, 'package/index.vue').valid).toBe(true)
    expect(inspectSfcRenderableTemplate(r.source, 'package/index.vue').hasTemplate).toBe(true)
    // 改者≠验者：独立编译器复编
    const c = independentCompile(r.source)
    expect(c.parseErrors).toBe(0)
    expect(c.hasTemplate).toBe(true)
    expect(c.tplErrors).toHaveLength(0)
    // 子组件标签一个不丢 + 只留一组 SFC 块
    expect(r.source).toContain('<ContentSection')
    expect(r.source).toContain('<ChartTrend')
    expect((r.source.match(/<script setup>/g) || []).length).toBe(1)
    expect((r.source.match(/<style /g) || []).length).toBe(1)
    expect(r.source).not.toContain('</template>\n<template>')
  })

  it('阴性·script-only 碎片 ⇒ 不造 template，原样返回交 fail-fast', () => {
    const r = healStackedSfcBlocks(SCRIPT_ONLY, 'package/index.vue')
    expect(r.fixed).toBe(false)
    expect(r.reason).toBe('no-template')
    expect(r.source).toBe(SCRIPT_ONLY)
    expect(r.stats.healed).toBe(0)
    expect(validateVueSfc(r.source, 'package/index.vue').valid).toBe(false)
  })

  it('阴性·单组块内表达式真错 ⇒ 不误修（not-stacked，真错仍 FAIL）', () => {
    const bad = GOOD_VUE.replace(
      '<div class="c-demo-root">',
      '<div class="c-demo-root" :style="{ a: 1 };display:flex">',
    )
    expect(validateVueSfcExpressions(bad, 'package/index.vue').valid).toBe(false)
    const r = healStackedSfcBlocks(bad, 'package/index.vue')
    expect(r.fixed).toBe(false)
    expect(r.reason).toBe('not-stacked')
    expect(r.source).toBe(bad)
  })

  it('回归收紧：两个平级 template + 单组 script/style ⇒ 不归一（保留畸形 revision 回退语义）', () => {
    // task-code-snapshot-closure.spec 两例锁定的既有产品语义：这类畸形候选必须被
    // 预览拒绝 / 回退 last-good，不能在快照入口被「修好」而抹掉回退路径。
    const malformed = [
      '<template><div>first</div></template>',
      '<template><div>second</div></template>',
      '<script setup>const value = 1</script>',
      '<style scoped>.root { color: red; }</style>',
    ].join('\n');
    expect(validateVueSfcExpressions(malformed, 'package/index.vue').valid).toBe(false);
    const r = healStackedSfcBlocks(malformed, 'package/index.vue');
    expect(r.fixed).toBe(false);
    expect(r.reason).toBe('not-stacked');
    expect(r.source).toBe(malformed);
  });

  it('内容守恒：候选丢子组件标签 ⇒ unfixable，不静默丢代码', () => {
    // 第二组 template 里有一个独有标签，任一单 template 候选都无法守恒
    const mixed = `<template>
${INNER_TEMPLATE}
${SCRIPT}
</template>
<template>
  <div><OnlyInSecond /></div>
</template>
${STYLE}`
    const r = healStackedSfcBlocks(mixed, 'package/index.vue')
    expect(r.fixed).toBe(false)
    expect(r.reason).toBe('unfixable')
    expect(r.source).toBe(mixed)
  })

  it('幂等：自愈结果再跑一次 ⇒ already-valid、逐字不变', () => {
    const once = healStackedSfcBlocks(STACKED, 'package/index.vue')
    const twice = healStackedSfcBlocks(once.source, 'package/index.vue')
    expect(twice.fixed).toBe(false)
    expect(twice.reason).toBe('already-valid')
    expect(twice.source).toBe(once.source)
  })
})

describe('healStackedSfcBlocks：阳性对照（合法形态零误伤）', () => {
  it.each([
    ['合法单 SFC', GOOD_VUE],
    ['嵌套 <template #slot>', NESTED_SLOT],
    ['多 <style> 块', MULTI_STYLE],
  ])('%s ⇒ already-valid 且逐字不变', (_name, src) => {
    expect(validateVueSfcExpressions(src, 'package/index.vue').valid).toBe(true)
    const r = healStackedSfcBlocks(src, 'package/index.vue')
    expect(r.fixed).toBe(false)
    expect(r.reason).toBe('already-valid')
    expect(r.stats.evaluated).toBe(0)
    expect(r.source).toBe(src)
    expect(independentCompile(src).hasTemplate).toBe(true)
  })

  it('空串 ⇒ empty，不抛', () => {
    const r = healStackedSfcBlocks('', 'package/index.vue')
    expect(r.fixed).toBe(false)
    expect(r.reason).toBe('empty')
  })
})

describe('观测与配方', () => {
  it('计数行恒打：healed=0 也带完整统计与 reason', () => {
    const r = healStackedSfcBlocks(SCRIPT_ONLY, 'package/index.vue')
    const line = formatHealStatsLine(r.stats, 'package/index.vue')
    expect(line).toContain('SFC 叠加结构自愈·已评估')
    expect(line).toContain('evaluated=1')
    expect(line).toContain('healed=0')
    expect(line).toContain('reason=no-template')
    const ok = healStackedSfcBlocks(STACKED, 'package/index.vue')
    expect(formatHealStatsLine(ok.stats, 'package/index.vue')).toContain('healed=1')
  })

  it('配方含可照抄骨架 + 实测错误定位 + 禁止清单', () => {
    const g = buildSfcStructureRecipe(
      [
        {
          path: 'package/index.vue',
          errors: ['package/index.vue:22:2 SFC: Tags with side effect (<script> and <style>) are ignored'],
        },
      ],
      { round: 2 },
    )
    expect(g).toContain('package/index.vue:22:2')
    expect(g).toContain('<template>')
    expect(g).toContain('<script setup>')
    expect(g).toContain('第二个 <template>')
    expect(g).toContain('轮次 2/2')
    // 无骨架时不得指空段
    expect(g).toContain('禁止凭空补段')
  })

  it('配方带真实组件树骨架 ⇒ 出现归属段定位', () => {
    const g = buildSfcStructureRecipe([{ path: 'package/index.vue', errors: [] }], {
      skeleton: '<ContentSection /> → <ChartTrend />',
    })
    expect(g).toContain('归属段定位')
    expect(g).toContain('<ChartTrend />')
  })
})
