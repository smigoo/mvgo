/**
 * G13 图表容器重建自愈单测（2026-11-12 · mc-lite-1794462096859-e6a099a0 真机实锤）。
 *
 * 现场：产物把图表挂在自身根模板、用 `<base-panel>` 外壳。宿主 base-panel 内部是
 * `<component :is="panelComponent" :key="currentPanel.value">`，面板类型一变（preview 主题
 * 联动 default-panel → aio-panel）⇒ unmount+mount ⇒ slot 子树 DOM 整体销毁重建，而产物根
 * 组件实例由宿主直接渲染、不被 unmount ⇒ `let chart` 仍指向已脱离文档的旧 div（onUnmounted
 * 不触发、从不 dispose），新容器又被产物 init 首行 `if (!ref.value || chart) return` 永久早退
 * ⇒ 图表永久空白（实测新元素 `_echarts_instance_=null`、无 canvas；容器尺寸自始非零）。
 *
 * 本注入器只做一件事：**纯附加**一个 `watch(<模板 ref>, ...)` —— 旧实例判定失效（其 getDom()
 * 仍等于旧元素）时 dispose + 置空，新元素出现时回调产物自身的 init 函数。不改产物任何既有语句。
 *
 * 断言口径：阳性（真机形态）/ 别名与直接两种写法 / `.value` 持有者 / 幂等 / 阴性三类（无
 * echarts、动态 :ref、非 script setup）/ fail-open（不可赋值持有者、实参非静态 ref）/
 * 注入产物 <script setup> 经 babel 解析仍为合法 JS。
 */
import { parse as parseJavaScript } from '@babel/parser'
import { injectChartRebuildGuard } from './code-healer.js'

const MARK = 'G13-chart-rebuild-guard'

/** 真机形态：与 mc-lite-1794462096859-e6a099a0/package/index.vue 同构（精简后）。 */
const REAL_SFC = `<template>
  <base-panel panelKey="default-panel">
    <div class="c-hazard-investigation">
      <div class="c-hazard-investigation__title">隐患调查</div>
      <div ref="chartRef" class="c-hazard-investigation-chart"></div>
    </div>
  </base-panel>
</template>
<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
let chart = null
let resizeObserver = null

const renderChart = () => {
  chart.setOption({ series: [{ type: 'bar', data: [1, 2, 3] }] }, true)
}

const initChartWhenReady = () => {
  if (!chartRef.value || chart) return
  const el = chartRef.value
  if (el.clientWidth <= 0 || el.clientHeight <= 0) return
  chart = echarts.init(el)
  renderChart()
  resizeObserver = new ResizeObserver(() => { if (chart) chart.resize() })
  resizeObserver.observe(el)
}

watch(chartRef, (el) => {
  if (el && !chart) {
    nextTick(() => initChartWhenReady())
  }
}, { immediate: true })

onMounted(() => nextTick(() => initChartWhenReady()))
onUnmounted(() => {
  chart?.dispose()
  chart = null
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>
<style lang="less" scoped>
.c-hazard-investigation-chart { min-height: 120px; }
</style>`

/** 取 .vue 的 <script ...> 内联内容（用于 JS 语法校验）。 */
function scriptOf(sfc: string): string {
  const m = sfc.match(/<script\b[^>]*>([\s\S]*?)<\/script>/)
  return m ? m[1] : ''
}

/** 断言 <script> 内容可被 babel 解析（sourceType=module）。 */
function expectParsableJs(sfc: string): void {
  expect(() =>
    parseJavaScript(scriptOf(sfc), { sourceType: 'module', plugins: ['jsx'] }),
  ).not.toThrow()
}

describe('injectChartRebuildGuard（G13 宿主重建图表容器自愈）', () => {
  test('真机形态 mc-lite-1794462096859-e6a099a0：注入纯附加 watch，既有语句零改动', () => {
    const r = injectChartRebuildGuard(REAL_SFC)
    expect(r.changed).toBe(true)
    expect(r.injected).toEqual(['chartRef→initChartWhenReady(chart)'])
    const after = r.content

    // ① 幂等标记 + 自愈 watch 双要素就位
    expect(after.includes(MARK)).toBe(true)
    expect(/watch\(\s*chartRef,\s*\(el, oldEl\) => \{/.test(after)).toBe(true)
    // ② 旧实例失效判定必须绑定「getDom() === oldEl」——否则会误杀仍有效的实例
    expect(/chart\.getDom\(\) === oldEl/.test(after)).toBe(true)
    expect(/chart\.dispose\(\)/.test(after)).toBe(true)
    expect(/chart = null/.test(after)).toBe(true)
    // ③ 新容器出现 ⇒ 回调产物**自身**的 init 入口（不另造一份 init）
    expect(/if \(el\) nextTick\(\(\) => initChartWhenReady\(\)\)/.test(after)).toBe(true)

    // ④ 产物既有语句逐字保留（含其自带 watch 守卫与卸载清理）
    for (const line of [
      'const chartRef = ref(null)',
      'let chart = null',
      'if (!chartRef.value || chart) return',
      'chart = echarts.init(el)',
      'watch(chartRef, (el) => {',
      'onUnmounted(() => {',
    ]) {
      expect(after.includes(line)).toBe(true)
    }
    // ⑤ 模板与样式原样（只追加 script 尾部）
    expect(after.match(/<template>[\s\S]*?<\/template>/)![0]).toBe(
      REAL_SFC.match(/<template>[\s\S]*?<\/template>/)![0],
    )
    expect(after.match(/<style[\s\S]*<\/style>/)![0]).toBe(
      REAL_SFC.match(/<style[\s\S]*<\/style>/)![0],
    )
    // ⑥ 注入后 <script setup> 仍是合法 JS
    expectParsableJs(after)
    // ⑦ 纯函数：不改输入
    expect(REAL_SFC.includes(MARK)).toBe(false)
  })

  test('watch / nextTick 未在 vue 具名 import 中 ⇒ 只补缺失符号，不重排既有 import', () => {
    const noWatch = REAL_SFC.replace(
      "import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'",
      "import { ref, onMounted, onUnmounted } from 'vue'",
    )
    const r = injectChartRebuildGuard(noWatch)
    expect(r.changed).toBe(true)
    const vueImport = r.content.match(/import \{[^}]*\} from 'vue'/)![0]
    expect(vueImport).toContain('watch')
    expect(vueImport).toContain('nextTick')
    expect(vueImport).toContain('ref')
    // 原 import 顺序未被破坏（ref 仍在最前）
    expect(/import \{ ref, onMounted, onUnmounted, watch, nextTick \} from 'vue'/.test(r.content)).toBe(true)
    expectParsableJs(r.content)
  })

  test('实参「局部别名」与「直接 ref.value」两种写法 ⇒ 均回溯到模板 ref 本体，注入项一致', () => {
    const direct = REAL_SFC
      .replace('  const el = chartRef.value\n', '')
      .replace('if (el.clientWidth <= 0 || el.clientHeight <= 0) return', 'if (chartRef.value.clientWidth <= 0 || chartRef.value.clientHeight <= 0) return')
      .replace('chart = echarts.init(el)', 'chart = echarts.init(chartRef.value)')
      .replace('resizeObserver.observe(el)', 'resizeObserver.observe(chartRef.value)')
    const viaAlias = injectChartRebuildGuard(REAL_SFC)
    const viaDirect = injectChartRebuildGuard(direct)
    expect(viaDirect.changed).toBe(true)
    expect(viaDirect.injected).toEqual(viaAlias.injected)
    expect(viaDirect.injected).toEqual(['chartRef→initChartWhenReady(chart)'])
    expect(/watch\(\s*chartRef,/.test(viaDirect.content)).toBe(true)
  })

  test('实例持有者是 ref（chartInstance.value = echarts.init(...)）⇒ 按 .value 形态注入', () => {
    const refHolder = REAL_SFC
      .replace('let chart = null', 'const chartInstance = ref(null)')
      .replace('chart.setOption', 'chartInstance.value.setOption')
      .replace(
        'if (!chartRef.value || chart) return',
        'if (!chartRef.value || chartInstance.value) return',
      )
      .replace('chart = echarts.init(el)', 'chartInstance.value = echarts.init(el)')
      .replace('if (chart) chart.resize()', 'if (chartInstance.value) chartInstance.value.resize()')
      .replace('chart?.dispose()', 'chartInstance.value?.dispose()')
      .replace('chart = null', 'chartInstance.value = null')
    const r = injectChartRebuildGuard(refHolder)
    expect(r.changed).toBe(true)
    expect(r.injected).toEqual(['chartRef→initChartWhenReady(chartInstance.value)'])
    expect(/chartInstance\.value = null/.test(r.content)).toBe(true)
    expect(/chartInstance\.value\.getDom\(\) === oldEl/.test(r.content)).toBe(true)
    expectParsableJs(r.content)
  })

  test('幂等：二次调用直接 alreadyInjected，内容不变、标记不叠加', () => {
    const once = injectChartRebuildGuard(REAL_SFC)
    const twice = injectChartRebuildGuard(once.content)
    expect(twice.changed).toBe(false)
    expect(twice.skipped).toBe('alreadyInjected')
    expect(twice.content).toBe(once.content)
    expect(once.content.split(MARK).length - 1).toBe(1)
  })

  test('阴性：无 echarts.init 的普通组件 ⇒ 原样返回', () => {
    const plain = `<template><div>{{ msg }}</div></template>\n<script setup>\nconst msg = 'hi'\n</script>`
    const r = injectChartRebuildGuard(plain)
    expect(r.changed).toBe(false)
    expect(r.content).toBe(plain)
    expect(r.skipped).toBe('noEcharts')
  })

  test('阴性：模板含动态 :ref ⇒ fail-open（ref 归属不可静态判定）', () => {
    const dyn = REAL_SFC.replace(
      '<div ref="chartRef" class="c-hazard-investigation-chart"></div>',
      '<div :ref="setChartEl" class="c-hazard-investigation-chart"></div>',
    )
    const r = injectChartRebuildGuard(dyn)
    expect(r.changed).toBe(false)
    expect(r.skipped).toBe('dynamicRef')
    expect(r.content).toBe(dyn)
  })

  test('阴性：非 <script setup>（Options API）⇒ 不注入', () => {
    const optionsApi = `<template>
  <div ref="chartRef" class="c-chart"></div>
</template>
<script>
import * as echarts from 'echarts'
export default {
  mounted() {
    this.chart = echarts.init(this.$refs.chartRef)
  },
}
</script>`
    const r = injectChartRebuildGuard(optionsApi)
    expect(r.changed).toBe(false)
    expect(r.content).toBe(optionsApi)
    expect(r.skipped).toBe('notScriptSetup')
  })

  test('fail-open：实例持有者不可重新赋值（const chart = ...）⇒ 跳过，不改产物', () => {
    const constHolder = REAL_SFC.replace('let chart = null\n', '').replace(
      'chart = echarts.init(el)',
      'const chart = echarts.init(el)',
    )
    const r = injectChartRebuildGuard(constHolder)
    expect(r.changed).toBe(false)
    expect(r.content).toBe(constHolder)
    expect(r.skipped).toContain('holderNotTopLevelLet:chart')
  })

  test('fail-open：echarts.init 实参不是模板里的静态 ref ⇒ 跳过', () => {
    const noStaticRef = REAL_SFC.replace(
      '<div ref="chartRef" class="c-hazard-investigation-chart"></div>',
      '<div class="c-hazard-investigation-chart"></div>',
    )
    const r = injectChartRebuildGuard(noStaticRef)
    expect(r.changed).toBe(false)
    expect(r.content).toBe(noStaticRef)
    expect(r.skipped).toContain('noStaticRefInTemplate:chartRef')
  })
})
