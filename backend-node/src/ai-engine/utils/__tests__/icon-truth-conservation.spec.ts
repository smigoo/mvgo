/**
 * 🛡️ 2026-11-15 · 图标真值守恒阴阳对照
 *
 * 真机产物形态（mc-max-1794710719020-d8887ee9）：
 *   ContentVehicleDist.vue = 真 <img> + CSS 画的假图形 div/i ⇒ 用户看到「多了其它图形」
 *   ContentForecast.vue    = 只有空 icon span（CSS 画图形），mapping 有 icon-3561.png 却零 <img>
 * 判据刻意不认类名：改名后的同结构同 CSS 形态必须同样命中。
 */
import {
  buildDrawClassIndex,
  collectIconTruth,
  collectDeclaredIconVars,
  collectRenderedImgVars,
  findGraphicIconBlocks,
  healIconTruthConservation,
  formatIconTruthConservationLog,
} from '../icon-truth-conservation.js'
import { templateRange } from '../resource-img-src-healer.js'

const LESS = `
.c-traffic-monitor-vehdist-icon { display: flex; width: 18px; height: 18px; }
.c-traffic-monitor-vehdist-icon-outer { background: #1990ff; border-radius: 4px; }
.c-traffic-monitor-vehdist-icon-inner { transform: rotate(45deg); box-shadow: 0 0 4px rgba(0,0,0,.6); }
.c-traffic-monitor-icon { background: linear-gradient(180deg, #559eff 0%, #559eff 100%); }
.c-traffic-monitor-forecast-title-icon { transform: rotate(45deg); border-radius: 6px; }
.zz-renamed-icon { background: #1990ff; }
.pure-layout { display: flex; width: 100%; justify-content: space-between; }
`

const VEHDIST = `<template>
  <div class="c-traffic-monitor-vehdist" data-section-id="2:3439" v-bind="$attrs" style="display: flex; flex-direction: row; align-items: center;">
    <img :src="icon2" class="c-traffic-monitor-vehdist-icon" style="width:18px;height:18.25px;object-fit:contain;flex:none;" alt="" />
    <div class="c-traffic-monitor-vehdist-icon">
      <i class="c-traffic-monitor-vehdist-icon-outer"></i>
      <i class="c-traffic-monitor-vehdist-icon-inner"></i>
    </div>
    <span class="c-traffic-monitor-vehdist-title">车型分布</span>
  </div>
</template>

<script setup>
import icon2 from '../../resources/images/icon-3561.png'
</script>

<style lang="less" scoped>
</style>`

const FORECAST = `<template>
  <div class="c-traffic-monitor-forecast-section" data-section-id="2:3604">
    <div class="c-traffic-monitor-header c-traffic-monitor-forecast-header">
      <div class="c-traffic-monitor-header c-traffic-monitor-forecast-title-wrap">
        <span class="c-traffic-monitor-icon c-traffic-monitor-forecast-title-icon"></span>
        <span class="c-traffic-monitor-forecast-title">流量预测</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
const x = ref(0)
</script>

<style lang="less" scoped>
</style>`

const MAPPING = [
  {
    ownerSectionId: '2:3604',
    resourceFile: 'resources/images/icon-3561.png',
    previewAnalysisRole: 'icon',
    usage: '<img :src="iconX">',
    assignedVarName: 'iconX',
    figmaBox: { x: 0, y: 0, width: 18, height: 18.25 },
  },
]

const filesOf = (vue: string, name = 'ContentForecast.vue') => ({
  [`package/components/${name}`]: vue,
  'resources/styles/common.less': LESS,
})

describe('绘制事实索引 / 结构判据（节点归属，不按类名枚举）', () => {
  it('只把「确实画了图形」的 class 收进索引；纯布局类不收', () => {
    const idx = buildDrawClassIndex({ 'a.less': LESS })
    expect(idx.has('c-traffic-monitor-vehdist-icon-outer')).toBe(true)
    expect(idx.has('c-traffic-monitor-icon')).toBe(true)
    expect(idx.has('pure-layout')).toBe(false)
  })

  it('background:transparent 不算图形绘制', () => {
    const idx = buildDrawClassIndex({ 'a.less': '.x { background: transparent; display: flex; }' })
    expect(idx.has('x')).toBe(false)
  })

  // 🔴 2026-11-17 治本（回灌锚 mc-max-1794895488047-f785be7f）：声明只作用于 **subject**。
  //   LESS 嵌套 / 后代选择器下，旧实现把选择器里所有 class 都记为「CSS 画的图形」
  //   ⇒ 真实容器也被标成假图形 ⇒ 刀 51 有**误删真实节点**的风险（比漏删严重）。
  it('祖先归因不误标：`.frame .icon .dot{background:…}` 只标 `.dot`，不标 `.frame` / `.icon`', () => {
    const idx = buildDrawClassIndex({
      'a.less': '.zz-frame { \n .zz-icon { \n .zz-dot { background: linear-gradient(#fff, #000); } } }',
    })
    expect(idx.has('zz-dot')).toBe(true)
    expect(idx.has('zz-icon')).toBe(false)
    expect(idx.has('zz-frame')).toBe(false)
  })

  it('主题根 class（.light / .dark）不因被当作祖先而误标', () => {
    const idx = buildDrawClassIndex({
      'a.less': '.light .zz-dot { background: #f00; } .dark .zz-dot2 { background: #000; }',
    })
    expect(idx.has('zz-dot')).toBe(true)
    expect(idx.has('zz-dot2')).toBe(true)
    expect(idx.has('light')).toBe(false)
    expect(idx.has('dark')).toBe(false)
  })

  it('嵌套规则里的绘制声明照常采到（不漏采）+ 内层属性不混进外层', () => {
    const idx = buildDrawClassIndex({
      'a.less': '.zz-card { display: flex; .zz-badge { border-radius: 50%; } }',
    })
    expect(idx.has('zz-badge')).toBe(true)
    expect(idx.has('zz-card')).toBe(false)
  })

  it('ContentVehicleDist 嵌套 <div><i/><i/></div> 只取最外层 1 个假图标块', () => {
    const idx = buildDrawClassIndex({ 'a.less': LESS })
    const blocks = findGraphicIconBlocks(templateRange(VEHDIST)!.body, idx)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].tag).toBe('div')
  })

  it('ContentForecast 空 icon span 命中，含文字的兄弟不命中', () => {
    const idx = buildDrawClassIndex({ 'a.less': LESS })
    const blocks = findGraphicIconBlocks(templateRange(FORECAST)!.body, idx)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].tag).toBe('span')
    expect(blocks[0].classes).toContain('c-traffic-monitor-forecast-title-icon')
  })

  it('类名整体改名后仍命中 ⇒ 判据是结构 + 样式事实，不是类名枚举', () => {
    const renamed = VEHDIST.replace(/c-traffic-monitor-vehdist-icon/g, 'zz-renamed-icon')
    const idx = buildDrawClassIndex({ 'a.less': LESS })
    expect(findGraphicIconBlocks(templateRange(renamed)!.body, idx)).toHaveLength(1)
  })

  it('含 {{ }} / <img> / v-for 的子树一律不判（fail-closed）', () => {
    const idx = buildDrawClassIndex({ 'a.less': LESS })
    const sfc = '<template><div class="r"><span class="zz-renamed-icon">{{ x }}</span><b>t</b></div></template>'
    expect(findGraphicIconBlocks(sfc, idx)).toHaveLength(0)
  })

  // 🛡️ P0-d（2026-11-17 · mc-1794880493923-bff54606 实锤「下方四行路段整块消失」）：
  //   PascalCase 子组件标签是可渲染单元，含它的装配容器不是「CSS 假图标块」。
  //   修复前：healer 把 4 个挂真值背景的包装容器整块删掉 ⇒ 12 子组件 11 个孤儿。
  it('P0-d：内含 PascalCase 子组件标签的容器不判假图标块；真·空 CSS 图形块仍命中', () => {
    const idx = buildDrawClassIndex({ 'a.less': LESS })
    // 阴性对照：mc-bff54606 真实形态 —— 容器挂绘制背景 + 内含 <ContentSection2 />
    const assembled =
      '<template><div class="r">' +
      '<div class="zz-renamed-icon"><ContentSection2 /></div>' +
      '<div class="zz-renamed-icon"><ContentSection3 /><ContentTailText /></div>' +
      '<div class="pure-layout"><span class="zz-renamed-icon"></span><b>t</b></div>' +
      '</div></template>'
    const blocks = findGraphicIconBlocks(assembled, idx)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].classes).toEqual(['zz-renamed-icon'])
    expect(blocks[0].tag).toBe('span')
  })

  it('P0-d：healer 不删含子组件标签的容器（回归锚：mc-1794880493923-bff54606）', () => {
    const assembledVue = `<template>
  <div class="c-x-con" data-mvgo-geom="root">
    <ContentSection class="c-x-sech-1" />
    <div class="c-traffic-monitor-vehdist-icon"><ContentSection2 /></div>
    <div class="c-traffic-monitor-vehdist-icon"><ContentSection3 /></div>
  </div>
</template>

<script setup>
import ContentSection from './components/ContentSection.vue'
import ContentSection2 from './components/ContentSection2.vue'
import ContentSection3 from './components/ContentSection3.vue'
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>`
    const files = {
      'package/index.vue': assembledVue,
      'package/components/ContentSection.vue': VEHDIST.replace(
        /c-traffic-monitor/g,
        'c-x',
      ),
      'package/components/ContentSection2.vue': VEHDIST.replace(
        /c-traffic-monitor/g,
        'c-x',
      ),
      'package/components/ContentSection3.vue': VEHDIST.replace(
        /c-traffic-monitor/g,
        'c-x',
      ),
      'resources/styles/common.less': LESS,
    }
    const before = files['package/index.vue']
    const r = healIconTruthConservation(files, { silent: true })
    expect(files['package/index.vue']).toBe(before)
    expect(r.stats.removed).toBe(0)
    expect(r.stats.replaced).toBe(0)
    expect(r.stats.verdict).toBe('clean')
  })
})

describe('真值侧', () => {
  it('collectIconTruth 按 section 归属，且只认 icon 角色 + <img> usage', () => {
    const truth = collectIconTruth(
      [
        ...MAPPING,
        { ownerSectionId: '2:3604', resourceFile: 'bg-1.png', previewAnalysisRole: 'bg', usage: '<img>', assignedVarName: 'bg1' },
        { ownerSectionId: 'other', resourceFile: 'icon-9.png', previewAnalysisRole: 'icon', usage: '<img>', assignedVarName: 'icon9' },
      ],
      ['2:3604'],
    )
    expect(truth).toHaveLength(1)
    expect(truth[0].varName).toBe('iconX')
    expect(truth[0].size).toEqual({ w: 18, h: 18.25 })
  })

  it('产物自身 import + 已渲染 img 的证据可采（Lite 象限无 mapping 时用）', () => {
    expect([...collectDeclaredIconVars(VEHDIST).keys()]).toEqual(['icon2'])
    expect([...collectRenderedImgVars(templateRange(VEHDIST)!.body)]).toEqual(['icon2'])
  })
})

describe('healIconTruthConservation（守恒动作）', () => {
  it('已有真 <img> ⇒ 删除全部 CSS 假图形块，共享 CSS 规则逐字不动', () => {
    const files = filesOf(VEHDIST, 'ContentVehicleDist.vue')
    const beforeLess = files['resources/styles/common.less']
    const r = healIconTruthConservation(files, { silent: true })
    expect(r.stats.removed).toBe(1)
    expect(r.stats.replaced).toBe(0)
    expect(r.stats.verdict).toBe('healed')
    expect(files['package/components/ContentVehicleDist.vue']).not.toContain('icon-outer')
    expect(files['package/components/ContentVehicleDist.vue']).toContain('<img :src="icon2"')
    expect(files['package/components/ContentVehicleDist.vue']).toContain('车型分布')
    expect(files['resources/styles/common.less']).toBe(beforeLess)
  })

  it('零 <img> + mapping 尺寸真值 ⇒ 首块换成 <img> 并补 import', () => {
    const files = filesOf(FORECAST)
    const r = healIconTruthConservation(files, { mappings: MAPPING, silent: true })
    expect(r.stats.replaced).toBe(1)
    const out = files['package/components/ContentForecast.vue']
    expect(out).toContain('<img :src="iconX"')
    expect(out).toContain('width:18px;height:18.25px')
    expect(out).toContain("import iconX from '../../resources/images/icon-3561.png'")
    expect(out).toContain('流量预测')
    expect(out).not.toContain('forecast-title-icon"></span>')
  })

  it('零 <img> 但无尺寸真值 ⇒ 不替换、不删除（不编尺寸 / 不弄丢唯一图标）', () => {
    const noSize = MAPPING.map((m) => ({ ...m, figmaBox: undefined }))
    const files = filesOf(FORECAST)
    const before = files['package/components/ContentForecast.vue']
    const r = healIconTruthConservation(files, { mappings: noSize, silent: true })
    expect(r.stats.verdict).toBe('clean')
    expect(r.stats.skipped.join(' ')).toContain('no-size-truth')
    expect(files['package/components/ContentForecast.vue']).toBe(before)
  })

  it('真值缺失 ⇒ fail-open 原样返回', () => {
    const files = filesOf(FORECAST)
    const before = files['package/components/ContentForecast.vue']
    const r = healIconTruthConservation(files, { silent: true })
    expect(r.stats.skipped.join(' ')).toContain('no-icon-truth')
    expect(files['package/components/ContentForecast.vue']).toBe(before)
  })

  it('无样式绘制事实 ⇒ no-evidence，不碰产物', () => {
    const files = { 'package/components/A.vue': VEHDIST }
    const before = files['package/components/A.vue']
    const r = healIconTruthConservation(files, { silent: true })
    expect(r.stats.verdict).toBe('no-evidence')
    expect(files['package/components/A.vue']).toBe(before)
  })

  it('幂等：跑两次，第二次零命中且内容逐字不变', () => {
    const files = filesOf(FORECAST)
    const first = healIconTruthConservation(files, { mappings: MAPPING, silent: true })
    const snapshot = files['package/components/ContentForecast.vue']
    const second = healIconTruthConservation(files, { mappings: MAPPING, silent: true })
    expect(first.stats.verdict).toBe('healed')
    expect(second.stats.verdict).toBe('clean')
    expect(second.stats.replaced + second.stats.removed).toBe(0)
    expect(files['package/components/ContentForecast.vue']).toBe(snapshot)
  })

  it('Lite 形态：无 mapping，但产物已 import 且已渲染 ⇒ 仍清多余假图形', () => {
    const files = { 'package/index.vue': VEHDIST, 'resources/styles/common.less': LESS }
    const r = healIconTruthConservation(files, { silent: true })
    expect(r.stats.removed).toBe(1)
    expect(files['package/index.vue']).not.toContain('icon-outer')
  })
})

describe('恒打计数行（0 也打）', () => {
  it('零命中也产出完整计数行', () => {
    const line = formatIconTruthConservationLog({
      evaluated: 1, files: 1, truthIcons: 0, renderedImgs: 0,
      graphicBlocks: 0, replaced: 0, removed: 0, verdict: 'clean', skipped: [],
    })
    expect(line.message).toContain('evaluated=1')
    expect(line.message).toContain('graphicBlocks=0')
    expect(line.message).toContain('verdict=clean')
  })

  it('无证据时仍是完整计数行，不抛异常', () => {
    const line = formatIconTruthConservationLog(undefined)
    expect(line.message).toContain('verdict=no-evidence')
  })
})
