import { restoreChartMinHeightAfterZero } from './chart-container-guard.js'

/**
 * 🛡️ F3 刀 3（2026-11-04 · mc-max-1793769058951-9a0133fe 实锤）
 *
 * 真机证据：`_echarts_instance_` 存在、`<canvas 405×110>` 已渲染，但图表**不可见** ——
 * 因为 `.c-…-chart { min-height: 0; overflow: hidden }`（后置的 `[自动修复]` 规则按源序
 * 压过后面的 160px），预览层又给所有选择器加了同权重作用域前缀 ⇒ 纯源序定胜负。
 *
 * 判据（保守）：只在「该类此前自己写过正的 min-height」时，把后置的 `min-height: 0`
 * 恢复成那个**已存在的正值**；不发明新数值、无正值不动、非图表组件零影响。
 */

const chartVue = (tplCls: string, styleBody: string) => `<template>
  <div class="${tplCls}">
    <div ref="chartRef" class="${tplCls}-canvas"></div>
  </div>
</template>

<script setup>
import * as echarts from 'echarts'
let chart = null
const init = (el: any) => {
  chart = echarts.init(el.value)
}
</script>

<style lang="less" scoped>
${styleBody}
</style>
`

describe('restoreChartMinHeightAfterZero · F3', () => {
  it('后置同名块（[自动修复] 追加）的 min-height:0 被恢复为先前正值', () => {
    const files = {
      'resources/styles/common.less': [
        '.c-env-monitor-chart {',
        '  width: 100%;',
        '  height: 100%;',
        '  min-height: 160px;',
        '  overflow: hidden;',
        '}',
        '',
        '/* [自动修复] 模板 class .chart → 匹配元素 chart-section */',
        '.c-env-monitor-chart {',
        '  min-height: 0;',
        '}',
        '',
      ].join('\n'),
      'package/components/ChartSection.vue': chartVue(
        'c-env-monitor-chart',
        '.c-env-monitor-chart {\n  display: flex;\n  flex-direction: column;\n}\n',
      ),
    }
    const r = restoreChartMinHeightAfterZero(files)
    expect(r.fixed.length).toBe(1)
    expect(r.fixed[0].cls).toBe('c-env-monitor-chart')
    expect(r.fixed[0].value).toBe(160)
    const css = r.files['resources/styles/common.less']
    // 后置块里的 0 已被恢复
    const blocks = css.match(/\.c-env-monitor-chart\s*\{[^}]*\}/g) || []
    expect(blocks.length).toBe(2)
    expect(blocks[1]).toContain('min-height: 160px;')
    expect(blocks[1]).not.toContain('min-height: 0;')
  })

  it('同块内「正 min-height 后跟 0」也被恢复（T2 注入被反杀的形态）', () => {
    const files = {
      'package/components/ChartSection.vue': chartVue(
        'c-x-chart',
        '.c-x-chart {\n  display: flex;\n  min-height: 160px;\n  min-height: 0;\n}\n',
      ),
    }
    const r = restoreChartMinHeightAfterZero(files)
    expect(r.fixed.length).toBe(1)
    const style = (r.files['package/components/ChartSection.vue'].match(/<style[\s\S]*<\/style>/) || [''])[0]
    expect(style).not.toContain('min-height: 0;')
    expect(style).toContain('min-height: 160px;')
  })

  it('无正值的 min-height:0 一律不动（fail-open，不发明数值）', () => {
    const files = {
      'resources/styles/common.less': '.c-x-chart-section {\n  min-height: 0;\n}\n',
      'package/components/ChartSection.vue': chartVue(
        'c-x-chart',
        '.c-x-chart-section {\n  display: flex;\n  flex-direction: column;\n}\n',
      ),
    }
    const r = restoreChartMinHeightAfterZero(files)
    expect(r.fixed).toEqual([])
    expect(r.files['resources/styles/common.less']).toBe(files['resources/styles/common.less'])
  })

  it('非图表组件（无 echarts.init）零影响', () => {
    const files = {
      'resources/styles/common.less': '.c-plain {\n  min-height: 160px;\n}\n.c-plain {\n  min-height: 0;\n}\n',
      'package/components/Plain.vue': `<template>
  <div class="c-plain"></div>
</template>
<script setup>
import { ref } from 'vue'
const a = ref(1)
</script>
`,
    }
    const r = restoreChartMinHeightAfterZero(files)
    expect(r.fixed).toEqual([])
    expect(r.files['resources/styles/common.less']).toBe(files['resources/styles/common.less'])
  })
})
