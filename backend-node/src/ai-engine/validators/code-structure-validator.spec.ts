import { CodeStructureValidator } from './code-structure-validator.js'

/**
 * CODE-011 回归测试：echarts.init 时序检测。
 *
 * 背景：2026-08-16 真实事故 mc-max-1786883979601-a1006223 被误杀——
 * 生成代码用 `onMounted(() => nextTick(() => initChart()))`（回调形式），
 * 语义等价于 `await nextTick()`，但旧正则只匹配 await 形式，误判为「同步 init」
 * → BLOCK → 重试耗尽 → fail-closed 失败，功能正确的组件无法发布。
 */

const makeVue = (scriptBody: string) =>
  `<template>
  <div class="root"><div ref="chartRef" class="chart"></div></div>
</template>
<script setup>
import * as echarts from 'echarts'
import { onMounted, nextTick } from 'vue'
${scriptBody}
</script>
<style lang="less" scoped>
.root { width: 100%; }
</style>`

const runCode011 = (content: string) => {
  const res = CodeStructureValidator.validate(
    [{ path: 'package/index.vue', content }],
    'test-component',
    { target: 'microcode' },
  )
  return res.issues.filter((i: any) => i.id === 'CODE-011')
}

describe('CODE-011 echarts.init 时序检测', () => {
  it('await nextTick() 形式放行', () => {
    const issues = runCode011(makeVue(`
      const initChart = () => { echarts.init(chartRef.value) }
      onMounted(async () => { await nextTick(); initChart() })
    `))
    expect(issues).toHaveLength(0)
  })

  it('nextTick(cb) 回调形式放行（本次事故形态）', () => {
    const issues = runCode011(makeVue(`
      const initChart = () => { echarts.init(chartRef.value) }
      onMounted(() => {
        nextTick(() => { initChart() })
      })
    `))
    expect(issues).toHaveLength(0)
  })

  it('requestAnimationFrame 形式放行', () => {
    const issues = runCode011(makeVue(`
      onMounted(() => { requestAnimationFrame(() => echarts.init(chartRef.value)) })
    `))
    expect(issues).toHaveLength(0)
  })

  it('setTimeout 延迟形式放行', () => {
    const issues = runCode011(makeVue(`
      onMounted(() => { setTimeout(() => echarts.init(chartRef.value), 50) })
    `))
    expect(issues).toHaveLength(0)
  })

  it('同步 init（无任何延迟）BLOCK', () => {
    const issues = runCode011(makeVue(`
      onMounted(() => { echarts.init(chartRef.value) })
    `))
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('BLOCK')
  })

  it('尺寸守卫 + ResizeObserver 延迟 init 放行（2026-08-16 事故形态）', () => {
    const issues = runCode011(makeVue(`
      const initChart = () => {
        if (!chartRef.value) return
        const { clientWidth, clientHeight } = chartRef.value
        if (clientWidth > 0 && clientHeight > 0) {
          chart = echarts.init(chartRef.value)
          updateChart()
          return
        }
        chartObserver = new ResizeObserver((entries) => {
          const { width, height } = entries[0].contentRect
          if (width > 0 && height > 0 && !chart) {
            chartObserver?.disconnect()
            chart = echarts.init(chartRef.value)
            updateChart()
          }
        })
        chartObserver.observe(chartRef.value)
      }
      onMounted(() => { initChart() })
    `))
    expect(issues).toHaveLength(0)
  })
})

/**
 * CODE-007 回归测试：Vue3 根面板背景字面量落地检测。
 *
 * 背景：2026-08-16 真实事故 mv-max-1786886396635-a4fced3e 被误杀——
 * 生成代码用 `:style="rootBgStyle"` 引用 computed（内部驼峰 backgroundColor:'#edf4fb'），
 * 视觉分析产出 `.styles.background = "浅灰蓝色背景 #edf4fb"`（中文描述 + 色值混合）。
 * 旧实现叠加 4 个缺陷导致 BLOCK：
 *   1. findRootStyleBlock 的 \b([a-z][\w-]*)\b 在连字符处断词，把 env-monitor-root 误捕为 root；
 *   2. extractRootBackgroundExpectation 把中文描述整段当期望值，未提取 #edf4fb；
 *   3. template 匹配正则缺捕获组，templateContent 恒为空 → 动态绑定检测从未生效；
 *   4. 动态绑定只认内联字面量，不认 :style="computedVar" 变量引用；且背景属性正则只认 kebab-case 不认驼峰 backgroundColor。
 */

const makeVue3 = (templateBody: string, scriptBody: string, styleBody = '') =>
  `<template>
${templateBody}
</template>
<script setup>
${scriptBody}
</script>
<style lang="less" scoped>
@import '../resources/styles/index.less';
${styleBody}
</style>`

const runCode007 = (content: string) => {
  const res = CodeStructureValidator.validate(
    [{ path: 'package/index.vue', content }],
    'test-component',
    {
      target: 'vue3',
      layoutStructure: { styles: { background: '浅灰蓝色背景 #edf4fb' } },
      visualElements: {},
      resourceDomMapping: [],
    },
  )
  return res.issues.filter((i: any) => i.id === 'CODE-007')
}

describe('CODE-007 Vue3 根面板背景字面量检测', () => {
  it(':style="computedVar" 引用变量 + 驼峰 backgroundColor 放行（本次事故形态）', () => {
    const content = makeVue3(
      `  <div class="env-monitor-root" :style="rootBgStyle"></div>`,
      `import { computed } from 'vue'
const rootBgStyle = computed(() => ({
  backgroundColor: '#edf4fb',
  backgroundSize: 'cover'
}))`,
    )
    expect(runCode007(content)).toHaveLength(0)
  })

  it('静态 CSS 字面量 .env-monitor-root { background-color: #edf4fb } 放行', () => {
    const content = makeVue3(
      `  <div class="env-monitor-root"></div>`,
      ``,
      `.env-monitor-root { background-color: #edf4fb; }`,
    )
    expect(runCode007(content)).toHaveLength(0)
  })

  it('内联 :style="{ backgroundColor: \"#edf4fb\" }" 放行', () => {
    const content = makeVue3(
      `  <div class="env-monitor-root" :style="{ backgroundColor: '#edf4fb' }"></div>`,
      ``,
    )
    expect(runCode007(content)).toHaveLength(0)
  })

  it('根面板有背景但代码完全未落地 → BLOCK（2026-09-03 由 WARN 升级，防深色兜底顶替 Figma 背景色）', () => {
    const content = makeVue3(
      `  <div class="env-monitor-root"></div>`,
      ``,
      `.env-monitor-root { width: 100%; }`,
    )
    const issues = runCode007(content)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('BLOCK')
  })
})

/**
 * CODE-001 回归测试：<style lang="less" scoped> 属性顺序无关。
 *
 * 背景：2026-08-16 审计发现旧正则 /<style[^>]*lang=["']less["'][^>]*scoped/
 * 要求 lang 必须排在 scoped 前，模型写 <style scoped lang="less">（Vue 等价写法）
 * 会被误判为缺 lang="less" → BLOCK 误杀。
 */
const runCode001 = (content: string) => {
  const res = CodeStructureValidator.validate(
    [{ path: 'package/index.vue', content }],
    'test-component',
    { target: 'vue3' },
  )
  return res.issues.filter((i: any) => i.id === 'CODE-001')
}

describe('CODE-001 style 属性顺序无关', () => {
  it('<style scoped lang="less">（属性顺序颠倒）放行', () => {
    const content = `<template><div class="root"></div></template>
<script setup>
</script>
<style scoped lang="less">
@import '../resources/styles/index.less';
.root { width: 100%; }
</style>`
    expect(runCode001(content)).toHaveLength(0)
  })

  it('<style lang="less" scoped>（标准顺序）放行', () => {
    const content = `<template><div class="root"></div></template>
<script setup>
</script>
<style lang="less" scoped>
@import '../resources/styles/index.less';
.root { width: 100%; }
</style>`
    expect(runCode001(content)).toHaveLength(0)
  })

  it('<style scoped>（缺 lang="less"）→ BLOCK', () => {
    const content = `<template><div class="root"></div></template>
<script setup>
</script>
<style scoped>
.root { width: 100%; }
</style>`
    const issues = runCode001(content)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('BLOCK')
  })

  it('没有任何 style 块 → BLOCK', () => {
    const content = `<template><div class="root"></div></template>
<script setup>
</script>`
    const issues = runCode001(content)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('BLOCK')
  })
})

describe('R5：L0-B 空集不得 pass=true（EMPTY_ARTIFACT）', () => {
  it('空数组 → pass=false + EMPTY_ARTIFACT', () => {
    const res = CodeStructureValidator.validate([], 'c', { target: 'microcode' })
    expect(res.pass).toBe(false)
    expect(res.blockCount).toBeGreaterThan(0)
    expect(res.issues.some((i) => i.id === 'EMPTY_ARTIFACT')).toBe(true)
  })

  it('只有空 content 的 .vue → pass=false', () => {
    const res = CodeStructureValidator.validate(
      [{ path: 'package/index.vue', content: '   ' }],
      'c',
      { target: 'microcode' },
    )
    expect(res.pass).toBe(false)
    expect(res.issues.some((i) => i.id === 'EMPTY_ARTIFACT')).toBe(true)
  })

  it('仅占位文件（declare.json）无 .vue → pass=false', () => {
    const res = CodeStructureValidator.validate(
      [{ path: 'declare.json', content: '{}' }],
      'c',
      { target: 'microcode' },
    )
    expect(res.pass).toBe(false)
  })

  it('存在非空 .vue → 不触发 EMPTY_ARTIFACT', () => {
    const res = CodeStructureValidator.validate(
      [{ path: 'package/index.vue', content: makeVue('') }],
      'c',
      { target: 'microcode' },
    )
    expect(res.issues.some((i) => i.id === 'EMPTY_ARTIFACT')).toBe(false)
  })
})

/**
 * CODE-016 / CODE-017 误判回归测试（2026-08-31，mc-max-1788156091997-aa001b1d 实锤）。
 *
 * 背景：环境监测组件连续 3 轮重试全部 BLOCK 在 CODE-016/017，而产物本身是正确的：
 *   - bg-tab-active-7891 是 bgRole==='sub-state' 的 tab 选中态底图，挂在 .tab-item-active 上合理；
 *   - CODE-017 数出的「引用 3 次」里，2 次是 theme-vars.less 的 light/dark 变量定义，
 *     那是模板自带的，LLM 无论怎么改都消不掉 → 重试必然耗尽。
 * 根因：两条规则都没读 resourceDomMapping 里已有的 bgRole / mountTarget 字段，
 *       且 CODE-017 的直写统计漏了排除 less-var-decl（与 CODE-016 处理互相矛盾）。
 *
 * 每组都带负面对照：确认放宽的是「误判」，真实误挂仍被拦截。
 */

const V: any = CodeStructureValidator

/** 只放样式的组件骨架；index.vue 的 template 带根容器 class 供 _extractRootContainerClass 提取 */
const makeStyleFiles = (lessFiles: Array<{ path: string; content: string }>) => [
  {
    path: 'package/index.vue',
    content: `<template>
  <div class="c-test-root"><div class="c-test-tabs-list"></div><div class="c-test-chart-area"></div></div>
</template>
<script setup>
</script>
<style lang="less" scoped>
.c-test-root { width: 100%; }
</style>`,
  },
  ...lessFiles,
]

/** 复刻 figma-connector.js 产出的 mapping：bg-tab-active 是 sub-state，bg-7890 是 container */
const MAPPING = [
  {
    resourceFile: '../resources/images/bg-tab-active-7891.png',
    figmaPath: 'cp-环境监测/slot-con/sub-t/tabs-list/bg-tab-active',
    previewAnalysisRole: 'bg',
    bgRole: 'sub-state',
    mountTarget: 'tabs-list',
  },
  {
    resourceFile: '../resources/images/bg-7890.png',
    figmaPath: 'cp-环境监测/slot-con/sub-t/tabs-list/bg',
    previewAnalysisRole: 'bg',
    bgRole: 'container',
    mountTarget: 'tabs-list',
  },
]

const runValidator = (
  lessFiles: Array<{ path: string; content: string }>,
  mapping: any[] = MAPPING,
) =>
  V.validate(makeStyleFiles(lessFiles), 'c-test', {
    target: 'microcode',
    resourceDomMapping: mapping,
  })

const blocksOf = (res: any, id: string) =>
  res.issues.filter((i: any) => i.id === id && i.severity === 'BLOCK')

describe('CODE-016 背景挂载容器判定', () => {
  it('sub-state 状态背景挂非根容器（tab 选中态）→ 不 BLOCK', () => {
    const res = runValidator([
      {
        path: 'resources/styles/common.less',
        content: `.c-test-tab-item-active {
  color: #fff;
  background-image: url(../images/bg-tab-active-7891.png);
  background-size: cover;
}`,
      },
    ])
    expect(blocksOf(res, 'CODE-016')).toHaveLength(0)
  })

  it('整块背景挂在 mountTarget 指定的容器（tabs-list）→ 不 BLOCK', () => {
    const res = runValidator([
      {
        path: 'resources/styles/common.less',
        content: `.c-test-tabs-list {
  background-image: url(../images/bg-7890.png);
}`,
      },
    ])
    expect(blocksOf(res, 'CODE-016')).toHaveLength(0)
  })

  it('整块背景挂在根容器 → 不 BLOCK（既有行为保持）', () => {
    const res = runValidator([
      {
        path: 'resources/styles/common.less',
        content: `.c-test-root {
  background-image: url(../images/bg-7890.png);
}`,
      },
    ])
    expect(blocksOf(res, 'CODE-016')).toHaveLength(0)
  })

  it('负面对照：整块背景挂到无关容器（chart-area，非 mountTarget）→ 仍 BLOCK', () => {
    const res = runValidator([
      {
        path: 'resources/styles/common.less',
        content: `.c-test-chart-area {
  background-image: url(../images/bg-7890.png);
}`,
      },
    ])
    expect(blocksOf(res, 'CODE-016').length).toBeGreaterThan(0)
  })

  // 🛡️ R6（2026-08-31，mc-max-1788165979299-01f105b7 实锤 3 轮重试耗尽）：
  //   mountTarget 是 **Figma 图层名**（'tabs-list'），产物 class 是 **LLM 自己起的名**
  //   （'c-env-monitor-tabs-container'，不含 'list'）——两个命名体系天然对不上。
  //   改动前要求 mountTarget 的每个实词都出现在选择器里 ⇒ LLM 即使把背景正确挂到
  //   tabs 容器上，只要类名里没有 'list' 就必然 BLOCK；且报错文案从不输出 'tabs-list'
  //   这个值 ⇒ LLM 只能盲改，重试预算耗尽是必然结果（不是模型能力问题）。
  it('🆕R6：挂到 LLM 自起的 tabs-container（只含最长实词 tabs）→ 不 BLOCK', () => {
    const res = runValidator([
      {
        path: 'resources/styles/common.less',
        content: `.c-test-tabs-container {
  background-image: url(../images/bg-7890.png);
}`,
      },
    ])
    expect(blocksOf(res, 'CODE-016')).toHaveLength(0)
  })

  it('🆕R6：退化级只认「最长实词」，不是「任意实词」（只含 list 的容器仍 BLOCK）', () => {
    const res = runValidator([
      {
        path: 'resources/styles/common.less',
        content: `.c-test-list-item {
  background-image: url(../images/bg-7890.png);
}`,
      },
    ])
    expect(blocksOf(res, 'CODE-016').length).toBeGreaterThan(0)
  })

  it('🆕R6：BLOCK 文案输出 mountTarget 实际值 + 本组件可挂载候选容器', () => {
    const res = runValidator([
      {
        path: 'resources/styles/common.less',
        content: `.c-test-chart-area {
  background-image: url(../images/bg-7890.png);
}`,
      },
    ])
    const blocks = blocksOf(res, 'CODE-016')
    expect(blocks.length).toBeGreaterThan(0)
    const msg = blocks[0].message
    expect(msg).toContain("mountTarget='tabs-list'")
    expect(msg).toContain('【本组件挂载指引】')
    expect(msg).toContain('.c-test-tabs-list')
  })

  it('_selectorMatchesMountTarget：单词 mountTarget 行为不变；纯通用词（bg）恒不匹配', () => {
    const M = (s: string, t: string) =>
      (CodeStructureValidator as any)._selectorMatchesMountTarget(s, t)
    expect(M('.c-xxx-header', 'header')).toBe(true)
    expect(M('.c-xxx-footer', 'header')).toBe(false)
    expect(M('.c-xxx-bg', 'bg')).toBe(false)
    expect(M('', 'tabs-list')).toBe(false)
  })

  it('_collectMountCandidates：只吐「能过校验」的容器，且不含误挂容器', () => {
    const files = makeStyleFiles([
      {
        path: 'resources/styles/common.less',
        content: '.c-test-chart-area { background-image: url(../images/bg-7890.png); }',
      },
    ])
    const cands = (
      CodeStructureValidator as any
    )._collectMountCandidates(files, 'tabs-list')
    expect(cands.length).toBeGreaterThan(0)
    expect(cands).toContain('.c-test-tabs-list')
    expect(cands.some((c: string) => c.includes('chart-area'))).toBe(false)
  })
})

describe('CODE-017 整块背景重复挂载判定', () => {
  const THEME_VARS = `.theme-light() {
  @bg-main: url(../resources/images/bg-7890.png);
}
.theme-dark() {
  @bg-main: url(../resources/images/bg-7890.png);
}`

  it('light/dark 主题变量定义 + 1 次真实挂载 → 不 BLOCK（变量定义不得计入）', () => {
    const res = runValidator([
      { path: 'resources/styles/themes/theme-vars.less', content: THEME_VARS },
      {
        path: 'resources/styles/common.less',
        content: `.c-test-tabs-list {
  background-image: url(../images/bg-7890.png);
}`,
      },
    ])
    expect(blocksOf(res, 'CODE-017')).toHaveLength(0)
  })

  it('sub-state 状态背景多处挂载 → 不 BLOCK（CODE-017 只管整块背景）', () => {
    const res = runValidator([
      {
        path: 'resources/styles/common.less',
        content: `.c-test-tab-item-active {
  background-image: url(../images/bg-tab-active-7891.png);
}
.c-test-tab-item-active-large {
  background-image: url(../images/bg-tab-active-7891.png);
}`,
      },
    ])
    expect(blocksOf(res, 'CODE-017')).toHaveLength(0)
  })

  it('负面对照：整块背景真实挂载 2 处（无变量定义）→ 仍 BLOCK', () => {
    const res = runValidator([
      {
        path: 'resources/styles/common.less',
        content: `.c-test-tabs-list {
  background-image: url(../images/bg-7890.png);
}
.c-test-chart-area {
  background-image: url(../images/bg-7890.png);
}`,
      },
    ])
    expect(blocksOf(res, 'CODE-017').length).toBeGreaterThan(0)
  })

  it('去重场景：3 个不同背景变量指向同一去重图片、各挂一处 → 不 BLOCK（2026-09-03 设备监测 12 卡片实锤）', () => {
    // 12 个设备卡片背景结构相同被资源去重成同一文件 bg-8439.png，各用 bg3/bg4/bg5 变量挂到各自卡片。
    // 修复前按文件名统计合并成「bg-8439.png 引用 3 次」误判；修复后按变量名统计，各 1 次不报。
    const mapping = [
      { resourceFile: '../resources/images/bg-8439.png', previewAnalysisRole: 'bg', bgRole: 'container' },
      { resourceFile: '../resources/images/bg-8439.png', previewAnalysisRole: 'bg', bgRole: 'container' },
      { resourceFile: '../resources/images/bg-8439.png', previewAnalysisRole: 'bg', bgRole: 'container' },
    ]
    const res = runValidator(
      [
        {
          path: 'package/index.vue',
          content: `<template><div class="root"><div :style="{ backgroundImage: 'url(' + bg3 + ')' }"></div><div :style="{ backgroundImage: 'url(' + bg4 + ')' }"></div><div :style="{ backgroundImage: 'url(' + bg5 + ')' }"></div></div></template>
<script setup>
import bg3 from '../resources/images/bg-8439.png'
import bg4 from '../resources/images/bg-8439.png'
import bg5 from '../resources/images/bg-8439.png'
</script>`,
        },
      ],
      mapping,
    )
    expect(blocksOf(res, 'CODE-017')).toHaveLength(0)
  })

  it('同一变量被引用 2 处（url(${bg1}) + :src="bg1"）→ 仍 BLOCK', () => {
    const res = runValidator([
      {
        path: 'package/index.vue',
        content: `<template><div class="root"><div :style="{ backgroundImage: 'url(' + bg1 + ')' }"></div><img :src="bg1" /></div></template>
<script setup>
import bg1 from '../resources/images/bg-7890.png'
</script>`,
      },
    ])
    expect(blocksOf(res, 'CODE-017').length).toBeGreaterThan(0)
  })
})

/**
 * EMPTY_BODY 主体空壳检测（2026-08-31，事故 4 mc-max-1788179386544-86ab341b 实锤）。
 *
 * 背景：重试轮 LLM 把全部内容塞进 base-panel 的 header_right 命名插槽、
 * 默认插槽（主体）为空 → 空壳照样 pass 发布 → 用户看到空面板。
 * 本检查与 EMPTY_ARTIFACT 互补：EMPTY_ARTIFACT 检测「没有任何 .vue 文件」，
 * EMPTY_BODY 检测「有 index.vue 但默认插槽为空」。
 */
describe('EMPTY_BODY 主体空壳检测', () => {
  const makeEmptyBodyVue = (namedSlotContent: string) =>
    `<template>
  <base-panel panelKey="default-panel">
    <template #header_right>
      ${namedSlotContent}
    </template>
  </base-panel>
</template>
<script setup>
import HeaderTabs from './components/HeaderTabs.vue'
</script>
<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>`

  const makeNormalVue = (defaultSlotContent: string) =>
    `<template>
  <base-panel panelKey="default-panel">
    <template #header_right>
      <HeaderTabs />
    </template>
    ${defaultSlotContent}
  </base-panel>
</template>
<script setup>
import HeaderTabs from './components/HeaderTabs.vue'
import ChartArea from './components/ChartArea.vue'
</script>
<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>`

  const runEmptyBody = (content: string) => {
    const res = CodeStructureValidator.validate(
      [{ path: 'package/index.vue', content }],
      'test-component',
      { target: 'microcode' },
    )
    return res.issues.filter((i: any) => i.id === 'EMPTY_BODY')
  }

  it('默认插槽为空 + 命名插槽有实质内容 → BLOCK', () => {
    const content = makeEmptyBodyVue('<HeaderTabs /><ChartControls />')
    const issues = runEmptyBody(content)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('BLOCK')
    expect(issues[0].message).toContain('默认插槽')
    expect(issues[0].message).toContain('命名插槽')
  })

  it('默认插槽只有注释 → BLOCK', () => {
    const content = `<template>
  <base-panel>
    <template #header_right><HeaderTabs /></template>
    <!-- 主体内容待填充 -->
  </base-panel>
</template>
<script setup></script>
<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>`
    const issues = runEmptyBody(content)
    expect(issues).toHaveLength(1)
  })

  it('默认插槽只有空白 → BLOCK', () => {
    const content = `<template>
  <base-panel>
    <template #header_right><HeaderTabs /></template>
    
    
  </base-panel>
</template>
<script setup></script>
<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>`
    const issues = runEmptyBody(content)
    expect(issues).toHaveLength(1)
  })

  it('默认插槽有实质内容 → 不触发', () => {
    const content = makeNormalVue('<div class="root"><ChartArea /></div>')
    const issues = runEmptyBody(content)
    expect(issues).toHaveLength(0)
  })

  it('没有命名插槽 + 默认插槽有内容 → 不触发', () => {
    const content = `<template>
  <div class="root">
    <ChartArea />
  </div>
</template>
<script setup>
import ChartArea from './components/ChartArea.vue'
</script>
<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>`
    const issues = runEmptyBody(content)
    expect(issues).toHaveLength(0)
  })

  it('没有命名插槽 + 默认插槽也为空 → 不触发 EMPTY_BODY（由 EMPTY_ARTIFACT 处理）', () => {
    const content = `<template>
  <div class="root"></div>
</template>
<script setup></script>
<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>`
    const issues = runEmptyBody(content)
    // 没有命名插槽时不触发 EMPTY_BODY，避免与 EMPTY_ARTIFACT 重复报告
    expect(issues).toHaveLength(0)
  })

  it('多个命名插槽都有内容 + 默认插槽为空 → BLOCK', () => {
    const content = `<template>
  <base-panel>
    <template #header_left><Logo /></template>
    <template #header_right><HeaderTabs /></template>
    <template #footer><Footer /></template>
  </base-panel>
</template>
<script setup></script>
<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>`
    const issues = runEmptyBody(content)
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('header_left')
    expect(issues[0].message).toContain('header_right')
  })

  it('BLOCK 文案输出具体哪些命名插槽有内容，引导 LLM 修正', () => {
    const content = makeEmptyBodyVue('<HeaderTabs />')
    const issues = runEmptyBody(content)
    expect(issues[0].message).toContain('header_right')
    expect(issues[0].message).toContain('主体内容（图表/列表/卡片）必须放默认插槽')
  })
})

describe('_selectorMatchesMountTarget 挂载容器匹配', () => {
  it('mountTarget 全部关键词命中选择器 → true', () => {
    expect(V._selectorMatchesMountTarget('.c-mc-x-c-env-tabs-list', 'tabs-list')).toBe(true)
  })

  it('mountTarget 关键词未全部命中 → false（避免放行真实误挂）', () => {
    expect(V._selectorMatchesMountTarget('.c-mc-x-c-env-chart-area', 'tabs-list')).toBe(false)
  })

  // 🛡️ R6（2026-08-31）：本用例断言被**有意反转**（false → true）。
  //   旧行为：只命中部分关键词 → false。
  //   新行为：严格级失败后退化为「最长实词命中」→ true。
  //   原因：mountTarget 是 **Figma 图层名**（'tabs-list'），产物 class 是 **LLM 自己起的名**
  //   （'c-env-monitor-tabs-container'）——两个命名体系天然对不上，要求全词命中等于要求
  //   LLM 猜中 Figma 图层的每一个词。mc-max-1788165979299-01f105b7 实锤：LLM 把背景正确
  //   挂到 tabs 容器上，仅因类名无 'list' 就被 BLOCK，且文案从不输出 'tabs-list' → 3 轮重试全败。
  //   放宽的只是「命名差异」，真实误挂仍被拦截（见下方 chart-area / list-item 两条负面对照）。
  it('🆕R6 只命中「最长实词」→ true（LLM 自起类名，命名体系错位兼容）', () => {
    expect(V._selectorMatchesMountTarget('.c-mc-x-c-env-tabs', 'tabs-list')).toBe(true)
  })

  it('🆕R6 只命中「次长实词」→ false（退化级是「最长实词」命中，不是「任意实词」）', () => {
    expect(V._selectorMatchesMountTarget('.c-mc-x-c-env-list-item', 'tabs-list')).toBe(false)
  })

  it('mountTarget 为空/undefined → false', () => {
    expect(V._selectorMatchesMountTarget('.c-mc-x-c-env-tabs-list', '')).toBe(false)
    expect(V._selectorMatchesMountTarget('.c-mc-x-c-env-tabs-list', undefined)).toBe(false)
  })

  it('选择器为空 → false', () => {
    expect(V._selectorMatchesMountTarget('', 'tabs-list')).toBe(false)
  })
})

describe('CODE-014 根容器装饰臆造判定（面板背景豁免）', () => {
  // 复刻 mc-1788157559938-782399cf 实锤形态：bg-7880 是 skipMount:true 的面板整体背景
  const PANEL_BG_MAPPING = [
    {
      resourceFile: '../resources/images/bg-7880.png',
      figmaPath: 'cp-环境监测/bg',
      previewAnalysisRole: 'bg',
      skipMount: true,
      bgRole: 'container',
    },
  ]
  const STYLE_EVIDENCE_NO_BG = {
    background: { allowed: false, evidence: null },
    border: { allowed: false, evidence: null },
    borderRadius: { allowed: false, evidence: null },
    boxShadow: { allowed: false, evidence: null },
  }

  const runCode014 = (rootStyleBody: string, mapping: any[]) =>
    V.validate(
      [
        {
          path: 'package/index.vue',
          content: `<template>
  <div class="c-test-root"><div class="c-test-tabs-list"></div></div>
</template>
<script setup>
</script>
<style lang="less" scoped>
.c-test-root { width: 100%; }
</style>`,
        },
        {
          path: 'resources/styles/common.less',
          content: `.c-test-root {
${rootStyleBody}
}`,
        },
      ],
      'c-test',
      {
        target: 'microcode',
        resourceDomMapping: mapping,
        styleEvidence: STYLE_EVIDENCE_NO_BG,
      },
    )

  it('N4 注入的 skipMount 面板背景（url 命中面板资源）→ 不 BLOCK', () => {
    const res = runCode014(
      `  background-image: url('../images/bg-7880.png');
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;`,
      PANEL_BG_MAPPING,
    )
    expect(blocksOf(res, 'CODE-014')).toHaveLength(0)
  })

  it('负面对照：臆造渐变背景（无 mapping 证据）→ 仍 BLOCK', () => {
    const res = runCode014(
      `  background: linear-gradient(90deg, #b5deff 0%, #d1ecff 100%);`,
      PANEL_BG_MAPPING,
    )
    expect(blocksOf(res, 'CODE-014').length).toBeGreaterThan(0)
  })

  it('负面对照：url 指向非面板资源（臆造别处图片）→ 仍 BLOCK', () => {
    const res = runCode014(
      `  background-image: url('../images/some-other-bg.png');`,
      PANEL_BG_MAPPING,
    )
    expect(blocksOf(res, 'CODE-014').length).toBeGreaterThan(0)
  })

  it('负面对照：无 resourceDomMapping 时保持原判定 → 仍 BLOCK', () => {
    const res = runCode014(
      `  background-image: url('../images/bg-7880.png');`,
      [],
    )
    expect(blocksOf(res, 'CODE-014').length).toBeGreaterThan(0)
  })

  it('臆造边框不受面板背景豁免影响 → 仍 BLOCK', () => {
    const res = runCode014(
      `  background-image: url('../images/bg-7880.png');
  border: 1px solid #4a758d;`,
      PANEL_BG_MAPPING,
    )
    expect(
      res.issues.filter(
        (i: any) =>
          i.id === 'CODE-014' && i.message.includes('border'),
      ).length,
    ).toBeGreaterThan(0)
  })
})

/**
 * R1' 组件树骨架提取（2026-09-01，重试轮结构锚定）。
 *
 * 背景：当前重试机制只告诉 LLM "哪些文件有问题"，但没有告诉它"上一轮的整体结构是什么样的"，
 * 导致 LLM 在重试时可能重新组织整个结构，造成结构漂移（如：全部塞进命名插槽）。
 * 本函数从上一轮产物中提取组件树骨架（插槽分配 + 子组件清单），注入到重试指导中，
 * 约束 LLM 只重生成失败分块、不得重排结构。
 */
describe('R1: extractComponentSkeleton 组件树骨架提取', () => {
  it('提取主组件的插槽分配（默认插槽 + 命名插槽）', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template>
  <base-panel>
    <template #header_left>
      <div class="title">标题</div>
    </template>
    <template #header_right>
      <tabs />
    </template>
    <ChartArea />
    <StatsPanel />
  </base-panel>
</template>
<script setup>
import ChartArea from './components/ChartArea.vue'
import StatsPanel from './components/StatsPanel.vue'
</script>`,
      },
    ]

    const skeleton = (CodeStructureValidator as any).extractComponentSkeleton(files)

    expect(skeleton).toContain('默认插槽')
    expect(skeleton).toContain('ChartArea')
    expect(skeleton).toContain('StatsPanel')
    expect(skeleton).toContain('命名插槽')
    expect(skeleton).toContain('#header_left')
    expect(skeleton).toContain('#header_right')
  })

  it('提取子组件清单及其职责', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template>
  <div>
    <ChartArea />
    <StatsPanel />
  </div>
</template>`,
      },
      {
        path: 'package/components/ChartArea.vue',
        content: `<template>
  <div class="chart-area">
    <!-- 主图表区域 -->
    <div ref="chartRef"></div>
  </div>
</template>`,
      },
      {
        path: 'package/components/StatsPanel.vue',
        content: `<template>
  <div class="stats-panel">
    <!-- 统计指标面板 -->
    <div>指标1</div>
  </div>
</template>`,
      },
    ]

    const skeleton = (CodeStructureValidator as any).extractComponentSkeleton(files)

    expect(skeleton).toContain('子组件清单')
    expect(skeleton).toContain('ChartArea.vue')
    expect(skeleton).toContain('StatsPanel.vue')
  })

  it('空产物返回空骨架', () => {
    const files: any[] = []
    const skeleton = (CodeStructureValidator as any).extractComponentSkeleton(files)
    expect(skeleton).toBe('')
  })

  it('只有主组件无子组件时，只提取插槽信息', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template>
  <div>
    <template #header>
      <h1>标题</h1>
    </template>
    <p>主体内容</p>
  </div>
</template>`,
      },
    ]

    const skeleton = (CodeStructureValidator as any).extractComponentSkeleton(files)

    expect(skeleton).toContain('默认插槽')
    expect(skeleton).toContain('主体内容')
    expect(skeleton).toContain('命名插槽')
    expect(skeleton).toContain('#header')
    expect(skeleton).not.toContain('子组件清单')
  })

  it('骨架格式可读性强，适合注入 prompt', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template>
  <base-panel>
    <template #header_left>
      <div>标题</div>
    </template>
    <ChartArea />
  </base-panel>
</template>`,
      },
      {
        path: 'package/components/ChartArea.vue',
        content: `<template><div>图表</div></template>`,
      },
    ]

    const skeleton = (CodeStructureValidator as any).extractComponentSkeleton(files)

    // 验证格式：包含清晰的分区标记
    expect(skeleton).toMatch(/##\s*主组件结构/)
    expect(skeleton).toMatch(/##\s*子组件清单/)
    // 验证信息密度：不超过 500 字（避免占用过多 prompt 预算）
    expect(skeleton.length).toBeLessThan(500)
  })

  it('骨架注入到重试指导中，约束 LLM 不得重排结构', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template>
  <base-panel>
    <template #header_left>
      <Logo />
    </template>
    <template #header_right>
      <HeaderTabs />
    </template>
    <ChartArea />
  </base-panel>
</template>`,
      },
      {
        path: 'package/components/ChartArea.vue',
        content: `<template><div>图表</div></template>`,
      },
    ]

    const skeleton = (CodeStructureValidator as any).extractComponentSkeleton(files)

    // 验证骨架包含关键约束信息
    expect(skeleton).toContain('header_left')
    expect(skeleton).toContain('header_right')
    expect(skeleton).toContain('ChartArea')
    // 验证骨架明确标注"不得重排"
    expect(skeleton).toContain('不得重排')
  })
})

describe('CODE-018 子组件资源依赖声明检查', () => {
  const SUB_MAPPING = [
    {
      resourceFile: '../resources/images/bg-tab-active-7891.png',
      previewAnalysisRole: 'bg',
      assignedVarName: 'bg1',
      downloadStatus: 'success',
    },
    {
      resourceFile: '../resources/images/bg-7890.png',
      previewAnalysisRole: 'bg',
      assignedVarName: 'bg2',
      downloadStatus: 'success',
    },
    {
      resourceFile: '../resources/images/icon-weather-1234.png',
      previewAnalysisRole: 'icon',
      assignedVarName: 'icon1',
      semanticVarName: 'iconWeather',
      downloadStatus: 'success',
    },
  ]

  const makeSubcompFiles = (subcompContent: string) => [
    {
      path: 'package/index.vue',
      content: `<template><div class="c-test-root"><TabSwitch /></div></template><script setup>import TabSwitch from './components/TabSwitch.vue'</script><style scoped>.c-test-root{}</style>`,
    },
    {
      path: 'package/components/TabSwitch.vue',
      content: subcompContent,
    },
  ]

  it('模板使用 bg2 且 script 导入了 bg2 → 不 BLOCK', () => {
    const files = makeSubcompFiles(`<template>
  <div class="c-tab-switch" :style="{ backgroundImage: \`url(\${bg2})\` }">
    <span class="tab-item">Tab 1</span>
  </div>
</template>
<script setup>
import bg2 from '../../resources/images/bg-7890.png'
</script>
<style scoped>
.c-tab-switch { width: 100%; }
</style>`)
    const res = V.validate(files, 'c-test', {
      target: 'microcode',
      resourceDomMapping: SUB_MAPPING,
    })
    expect(blocksOf(res, 'CODE-018')).toHaveLength(0)
  })

  it('模板使用 bg2 但 script 仅导入 bg1、未导入 bg2（mr7 实锤形态）→ BLOCK', () => {
    const files = makeSubcompFiles(`<template>
  <div class="c-tab-switch" :style="{ backgroundImage: \`url(\${bg2})\` }">
    <span class="tab-item">Tab 1</span>
  </div>
</template>
<script setup>
import bg1 from '../../resources/images/bg-tab-active-7891.png'
</script>
<style scoped>
.c-tab-switch { width: 100%; }
</style>`)
    const res = V.validate(files, 'c-test', {
      target: 'microcode',
      resourceDomMapping: SUB_MAPPING,
    })
    const blocks = blocksOf(res, 'CODE-018')
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks[0].file).toBe('package/components/TabSwitch.vue')
    expect(blocks[0].message).toContain('bg2')
  })

  it('模板使用语义名 iconWeather 且已 const 声明 → 不 BLOCK', () => {
    const files = makeSubcompFiles(`<template>
  <div class="c-tab-switch">
    <img :src="iconWeather" alt="weather" />
  </div>
</template>
<script setup>
const iconWeather = '/static/images/weather.png'
</script>
<style scoped>
.c-tab-switch { width: 100%; }
</style>`)
    const res = V.validate(files, 'c-test', {
      target: 'microcode',
      resourceDomMapping: SUB_MAPPING,
    })
    expect(blocksOf(res, 'CODE-018')).toHaveLength(0)
  })

  it('模板使用语义名 iconWeather 但未声明 → BLOCK', () => {
    const files = makeSubcompFiles(`<template>
  <div class="c-tab-switch">
    <img :src="iconWeather" alt="weather" />
  </div>
</template>
<script setup>
import bg1 from '../../resources/images/bg-tab-active-7891.png'
</script>
<style scoped>
.c-tab-switch { width: 100%; }
</style>`)
    const res = V.validate(files, 'c-test', {
      target: 'microcode',
      resourceDomMapping: SUB_MAPPING,
    })
    const blocks = blocksOf(res, 'CODE-018')
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks[0].message).toContain('iconWeather')
  })

  it('负面对照：未在 resourceDomMapping 注册的变量（普通组件 state 如 activeIndex）→ 不误判 CODE-018', () => {
    const files = makeSubcompFiles(`<template>
  <div class="c-tab-switch" :class="{ active: activeIndex === 0 }">
    <span>Tab</span>
  </div>
</template>
<script setup>
import { ref } from 'vue'
const activeIndex = ref(0)
</script>
<style scoped>
.c-tab-switch { width: 100%; }
</style>`)
    const res = V.validate(files, 'c-test', {
      target: 'microcode',
      resourceDomMapping: SUB_MAPPING,
    })
    expect(blocksOf(res, 'CODE-018')).toHaveLength(0)
  })
})

/**
 * FLEX-003 回归测试：跨样式源 flex 冲突（缺口③，2026-09-01）。
 *
 * 事故实证 mc-max-1788186816669-8f7b5097：子组件 SFC `<style scoped>` 写
 * `flex: 180 1 0`，common.less 同 class 写 `flex: 1`。scoped 编译后选择器带属性
 * 选择器（0,2,0）恒胜 common.less（0,1,0），后者成为永不生效的死样式；而块高度
 * 比例却按各自的值分别计算，最终与 Figma 设计稿严重不符。
 *
 * 单文件视角的 checkFlexUsage 永远抓不到这类冲突（它只看一个 <style> 块），
 * 故新增跨文件索引 checkFlexSourceConflicts。
 *
 * 每组都带负面对照：确认拦的是「真冲突」，层叠/响应式/编译产物一律不误伤。
 */

const mkFlexFiles = (
  vueStyle: string,
  extra: Array<{ path: string; content: string }>,
) => [
  {
    path: 'package/index.vue',
    content: `<template>
  <div class="c-test-root"><div class="c-test-chart-area"></div><div class="c-test-tabs-list"></div></div>
</template>
<script setup>
</script>
<style lang="less" scoped>
${vueStyle}
</style>`,
  },
  ...extra,
]

describe('FLEX-003 跨样式源 flex 冲突', () => {
  it('scoped SFC 与 common.less 同 class 两套 flex 值 → BLOCK（Task3 FlowPrediction 形态）', () => {
    const res = V.validate(
      mkFlexFiles('.c-test-chart-area { flex: 180 1 0; min-height: 0; }', [
        {
          path: 'resources/styles/common.less',
          content: '.c-test-chart-area { flex: 1; }',
        },
      ]),
      'c-test',
      { target: 'microcode' },
    )
    const blocks = blocksOf(res, 'FLEX-003')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].message).toContain('.c-test-chart-area')
    expect(blocks[0].message).toContain('180 1 0')
    // 命中 scoped 时必须把优先级结论写进文案，否则 LLM 无法判断该删哪一份
    expect(blocks[0].message).toContain('死样式')
  })

  it('负面对照：两个样式源写法完全一致 → 不 BLOCK（冗余声明但无害）', () => {
    const res = V.validate(
      mkFlexFiles('.c-test-chart-area { flex: 1 1 0; }', [
        {
          path: 'resources/styles/common.less',
          content: '.c-test-chart-area { flex: 1 1 0; }',
        },
      ]),
      'c-test',
      { target: 'microcode' },
    )
    expect(blocksOf(res, 'FLEX-003')).toHaveLength(0)
  })

  it('负面对照：同一文件内同 class 写多个值（层叠/响应式）→ 不 BLOCK', () => {
    const res = V.validate(
      mkFlexFiles('.c-test-root { width: 100%; }', [
        {
          path: 'resources/styles/common.less',
          content: `.c-test-chart-area { flex: 12 1 0; }
@media (max-width: 1440px) { .c-test-chart-area { flex: 1 1 0; } }`,
        },
      ]),
      'c-test',
      { target: 'microcode' },
    )
    expect(blocksOf(res, 'FLEX-003')).toHaveLength(0)
  })

  it('负面对照：与同名 .less 共存的 .css 编译产物不参与判定 → 不 BLOCK', () => {
    // index.css 是 index.less 的编译产物：LESS 会展开 mixin/层叠、把 `17 1 0` 归一化成 `1 1 0`。
    // 若把它也当独立样式源，会凭空造出「同 class 不同值」的假冲突（实锤：Task3 由 2 条真
    // 冲突膨胀到 6 条假冲突、Task1 无冲突却误报 1 条）。
    const res = V.validate(
      mkFlexFiles('.c-test-root { width: 100%; }', [
        {
          path: 'resources/styles/index.less',
          content: '.c-test-chart-area { flex: 17 1 0; }',
        },
        {
          path: 'resources/styles/index.css',
          content: '.c-test-chart-area { flex: 1 1 0; }',
        },
      ]),
      'c-test',
      { target: 'microcode' },
    )
    expect(blocksOf(res, 'FLEX-003')).toHaveLength(0)
  })

  it('负面对照：同文件内 flex 自覆盖冗余 + 跨文件 grow 语义等价 → 不 BLOCK（环境监测形态，2026-09-02）', () => {
    // 环境监测实锤：common.less 同 class 写 `flex: 1 1 0` 后又 `flex: 1`（自覆盖冗余），
    // scoped SFC 写 `flex: 1 1 0`。两者 grow 都是 1、语义等价（等比例分配），
    // 只是写法不同 + common.less 内部冗余 —— 不该判「跨文件冲突」误杀视觉正常的产物。
    const res = V.validate(
      mkFlexFiles('.c-test-chart-area { flex: 1 1 0; min-height: 0; }', [
        {
          path: 'resources/styles/common.less',
          content: '.c-test-chart-area { flex: 1 1 0; flex: 1; }',
        },
      ]),
      'c-test',
      { target: 'microcode' },
    )
    expect(blocksOf(res, 'FLEX-003')).toHaveLength(0)
  })
})

/**
 * FLEX-004 回归测试：flex-grow 量纲混用（缺口③）。
 *
 * 关键认知：**像素量级的 grow 不是 bug，而是规范要求**。
 * prompts/engineer/shared/root-container.md 要求内容区块写 `flex: <Figma高度px> 1 0`
 * （grow 直接取设计稿高度，由 flex 引擎自动等比分配）。真正的病灶是**同一组兄弟
 * 区块里两种量纲混排**（131/142/180 与 12/15/17 并存），比例才会崩坏。
 *
 * 故只 WARN 不 BLOCK：这些值也可能分属互不相干的嵌套容器。
 */
describe('FLEX-004 flex-grow 量纲混用', () => {
  const warnsOf = (res: any) =>
    res.issues.filter((i: any) => i.id === 'FLEX-004')

  it('像素量级（180）与比例量级（12）混用 → WARN', () => {
    const res = V.validate(
      mkFlexFiles('.c-test-root { width: 100%; }', [
        {
          path: 'resources/styles/common.less',
          content: `.c-test-chart-area { flex: 180 1 0; }
.c-test-tabs-list { flex: 12 1 0; }`,
        },
      ]),
      'c-test',
      { target: 'microcode' },
    )
    const warns = warnsOf(res)
    expect(warns).toHaveLength(1)
    expect(warns[0].severity).toBe('WARN')
    expect(warns[0].message).toContain('180')
    expect(warns[0].message).toContain('12')
  })

  it('无灰区设计：grow=19（比例量级）与 grow=20（像素量级）混用仍告警', () => {
    // 初版把阈值设成 RATIO_MAX=10 / PIXEL_MIN=20，11~19 成灰区，把 12/15/17 这类
    // **最典型**的比例值全部漏判（Task3 实证 FLEX-004 零命中）。现两阈值相邻不留缝。
    const res = V.validate(
      mkFlexFiles('.c-test-root { width: 100%; }', [
        {
          path: 'resources/styles/common.less',
          content: `.c-test-chart-area { flex: 19 1 0; }
.c-test-tabs-list { flex: 20 1 0; }`,
        },
      ]),
      'c-test',
      { target: 'microcode' },
    )
    expect(warnsOf(res)).toHaveLength(1)
  })

  it('负面对照：全部像素量级（规范要求写法）→ 不告警', () => {
    const res = V.validate(
      mkFlexFiles('.c-test-root { width: 100%; }', [
        {
          path: 'resources/styles/common.less',
          content: `.c-test-chart-area { flex: 180 1 0; }
.c-test-tabs-list { flex: 131 1 0; }
.c-test-footer { flex: 142 1 0; }`,
        },
      ]),
      'c-test',
      { target: 'microcode' },
    )
    expect(warnsOf(res)).toHaveLength(0)
  })

  it('负面对照：全部比例量级 → 不告警', () => {
    const res = V.validate(
      mkFlexFiles('.c-test-root { width: 100%; }', [
        {
          path: 'resources/styles/common.less',
          content: `.c-test-chart-area { flex: 12 1 0; }
.c-test-tabs-list { flex: 15 1 0; }
.c-test-footer { flex: 17 1 0; }`,
        },
      ]),
      'c-test',
      { target: 'microcode' },
    )
    expect(warnsOf(res)).toHaveLength(0)
  })
})

/**
 * EMPTY_SHELL 回归测试：降级空壳（缺口④，2026-09-01）。
 *
 * 事故实证 mc-max-1788186816558-fb3a1a7b（last-good = r-4e644c37）：4 个子组件被门禁
 * 隔离降级后，package/index.vue 的 5 个模块容器退化成 `<!-- 当日总流量 -->` 之类的
 * 占位注释，默认插槽里还剩一个空壳根 div ⇒ **EMPTY_BODY 不触发**（它要求默认插槽
 * 为空 + 命名插槽有内容），空壳照样全项 passed 直达发布，用户看到空白面板。
 *
 * 本检查与 EMPTY_BODY 互补：抓「主体被占位注释掏空」。
 */
describe('EMPTY_SHELL 降级空壳检测', () => {
  const mkIndexVue = (rootInner: string) => [
    {
      path: 'package/index.vue',
      content: `<template>
  <div class="c-test-root">
${rootInner}
  </div>
</template>
<script setup>
</script>
<style lang="less" scoped>
.c-test-root { width: 100%; }
</style>`,
    },
  ]

  it('5 个占位注释 + 仅 1 个真实元素 → BLOCK（Task2 实锤形态）', () => {
    const res = V.validate(
      mkIndexVue(`    <!-- 当日总流量 -->
    <!-- 江阴靖江长江隧道小时流量 -->
    <!-- 江阴大桥小时流量 -->
    <!-- 车型分布 -->
    <!-- 流量预测 -->
    <div class="c-test-placeholder">暂无数据</div>`),
      'c-test',
      { target: 'microcode' },
    )
    const blocks = blocksOf(res, 'EMPTY_SHELL')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].message).toContain('5')
  })

  it('注释里的 img 不充数：占位注释 3 个 + 仅剩 1 张图 → 仍 BLOCK', () => {
    // void 元素（img/br/input/path…）不承载内容，计数时必须排除，否则 Task2 里那张
    // `display:none` 的假绑定 img 会让空壳「看起来有内容」。
    const res = V.validate(
      mkIndexVue(`    <!-- 模块 A -->
    <!-- 模块 B -->
    <!-- 模块 C -->
    <img class="c-test-deco" src="/static/deco.png" />
    <br />`),
      'c-test',
      { target: 'microcode' },
    )
    expect(blocksOf(res, 'EMPTY_SHELL')).toHaveLength(1)
  })

  it('负面对照：占位注释 2 个但真实元素 4 个（内容完整）→ 不 BLOCK', () => {
    const res = V.validate(
      mkIndexVue(`    <!-- 顶部 KPI -->
    <!-- 下方图表 -->
    <div class="c-test-kpi"><div class="c-test-kpi-item"><span>26</span></div></div>
    <div class="c-test-chart-area"><div class="c-test-chart"></div></div>`),
      'c-test',
      { target: 'microcode' },
    )
    expect(blocksOf(res, 'EMPTY_SHELL')).toHaveLength(0)
  })

  it('负面对照：真实元素少但只有 1 个占位注释（未达阈值 2）→ 不 BLOCK', () => {
    const res = V.validate(
      mkIndexVue(`    <!-- 单一模块占位 -->
    <div class="c-test-single"></div>`),
      'c-test',
      { target: 'microcode' },
    )
    expect(blocksOf(res, 'EMPTY_SHELL')).toHaveLength(0)
  })
})

/**
 * VAR-UNUSED 回归测试：资源型 LESS 变量「定义后零消费」断尾（缺口①，2026-09-01）。
 *
 * 事故实证：Task1（r-18aef1f3）theme-vars.less:46/47 定义 @tab-active-bg / @container-bg，
 * 各定义 2 次、消费 0 次；Task2（r-4e644c37）五张 bg 同样全部零消费。
 *
 * 定级 **WARN 而非 BLOCK**：资源可能已通过 CSS 变量 / :style 绑定正确渲染（Task1 的 bg2
 * 正是走 JS 注入的 --bg-tab-active），死变量本身不直接造成视觉缺陷，BLOCK 会误杀已正确的
 * 产物；真正的「资源完全没渲染」由 RES-UNUSED 门禁 BLOCK 兜底，两者分工不重叠。
 */
describe('VAR-UNUSED 资源型 LESS 变量断尾', () => {
  const mkLessFiles = (less: Array<{ path: string; content: string }>) => [
    {
      path: 'package/index.vue',
      content: `<template>
  <div class="c-test-root"><div class="c-test-tabs-list"></div></div>
</template>
<script setup>
</script>
<style lang="less" scoped>
.c-test-root { width: 100%; }
</style>`,
    },
    ...less,
  ]

  const varWarns = (res: any) =>
    res.issues.filter((i: any) => i.id === 'VAR-UNUSED')

  it('定义后全产物零消费 → WARN', () => {
    const res = V.validate(
      mkLessFiles([
        {
          path: 'resources/styles/theme-vars.less',
          content: `@tab-active-bg: url('../images/bg-tab-active.png');
@container-bg: url('../images/bg-7890.png');`,
        },
      ]),
      'c-test',
      { target: 'microcode' },
    )
    const warns = varWarns(res)
    expect(warns).toHaveLength(2)
    expect(warns.every((w: any) => w.severity === 'WARN')).toBe(true)
    expect(warns.some((w: any) => w.message.includes('@tab-active-bg'))).toBe(
      true,
    )
  })

  it('负面对照：变量被 .less 实际消费 → 不告警', () => {
    const res = V.validate(
      mkLessFiles([
        {
          path: 'resources/styles/theme-vars.less',
          content: `@tab-active-bg: url('../images/bg-tab-active.png');`,
        },
        {
          path: 'resources/styles/common.less',
          content: `.c-test-tabs-list { background-image: @tab-active-bg; }`,
        },
      ]),
      'c-test',
      { target: 'microcode' },
    )
    expect(varWarns(res)).toHaveLength(0)
  })

  it('负面对照：light/dark 重复定义 2 次 + 消费 1 次 → 不告警', () => {
    const res = V.validate(
      mkLessFiles([
        {
          path: 'resources/styles/theme-vars.less',
          content: `@tab-active-bg: url('../images/light-tab.png');
@tab-active-bg: url('../images/dark-tab.png');`,
        },
        {
          path: 'resources/styles/common.less',
          content: `.c-test-tabs-list { background-image: @tab-active-bg; }`,
        },
      ]),
      'c-test',
      { target: 'microcode' },
    )
    expect(varWarns(res)).toHaveLength(0)
  })

  it('负面对照：非资源型变量（颜色）不纳管 → 不告警', () => {
    const res = V.validate(
      mkLessFiles([
        {
          path: 'resources/styles/theme-vars.less',
          content: `@primary-color: #00d4ff;
@panel-gap: 12px;`,
        },
      ]),
      'c-test',
      { target: 'microcode' },
    )
    expect(varWarns(res)).toHaveLength(0)
  })
})


/**
 * RESOURCE-003 回归测试 —— 已整体移除。
 *
 * 移除背景（2026-09-01 · mc-max-1788252098143-12469472 实锤）：RESOURCE-003 基于
 * findGradientBgSubstitute 的无边界子串匹配，mountTarget='t'（单字符 Figma 图层名）时
 * 误伤一切含 't' 的选择器 → 把 Figma 渐变文字的正确还原误判为「bg 被渐变替代」，
 * BLOCK 重试 3 轮逐字复现耗尽。判定已从 L0-B 门禁（code-structure-validator）与
 * adversarial-checker 全量移除，本测试块随之删除。
 */

/**
 * RESOURCE-001 口径统一回归（#481 步骤②）：资源写在 common.less（文件名直引）应判「已使用」。
 *
 * 旧口径只扫 .vue template/script 的 includes(varName)，模型把背景写进 common.less
 * （url(../resources/images/bg-7890.png)）时误判「未使用」WARN（mc-max-1788056145870 实锤）。
 * 统一后走 buildResourceUsageCorpus（扫 .less/.css + 文件名兜底）→ 判「已使用」。
 */
describe('RESOURCE-001 口径统一（corpus 同源，#481）', () => {
  it('资源写在 common.less（文件名直引）→ 判已使用，不报 RESOURCE-001', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: '<template><div class="root"></div></template>',
      },
      {
        path: 'resources/styles/common.less',
        content:
          '.root { background-image: url(../resources/images/bg-7890.png); }',
      },
    ]
    const res = CodeStructureValidator.validate(files, 'test', {
      target: 'microcode',
      resourceDomMapping: [
        {
          name: 'bg',
          previewAnalysisRole: 'bg',
          downloadStatus: 'success',
          assignedVarName: 'bg1',
          semanticVarName: 'bg1',
          resourceFile: '../resources/images/bg-7890.png',
          hint: 'bg → bg区域',
        },
      ],
    })
    const r1 = res.issues.filter((i: any) => i.id === 'RESOURCE-001')
    expect(r1).toHaveLength(0)
  })

  it('资源完全未引用 → 报 RESOURCE-001 WARN（corpus 判定未使用）', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: '<template><div class="root"></div></template>',
      },
    ]
    const res = CodeStructureValidator.validate(files, 'test', {
      target: 'microcode',
      resourceDomMapping: [
        {
          name: 'bg',
          previewAnalysisRole: 'bg',
          downloadStatus: 'success',
          assignedVarName: 'bg1',
          semanticVarName: 'bg1',
          resourceFile: '../resources/images/bg-7890.png',
          hint: 'bg → bg区域',
        },
      ],
    })
    const r1 = res.issues.filter((i: any) => i.id === 'RESOURCE-001')
    expect(r1).toHaveLength(1)
    expect(r1[0].severity).toBe('WARN')
  })

  it('display:none 假绑定不算使用（corpus 剔除）→ 仍报 RESOURCE-001', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template><div class="root"></div><img :src="bg1" style="display:none" alt="" /></template>`,
      },
    ]
    const res = CodeStructureValidator.validate(files, 'test', {
      target: 'microcode',
      resourceDomMapping: [
        {
          name: 'bg',
          previewAnalysisRole: 'bg',
          downloadStatus: 'success',
          assignedVarName: 'bg1',
          semanticVarName: 'bg1',
          resourceFile: '../resources/images/bg-7890.png',
          hint: 'bg → bg区域',
        },
      ],
    })
    const r1 = res.issues.filter((i: any) => i.id === 'RESOURCE-001')
    expect(r1).toHaveLength(1)
  })
})

/**
 * RESOURCE-003 幽灵资源变量引用（typeof _bgChart，2026-09-03）。
 * 事故 mv-max-1788365247487：LLM 臆造 `_bgChart`（下划线前缀资源名，期望系统注入），
 * 但系统实际注入的是 bg1 编号变量 → `typeof _bgChart` 恒 undefined → 底图静默丢失。
 * 检测：typeof _xxx 引用资源类前缀（bg/icon/img）且不在 resourceVars → BLOCK。
 */
describe('RESOURCE-003 幽灵资源变量引用（typeof _bgChart）', () => {
  const mapping = [
    {
      name: 'bg',
      previewAnalysisRole: 'bg',
      downloadStatus: 'success',
      assignedVarName: 'bg1',
      semanticVarName: 'bg1',
      resourceFile: '../resources/images/bg-7890.png',
      hint: 'bg → bg区域',
    },
  ]

  it('typeof _bgChart 引用未注入资源名 → BLOCK', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template><div class="root"></div></template>
<script setup>
import bg1 from '../resources/images/bg-7890.png'
const bgChart = typeof _bgChart !== 'undefined' ? _bgChart : ''
</script>`,
      },
    ]
    const res = CodeStructureValidator.validate(files, 'test', {
      target: 'vue3',
      resourceDomMapping: mapping,
    })
    const r3 = res.issues.filter((i: any) => i.id === 'RESOURCE-003')
    expect(r3).toHaveLength(1)
    expect(r3[0].severity).toBe('BLOCK')
  })

  it('引用已注入的 bg1（无 typeof _bgChart）→ 不报 RESOURCE-003', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template><div class="root" :style="{ backgroundImage: 'url(' + bg1 + ')' }"></div></template>
<script setup>
import bg1 from '../resources/images/bg-7890.png'
const bgChart = bg1
</script>`,
      },
    ]
    const res = CodeStructureValidator.validate(files, 'test', {
      target: 'vue3',
      resourceDomMapping: mapping,
    })
    const r3 = res.issues.filter((i: any) => i.id === 'RESOURCE-003')
    expect(r3).toHaveLength(0)
  })

  it('typeof _tmp 非资源类前缀 → 不报（避免误杀内部下划线变量）', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template><div class="root"></div></template>
<script setup>
const x = typeof _tmp !== 'undefined' ? _tmp : 0
</script>`,
      },
    ]
    const res = CodeStructureValidator.validate(files, 'test', {
      target: 'vue3',
      resourceDomMapping: mapping,
    })
    const r3 = res.issues.filter((i: any) => i.id === 'RESOURCE-003')
    expect(r3).toHaveLength(0)
  })
})
