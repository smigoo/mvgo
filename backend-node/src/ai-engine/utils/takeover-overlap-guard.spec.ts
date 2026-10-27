/**
 * 刀 13 · 接管叶重复覆盖守卫（takeover-overlap-guard）spec
 * 实锤来源：mv-max-1793101716713-f33d8c12（vue3 链）—— LLM 自造 DeviceDetailHeader
 * 完整实现 801:3 头部（图+名称+编码+爆闪灯），接管叶 ContentGDRobot/ContentText 仍被
 * index 引用 ⇒ 名称/编码行双份渲染。
 */
import { pruneTakeoverCoveredLeaves } from './takeover-overlap-guard.js'

// 实锤复刻：真实产物的关键片段
const INDEX = [
  '<template>',
  '  <div class="device-detail-root" data-section-id="36:1693">',
  '    <DeviceDetailHeader @close="handleClose" />',
  '    <div class="device-detail-body">',
  '      <ContentGDRobot />',
  '      <ContentText />',
  '      <AttrColumnLeft />',
  '    </div>',
  '  </div>',
  '</template>',
].join('\n')

const DEVICE_DETAIL_HEADER = [
  '<template>',
  '  <div class="device-detail-header" data-section-id="36:1693" v-bind="$attrs">',
  '    <div class="device-thumb" data-section-id="801:3">',
  '      <img :src="img1" style="width:98px;height:98px" />',
  '    </div>',
  '    <div class="device-info">',
  '      <div class="device-info__name" data-section-id="36:1725">GD-Robot-04</div>',
  '      <div class="device-info__row">',
  '        <span>编码</span>',
  '        <span data-section-id="36:1722">ROB004</span>',
  '      </div>',
  '      <div class="device-type-tag"><span>爆闪灯</span></div>',
  '    </div>',
  '  </div>',
  '</template>',
].join('\n')

const TAKEOVER = new Map([
  ['package/components/ContentGDRobot.vue', { kind: 'text', sectionId: '801:3-orphan-text-0', text: 'GD-Robot-04' }],
  ['package/components/ContentText.vue', {
    kind: 'text',
    sectionId: '801:3-orphan-text-1',
    runs: [{ text: '编码' }, { text: '爆闪灯' }],
  }],
])

const FILES = {
  'package/index.vue': INDEX,
  'package/components/DeviceDetailHeader.vue': DEVICE_DETAIL_HEADER,
  'package/components/ContentGDRobot.vue': '<template><div data-section-id="801:3-orphan-text-0">{{ text }}</div></template>',
  'package/components/ContentText.vue': '<template><div data-section-id="801:3-orphan-text-1"><span>{{ runs[0].text }}</span></div></template>',
  'package/components/AttrColumnLeft.vue': '<template><div data-section-id="81:7">所属产品</div></template>',
}

describe('刀13 · pruneTakeoverCoveredLeaves（接管叶重复覆盖守卫）', () => {
  it('⭐ 阳性（实锤复刻）：DeviceDetailHeader 覆盖 801:3 ⇒ 两个孤儿叶标签从 index 摘除', () => {
    const r = pruneTakeoverCoveredLeaves({ indexContent: INDEX, files: FILES, takeoverTargets: TAKEOVER })
    expect(r.removed).toHaveLength(2)
    expect(r.removed.map((x) => x.tag).sort()).toEqual(['ContentGDRobot', 'ContentText'])
    expect(r.removed[0].coveredBy).toBe('package/components/DeviceDetailHeader.vue')
    expect(r.content).not.toContain('<ContentGDRobot')
    expect(r.content).not.toContain('<ContentText')
    // 不碰 LLM 组件与其他组件
    expect(r.content).toContain('<DeviceDetailHeader')
    expect(r.content).toContain('<AttrColumnLeft')
  })

  it('反向：X 文本未全覆盖（缺「爆闪灯」）⇒ 该叶不摘', () => {
    const partial = DEVICE_DETAIL_HEADER.replace('<div class="device-type-tag"><span>爆闪灯</span></div>', '')
    const files = { ...FILES, 'package/components/DeviceDetailHeader.vue': partial }
    const r = pruneTakeoverCoveredLeaves({ indexContent: INDEX, files, takeoverTargets: TAKEOVER })
    // ContentGDRobot（GD-Robot-04 全覆盖）仍摘；ContentText（缺 爆闪灯）不摘
    expect(r.removed.map((x) => x.tag)).toEqual(['ContentGDRobot'])
    expect(r.content).toContain('<ContentText')
  })

  it('反向：X 是接管产物自身 ⇒ 不参与覆盖判定', () => {
    const files = { ...FILES }
    delete files['package/components/DeviceDetailHeader.vue']
    const r = pruneTakeoverCoveredLeaves({ indexContent: INDEX, files, takeoverTargets: TAKEOVER })
    expect(r.removed).toHaveLength(0)
    expect(r.content).toBe(INDEX)
  })

  it('反向：非孤儿叶（整段接管 81:7 kvgrid）⇒ 不参与（防爆）', () => {
    const kv = new Map([['package/components/AttrGrid.vue', { kind: 'kvgrid', sectionId: '81:7', text: '所属产品' }]])
    const idx = '<template><AttrGrid /></template>'
    const files = {
      'package/index.vue': idx,
      'package/components/AttrColumnLeft.vue': '<template><div data-section-id="81:7">所属产品</div></template>',
    }
    const r = pruneTakeoverCoveredLeaves({ indexContent: idx, files, takeoverTargets: kv })
    expect(r.removed).toHaveLength(0)
    expect(r.content).toBe(idx)
  })

  it('⭐ 真实 tr 形态（{kind,sectionId,baseId,vue}）：真值文本从 tr.vue 的 script 常量提取', () => {
    // 与 collectFoldedGridTakeover 实际返回逐字同构（无 text/runs 顶层字段）
    const REAL_TR_VUE = [
      '<template>',
      '  <div data-section-id="801:3-orphan-text-1" class="c-x-fg-text-8013orphantext1" style="display:flex;">',
      '    <span>{{ runs[0].text }}</span><span>{{ runs[1].text }}</span>',
      '  </div>',
      '</template>',
      '<script setup>',
      'const runs = [',
      '  { "text": "编码" },',
      '  { "text": "爆闪灯" }',
      ']',
      '</script>',
      '<style lang="less" scoped>',
      '.c-x-fg-text-8013orphantext1 { min-width: 0; }',
      '</style>',
    ].join('\n')
    const tk = new Map([
      ['package/components/ContentText.vue', { kind: 'text', sectionId: '801:3-orphan-text-1', baseId: '36:1698', vue: REAL_TR_VUE }],
    ])
    const r = pruneTakeoverCoveredLeaves({ indexContent: INDEX, files: FILES, takeoverTargets: tk })
    expect(r.removed).toHaveLength(1)
    expect(r.removed[0].texts.sort()).toEqual(['爆闪灯', '编码'])
    expect(r.content).not.toContain('<ContentText')
    expect(r.content).toContain('<ContentGDRobot') // 不在本 targets 里 ⇒ 不动
  })

  it('反向：index 未引用该叶 ⇒ 不动；空参 fail-open', () => {
    const idx = '<template><AttrColumnLeft /></template>'
    const r = pruneTakeoverCoveredLeaves({ indexContent: idx, files: FILES, takeoverTargets: TAKEOVER })
    expect(r.removed).toHaveLength(0)
    expect(r.content).toBe(idx)
    expect(pruneTakeoverCoveredLeaves({ indexContent: '', files: {}, takeoverTargets: new Map() }).removed).toHaveLength(0)
    expect(pruneTakeoverCoveredLeaves().removed).toHaveLength(0)
  })
})
